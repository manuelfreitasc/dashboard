import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import authRoutes from './auth'; // The routes to test
import { PrismaClient } from '@prisma/client';
import { hashPassword, generateToken } from '../lib/authUtils'; // For test utilities

// Mock Prisma Client
vi.mock('@prisma/client', () => {
  const mockPrismaClient = {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    // Add other models and methods as needed for different tests
  };
  return { PrismaClient: vi.fn(() => mockPrismaClient) };
});

// Mock authUtils specifically for generateToken if its internal JWT_SECRET causes issues in tests
// For now, we assume the actual generateToken is fine if JWT_SECRET is default or set in test env
// vi.mock('../lib/authUtils', async (importOriginal) => {
//   const actual = await importOriginal<typeof import('../lib/authUtils')>();
//   return {
//     ...actual,
//     generateToken: vi.fn().mockReturnValue('mocked.test.token'),
//   };
// });


describe('Auth Routes', () => {
  let app:any;
  let prismaMock:any;

  beforeEach(async () => {
    // Initialize a new Fastify instance for each test
    app = Fastify();
    // Get the mocked PrismaClient instance
    prismaMock = new PrismaClient();
    // Register the auth routes
    app.register(authRoutes);
    // Wait for Fastify to be ready
    await app.ready();
  });

  afterEach(async () => {
    // Close the Fastify instance
    await app.close();
    // Reset all mocks
    vi.resetAllMocks();
  });

  describe('POST /auth/register', () => {
    it('should register a new user successfully and return a token', async () => {
      const mockUser = { id: 'user1', username: 'testuser', password: 'hashedPassword' };
      prismaMock.user.findUnique.mockResolvedValue(null); // No existing user
      prismaMock.user.create.mockResolvedValue(mockUser);

      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { username: 'testuser', password: 'password123' },
      });

      expect(response.statusCode).toBe(201);
      const jsonResponse = response.json();
      expect(jsonResponse.message).toBe('User registered successfully');
      expect(jsonResponse.token).toBeTypeOf('string');
      expect(jsonResponse.userId).toBe(mockUser.id);
      expect(jsonResponse.username).toBe(mockUser.username);
      expect(prismaMock.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { username: 'testuser', password: expect.any(String) } })
      );
    });

    it('should return 409 if user already exists', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 'user1', username: 'testuser' });

      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { username: 'testuser', password: 'password123' },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error).toBe('User already exists');
    });

    it('should return 400 if username or password is not provided', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { username: 'testuser' }, // Missing password
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('Username and password are required');
    });
  });

  describe('POST /auth/login', () => {
    it('should login an existing user and return a token', async () => {
      const storedHashedPassword = await hashPassword('password123'); // Use actual hash for comparison
      const mockUser = { id: 'user1', username: 'testuser', password: storedHashedPassword };
      prismaMock.user.findUnique.mockResolvedValue(mockUser);

      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { username: 'testuser', password: 'password123' },
      });

      expect(response.statusCode).toBe(200);
      const jsonResponse = response.json();
      expect(jsonResponse.message).toBe('Login successful');
      expect(jsonResponse.token).toBeTypeOf('string');
      expect(jsonResponse.userId).toBe(mockUser.id);
      expect(jsonResponse.username).toBe(mockUser.username);
    });

    it('should return 401 if user does not exist', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { username: 'nouser', password: 'password123' },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error).toBe('Invalid username or password');
    });

    it('should return 401 if password does not match', async () => {
      const storedHashedPassword = await hashPassword('password123');
      const mockUser = { id: 'user1', username: 'testuser', password: storedHashedPassword };
      prismaMock.user.findUnique.mockResolvedValue(mockUser);

      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { username: 'testuser', password: 'wrongpassword' },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error).toBe('Invalid username or password');
    });
  });
});
