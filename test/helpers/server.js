import { afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// DB-dependent tests only run when TEST_WITH_DB=true is explicitly set.
// In CI this is configured automatically. Locally, set it if you have a test DB.
export const dbAvailable = process.env.TEST_WITH_DB === 'true';

let _serverModule = null;

export async function getApp() {
  if (_serverModule) return _serverModule.app;
  _serverModule = await import('../../server/index.js');
  if (dbAvailable) {
    try { await _serverModule.initDb(); } catch (e) { console.warn('Test DB unavailable:', e.message); }
  }
  afterAll(() => _serverModule.pool.end().catch(() => {}));
  return _serverModule.app;
}

export function makeToken(payload = {}) {
  const defaults = { user_id: 1, username: 'admin', role: 'admin' };
  return jwt.sign({ ...defaults, ...payload }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

export function makeAdminToken() {
  return makeToken({ user_id: 1, username: 'admin', role: 'admin' });
}

export function makeEditorToken() {
  return makeToken({ user_id: 2, username: 'editor', role: 'editor' });
}

export function makeViewerToken() {
  return makeToken({ user_id: 3, username: 'viewer', role: 'viewer' });
}

export function authed(app, tokenFn = makeAdminToken) {
  const token = tokenFn();
  return {
    get: (url) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url) => request(app).post(url).set('Authorization', `Bearer ${token}`),
    put: (url) => request(app).put(url).set('Authorization', `Bearer ${token}`),
    delete: (url) => request(app).delete(url).set('Authorization', `Bearer ${token}`),
  };
}

export function authedAs(app, role) {
  if (role === 'editor') return authed(app, makeEditorToken);
  if (role === 'viewer') return authed(app, makeViewerToken);
  return authed(app, makeAdminToken);
}
