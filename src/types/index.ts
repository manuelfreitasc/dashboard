// General User Type (adjust as needed from your Prisma schema)
export interface User {
  id: string;
  username: string;
}

// Video Type (based on Prisma schema and API responses)
export interface Video {
  id: string;
  roomId: string;
  title: string;
  url: string;
  duration?: number | null;
  addedById: string;
  addedAt: string; // ISO date string
  updatedAt: string; // ISO date string
  addedBy?: User; // User who added the video
}

// Room Type (based on Prisma schema and API responses)
export interface Room {
  id: string;
  name: string;
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
  participants?: { user: User }[]; // Simplified participant info
  _count?: {
    participants?: number;
  };
  videos?: Video[]; // List of videos in the room
  syncState?: SyncState; // Current sync state of the room
}

// SyncState Type (based on Prisma schema and WebSocket events)
export interface SyncState {
  roomId: string;
  currentVideoId?: string | null;
  videoUrl?: string | null; // Convenience from server
  title?: string | null;    // Convenience from server
  isPlaying: boolean;
  progress: number; // Playback time in seconds
  lastEventTimestamp?: number | null; // Timestamp of the last controlling event
  updatedAt: string; // ISO date string, when this state was last updated on server
  currentVideo?: Video; // Full video object, if populated
}

// WebSocket Payloads (mirroring server-side definitions)
export interface RoomUserJoinedPayload {
  roomId: string;
  userId: string;
  username:string;
  joinedAt: string; // ISO date string
}

export interface RoomUserLeftPayload {
  roomId: string;
  userId: string;
  username: string;
  reason?: string;
}

// For VideoPlayer component, if needed separately
export interface VideoPlayerState {
  src?: string;
  isPlaying: boolean;
  currentTime: number;
}

// API response for adding video
export interface AddVideoResponse extends Video {}

// API response for room details
export interface RoomDetailsResponse extends Room {}

// API response for list of videos
export type VideoListResponse = Video[];
