## ADDED Requirements

### Requirement: URL hostname allowlist
All MCP tools that accept a URL parameter SHALL validate the URL hostname against an allowlist of permitted patterns before making any HTTP request. The allowed patterns SHALL be:
- `*.supabase.opentrust.net` (Aliyun Supabase instances)
- `*.supabase.co` (Supabase Cloud instances)
- `localhost` and `127.0.0.1` (local development)

#### Scenario: Allowed Aliyun Supabase URL
- **WHEN** a tool receives URL `sbp-xxx.supabase.opentrust.net`
- **THEN** the URL SHALL pass validation and the tool SHALL proceed

#### Scenario: Allowed Supabase Cloud URL
- **WHEN** a tool receives URL `xyzproject.supabase.co`
- **THEN** the URL SHALL pass validation and the tool SHALL proceed

#### Scenario: Cloud metadata endpoint blocked
- **WHEN** a tool receives URL `169.254.169.254`
- **THEN** the tool SHALL reject the URL with an error about disallowed hostname

#### Scenario: Private IP address blocked
- **WHEN** a tool receives URL `192.168.1.1`
- **THEN** the tool SHALL reject the URL with an error about private/internal IP

#### Scenario: Arbitrary domain blocked
- **WHEN** a tool receives URL `evil.example.com`
- **THEN** the tool SHALL reject the URL with an error about disallowed hostname

### Requirement: HTTPS enforcement
URLs SHALL be required to use HTTPS protocol. HTTP SHALL only be permitted for localhost (`localhost` and `127.0.0.1`).

#### Scenario: HTTPS URL accepted
- **WHEN** a tool receives URL `https://sbp-xxx.supabase.opentrust.net`
- **THEN** the URL SHALL pass validation

#### Scenario: HTTP URL for non-localhost rejected
- **WHEN** a tool receives URL `http://sbp-xxx.supabase.opentrust.net`
- **THEN** the tool SHALL reject the URL with an error about HTTPS requirement

#### Scenario: HTTP URL for localhost accepted
- **WHEN** a tool receives URL `http://127.0.0.1:54321`
- **THEN** the URL SHALL pass validation

### Requirement: Non-standard port restriction
URLs with non-standard ports (other than 443 for HTTPS, 80 for HTTP) SHALL be rejected, except for localhost URLs.

#### Scenario: Default HTTPS port accepted
- **WHEN** a tool receives URL `https://sbp-xxx.supabase.opentrust.net:443`
- **THEN** the URL SHALL pass validation

#### Scenario: Non-standard port for non-localhost rejected
- **WHEN** a tool receives URL `https://sbp-xxx.supabase.opentrust.net:8080`
- **THEN** the tool SHALL reject the URL with an error about non-standard port

### Requirement: Protocol scheme restriction
URLs using protocols other than HTTP or HTTPS (e.g., `ftp://`, `file://`) SHALL be rejected.

#### Scenario: FTP URL rejected
- **WHEN** a tool receives URL `ftp://sbp-xxx.supabase.opentrust.net`
- **THEN** the tool SHALL reject the URL with an error about invalid protocol

### Requirement: URL auto-prefixing
When a URL is provided without a protocol prefix, `https://` SHALL be automatically prepended before validation.

#### Scenario: URL without protocol
- **WHEN** a tool receives URL `sbp-xxx.supabase.opentrust.net`
- **THEN** the server SHALL treat it as `https://sbp-xxx.supabase.opentrust.net` and validate accordingly
