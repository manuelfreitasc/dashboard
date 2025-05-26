import { describe, it, expect, beforeEach, vi, mock } from 'vitest'; // Import vi and mock
import { hashPassword, comparePassword, generateToken, verifyToken, authenticate } from './authUtils';
import { FastifyRequest, FastifyReply } from 'fastify';

// Mock bcrypt
vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn().mockImplementation(async (password: string, saltOrRounds: number) => `${password}_hashed_with_salt_${saltOrRounds}`),
    compare: vi.fn().mockImplementation(async (password: string, hash: string) => hash.startsWith(`${password}_hashed_with_salt_`)),
  }
}));

// Mock jsonwebtoken
vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn().mockImplementation((payload: any, secretOrPrivateKey: string, options?: any) => {
      // Create a simplified token structure for testing: payload.secret.options
      return `${JSON.stringify(payload)}.${secretOrPrivateKey}.${JSON.stringify(options)}`;
    }),
    verify: vi.fn().mockImplementation((token: string, secretOrPublicKey: string, options?: any) => {
      if (token === 'invalid.token.string' || !token || typeof token !== 'string') return null;
      const parts = token.split('.');
      if (parts.length !== 3) return null; // Invalid structure
      try {
        const payload = JSON.parse(parts[0]);
        // In a real scenario, you'd check expiry (iat, exp from payload) and signature here.
        // For this mock, we'll assume if it parses, it's valid unless it's the specific "invalid" string.
        // Add iat and exp if not present, like the original jwt.sign would
        const now = Math.floor(Date.now() / 1000);
        if(!payload.iat) payload.iat = now;
        // If options.expiresIn was '1d', exp would be now + 24*60*60
        // For simplicity, just add exp if not there for structure
        if(!payload.exp && options?.expiresIn) {
            // crude way to simulate expiresIn, e.g. '1d' -> add seconds for a day
            let secondsToAdd = 0;
            if (typeof options.expiresIn === 'string' && options.expiresIn.endsWith('d')) {
                secondsToAdd = parseInt(options.expiresIn.slice(0, -1)) * 24 * 60 * 60;
            } else if (typeof options.expiresIn === 'number') {
                secondsToAdd = options.expiresIn;
            }
            payload.exp = payload.iat + secondsToAdd;
        } else if (!payload.exp) {
            payload.exp = now + (60*60); // default 1h like some JWTs
        }

        return payload;
      } catch (e) {
        return null; // Error parsing token means it's invalid
      }
    }),
  }
}));

// Mock Fastify objects for authenticate middleware test
const mockRequest = (headers?: any) => ({
  headers: headers || {},
}) as FastifyRequest;

const mockReply = () => {
  const reply: Partial<FastifyReply> = {
    status: (statusCode: number) => {
      (reply as any).statusCode = statusCode;
      return reply as FastifyReply;
    },
    send: (payload: any) => {
      (reply as any).payload = payload;
      return reply as FastifyReply;
    },
  };
  return reply as FastifyReply;
};


describe('Auth Utilities', () => {
  const testPassword = 'password123';
  let hashedPassword = '';

  beforeEach(async () => {
    hashedPassword = await hashPassword(testPassword);
  });

  describe('hashPassword', () => {
    it('should hash a password', async () => {
      expect(hashedPassword).toBeTypeOf('string');
      expect(hashedPassword).not.toBe(testPassword);
    });
  });

  describe('comparePassword', () => {
    it('should return true for matching passwords', async () => {
      const isMatch = await comparePassword(testPassword, hashedPassword);
      expect(isMatch).toBe(true);
    });

    it('should return false for non-matching passwords', async () => {
      const isMatch = await comparePassword('wrongpassword', hashedPassword);
      expect(isMatch).toBe(false);
    });
  });

  describe('JWT functions', () => {
    const payload = { userId: 'testUser123', username: 'testuser' };
    let token = '';

    it('should generate a token', () => {
      token = generateToken(payload);
      expect(token).toBeTypeOf('string');
      expect(token.split('.').length).toBe(3); // JWTs have three parts
    });

    it('should verify a valid token and return its payload', () => {
      const decoded = verifyToken(token);
      expect(decoded).not.toBeNull();
      expect(decoded?.userId).toBe(payload.userId);
      expect(decoded?.username).toBe(payload.username);
      expect(decoded?.iat).toBeTypeOf('number');
      expect(decoded?.exp).toBeTypeOf('number');
    });

    it('should return null for an invalid token', () => {
      const invalidToken = 'invalid.token.string';
      expect(verifyToken(invalidToken)).toBeNull();
      // Testing for an expired token precisely without time manipulation (vi.useFakeTimers) is complex.
      // The 'invalid.token.string' test covers the scenario where verifyToken should return null.
      // If specific expiry logic needs testing, vi.useFakeTimers() would be the way to go.
      // e.g.
      // vi.useFakeTimers();
      // vi.setSystemTime(new Date(2000, 1, 1, 13, 0, 0)); // Set current time
      // const testToken = generateToken(payload); // Token generated with '1d' expiry
      // vi.advanceTimersByTime(2 * 24 * 60 * 60 * 1000); // Advance time by 2 days
      // expect(verifyToken(testToken)).toBeNull();
      // vi.useRealTimers();
    });
  });
  
  describe('authenticate middleware', () => {
    let validToken: string;
    const userInfo = { userId: 'authTestUser', username: 'authenticator' };

    beforeEach(() => {
      // Use the actual JWT_SECRET from environment for consistency if possible, or a fixed test secret
      // For this test, generateToken will use its internal default 'your-secret-key' if JWT_SECRET is not set in test env
      validToken = generateToken(userInfo);
    });

    it('should call reply.status(401) if no authorization header is present', async () => {
      const request = mockRequest();
      const reply = mockReply();
      await authenticate(request, reply);
      expect((reply as any).statusCode).toBe(401);
      expect((reply as any).payload.error).toContain('Missing or invalid token');
    });

    it('should call reply.status(401) if authorization header does not start with "Bearer "', async () => {
      const request = mockRequest({ authorization: `Basic ${validToken}` });
      const reply = mockReply();
      await authenticate(request, reply);
      expect((reply as any).statusCode).toBe(401);
      expect((reply as any).payload.error).toContain('Missing or invalid token');
    });

    it('should call reply.status(401) if token is invalid', async () => {
      const request = mockRequest({ authorization: 'Bearer aninvalidtokenstring' });
      const reply = mockReply();
      await authenticate(request, reply);
      expect((reply as any).statusCode).toBe(401);
      expect((reply as any).payload.error).toContain('Invalid token');
    });

    it('should attach user to request and not call reply.send if token is valid', async () => {
      const request = mockRequest({ authorization: `Bearer ${validToken}` });
      const reply = mockReply();
      const sendSpy = vi.spyOn(reply, 'send'); // Using vitest.spyOn (vi)

      await authenticate(request, reply);

      expect(sendSpy).not.toHaveBeenCalled();
      expect((request as any).user).toBeDefined();
      expect((request as any).user.userId).toBe(userInfo.userId);
      expect((request as any).user.username).toBe(userInfo.username);
    });
  });
});
