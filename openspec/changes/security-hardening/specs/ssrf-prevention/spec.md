## 新增需求

### 需求：URL 主机名白名单
所有接受 URL 参数的 MCP 工具，在发起任何 HTTP 请求前，必须根据允许的主机名模式白名单校验 URL 主机名。允许的模式为：
- `*.supabase.opentrust.net`（阿里云 Supabase 实例）
- `*.supabase.co`（Supabase Cloud 实例）
- `localhost` 和 `127.0.0.1`（本地开发）

#### 场景：允许的阿里云 Supabase URL
- **当** 工具收到 URL `sbp-xxx.supabase.opentrust.net`
- **则** URL 通过校验，工具正常执行

#### 场景：允许的 Supabase Cloud URL
- **当** 工具收到 URL `xyzproject.supabase.co`
- **则** URL 通过校验，工具正常执行

#### 场景：云元数据端点被阻止
- **当** 工具收到 URL `169.254.169.254`
- **则** 工具以"不允许的主机名"错误拒绝该 URL

#### 场景：私有 IP 地址被阻止
- **当** 工具收到 URL `192.168.1.1`
- **则** 工具以"私有/内部 IP"错误拒绝该 URL

#### 场景：任意域名被阻止
- **当** 工具收到 URL `evil.example.com`
- **则** 工具以"不允许的主机名"错误拒绝该 URL

### 需求：HTTPS 强制
URL 必须使用 HTTPS 协议。仅 localhost（`localhost` 和 `127.0.0.1`）允许使用 HTTP。

#### 场景：HTTPS URL 被接受
- **当** 工具收到 URL `https://sbp-xxx.supabase.opentrust.net`
- **则** URL 通过校验

#### 场景：非 localhost 的 HTTP URL 被拒绝
- **当** 工具收到 URL `http://sbp-xxx.supabase.opentrust.net`
- **则** 工具以"必须使用 HTTPS"错误拒绝该 URL

#### 场景：localhost 的 HTTP URL 被接受
- **当** 工具收到 URL `http://127.0.0.1:54321`
- **则** URL 通过校验

### 需求：非标准端口限制
使用非标准端口（HTTPS 非 443、HTTP 非 80）的 URL 必须被拒绝，localhost URL 除外。

#### 场景：默认 HTTPS 端口被接受
- **当** 工具收到 URL `https://sbp-xxx.supabase.opentrust.net:443`
- **则** URL 通过校验

#### 场景：非 localhost 的非标准端口被拒绝
- **当** 工具收到 URL `https://sbp-xxx.supabase.opentrust.net:8080`
- **则** 工具以"非标准端口"错误拒绝该 URL

### 需求：协议方案限制
使用 HTTP 或 HTTPS 以外协议（例如 `ftp://`、`file://`）的 URL 必须被拒绝。

#### 场景：FTP URL 被拒绝
- **当** 工具收到 URL `ftp://sbp-xxx.supabase.opentrust.net`
- **则** 工具以"无效协议"错误拒绝该 URL

### 需求：URL 自动补全协议
当 URL 未提供协议前缀时，在校验前自动补加 `https://`。

#### 场景：无协议的 URL
- **当** 工具收到 URL `sbp-xxx.supabase.opentrust.net`
- **则** 服务器将其视为 `https://sbp-xxx.supabase.opentrust.net` 并据此校验
