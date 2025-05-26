import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { hashPassword, comparePassword, generateToken, authenticate } from '../lib/authUtils'; // Added authenticate

const prisma = new PrismaClient();

async function authRoutes(fastify: FastifyInstance) {
  // User Registration
  fastify.post('/auth/register', async (request: FastifyRequest, reply: FastifyReply) => {
    const { username, password } = request.body as any; // Add proper typing later

    if (!username || !password) {
      reply.status(400).send({ error: 'Username and password are required' });
      return;
    }

    try {
      const existingUser = await prisma.user.findUnique({ where: { username } });
      if (existingUser) {
        reply.status(409).send({ error: 'User already exists' });
        return;
      }

      const hashedPassword = await hashPassword(password);
      const newUser = await prisma.user.create({
        data: {
          username,
          password: hashedPassword,
        },
      });

      const token = generateToken({ userId: newUser.id, username: newUser.username });
      reply.status(201).send({ message: 'User registered successfully', token, userId: newUser.id, username: newUser.username });
    } catch (error) {
      console.error('Registration error:', error);
      reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // User Login
  fastify.post('/auth/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const { username, password } = request.body as any; // Add proper typing later

    if (!username || !password) {
      reply.status(400).send({ error: 'Username and password are required' });
      return;
    }

    try {
      const user = await prisma.user.findUnique({ where: { username } });
      if (!user) {
        reply.status(401).send({ error: 'Invalid username or password' });
        return;
      }

      const passwordMatch = await comparePassword(password, user.password);
      if (!passwordMatch) {
        reply.status(401).send({ error: 'Invalid username or password' });
        return;
      }

      const token = generateToken({ userId: user.id, username: user.username });
      reply.status(200).send({ message: 'Login successful', token, userId: user.id, username: user.username });
    } catch (error) {
      console.error('Login error:', error);
      reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Search for users
  fastify.get(
    '/auth/users/search',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { q: searchTerm } = request.query as { q?: string };
      const authenticatedUserId = (request as any).user.userId;

      if (!searchTerm || searchTerm.trim().length < 2) {
        reply.status(400).send({ error: 'Search term must be at least 2 characters long' });
        return;
      }

      try {
        const users = await prisma.user.findMany({
          where: {
            username: {
              contains: searchTerm.trim(),
              mode: 'insensitive',
            },
            NOT: {
              id: authenticatedUserId,
            },
          },
          select: {
            id: true,
            username: true,
          },
          take: 10,
        });

        reply.status(200).send(users);
      } catch (error) {
        console.error('User search error:', error);
        reply.status(500).send({ error: 'Internal server error while searching for users' });
      }
    },
  );
}

export default authRoutes;
