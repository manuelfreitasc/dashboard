import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../lib/authUtils'; // Import the authentication middleware

const prisma = new PrismaClient();

async function roomRoutes(fastify: FastifyInstance) {
  // Create a new room (Protected Route)
  fastify.post(
    '/rooms',
    { preHandler: [authenticate] }, // Apply authentication middleware
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { name } = request.body as any; // Add proper typing later
      const userId = (request as any).user.userId; // Get userId from authenticated user

      if (!name) {
        reply.status(400).send({ error: 'Room name is required' });
        return;
      }

      try {
        const newRoom = await prisma.room.create({
          data: {
            name,
            participants: {
              create: {
                userId: userId, // The creator is the first participant
              },
            },
          },
          include: {
            participants: {
              include: {
                user: {
                  select: { id: true, username: true },
                },
              },
            },
          },
        });

        reply.status(201).send(newRoom);
      } catch (error) {
        console.error('Error creating room:', error);
        reply.status(500).send({ error: 'Internal server error while creating room' });
      }
    }
  );

  // Get a list of all rooms (Public Route)
  fastify.get('/rooms', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const rooms = await prisma.room.findMany({
        include: {
          participants: { // Optionally include participants count or basic info
            select: {
              user: {
                select: { id: true, username: true }
              }
            }
          },
          _count: {
            select: { participants: true }
          }
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
      reply.status(200).send(rooms);
    } catch (error) {
      console.error('Error fetching rooms:', error);
      reply.status(500).send({ error: 'Internal server error while fetching rooms' });
    }
  });

  // Get details of a specific room (Public Route for now, can be protected)
  fastify.get('/rooms/:roomId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { roomId } = request.params as any;

    try {
      const room = await prisma.room.findUnique({
        where: { id: roomId },
        include: {
          participants: {
            include: {
              user: { select: { id: true, username: true } },
            },
          },
          videos: { // Assuming you might want video info later
            orderBy: { createdAt: 'asc' }
          }
        },
      });

      if (!room) {
        reply.status(404).send({ error: 'Room not found' });
        return;
      }
      reply.status(200).send(room);
    } catch (error) {
      console.error(`Error fetching room ${roomId}:`, error);
      reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Add a video to a room (Protected Route)
  fastify.post(
    '/rooms/:roomId/videos',
    { preHandler: [authenticate] }, // Apply authentication middleware
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { roomId } = request.params as any;
      const { url, title, duration } = request.body as any; // Add proper typing later
      const userId = (request as any).user.userId;

      if (!url || !title) {
        reply.status(400).send({ error: 'Video URL and title are required' });
        return;
      }

      try {
        // Check if the room exists
        const room = await prisma.room.findUnique({ where: { id: roomId } });
        if (!room) {
          reply.status(404).send({ error: 'Room not found' });
          return;
        }

        // Check if user is a participant of the room (optional, but good practice)
        const participant = await prisma.roomParticipant.findUnique({
          where: { userId_roomId: { userId, roomId } },
        });
        if (!participant) {
          reply.status(403).send({ error: 'You are not a participant of this room' });
          return;
        }

        const newVideo = await prisma.video.create({
          data: {
            roomId,
            url,
            title,
            duration: duration ? parseFloat(duration) : null,
            addedById: userId,
          },
        });

        // Optionally, if this is the first video, set it as current in SyncState
        const existingSyncState = await prisma.syncState.findUnique({ where: { roomId } });
        if (!existingSyncState) {
          await prisma.syncState.create({
            data: {
              roomId,
              currentVideoId: newVideo.id,
              isPlaying: false,
              progress: 0,
            }
          });
          // TODO: Broadcast this change via websockets if needed, or let client fetch
        } else if (!existingSyncState.currentVideoId) {
            await prisma.syncState.update({
                where: { roomId },
                data: { currentVideoId: newVideo.id }
            });
            // TODO: Broadcast this change
        }


        reply.status(201).send(newVideo);
      } catch (error) {
        console.error(`Error adding video to room ${roomId}:`, error);
        reply.status(500).send({ error: 'Internal server error while adding video' });
      }
    }
  );

  // Get videos for a room (Public or Protected, depending on requirements)
  fastify.get('/rooms/:roomId/videos', async (request: FastifyRequest, reply: FastifyReply) => {
    const { roomId } = request.params as any;

    try {
      // Check if room exists
      const room = await prisma.room.findUnique({ where: { id: roomId } });
      if (!room) {
        reply.status(404).send({ error: 'Room not found' });
        return;
      }

      // Optional: Check if user is a participant if videos should be private
      // For now, making it public if the room itself is accessible

      const videos = await prisma.video.findMany({
        where: { roomId },
        orderBy: {
          addedAt: 'asc',
        },
        include: {
          addedBy: {
            select: { id: true, username: true },
          },
        },
      });

      reply.status(200).send(videos);
    } catch (error) {
      console.error(`Error fetching videos for room ${roomId}:`, error);
      reply.status(500).send({ error: 'Internal server error while fetching videos' });
    }
  });
}

export default roomRoutes;
