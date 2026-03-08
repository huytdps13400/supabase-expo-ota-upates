/**
 * React hook for managing OTA updates with expo-updates.
 *
 * Provides a simple API for checking, downloading, and applying
 * OTA updates with progress tracking and rollback support.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import * as Updates from 'expo-updates';
import { RollbackManager } from './rollbackManager';

export type OtaUpdateStatus =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'ready'
  | 'error';

export interface OtaUpdateInfo {
  id: string;
  createdAt?: string;
  manifest: any;
  isForceUpdate?: boolean;
  message?: string;
  rolloutPercentage?: number;
}

export interface UseOtaUpdateOptions {
  /** Check for updates on mount (default: false) */
  checkOnMount?: boolean;
  /** Auto download when update found (default: false) */
  autoDownload?: boolean;
  /** Auto apply (reload) when downloaded (default: false) */
  autoApply?: boolean;
  /** Callback when update is available */
  onUpdateAvailable?: (info: OtaUpdateInfo) => void;
  /** Callback when update is downloaded and ready */
  onUpdateReady?: (info: OtaUpdateInfo) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

export interface UseOtaUpdateResult {
  /** Current status of the update process */
  status: OtaUpdateStatus;
  /** Download progress (0 to 1) */
  progress: number;
  /** Error if status is 'error' */
  error: Error | null;
  /** Info about available/downloaded update */
  updateInfo: OtaUpdateInfo | null;
  /** Whether an update is available for download */
  isUpdateAvailable: boolean;
  /** Whether an update has been downloaded and is ready to apply */
  isUpdateReady: boolean;
  /** Check for available updates */
  checkForUpdate: () => Promise<boolean>;
  /** Download the available update */
  downloadUpdate: () => Promise<boolean>;
  /** Apply the downloaded update (reloads the app) */
  applyUpdate: () => Promise<void>;
}

function extractUpdateInfo(manifest: any): OtaUpdateInfo {
  const extra = manifest?.extra ?? {};
  return {
    id: manifest?.id ?? '',
    createdAt: manifest?.createdAt,
    manifest,
    isForceUpdate: extra.shouldForceUpdate ?? false,
    message: extra.message,
    rolloutPercentage: extra.rolloutPercentage,
  };
}

export function useOtaUpdate(
  options: UseOtaUpdateOptions = {}
): UseOtaUpdateResult {
  const {
    checkOnMount = false,
    autoDownload = false,
    autoApply = false,
    onUpdateAvailable,
    onUpdateReady,
    onError,
  } = options;

  const [status, setStatus] = useState<OtaUpdateStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const [updateInfo, setUpdateInfo] = useState<OtaUpdateInfo | null>(null);
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [isUpdateReady, setIsUpdateReady] = useState(false);

  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleError = useCallback(
    (err: Error) => {
      if (!mountedRef.current) return;
      setStatus('error');
      setError(err);
      onError?.(err);
    },
    [onError]
  );

  const checkForUpdate = useCallback(async (): Promise<boolean> => {
    try {
      setStatus('checking');
      setError(null);

      const result = await Updates.checkForUpdateAsync();

      if (!mountedRef.current) return false;

      if (result.isAvailable) {
        const info = extractUpdateInfo(result.manifest);
        setUpdateInfo(info);
        setIsUpdateAvailable(true);
        setStatus('idle');
        onUpdateAvailable?.(info);

        if (autoDownload) {
          // Don't await - let it proceed asynchronously
          downloadUpdate();
        }

        return true;
      }

      setStatus('idle');
      return false;
    } catch (err) {
      handleError(err instanceof Error ? err : new Error(String(err)));
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDownload, onUpdateAvailable, handleError]);

  const downloadUpdate = useCallback(async (): Promise<boolean> => {
    try {
      setStatus('downloading');
      setProgress(0);

      // Set up progress listener if available
      let subscription: any = null;
      try {
        const updatesModule = Updates as any;
        if (typeof updatesModule.addListener === 'function') {
          subscription = updatesModule.addListener((event: any) => {
            if (!mountedRef.current) return;
            if (event.type === 'downloadProgress' && event.body?.progress) {
              setProgress(event.body.progress);
            }
          });
        }
      } catch {
        // addListener not available in this version
      }

      const result = await Updates.fetchUpdateAsync();

      // Clean up listener
      if (subscription?.remove) {
        subscription.remove();
      }

      if (!mountedRef.current) return false;

      if (result.isNew) {
        const info = extractUpdateInfo(result.manifest);
        setUpdateInfo(info);
        setIsUpdateReady(true);
        setProgress(1);
        setStatus('ready');
        onUpdateReady?.(info);

        if (autoApply) {
          await applyUpdate();
        }

        return true;
      }

      setStatus('idle');
      return false;
    } catch (err) {
      handleError(err instanceof Error ? err : new Error(String(err)));
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoApply, onUpdateReady, handleError]);

  const applyUpdate = useCallback(async (): Promise<void> => {
    try {
      // Mark update as pending for rollback detection
      if (updateInfo?.id) {
        await RollbackManager.markUpdatePending(updateInfo.id);
      }

      await Updates.reloadAsync();
    } catch (err) {
      handleError(err instanceof Error ? err : new Error(String(err)));
    }
  }, [updateInfo, handleError]);

  // Check on mount if requested
  useEffect(() => {
    if (checkOnMount) {
      checkForUpdate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkOnMount]);

  // Initialize rollback detection on mount
  useEffect(() => {
    RollbackManager.confirmUpdateSuccess().catch(() => {
      // Silently ignore if storage is not available
    });
  }, []);

  return {
    status,
    progress,
    error,
    updateInfo,
    isUpdateAvailable,
    isUpdateReady,
    checkForUpdate,
    downloadUpdate,
    applyUpdate,
  };
}
