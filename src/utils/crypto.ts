import * as crypto from 'crypto';

/**
 * Encode buffer to base64url format (URL-safe base64)
 */
export function base64Url(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/[=]+$/g, '');
}

/**
 * Calculate SHA-256 hash and encode as base64url
 */
export function sha256Base64Url(buffer: Buffer): string {
  const hash = crypto.createHash('sha256').update(buffer).digest();
  return base64Url(hash);
}

/**
 * Encode path segments for URL safety
 */
export function encodePath(value: string): string {
  return value
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}
