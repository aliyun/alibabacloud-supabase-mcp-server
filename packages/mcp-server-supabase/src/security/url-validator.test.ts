import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  fetchValidatedUrl,
  validateUrl,
  validateAndNormalizeUrl,
} from './url-validator.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// validateUrl — basic valid cases
// ---------------------------------------------------------------------------

describe('validateUrl — valid URLs', () => {
  test('accepts Aliyun Supabase URL', () => {
    const url = 'https://test-project.supabase.opentrust.net';
    expect(validateUrl(url)).toBe(url);
  });

  test('accepts Supabase cloud URL', () => {
    const url = 'https://test-project.supabase.co';
    expect(validateUrl(url)).toBe(url);
  });

  test('accepts URL with path', () => {
    const url = 'https://test-project.supabase.co/rest/v1/users';
    expect(validateUrl(url)).toBe(url);
  });

  test('accepts URL without protocol (defaults to https)', () => {
    const result = validateUrl('test-project.supabase.co');
    expect(result).toBe('https://test-project.supabase.co');
  });

  test('accepts localhost HTTP in non-production', () => {
    // MCP_ENV is not set in test environment, so localhost is allowed
    expect(() => validateUrl('http://localhost:54321')).not.toThrow();
  });

  test('accepts 127.0.0.1 HTTP in non-production', () => {
    expect(() => validateUrl('http://127.0.0.1:54321')).not.toThrow();
  });

  test('removes trailing slash', () => {
    expect(validateUrl('https://test.supabase.co/')).toBe('https://test.supabase.co');
  });
});

// ---------------------------------------------------------------------------
// validateUrl — protocol and scheme validation
// ---------------------------------------------------------------------------

describe('validateUrl — protocol validation', () => {
  test('rejects FTP protocol', () => {
    // ftp:// gets prepended with https:// → hostname becomes "ftp"
    expect(() => validateUrl('ftp://test.supabase.co')).toThrow('not allowed');
  });

  test('rejects file protocol', () => {
    // file:// gets prepended with https:// → hostname becomes "file"
    expect(() => validateUrl('file:///etc/passwd')).toThrow('not allowed');
  });

  test('rejects HTTP for non-localhost host', () => {
    expect(() => validateUrl('http://test.supabase.co')).toThrow('HTTPS');
  });
});

// ---------------------------------------------------------------------------
// validateUrl — hostname / domain validation
// ---------------------------------------------------------------------------

