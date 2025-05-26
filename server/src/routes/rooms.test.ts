import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import roomRoutes from './rooms'; // The routes to test
import { PrismaClient } from '@prisma/client';

// Mock Prisma Client
vi.mock('@prisma/client', () => {
  const mockPrismaClient = {
    room: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    video: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    roomParticipant: {
      findUnique: vi.fn(), // For checking if user is participant when adding video
    },
    syncState: { // For auto-creating/updating syncState when a video is added
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    user: { // Added for participant invitation tests
      findUnique: vi.fn(),
    },
    roomParticipant: { // Extended for participant invitation tests
      findUnique: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(), // For /me/rooms
    },
    // Add other models and methods as needed
  };
  return { PrismaClient: vi.fn(() => mockPrismaClient) };
});

// Mock the authenticate middleware
vi.mock('../lib/authUtils', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../lib/authUtils')>();
    return {
        ...actual, // Import and retain default exports
        authenticate: vi.fn(async (request: FastifyRequest, reply: FastifyReply) => {
            // Attach a mock user to the request for protected routes
            (request as any).user = { userId: 'testUserId', username: 'testUser' };
        }),
    };
});


describe('Room and Video Routes', () => {
  let app: FastifyInstance;
  let prismaMock: any;

  const mockUserInviter = { userId: 'inviterUserId', username: 'inviterUser' };
  const mockUserToInvite = { userId: 'toInviteUserId', username: 'toInviteUser' };
  const mockAnotherParticipant = { userId: 'anotherParticipantId', username: 'anotherParticipant' };
  const mockRoomId = 'room123';
  const mockVideoId = 'video123';


  beforeEach(async () => {
    app = Fastify();
    prismaMock = new PrismaClient(); // This is the mock instance
    app.register(roomRoutes);

    // Override the authenticate mock for specific tests if needed,
    // otherwise the default mock (providing mockUserInviter) will be used.
    // This is crucial for testing scenarios involving different authenticated users.
    // The default mock is set up to use mockUserInviter:
    (app.authenticate as any) = vi.fn(async (request: FastifyRequest, reply: FastifyReply) => {
        (request as any).user = mockUserInviter;
    });

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.resetAllMocks(); // This resets all vi mocks, including Prisma and authenticate
  });

  // --- Room Routes ---
  describe('POST /rooms', () => {
    it('should create a new room successfully', async () => {
      const roomData = { id: mockRoomId, name: 'Test Room', participants: [{ userId: mockUser.userId }] };
      prismaMock.room.create.mockResolvedValue(roomData);

      const response = await app.inject({
        method: 'POST',
        url: '/rooms',
        payload: { name: 'Test Room' },
        // headers: { authorization: 'Bearer validtoken' } // authenticate is mocked
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual(roomData);
      expect(prismaMock.room.create).toHaveBeenCalledWith({
        data: {
          name: 'Test Room',
          participants: { create: { userId: mockUser.userId } },
        },
        include: expect.any(Object),
      });
    });

    it('should return 400 if room name is not provided', async () => {
        const response = await app.inject({
            method: 'POST',
            url: '/rooms',
            payload: {},
            // headers: { authorization: 'Bearer validtoken' }
        });
        expect(response.statusCode).toBe(400);
        expect(response.json().error).toBe('Room name is required');
    });
  });

  describe('GET /rooms', () => {
    it('should return a list of rooms', async () => {
      const roomsList = [{ id: mockRoomId, name: 'Test Room', _count: { participants: 1 } }];
      prismaMock.room.findMany.mockResolvedValue(roomsList);

      const response = await app.inject({ method: 'GET', url: '/rooms' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(roomsList);
    });
  });

  describe('GET /rooms/:roomId', () => {
    it('should return room details if room exists', async () => {
      const roomDetail = { id: mockRoomId, name: 'Test Room', videos: [] };
      prismaMock.room.findUnique.mockResolvedValue(roomDetail);

      const response = await app.inject({ method: 'GET', url: `/rooms/${mockRoomId}` });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(roomDetail);
    });

    it('should return 404 if room does not exist', async () => {
      prismaMock.room.findUnique.mockResolvedValue(null);
      const response = await app.inject({ method: 'GET', url: `/rooms/nonexistentroom` });
      expect(response.statusCode).toBe(404);
    });
  });

  // --- Video Routes ---
  describe('POST /rooms/:roomId/videos', () => {
    it('should add a video to a room successfully', async () => {
      const videoData = { id: mockVideoId, url: 'http://example.com/video.mp4', title: 'Test Video' };
      prismaMock.room.findUnique.mockResolvedValue({ id: mockRoomId, name: 'Test Room' }); // Room exists
      prismaMock.roomParticipant.findUnique.mockResolvedValue({ userId: mockUser.userId, roomId: mockRoomId }); // User is participant
      prismaMock.video.create.mockResolvedValue(videoData);
      prismaMock.syncState.findUnique.mockResolvedValue(null); // No existing sync state
      prismaMock.syncState.create.mockResolvedValue({}); // Mock sync state creation

      const response = await app.inject({
        method: 'POST',
        url: `/rooms/${mockRoomId}/videos`,
        payload: { url: 'http://example.com/video.mp4', title: 'Test Video', duration: 120 },
        // headers: { authorization: 'Bearer validtoken' }
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual(videoData);
      expect(prismaMock.video.create).toHaveBeenCalledWith(expect.objectContaining({
        data: {
          roomId: mockRoomId,
          url: 'http://example.com/video.mp4',
          title: 'Test Video',
          duration: 120,
          addedById: mockUser.userId,
        }
      }));
      // Check if sync state was initialized
      expect(prismaMock.syncState.create).toHaveBeenCalledWith(expect.objectContaining({
        data: {
            roomId: mockRoomId,
            currentVideoId: videoData.id,
            isPlaying: false,
            progress: 0
        }
      }));
    });

    it('should return 400 if video URL or title is missing', async () => {
        const response = await app.inject({
            method: 'POST',
            url: `/rooms/${mockRoomId}/videos`,
            payload: { url: 'http://example.com/video.mp4' }, // Missing title
            // headers: { authorization: 'Bearer validtoken' }
          });
        expect(response.statusCode).toBe(400);
        expect(response.json().error).toBe('Video URL and title are required');
    });
    
    it('should return 404 if room does not exist when adding video', async () => {
        prismaMock.room.findUnique.mockResolvedValue(null); // Room does not exist
        const response = await app.inject({
            method: 'POST',
            url: `/rooms/nonexistentroom/videos`,
            payload: { url: 'http://example.com/video.mp4', title: 'Test Video' },
            // headers: { authorization: 'Bearer validtoken' }
          });
        expect(response.statusCode).toBe(404);
    });

    it('should return 403 if user is not a participant when adding video', async () => {
        prismaMock.room.findUnique.mockResolvedValue({ id: mockRoomId, name: 'Test Room' }); // Room exists
        prismaMock.roomParticipant.findUnique.mockResolvedValue(null); // User is NOT participant

        const response = await app.inject({
            method: 'POST',
            url: `/rooms/${mockRoomId}/videos`,
            payload: { url: 'http://example.com/video.mp4', title: 'Test Video' },
            // headers: { authorization: 'Bearer validtoken' }
          });
        expect(response.statusCode).toBe(403);
        expect(response.json().error).toBe('You are not a participant of this room');
    });
  });

  describe('GET /rooms/:roomId/videos', () => {
    it('should return a list of videos for a room', async () => {
      const videosList = [{ id: mockVideoId, title: 'Test Video' }];
      prismaMock.room.findUnique.mockResolvedValue({ id: mockRoomId, name: 'Test Room' }); // Room exists
      prismaMock.video.findMany.mockResolvedValue(videosList);

      const response = await app.inject({
        method: 'GET',
        url: `/rooms/${mockRoomId}/videos`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(videosList);
    });

    it('should return 404 if room does not exist when getting videos', async () => {
        prismaMock.room.findUnique.mockResolvedValue(null); // Room does not exist
        const response = await app.inject({
            method: 'GET',
            url: `/rooms/nonexistentroom/videos`,
          });
        expect(response.statusCode).toBe(404);
    });
  });

  // --- Participant Invitation Routes ---
  describe('POST /rooms/:roomId/participants', () => {
    const inviterUserId = mockUserInviter.userId;
    const userToInviteId = mockUserToInvite.userId;

    it('should successfully invite a user to a room', async () => {
      prismaMock.room.findUnique.mockResolvedValue({ id: mockRoomId, name: 'Test Room' });
      prismaMock.roomParticipant.findUnique
        .mockResolvedValueOnce({ userId: inviterUserId, roomId: mockRoomId }) // Inviter is participant
        .mockResolvedValueOnce(null); // User to invite is NOT yet participant
      prismaMock.user.findUnique.mockResolvedValue({ id: userToInviteId, username: 'ToInvite' }); // User to invite exists
      const newParticipant = { roomId: mockRoomId, userId: userToInviteId, user: { id: userToInviteId, username: 'ToInvite' } };
      prismaMock.roomParticipant.create.mockResolvedValue(newParticipant);

      const response = await app.inject({
        method: 'POST',
        url: `/rooms/${mockRoomId}/participants`,
        payload: { userId: userToInviteId },
        // headers: { authorization: 'Bearer inviterToken' } // authenticate is mocked
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual(newParticipant);
      expect(prismaMock.roomParticipant.create).toHaveBeenCalledWith({
        data: { roomId: mockRoomId, userId: userToInviteId },
        include: { user: { select: { id: true, username: true } } },
      });
    });

    it('should return 403 if inviter is not a participant', async () => {
      prismaMock.room.findUnique.mockResolvedValue({ id: mockRoomId, name: 'Test Room' });
      prismaMock.roomParticipant.findUnique.mockResolvedValue(null); // Inviter is NOT participant

      const response = await app.inject({
        method: 'POST',
        url: `/rooms/${mockRoomId}/participants`,
        payload: { userId: userToInviteId },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error).toBe('You are not authorized to invite users to this room');
    });

    it('should return 404 if user to invite does not exist', async () => {
      prismaMock.room.findUnique.mockResolvedValue({ id: mockRoomId, name: 'Test Room' });
      prismaMock.roomParticipant.findUnique.mockResolvedValue({ userId: inviterUserId, roomId: mockRoomId }); // Inviter is participant
      prismaMock.user.findUnique.mockResolvedValue(null); // User to invite does NOT exist

      const response = await app.inject({
        method: 'POST',
        url: `/rooms/${mockRoomId}/participants`,
        payload: { userId: 'nonExistentUserId' },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error).toBe('User to invite not found');
    });

    it('should return 409 if user to invite is already a participant', async () => {
      prismaMock.room.findUnique.mockResolvedValue({ id: mockRoomId, name: 'Test Room' });
      prismaMock.roomParticipant.findUnique
        .mockResolvedValueOnce({ userId: inviterUserId, roomId: mockRoomId }) // Inviter is participant
        .mockResolvedValueOnce({ userId: userToInviteId, roomId: mockRoomId }); // User to invite IS ALREADY participant

      prismaMock.user.findUnique.mockResolvedValue({ id: userToInviteId, username: 'ToInvite' }); // User to invite exists

      const response = await app.inject({
        method: 'POST',
        url: `/rooms/${mockRoomId}/participants`,
        payload: { userId: userToInviteId },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error).toBe('User is already a participant in this room');
    });

    it('should return 404 if room does not exist', async () => {
      prismaMock.room.findUnique.mockResolvedValue(null); // Room does NOT exist

      const response = await app.inject({
        method: 'POST',
        url: `/rooms/nonExistentRoomId/participants`,
        payload: { userId: userToInviteId },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error).toBe('Room not found');
    });

     it('should return 400 if userId to invite is not provided', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/rooms/${mockRoomId}/participants`,
        payload: {}, // Missing userId
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('User ID to invite is required');
    });
  });

  // --- User's Rooms Route ---
  describe('GET /me/rooms', () => {
    const currentUserId = mockUserInviter.userId; // Assuming this user is making the request

    it('should return a list of rooms the user is a participant of', async () => {
      const userRooms = [
        { roomId: 'room1', userId: currentUserId, room: { id: 'room1', name: 'Room Alpha', _count: { participants: 2 } } },
        { roomId: 'room2', userId: currentUserId, room: { id: 'room2', name: 'Room Beta', _count: { participants: 1 } } },
      ];
      prismaMock.roomParticipant.findMany.mockResolvedValue(userRooms);

      const response = await app.inject({
        method: 'GET',
        url: '/me/rooms',
        // headers: { authorization: 'Bearer userToken' } // authenticate is mocked
      });

      expect(response.statusCode).toBe(200);
      const responseData = response.json();
      expect(responseData).toHaveLength(2);
      expect(responseData[0]).toEqual(userRooms[0].room);
      expect(responseData[1]).toEqual(userRooms[1].room);
      expect(prismaMock.roomParticipant.findMany).toHaveBeenCalledWith({
        where: { userId: currentUserId },
        include: { room: { include: { _count: { select: { participants: true } } } } },
        orderBy: { room: { createdAt: 'desc' } },
      });
    });

    it('should return an empty list if the user is not in any rooms', async () => {
      prismaMock.roomParticipant.findMany.mockResolvedValue([]); // User is in no rooms

      const response = await app.inject({
        method: 'GET',
        url: '/me/rooms',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
    });

    it('should trigger authenticate middleware', async () => {
        // This test mostly ensures the route is protected and uses the mocked user
        prismaMock.roomParticipant.findMany.mockResolvedValue([]);
        await app.inject({ method: 'GET', url: '/me/rooms' });
        expect(app.authenticate).toHaveBeenCalled();
    });
  });
});
