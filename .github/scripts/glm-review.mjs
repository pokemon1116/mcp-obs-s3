// .github/scripts/glm-review.mjs
// 用智谱 GLM 对 PR diff 做代码审查, 结果写入第一个位置参数指定的文件。
// 依赖 Node 18+ 内置 fetch。环境变量:
//   ZHIPUAI_API_KEY  智谱 API Key (必填)
//   ZHIPU_BASE_URL   默认 https://open.bigmodel.cn/api/paas/v4
//   ZHIPU_MODEL      默认 glm-4.6
//   PR_NUMBER / PR_TITLE / PR_BODY  PR 元信息
//   DIFF_FILE        diff 文件路径 (必填)

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

const prNumber = process.env.PR_NUMBER || "(unknown)";
const prTitle = process.env.PR_TITLE || "";
const prBody = (process.env.PR_BODY || "").slice(0, 2000);

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

let res;
try {
  res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
      max_tokens: 1500,
    }),
  });
} catch (err) {
  console.error("请求智谱接口失败:", err.message);
  process.exit(1);
}

if (!res.ok) {
  const text = await res.text();
  console.error(`智谱接口返回 ${res.status}: ${text}`);
  process.exit(1);
}

const data = await res.json();
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