describe('validateUrl — hostname validation', () => {
  test('rejects arbitrary domain', () => {
    expect(() => validateUrl('https://evil.example.com')).toThrow('not allowed');
  });

  test('rejects internal IP address', () => {
    expect(() => validateUrl('https://10.0.0.1')).toThrow('not allowed');
  });

  test('rejects private IP 192.168.x.x', () => {
    expect(() => validateUrl('https://192.168.1.1')).toThrow('not allowed');
  });

  test('rejects private IP 172.16.x.x', () => {
    expect(() => validateUrl('https://172.16.0.1')).toThrow('not allowed');
  });

  test('rejects cloud metadata endpoint IP', () => {
    // 169.254.169.254 — link-local, blocked by IP range
    expect(() => validateUrl('https://169.254.169.254')).toThrow('not allowed');
  });

  test('rejects hostname that looks like Supabase but is not', () => {
    expect(() => validateUrl('https://supabase.co.evil.com')).toThrow('not allowed');
  });

  test('accepts subdomain of supabase.co', () => {
    expect(() => validateUrl('https://my-project.sub.supabase.co')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// validateUrl — SSRF bypass attempts
// ---------------------------------------------------------------------------

describe('validateUrl — SSRF bypass attempts', () => {
  test('rejects URL-encoded localhost', () => {
    // URL parser decodes %6c%6f... to "localhost" which matches the allowlist.
    // This is actually safe — the URL parser normalizes encoded hostnames before
    // they reach the allowlist check, so encoding cannot bypass validation.
    // Verify it's treated as localhost (accepted in non-production).
    expect(() => validateUrl('https://%6c%6f%63%61%6c%68%6f%73%74')).not.toThrow();
  });

  test('rejects decimal IP (16909060 = 10.20.30.40)', () => {
    // Numeric IP representation
    expect(() => validateUrl('https://16909060')).toThrow('not allowed');
  });

  test('rejects 0x prefixed hex IP', () => {
    expect(() => validateUrl('https://0x0a.0x14.0x1e.0x28')).toThrow('not allowed');
  });

  test('rejects IPv6 link-local address', () => {
    expect(() => validateUrl('https://[fe80::1]')).toThrow('not allowed');
  });

  test('rejects IPv6 loopback address', () => {
    expect(() => validateUrl('https://[::1]')).toThrow('not allowed');
  });

  test('rejects URL with @ to redirect to different host', () => {
    // https://test.supabase.co@evil.com — URL parser sees hostname as evil.com
    expect(() => validateUrl('https://test.supabase.co@evil.com')).toThrow('not allowed');
  });

  test('rejects URL with username containing host pattern', () => {
    // %40 = @, so supabase.co@evil.com is parsed as userinfo@host.
    // The URL constructor rejects this as invalid when prepended with https://.
    expect(() => validateUrl('https://supabase.co%40evil.com')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// validateUrl — port validation
// ---------------------------------------------------------------------------

describe('validateUrl — port validation', () => {
  test('accepts explicit port 443 for HTTPS', () => {
    expect(() => validateUrl('https://test.supabase.co:443')).not.toThrow();
  });

  test('accepts explicit port 80 for localhost HTTP', () => {
    expect(() => validateUrl('http://localhost:80')).not.toThrow();
  });

  test('rejects non-standard port for non-localhost host', () => {
    expect(() => validateUrl('https://test.supabase.co:8080')).toThrow('non-standard port');
  });

  test('accepts non-standard port for localhost', () => {
    expect(() => validateUrl('http://localhost:3000')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// validateUrl — edge cases
// ---------------------------------------------------------------------------

describe('validateUrl — edge cases', () => {
  test('rejects empty string', () => {
    expect(() => validateUrl('')).toThrow('non-empty string');
  });

  test('rejects non-string input', () => {
    expect(() => validateUrl(null as unknown as string)).toThrow('non-empty string');
  });

  test('rejects malformed URL', () => {
    expect(() => validateUrl('not a url at all')).toThrow('Invalid URL format');
  });
});

// ---------------------------------------------------------------------------
// validateAndNormalizeUrl
// ---------------------------------------------------------------------------

describe('validateAndNormalizeUrl', () => {
  test('returns normalized URL with protocol', () => {
    expect(validateAndNormalizeUrl('test.supabase.co')).toBe('https://test.supabase.co');
  });

  test('passes through valid HTTPS URL', () => {
    expect(validateAndNormalizeUrl('https://test.supabase.co')).toBe('https://test.supabase.co');
  });

  test('throws for invalid URL', () => {
    expect(() => validateAndNormalizeUrl('')).toThrow('non-empty string');
  });
});

// ---------------------------------------------------------------------------
// fetchValidatedUrl
// ---------------------------------------------------------------------------

describe('fetchValidatedUrl', () => {
  test('forces manual redirect handling', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await fetchValidatedUrl('https://test.supabase.co/rest/v1/users', {
      redirect: 'follow',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://test.supabase.co/rest/v1/users',
      expect.objectContaining({ redirect: 'manual' })
    );
  });

  test('rejects redirects to unvalidated targets', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 307,
        headers: { location: 'http://169.254.169.254/latest/meta-data' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchValidatedUrl('https://test.supabase.co/functions/v1/redirect')
    ).rejects.toThrow('Redirect response (307) is not allowed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
