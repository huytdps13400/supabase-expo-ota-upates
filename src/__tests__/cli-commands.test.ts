/**
 * Tests for CLI rollback and list commands.
 * Uses env vars instead of jest.mock to avoid bun module mock leaking.
 */

const mockList = jest.fn();
const mockUpdate = jest.fn();

jest.mock('../utils/supabase', () => ({
  listOtaUpdates: (...args: any[]) => mockList(...args),
  updateOtaUpdate: (...args: any[]) => mockUpdate(...args),
}));

const originalEnv = process.env;

beforeEach(() => {
  process.env = {
    ...originalEnv,
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    EXPO_PUBLIC_ENV: 'DEV',
  };
  mockList.mockReset();
  mockUpdate.mockReset();
});

afterAll(() => {
  process.env = originalEnv;
});

describe('rollback command', () => {
  it('should throw if --platform is missing', async () => {
    const { rollbackCommand } = require('../cli/commands/rollback');
    await expect(rollbackCommand([])).rejects.toThrow(
      'Missing required --platform'
    );
  });

  it('should deactivate latest and activate previous', async () => {
    const { rollbackCommand } = require('../cli/commands/rollback');

    // First call: list active updates
    mockList.mockResolvedValueOnce([
      {
        id: 'update-2',
        created_at: '2026-03-08',
        channel: 'DEV',
        platform: 'ios',
        runtime_version: '1.0.0(2)',
        is_active: true,
        launch_asset_key: 'bundle',
      },
    ] as any);

    // Second call: list all for finding previous
    mockList.mockResolvedValueOnce([
      {
        id: 'update-2',
        created_at: '2026-03-08',
        channel: 'DEV',
        platform: 'ios',
        runtime_version: '1.0.0(2)',
        is_active: false,
        launch_asset_key: 'bundle',
      },
      {
        id: 'update-1',
        created_at: '2026-03-07',
        channel: 'DEV',
        platform: 'ios',
        runtime_version: '1.0.0(1)',
        is_active: false,
        launch_asset_key: 'bundle',
      },
    ] as any);

    mockUpdate.mockResolvedValue(undefined);

    await rollbackCommand(['--platform', 'ios', '--channel', 'DEV']);

    // Should deactivate update-2
    expect(mockUpdate).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-key',
      'update-2',
      { is_active: false }
    );

    // Should activate update-1
    expect(mockUpdate).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-key',
      'update-1',
      { is_active: true }
    );
  });

  it('should handle no active updates', async () => {
    const { rollbackCommand } = require('../cli/commands/rollback');

    mockList.mockResolvedValueOnce([]);

    await rollbackCommand(['--platform', 'ios', '--channel', 'DEV']);

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('should rollback to specific update ID with --to', async () => {
    const { rollbackCommand } = require('../cli/commands/rollback');

    mockList.mockResolvedValueOnce([
      {
        id: 'update-3',
        created_at: '2026-03-09',
        channel: 'DEV',
        platform: 'ios',
        runtime_version: '1.0.0(3)',
        is_active: true,
        launch_asset_key: 'bundle',
      },
    ] as any);

    mockUpdate.mockResolvedValue(undefined);

    await rollbackCommand([
      '--platform',
      'ios',
      '--channel',
      'DEV',
      '--to',
      'update-1',
    ]);

    expect(mockUpdate).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-key',
      'update-3',
      { is_active: false }
    );

    expect(mockUpdate).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-key',
      'update-1',
      { is_active: true }
    );
  });
});

describe('list command', () => {
  it('should list updates with default limit', async () => {
    const { listCommand } = require('../cli/commands/list');

    mockList.mockResolvedValueOnce([
      {
        id: 'abc-123',
        created_at: '2026-03-08T10:00:00Z',
        platform: 'ios',
        channel: 'PROD',
        runtime_version: '1.0.0(1)',
        is_active: true,
        rollout_percentage: 100,
        message: 'Test update',
        launch_asset_key: 'bundle',
      },
    ] as any);

    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    await listCommand([]);

    expect(mockList).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-key',
      expect.objectContaining({ limit: 20 })
    );

    logSpy.mockRestore();
  });

  it('should output JSON when --format json', async () => {
    const { listCommand } = require('../cli/commands/list');

    const updates = [
      {
        id: 'abc-123',
        created_at: '2026-03-08T10:00:00Z',
        platform: 'ios',
        channel: 'PROD',
        runtime_version: '1.0.0(1)',
        is_active: true,
      },
    ];

    mockList.mockResolvedValueOnce(updates as any);

    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    await listCommand(['--format', 'json']);

    const jsonOutput = logSpy.mock.calls[0][0];
    expect(JSON.parse(jsonOutput)).toEqual(updates);

    logSpy.mockRestore();
  });

  it('should pass filters from args', async () => {
    const { listCommand } = require('../cli/commands/list');

    mockList.mockResolvedValueOnce([]);

    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    await listCommand([
      '--platform',
      'android',
      '--channel',
      'STAGING',
      '--active',
      '--limit',
      '5',
    ]);

    expect(mockList).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-key',
      expect.objectContaining({
        platform: 'android',
        channel: 'STAGING',
        isActive: true,
        limit: 5,
      })
    );

    logSpy.mockRestore();
  });
});
