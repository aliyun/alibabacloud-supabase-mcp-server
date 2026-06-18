## 1. Security Module Foundation

- [ ] 1.1 Create `src/security/` directory structure with `index.ts` re-exporting all security utilities
- [ ] 1.2 Implement `src/security/sql-sanitizer.ts` with `validateSqlIdentifier`, `validateSchemaNames`, `escapeSqlLiteral`, `escapeSqlIdentifier`, `assertReadOnlyQuery`, `validateSqlFilePath`
- [ ] 1.3 Implement `src/security/url-validator.ts` with `validateUrl` and `validateAndNormalizeUrl` — hostname allowlist, HTTPS enforcement, private IP blocking, port restriction, auto-prefixing
- [ ] 1.4 Implement `src/security/auth.ts` with `validateApiKeyRequirements`, `createApiKeyValidator` (timing-safe comparison), `extractApiKeyFromHeaders`
- [ ] 1.5 Build and verify no compilation errors

## 2. CLI Flag Changes

- [ ] 2.1 Change `--read-only` flag default from `false` to `true` in `src/transports/stdio.ts`
- [ ] 2.2 Add `--write` flag that overrides `--read-only` (when `--write` is set, `effectiveReadOnly = false`)
- [ ] 2.3 Add `--api-key` CLI flag and `MCP_API_KEY` env var support with startup validation
- [ ] 2.4 Remove debug `console.error` statements from `stdio.ts`
- [ ] 2.5 Fix hardcoded `"accessToken"` to use actual `accessToken` variable
- [ ] 2.6 Pass `effectiveReadOnly` to `createSupabaseMcpServer` instead of raw `readOnly`

## 3. Read-Only Transaction Wrapping

- [ ] 3.1 Add `readOnly` option to `createSupabaseMcpServer` in `src/server.ts`
- [ ] 3.2 Implement read-only transaction wrapping in `execute_sql` tool in `src/tools/aliyun-tools.ts`: wrap SQL in `BEGIN; SET LOCAL transaction_read_only = on; <sql>; ROLLBACK;` when `readOnly` is true
- [ ] 3.3 Implement read-only transaction wrapping in `execute_sql_file` tool with same logic
- [ ] 3.4 Add semicolon handling: ensure user SQL ends with `;` before appending `ROLLBACK`
- [ ] 3.5 Handle existing `BEGIN` statements by injecting `SET LOCAL transaction_read_only = on` instead of wrapping
- [ ] 3.6 Disable `apply_migration` tool when in read-only mode

## 4. SQL Injection Prevention

- [ ] 4.1 Apply `validateSqlIdentifier` to `table_name` parameter in `list_table` tool
- [ ] 4.2 Apply `validateSchemaNames` to `schemas` parameter in `list_table` tool
- [ ] 4.3 Apply `validateSqlIdentifier` to `table_name` parameter in `list_columns` tool
- [ ] 4.4 Apply `validateSchemaNames` to `schemas` parameter in `list_columns` tool
- [ ] 4.5 Apply `validateSqlIdentifier` to `table_name` parameter in `list_indexes` tool
- [ ] 4.6 Apply `validateSchemaNames` to `schemas` parameter in `list_indexes` tool

## 5. SSRF Prevention

- [ ] 5.1 Apply `validateUrl` to `url` parameter in `execute_sql` tool
- [ ] 5.2 Apply `validateUrl` to `url` parameter in `execute_sql_file` tool
- [ ] 5.3 Apply `validateUrl` to `url` parameter in `list_table` tool
- [ ] 5.4 Apply `validateUrl` to `url` parameter in `list_columns` tool
- [ ] 5.5 Apply `validateUrl` to `url` parameter in `list_indexes` tool
- [ ] 5.6 Apply `validateUrl` to `url` parameter in `list_extensions` tool
- [ ] 5.7 Apply `validateUrl` to `url` parameter in storage tools (`download_storage_file`, `delete_storage_file`, and any other URL-accepting storage tools)

## 6. Path Traversal Prevention

- [ ] 6.1 Apply `validateSqlFilePath` to `file_path` parameter in `execute_sql_file` tool (aliyun-tools.ts)
- [ ] 6.2 Apply `validateSqlFilePath` to `file_path` parameter in `apply_migration` tool (database-operation-tools.ts)

## 7. Documentation and Cleanup

- [ ] 7.1 Update `README.md` with security notice banner, updated `--read-only`/`--write` flag docs, and `--api-key` docs
- [ ] 7.2 Verify build succeeds with `npm run build`

## 8. Verification

- [ ] 8.1 Test read-only mode: SELECT succeeds, INSERT/DROP/CREATE blocked with error 25006
- [ ] 8.2 Test SQL injection: malicious identifiers rejected, legitimate queries work
- [ ] 8.3 Test SSRF: blocked URLs (metadata endpoint, private IP, evil domain, FTP), allowed URLs pass
- [ ] 8.4 Test path traversal: relative paths, non-.sql extensions, `..` sequences all rejected
- [ ] 8.5 Test API key validation: short/numeric/repeating keys rejected at startup
