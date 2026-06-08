import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getApp, makeAdminToken, makeEditorToken, makeViewerToken } from '../helpers/server.js';

let app;
beforeAll(async () => { app = await getApp(); });

const ADMIN_ONLY = [
  ['GET',    '/api/logs',                  null],
  ['GET',    '/api/settings',              null],
  ['GET',    '/api/prompts',               null],
  ['GET',    '/api/export',                null],
  ['GET',    '/api/users',                 null],
  ['GET',    '/api/admin/stats',           null],
  ['GET',    '/api/system-info',           null],
  ['POST',   '/api/import',                { recipes: [], settings: [] }],
  ['POST',   '/api/settings',              { settings: [] }],
  ['POST',   '/api/users',                 { username: 'u', password: 'password123', role: 'editor' }],
  ['POST',   '/api/users/999/reset-password', { new_password: 'reset123456' }],
  ['PUT',    '/api/prompts/system_contract', { value: 'test' }],
  ['DELETE', '/api/logs',                  { days: 30 }],
  ['DELETE', '/api/users/999',             null],
  ['DELETE', '/api/prompts/system_contract', null],
];

const EDITOR_OR_ADMIN = [
  ['POST', '/api/jobs',              { goal: 'high protein', amount: 1 }],
  ['POST', '/api/recipes/1/finalize', null],
  ['PUT',  '/api/recipes/1',         { title: 't', data: {}, status: 'draft' }],
];

const AUTHENTICATED_READS = [
  ['GET', '/api/recipes'],
  ['GET', '/api/jobs'],
  ['GET', '/api/worker-status'],
  ['GET', '/api/auth/me'],
];

function send(method, path, token, body = null) {
  const req = request(app)[method.toLowerCase()](path)
    .set('Authorization', `Bearer ${token}`);
  if (body) req.set('Content-Type', 'application/json');
  return body ? req.send(body) : req;
}

describe('Admin-only endpoints', () => {
  it.each(ADMIN_ONLY)('%s %s returns 403 for editor', async (method, path, body) => {
    const res = await send(method, path, makeEditorToken(), body);
    expect(res.status).toBe(403);
  });

  it.each(ADMIN_ONLY)('%s %s returns 403 for viewer', async (method, path, body) => {
    const res = await send(method, path, makeViewerToken(), body);
    expect(res.status).toBe(403);
  });
});

describe('Editor-only endpoints', () => {
  it.each(EDITOR_OR_ADMIN)('%s %s returns 403 for viewer', async (method, path, body) => {
    const res = await send(method, path, makeViewerToken(), body);
    expect(res.status).toBe(403);
  });
});

describe('Authenticated non-admin reads', () => {
  it.each(AUTHENTICATED_READS)('%s %s does not return 403 for viewer', async (method, path) => {
    const res = await send(method, path, makeViewerToken());
    expect(res.status).not.toBe(403);
  });
});

describe('Admin access', () => {
  it.each([...ADMIN_ONLY, ...EDITOR_OR_ADMIN])('%s %s does not return 403 for admin', async (method, path, body) => {
    const res = await send(method, path, makeAdminToken(), body);
    expect(res.status).not.toBe(403);
  });
});

describe('JWT role enforcement is local to the token', () => {
  it('editor token produces 403 on an admin route before any DB-backed authorization lookup is needed', async () => {
    const res = await request(app).delete('/api/recipes/1')
      .set('Authorization', `Bearer ${makeEditorToken()}`);
    expect(res.status).toBe(403);
  });

  it('admin token passes the role gate on an admin route', async () => {
    const res = await request(app).get('/api/users')
      .set('Authorization', `Bearer ${makeAdminToken()}`);
    expect(res.status).not.toBe(403);
  });
});
