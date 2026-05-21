"use strict";

const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  normalizeText,
  resolveInside,
  safeFileName,
  slugify
} = require("../electron/backend/utils.cjs");

test("safeFileName removes unsafe filesystem characters and keeps a fallback", () => {
  assert.equal(safeFileName(" A/B:C*D? "), "A-B-C-D");
  assert.equal(safeFileName("   ", "record"), "record");
});

test("slugify creates compact lowercase route-safe identifiers", () => {
  assert.equal(slugify("Milling Setup #1"), "milling-setup-1");
  assert.equal(slugify("", "item"), "item");
});

test("resolveInside accepts child paths and rejects traversal", () => {
  const base = path.join(os.tmpdir(), "amerp-test-root");
  assert.equal(resolveInside(base, "jobs/job-1/job.json"), path.resolve(base, "jobs/job-1/job.json"));
  assert.throws(() => resolveInside(base, "../outside.txt"), /outside the selected data folder/i);
});

test("normalizeText lowercases and compacts whitespace", () => {
  assert.equal(normalizeText("  Xometry   Traveler  "), "xometry traveler");
});
