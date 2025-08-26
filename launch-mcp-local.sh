#!/bin/bash

# 定义日志文件的路径
LOG_FILE="/tmp/mcp-server.log"

# 清空旧的日志文件（可选）
> "$LOG_FILE"

echo "MCP Wrapper Script started. Logging to $LOG_FILE" >> "$LOG_FILE"

# 执行本地构建的MCP服务器命令
# 关键：将标准错误(2)重定向(>>)到日志文件
# 标准输出(1)不做任何处理，这样Cursor才能接收到协议消息
node /Users/zhangjiachi/Documents/supabase-mcp/packages/mcp-server-supabase/dist/transports/stdio.js \
     2>> "$LOG_FILE"