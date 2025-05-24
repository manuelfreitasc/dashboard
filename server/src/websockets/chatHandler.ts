import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client'; // Not strictly needed for this basic chat, but good to have for potential future extensions (e.g. saving messages)

const prisma = new PrismaClient(); // Initialize even if not used immediately

interface AuthenticatedSocket extends Socket {
  user?: { userId: string; username: string }; // Assuming user is attached during socket authentication
}

interface ChatMessagePayload {
  roomId: string;
  message: string;
}

export function handleChatEvents(io: Server, socket: AuthenticatedSocket) {
  socket.on('chat:message', (payload: ChatMessagePayload) => {
    const { roomId, message } = payload;

    if (!socket.user || !socket.user.userId || !socket.user.username) {
      // This should ideally not happen if sockets are properly authenticated before this point
      socket.emit('error', { message: 'Authentication required to send messages.' });
      console.log(`chat:message rejected for socket ${socket.id} in room ${roomId}: missing user authentication`);
      return;
    }

    if (!roomId || typeof roomId !== 'string' || roomId.trim() === '') {
      socket.emit('error', { message: 'Invalid room ID.' });
      console.log(`chat:message rejected for socket ${socket.id}: invalid roomId "${roomId}"`);
      return;
    }
    
    if (!message || typeof message !== 'string' || message.trim() === '') {
      // Optionally, send an error back to the client, or just ignore empty messages
      // socket.emit('error', { message: 'Message cannot be empty.' });
      console.log(`chat:message ignored for socket ${socket.id} in room ${roomId}: empty message`);
      return; 
    }

    const trimmedMessage = message.trim(); // Max length could be enforced here too

    const outgoingMessage = {
      messageId: `${socket.user.userId}-${Date.now()}`, // Simple unique ID for client-side keying
      message: trimmedMessage,
      userId: socket.user.userId,
      username: socket.user.username,
      roomId: roomId, // Include roomId in the broadcasted message for client-side filtering if needed
      timestamp: new Date(),
    };

    console.log(`Broadcasting chat:newMessage to room ${roomId}:`, outgoingMessage);
    io.to(roomId).emit('chat:newMessage', outgoingMessage);

    // Optional: Store message in database using Prisma
    // async () => {
    //   try {
    //     await prisma.chatMessage.create({ // Assuming a ChatMessage model exists
    //       data: {
    //         content: trimmedMessage,
    //         roomId: roomId,
    //         userId: socket.user.userId,
    //       }
    //     });
    //   } catch (dbError) {
    //     console.error("Failed to save chat message to DB:", dbError);
    //   }
    // }();
  });
}
