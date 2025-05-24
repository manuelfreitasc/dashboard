import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { FastifyRequest, FastifyReply } from 'fastify';

const SALT_ROUNDS = 10;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'; // Use environment variable in production

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(payload: object): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' }); // Token expires in 1 day
}

export function verifyToken(token: string): any {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.status(401).send({ error: 'Unauthorized: Missing or invalid token' });
    return;
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  const decoded = verifyToken(token);

  if (!decoded) {
    reply.status(401).send({ error: 'Unauthorized: Invalid token' });
    return;
  }

  // Attach user information to the request for further use in route handlers
  (request as any).user = decoded;
}
