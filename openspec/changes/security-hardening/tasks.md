## 1. 安全模块基础

- [ ] 1.1 创建 `src/security/` 目录结构，`index.ts` 统一导出所有安全工具函数
- [ ] 1.2 实现 `src/security/sql-sanitizer.ts`，包含 `validateSqlIdentifier`、`validateSchemaNames`、`escapeSqlLiteral`、`escapeSqlIdentifier`、`assertReadOnlyQuery`、`validateSqlFilePath`
- [ ] 1.3 实现 `src/security/url-validator.ts`，包含 `validateUrl` 和 `validateAndNormalizeUrl` — 主机名白名单、HTTPS 强制、私有 IP 封锁、端口限制、自动补全协议
- [ ] 1.4 实现 `src/security/auth.ts`，包含 `validateApiKeyRequirements`、`createApiKeyValidator`（时序安全比较）、`extractApiKeyFromHeaders`
- [ ] 1.5 构建并验证无编译错误

## 2. CLI 标志变更

- [ ] 2.1 在 `src/transports/stdio.ts` 中将 `--read-only` 标志默认值从 `false` 改为 `true`
- [ ] 2.2 新增 `--write` 标志，覆盖 `--read-only`（设置 `--write` 时，`effectiveReadOnly = false`）
- [ ] 2.3 新增 `--api-key` CLI 标志和 `MCP_API_KEY` 环境变量支持，启动时校验
- [ ] 2.4 移除 `stdio.ts` 中的调试 `console.error` 语句
- [ ] 2.5 修复硬编码的 `"accessToken"` 为实际 `accessToken` 变量
- [ ] 2.6 将 `effectiveReadOnly` 传递给 `createSupabaseMcpServer`，而非原始 `readOnly`

## 3. 只读事务包装

- [ ] 3.1 在 `src/server.ts` 中为 `createSupabaseMcpServer` 添加 `readOnly` 选项
- [ ] 3.2 在 `src/tools/aliyun-tools.ts` 的 `execute_sql` 工具中实现只读事务包装：当 `readOnly` 为 true 时，将 SQL 包装在 `BEGIN; SET LOCAL transaction_read_only = on; <sql>; ROLLBACK;` 中
- [ ] 3.3 在 `execute_sql_file` 工具中实现相同的只读事务包装逻辑
- [ ] 3.4 添加分号处理：确保用户 SQL 以 `;` 结尾后再追加 `ROLLBACK`
- [ ] 3.5 处理已存在的 `BEGIN` 语句，注入 `SET LOCAL transaction_read_only = on` 而非包装
- [ ] 3.6 只读模式下禁用 `apply_migration` 工具

## 4. SQL 注入防护

- [ ] 4.1 对 `list_table` 工具的 `table_name` 参数应用 `validateSqlIdentifier`
- [ ] 4.2 对 `list_table` 工具的 `schemas` 参数应用 `validateSchemaNames`
- [ ] 4.3 对 `list_columns` 工具的 `table_name` 参数应用 `validateSqlIdentifier`
- [ ] 4.4 对 `list_columns` 工具的 `schemas` 参数应用 `validateSchemaNames`
- [ ] 4.5 对 `list_indexes` 工具的 `table_name` 参数应用 `validateSqlIdentifier`
- [ ] 4.6 对 `list_indexes` 工具的 `schemas` 参数应用 `validateSchemaNames`

## 5. SSRF 防护

- [ ] 5.1 对 `execute_sql` 工具的 `url` 参数应用 `validateUrl`
- [ ] 5.2 对 `execute_sql_file` 工具的 `url` 参数应用 `validateUrl`
- [ ] 5.3 对 `list_table` 工具的 `url` 参数应用 `validateUrl`
- [ ] 5.4 对 `list_columns` 工具的 `url` 参数应用 `validateUrl`
- [ ] 5.5 对 `list_indexes` 工具的 `url` 参数应用 `validateUrl`
- [ ] 5.6 对 `list_extensions` 工具的 `url` 参数应用 `validateUrl`
- [ ] 5.7 对存储工具（`download_storage_file`、`delete_storage_file` 及其他接收 URL 的存储工具）的 `url` 参数应用 `validateUrl`

## 6. 路径穿越防护

- [ ] 6.1 对 `execute_sql_file` 工具（aliyun-tools.ts）的 `file_path` 参数应用 `validateSqlFilePath`
- [ ] 6.2 对 `apply_migration` 工具（database-operation-tools.ts）的 `file_path` 参数应用 `validateSqlFilePath`

## 7. 文档和清理

- [ ] 7.1 更新 `README.md`，添加安全公告横幅、更新 `--read-only`/`--write` 标志文档和 `--api-key` 文档
- [ ] 7.2 验证 `npm run build` 构建成功

## 8. 验证

- [ ] 8.1 测试只读模式：SELECT 成功，INSERT/DROP/CREATE 被拒绝并返回错误码 25006
- [ ] 8.2 测试 SQL 注入：恶意标识符被拒绝，合法查询正常工作
- [ ] 8.3 测试 SSRF：被阻止的 URL（元数据端点、私有 IP、恶意域名、FTP）被拒绝，允许的 URL 通过
- [ ] 8.4 测试路径穿越：相对路径、非 .sql 扩展名、`..` 序列均被拒绝
- [ ] 8.5 测试 API Key 校验：短密钥/纯数字密钥/重复字符密钥在启动时被拒绝
