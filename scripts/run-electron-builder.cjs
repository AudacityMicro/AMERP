"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const PNPM_VERSION = "10.33.2";

function hasCommand(command) {
  const result = spawnSync(command, ["--version"], {
    cwd: ROOT,
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: "ignore"
  });
  return result.status === 0;
}

function ensurePnpmOnPath(env) {
  if (hasCommand("pnpm")) {
    return env;
  }

  const shimDir = path.join(ROOT, ".tools", "bin");
  fs.mkdirSync(shimDir, { recursive: true });
  fs.writeFileSync(
    path.join(shimDir, "pnpm.cmd"),
    `@echo off\r\nnpx --yes pnpm@${PNPM_VERSION} %*\r\n`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(shimDir, "pnpm"),
    `#!/bin/sh\nexec npx --yes pnpm@${PNPM_VERSION} "$@"\n`,
    { encoding: "utf8", mode: 0o755 }
  );

  return {
    ...env,
    PATH: `${shimDir}${path.delimiter}${env.PATH || ""}`
  };
}

const args = process.argv.slice(2);
const builderCli = require.resolve("electron-builder/cli");
const result = spawnSync(process.execPath, [builderCli, ...args], {
  cwd: ROOT,
  env: ensurePnpmOnPath(process.env),
  shell: false,
  stdio: "inherit"
});

process.exit(result.status ?? 1);
