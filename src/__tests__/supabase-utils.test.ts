/**
 * Tests for supabase utility functions (listOtaUpdates, updateOtaUpdate, getUpdateStats).
 * These test the URL/header construction logic by mocking fetch.
 */

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

import {
  listOtaUpdates,
  updateOtaUpdate,
  getUpdateStats,
  fetchWithRetry,
  insertRollbackDirective,
  clearRollbackDirectives,
} from '../utils/supabase';

describe('listOtaUpdates', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should build correct URL with all filters', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    await listOtaUpdates('https://test.supabase.co', 'test-key', {
      channel: 'PROD',
      platform: 'ios',
      isActive: true,
      limit: 10,
      offset: 5,
    });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/rest/v1/ota_updates');
    expect(calledUrl).toContain('channel=eq.PROD');
    expect(calledUrl).toContain('platform=eq.ios');
    expect(calledUrl).toContain('is_active=eq.true');
    expect(calledUrl).toContain('limit=10');
    expect(calledUrl).toContain('offset=5');
    expect(calledUrl).toContain('order=created_at.desc');
  });

  it('should include auth headers', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    await listOtaUpdates('https://test.supabase.co', 'my-key', {});

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe('Bearer my-key');
    expect(headers.apikey).toBe('my-key');
  });

  it('should throw on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });

    await expect(
      listOtaUpdates('https://test.supabase.co', 'bad-key', {})
    ).rejects.toThrow('List ota_updates failed 401');
  });

  it('should build URL without optional filters', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    await listOtaUpdates('https://test.supabase.co', 'test-key', {});

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).not.toContain('channel=');
    expect(calledUrl).not.toContain('platform=');
    expect(calledUrl).not.toContain('is_active=');
  });
});

describe('updateOtaUpdate', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should PATCH correct URL with update ID', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{}],
    });

    await updateOtaUpdate('https://test.supabase.co', 'test-key', 'abc-123', {
      is_active: false,
    });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('id=eq.abc-123');

    const options = mockFetch.mock.calls[0][1];
    expect(options.method).toBe('PATCH');
    expect(JSON.parse(options.body)).toEqual({ is_active: false });
  });

  it('should throw on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => 'Not found',
    });

    await expect(
      updateOtaUpdate('https://test.supabase.co', 'test-key', 'bad-id', {
        is_active: true,
      })
    ).rejects.toThrow('Update ota_updates failed 404');
  });
});

describe('getUpdateStats', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should call RPC endpoint and normalize columns', async () => {
    // The get_update_stats RPC returns these column names.
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          total_devices: 100,
          successful_updates: 85,
          failed_updates: 5,
          pending_updates: 10,
        },
      ],
    });

    const stats = await getUpdateStats(
      'https://test.supabase.co',
      'test-key',
      'update-123'
    );

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/rest/v1/rpc/get_update_stats');
    expect(stats).toEqual({
      total_devices: 100,
      applied: 85,
      failed: 5,
      pending: 10,
    });
  });

  it('should return null on error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const stats = await getUpdateStats(
      'https://test.supabase.co',
      'test-key',
      'bad-id'
    );
    expect(stats).toBeNull();
  });

  it('should return null on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const stats = await getUpdateStats(
      'https://test.supabase.co',
      'test-key',
      'any-id'
    );
    expect(stats).toBeNull();
  });
});

describe('fetchWithRetry', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('returns immediately on a successful response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    const res = await fetchWithRetry('https://x', {});
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries on retryable 5xx then succeeds', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const res = await fetchWithRetry('https://x', {}, { delayMs: 1 });
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-retryable status (4xx)', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const res = await fetchWithRetry('https://x', {}, { delayMs: 1 });
    expect(res.status).toBe(404);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries on thrown network errors up to the limit', async () => {
    mockFetch.mockRejectedValue(new Error('boom'));

    await expect(
      fetchWithRetry('https://x', {}, { retries: 3, delayMs: 1 })
    ).rejects.toThrow('boom');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});

describe('insertRollbackDirective', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('POSTs a rollBackToEmbedded row to ota_directives', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 201 });

    await insertRollbackDirective('https://test.supabase.co', 'key', {
      channel: 'PROD',
      platform: 'ios',
      runtimeVersion: '1.0.0',
    });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/rest/v1/ota_directives');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      channel: 'PROD',
      platform: 'ios',
      runtime_version: '1.0.0',
      type: 'rollBackToEmbedded',
      is_active: true,
    });
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => 'bad',
    });

    await expect(
      insertRollbackDirective('https://test.supabase.co', 'key', {
        channel: 'PROD',
        platform: 'ios',
        runtimeVersion: '1.0.0',
      })
    ).rejects.toThrow('Insert ota_directives failed 400');
  });
});

describe('clearRollbackDirectives', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('PATCHes active directives to is_active=false', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });

    await clearRollbackDirectives(
      'https://test.supabase.co',
      'key',
      'PROD',
      'android'
    );

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('channel=eq.PROD');
    expect(url).toContain('platform=eq.android');
    expect(url).toContain('is_active=eq.true');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ is_active: false });
  });
});
