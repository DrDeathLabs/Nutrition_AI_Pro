import { describe, it, expect, beforeAll } from 'vitest';
import { getApp, authed, dbAvailable } from '../helpers/server.js';

const describeIfDb = dbAvailable ? describe : describe.skip;

let app, a;
beforeAll(async () => {
  app = await getApp();
  a = authed(app);
});

describeIfDb('POST /api/jobs input validation', () => {
  it('rejects missing goal', async () => {
    const res = await a.post('/api/jobs').send({ amount: 1 });
    expect(res.status).toBe(400);
  });

  it('rejects empty goal', async () => {
    const res = await a.post('/api/jobs').send({ goal: '   ', amount: 1 });
    expect(res.status).toBe(400);
  });

  it('rejects goal exceeding 1000 chars', async () => {
    const res = await a.post('/api/jobs').send({ goal: 'x'.repeat(1001), amount: 1 });
    expect(res.status).toBe(400);
  });

  it('rejects amount < 1', async () => {
    const res = await a.post('/api/jobs').send({ goal: 'test', amount: 0 });
    expect(res.status).toBe(400);
  });

  it('rejects amount > 100', async () => {
    const res = await a.post('/api/jobs').send({ goal: 'test', amount: 101 });
    expect(res.status).toBe(400);
  });

  it('rejects non-integer amount', async () => {
    const res = await a.post('/api/jobs').send({ goal: 'test', amount: 1.5 });
    expect(res.status).toBe(400);
  });

  it('accepts valid job', async () => {
    const res = await a.post('/api/jobs').send({ goal: 'A high-protein breakfast', amount: 1 });
    expect(res.status).toBe(200);
    expect(res.body.id).toBeTruthy();
  });

  it('rejects unknown content_type', async () => {
    const res = await a.post('/api/jobs').send({ goal: 'test', amount: 1, content_type: 'transformation_story' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/content_type/);
  });

  it('accepts content_type=blog_post', async () => {
    const res = await a.post('/api/jobs').send({ goal: 'A high-protein lunch', amount: 1, content_type: 'blog_post' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBeTruthy();
  });

  it('accepts content_type=meal_prep_guide', async () => {
    const res = await a.post('/api/jobs').send({ goal: 'A high-protein breakfast', amount: 1, content_type: 'meal_prep_guide' });
    expect(res.status).toBe(200);
  });

  it('accepts content_type=social_hit', async () => {
    const res = await a.post('/api/jobs').send({ goal: 'test', amount: 1, content_type: 'social_hit' });
    expect(res.status).toBe(200);
  });

  it('accepts content_type=email_newsletter', async () => {
    const res = await a.post('/api/jobs').send({ goal: 'test', amount: 1, content_type: 'email_newsletter' });
    expect(res.status).toBe(200);
  });

  it('defaults to recipe_card when content_type is absent', async () => {
    const res = await a.post('/api/jobs').send({ goal: 'A high-protein dinner', amount: 1 });
    expect(res.status).toBe(200);
    expect(res.body.id).toBeTruthy();
  });
});

describeIfDb('GET /api/jobs', () => {
  it('returns an array', async () => {
    const res = await a.get('/api/jobs');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns content_type field on each job', async () => {
    await a.post('/api/jobs').send({ goal: 'test', amount: 1, content_type: 'blog_post' });
    const res = await a.get('/api/jobs');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('content_type');
  });
});
