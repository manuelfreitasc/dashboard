import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { PrismaClient } from "@prisma/client";
import { authenticate } from "../lib/authUtils"; // Import the authentication middleware

const prisma = new PrismaClient();

async function roomRoutes(fastify: FastifyInstance) {
  // Create a new room (Protected Route)
  fastify.post(
    "/rooms",
    { preHandler: [authenticate] }, // Apply authentication middleware
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { name } = request.body as any; // Add proper typing later
      const userId = (request as any).user.userId; // Get userId from authenticated user

      if (!name) {
        reply.status(400).send({ error: "Room name is required" });
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
        console.error("Error creating room:", error);
        reply
          .status(500)
          .send({ error: "Internal server error while creating room" });
      }
    },
  );

  // Get a list of all rooms (Public Route)
  fastify.get(
    "/rooms",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const rooms = await prisma.room.findMany({
          include: {
            participants: {
              // Optionally include participants count or basic info
              select: {
                user: {
                  select: { id: true, username: true },
                },
              },
            },
            _count: {
              select: { participants: true },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        });
        reply.status(200).send(rooms);
      } catch (error) {
        console.error("Error fetching rooms:", error);
        reply
          .status(500)
          .send({ error: "Internal server error while fetching rooms" });
      }
    },
  );

  // Get details of a specific room (Public Route for now, can be protected)
  fastify.get(
    "/rooms/:roomId",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { roomId } = request.params as any;
      console.log(`Fetching room details for ${roomId}`);

      try {
        const room = await prisma.room.findUnique({
          where: { id: roomId },
          include: {
            participants: {
              include: {
                user: { select: { id: true, username: true } },
              },
            },
            videos: {
              // Assuming you might want video info later
              orderBy: { addedAt: "asc" },
            },
          },
        });

        if (!room) {
          reply.status(404).send({ error: "Room not found" });
          return;
        }
        reply.status(200).send(room);
      } catch (error) {
        console.error(`Error fetching room ${roomId}:`, error);
        reply.status(500).send({ error: "Internal server error" });
      }
    },
  );

  // Add a video to a room (Protected Route)
  fastify.post(
    "/rooms/:roomId/videos",
    { preHandler: [authenticate] }, // Apply authentication middleware
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { roomId } = request.params as any;
      const { url, title, duration } = request.body as any; // Add proper typing later
      const userId = (request as any).user.userId;

      if (!url || !title) {
        reply.status(400).send({ error: "Video URL and title are required" });
        return;
      }

      try {
        // Check if the room exists
        const room = await prisma.room.findUnique({ where: { id: roomId } });
        if (!room) {
          reply.status(404).send({ error: "Room not found" });
          return;
        }

        // Check if user is a participant of the room (optional, but good practice)
        const participant = await prisma.roomParticipant.findUnique({
          where: { userId_roomId: { userId, roomId } },
        });
        if (!participant) {
          reply
            .status(403)
            .send({ error: "You are not a participant of this room" });
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
        const existingSyncState = await prisma.syncState.findUnique({
          where: { roomId },
        });
        if (!existingSyncState) {
          await prisma.syncState.create({
            data: {
              roomId,
              currentVideoId: newVideo.id,
              isPlaying: false,
              progress: 0,
            },
          });
          // TODO: Broadcast this change via websockets if needed, or let client fetch
        } else if (!existingSyncState.currentVideoId) {
          await prisma.syncState.update({
            where: { roomId },
            data: { currentVideoId: newVideo.id },
          });
          // TODO: Broadcast this change
        }

        reply.status(201).send(newVideo);
      } catch (error) {
        console.error(`Error adding video to room ${roomId}:`, error);
        reply
          .status(500)
          .send({ error: "Internal server error while adding video" });
      }
    },
  );

  // Get videos for a room (Public or Protected, depending on requirements)
  fastify.get(
    "/rooms/:roomId/videos",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { roomId } = request.params as any;

      try {
        // Check if room exists
        const room = await prisma.room.findUnique({ where: { id: roomId } });
        if (!room) {
          reply.status(404).send({ error: "Room not found" });
          return;
        }

        // Optional: Check if user is a participant if videos should be private
        // For now, making it public if the room itself is accessible

        const videos = await prisma.video.findMany({
          where: { roomId },
          orderBy: {
            addedAt: "asc",
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
        reply
          .status(500)
          .send({ error: "Internal server error while fetching videos" });
      }
    },
  );

  // Invite a user to a room (Protected Route)
  fastify.post(
    "/rooms/:roomId/participants",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { roomId } = request.params as any;
      const { userId: userIdToInvite } = request.body as any; // ID of the user to invite
      const invitingUserId = (request as any).user.userId; // ID of the user sending the invitation

      if (!userIdToInvite) {
        reply.status(400).send({ error: "User ID to invite is required" });
        return;
      }

      if (!roomId) {
        // Should be caught by Fastify's router, but good to have
        reply.status(400).send({ error: "Room ID is required" });
        return;
      }

      try {
        // 1. Check if the room exists
        const room = await prisma.room.findUnique({ where: { id: roomId } });
        if (!room) {
          reply.status(404).send({ error: "Room not found" });
          return;
        }

        // 2. Verify that the inviting user is a participant in the room
        const invitingParticipant = await prisma.roomParticipant.findUnique({
          where: { userId_roomId: { userId: invitingUserId, roomId } },
        });
        if (!invitingParticipant) {
          reply
            .status(403)
            .send({ error: "You are not authorized to invite users to this room" });
          return;
        }

        // 3. Check if the user to be invited exists
        const userToInvite = await prisma.user.findUnique({
          where: { id: userIdToInvite },
        });
        if (!userToInvite) {
          reply.status(404).send({ error: "User to invite not found" });
          return;
        }

        // 4. Check if the target user is already a participant in the room
        const existingParticipant = await prisma.roomParticipant.findUnique({
          where: { userId_roomId: { userId: userIdToInvite, roomId } },
        });
        if (existingParticipant) {
          reply
            .status(409)
            .send({ error: "User is already a participant in this room" });
          return;
        }

        // 5. If all checks pass, create a new RoomParticipant record
        const newParticipant = await prisma.roomParticipant.create({
          data: {
            roomId: roomId,
            userId: userIdToInvite,
          },
          include: {
            user: { select: { id: true, username: true } },
            // room: true, // Optionally include room details
          },
        });

        reply.status(201).send(newParticipant);
      } catch (error) {
        console.error(
          `Error inviting user ${userIdToInvite} to room ${roomId}:`,
          error,
        );
        reply
          .status(500)
          .send({ error: "Internal server error while inviting user" });
      }
    },
  );

  // Get rooms for the authenticated user
  fastify.get(
    "/me/rooms",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request as any).user.userId;

      try {
        const roomParticipants = await prisma.roomParticipant.findMany({
          where: { userId: userId },
          include: {
            room: {
              include: {
                _count: {
                  select: { participants: true },
                },
              },
            },
          },
          orderBy: {
            room: { createdAt: "desc" },
          },
        });

        // Transform the result to return a list of Room objects
        const rooms = roomParticipants.map((rp) => rp.room);

        reply.status(200).send(rooms);
      } catch (error) {
        console.error("Error fetching user's rooms:", error);
        reply
          .status(500)
          .send({ error: "Internal server error while fetching user's rooms" });
      }
    },
  );
}

export default roomRoutes;
