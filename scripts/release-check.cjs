"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function spawnCommand(command, args, options = {}) {
  const isWindowsCommandScript = process.platform === "win32" && /\.(?:cmd|bat)$/i.test(command);
  if (isWindowsCommandScript) {
    return spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", command, ...args], {
      ...options,
      shell: false
    });
  }
  return spawnSync(command, args, {
    ...options,
    shell: false
  });
}

function runStep(name, command, args) {
  console.log("");
  console.log(`==> ${name}`);
  const result = spawnCommand(command, args, {
    cwd: ROOT,
    stdio: "inherit"
  });
  if (result.status !== 0) {
    throw new Error(`${name} failed with exit code ${result.status ?? 1}.`);
  }
}

function commandWorks(command) {
  const result = spawnCommand(command, ["--version"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: "ignore"
  });
  return result.status === 0;
}

function findTrivy() {
  if (commandWorks("trivy")) {
    return "trivy";
  }
  if (process.platform !== "win32") {
    return null;
  }

  const roots = [
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Microsoft", "WinGet", "Links") : "",
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Microsoft", "WindowsApps") : ""
  ].filter(Boolean);
  for (const root of roots) {
    const candidate = path.join(root, "trivy.exe");
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  const wingetPackages = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Microsoft", "WinGet", "Packages") : "";
  if (!wingetPackages || !fs.existsSync(wingetPackages)) {
    return null;
  }

  const stack = [wingetPackages];
  while (stack.length) {
    const folder = stack.pop();
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const fullPath = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name.toLowerCase() === "trivy.exe" && fullPath.includes("AquaSecurity.Trivy")) {
        return fullPath;
      }
    }
  }
  return null;
}

try {
  const npm = npmCommand();
  runStep("Node syntax checks", npm, ["run", "check:syntax", "--silent"]);
  runStep("Python compile checks", npm, ["run", "check:python", "--silent"]);
  runStep("Unit tests", npm, ["test", "--silent"]);
  runStep("Dependency audit", npm, ["run", "audit:deps", "--silent"]);
  runStep("Secret scan", npm, ["run", "secret:scan", "--silent"]);
  runStep("Production build", npm, ["run", "build", "--silent"]);

  const trivy = findTrivy();
  if (!trivy) {
    throw new Error("Trivy is required for public beta release checks. Install Trivy and rerun npm run release:check.");
  }

  runStep("Trivy filesystem scan", trivy, [
    "fs",
    "--exit-code", "1",
    "--severity", "UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL",
    "--ignore-unfixed",
    "--skip-dirs", "node_modules",
    "--skip-dirs", "dist",
    "--skip-dirs", "release",
    "--skip-dirs", ".git",
    "--skip-dirs", ".tools",
    "--skip-dirs", ".smoke-data-release",
    "--skip-dirs", ".smoke-data-user",
    "."
  ]);

  console.log("");
  console.log("Release checks passed.");
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
