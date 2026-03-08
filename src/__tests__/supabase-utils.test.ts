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

  it('should call RPC endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { total_devices: 100, pending: 10, applied: 85, failed: 5 },
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
      pending: 10,
      applied: 85,
      failed: 5,
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
