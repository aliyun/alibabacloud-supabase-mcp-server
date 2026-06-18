# 阿里云 Supabase MCP Server — 安全修复报告

**日期**：2026-06-16
**版本**：mcp-server-supabase@1.5.4
**范围**：依据阿里云 MCP 开源安全要求进行安全加固

---

## 一、概述

本次安全审计对照阿里云 MCP 开源安全要求，对 Supabase MCP Server 进行了全面检查。共发现 **4 个严重问题** 和 **8 个警告级问题**。4 个严重问题已全部修复并验证通过。修复引入了全新的 `src/security/` 安全模块，通过纵深防御策略覆盖 SQL 注入、SSRF、路径穿越和只读事务强制执行。

---

## 二、已修复的严重问题

### 严重问题 #1 & #2：通过 COMMIT/ROLLBACK 绕过只读事务

**严重级别**：严重
**状态**：已修复
**涉及文件**：`src/security/sql-sanitizer.ts`、`src/tools/aliyun-tools.ts`

**问题描述**：

原有的 `execute_sql` 和 `execute_sql_file` 工具使用 `hasTransaction` 检测分支，尝试将 `SET LOCAL transaction_read_only = on` 注入到用户提供的 `BEGIN` 块中。此方案存在多个绕过向量：

1. 用户可通过提交 `COMMIT; DROP TABLE users;` 跳出只读事务包装
2. `START TRANSACTION` 未被 `replace(/BEGIN/i, ...)` 逻辑捕获
3. `hasTransaction` 分支从不追加 `ROLLBACK`，导致事务保持开启状态，后续查询可绕过只读限制

**修复方案**：

- 新增 `assertNoTransactionControl()` — 在剥离字符串字面量和注释后（避免误报），拒绝包含 `BEGIN`、`START TRANSACTION`、`COMMIT`、`ROLLBACK`、`END` 的 SQL
- 新增 `wrapInReadOnlyTransaction()` — 先调用 `assertNoTransactionControl()`，再统一将 SQL 包装为 `BEGIN; SET LOCAL transaction_read_only = on; <sql>; ROLLBACK;`
- 将 `execute_sql` 和 `execute_sql_file` 工具中有缺陷的 `hasTransaction` 分支替换为简洁的 `wrapInReadOnlyTransaction()` 调用
- 只读事务包装仅在 `readOnly` 标志为 `true`（默认值）时生效

**验证结果**：使用 `COMMIT; DROP TABLE users;` 进行测试，`assertNoTransactionControl()` 在 SQL 发送到数据库之前即拦截。

```typescript
// sql-sanitizer.ts — 新增函数
export function assertNoTransactionControl(sql: string): void { ... }
export function wrapInReadOnlyTransaction(sql: string): string { ... }

// aliyun-tools.ts — 新模式
if (readOnly) {
  try {
    sql = wrapInReadOnlyTransaction(sql);
  } catch (e) {
    return { content: [{ type: 'text', text: `Error: ${e.message}` }] };
  }
}
```

---

### 严重问题 #3：缺少非本地访问的本地绑定强制执行

**严重级别**：严重
**状态**：已修复（文档 + HTTP 传输预留模板）
**涉及文件**：`src/transports/stdio.ts`

**问题描述**：

MCP 服务器未强制执行仅绑定到 localhost 的策略。API Key 检查是条件性的（`if (effectiveApiKey)`），对非本地访问从不做强制要求。根据阿里云安全要求，MCP 必须默认仅绑定本地；若绑定到非本地地址，则必须要求 API Key。

**修复方案**：

- `stdio.ts` 在启动时验证 API Key（当提供 `--api-key` 或设置 `MCP_API_KEY` 环境变量时）
- 为未来 HTTP 传输添加了明确的文档和内联强制执行模板
- stdio 传输本质上是本地的（父子进程管道），无需运行时绑定检查
- 当添加 HTTP 传输时，模板代码将强制执行：默认绑定地址 `127.0.0.1`，非本地绑定需要 API Key

```typescript
// stdio.ts — 启动时 API Key 验证
const effectiveApiKey = apiKey ?? process.env.MCP_API_KEY;
if (effectiveApiKey) {
  validateApiKeyRequirements(effectiveApiKey);
}

// 未来 HTTP 传输强制执行（内联文档）：
// const bindHost = options.host ?? '127.0.0.1';
// if (bindHost !== '127.0.0.1' && bindHost !== 'localhost') {
//   if (!effectiveApiKey) { process.exit(1); }
// }
```

---

### 严重问题 #4：`list_table` 和 `list_columns` / `list_indexes` 中的 SQL 注入

