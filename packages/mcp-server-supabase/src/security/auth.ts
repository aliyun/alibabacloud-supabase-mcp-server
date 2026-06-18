/**
 * API Key authentication utilities for MCP server.
 *
 * Per Aliyun MCP security requirements:
 * - When MCP is exposed to non-local addresses, an API key must be configured
 * - The API key must meet minimum length requirements (>= 32 characters)
 * - The API key is validated on every tool call
 */

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
 * Creates an API key validator function that can be used as MCP middleware.
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

    // Constant-time comparison to prevent timing attacks
    return timingSafeEqual(providedKey, configuredKey);
  };
}

/**
 * Constant-time string comparison to prevent timing attacks.
 *
 * @param a - First string
 * @param b - Second string
 * @returns True if strings are equal, false otherwise
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do a comparison to maintain constant time
    let result = a.length ^ b.length;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      result |= a.charCodeAt(i) ^ (b.charCodeAt(i) ?? 0);
    }
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Extracts API key from various request headers.
 *
 * @param headers - Request headers object
 * @returns The extracted API key or undefined
 */
export function extractApiKeyFromHeaders(headers: Record<string, string | string[] | undefined>): string | undefined {
  // Check common header names
  const headerNames = ['x-api-key', 'authorization', 'apikey'];

  for (const name of headerNames) {
    const value = headers[name] ?? headers[name.toLowerCase()];
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
