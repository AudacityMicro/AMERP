"use strict";

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const CHECK_EXTENSIONS = new Set([".cjs", ".mjs"]);
const CHECK_ROOTS = ["electron", "scripts"];
const EXCLUDED_DIRS = new Set(["node_modules", "dist", ".git", ".tools"]);

function walk(folder, files = []) {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    if (EXCLUDED_DIRS.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else if (CHECK_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = CHECK_ROOTS
  .map((relative) => path.join(ROOT, relative))
  .filter((folder) => fs.existsSync(folder))
  .flatMap((folder) => walk(folder));

if (!files.length) {
  throw new Error("No Node syntax-checkable files found.");
}

for (const file of files) {
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}

console.log(`Syntax check passed for ${files.length} Node files.`);
