import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getApp, authed } from '../helpers/server.js';

let app;
beforeAll(async () => { app = await getApp(); });

describe('SSRF prevention on POST /api/settings', () => {
  const cases = [
    ['AWS metadata',       'http://169.254.169.254/latest/meta-data/'],
    ['GCP metadata',       'http://metadata.google.internal:11434/'],
    ['arbitrary external', 'http://evil.example.com:11434/api/generate'],
    ['https disallowed',   'https://localhost:11434/api/generate'],
    ['wrong port',         'http://localhost:8080/api/generate'],
    ['localhost port 80',  'http://localhost:80/'],
    ['file protocol',      'file:///etc/passwd'],
    ['invalid URL',        'not-a-url'],
  ];

  it.each(cases)('rejects %s URL', async (_, url) => {
    const a = authed(app);
    const res = await a.post('/api/settings')
      .send({ settings: [{ key: 'ollama_url', value: url }] });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('accepts a valid Ollama URL', async () => {
    const a = authed(app);
    const res = await a.post('/api/settings')
      .send({ settings: [{ key: 'ollama_url', value: 'http://localhost:11434/api/generate' }] });
    // 200 if DB available, 500 if not — but NOT 400
    expect(res.status).not.toBe(400);
  });
});

describe('SSRF prevention on POST /api/health-check-ai', () => {
  it('rejects AWS metadata URL', async () => {
    const a = authed(app);
    const res = await a.post('/api/health-check-ai')
      .send({ url: 'http://169.254.169.254/', model: 'llama3' });
    expect(res.status).toBe(400);
  });

  it('rejects external host', async () => {
    const a = authed(app);
    const res = await a.post('/api/health-check-ai')
      .send({ url: 'http://attacker.example.com:11434/', model: 'llama3' });
    expect(res.status).toBe(400);
  });
});
