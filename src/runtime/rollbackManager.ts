/**
 * Crash detection and auto-rollback manager for OTA updates.
 *
 * Uses a lightweight storage approach that works with or without
 * @react-native-async-storage/async-storage. Falls back to
 * expo-updates' built-in error recovery when possible.
 */

import * as Updates from 'expo-updates';

const ROLLBACK_KEY = '@supabase_ota_rollback';
const CRASH_COUNT_KEY = '@supabase_ota_crash_count';
const MAX_CRASH_COUNT = 3;

export interface RollbackState {
  pendingUpdateId: string | null;
  crashCount: number;
  lastAppliedAt: string | null;
}

// Lightweight storage abstraction
let storage: {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
} | null = null;

// In-memory fallback
const memoryStore = new Map<string, string>();

function getStorage() {
  if (storage) return storage;

  try {
    // Try to use AsyncStorage if available
    const AsyncStorage =
      require('@react-native-async-storage/async-storage').default;
    storage = AsyncStorage;
  } catch {
    // Fallback to in-memory storage
    storage = {
      getItem: async (key: string) => memoryStore.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        memoryStore.set(key, value);
      },
      removeItem: async (key: string) => {
        memoryStore.delete(key);
      },
    };
  }

  return storage!;
}

export class RollbackManager {
  /**
   * Mark that an update is about to be applied.
   * Call this before Updates.reloadAsync().
   */
  static async markUpdatePending(updateId: string): Promise<void> {
    const store = getStorage();
    const state: RollbackState = {
      pendingUpdateId: updateId,
      crashCount: 0,
      lastAppliedAt: new Date().toISOString(),
    };
    await store.setItem(ROLLBACK_KEY, JSON.stringify(state));
  }

  /**
   * Confirm that the current update loaded successfully.
   * Call this early in the app lifecycle (e.g., in App root useEffect).
   */
  static async confirmUpdateSuccess(): Promise<void> {
    const store = getStorage();
    await store.removeItem(ROLLBACK_KEY);
    await store.removeItem(CRASH_COUNT_KEY);
  }

  /**
   * Increment the crash counter. Called on app start to detect repeated crashes.
   */
  static async incrementCrashCount(): Promise<number> {
    const store = getStorage();
    const raw = await store.getItem(CRASH_COUNT_KEY);
    const count = (raw ? parseInt(raw, 10) : 0) + 1;
    await store.setItem(CRASH_COUNT_KEY, String(count));
    return count;
  }

  /**
   * Check if the app should rollback based on crash history.
   * Returns true if crash count exceeds threshold.
   */
  static async shouldRollback(): Promise<boolean> {
    const store = getStorage();
    const raw = await store.getItem(ROLLBACK_KEY);
    if (!raw) return false;

    const crashCount = await this.incrementCrashCount();
    return crashCount >= MAX_CRASH_COUNT;
  }

  /**
   * Perform rollback by reloading the app.
   * expo-updates will fall back to the embedded bundle if the current
   * update is problematic.
   */
  static async performRollback(): Promise<void> {
    const store = getStorage();
    await store.removeItem(ROLLBACK_KEY);
    await store.removeItem(CRASH_COUNT_KEY);

    // Reload the app - expo-updates handles the recovery
    await Updates.reloadAsync();
  }

  /**
   * Get current rollback state.
   */
  static async getState(): Promise<RollbackState> {
    const store = getStorage();
    const raw = await store.getItem(ROLLBACK_KEY);
    const crashRaw = await store.getItem(CRASH_COUNT_KEY);

    if (!raw) {
      return {
        pendingUpdateId: null,
        crashCount: crashRaw ? parseInt(crashRaw, 10) : 0,
        lastAppliedAt: null,
      };
    }

    try {
      const state = JSON.parse(raw) as RollbackState;
      state.crashCount = crashRaw ? parseInt(crashRaw, 10) : 0;
      return state;
    } catch {
      return {
        pendingUpdateId: null,
        crashCount: 0,
        lastAppliedAt: null,
      };
    }
  }

  /**
   * Reset all rollback state.
   */
  static async reset(): Promise<void> {
    const store = getStorage();
    await store.removeItem(ROLLBACK_KEY);
    await store.removeItem(CRASH_COUNT_KEY);
  }

  /**
   * Initialize rollback detection. Call this at app startup.
   * Automatically performs rollback if crash threshold is exceeded.
   */
  static async initialize(): Promise<{
    didRollback: boolean;
    state: RollbackState;
  }> {
    const shouldRollback = await this.shouldRollback();

    if (shouldRollback) {
      await this.performRollback();
      return { didRollback: true, state: await this.getState() };
    }

    return { didRollback: false, state: await this.getState() };
  }
}
