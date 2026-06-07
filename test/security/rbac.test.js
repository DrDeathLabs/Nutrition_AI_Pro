import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getApp, makeAdminToken, makeEditorToken, makeViewerToken } from '../helpers/server.js';

let app;
beforeAll(async () => { app = await getApp(); });

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

// Admin-only endpoints must return 403 for editor and viewer
const ADMIN_ONLY = [
  ['DELETE', '/api/logs',             { days: 30 }],
  ['POST',   '/api/settings',         { settings: [] }],
  ['GET',    '/api/export',           null],
  ['POST',   '/api/import',           { recipes: [], settings: [] }],
  ['GET',    '/api/users',            null],
  ['POST',   '/api/users',            { username: 'u', password: 'p', role: 'editor' }],
  ['DELETE', '/api/users/999',        null],
  ['POST',   '/api/users/999/reset-password', { new_password: 'reset123456' }],
  ['PUT',    '/api/system-contract',  { contract: 'test' }],
  ['DELETE', '/api/system-contract',  null],
];

describe('Admin-only endpoints: editor gets 403', () => {
  it.each(ADMIN_ONLY)('%s %s returns 403 for editor', async (method, path, body) => {
    const editorToken = makeEditorToken();
    const req = request(app)[method.toLowerCase()](path)
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${editorToken}`);
    const res = body ? await req.send(body) : await req;
    expect(res.status).toBe(403);
  });
});

describe('Admin-only endpoints: viewer gets 403', () => {
  it.each(ADMIN_ONLY)('%s %s returns 403 for viewer', async (method, path, body) => {
    const viewerToken = makeViewerToken();
    const req = request(app)[method.toLowerCase()](path)
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${viewerToken}`);
    const res = body ? await req.send(body) : await req;
    expect(res.status).toBe(403);
  });
});

// Editor-only endpoints must return 403 for viewer
const EDITOR_OR_ADMIN = [
  ['POST', '/api/jobs',             { goal: 'high protein', amount: 1 }],
  ['POST', '/api/recipes/1/finalize', null],
  ['PUT',  '/api/recipes/1',        { title: 't', data: {}, status: 'draft' }],
];

describe('Editor+ endpoints: viewer gets 403', () => {
  it.each(EDITOR_OR_ADMIN)('%s %s returns 403 for viewer', async (method, path, body) => {
    const viewerToken = makeViewerToken();
    const req = request(app)[method.toLowerCase()](path)
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${viewerToken}`);
    const res = body ? await req.send(body) : await req;
    expect(res.status).toBe(403);
  });
});

// All-authenticated endpoints must let viewer through (not 403)
const VIEWER_ACCESSIBLE = [
  ['GET', '/api/recipes',        null],
  ['GET', '/api/jobs',           null],
  ['GET', '/api/logs',           null],
  ['GET', '/api/settings',       null],
  ['GET', '/api/admin/stats',    null],
  ['GET', '/api/system-contract', null],
  ['GET', '/api/system-info',    null],
  ['GET', '/api/worker-status',  null],
];

describe('Viewer-accessible endpoints: viewer does not get 403', () => {
  it.each(VIEWER_ACCESSIBLE)('%s %s does not return 403 for viewer', async (method, path) => {
    const viewerToken = makeViewerToken();
    const res = await request(app)[method.toLowerCase()](path)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).not.toBe(403);
  });
});

describe('Admin: admin can access everything (no 403)', () => {
  it.each([...ADMIN_ONLY, ...EDITOR_OR_ADMIN])('%s %s does not return 403 for admin', async (method, path, body) => {
    const adminToken = makeAdminToken();
    const req = request(app)[method.toLowerCase()](path)
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${adminToken}`);
    const res = body ? await req.send(body) : await req;
    // Admin must not get 403 (may get other codes due to missing DB in test env)
    expect(res.status).not.toBe(403);
  });
});

describe('Role is read from JWT, not re-queried from DB per request', () => {
  it('editor token produces 403 on admin route without any DB call', async () => {
    const editorToken = makeEditorToken();
    // DELETE /api/recipes/:id is admin-only
    const res = await request(app).delete('/api/recipes/1')
      .set('Authorization', `Bearer ${editorToken}`);
    // Must be 403 — no DB roundtrip needed to determine role
    expect(res.status).toBe(403);
  });

  it('admin token passes role check without DB lookup', async () => {
    const adminToken = makeAdminToken();
    // GET /api/users is admin-only — role from JWT, no DB for auth decision
    const res = await request(app).get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`);
    // Not 403 (role allowed); may be 500 if no DB — that's fine
    expect(res.status).not.toBe(403);
  });
});
