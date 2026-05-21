"use strict";

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const EXCLUDED_PARTS = new Set([
  ".git",
  "node_modules",
  "dist",
  ".tools",
  ".smoke-data",
  ".smoke-data-old"
]);

const FILENAME_PATTERNS = [
  /(^|[\\/])\.env(\.|$)/i,
  /\.(pem|p12|pfx|key|crt|cer)$/i,
  /(^|[\\/])id_(rsa|dsa|ecdsa|ed25519)(\.|$)/i
];

const CONTENT_PATTERNS = [
  { name: "private key", regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "OpenAI API key", regex: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: "GitHub token", regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{30,}\b/ },
  { name: "GitHub fine-grained token", regex: /\bgithub_pat_[A-Za-z0-9_]{30,}\b/ },
  { name: "AWS access key", regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "Slack token", regex: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
  { name: "generic assigned secret", regex: /\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret)\b\s*[:=]\s*["'][^"']{12,}["']/i }
];

function isExcluded(relativePath) {
  return relativePath.split(/[\\/]/).some((part) => EXCLUDED_PARTS.has(part) || part.startsWith(".smoke-data"));
}

function trackedFiles() {
  try {
    return execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((relativePath) => !isExcluded(relativePath));
  } catch {
    const files = [];
    const walk = (folder) => {
      for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
        const fullPath = path.join(folder, entry.name);
        const relativePath = path.relative(ROOT, fullPath);
        if (isExcluded(relativePath)) {
          continue;
        }
        if (entry.isDirectory()) {
          walk(fullPath);
        } else {
          files.push(relativePath);
        }
      }
    };
    walk(ROOT);
    return files;
  }
}

const findings = [];
for (const relativePath of trackedFiles()) {
  const normalized = relativePath.replaceAll("\\", "/");
  if (FILENAME_PATTERNS.some((pattern) => pattern.test(normalized))) {
    findings.push(`${relativePath}: sensitive-looking filename`);
    continue;
  }

  const fullPath = path.join(ROOT, relativePath);
  let raw;
  try {
    raw = fs.readFileSync(fullPath);
  } catch {
    continue;
  }
  if (raw.includes(0)) {
    continue;
  }
  const text = raw.toString("utf8");
  for (const pattern of CONTENT_PATTERNS) {
    if (pattern.regex.test(text)) {
      findings.push(`${relativePath}: possible ${pattern.name}`);
    }
  }
}

if (findings.length) {
  console.error("Secret scan failed:");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log("Secret scan passed. No high-confidence secrets found.");
