"use strict";

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

function nowIso() {
  return new Date().toISOString();
}

function todayIso() {
  return nowIso().slice(0, 10);
}

function safeFileName(value, fallback = "record") {
  return String(value || fallback)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || fallback;
}

function slugify(value, fallback = "item") {
  return String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || fallback;
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(targetPath) {
  await fs.mkdir(targetPath, { recursive: true });
}

async function readJson(filePath, fallback = null) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }
    throw new Error(`Unable to read JSON at ${filePath}: ${error.message}`);
  }
}

async function writeJson(filePath, data) {
  await ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  try {
    await fs.rename(tempPath, filePath);
  } catch (error) {
    if (!["EPERM", "EEXIST", "EBUSY"].includes(error.code)) {
      throw error;
    }
    await fs.copyFile(tempPath, filePath);
    await fs.rm(tempPath, { force: true });
  }
}

async function readText(filePath, fallback = "") {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }
    throw new Error(`Unable to read text at ${filePath}: ${error.message}`);
  }
}

async function writeText(filePath, value) {
  await ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempPath, value, "utf8");
  try {
    await fs.rename(tempPath, filePath);
  } catch (error) {
    if (!["EPERM", "EEXIST", "EBUSY"].includes(error.code)) {
      throw error;
    }
    await fs.copyFile(tempPath, filePath);
    await fs.rm(tempPath, { force: true });
  }
}

async function appendJsonLine(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await fs.appendFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

function resolveInside(baseFolder, relativePath) {
  const resolved = path.resolve(baseFolder, relativePath);
  const normalizedBase = path.resolve(baseFolder);
  if (resolved !== normalizedBase && !resolved.startsWith(`${normalizedBase}${path.sep}`)) {
    throw new Error("Path is outside the selected data folder.");
  }
  return resolved;
}

async function copyFileUnique(sourcePath, destinationFolder, prefix = "") {
  await ensureDir(destinationFolder);
  const extension = path.extname(sourcePath);
  const baseName = safeFileName(path.basename(sourcePath, extension), "file");
  let candidate = `${prefix}${baseName}${extension}`;
  let counter = 1;
  while (await pathExists(path.join(destinationFolder, candidate))) {
    candidate = `${prefix}${baseName}-${counter}${extension}`;
    counter += 1;
  }
  const destinationPath = path.join(destinationFolder, candidate);
  await fs.copyFile(sourcePath, destinationPath);
  return destinationPath;
}

function randomId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function toDisplayList(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).filter(Boolean)));
}

function parseJsonLines(rawText) {
  return String(rawText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function daysUntil(dateText) {
  if (!dateText) {
    return null;
  }
  const target = new Date(dateText);
  if (Number.isNaN(target.getTime())) {
    return null;
  }
  const today = new Date(todayIso());
  const delta = target.getTime() - today.getTime();
  return Math.round(delta / 86400000);
}

function getLockOwner() {
  return {
    hostname: os.hostname(),
    username: os.userInfo().username,
    pid: process.pid
  };
}

module.exports = {
  appendJsonLine,
  copyFileUnique,
  daysUntil,
  ensureDir,
  getLockOwner,
  normalizeText,
  nowIso,
  parseJsonLines,
  pathExists,
  randomId,
  readJson,
  readText,
  resolveInside,
  safeFileName,
  slugify,
  todayIso,
  toDisplayList,
  writeJson,
  writeText
};
