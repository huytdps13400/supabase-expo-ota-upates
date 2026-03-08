/**
 * Fingerprint-based runtime version generation.
 *
 * Uses @expo/fingerprint when available, otherwise falls back to
 * hashing key native config files.
 */

import * as path from 'path';
import * as crypto from 'crypto';
import * as fs from 'fs';

/**
 * Generate a fingerprint hash of the native project.
 * Uses @expo/fingerprint if available, otherwise hashes key config files.
 */
export async function generateFingerprint(
  projectRoot?: string
): Promise<string | null> {
  const root = projectRoot ?? process.cwd();

  // Try using @expo/fingerprint (optional dependency)
  try {
    const { createFingerprintAsync } = require('@expo/fingerprint');
    const fingerprint = await createFingerprintAsync(root);
    return fingerprint.hash;
  } catch {
    // @expo/fingerprint not installed, use fallback
  }

  return generateFallbackFingerprint(root);
}

/**
 * Fallback fingerprint based on key configuration files.
 */
function generateFallbackFingerprint(root: string): string | null {
  const filesToHash = [
    'app.json',
    'app.config.js',
    'app.config.ts',
    'package.json',
    'ios/Podfile.lock',
    'android/app/build.gradle',
  ];

  const hash = crypto.createHash('sha256');
  let hasContent = false;

  for (const file of filesToHash) {
    const filePath = path.join(root, file);
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        hash.update(content);
        hasContent = true;
      }
    } catch {
      // Skip unreadable files
    }
  }

  if (!hasContent) return null;

  // Return first 16 chars of hash for readability
  return hash.digest('hex').slice(0, 16);
}

/**
 * Check if @expo/fingerprint is available.
 */
export function isFingerprintAvailable(): boolean {
  try {
    require.resolve('@expo/fingerprint');
    return true;
  } catch {
    return false;
  }
}
