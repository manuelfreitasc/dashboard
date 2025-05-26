"use client";

import React, {
  useEffect,
  useState,
  useCallback,
  FormEvent,
  useMemo,
  useRef,
} from "react";
import { useParams, useRouter } from "next/navigation";
import VideoPlayer from "@/components/VideoPlayer";
import { useSocketStore, getAuthToken } from "@/lib/socketStore";
import {
  Room,
  Video,
  SyncState as RoomSyncState,
  RoomUserJoinedPayload,
  RoomUserLeftPayload,
} from "@/types";
import ChatBox, { ChatMessage } from "@/components/ChatBox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton"; // Import Skeleton
import { toast } from "sonner";
import { RefreshCw, Users } from "lucide-react"; // Added Users icon
import { useAuthStore } from "@/lib/authStore";
import InviteUserModal from '@/components/invite-user-modal'; // Added InviteUserModal import

const RoomPage = () => {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;

  // Socket store
  const {
    socket,
    connect: connectSocket,
    disconnect: disconnectSocket,
    emit,
    on,
    off,
    isConnected,
  } = useSocketStore();

  // Component State
  const [roomDetails, setRoomDetails] = useState<Room | null>(null);
  const [videosInRoom, setVideosInRoom] = useState<Video[]>([]);
  const [currentSyncState, setCurrentSyncState] =
    useState<RoomSyncState | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Derived state for VideoPlayer
  const [currentPlayerState, setCurrentPlayerState] = useState<{
    src?: string;
    isPlaying: boolean;
    currentTime: number;
    title?: string;
  }>({
    isPlaying: false,
    currentTime: 0,
  });

  // Form state for adding new video
  const [newVideoUrl, setNewVideoUrl] = useState("");
  const [newVideoTitle, setNewVideoTitle] = useState("");
  const [isSubmittingVideo, setIsSubmittingVideo] = useState(false);
  const [addVideoError, setAddVideoError] = useState<string | null>(null); // Specific error state for add video form

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>(
    undefined,
  );

  // Invite User Modal State
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);

  const { getAuthToken: getAuthStoreToken, user: authUser } = useAuthStore();

  // --- Data Fetching ---
  const fetchRoomData = useCallback(async () => {
    const token = getAuthStoreToken();
    if (!roomId || !token) {
      if (!token)
        toast.error("Authentication token not found for fetching room data.");
      return;
    }
    setIsLoading(true);
    try {
      // Assuming API calls are direct to backend, not via Next.js /api routes for consistency
      const ROOM_DETAILS_URL = `${process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001"}/rooms/${roomId}`;
      const VIDEOS_LIST_URL = `${process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001"}/rooms/${roomId}/videos`;

      const [roomRes, videosRes] = await Promise.all([
        fetch(ROOM_DETAILS_URL, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(VIDEOS_LIST_URL, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (!roomRes.ok) {
        const errorData = await roomRes.json().catch(() => ({})); // Try to parse error, default to empty if not JSON
        return (
          errorData.error ||
          `Failed to fetch room details: ${roomRes.statusText}`
        );
      }
      const roomData: Room = await roomRes.json();
      setRoomDetails(roomData);
      // toast.success(`Fetched room: ${roomData.name}`); // Can be noisy

      if (!videosRes.ok) {
        const errorData = await videosRes.json().catch(() => ({}));
        throw new Error(
          errorData.error || `Failed to fetch videos: ${videosRes.statusText}`,
        );
      }
      const videosData: Video[] = await videosRes.json();
      setVideosInRoom(videosData);
      // toast.info(`Found ${videosData.length} videos in the room.`);

      // If sync state is part of roomData or fetched separately
      if (roomData.syncState) {
        setCurrentSyncState(roomData.syncState);
        // toast.info("Initial sync state loaded with room details.");
      } else if (socket && isConnected) {
        console.log("Requesting initial sync state via socket...");
        emit("video:requestSync", { roomId });
      }
    } catch (e: any) {
      console.error("Error fetching room data:", e);
      setError(e.message || "Failed to load room data."); // This sets a general page error
      toast.error(e.message || "Failed to load room data.");
    } finally {
      setIsLoading(false);
    }
  }, [roomId, getAuthStoreToken, socket, isConnected, emit]);

  // --- Effects ---
  // Initial data fetch and socket connection
  useEffect(() => {
    const token = getAuthStoreToken();
    if (!token && !authUser) {
      // Check both persisted token and current auth state
      toast.error("Authentication required. Redirecting to login.");
      router.push("/login");
      return;
    }

    // Set currentUserId from authUser if available
    if (authUser) {
      setCurrentUserId(authUser.id);
    } else if (token) {
      // Fallback to parsing token if authUser isn't populated yet by store hydration
      try {
        const tokenPayload = JSON.parse(atob(token.split(".")[1]));
        if (tokenPayload.userId) {
          setCurrentUserId(tokenPayload.userId);
        }
      } catch (e) {
        console.error("Failed to parse auth token for userId:", e);
      }
    }

    if (!socket || !isConnected) {
      console.log("Connecting socket with token...");
      connectSocket(token); // Use token from authStore
    }

    fetchRoomData(); // fetchRoomData will also use getAuthStoreToken internally

    return () => {
      if (socket) {
        console.log(
          "Leaving room and disconnecting socket on component unmount",
        );
        emit("room:leave", { roomId });
        // Consider if disconnect is always desired or if connection should persist across app
        // disconnectSocket();
      }
    };
  }, [getAuthStoreToken, connectSocket, roomId]); // Removed socket, isConnected, emit, fetchRoomData, router from dep array to simplify

  // Socket event listeners
  useEffect(() => {
    if (!socket || !isConnected) return;

    console.log("Setting up socket event listeners for room:", roomId);

    socket.emit("room:join", { roomId });
    toast.info(`Attempting to join room: ${roomId}`);

    // Request sync state once joined, if not already loaded
    if (!currentSyncState) {
      emit("video:requestSync", { roomId });
    }

    const handleSyncUpdate = (data: RoomSyncState) => {
      console.log("sync:update received:", data);
      if (data.roomId === roomId) {
        setCurrentSyncState(data);
        toast.success(
          `Sync update received: ${data.isPlaying ? "Playing" : "Paused"} at ${data.progress.toFixed(0)}s for video ${data.title || data.currentVideoId}`,
        );
      }
    };

    const handleUserJoined = (data: RoomUserJoinedPayload) => {
      if (data.roomId === roomId) {
        console.log("room:userJoined:", data);
        toast.info(`${data.username} joined the room.`);
        // Optionally update a list of participants
      }
    };

    const handleUserLeft = (data: RoomUserLeftPayload) => {
      if (data.roomId === roomId) {
        console.log("room:userLeft:", data);
        toast.info(`${data.username} left the room.`);
        // Optionally update a list of participants
      }
    };

    const handleConnect = () => {
      toast.success("Socket reconnected. Re-joining room and requesting sync.");
      socket.emit("room:join", { roomId });
      emit("video:requestSync", { roomId });
    };

    const handleConnectError = (err: Error) => {
      toast.error(`Socket connection error: ${err.message}`);
    };

    const handleNewChatMessage = (newMessage: ChatMessage) => {
      console.log("chat:newMessage received:", newMessage);
      setChatMessages((prevMessages) => [...prevMessages, newMessage]);
      // Potentially scroll chat to bottom here if ChatBox doesn't handle it internally enough
      if (newMessage.userId !== currentUserId) {
        // Don't toast own messages if optimistically updated
        toast(`${newMessage.username}: ${newMessage.message}`);
      }
    };

    on("sync:update", handleSyncUpdate);
    on("room:userJoined", handleUserJoined);
    on("room:userLeft", handleUserLeft);
    on("chat:newMessage", handleNewChatMessage); // Listen for new chat messages
    on("connect", handleConnect); // Handle re-connections
    on("connect_error", handleConnectError);

    return () => {
      console.log("Cleaning up socket event listeners for room:", roomId);
      off("sync:update", handleSyncUpdate);
      off("room:userJoined", handleUserJoined);
      off("room:userLeft", handleUserLeft);
      off("chat:newMessage", handleNewChatMessage);
      off("connect", handleConnect);
      off("connect_error", handleConnectError);
      // emit('room:leave', { roomId }); // Moved to main unmount
    };
  }, [
    socket,
    isConnected,
    roomId,
    emit,
    on,
    off,
    currentSyncState,
    currentUserId,
  ]); // currentSyncState & currentUserId added

  // Update VideoPlayer state from currentSyncState
  useEffect(() => {
    if (currentSyncState) {
      // Clear any optimistic message if its corresponding server message arrived
      // This is a simple way; more robust would be matching IDs if server echoed them
      if (
        chatMessages.some((msg) => msg.isOptimistic) &&
        chatMessages.find(
          (msg) =>
            msg.messageId ===
            `${currentUserId}-${currentSyncState.lastEventTimestamp}`,
        )
      ) {
        // Example ID check
        // setChatMessages(prev => prev.filter(msg => !msg.isOptimistic));
      }

      const video = videosInRoom.find(
        (v) => v.id === currentSyncState.currentVideoId,
      );
      setCurrentPlayerState({
        src: video?.url || currentSyncState.videoUrl, // Prefer video from list, fallback to direct URL
        isPlaying: currentSyncState.isPlaying,
        currentTime: currentSyncState.progress,
        title: video?.title || currentSyncState.title,
      });
      console.log("Player state updated from sync:", {
        src: video?.url,
        isPlaying: currentSyncState.isPlaying,
        currentTime: currentSyncState.progress,
        title: video?.title,
      });
    } else {
      // No sync state, perhaps set to a default (e.g. first video paused)
      if (videosInRoom.length > 0 && !currentSyncState?.currentVideoId) {
        console.log("No sync state, defaulting to first video paused.");
        // setCurrentPlayerState({
        //   src: videosInRoom[0].url,
        //   isPlaying: false,
        //   currentTime: 0,
        //   title: videosInRoom[0].title,
        // });
        // emit('video:change', { roomId, videoId: videosInRoom[0].id, timestamp: Date.now() });
      }
    }
  }, [currentSyncState, videosInRoom, roomId, emit]);

  // --- Event Handlers for VideoPlayer ---
  const handlePlay = useCallback(() => {
    console.log("RoomPage: handlePlay called");
    emit("video:play", { roomId, timestamp: Date.now() });
  }, [emit, roomId]);

  const handlePause = useCallback(() => {
    console.log("RoomPage: handlePause called");
    emit("video:pause", { roomId, timestamp: Date.now() });
  }, [emit, roomId]);

  const seekTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const handleSeek = useCallback(
    (time: number) => {
      console.log("RoomPage: handleSeek called with time:", time);

      if (seekTimeoutRef.current) {
        clearTimeout(seekTimeoutRef.current);
      }
      seekTimeoutRef.current = setTimeout(() => {
        emit("video:seek", { roomId, time, timestamp: Date.now() });
        toast.info(`Seeking to ${time.toFixed(0)}s`);
      }, 300); // 300ms debounce
    },
    [emit, roomId],
  );

  const handleVideoChange = useCallback(
    (videoId: string) => {
      console.log("RoomPage: handleVideoChange called with videoId:", videoId);
      emit("video:change", { roomId, videoId, timestamp: Date.now() });
      toast.info(`Changing video to ${videoId}`);
    },
    [emit, roomId],
  );

  const handleAddNewVideo = async (e: FormEvent) => {
    e.preventDefault();
    setAddVideoError(null); // Clear previous specific errors

    if (!newVideoUrl || !newVideoTitle) {
      toast.error("Video URL and Title are required.");
      setAddVideoError("Video URL and Title are required.");
      return;
    }

    // Basic URL validation
    try {
      new URL(newVideoUrl); // This will throw an error if the URL is invalid
    } catch (_) {
      toast.error("Invalid Video URL format.");
      setAddVideoError(
        "Invalid Video URL format. Please enter a valid URL (e.g., http://example.com/video.mp4).",
      );
      return;
    }

    const token = getAuthStoreToken();
    if (!token) {
      toast.error("Authentication token not found. Please log in again.");
      setAddVideoError("Authentication token not found.");
      return;
    }

    setIsSubmittingVideo(true);
    try {
      const ADD_VIDEO_URL = `${process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001"}/rooms/${roomId}/videos`;
      const res = await fetch(ADD_VIDEO_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ url: newVideoUrl, title: newVideoTitle }), // Duration can be added if available
      });

      const responseData = await res.json();

      if (!res.ok) {
        throw new Error(
          responseData.error || `Failed to add video: ${res.statusText}`,
        );
      }
      const newVideo: Video = responseData;
      setVideosInRoom((prev) => [...prev, newVideo]); // Optimistic update / local state update
      toast.success(`Video "${newVideo.title}" added successfully!`);
      setNewVideoUrl("");
      setNewVideoTitle("");
      setAddVideoError(null);

      // Optionally, if it's the first video or no video is playing, change to it via socket event
      if (!currentSyncState?.currentVideoId && videosInRoom.length === 0) {
        // Check videosInRoom.length before adding newVideo
        // The video list `videosInRoom` will update after this function, so the new video might be the only one
        // It might be better to check if the *server* indicates it's the first video or if syncState is empty
        // For now, if no current video ID, suggest changing to it.
        handleVideoChange(newVideo.id); // This emits video:change
      } else if (videosInRoom.length === 0 && newVideo) {
        // If the list was empty and we just added one
        handleVideoChange(newVideo.id);
      }
    } catch (e: any) {
      console.error("Error adding video:", e);
      const errorMsg = e.message || "Failed to add video.";
      setAddVideoError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setIsSubmittingVideo(false);
    }
  };

  // --- Render Logic ---
  if (isLoading && !roomDetails)
    return (
      <div className="container mx-auto p-4 text-center">Loading room...</div>
    );
  if (error)
    return (
      <div className="container mx-auto p-4 text-center text-red-500">
        Error: {error}
      </div>
    );
  if (!roomDetails)
    return (
      <div className="container mx-auto p-4 text-center">Room not found.</div>
    );

  const handleSendMessage = (messageText: string) => {
    if (!socket || !isConnected) {
      toast.error("Socket not connected. Cannot send message.");
      return;
    }
    if (!currentUserId) {
      // Should have currentUserId if authenticated
      toast.error("User ID not found. Cannot send message.");
      return;
    }

    const optimisticMessage: ChatMessage = {
      messageId: `optimistic-${Date.now()}`,
      message: messageText,
      userId: currentUserId, // Use the current user's ID
      username:
        roomDetails?.participants?.find((p) => p.user.id === currentUserId)
          ?.user.username || "You", // Attempt to find username
      timestamp: new Date(),
      isOptimistic: true,
    };
    setChatMessages((prev) => [...prev, optimisticMessage]);

    emit("chat:message", { roomId, message: messageText });
    // Server will broadcast 'chat:newMessage', which will replace the optimistic one if IDs match or add new one
  };

  if (isLoading && !roomDetails) {
    return (
      <div className="container mx-auto p-4 max-h-screen flex flex-col">
        <Card className="mb-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <Skeleton className="h-6 w-48 mb-2" /> {/* Room Name */}
              <Skeleton className="h-4 w-64" />{" "}
              {/* Participants/Socket Status */}
            </div>
            <Skeleton className="h-10 w-10 rounded-md" /> {/* Resync Button */}
          </CardHeader>
        </Card>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-grow min-h-0">
          <div className="lg:col-span-2 flex flex-col gap-4 min-h-0">
            <Card className="flex-shrink-0">
              <CardHeader>
                <Skeleton className="h-6 w-3/4" /> {/* Video Title */}
              </CardHeader>
              <CardContent>
                <Skeleton className="w-full rounded-md aspect-video bg-slate-900" />{" "}
                {/* Video Player */}
              </CardContent>
              <CardFooter>
                <Skeleton className="h-4 w-1/2" /> {/* Playing status */}
              </CardFooter>
            </Card>
            <Card className="flex-grow flex flex-col min-h-0">
              <CardHeader>
                <Skeleton className="h-6 w-1/3" />
              </CardHeader>{" "}
              {/* Playlist Title */}
              <CardContent className="flex-grow overflow-hidden flex flex-col">
                <ScrollArea className="flex-grow pr-3 mb-3">
                  <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                </ScrollArea>
                <div className="space-y-2 flex-shrink-0 pt-2 border-t">
                  <Skeleton className="h-9 w-full" />{" "}
                  {/* Add Video Title Input */}
                  <Skeleton className="h-9 w-full" />{" "}
                  {/* Add Video URL Input */}
                  <Skeleton className="h-9 w-full" /> {/* Add Video Button */}
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="lg:col-span-1 flex flex-col min-h-0">
            <Card className="flex-grow flex flex-col">
              <CardHeader className="flex-shrink-0">
                <Skeleton className="h-6 w-1/4" /> {/* Chat Title */}
              </CardHeader>
              <CardContent className="flex-grow overflow-hidden">
                <div className="h-full flex flex-col">
                  <ScrollArea className="flex-grow p-4 border rounded-md mb-4 bg-slate-50 dark:bg-slate-800">
                    <div className="space-y-3">
                      <Skeleton className="h-12 w-3/4" />
                      <Skeleton className="h-12 w-3/4 ml-auto" />
                      <Skeleton className="h-12 w-3/4" />
                    </div>
                  </ScrollArea>
                  <div className="flex items-center space-x-2">
                    <Skeleton className="h-10 flex-grow" /> {/* Chat Input */}
                    <Skeleton className="h-10 w-20" /> {/* Send Button */}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-h-screen flex flex-col">
      <Card className="mb-4">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="uppercase">
              {roomDetails?.name || (
                <Skeleton className="h-6 w-32 inline-block" />
              )}
            </CardTitle>
            <CardDescription>
              Participants:{" "}
              {roomDetails?._count?.participants ?? (
                <Skeleton className="h-4 w-4 inline-block" />
              )}{" "}
              | Socket: {isConnected ? "Connected" : "Disconnected"}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                emit("video:requestSync", { roomId });
                toast.info("Resync request sent!");
              }}
              title="Request full sync from server"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsInviteModalOpen(true)}
              title="Invite users to this room"
            >
              <Users className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-grow min-h-0">
        {" "}
        {/* min-h-0 is important for flex-grow in a flex col parent */}
        {/* Video Player and Playlist Section */}
        <div className="lg:col-span-2 flex flex-col gap-4 min-h-0">
          <Card className="flex-shrink-0">
            {" "}
            {/* Video player card should not grow excessively */}
            <CardHeader>
              <CardTitle className="truncate">
                {currentPlayerState.title || "No video selected"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {currentPlayerState.src ? (
                <VideoPlayer
                  src={currentPlayerState.src}
                  isPlaying={currentPlayerState.isPlaying}
                  currentTime={currentPlayerState.currentTime}
                  onPlay={handlePlay}
                  onPause={handlePause}
                  onSeek={handleSeek}
                  onLoadedData={() =>
                    console.log(
                      "Video data loaded for src:",
                      currentPlayerState.src,
                    )
                  }
                  onEnded={() => toast.info("Video ended.")}
                  className="w-full rounded-md aspect-video bg-slate-900"
                />
              ) : (
                <div className="aspect-video bg-slate-900 flex items-center justify-center rounded-md">
                  <p className="text-slate-400">Select or add a video.</p>
                </div>
              )}
            </CardContent>
            <CardFooter>
              <p className="text-sm text-muted-foreground truncate">
                Playing: {currentPlayerState.title || "N/A"} |{" "}
                {currentPlayerState.isPlaying ? "Playing" : "Paused"} |{" "}
                {currentPlayerState.currentTime.toFixed(1)}s
              </p>
            </CardFooter>
          </Card>

          {/* Playlist and Add Video Form - flex-grow to take remaining space */}
          <Card className="flex-grow flex flex-col min-h-0">
            <CardHeader>
              <CardTitle>Video Playlist</CardTitle>
            </CardHeader>
            <CardContent className="flex-grow overflow-hidden flex flex-col">
              {" "}
              {/* Allow content to take space and scroll */}
              <ScrollArea className="flex-grow pr-3 mb-3">
                {" "}
                {/* ScrollArea takes available space */}
                {videosInRoom.length === 0 && (
                  <p className="text-sm text-slate-500">No videos yet.</p>
                )}
                <ul className="space-y-1">
                  {videosInRoom.map((video) => (
                    <li
                      key={video.id}
                      className={`p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer text-sm truncate ${video.id === currentSyncState?.currentVideoId ? "bg-slate-200 dark:bg-slate-600 font-semibold" : ""}`}
                      onClick={() => handleVideoChange(video.id)}
                      title={video.title}
                    >
                      {video.title}
                      <span className="text-xs text-muted-foreground block">
                        By: {video.addedBy?.username || "Unknown"}
                      </span>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
              {/* Add Video Form - flex-shrink-0 so it doesn't get pushed out by ScrollArea */}
              <form
                onSubmit={handleAddNewVideo}
                className="space-y-2 flex-shrink-0 pt-2 border-t"
              >
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="text"
                    value={newVideoTitle}
                    onChange={(e) => setNewVideoTitle(e.target.value)}
                    placeholder="Video title"
                    disabled={isSubmittingVideo}
                    className="h-9 text-sm"
                    aria-label="Video Title"
                  />
                  <Input
                    type="url"
                    value={newVideoUrl}
                    onChange={(e) => setNewVideoUrl(e.target.value)}
                    placeholder="Video URL (e.g., https://...)"
                    disabled={isSubmittingVideo}
                    className="h-9 text-sm"
                    aria-label="Video URL"
                  />
                </div>

                {addVideoError && (
                  <p className="text-xs text-red-500">{addVideoError}</p>
                )}
                <Button
                  type="submit"
                  disabled={isSubmittingVideo}
                  className="w-full h-9 text-sm"
                >
                  {isSubmittingVideo ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    "Add Video"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
        {/* Chat Section - takes remaining column space and handles its own scrolling */}
        <div className="lg:col-span-1 flex flex-col min-h-0">
          {" "}
          {/* min-h-0 crucial for flex children with overflow */}
          <Card className="flex-grow flex flex-col">
            {" "}
            {/* flex-grow allows card to fill space, flex-col for internal layout */}
            <CardHeader className="flex-shrink-0">
              <CardTitle>Live Chat</CardTitle>
            </CardHeader>
            <CardContent className="flex-grow overflow-hidden">
              {" "}
              {/* This content area will allow ChatBox to be scrollable */}
              <ChatBox
                messages={chatMessages}
                currentUserId={currentUserId}
                onSendMessage={handleSendMessage}
                className="h-full" // ChatBox itself needs to be able to expand
                isLoading={!isConnected}
              />
            </CardContent>
          </Card>
        </div>
      </div>
      <InviteUserModal
        roomId={roomId}
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
      />
    </div>
  );
};

export default RoomPage;
