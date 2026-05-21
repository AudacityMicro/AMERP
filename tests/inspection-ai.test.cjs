"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  _internals
} = require("../electron/backend/inspection-ai.cjs");

test("inspection AI normalization ignores standalone unit text", () => {
  const characteristic = _internals.normalizeExtractedCharacteristic({
    number: "in",
    label: "in",
    units: "in",
    nominal: "in",
    toleranceType: "plusMinus",
    plusTolerance: "",
    minusTolerance: ""
  }, 0);

  assert.equal(characteristic, null);
});

test("inspection AI normalization preserves stacked plus/minus tolerances", () => {
  const characteristic = _internals.normalizeExtractedCharacteristic({
    number: "12",
    label: "Outside diameter",
    units: "in",
    nominal: "0.500 +.005 -.000",
    toleranceType: "plusMinus",
    plusTolerance: "",
    minusTolerance: ""
  }, 0);

  assert.equal(characteristic.nominal, "0.500");
  assert.equal(characteristic.plusTolerance, "+.005");
  assert.equal(characteristic.minusTolerance, "-.000");
});

test("inspection AI normalization keeps numeric GD&T tolerances without standalone nominal", () => {
  const characteristic = _internals.normalizeExtractedCharacteristic({
    number: "3",
    label: "Position",
    units: "in",
    nominal: "",
    toleranceType: "gdandt",
    gdTolerance: "0.010",
    datums: "A B C"
  }, 0);

  assert.equal(characteristic.toleranceType, "gdandt");
  assert.equal(characteristic.gdTolerance, "0.010");
});
