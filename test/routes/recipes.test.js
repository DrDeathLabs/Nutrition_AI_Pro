import { describe, it, expect, beforeAll } from 'vitest';
import { getApp, authed, dbAvailable } from '../helpers/server.js';

const describeIfDb = dbAvailable ? describe : describe.skip;

let app, a;
beforeAll(async () => {
  app = await getApp();
  a = authed(app);
});

describeIfDb('GET /api/recipes', () => {
  it('returns paginated data', async () => {
    const res = await a.get('/api/recipes?status=final&page=1&limit=5');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('totalPages');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('returns 400 for invalid status', async () => {
    const res = await a.get('/api/recipes?status=unknown');
    expect(res.status).toBe(400);
  });

  it('caps limit at 100', async () => {
    const res = await a.get('/api/recipes?limit=9999');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(100);
  });
});

describeIfDb('Recipe CRUD lifecycle', () => {
  let recipeId;

  it('POST /api/jobs creates a job', async () => {
    const res = await a.post('/api/jobs').send({ goal: 'test recipe goal', amount: 1 });
    expect(res.status).toBe(200);
    expect(res.body.id).toBeTruthy();
  });

  it('PUT /api/recipes/:id returns 400 for invalid id', async () => {
    const res = await a.put('/api/recipes/0').send({ title: 'T', data: {}, status: 'draft' });
    expect(res.status).toBe(400);
  });

  it('PUT /api/recipes/:id returns 400 for missing title', async () => {
    const res = await a.put('/api/recipes/1').send({ data: {}, status: 'draft' });
    expect(res.status).toBe(400);
  });

  it('DELETE /api/recipes/:id returns 400 for non-integer id', async () => {
    const res = await a.delete('/api/recipes/abc');
    expect(res.status).toBe(400);
  });

  it('POST /api/recipes/bulk rejects invalid action', async () => {
    const res = await a.post('/api/recipes/bulk').send({ ids: [1], action: 'evil' });
    expect(res.status).toBe(400);
  });

  it('POST /api/recipes/bulk rejects empty ids', async () => {
    const res = await a.post('/api/recipes/bulk').send({ ids: [], action: 'delete' });
    expect(res.status).toBe(400);
  });

  it('POST /api/recipes/bulk rejects oversized ids array', async () => {
    const ids = Array.from({ length: 501 }, (_, i) => i + 1);
    const res = await a.post('/api/recipes/bulk').send({ ids, action: 'delete' });
    expect(res.status).toBe(400);
  });
});

describeIfDb('GET /api/export', () => {
  it('returns JSON with recipes and jobs arrays', async () => {
    const res = await a.get('/api/export');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('recipes');
    expect(res.body).toHaveProperty('jobs');
    expect(res.body).toHaveProperty('version');
    expect(Array.isArray(res.body.recipes)).toBe(true);
  });

  it('does not include setting values', async () => {
    const res = await a.get('/api/export');
    const settingsWithValues = (res.body.settings || []).filter(s => s.value !== undefined);
    expect(settingsWithValues).toHaveLength(0);
  });
});
