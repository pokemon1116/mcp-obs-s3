// .github/scripts/glm-review.mjs
// 用智谱 GLM 对 PR diff 做代码审查, 结果写入第一个位置参数指定的文件。
// 用 node:https 直连 (跨洋连接给足超时 + 自动重试), 无外部依赖。
// 环境变量:
//   ZHIPUAI_API_KEY  智谱 API Key (必填)
//   ZHIPU_BASE_URL   默认 https://open.bigmodel.cn/api/paas/v4
//   ZHIPU_MODEL      默认 glm-4.6
//   PR_NUMBER        PR 编号 (可选)
//   META_FILE        PR 元数据 JSON ({title, body}) 路径 (可选, 优先于下面两个)
//   PR_TITLE/PR_BODY PR 元信息 (可选回退)
//   DIFF_FILE        diff 文件路径 (必填)

import https from "node:https";
import { readFileSync, writeFileSync } from "node:fs";

const apiKey = process.env.ZHIPUAI_API_KEY;
const baseUrl = (process.env.ZHIPU_BASE_URL || "https://open.bigmodel.cn/api/paas/v4").replace(/\/+$/, "");
const model = process.env.ZHIPU_MODEL || "glm-4.6";
const diffFile = process.env.DIFF_FILE;
const outFile = process.argv[2];

if (!apiKey) {
  console.error("ZHIPUAI_API_KEY 未设置");
  process.exit(2);
}
if (!diffFile) {
  console.error("DIFF_FILE 未设置");
  process.exit(2);
}
if (!outFile) {
  console.error("用法: node glm-review.mjs <输出文件>");
  process.exit(2);
}

const diff = readFileSync(diffFile, "utf8");
if (!diff.trim()) {
  console.log("空 diff, 跳过审查。");
  writeFileSync(outFile, "");
  process.exit(0);
}

// 优先从 metadata json 读取 PR 标题/描述(支持 issue_comment 触发, 避免多行 env 问题),
// 回退到 PR_TITLE / PR_BODY 环境变量。
let prTitle = process.env.PR_TITLE || "";
let prBody = (process.env.PR_BODY || "").slice(0, 2000);
if (process.env.META_FILE) {
  try {
    const meta = JSON.parse(readFileSync(process.env.META_FILE, "utf8"));
    prTitle = prTitle || meta.title || "";
    prBody = prBody || (meta.body || "").slice(0, 2000);
  } catch (e) {
    console.error("读取 META_FILE 失败:", e.message);
  }
}
const prNumber = process.env.PR_NUMBER || "(unknown)";

const system =
  "你是一名资深 TypeScript / Node.js 代码审查员, 正在审查仓库 " +
  "pokemon1116/mcp-obs-s3 (MCP Server for Huawei Cloud OBS, S3 兼容)。" +
  "只针对本次 diff 给出可操作、就事论事的反馈, 不要泛泛而谈。";

const user = `请审查以下 Pull Request 的代码变更。

PR #${prNumber}: ${prTitle}
${prBody ? `\nPR 描述:\n${prBody}\n` : ""}
变更 diff:
\`\`\`diff
${diff}
\`\`\`

审查重点(本项目特有):
1. 安全性: 严禁硬编码 OBS 的 AK/SK 或任何凭证; 日志与报错不得泄露密钥。
2. MCP 契约: tools 的 zod schema 与输入校验是否严谨; 返回结构是否符合 MCP 协议。
3. 正确性: OBS SDK 调用(上传/下载/列表/签名 URL)、错误处理、异步逻辑。
4. 健壮性: 缺失环境变量、SDK/网络异常、边界条件(空桶 / 大文件 / key 前缀)。
5. 可维护性: 类型定义、命名、明显重复或可简化处。

输出格式(简洁 Markdown, 中文):
- **变更摘要**: 1-2 句话说明本 PR 做了什么。
- **审查结论**: 按 🔴必须修改 / 🟡建议优化 / 🟢看起来不错 分级, 每条给出 文件:行号 与理由; 没有问题的等级可省略。
- 只针对本次 diff, 语气友好。`;

const payload = {
  model,
  messages: [
    { role: "system", content: system },
    { role: "user", content: user },
  ],
  temperature: 0.2,
  max_tokens: 1500,
};

// node:https 直连, 带整体超时; 连接握手不受 undici 默认 10s 限制。
function postChat(timeoutMs) {
  return new Promise((resolve, reject) => {
    const url = new URL(baseUrl + "/chat/completions");
    const body = JSON.stringify(payload);
    const req = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode, data }));
      }
    );
    const timer = setTimeout(() => req.destroy(new Error(`请求超过 ${timeoutMs}ms 超时`)), timeoutMs);
    req.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    req.on("close", () => clearTimeout(timer));
    req.write(body);
    req.end();
  });
}

const MAX_ATTEMPTS = 4;
let result;
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  try {
    result = await postChat(180000);
    break;
  } catch (err) {
    console.error(`第 ${attempt}/${MAX_ATTEMPTS} 次请求失败: ${err.message}`);
    if (attempt === MAX_ATTEMPTS) {
      console.error("已达最大重试次数, 放弃。");
      console.error(
        "排查: 若持续为超时/ECONNRESET, 多为 GitHub runner(美国) 到 open.bigmodel.cn 跨洋连接不稳;\n" +
          "可重跑 workflow; 若长期如此需考虑自建 runner 或代理。"
      );
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, attempt * 4000));
  }
}

if (result.status >= 400) {
  console.error(`智谱接口返回 ${result.status}: ${result.data.slice(0, 500)}`);
  process.exit(1);
}

let data;
try {
  data = JSON.parse(result.data);
} catch {
  console.error("无法解析响应 JSON:", result.data.slice(0, 500));
  process.exit(1);
}

const content = data?.choices?.[0]?.message?.content?.trim() || "";
if (!content) {
  console.error("GLM 未返回内容:", JSON.stringify(data).slice(0, 500));
  process.exit(1);
}

const body = `### 🤖 GLM 代码审查 (\`${model}\`)

${content}
`;
writeFileSync(outFile, body, "utf8");
console.log(`审查完成, 已写入 ${outFile} (${content.length} 字符)`);
