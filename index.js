#!/usr/bin/env node

/**
 * MCP Server for Huawei Cloud OBS (S3-compatible object storage)
 *
 * Provides tools:
 *   - s3_upload:       Upload a local file to OBS, return the object URL
 *   - s3_download:     Download an object from OBS to a local path
 *   - s3_list:         List objects in the bucket
 *   - s3_generate_url: Generate a signed download URL
 *
 * Configuration via environment variables:
 *   OBS_ACCESS_KEY_ID     (required)
 *   OBS_SECRET_ACCESS_KEY (required)
 *   OBS_ENDPOINT          (required, e.g. https://obs.cn-north-4.myhuaweicloud.com)
 *   OBS_BUCKET            (required)
 *   OBS_UPLOAD_PREFIX     (optional, key prefix for uploads, default "uploads/")
 *   OBS_URL_EXPIRES       (optional, signed URL expiry in seconds, default 3600)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const ObsClient = require("esdk-obs-nodejs");

// ─── OBS Client (lazy init) ──────────────────────────────────────────────────

let _obs = null;

function getObsClient() {
  if (_obs) return _obs;

  const ak = process.env.OBS_ACCESS_KEY_ID;
  const sk = process.env.OBS_SECRET_ACCESS_KEY;
  const endpoint = process.env.OBS_ENDPOINT;

  if (!ak || !sk || !endpoint) {
    throw new Error(
      "Missing OBS config. Set: OBS_ACCESS_KEY_ID, OBS_SECRET_ACCESS_KEY, OBS_ENDPOINT, OBS_BUCKET"
    );
  }

  _obs = new ObsClient({
    access_key_id: ak,
    secret_access_key: sk,
    server: endpoint,
  });

  return _obs;
}

function getBucket() {
  const b = process.env.OBS_BUCKET;
  if (!b) throw new Error("OBS_BUCKET environment variable is not set");
  return b;
}

function getUploadPrefix() {
  return process.env.OBS_UPLOAD_PREFIX || "uploads/";
}

function getUrlExpires() {
  return parseInt(process.env.OBS_URL_EXPIRES || "3600", 10);
}

// ─── MCP Server ──────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "obs-s3",
  version: "1.0.0",
});

// Tool: s3_upload
server.tool(
  "s3_upload",
  "Upload a local file to Huawei Cloud OBS. Returns the object key and a signed download URL.",
  {
    file_path: z.string().describe("Absolute path to the local file to upload"),
    key: z.string().optional().describe(
      "Object key in OBS (auto-generated from filename + date prefix if omitted)"
    ),
    content_type: z.string().optional().describe(
      "MIME type (auto-detected from extension if omitted)"
    ),
  },
  async ({ file_path, key, content_type }) => {
    const obs = getObsClient();
    const bucket = getBucket();

    const resolved = path.resolve(file_path);
    if (!fs.existsSync(resolved)) {
      return { content: [{ type: "text", text: `Error: file not found: ${resolved}` }], isError: true };
    }

    const filename = path.basename(resolved);
    const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, "/");
    const objectKey = key || `${getUploadPrefix()}${datePrefix}/${crypto.randomUUID()}_${filename}`;
    const ct = content_type || detectContentType(filename);

    const result = await new Promise((resolve, reject) => {
      obs.uploadFile({
        Bucket: bucket,
        Key: objectKey,
        UploadFile: resolved,
        ContentType: ct,
      }, (err, result) => {
        if (err) reject(new Error(String(err)));
        else resolve(result);
      });
    });

    if (result.CommonMsg.Status >= 300) {
      return {
        content: [{ type: "text", text: `Upload failed: ${result.CommonMsg.Code} - ${result.CommonMsg.Message}` }],
        isError: true,
      };
    }

    const signedUrl = generateSignedUrl(obs, bucket, objectKey, getUrlExpires());

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          key: objectKey,
          filename: filename,
          content_type: ct,
          size_bytes: fs.statSync(resolved).size,
          url: signedUrl,
        }, null, 2),
      }],
    };
  }
);

// Tool: s3_download
server.tool(
  "s3_download",
  "Download an object from Huawei Cloud OBS to a local path.",
  {
    key: z.string().describe("Object key in OBS (the 'key' returned by s3_upload)"),
    output_path: z.string().describe("Local directory or full file path to save the downloaded file"),
  },
  async ({ key, output_path }) => {
    const obs = getObsClient();
    const bucket = getBucket();

    const resolved = path.resolve(output_path);
    let savePath;

    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      savePath = path.join(resolved, path.basename(key));
    } else {
      savePath = resolved;
      const dir = path.dirname(savePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    const result = await new Promise((resolve, reject) => {
      obs.downloadFile({
        Bucket: bucket,
        Key: key,
        DownloadFile: savePath,
      }, (err, result) => {
        if (err) reject(new Error(String(err)));
        else resolve(result);
      });
    });

    if (result.CommonMsg.Status >= 300) {
      return {
        content: [{ type: "text", text: `Download failed: ${result.CommonMsg.Code} - ${result.CommonMsg.Message}` }],
        isError: true,
      };
    }

    const stat = fs.statSync(savePath);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          key: key,
          file_path: savePath,
          size_bytes: stat.size,
        }, null, 2),
      }],
    };
  }
);

// Tool: s3_list
server.tool(
  "s3_list",
  "List objects in the OBS bucket with an optional prefix filter.",
  {
    prefix: z.string().optional().describe("Only list objects with this key prefix"),
    max_keys: z.number().optional().describe("Max number of objects to return (default 100)"),
  },
  async ({ prefix, max_keys }) => {
    const obs = getObsClient();
    const bucket = getBucket();

    const result = await obs.listObjects({
      Bucket: bucket,
      Prefix: prefix || "",
      MaxKeys: max_keys || 100,
    });

    if (result.CommonMsg.Status >= 300) {
      return {
        content: [{ type: "text", text: `List failed: ${result.CommonMsg.Code} - ${result.CommonMsg.Message}` }],
        isError: true,
      };
    }

    const objects = (result.InterfaceResult.Contents || []).map((obj) => ({
      key: obj.Key,
      size: parseInt(obj.Size, 10),
      last_modified: obj.LastModified,
    }));

    return {
      content: [{
        type: "text",
        text: JSON.stringify({ count: objects.length, objects }, null, 2),
      }],
    };
  }
);

// Tool: s3_generate_url
server.tool(
  "s3_generate_url",
  "Generate a signed download URL for an existing object in OBS.",
  {
    key: z.string().describe("Object key in OBS"),
    expires: z.number().optional().describe("URL expiry in seconds (default from OBS_URL_EXPIRES env)"),
  },
  async ({ key, expires }) => {
    const obs = getObsClient();
    const bucket = getBucket();
    const ttl = expires || getUrlExpires();
    const url = generateSignedUrl(obs, bucket, key, ttl);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({ key, url, expires_seconds: ttl }, null, 2),
      }],
    };
  }
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function detectContentType(filename) {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  const map = {
    json: "application/json",
    csv: "text/csv",
    txt: "text/plain",
    md: "text/markdown",
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    zip: "application/zip",
    gz: "application/gzip",
    xml: "application/xml",
    yaml: "text/yaml",
    yml: "text/yaml",
  };
  return map[ext] || "application/octet-stream";
}

function generateSignedUrl(obs, bucket, key, expires) {
  try {
    const res = obs.createSignedUrlSync({
      Method: "GET",
      Bucket: bucket,
      Key: key,
      Expires: expires,
    });
    return res.SignedUrl;
  } catch {
    const endpoint = (process.env.OBS_ENDPOINT || "").replace(/^https?:\/\//, "");
    return `https://${bucket}.${endpoint}/${key}`;
  }
}

// ─── Start ───────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[mcp-obs-s3] Server started on stdio");
}

main().catch((err) => {
  console.error("[mcp-obs-s3] Fatal:", err);
  process.exit(1);
});
