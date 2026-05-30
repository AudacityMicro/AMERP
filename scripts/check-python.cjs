"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function commandWorks(command) {
  const result = spawnSync(command, ["--version"], {
    cwd: ROOT,
    encoding: "utf8",
    shell: false,
    stdio: "ignore"
  });
  return result.status === 0;
}

function findPython() {
  const candidates = [
    process.env.CODEX_PYTHON,
    process.env.PYTHON,
    process.platform === "win32" ? "python" : "python3",
    "python"
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (commandWorks(candidate)) {
      return candidate;
    }
  }
  return null;
}

const python = findPython();
if (!python) {
  console.error("Python was not found on PATH.");
  process.exit(1);
}

const scriptsDir = path.join(ROOT, "scripts");
const files = fs.readdirSync(scriptsDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".py"))
  .map((entry) => path.join(scriptsDir, entry.name))
  .sort();

if (!files.length) {
  console.error("No Python scripts found to check.");
  process.exit(1);
}

for (const filePath of files) {
  const result = spawnSync(python, ["-m", "py_compile", filePath], {
    cwd: ROOT,
    encoding: "utf8",
    shell: false,
    stdio: "inherit"
  });
  if (result.status !== 0) {
    console.error(`Python compile failed for ${filePath}.`);
    process.exit(result.status || 1);
  }
}

console.log(`Python compile check passed for ${files.length} files.`);
