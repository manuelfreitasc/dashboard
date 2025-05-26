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
      createMany: vi.fn(), // For /me/rooms specific test setup
      deleteMany: vi.fn(), // For /me/rooms specific test cleanup
    },
    user: { // Extended for participant invitation and /me/rooms tests
      findUnique: vi.fn(),
      create: vi.fn(), // For /me/rooms specific test setup
      deleteMany: vi.fn(), // For /me/rooms specific test cleanup
    },
    room: { // Extended for /me/rooms specific test setup
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      deleteMany: vi.fn(), // For /me/rooms specific test cleanup
    },
    // Add other models and methods as needed
  };
  return { PrismaClient: vi.fn(() => mockPrismaClient) };
});

// Mock the authenticate middleware
// Allow dynamic setting of the authenticated user for specific tests
let mockCurrentUser: { userId: string; username: string } | null = null;
vi.mock('../lib/authUtils', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../lib/authUtils')>();
    return {
        ...actual,
        authenticate: vi.fn(async (request: FastifyRequest, reply: FastifyReply) => {
            if (mockCurrentUser) {
                (request as any).user = mockCurrentUser;
            } else {
                // Default mock user if no specific user is set for the test
                (request as any).user = { userId: 'defaultTestUserId', username: 'defaultTestUser' };
            }
        }),
        // We might need to mock generateToken if it's complex or has external deps not available in test
        // For now, assuming direct import works or it's not strictly needed if authenticate is fully controlled.
        // generateToken: vi.fn((payload) => `mocked.jwt.token.for.${payload.userId}`),
    };
});


