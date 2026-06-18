/**
 * API Key authentication utilities for MCP server.
 *
 * Per Aliyun MCP security requirements:
 * - When MCP is exposed to non-local addresses, an API key must be configured
 * - The API key must meet minimum length requirements (>= 32 characters)
 * - The API key is validated on every tool call
 *
 * NOTE: createApiKeyValidator() and extractApiKeyFromHeaders() are reserved for
 * future HTTP transport. The current stdio transport is inherently local (pipe
 * between parent and child process) and does not require per-request authentication.
 * These utilities will be wired up when HTTP transport is implemented.
 */

import { timingSafeEqual as cryptoTimingSafeEqual } from 'node:crypto';

/** Minimum required length for API keys */
const MIN_API_KEY_LENGTH = 32;

/**
 * Validates that an API key meets the minimum security requirements.
 *
 * @param apiKey - The API key to validate
 * @throws Error if the API key does not meet requirements
 */
export function validateApiKeyRequirements(apiKey: string): void {
  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error('API key must be a non-empty string');
  }

  if (apiKey.length < MIN_API_KEY_LENGTH) {
    throw new Error(
      `API key must be at least ${MIN_API_KEY_LENGTH} characters long. ` +
      `Current length: ${apiKey.length}. Please use a sufficiently long, random key.`
    );
  }

  // Check for common weak patterns
  if (/^\d+$/.test(apiKey)) {
    throw new Error('API key must not be purely numeric. Use a random alphanumeric key.');
  }

  if (/^(.)\1+$/.test(apiKey)) {
    throw new Error('API key must not be a repeating character. Use a random alphanumeric key.');
  }
}

/**
 * Creates an API key validator function for HTTP transport middleware.
 *
 * RESERVED FOR FUTURE USE: This will be wired up when HTTP transport is added.
 * The current stdio transport does not require per-request authentication.
 *
 * @param configuredKey - The API key configured by the server operator
 * @returns A validator function that checks incoming requests against the configured key
 */
export function createApiKeyValidator(configuredKey: string): (providedKey: string | undefined) => boolean {
  // Validate the configured key meets requirements
  validateApiKeyRequirements(configuredKey);

  return (providedKey: string | undefined): boolean => {
    if (!providedKey) {
      return false;
    }

    // Use Node.js built-in constant-time comparison to prevent timing attacks
    return timingSafeEqual(providedKey, configuredKey);
  };
}

/**
 * Constant-time string comparison using Node.js built-in crypto.timingSafeEqual.
 *
 * @param a - First string
 * @param b - Second string
 * @returns True if strings are equal, false otherwise
 */
function timingSafeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf-8');
  const bBuf = Buffer.from(b, 'utf-8');

  // Handle different lengths without early-exit timing leak
  if (aBuf.length !== bBuf.length) {
    // Compare b against itself to maintain constant time, then return false
    cryptoTimingSafeEqual(bBuf, bBuf);
    return false;
  }

  return cryptoTimingSafeEqual(aBuf, bBuf);
}

/**
 * Extracts API key from various request headers.
 *
 * RESERVED FOR FUTURE USE: This will be wired up when HTTP transport is added.
 *
 * @param headers - Request headers object
 * @returns The extracted API key or undefined
 */
export function extractApiKeyFromHeaders(headers: Record<string, string | string[] | undefined>): string | undefined {
  // Build a lowercase-keyed map for case-insensitive lookup
  const lowerHeaders: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    lowerHeaders[key.toLowerCase()] = value;
  }

  // Check common header names
  const headerNames = ['x-api-key', 'authorization', 'apikey'];

  for (const name of headerNames) {
    const value = lowerHeaders[name];
    if (typeof value === 'string' && value.length > 0) {
      // For Authorization header, extract Bearer token
      if (name === 'authorization' && value.toLowerCase().startsWith('bearer ')) {
        return value.substring(7).trim();
      }
      return value.trim();
    }
  }

  return undefined;
}
