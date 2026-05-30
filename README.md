# MCP Server for Huawei Cloud OBS

MCP (Model Context Protocol) Server，用于与华为云 OBS（对象存储服务）交互。提供文件上传、下载、列表和签名 URL 生成功能。

## 工具列表

| 工具 | 说明 | 输入 | 输出 |
|------|------|------|------|
| `s3_upload` | 上传本地文件到 OBS | `file_path`, `key?`, `content_type?` | `{ key, url, filename, size_bytes }` |
| `s3_download` | 从 OBS 下载文件到本地 | `key`, `output_path` | `{ file_path, size_bytes }` |
| `s3_list` | 列出 bucket 中的对象 | `prefix?`, `max_keys?` | `{ count, objects[] }` |
| `s3_generate_url` | 生成签名下载 URL | `key`, `expires?` | `{ key, url, expires_seconds }` |

## 环境变量

| 变量 | 必填 | 说明 | 示例 |
|------|------|------|------|
| `OBS_ACCESS_KEY_ID` | 是 | 华为云 AK | `HPMGxxxxxxxxxx` |
| `OBS_SECRET_ACCESS_KEY` | 是 | 华为云 SK | `xxxxxxxxxxxxxxxxxx` |
| `OBS_ENDPOINT` | 是 | OBS 终端节点 | `https://obs.cn-n-north-4.myhuaweicloud.com` |
| `OBS_BUCKET` | 是 | 桶名称 | `my-bucket` |
| `OBS_UPLOAD_PREFIX` | 否 | 上传 key 前缀 | `uploads/` (默认) |
| `OBS_URL_EXPIRES` | 否 | 签名 URL 有效期(秒) | `3600` (默认) |

## 安装

```bash
cd mcp-obs-s3
npm install
npm run build
```

## 启动

MCP Server 通过 stdio 通信，由宿主程序（OpenFang）自动拉起：

```bash
OBS_ACCESS_KEY_ID=xxx \
OBS_SECRET_ACCESS_KEY=xxx \
OBS_ENDPOINT=https://obs.cn-north-4.myhuaweicloud.com \
OBS_BUCKET=my-bucket \
node dist/index.js
```

## 在 OpenFang 中配置

在 `~/.openfang/config.toml` 中添加：

```toml
[[mcp_servers]]
name = "obs-s3"
transport = { type = "stdio", command = "node", args = ["/path/to/mcp-obs-s3/dist/index.js"] }
timeout_secs = 120

[env]
OBS_ACCESS_KEY_ID = "your-ak"
OBS_SECRET_ACCESS_KEY = "your-sk"
OBS_ENDPOINT = "https://obs.cn-north-4.myhuaweicloud.com"
OBS_BUCKET = "your-bucket"
```

工具会被自动注册为：
- `mcp_obs_s3_s3_upload`
- `mcp_obs_s3_s3_download`
- `mcp_obs_s3_s3_list`
- `mcp_obs_s3_s3_generate_url`

## 在 Manifest Hand 中使用

Manifest Hand 的系统 prompt 会调用 `mcp_obs_s3_s3_upload` 和 `mcp_obs_s3_s3_download`：

1. 用户上传文件 → Hand agent 调用 `mcp_obs_s3_s3_upload({ file_path: "/tmp/openfang_uploads/xxx", content_type: "application/zip" })` → 获取 `url` 和 `key`
2. Agent 通过 A2A 将 `url` 发送给外部 manifest agent
3. 外部 agent 处理完毕，返回 manifest 的 `key`
4. Agent 调用 `mcp_obs_s3_s3_download({ key: "xxx", output_path: "output/manifest_xxx.json" })` → 保存到 workspace
5. 用户通过 `/api/agents/{id}/output/manifest_xxx.json` 下载

## 支持的文件类型

自动检测 Content-Type：

| 分类 | 格式 |
|------|------|
| 图片 | PNG, JPEG, GIF, WebP |
| 文本 | TXT, CSV, MD, JSON, XML, YAML |
| Office | XLSX, XLS, DOCX, DOC, PPTX |
| 压缩 | ZIP, GZ |
| 其他 | PDF |

未识别的扩展名默认 `application/octet-stream`。

## 开发测试

```bash
# 安装依赖
npm install

# 构建
npm run build

# 监听模式开发
npm run dev

# 直接运行（手动输入 MCP JSON-RPC）
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | \
  OBS_ACCESS_KEY_ID=xxx OBS_SECRET_ACCESS_KEY=xxx OBS_ENDPOINT=https://obs.cn-north-4.myhuaweicloud.com OBS_BUCKET=test \
  node dist/index.js
```

## 技术栈

- **TypeScript** + ES2022 + ESM modules
- `@modelcontextprotocol/sdk` — MCP Server SDK
- `esdk-obs-nodejs` — 华为云 OBS SDK (CJS, via `createRequire` interop)
- `zod` — 参数 schema 校验
