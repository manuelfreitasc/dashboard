import Fastify from 'fastify';
import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import authRoutes from './routes/auth';
import roomRoutes from './routes/rooms'; // Import room routes
import { handleRoomEvents } from './websockets/roomHandler'; // Import room WebSocket handlers
import { handleVideoSyncEvents } from './websockets/videoSyncHandler'; // Import video sync WebSocket handlers
import { handleChatEvents } from './websockets/chatHandler'; // Import chat WebSocket handlers
import { verifyToken } from './lib/authUtils'; // For authenticating sockets

const fastify = Fastify({ logger: true });
const prisma = new PrismaClient();

// Setup Socket.IO
const io = new Server(fastify.server, {
  cors: {
    origin: "*", // Allow all origins for simplicity. Configure appropriately for production.
    methods: ["GET", "POST"]
  }
});

// Middleware for Socket.IO authentication
io.use((socket: any, next) => {
  const token = socket.handshake.auth.token;
  if (token) {
    const decoded = verifyToken(token);
    if (decoded && decoded.userId) {
      socket.user = { userId: decoded.userId, username: decoded.username };
      fastify.log.info(`Socket ${socket.id} authenticated via token for user ${decoded.username} (${decoded.userId})`);
      next();
    } else {
      fastify.log.warn(`Socket ${socket.id} provided an invalid token.`);
      next(new Error('Authentication error: Invalid token'));
    }
  } else {
    // Allow unauthenticated connections for now, but they won't be able to join rooms etc.
    // Or, if all socket communication requires auth:
    // next(new Error('Authentication error: Token required'));
    fastify.log.info(`Socket ${socket.id} connected without token.`);
    next();
  }
});


io.on('connection', (socket: Socket) => {
  fastify.log.info(`Socket connected: ${socket.id}`);

  // Register room event handlers for this socket
  handleRoomEvents(io, socket as any); // Cast because we added .user to socket
  // Register video sync event handlers for this socket
  handleVideoSyncEvents(io, socket as any); // Cast because we added .user to socket
  // Register chat event handlers for this socket
  handleChatEvents(io, socket as any); // Cast because we added .user to socket

  socket.on('disconnect', () => {
    fastify.log.info(`Socket disconnected: ${socket.id}`);
  });

  // Add more Socket.IO event handlers here as needed
});

// Register API routes
fastify.register(authRoutes);
fastify.register(roomRoutes); // Register room API routes

// Basic route for testing
fastify.get('/', async (request, reply) => {
  return { hello: 'world' };
});

const start = async () => {
  try {
    await fastify.listen({ port: 3001, host: '0.0.0.0' });
    fastify.log.info(`Server listening on port 3001`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();

// Graceful shutdown
const shutdown = async () => {
  fastify.log.info('Shutting down server...');
  await io.close(); // Close Socket.IO server
  await fastify.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
