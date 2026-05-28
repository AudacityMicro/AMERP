"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { parseSubtractPartRows } = require("../electron/backend/pdf-parsers.cjs");

test("parseSubtractPartRows groups wrapped material lines around a Subtract PO part row", () => {
  const parsed = parseSubtractPartRows([
    "1018 Steel - Cosmetic",
    "130T0364P0001 15 ±.005 As Machined Yes",
    "Finish"
  ]);

  assert.deepEqual(parsed.warnings, []);
  assert.deepEqual(parsed.parts, [
    {
      part_name: "130T0364P0001",
      quantity: "15",
      material: "1018 Steel - Cosmetic Finish",
      tolerance: "±.005",
      finishing: "As Machined",
      print_required: "Yes"
    }
  ]);
});

test("parseSubtractPartRows preserves single-line Subtract PO part rows", () => {
  const parsed = parseSubtractPartRows([
    "Rim Arm 2 6061 Aluminum ±.005 Black Anodize No"
  ]);

  assert.deepEqual(parsed.warnings, []);
  assert.deepEqual(parsed.parts, [
    {
      part_name: "Rim Arm",
      quantity: "2",
      material: "6061 Aluminum",
      tolerance: "±.005",
      finishing: "Black Anodize",
      print_required: "No"
    }
  ]);
});
