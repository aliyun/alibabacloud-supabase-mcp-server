## Why

The MCP server exposes AI assistants with direct database access via SQL execution and HTTP API calls. Without security hardening, a malicious or confused AI agent could: (1) execute destructive SQL (DROP TABLE, DELETE, etc.), (2) perform SSRF attacks by supplying internal/cloud-metadata URLs, (3) inject SQL through identifier parameters, (4) read arbitrary files via path traversal in `execute_sql_file`, or (5) operate without authentication when exposed on non-local addresses. Per Aliyun MCP security policy requirements, the server must default to read-only mode, validate all user-controlled inputs, and support API key authentication.

## What Changes

- **BREAKING**: `--read-only` flag now defaults to `true` instead of `false`. Users who need write access must explicitly opt in with the new `--write` flag.
- New `--write` flag to explicitly disable read-only mode (overrides `--read-only`)
- New `--api-key` flag and `MCP_API_KEY` env var for startup-time API key validation
- `execute_sql` and `execute_sql_file` tools now wrap all SQL in read-only transactions (`BEGIN; SET LOCAL transaction_read_only = on; <sql>; ROLLBACK;`) when in read-only mode
- All URL-accepting tools now validate URLs against an allowlist (`*.supabase.opentrust.net`, `*.supabase.co`, localhost) to prevent SSRF
- All SQL-identifier-accepting tools (`list_table`, `list_columns`, `list_indexes`) now validate identifiers against `^[a-zA-Z_][a-zA-Z0-9_]*$` to prevent SQL injection
- `execute_sql_file` and `apply_migration` now validate file paths (must be absolute, end in `.sql`, no `..` traversal) to prevent path traversal
- New `src/security/` module with `sql-sanitizer.ts`, `url-validator.ts`, `auth.ts`, and `index.ts`
- Removed debug `console.error` statements from `stdio.ts`
- Fixed hardcoded `"accessToken"` to use actual variable in `stdio.ts`
- Updated README with security notice and new flag documentation

## Capabilities

### New Capabilities
- `read-only-transaction`: Default read-only mode with transaction wrapping for SQL execution tools, opt-in write mode via `--write` flag
- `sql-injection-prevention`: Identifier validation and literal escaping for all tools that construct SQL from user input
- `ssrf-prevention`: URL hostname allowlist validation for all URL-accepting tools
- `path-traversal-prevention`: File path validation for `execute_sql_file` and `apply_migration` tools
- `api-key-auth`: Startup-time API key validation with minimum length, pattern checks, and timing-safe comparison

### Modified Capabilities
<!-- No existing specs to modify -->

## Impact

- **Code**: New `src/security/` module (4 files), modifications to `aliyun-tools.ts`, `database-operation-tools.ts`, `stdio.ts`, `server.ts`, `api-platform.ts`, `README.md`
- **API**: CLI flags changed — `--read-only` defaults to true, new `--write` and `--api-key` flags
- **Behavior**: All SQL execution tools now run in read-only transactions by default; URL validation rejects non-allowlist hosts; identifier validation rejects special characters
- **Dependencies**: No new external dependencies — all security utilities are pure TypeScript
