## Context

The Aliyun Supabase MCP server allows AI assistants (Claude, Cursor, Qoder, etc.) to interact with Supabase projects via the Model Context Protocol. The server exposes tools for SQL execution, schema inspection, storage management, edge functions, and auth user management. Currently, the server provides no defense against a compromised or confused AI agent performing destructive operations, accessing internal network resources, or injecting malicious SQL.

The current codebase has:
- No input validation on SQL identifiers, URLs, or file paths
- `--read-only` flag defaulting to `false`
- No API key authentication mechanism
- Debug logging left in production code
- A hardcoded access token in `stdio.ts`

All changes must remain compatible with the existing MCP tool interface — tools accept the same parameters, just with additional validation.

## Goals / Non-Goals

**Goals:**
- Default to read-only mode so accidental writes are impossible without explicit opt-in
- Prevent SQL injection through identifier parameters in schema-inspection tools
- Prevent SSRF attacks by restricting URLs to known-safe Supabase domains
- Prevent path traversal in file-based SQL execution tools
- Validate API key strength at startup for future HTTP transport authentication
- Keep all security checks at the tool handler level (defense-in-depth, not just at the DB level)
- Zero new external dependencies

**Non-Goals:**
- Per-tool authorization (e.g., allowing SELECT but not INSERT at the tool level when in write mode)
- HTTP transport implementation (API key validation is startup-only for now)
- DNS rebinding protection (hostname allowlist relies on string matching, not DNS resolution)
- Rate limiting or request throttling
- Encryption of credentials at rest

## Decisions

### 1. Transaction-level read-only enforcement (not SQL keyword filtering)

**Decision**: Wrap all SQL in `BEGIN; SET LOCAL transaction_read_only = on; <sql>; ROLLBACK;` transactions.

**Rationale**: Keyword-based filtering (checking for INSERT/DROP/etc.) is easily bypassed via comments, string concatenation, or PostgreSQL's procedural languages. The database's own transaction mode is the only reliable enforcement mechanism. The `assertReadOnlyQuery` function exists as a best-effort pre-check but is not the primary defense.

**Alternative considered**: Reject SQL at the application level by parsing the query with `libpg-query`. Rejected because PostgreSQL has too many ways to express write operations (DO blocks, CTEs with DML, etc.) and parsing adds a heavy dependency.

### 2. URL allowlist (not denylist)

**Decision**: Use an allowlist of permitted hostname patterns rather than a denylist of blocked hosts.

**Rationale**: Denylists are fragile — new cloud metadata endpoints, private IP ranges, and encoding tricks constantly emerge. An allowlist of `*.supabase.opentrust.net`, `*.supabase.co`, and localhost is simple, auditable, and covers all legitimate use cases.

### 3. Identifier regex validation (not escaping)

**Decision**: Validate identifiers against `^[a-zA-Z_][a-zA-Z0-9_]*$` and reject non-matching input, rather than escaping arbitrary input with double-quote quoting.

**Rationale**: Supabase schema/table/column names created through the platform always follow this pattern. Allowing arbitrary identifiers (even if escaped) expands the attack surface unnecessarily. Rejecting special characters entirely is simpler and more auditable.

### 4. API key validation at startup only

**Decision**: Validate API key format/length at server startup. Per-request authentication is not yet implemented.

**Rationale**: The current transport is stdio (local pipe), not HTTP. Per-request auth will be needed when HTTP transport is added, but for now, startup validation ensures operators configure strong keys. The `createApiKeyValidator` and `timingSafeEqual` utilities are pre-built for future use.

### 5. `--write` flag semantics

**Decision**: `--write` overrides `--read-only`. If both flags are set, write mode wins.

**Rationale**: Users who currently pass `--read-only` should not be broken. The new default is safe, and `--write` is the explicit opt-out. This is a simpler mental model than `--no-read-only`.

## Risks / Trade-offs

- **[BREAKING] Default read-only** → Users who relied on the old default (read-write) must add `--write` to their config. Mitigated by clear README documentation and error messages.
- **Identifier validation rejects valid PostgreSQL identifiers** → Hyphenated schema names or Unicode identifiers are rejected. Mitigated by noting this is only for tools that construct SQL (not `execute_sql` which accepts arbitrary SQL).
- **SSRF allowlist may miss custom domains** → Users with custom Supabase domains or proxies will be blocked. Mitigated by documenting how to extend `ALLOWED_HOSTNAME_PATTERNS` in the source.
- **No DNS resolution validation** → An attacker could point an allowlisted hostname to an internal IP via DNS rebinding. This is a known limitation; full mitigation requires runtime DNS resolution checks.
- **Startup-only API key validation** → Until HTTP transport is implemented, the API key only guards against misconfiguration, not against unauthorized tool calls.