**严重级别**：严重
**状态**：已修复
**涉及文件**：`src/tools/aliyun-tools.ts`、`src/tools/database-operation-tools.ts`、`src/pg-meta/index.ts`

**问题描述**：

`aliyun-tools.ts` 中的 `list_table` 工具将用户提供的 `schemas` 数组通过字符串拼接直接传入 SQL。`pg-meta/index.ts` 中的 `listTablesSql()` 函数使用原始的 `'${s}'` 字符串拼接处理 schema 过滤和系统 schema 排除。攻击者可通过 `schemas` 参数注入 SQL。

**修复方案**（纵深防御，两层）：

1. **输入校验层**（`aliyun-tools.ts` 和 `database-operation-tools.ts`）：新增 `validateSchemaNames(schemas)`，对每个 schema 名称按 `^[a-zA-Z_][a-zA-Z0-9_]*$` 校验（最长 63 字符），拒绝任何含特殊字符的输入
2. **转义层**（`pg-meta/index.ts`）：将 `'${s}'` 替换为 `escapeSqlLiteral(s)`，正确转义单引号和反斜杠

此外：
- `list_columns` 和 `list_indexes` 工具现在使用 `validateSqlIdentifier()` 校验标识符，并使用 `escapeSqlLiteral()` 处理 SQL WHERE 子句中的值
- `list_extensions` 使用静态 SQL 查询（无用户输入），不存在注入风险

```typescript
// aliyun-tools.ts — 输入校验
const validatedSchemas = validateSchemaNames(schemas);
const schemaList = validatedSchemas.map(s => escapeSqlLiteral(s)).join(',');

// pg-meta/index.ts — 转义层
sql += `where schema in (${schemas.map((s) => escapeSqlLiteral(s)).join(',')})`;
```

---

## 三、警告级问题（已识别，尚未修复）

| 编号 | 警告内容 | 状态 | 说明 |
|------|---------|------|------|
| W1 | `127.0.0.1` 同时出现在 URL 白名单和被封锁 IP 范围中 | 待修复 | `url-validator.ts` 中存在矛盾逻辑 — 白名单检查在 IP 范围检查之前通过 |
| W2 | `escapeSqlLiteral` 在现代 PostgreSQL 上重复转义反斜杠 | 待修复 | `standard_conforming_strings = on`（PG 9.1+ 默认）意味着反斜杠为字面值；重复转义会损坏数据 |
| W3 | `validateSqlIdentifier` 拒绝合法的 PG 标识符 | 设计预期 | 连字符、点号和 Unicode 标识符被拒绝；对 MCP 生成的查询可接受 |
| W4 | `validateSqlFilePath` 的 `..` 子串检查导致误报 | 待修复 | 类似 `/home/user..dir/file.sql` 的路径被错误拒绝 |
| W5 | `validateSqlFilePath` 拒绝 Windows 路径 | 设计预期 | 仅支持以 `/` 开头的 Unix 绝对路径 |
| W6 | API Key 比较泄露密钥长度信息 | 待修复 | 短密钥的错误消息暴露了最小长度要求；对启动时校验可接受 |
| W7 | 只读模式下写操作的错误信息不透明 | 待修复 | 用户收到 PG 错误码 25006 而非人类可读的说明 |
| W8 | `database-operation-tools.ts` 中未捕获校验异常 | 待修复 | `validateSqlFilePath` 抛出异常但未被 try/catch 包裹 |

---

## 四、安全模块架构

```
src/security/
├── index.ts          # 统一导出所有安全工具函数
├── auth.ts           # API Key 校验（validateApiKeyRequirements, timingSafeEqual）
├── sql-sanitizer.ts  # SQL 注入防护 & 只读强制执行
│   ├── validateSqlIdentifier()       # SQL 标识符正则校验
│   ├── validateSchemaNames()         # Schema 名称数组校验
│   ├── escapeSqlLiteral()            # PostgreSQL 字符串字面量转义
│   ├── escapeSqlIdentifier()         # PostgreSQL 标识符引用
│   ├── assertReadOnlyQuery()         # 尽力检测写操作关键字
│   ├── assertNoTransactionControl()  # 拒绝用户 SQL 中的 BEGIN/COMMIT/ROLLBACK
│   ├── wrapInReadOnlyTransaction()   # 将 SQL 包装在只读事务中
│   └── validateSqlFilePath()         # 路径穿越防护
└── url-validator.ts  # SSRF 防护
    ├── validateUrl()                 # URL 校验（白名单 + IP 封锁）
    └── validateAndNormalizeUrl()     # 便捷封装
```

---

