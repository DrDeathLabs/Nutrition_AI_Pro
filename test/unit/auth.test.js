import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

describe('JWT token generation and verification', () => {
  it('signs a token that can be verified', () => {
    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
    expect(token).toBeTruthy();
    const decoded = jwt.verify(token, JWT_SECRET);
    expect(decoded.role).toBe('admin');
  });

  it('rejects a token signed with wrong secret', () => {
    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
    expect(() => jwt.verify(token, 'wrong-secret')).toThrow();
  });

  it('rejects a malformed token', () => {
    expect(() => jwt.verify('not.a.real.token', JWT_SECRET)).toThrow();
  });

  it('rejects an expired token', async () => {
    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '1ms' });
    await new Promise(r => setTimeout(r, 20));
    expect(() => jwt.verify(token, JWT_SECRET)).toThrow(/expired/i);
  });

  it('token payload contains role admin', () => {
    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
    const payload = jwt.decode(token);
    expect(payload.role).toBe('admin');
  });
});

describe('Timing-safe password comparison', () => {
  it('matches identical passwords', () => {
    const provided = Buffer.from(ADMIN_PASSWORD.padEnd(72), 'utf8');
    const expected = Buffer.from(ADMIN_PASSWORD.padEnd(72), 'utf8');
    expect(provided.length).toBe(expected.length);
    expect(crypto.timingSafeEqual(provided, expected)).toBe(true);
  });

  it('rejects different passwords', () => {
    const provided = Buffer.from('wrongpassword'.padEnd(72), 'utf8');
    const expected = Buffer.from(ADMIN_PASSWORD.padEnd(72), 'utf8');
    expect(crypto.timingSafeEqual(provided, expected)).toBe(false);
  });
});
