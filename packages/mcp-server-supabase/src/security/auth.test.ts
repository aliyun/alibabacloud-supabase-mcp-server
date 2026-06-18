import { describe, expect, test } from 'vitest';
import {
  validateApiKeyRequirements,
  createApiKeyValidator,
  extractApiKeyFromHeaders,
} from './auth.js';

// ---------------------------------------------------------------------------
// validateApiKeyRequirements
// ---------------------------------------------------------------------------

describe('validateApiKeyRequirements', () => {
  test('accepts a valid 32+ char alphanumeric key', () => {
    expect(() => validateApiKeyRequirements('abcdef1234567890abcdef1234567890')).not.toThrow();
    expect(() => validateApiKeyRequirements('sk-abc123def456ghi789jkl012mno345pqr')).not.toThrow();
  });

  test('rejects empty string', () => {
    expect(() => validateApiKeyRequirements('')).toThrow('non-empty string');
  });

  test('rejects non-string input', () => {
    expect(() => validateApiKeyRequirements(null as unknown as string)).toThrow('non-empty string');
    expect(() => validateApiKeyRequirements(undefined as unknown as string)).toThrow('non-empty string');
  });

  test('rejects key shorter than 32 characters', () => {
    expect(() => validateApiKeyRequirements('shortkey')).toThrow('at least 32 characters');
    expect(() => validateApiKeyRequirements('a'.repeat(31))).toThrow('at least 32 characters');
  });

  test('accepts key at exactly 32 characters', () => {
    expect(() => validateApiKeyRequirements('abcdef1234567890abcdef1234567890')).not.toThrow();
  });

  test('rejects purely numeric key', () => {
    expect(() => validateApiKeyRequirements('1'.repeat(32))).toThrow('must not be purely numeric');
  });

  test('rejects repeating single character', () => {
    expect(() => validateApiKeyRequirements('x'.repeat(40))).toThrow('must not be a repeating character');
  });

  test('accepts key with mix of letters and numbers', () => {
    expect(() => validateApiKeyRequirements('abc123abc123abc123abc123abc123ab')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// createApiKeyValidator
// ---------------------------------------------------------------------------

describe('createApiKeyValidator', () => {
  const validKey = 'abcdef1234567890abcdef1234567890';

  test('returns true when provided key matches configured key', () => {
    const validator = createApiKeyValidator(validKey);
    expect(validator(validKey)).toBe(true);
  });

  test('returns false when provided key is undefined', () => {
    const validator = createApiKeyValidator(validKey);
    expect(validator(undefined)).toBe(false);
  });

  test('returns false when provided key does not match', () => {
    const validator = createApiKeyValidator(validKey);
    expect(validator('wrong-key-that-is-long-enough-1234567890')).toBe(false);
  });

  test('returns false for empty string', () => {
    const validator = createApiKeyValidator(validKey);
    expect(validator('')).toBe(false);
  });

  test('throws when configured key is invalid', () => {
    expect(() => createApiKeyValidator('short')).toThrow('at least 32 characters');
  });

  test('constant-time: different-length keys still return false (not throw)', () => {
    const validator = createApiKeyValidator(validKey);
    // A much shorter key should return false, not crash
    expect(validator('a')).toBe(false);
    // A much longer key should also return false
    expect(validator(validKey + 'extra-padding-characters-here')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extractApiKeyFromHeaders
// ---------------------------------------------------------------------------

describe('extractApiKeyFromHeaders', () => {
  test('extracts from x-api-key header', () => {
    const headers = { 'x-api-key': 'sk-test-key' };
    expect(extractApiKeyFromHeaders(headers)).toBe('sk-test-key');
  });

  test('extracts from apikey header', () => {
    const headers = { apikey: 'sk-test-key' };
    expect(extractApiKeyFromHeaders(headers)).toBe('sk-test-key');
  });

  test('extracts Bearer token from Authorization header', () => {
    const headers = { authorization: 'Bearer sk-bearer-token' };
    expect(extractApiKeyFromHeaders(headers)).toBe('sk-bearer-token');
  });

  test('extracts raw value from Authorization header without Bearer prefix', () => {
    const headers = { authorization: 'raw-key-value' };
    expect(extractApiKeyFromHeaders(headers)).toBe('raw-key-value');
  });

  test('returns undefined when no relevant headers present', () => {
    const headers = { 'content-type': 'application/json' };
    expect(extractApiKeyFromHeaders(headers)).toBeUndefined();
  });

  test('returns undefined from empty headers', () => {
    expect(extractApiKeyFromHeaders({})).toBeUndefined();
  });

  test('trims whitespace from extracted key', () => {
    const headers = { 'x-api-key': '  sk-test-key  ' };
    expect(extractApiKeyFromHeaders(headers)).toBe('sk-test-key');
  });

  test('handles case-insensitive header names', () => {
    const headers = { 'X-API-KEY': 'sk-test-key' };
    expect(extractApiKeyFromHeaders(headers)).toBe('sk-test-key');
  });

  test('ignores empty string header values', () => {
    const headers = { 'x-api-key': '' };
    expect(extractApiKeyFromHeaders(headers)).toBeUndefined();
  });
});
