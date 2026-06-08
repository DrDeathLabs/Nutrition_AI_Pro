import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getApp } from '../helpers/server.js';

// These tests verify that every protected endpoint returns 401 when no token
// is provided. They do NOT need a real DB because auth middleware rejects
// before any query runs.

const PROTECTED = [
  ['GET',    '/api/recipes'],
  ['GET',    '/api/jobs'],
  ['GET',    '/api/worker-status'],
  ['GET',    '/api/logs'],
  ['GET',    '/api/settings'],
  ['GET',    '/api/prompts'],
  ['GET',    '/api/export'],
  ['GET',    '/api/admin/stats'],
  ['GET',    '/api/system-info'],
  ['POST',   '/api/jobs'],
  ['POST',   '/api/settings'],
  ['POST',   '/api/import'],
  ['POST',   '/api/recipes/bulk'],
  ['POST',   '/api/recipes/1/finalize'],
  ['POST',   '/api/health-check-ai'],
  ['POST',   '/api/users'],
  ['POST',   '/api/users/1/reset-password'],
  ['POST',   '/api/auth/change-password'],
  ['PUT',    '/api/recipes/1'],
  ['PUT',    '/api/users/1'],
  ['PUT',    '/api/prompts/system_contract'],
  ['DELETE', '/api/recipes/1'],
  ['DELETE', '/api/logs'],
  ['DELETE', '/api/users/1'],
  ['DELETE', '/api/prompts/system_contract'],
  ['GET',    '/api/users'],
  ['GET',    '/api/users/1'],
  ['GET',    '/api/auth/me'],
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

describe('Auth endpoints are reachable without token', () => {
  it('POST /api/auth/login returns a login-layer response, not 404', async () => {
    const res = await request(app).post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send({});
    expect([400, 401, 429]).toContain(res.status);
  });
});

describe('Sensitive endpoint security hardening', () => {
  it('POST /api/health-check-ai does not echo request secrets when auth blocks the request', async () => {
    const res = await request(app).post('/api/health-check-ai')
      .set('Content-Type', 'application/json')
      .send({ provider: 'claude', api_key: 'sk-ant-sensitive-key' });
    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toContain('sk-ant-sensitive-key');
  });

  it('DELETE /api/logs still requires authentication when a body is present', async () => {
    const res = await request(app).delete('/api/logs')
      .set('Content-Type', 'application/json')
      .send({ days: 30 });
    expect(res.status).toBe(401);
  });
});
