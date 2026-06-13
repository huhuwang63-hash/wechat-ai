import { describe, it, expect } from 'vitest';

const BASE_URL = 'http://localhost:3000';

describe('Miniapp API Integration', () => {
  it('GET /health returns ok', async () => {
    const response = await fetch(`${BASE_URL}/health`);
    expect(response.status).toBe(200);
    const data = await response.json() as { status: string };
    expect(data.status).toBe('ok');
  });

  it('GET /api/miniapp/conversations without auth returns 401', async () => {
    const response = await fetch(`${BASE_URL}/api/miniapp/conversations`);
    expect(response.status).toBe(401);
  });

  it('POST /api/miniapp/login with invalid code returns 400', async () => {
    const response = await fetch(`${BASE_URL}/api/miniapp/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'invalid' }),
    });
    expect(response.status).toBe(400);
  });
});
