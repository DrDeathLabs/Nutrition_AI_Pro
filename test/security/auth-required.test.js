import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getApp } from '../helpers/server.js';

// These tests verify that every protected endpoint returns 401 when no token
// is provided. They do NOT need a real DB because auth middleware rejects
// before any query runs.

const PROTECTED = [
  // Original endpoints
  ['GET',    '/api/recipes'],
  ['GET',    '/api/jobs'],
  ['GET',    '/api/worker-status'],
  ['GET',    '/api/logs'],
  ['GET',    '/api/settings'],
  ['GET',    '/api/system-contract'],
  ['GET',    '/api/export'],
  ['POST',   '/api/jobs'],
  ['POST',   '/api/settings'],
  ['POST',   '/api/recipes/bulk'],
  ['POST',   '/api/recipes/1/finalize'],
  ['POST',   '/api/health-check-ai'],
  ['PUT',    '/api/recipes/1'],
  ['DELETE', '/api/recipes/1'],
  // Endpoints added in settings overhaul
  ['GET',    '/api/admin/stats'],
  ['GET',    '/api/system-info'],
  ['DELETE', '/api/logs'],
  ['POST',   '/api/import'],
  ['POST',   '/api/auth/change-password'],
  // Round 2: user management + contract CRUD
  ['GET',    '/api/users'],
  ['POST',   '/api/users'],
  ['GET',    '/api/users/1'],
  ['PUT',    '/api/users/1'],
  ['DELETE', '/api/users/1'],
  ['POST',   '/api/users/1/reset-password'],
  ['GET',    '/api/auth/me'],
  ['PUT',    '/api/system-contract'],
  ['DELETE', '/api/system-contract'],
];

let app;
beforeAll(async () => { app = await getApp(); });

describe('Authentication required on all protected endpoints', () => {
  it.each(PROTECTED)('%s %s returns 401 without token', async (method, path) => {
    const res = await request(app)[method.toLowerCase()](path)
      .set('Content-Type', 'application/json')
      .send({});
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('GET /api/auth/status returns 401 without token', async () => {
    const res = await request(app).get('/api/auth/status');
    expect(res.status).toBe(401);
  });
});

describe('Auth endpoints are accessible without token', () => {
  it('POST /api/auth/login is reachable (returns 400 or 401, not 404)', async () => {
    const res = await request(app).post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send({});
    expect([400, 401, 429]).toContain(res.status);
  });
});

describe('Sensitive endpoint security hardening', () => {
  it('POST /api/health-check-ai does not accept API keys in request body', async () => {
    // This test verifies the endpoint requires auth — the body with API keys
    // never reaches the handler (auth check fires first).
    const res = await request(app).post('/api/health-check-ai')
      .set('Content-Type', 'application/json')
      .send({ provider: 'claude', api_key: 'sk-ant-sensitive-key' });
    // Must be 401 — body is irrelevant, auth blocks it
    expect(res.status).toBe(401);
    // Response must not echo back the key
    expect(JSON.stringify(res.body)).not.toContain('sk-ant-sensitive-key');
  });

  it('DELETE /api/logs requires explicit days param (tested in settings.test.js)', async () => {
    const res = await request(app).delete('/api/logs')
      .set('Content-Type', 'application/json')
      .send({ days: 30 });
    // No token — must be 401
    expect(res.status).toBe(401);
  });
});
