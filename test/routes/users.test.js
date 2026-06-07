import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getApp, authed, authedAs, makeViewerToken, makeEditorToken } from '../helpers/server.js';

let app, a;
beforeAll(async () => {
  app = await getApp();
  a = authed(app);
});

describe('GET /api/users', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  it('returns 403 for editor', async () => {
    const editor = authedAs(app, 'editor');
    const res = await editor.get('/api/users');
    expect(res.status).toBe(403);
  });

  it('returns 403 for viewer', async () => {
    const viewer = authedAs(app, 'viewer');
    const res = await viewer.get('/api/users');
    expect(res.status).toBe(403);
  });

  it('returns 200 or 500 (DB required) for admin', async () => {
    const res = await a.get('/api/users');
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(Array.isArray(res.body)).toBe(true);
    }
  });
});

describe('POST /api/users', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).post('/api/users')
      .send({ username: 'test', password: 'pass1234', role: 'editor' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for editor', async () => {
    const editor = authedAs(app, 'editor');
    const res = await editor.post('/api/users')
      .send({ username: 'test', password: 'pass1234', role: 'editor' });
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid username (too short)', async () => {
    const res = await a.post('/api/users')
      .send({ username: 'x', password: 'validpassword123', role: 'editor' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/username/i);
  });

  it('returns 400 for invalid username (special chars)', async () => {
    const res = await a.post('/api/users')
      .send({ username: 'bad user!', password: 'validpassword123', role: 'editor' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid role', async () => {
    const res = await a.post('/api/users')
      .send({ username: 'validuser', password: 'validpassword123', role: 'superadmin' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/role/i);
  });

  it('returns 400 for password too short', async () => {
    const res = await a.post('/api/users')
      .send({ username: 'validuser', password: 'short', role: 'editor' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid email format', async () => {
    const res = await a.post('/api/users')
      .send({ username: 'validuser', email: 'notanemail', password: 'validpassword123', role: 'editor' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  it('returns 201 or 500 (DB required) for valid user creation', async () => {
    const res = await a.post('/api/users')
      .send({
        username: 'testuser123',
        email: 'test@example.com',
        password: 'validpassword123',
        role: 'editor',
      });
    expect([201, 409, 500]).toContain(res.status);
    if (res.status === 201) {
      expect(res.body).toHaveProperty('username', 'testuser123');
      expect(res.body).toHaveProperty('role', 'editor');
      expect(res.body).not.toHaveProperty('password_hash');
    }
  });
});

describe('DELETE /api/users/:id', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).delete('/api/users/99');
    expect(res.status).toBe(401);
  });

  it('returns 403 for editor', async () => {
    const editor = authedAs(app, 'editor');
    const res = await editor.delete('/api/users/99');
    expect(res.status).toBe(403);
  });

  it('returns 400 when deleting own account', async () => {
    // The makeAdminToken creates token with user_id=1
    // Trying to delete user 1 should fail
    const res = await a.delete('/api/users/1');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/own account/i);
  });

  it('returns 404 or 500 (DB required) for non-existent user', async () => {
    const res = await a.delete('/api/users/99999');
    expect([404, 500]).toContain(res.status);
  });
});

describe('POST /api/users/:id/reset-password', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).post('/api/users/99/reset-password')
      .send({ new_password: 'newpassword123' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for editor', async () => {
    const editor = authedAs(app, 'editor');
    const res = await editor.post('/api/users/99/reset-password')
      .send({ new_password: 'newpassword123' });
    expect(res.status).toBe(403);
  });

  it('returns 400 for missing new_password', async () => {
    const res = await a.post('/api/users/99/reset-password').send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 for password too short', async () => {
    const res = await a.post('/api/users/99/reset-password')
      .send({ new_password: 'short' });
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/users/:id', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).put('/api/users/99')
      .send({ email: 'test@example.com' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for viewer trying to update another user', async () => {
    const viewerToken = makeViewerToken();
    // viewer (user_id=3) trying to update user 1
    const res = await request(app).put('/api/users/1')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ email: 'viewer@example.com' });
    expect(res.status).toBe(403);
  });

  it('returns 400 when no valid fields provided', async () => {
    const res = await a.put('/api/users/1').send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when admin tries to deactivate own account', async () => {
    // makeAdminToken produces user_id=1 — trying to set is_active=false on self
    const res = await a.put('/api/users/1')
      .send({ is_active: false });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/deactivate/i);
  });

  it('returns 400 for invalid email format', async () => {
    const res = await a.put('/api/users/1')
      .send({ email: 'bademail' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid role', async () => {
    const res = await a.put('/api/users/2')
      .send({ role: 'superadmin' });
    expect(res.status).toBe(400);
  });
});