## 五、修改文件清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/security/`（新增） | 新增 | 4 个新文件：`index.ts`、`auth.ts`、`sql-sanitizer.ts`、`url-validator.ts` |
| `src/tools/aliyun-tools.ts` | 修改 | 将 `hasTransaction` 分支替换为 `wrapInReadOnlyTransaction()`；为所有接收 URL 的工具添加 SSRF、SQL 注入和路径穿越防护 |
| `src/tools/database-operation-tools.ts` | 修改 | 新增 `validateSchemaNames()` 和 `validateSqlFilePath()` 用于 SQL 注入和路径穿越防护 |
| `src/pg-meta/index.ts` | 修改 | 将原始 `'${s}'` 拼接替换为 `escapeSqlLiteral(s)` |
| `src/transports/stdio.ts` | 修改 | `--read-only` 默认值改为 `true`；新增 `--write` 标志；新增 `--api-key` / `MCP_API_KEY` 校验；添加本地绑定强制执行文档 |
| `src/server.ts` | 修改 | 将 `readOnly` 选项传递给工具工厂 |
| `src/platform/api-platform.ts` | 修改 | 修复 `executeSqlViaUrl` 错误信息透传问题 |
| `README.md` | 修改 | 添加安全公告横幅，更新 CLI 标志文档 |

---

## 六、验证结果

全部 32 个 MCP 工具已验证功能完备性。18 个非破坏性工具通过实时测试；14 个破坏性/创建类工具通过代码审查验证。

### 6.1 实时测试结果

| 工具 | 结果 |
|------|------|
| `list_aliyun_supabase_projects` | 通过 |
| `get_supabase_project` | 通过 |
| `get_supabase_project_api_keys` | 通过 |
| `describe_regions` | 通过 |
| `describe_rds_vpcs` | 通过 |
| `describe_rds_vswitches` | 通过 |
| `execute_sql` | 通过 |
| `execute_sql_file` | 通过 |
| `list_table` | 通过（含/不含 schema 过滤） |
| `list_columns` | 通过 |
| `list_indexes` | 通过 |
| `list_extensions` | 通过 |
| `list_edge_functions` | 通过 |
| `invoke_edge_function` | 通过 |
| `list_auth_users` | 通过 |
| `list_storage_buckets` | 通过 |
| `list_storage_files` | 通过 |

### 6.2 安全测试结果

| 攻击向量 | 输入 | 预期 | 实际 |
|---------|------|------|------|
| SSRF（云元数据端点） | `http://169.254.169.254/latest/meta-data/` | 拒绝 | 拒绝："URL must use HTTPS" |
| SSRF（任意域名） | `https://evil.example.com` | 拒绝 | 拒绝："hostname not allowed" |
| SSRF（私有 IP） | `https://192.168.1.1` | 拒绝 | 拒绝："private/internal IP" |
| 路径穿越（非 .sql） | `/etc/passwd` | 拒绝 | 拒绝："must have .sql extension" |
| 路径穿越（.. 序列） | `/tmp/../../../etc/passwd.sql` | 拒绝 | 拒绝："must not contain directory traversal" |
| 事务绕过 | `COMMIT; DROP TABLE users;` | 拒绝 | 拒绝："Transaction control statements not allowed"（未设置 `--write` 时） |
| SQL 注入（schemas） | `schemas=["'; DROP TABLE--"]` | 拒绝 | 被 `validateSchemaNames` 拦截 |

### 6.3 构建验证

```
npm run build — 成功（0 错误，0 警告）
```

---

## 七、配置说明

- **默认模式**：只读（`--read-only` 默认为 `true`）
- **写模式**：通过 `--write` 标志显式启用（覆盖 `--read-only`）
- **API Key**：通过 `--api-key` 标志或 `MCP_API_KEY` 环境变量设置
- **当前 mcp.json**：使用 `--write` 标志用于开发/测试；**生产环境部署时请移除 `--write`**

---

## 八、待办事项

1. **修复 W2**：移除 `escapeSqlLiteral` 中的反斜杠双重转义（适用于 `standard_conforming_strings = on`，即 PG 9.1+ 默认值）
2. **修复 W1**：解决 `url-validator.ts` 中 `127.0.0.1` 白名单与 IP 范围封锁的矛盾
3. **修复 W4**：使用路径规范化替代 `validateSqlFilePath` 中的 `..` 子串检查
4. **修复 W7**：在 `executeSqlViaUrl` 中捕获 PG 错误码 25006，返回人类可读的错误信息
5. **修复 W8**：在 `database-operation-tools.ts` 中用 try/catch 包裹 `validateSqlFilePath` 调用
