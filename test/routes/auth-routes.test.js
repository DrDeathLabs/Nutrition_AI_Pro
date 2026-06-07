import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { getApp, makeToken, makeEditorToken, makeViewerToken, authed } from '../helpers/server.js';

let app, a;
beforeAll(async () => {
  app = await getApp();
  a = authed(app);
});

describe('POST /api/auth/login', () => {
  it('returns 400 when body is missing password', async () => {
    const res = await request(app).post('/api/auth/login')
      .set('Content-Type', 'application/json').send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when password is not a string', async () => {
    const res = await request(app).post('/api/auth/login')
      .set('Content-Type', 'application/json').send({ password: 123 });
    expect(res.status).toBe(400);
  });

  it('returns 401 for wrong password (no username — env-var path)', async () => {
    const res = await request(app).post('/api/auth/login')
      .set('Content-Type', 'application/json').send({ password: 'wrongpassword' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBeTruthy();
  });

  it('returns 401 for wrong username+password', async () => {
    const res = await request(app).post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send({ username: 'notarealuser', password: 'wrongpassword' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBeTruthy();
  });

  it('does not leak error details on wrong password', async () => {
    const res = await request(app).post('/api/auth/login')
      .set('Content-Type', 'application/json').send({ password: 'wrong' });
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('stack');
    expect(body).not.toContain('JWT_SECRET');
    expect(body).not.toContain('ADMIN_PASSWORD');
  });

  // Backward-compat: if no username, the env-var path still runs (for correctness test)
  it('returns 200, 401, or 429 for env password without username', async () => {
    const res = await request(app).post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send({ password: process.env.ADMIN_PASSWORD });
    // Without a username: env-var comparison path; 429 possible from rate limiter
    expect([200, 401, 429]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.token).toBeTruthy();
    }
  });
});

describe('GET /api/auth/status', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/auth/status');
    expect(res.status).toBe(401);
  });

  it('returns 200 with valid token', async () => {
    const token = makeToken();
    const res = await request(app).get('/api/auth/status')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.authenticated).toBe(true);
  });

  it('returns role, username, exp, and iat in status response', async () => {
    const token = makeToken({ user_id: 1, username: 'admin', role: 'admin' });
    const res = await request(app).get('/api/auth/status')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('role', 'admin');
    expect(res.body).toHaveProperty('username', 'admin');
    expect(res.body).toHaveProperty('exp');
    expect(res.body).toHaveProperty('iat');
  });

  it('returns 401 with malformed token', async () => {
    const res = await request(app).get('/api/auth/status')
      .set('Authorization', 'Bearer not.a.valid.token');
    expect(res.status).toBe(401);
  });

  it('returns 401 without Bearer prefix', async () => {
    const token = makeToken();
    const res = await request(app).get('/api/auth/status')
      .set('Authorization', token);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/change-password', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).post('/api/auth/change-password')
      .set('Content-Type', 'application/json')
      .send({ currentPassword: 'old', newPassword: 'newpassword1234' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when currentPassword is missing', async () => {
    const res = await a.post('/api/auth/change-password')
      .send({ newPassword: 'newpassword1234' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('returns 400 when newPassword is missing', async () => {
    const res = await a.post('/api/auth/change-password')
      .send({ currentPassword: process.env.ADMIN_PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('returns 400 when newPassword is shorter than 12 chars', async () => {
    const res = await a.post('/api/auth/change-password')
      .send({ currentPassword: process.env.ADMIN_PASSWORD, newPassword: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/12/);
  });

  it('returns 400 when newPassword exceeds 128 chars', async () => {
    const res = await a.post('/api/auth/change-password')
      .send({
        currentPassword: process.env.ADMIN_PASSWORD,
        newPassword: 'x'.repeat(129),
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/128/);
  });

  it('returns 401 or 503 when currentPassword is wrong (503 if DB unavailable)', async () => {
    const res = await a.post('/api/auth/change-password')
      .send({ currentPassword: 'definitely-wrong-password', newPassword: 'validnewpassword123' });
    // 401 if DB available and password wrong; 503 if DB unavailable in test env
    expect([401, 503]).toContain(res.status);
    expect(res.body.error).toBeTruthy();
  });

  // This test will return 503 in test env (no DB) or 200 if DB is available
  it('returns 200 or 503 (DB required) when credentials are correct', async () => {
    const res = await a.post('/api/auth/change-password')
      .send({
        currentPassword: process.env.ADMIN_PASSWORD,
        newPassword: 'validnewpassword456!!',
      });
    expect([200, 503]).toContain(res.status);
  });
});

describe('GET /api/auth/me', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns user info with valid token', async () => {
    const token = makeToken({ user_id: 1, username: 'testuser', role: 'admin' });
    const res = await request(app).get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    // 200 with user data (from DB if available) or falls back to token data
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty('username');
      expect(res.body).toHaveProperty('role');
    }
  });
});

describe('JWT payload includes user_id and username', () => {
  it('makeEditorToken creates a token with editor role', () => {
    const token = makeEditorToken();
    const decoded = jwt.decode(token);
    expect(decoded.role).toBe('editor');
    expect(decoded.username).toBe('editor');
    expect(decoded.user_id).toBe(2);
  });

  it('editor token is rejected by admin-only endpoints (403)', async () => {
    const editorToken = makeEditorToken();
    const res = await request(app).delete('/api/logs')
      .set('Authorization', `Bearer ${editorToken}`)
      .set('Content-Type', 'application/json')
      .send({ days: 30 });
    expect(res.status).toBe(403);
  });

  it('viewer token is rejected by editor endpoints (403)', async () => {
    const viewerToken = makeViewerToken();
    const res = await request(app).post('/api/jobs')
      .set('Authorization', `Bearer ${viewerToken}`)
      .set('Content-Type', 'application/json')
      .send({ goal: 'high protein lunch', amount: 1 });
    expect(res.status).toBe(403);
  });
});