describe('Room and Video Routes', () => {
  let app: FastifyInstance;
  let prismaMock: any; // This will be the new PrismaClient() which is the mock

  const defaultMockUser = { userId: 'defaultTestUserId', username: 'defaultTestUser' };
  // Updated mockUserInviter to use defaultMockUser for consistency in existing tests if they rely on a specific user from the outer beforeEach
  const mockUserInviter = defaultMockUser;
  const mockUserToInvite = { userId: 'toInviteUserId', username: 'toInviteUser' };
  const mockAnotherParticipant = { userId: 'anotherParticipantId', username: 'anotherParticipant' };
  const mockRoomId = 'room123';
  const mockVideoId = 'video123';


  beforeEach(async () => {
    app = Fastify();
    prismaMock = new PrismaClient(); // Get the mocked instance
    app.register(roomRoutes);
    // The global mockCurrentUser is null by default.
    // For tests that need a specific user, set mockCurrentUser before app.inject
    // For tests that don't set it, the authenticate mock will use 'defaultTestUser'
    mockCurrentUser = defaultMockUser; // Set a default for general tests
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks(); // Use clearAllMocks to reset call counts etc. for fresh state in next test.
                       // resetAllMocks would also reset the implementation of mocks, which might be too much if some are globally configured.
                       // vi.restoreAllMocks might be an option if we need to restore original implementations.
    mockCurrentUser = null; // Reset mock user
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
        mockCurrentUser = { userId: 'specificUserForThisTest', username: 'specificTestUsername' };
        prismaMock.roomParticipant.findMany.mockResolvedValue([]);
        
        const response = await app.inject({ method: 'GET', url: '/me/rooms' });
        
        // Check if the authenticate mock was called
        const authUtils = await import('../lib/authUtils');
        expect(authUtils.authenticate).toHaveBeenCalled();
        
        // Also check that the correct user was passed by the mock
        // This requires the authenticate mock to pass the user details to the handler,
        // which it does by setting request.user.
        // The prismaMock.roomParticipant.findMany should be called with the userId from mockCurrentUser.
        expect(prismaMock.roomParticipant.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { userId: 'specificUserForThisTest' },
            })
        );
    });
  });

  describe('GET /me/rooms user-specific retrieval', () => {
    let userA: any, userB: any;
    let room1: any, room2: any, room3: any;

    beforeEach(async () => {
      // Setup: Create users, rooms, and participants
      // Note: These are calling the MOCKED Prisma methods.
      // We need to ensure the mock implementations for create/createMany return appropriate data
      // and that findMany can use this data.

      userA = { id: 'userA_id', username: 'userA_me_test', password: 'passwordA' };
      userB = { id: 'userB_id', username: 'userB_me_test', password: 'passwordB' };
      prismaMock.user.create
        .mockResolvedValueOnce(userA)
        .mockResolvedValueOnce(userB);
      await prismaMock.user.create({ data: { username: userA.username, password: userA.password } }); // Call it to match sequence if needed
      await prismaMock.user.create({ data: { username: userB.username, password: userB.password } });


      room1 = { id: 'room1_id', name: 'Room1_me_test', createdAt: new Date(), _count: {participants: 0 }};
      room2 = { id: 'room2_id', name: 'Room2_me_test', createdAt: new Date(), _count: {participants: 0 }};
      room3 = { id: 'room3_id', name: 'Room3_me_test', createdAt: new Date(), _count: {participants: 0 }};
      prismaMock.room.create
        .mockResolvedValueOnce(room1)
        .mockResolvedValueOnce(room2)
        .mockResolvedValueOnce(room3);
      await prismaMock.room.create({ data: { name: room1.name } });
      await prismaMock.room.create({ data: { name: room2.name } });
      await prismaMock.room.create({ data: { name: room3.name } });

      const participantData = [
        { userId: userA.id, roomId: room1.id, room: room1 },
        { userId: userA.id, roomId: room2.id, room: room2 },
        { userId: userB.id, roomId: room2.id, room: room2 },
        { userId: userB.id, roomId: room3.id, room: room3 },
      ];
      // Mock createMany to just accept data, not actually store it in this simplified mock.
      // The findMany mock will be responsible for returning the correct data based on userId.
      prismaMock.roomParticipant.createMany.mockResolvedValue({ count: participantData.length });
      await prismaMock.roomParticipant.createMany({ data: participantData.map(p => ({userId: p.userId, roomId: p.roomId})) });

      // Configure findMany to return data based on the userId
      prismaMock.roomParticipant.findMany.mockImplementation(async ({ where, include, orderBy }: any) => {
        const filteredParticipants = participantData.filter(p => p.userId === where.userId);
        // Simulate include and orderBy if necessary for more complex scenarios.
        // For this test, returning the room object directly associated with the participant is enough.
        return filteredParticipants.map(fp => ({
            ...fp, // contains userId, roomId, room object
            ...(include?.room && { room: { ...fp.room, _count: { participants: participantData.filter(p => p.roomId === fp.roomId).length } } })
        }));
      });
    });

    afterEach(async () => {
      // Cleanup: Reset mocks or clear specific data if the mock stored it
      // Since this mock doesn't deeply store state that interferes across tests after vi.clearAllMocks(),
      // specific deleteMany calls on the mock might not be strictly necessary unless we want to verify they are called.
      // For a real DB, deleteMany would be crucial.
      prismaMock.roomParticipant.deleteMany.mockReset();
      prismaMock.room.deleteMany.mockReset();
      prismaMock.user.deleteMany.mockReset();
      prismaMock.roomParticipant.findMany.mockReset(); // Reset implementation
    });

    it('should return rooms for User A correctly', async () => {
      mockCurrentUser = { userId: userA.id, username: userA.username };

      const response = await app.inject({
        method: 'GET',
        url: '/me/rooms',
        // No need for Authorization header if authenticate is mocked to use mockCurrentUser
      });

      expect(response.statusCode).toBe(200);
      const rooms = response.json();
      expect(rooms).toBeInstanceOf(Array);
      expect(rooms).toHaveLength(2);
      const roomNames = rooms.map((r: any) => r.name);
      expect(roomNames).toContain(room1.name);
      expect(roomNames).toContain(room2.name);
      expect(roomNames).not.toContain(room3.name);
    });

    it('should return rooms for User B correctly', async () => {
      mockCurrentUser = { userId: userB.id, username: userB.username };

      const response = await app.inject({
        method: 'GET',
        url: '/me/rooms',
      });

      expect(response.statusCode).toBe(200);
      const rooms = response.json();
      expect(rooms).toBeInstanceOf(Array);
      expect(rooms).toHaveLength(2);
      const roomNames = rooms.map((r: any) => r.name);
      expect(roomNames).not.toContain(room1.name);
      expect(roomNames).toContain(room2.name);
      expect(roomNames).toContain(room3.name);
    });
  });
});
