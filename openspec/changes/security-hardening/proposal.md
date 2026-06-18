## 为什么

MCP 服务器通过 SQL 执行和 HTTP API 调用使 AI 助手可以直接访问数据库。如果不进行安全加固，恶意或被误导的 AI 代理可能：(1) 执行破坏性 SQL（DROP TABLE、DELETE 等），(2) 通过提供内部/云元数据 URL 发起 SSRF 攻击，(3) 通过标识符参数注入 SQL，(4) 通过 `execute_sql_file` 中的路径穿越读取任意文件，或 (5) 在非本地地址暴露时无认证运行。根据阿里云 MCP 安全策略要求，服务器必须默认只读模式、校验所有用户可控输入，并支持 API Key 认证。

## 变更内容

- **破坏性变更**：`--read-only` 标志默认值从 `false` 改为 `true`。需要写访问权限的用户必须通过新的 `--write` 标志显式启用。
- 新增 `--write` 标志，显式禁用只读模式（覆盖 `--read-only`）
- 新增 `--api-key` 标志和 `MCP_API_KEY` 环境变量，用于启动时 API Key 校验
- `execute_sql` 和 `execute_sql_file` 工具在只读模式下将所有 SQL 包装在只读事务中（`BEGIN; SET LOCAL transaction_read_only = on; <sql>; ROLLBACK;`）
- 所有接收 URL 的工具现在会根据白名单（`*.supabase.opentrust.net`、`*.supabase.co`、localhost）校验 URL，以防止 SSRF
- 所有接收 SQL 标识符的工具（`list_table`、`list_columns`、`list_indexes`）现在会根据 `^[a-zA-Z_][a-zA-Z0-9_]*$` 校验标识符，以防止 SQL 注入
- `execute_sql_file` 和 `apply_migration` 现在会校验文件路径（必须为绝对路径、以 `.sql` 结尾、不含 `..` 穿越序列），以防止路径穿越
- 新增 `src/security/` 模块，包含 `sql-sanitizer.ts`、`url-validator.ts`、`auth.ts` 和 `index.ts`
- 移除 `stdio.ts` 中的调试 `console.error` 语句
- 修复 `stdio.ts` 中硬编码的 `"accessToken"` 为实际变量
- 更新 README，添加安全公告和新标志文档

## 能力

### 新增能力
- `read-only-transaction`：默认只读模式，SQL 执行工具使用事务包装，通过 `--write` 标志显式启用写模式
- `sql-injection-prevention`：对所有从用户输入构造 SQL 的工具进行标识符校验和字面量转义
- `ssrf-prevention`：对所有接收 URL 的工具进行主机名白名单校验
- `path-traversal-prevention`：对 `execute_sql_file` 和 `apply_migration` 工具进行文件路径校验
- `api-key-auth`：启动时 API Key 校验，包含最小长度、模式检查和时序安全比较

### 修改的能力
<!-- 无需修改的现有规范 -->

## 影响

- **代码**：新增 `src/security/` 模块（4 个文件），修改 `aliyun-tools.ts`、`database-operation-tools.ts`、`stdio.ts`、`server.ts`、`api-platform.ts`、`README.md`
- **API**：CLI 标志变更 — `--read-only` 默认为 true，新增 `--write` 和 `--api-key` 标志
- **行为**：所有 SQL 执行工具默认在只读事务中运行；URL 校验拒绝非白名单主机；标识符校验拒绝特殊字符
- **依赖**：无新增外部依赖 — 所有安全工具均为纯 TypeScript 实现
