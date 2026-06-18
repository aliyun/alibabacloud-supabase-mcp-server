/**
 * URL validation utilities to prevent Server-Side Request Forgery (SSRF) attacks.
 *
 * These validators ensure that user-supplied URLs only point to allowed domains
 * and cannot be used to access internal network resources or cloud metadata endpoints.
 */

/**
 * Whether localhost should be allowed in URL validation.
 * In production environments, set MCP_ENV=production to disable localhost access.
 * Defaults to allowing localhost for development convenience.
 */
const IS_PRODUCTION = process.env.MCP_ENV === 'production';

/**
 * Allowed hostname patterns for Supabase project URLs.
 * Only URLs matching these patterns will be permitted.
 * localhost and 127.0.0.1 are excluded in production (MCP_ENV=production).
 */
const ALLOWED_HOSTNAME_PATTERNS = [
  // Aliyun Supabase instances
  /\.supabase\.opentrust\.net$/,
  // Supabase cloud instances
  /\.supabase\.co$/,
  // Local development — disabled in production
  ...(IS_PRODUCTION ? [] : [/^localhost$/, /^127\.0\.0\.1$/]),
];

/**
 * Private/internal IP ranges that must be blocked to prevent SSRF.
 */
const BLOCKED_IP_RANGES = [
  // Loopback
  { start: '127.0.0.0', end: '127.255.255.255' },
  // Link-local
  { start: '169.254.0.0', end: '169.254.255.255' },
  // Private Class A
  { start: '10.0.0.0', end: '10.255.255.255' },
  // Private Class B
  { start: '172.16.0.0', end: '172.31.255.255' },
  // Private Class C
  { start: '192.168.0.0', end: '192.168.255.255' },
  // Cloud metadata endpoint (AWS/Aliyun)
  { start: '169.254.169.254', end: '169.254.169.254' },
];

/**
 * Convert an IPv4 address string to a numeric value for comparison.
 */
function ipToNumber(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0] ?? 0) << 24) + ((parts[1] ?? 0) << 16) + ((parts[2] ?? 0) << 8) + (parts[3] ?? 0);
}

/**
 * Check if an IP address falls within a private/blocked range.
 */
function isBlockedIp(ip: string): boolean {
  const ipNum = ipToNumber(ip);
  return BLOCKED_IP_RANGES.some(
    (range) => ipNum >= ipToNumber(range.start) && ipNum <= ipToNumber(range.end)
  );
}

/**
 * Validates a URL for SSRF prevention.
 *
 * Rules:
 * 1. Must use HTTPS (or http for localhost only)
 * 2. Hostname must match allowed domain patterns
 * 3. Must not resolve to a private/internal IP address
 * 4. Must not use non-standard ports (only 443 for HTTPS, 80 for localhost HTTP)
 *
 * @param url - The URL string to validate
 * @returns The validated URL string
 * @throws Error if the URL is invalid or poses an SSRF risk
 */
export function validateUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    throw new Error('URL must be a non-empty string');
  }

  let parsedUrl: URL;
  try {
    // Add https:// prefix if no protocol is present
    const urlWithProtocol = (!url.startsWith('http://') && !url.startsWith('https://'))
      ? `https://${url}`
      : url;
    parsedUrl = new URL(urlWithProtocol);
  } catch {
    throw new Error(`Invalid URL format: "${url}"`);
  }

  const { protocol, hostname, port } = parsedUrl;

  // Must use HTTPS (HTTP only allowed for localhost in non-production)
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  if (protocol === 'http:' && !isLocalhost) {
    throw new Error(
      `URL must use HTTPS protocol. HTTP is only allowed for localhost. Got: "${url}"`
    );
  }

  if (protocol !== 'https:' && protocol !== 'http:') {
    throw new Error(
      `URL must use HTTP or HTTPS protocol. Got: "${url}"`
    );
  }

  // Check hostname against allowed patterns
  const isAllowedHost = ALLOWED_HOSTNAME_PATTERNS.some(
    (pattern) => pattern.test(hostname)
  );

  if (!isAllowedHost) {
    throw new Error(
      `URL hostname "${hostname}" is not allowed. ` +
      `Only *.supabase.opentrust.net, *.supabase.co, and localhost are permitted.`
    );
  }

  // Check if hostname is a direct IP address that's blocked.
  // Skip this check for allowlisted hostnames (e.g., 127.0.0.1 is allowlisted
  // for local development but also falls in the loopback blocked range).
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!isAllowedHost && ipv4Regex.test(hostname) && isBlockedIp(hostname)) {
    throw new Error(
      `URL hostname "${hostname}" is a private/internal IP address which is not allowed.`
    );
  }

  // Check port (only allow default ports)
  if (port && port !== '443' && port !== '80') {
    // Allow non-standard ports only for localhost (non-production)
    if (!isLocalhost) {
      throw new Error(
        `URL with non-standard port "${port}" is not allowed. Only default ports (80, 443) are permitted.`
      );
    }
  }

  return parsedUrl.href.replace(/\/$/, ''); // Remove trailing slash
}

/**
 * Validates a URL and returns the normalized form, adding https:// if missing.
 * This is a convenience wrapper around validateUrl.
 *
 * @param url - The URL string to validate and normalize
 * @returns The normalized URL string with protocol
 * @throws Error if the URL is invalid or poses an SSRF risk
 */
export function validateAndNormalizeUrl(url: string): string {
  const validated = validateUrl(url);
  return validated;
}
