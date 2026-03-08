/**
 * Higher-Order Component for wrapping apps with OTA update support.
 *
 * Similar to hot-updater's HotUpdater.wrap(), this provides a simple
 * way to add OTA update checking with a fallback UI.
 *
 * @example
 * ```tsx
 * import { OtaUpdater } from 'supabase-expo-ota-updates/runtime';
 *
 * export default OtaUpdater.wrap({
 *   updateMode: 'auto',
 *   fallback: ({ progress, status }) => (
 *     <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
 *       <Text>{status === 'downloading' ? `${Math.round(progress * 100)}%` : 'Checking...'}</Text>
 *     </View>
 *   ),
 * })(App);
 * ```
 */

import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import {
  useOtaUpdate,
  type OtaUpdateStatus,
  type OtaUpdateInfo,
} from './useOtaUpdate';

export interface FallbackProps {
  status: OtaUpdateStatus;
  progress: number;
  error: Error | null;
}

export interface OtaUpdaterConfig {
  /** Fallback component shown during update check/download */
  fallback?: React.ComponentType<FallbackProps>;
  /** 'auto' applies immediately, 'manual' lets user decide (default: 'auto') */
  updateMode?: 'auto' | 'manual';
  /** Check for updates on mount (default: true) */
  checkOnMount?: boolean;
  /** Callback when update is available (useful in manual mode) */
  onUpdateAvailable?: (info: OtaUpdateInfo) => void;
  /** Callback when update is ready to apply */
  onUpdateReady?: (info: OtaUpdateInfo) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

function DefaultFallback({ status, progress }: FallbackProps) {
  return (
    <View style={styles.overlay}>
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#ffffff" />
        <Text style={styles.statusText}>
          {status === 'downloading' ? 'Updating...' : 'Checking for updates...'}
        </Text>
        {progress > 0 && (
          <View style={styles.progressContainer}>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressBar,
                  { width: `${Math.round(progress * 100)}%` },
                ]}
              />
            </View>
            <Text style={styles.progressText}>
              {Math.round(progress * 100)}%
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function OtaUpdateWrapper<P extends object>({
  WrappedComponent,
  config,
  props,
}: {
  WrappedComponent: React.ComponentType<P>;
  config: OtaUpdaterConfig;
  props: P;
}) {
  const isAutoMode = config.updateMode !== 'manual';

  const { status, progress, error } = useOtaUpdate({
    checkOnMount: config.checkOnMount ?? true,
    autoDownload: isAutoMode,
    autoApply: isAutoMode,
    onUpdateAvailable: config.onUpdateAvailable,
    onUpdateReady: config.onUpdateReady,
    onError: config.onError,
  });

  const FallbackComponent = config.fallback || DefaultFallback;

  const showFallback =
    isAutoMode && (status === 'checking' || status === 'downloading');

  if (showFallback) {
    return (
      <FallbackComponent status={status} progress={progress} error={error} />
    );
  }

  return <WrappedComponent {...props} />;
}

export const OtaUpdater = {
  /**
   * Wrap an app component with OTA update support.
   *
   * @example
   * ```tsx
   * export default OtaUpdater.wrap({ updateMode: 'auto' })(App);
   * ```
   */
  wrap(config: OtaUpdaterConfig = {}) {
    return function wrapComponent<P extends object>(
      WrappedComponent: React.ComponentType<P>
    ) {
      function OtaUpdaterHOC(props: P) {
        return (
          <OtaUpdateWrapper
            WrappedComponent={WrappedComponent}
            config={config}
            props={props}
          />
        );
      }

      const displayName =
        WrappedComponent.displayName || WrappedComponent.name || 'Component';
      OtaUpdaterHOC.displayName = `OtaUpdater(${displayName})`;

      return OtaUpdaterHOC;
    };
  },
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  container: {
    alignItems: 'center',
    padding: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    minWidth: 200,
  },
  statusText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
  },
  progressContainer: {
    alignItems: 'center',
    marginTop: 12,
    width: '100%',
  },
  progressTrack: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 2,
  },
  progressText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 8,
  },
});
