import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface AuthenticatedSocket extends Socket {
  user?: { userId: string; username: string };
}

interface VideoPlayPayload {
  roomId: string;
  // videoId: string; // Video ID might be implicit from room's current video
  timestamp: number; // Client's timestamp for the event
}

interface VideoPausePayload {
  roomId: string;
  // videoId: string;
  timestamp: number;
}

interface VideoSeekPayload {
  roomId: string;
  // videoId: string;
  time: number; // Seek to this time in seconds
  timestamp: number;
}

interface VideoChangePayload {
  roomId:string;
  videoId: string; // New video ID to play
  timestamp: number;
}

export function handleVideoSyncEvents(io: Server, socket: AuthenticatedSocket) {
  const emitSyncUpdate = async (roomId: string, initiatingSocketId?: string) => {
    try {
      const syncState = await prisma.syncState.findUnique({
        where: { roomId },
        include: { currentVideo: true } // Include to get video URL if needed by clients
      });

      if (syncState) {
        const payload = {
          roomId: syncState.roomId,
          currentVideoId: syncState.currentVideoId,
          videoUrl: syncState.currentVideo?.url, // Send URL for convenience
          title: syncState.currentVideo?.title,
          isPlaying: syncState.isPlaying,
          progress: syncState.progress,
          lastEventTimestamp: syncState.lastEventTimestamp,
          updatedAt: syncState.updatedAt,
        };
        // Broadcast to all in room, or all except sender if sender is provided
        if (initiatingSocketId) {
            socket.to(roomId).emit('sync:update', payload);
        } else {
            io.to(roomId).emit('sync:update', payload);
        }
        console.log(`sync:update broadcast to room ${roomId}`, payload);
      }
    } catch (error) {
      console.error(`Error fetching/broadcasting sync state for room ${roomId}:`, error);
    }
  };

  socket.on('video:play', async (payload: VideoPlayPayload) => {
    if (!socket.user) return socket.emit('error', { message: 'Authentication required.' });
    const { roomId, timestamp } = payload;

    console.log(`video:play received for room ${roomId} from user ${socket.user.userId} at ${timestamp}`);

    try {
      const updatedSyncState = await prisma.syncState.upsert({
        where: { roomId },
        create: {
          roomId,
          isPlaying: true,
          lastEventTimestamp: timestamp,
          // currentVideoId will be null initially, should be set by video:change
        },
        update: {
          isPlaying: true,
          lastEventTimestamp: timestamp,
        },
      });
      // We only want to broadcast if this event is the latest or very close to latest
      // This helps prevent older events from overwriting newer state.
      if (updatedSyncState.lastEventTimestamp === timestamp) {
        emitSyncUpdate(roomId, socket.id); // Broadcast to others
      }
    } catch (error) {
      console.error('Error in video:play:', error);
      socket.emit('error', { message: 'Failed to process video:play event' });
    }
  });

  socket.on('video:pause', async (payload: VideoPausePayload) => {
    if (!socket.user) return socket.emit('error', { message: 'Authentication required.' });
    const { roomId, timestamp } = payload;
    console.log(`video:pause received for room ${roomId} from user ${socket.user.userId} at ${timestamp}`);


    try {
      const updatedSyncState = await prisma.syncState.updateMany({ // updateMany to avoid error if not found
        where: { 
          roomId,
          // Only update if this event is newer than or same as the stored one
          // lastEventTimestamp: { lte: timestamp } - This logic is tricky with concurrent events.
          // Simplification: always update, rely on client-side to handle out-of-order events if minor.
          // For critical sync, a more robust distributed consensus or leader-based approach might be needed.
        },
        data: {
          isPlaying: false,
          lastEventTimestamp: timestamp,
        },
      });
      if (updatedSyncState.count > 0) {
         // To ensure the update reflects, fetch the latest state before broadcasting
        const currentSyncState = await prisma.syncState.findUnique({ where: { roomId }});
        if (currentSyncState && currentSyncState.lastEventTimestamp === timestamp) {
            emitSyncUpdate(roomId, socket.id); // Broadcast to others
        }
      }
    } catch (error) {
      console.error('Error in video:pause:', error);
      socket.emit('error', { message: 'Failed to process video:pause event' });
    }
  });

  socket.on('video:seek', async (payload: VideoSeekPayload) => {
    if (!socket.user) return socket.emit('error', { message: 'Authentication required.' });
    const { roomId, time, timestamp } = payload;
    console.log(`video:seek received for room ${roomId} to time ${time} from user ${socket.user.userId} at ${timestamp}`);

    try {
      const updatedSyncState = await prisma.syncState.updateMany({
        where: { 
          roomId,
          // lastEventTimestamp: { lte: timestamp }
        },
        data: {
          progress: time,
          lastEventTimestamp: timestamp,
          // isPlaying might need to be considered: e.g. does seeking imply play?
          // For now, keeping isPlaying as is. Client should send play if seek + play.
        },
      });
       if (updatedSyncState.count > 0) {
        const currentSyncState = await prisma.syncState.findUnique({ where: { roomId }});
        if (currentSyncState && currentSyncState.lastEventTimestamp === timestamp) {
            emitSyncUpdate(roomId, socket.id); // Broadcast to others
        }
      }
    } catch (error) {
      console.error('Error in video:seek:', error);
      socket.emit('error', { message: 'Failed to process video:seek event' });
    }
  });

  socket.on('video:change', async (payload: VideoChangePayload) => {
    if (!socket.user) return socket.emit('error', { message: 'Authentication required.' });
    const { roomId, videoId, timestamp } = payload;
    console.log(`video:change received for room ${roomId} to video ${videoId} from user ${socket.user.userId} at ${timestamp}`);

    try {
      // Verify video exists and is part of the room
      const video = await prisma.video.findFirst({
        where: { id: videoId, roomId: roomId }
      });

      if (!video) {
        socket.emit('error', { message: `Video ${videoId} not found in room ${roomId}` });
        return;
      }

      await prisma.syncState.upsert({
        where: { roomId },
        create: {
          roomId,
          currentVideoId: videoId,
          isPlaying: false, // Default to paused when changing video
          progress: 0,
          lastEventTimestamp: timestamp,
        },
        update: {
          currentVideoId: videoId,
          isPlaying: false, // Default to paused
          progress: 0,
          lastEventTimestamp: timestamp,
        },
      });
      // For video:change, always broadcast as it's a significant state change.
      emitSyncUpdate(roomId); // Broadcast to all in room including sender
    } catch (error) {
      console.error('Error in video:change:', error);
      socket.emit('error', { message: 'Failed to process video:change event' });
    }
  });

   // Request current sync state - useful for clients joining or re-syncing
   socket.on('video:requestSync', async (payload: { roomId: string }) => {
    if (!socket.user) return socket.emit('error', { message: 'Authentication required.' });
    const { roomId } = payload;
    console.log(`video:requestSync received for room ${roomId} from user ${socket.user.userId}`);

    try {
        const syncState = await prisma.syncState.findUnique({
            where: { roomId },
            include: { currentVideo: true }
        });

        if (syncState) {
            socket.emit('sync:update', { // Send only to the requester
                roomId: syncState.roomId,
                currentVideoId: syncState.currentVideoId,
                videoUrl: syncState.currentVideo?.url,
                title: syncState.currentVideo?.title,
                isPlaying: syncState.isPlaying,
                progress: syncState.progress,
                lastEventTimestamp: syncState.lastEventTimestamp,
                updatedAt: syncState.updatedAt,
            });
        } else {
            // If no sync state, maybe send a default or empty state
            socket.emit('sync:update', {
                roomId,
                currentVideoId: null,
                isPlaying: false,
                progress: 0,
            });
        }
    } catch (error) {
        console.error(`Error in video:requestSync for room ${roomId}:`, error);
        socket.emit('error', { message: 'Failed to fetch sync state.' });
    }
  });
}
