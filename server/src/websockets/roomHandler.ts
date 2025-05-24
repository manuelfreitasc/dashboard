import { Server, Socket } from 'socket.io';
import { PrismaClient, RoomParticipant } from '@prisma/client';
import { verifyToken } from '../lib/authUtils'; // To get userId from token

const prisma = new PrismaClient();

interface JoinRoomPayload {
  roomId: string;
  token?: string; // Optional: token might be passed for authentication
}

interface AuthenticatedSocket extends Socket {
  user?: { userId: string; username: string }; // Add user property to socket
}

export function handleRoomEvents(io: Server, socket: AuthenticatedSocket) {
  // Authenticate socket connection if token is provided
  // This is a basic example; you might have a more robust auth flow for sockets
  if (socket.handshake.auth && socket.handshake.auth.token) {
    const token = socket.handshake.auth.token as string;
    const decoded = verifyToken(token);
    if (decoded && decoded.userId) {
      socket.user = { userId: decoded.userId, username: decoded.username };
      console.log(`Socket ${socket.id} authenticated as user ${decoded.userId}`);
    } else {
      console.log(`Socket ${socket.id} provided an invalid token.`);
      // Optionally disconnect if authentication is strictly required from the start
      // socket.disconnect(true);
      // return;
    }
  }


  socket.on('room:join', async (payload: JoinRoomPayload) => {
    const { roomId } = payload;
    
    // Ensure user is on the socket object (e.g., set during initial connection or via a separate auth event)
    if (!socket.user || !socket.user.userId) {
      socket.emit('error', { message: 'Authentication required to join a room.' });
      console.log(`room:join failed for socket ${socket.id}: missing user authentication`);
      return;
    }
    const userId = socket.user.userId;
    const username = socket.user.username;

    try {
      // Check if room exists
      const room = await prisma.room.findUnique({ where: { id: roomId } });
      if (!room) {
        socket.emit('error', { message: `Room ${roomId} not found` });
        return;
      }

      // Add user to room participants
      const participant = await prisma.roomParticipant.upsert({
        where: { userId_roomId: { userId, roomId } },
        update: {}, // No update needed if already exists
        create: { userId, roomId },
        include: { user: { select: { id: true, username: true } } }
      });

      await socket.join(roomId);
      console.log(`User ${userId} (${username}) joined room ${roomId}`);

      // Broadcast to other users in the room
      socket.to(roomId).emit('room:userJoined', { 
        roomId, 
        userId, 
        username, 
        joinedAt: participant.createdAt 
      });

      // Send confirmation to the user who joined
      socket.emit('room:joined', { 
        roomId, 
        userId, 
        username,
        message: `Successfully joined room ${room.name}` 
      });

    } catch (error) {
      console.error(`Error in room:join for user ${userId} and room ${roomId}:`, error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  socket.on('room:leave', async (payload: { roomId: string }) => {
    const { roomId } = payload;
    
    if (!socket.user || !socket.user.userId) {
      socket.emit('error', { message: 'Authentication required to leave a room.' });
      console.log(`room:leave failed for socket ${socket.id}: missing user authentication`);
      return;
    }
    const userId = socket.user.userId;
    const username = socket.user.username;

    try {
      await prisma.roomParticipant.deleteMany({
        where: { userId, roomId },
      });

      socket.leave(roomId);
      console.log(`User ${userId} (${username}) left room ${roomId}`);

      // Broadcast to other users in the room
      socket.to(roomId).emit('room:userLeft', { roomId, userId, username });
      
      // Send confirmation to the user who left
      socket.emit('room:left', { roomId, message: `Successfully left room ${roomId}` });

    } catch (error) {
      console.error(`Error in room:leave for user ${userId} and room ${roomId}:`, error);
      socket.emit('error', { message: 'Failed to leave room' });
    }
  });

  socket.on('disconnecting', async () => {
    if (!socket.user || !socket.user.userId) {
      // No user associated with this socket, nothing to clean up in terms of room participation
      return;
    }

    const userId = socket.user.userId;
    const username = socket.user.username;

    // Iterate over rooms the socket is currently in
    for (const roomId of socket.rooms) {
      if (roomId === socket.id) continue; // Skip the default room (socket.id)

      try {
        // Check if the user is a participant in this room
        const participant = await prisma.roomParticipant.findFirst({
          where: { userId, roomId }
        });

        if (participant) {
          await prisma.roomParticipant.delete({
            where: { id: participant.id }
          });
          console.log(`User ${userId} (${username}) removed from room ${roomId} due to disconnect`);
          // Broadcast to other users in the room
          io.to(roomId).emit('room:userLeft', { roomId, userId, username, reason: 'disconnect' });
        }
      } catch (error) {
        console.error(`Error removing user ${userId} from room ${roomId} on disconnect:`, error);
      }
    }
  });
}
