import { describe, it, expect, beforeAll } from 'vitest';
import { getApp, authed } from '../helpers/server.js';

let app, a;
beforeAll(async () => {
  app = await getApp();
  a = authed(app);
});

describe('POST /api/settings input validation', () => {
  it('rejects non-array settings body', async () => {
    const res = await a.post('/api/settings').send({ settings: 'not-an-array' });
    expect(res.status).toBe(400);
  });

  it('rejects unknown setting key', async () => {
    const res = await a.post('/api/settings')
      .send({ settings: [{ key: 'unknown_key', value: 'value' }] });
    expect(res.status).toBe(400);
  });

  it('rejects value exceeding 500 chars', async () => {
    const res = await a.post('/api/settings')
      .send({ settings: [{ key: 'ollama_model', value: 'x'.repeat(501) }] });
    expect(res.status).toBe(400);
  });

  it('rejects SSRF URL for ollama_url', async () => {
    const res = await a.post('/api/settings')
      .send({ settings: [{ key: 'ollama_url', value: 'http://169.254.169.254/' }] });
    expect(res.status).toBe(400);
  });

  it('rejects https URL for ollama_url', async () => {
    const res = await a.post('/api/settings')
      .send({ settings: [{ key: 'ollama_url', value: 'https://localhost:11434/' }] });
    expect(res.status).toBe(400);
  });

  it('accepts valid ollama_model update', async () => {
    const res = await a.post('/api/settings')
      .send({ settings: [{ key: 'ollama_model', value: 'llama3' }] });
    // 200 if DB available, 500 if not — but NOT 400
    expect(res.status).not.toBe(400);
  });

  it('accepts ai_provider set to ollama', async () => {
    const res = await a.post('/api/settings')
      .send({ settings: [{ key: 'ai_provider', value: 'ollama' }] });
    expect(res.status).not.toBe(400);
  });

  it('accepts ai_provider set to claude', async () => {
    const res = await a.post('/api/settings')
      .send({ settings: [{ key: 'ai_provider', value: 'claude' }] });
    expect(res.status).not.toBe(400);
  });

  it('accepts ai_provider set to openai', async () => {
    const res = await a.post('/api/settings')
      .send({ settings: [{ key: 'ai_provider', value: 'openai' }] });
    expect(res.status).not.toBe(400);
  });

  it('accepts ai_provider set to gemini', async () => {
    const res = await a.post('/api/settings')
      .send({ settings: [{ key: 'ai_provider', value: 'gemini' }] });
    expect(res.status).not.toBe(400);
  });

  it('accepts claude_model update', async () => {
    const res = await a.post('/api/settings')
      .send({ settings: [{ key: 'claude_model', value: 'claude-sonnet-4-5' }] });
    expect(res.status).not.toBe(400);
  });

  it('accepts openai_model update', async () => {
    const res = await a.post('/api/settings')
      .send({ settings: [{ key: 'openai_model', value: 'gpt-4o' }] });
    expect(res.status).not.toBe(400);
  });

  it('accepts gemini_model update', async () => {
    const res = await a.post('/api/settings')
      .send({ settings: [{ key: 'gemini_model', value: 'gemini-1.5-pro' }] });
    expect(res.status).not.toBe(400);
  });

  it('accepts log_retention_days update', async () => {
    const res = await a.post('/api/settings')
      .send({ settings: [{ key: 'log_retention_days', value: '30' }] });
    expect(res.status).not.toBe(400);
  });

  it('skips sensitive key placeholder value without error', async () => {
    // Sending "•••••" for a sensitive key should be silently skipped (not 400)
    const res = await a.post('/api/settings')
      .send({ settings: [{ key: 'claude_api_key', value: '•••••' }] });
    expect(res.status).not.toBe(400);
  });

  it('rejects admin_password_hash as a known key', async () => {
    // admin_password_hash is NOT in KNOWN_SETTING_KEYS — it must be rejected
    const res = await a.post('/api/settings')
      .send({ settings: [{ key: 'admin_password_hash', value: 'anything' }] });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/admin/stats', () => {
  it('returns 401 without token', async () => {
    const { default: request } = await import('supertest');
    const res = await request(app).get('/api/admin/stats');
    expect(res.status).toBe(401);
  });

  it('returns stats object or 500 (DB required)', async () => {
    const res = await a.get('/api/admin/stats');
    // 200 with stats or 500 if no DB
    if (res.status === 200) {
      expect(res.body).toHaveProperty('recipes');
      expect(res.body).toHaveProperty('jobs');
      expect(res.body).toHaveProperty('logs');
      expect(res.body.recipes).toHaveProperty('total');
      expect(res.body.recipes).toHaveProperty('draft');
      expect(res.body.recipes).toHaveProperty('final');
    } else {
      expect(res.status).toBe(500);
    }
  });
});

describe('DELETE /api/logs', () => {
  it('returns 401 without token', async () => {
    const { default: request } = await import('supertest');
    const res = await request(app).delete('/api/logs').send({ days: 30 });
    expect(res.status).toBe(401);
  });

  it('returns 400 when days param is missing', async () => {
    const res = await a.delete('/api/logs').send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when days is not a positive integer', async () => {
    const res = await a.delete('/api/logs').send({ days: -1 });
    expect(res.status).toBe(400);
  });

  it('returns 400 when days is 0', async () => {
    const res = await a.delete('/api/logs').send({ days: 0 });
    expect(res.status).toBe(400);
  });

  it('returns 200 or 500 (DB required) for valid days value', async () => {
    const res = await a.delete('/api/logs').send({ days: 90 });
    expect([200, 500]).toContain(res.status);
  });
});

describe('POST /api/import', () => {
  it('returns 401 without token', async () => {
    const { default: request } = await import('supertest');
    const res = await request(app).post('/api/import').send({ recipes: [] });
    expect(res.status).toBe(401);
  });

  it('returns 400 when no valid arrays provided', async () => {
    const res = await a.post('/api/import').send({ recipes: 'not-an-array' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when body has no valid array fields at all', async () => {
    const res = await a.post('/api/import').send({ notrecipes: 'whatever' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when recipes array exceeds 1000 items', async () => {
    const recipes = Array.from({ length: 1001 }, (_, i) => ({ recipe_id: i + 1 }));
    const res = await a.post('/api/import').send({ recipes });
    expect(res.status).toBe(400);
  });

  it('returns 200 or 500 (DB required) for valid recipes import payload', async () => {
    const res = await a.post('/api/import').send({
      recipes: [{ title: 'Test Recipe', status: 'draft' }],
    });
    expect([200, 500]).toContain(res.status);
  });

  it('returns 200 or 500 (DB required) for settings-only import', async () => {
    const res = await a.post('/api/import').send({
      settings: [{ key: 'ollama_model', value: 'llama3' }],
    });
    expect([200, 500]).toContain(res.status);
  });

  it('skips api keys in settings import (security boundary)', async () => {
    const res = await a.post('/api/import').send({
      settings: [{ key: 'claude_api_key', value: 'sk-ant-test' }],
    });
    // Should not 400 — key is skipped, not rejected
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.settings.skipped).toBeGreaterThanOrEqual(1);
    }
  });

  it('returns 403 for editor', async () => {
    const { authedAs } = await import('../helpers/server.js');
    const editor = authedAs(app, 'editor');
    const res = await editor.post('/api/import').send({ recipes: [] });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/system-info', () => {
  it('returns 401 without token', async () => {
    const { default: request } = await import('supertest');
    const res = await request(app).get('/api/system-info');
    expect(res.status).toBe(401);
  });

  it('returns system info with valid token', async () => {
    const res = await a.get('/api/system-info');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('allowedOrigins');
    expect(Array.isArray(res.body.allowedOrigins)).toBe(true);
  });
});

describe('POST /api/health-check-ai', () => {
  it('returns 401 without token', async () => {
    const { default: request } = await import('supertest');
    const res = await request(app).post('/api/health-check-ai')
      .send({ provider: 'ollama', url: 'http://localhost:11434', model: 'llama3' });
    expect(res.status).toBe(401);
  });

  it('returns 400 for SSRF URL when provider is ollama', async () => {
    const res = await a.post('/api/health-check-ai')
      .send({ provider: 'ollama', url: 'http://169.254.169.254/', model: 'llama3' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for https ollama URL', async () => {
    const res = await a.post('/api/health-check-ai')
      .send({ provider: 'ollama', url: 'https://localhost:11434/', model: 'llama3' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for unknown provider', async () => {
    const res = await a.post('/api/health-check-ai')
      .send({ provider: 'unknownprovider' });
    expect(res.status).toBe(400);
  });

  // External providers read keys from DB — these will fail at connection level (not auth)
  it('returns non-401 for claude provider (key from DB, not request)', async () => {
    const res = await a.post('/api/health-check-ai').send({ provider: 'claude' });
    // Should not be 401 (auth passes); will be 503 (no key) or 500/200 depending on env
    expect(res.status).not.toBe(401);
  });

  it('returns non-401 for openai provider', async () => {
    const res = await a.post('/api/health-check-ai').send({ provider: 'openai' });
    expect(res.status).not.toBe(401);
  });

  it('returns non-401 for gemini provider', async () => {
    const res = await a.post('/api/health-check-ai').send({ provider: 'gemini' });
    expect(res.status).not.toBe(401);
  });
});

describe('GET /api/system-contract', () => {
  it('returns 401 without token', async () => {
    const { default: request } = await import('supertest');
    const res = await request(app).get('/api/system-contract');
    expect(res.status).toBe(401);
  });

  it('returns contract and source field with valid token', async () => {
    const res = await a.get('/api/system-contract');
    // 200 from hardcoded default if no DB, or 200 from DB if available
    expect([200]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty('contract');
      expect(typeof res.body.contract).toBe('string');
      expect(res.body.contract.length).toBeGreaterThan(0);
      expect(res.body).toHaveProperty('source');
      expect(['default', 'custom']).toContain(res.body.source);
    }
  });
});

describe('PUT /api/system-contract', () => {
  it('returns 401 without token', async () => {
    const { default: request } = await import('supertest');
    const res = await request(app).put('/api/system-contract')
      .send({ contract: 'new contract' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for editor', async () => {
    const { authedAs } = await import('../helpers/server.js');
    const editor = authedAs(app, 'editor');
    const res = await editor.put('/api/system-contract')
      .send({ contract: 'new contract' });
    expect(res.status).toBe(403);
  });

  it('returns 400 when contract is missing', async () => {
    const res = await a.put('/api/system-contract').send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when contract is not a string', async () => {
    const res = await a.put('/api/system-contract').send({ contract: 123 });
    expect(res.status).toBe(400);
  });

  it('returns 400 when contract exceeds 100000 chars', async () => {
    const res = await a.put('/api/system-contract')
      .send({ contract: 'x'.repeat(100001) });
    expect(res.status).toBe(400);
  });

  it('returns 200 or 500 (DB required) for valid contract', async () => {
    const res = await a.put('/api/system-contract')
      .send({ contract: 'You are an expert chef. Return JSON.' });
    expect([200, 500]).toContain(res.status);
  });
});

describe('DELETE /api/system-contract', () => {
  it('returns 401 without token', async () => {
    const { default: request } = await import('supertest');
    const res = await request(app).delete('/api/system-contract');
    expect(res.status).toBe(401);
  });

  it('returns 403 for editor', async () => {
    const { authedAs } = await import('../helpers/server.js');
    const editor = authedAs(app, 'editor');
    const res = await editor.delete('/api/system-contract');
    expect(res.status).toBe(403);
  });

  it('returns 200 or 500 (DB required) for admin', async () => {
    const res = await a.delete('/api/system-contract');
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('source', 'default');
    }
  });
});

describe('GET /api/export', () => {
  it('returns 401 without token', async () => {
    const { default: request } = await import('supertest');
    const res = await request(app).get('/api/export');
    expect(res.status).toBe(401);
  });

  it('returns 403 for editor', async () => {
    const { authedAs } = await import('../helpers/server.js');
    const editor = authedAs(app, 'editor');
    const res = await editor.get('/api/export');
    expect(res.status).toBe(403);
  });

  it('returns 200 or 500 (DB required) for admin', async () => {
    const res = await a.get('/api/export');
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty('recipes');
      expect(res.body).toHaveProperty('settings');
      expect(Array.isArray(res.body.settings)).toBe(true);
      // Each setting must have both key and value fields
      if (res.body.settings.length > 0) {
        expect(res.body.settings[0]).toHaveProperty('key');
        expect(res.body.settings[0]).toHaveProperty('value');
      }
      // API keys must NOT appear in export
      const exportText = JSON.stringify(res.body);
      expect(exportText).not.toContain('claude_api_key');
      expect(exportText).not.toContain('openai_api_key');
      expect(exportText).not.toContain('gemini_api_key');
      expect(exportText).not.toContain('admin_password_hash');
    }
  });
});

describe('POST /api/settings role guard', () => {
  it('returns 403 for editor trying to save settings', async () => {
    const { authedAs } = await import('../helpers/server.js');
    const editor = authedAs(app, 'editor');
    const res = await editor.post('/api/settings')
      .send({ settings: [{ key: 'ollama_model', value: 'llama3' }] });
    expect(res.status).toBe(403);
  });

  it('returns 403 for viewer trying to save settings', async () => {
    const { authedAs } = await import('../helpers/server.js');
    const viewer = authedAs(app, 'viewer');
    const res = await viewer.post('/api/settings')
      .send({ settings: [{ key: 'ollama_model', value: 'llama3' }] });
    expect(res.status).toBe(403);
  });
});
