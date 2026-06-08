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

test("inspection AI normalization clamps multi-page balloon placement and warns", () => {
  const warnings = [];
  const characteristic = _internals.normalizeExtractedCharacteristic({
    number: "4",
    label: "Pocket depth",
    units: "in",
    nominal: "0.250",
    toleranceType: "plusMinus",
    plusTolerance: "+0.005",
    minusTolerance: "-0.000",
    confidence: "medium",
    pageNumber: 9,
    x: 1.25,
    y: -0.2
  }, 0, { pageCount: 3, warnings });

  assert.equal(characteristic.balloon.pageNumber, 3);
  assert.equal(characteristic.balloon.x, 1);
  assert.equal(characteristic.balloon.y, 0);
  assert.equal(characteristic.confidence, "medium");
  assert.match(warnings.join("\n"), /clamped to page 3/);
  assert.match(warnings.join("\n"), /x balloon coordinate/);
  assert.match(warnings.join("\n"), /y balloon coordinate/);
  assert.match(warnings.join("\n"), /medium confidence/);
});

test("inspection AI normalization applies assumed general tolerance when missing", () => {
  const warnings = [];
  const characteristic = _internals.normalizeExtractedCharacteristic({
    number: "8",
    label: "Slot width",
    units: "in",
    nominal: "0.250",
    toleranceType: "plusMinus",
    plusTolerance: "",
    minusTolerance: "",
    confidence: "high"
  }, 0, {
    warnings,
    assumedGeneralTolerances: {
      enabled: true,
      rules: [
        { decimalPlaces: 2, tolerance: "0.005" },
        { decimalPlaces: 3, tolerance: "+/-0.001" }
      ]
    }
  });

  assert.equal(characteristic.toleranceType, "plusMinus");
  assert.equal(characteristic.plusTolerance, "+0.001");
  assert.equal(characteristic.minusTolerance, "-0.001");
  assert.match(characteristic.notes, /Assumed general tolerance/);
  assert.match(warnings.join("\n"), /Applied assumed general tolerance/);
});

test("inspection AI normalization does not override explicit tolerances", () => {
  const characteristic = _internals.normalizeExtractedCharacteristic({
    number: "9",
    label: "Overall length",
    units: "in",
    nominal: "1.25",
    toleranceType: "plusMinus",
    plusTolerance: "+0.010",
    minusTolerance: "-0.005",
    confidence: "high"
  }, 0, {
    assumedGeneralTolerances: {
      enabled: true,
      rules: [{ decimalPlaces: 2, tolerance: "0.001" }]
    }
  });

  assert.equal(characteristic.plusTolerance, "+0.010");
  assert.equal(characteristic.minusTolerance, "-0.005");
  assert.doesNotMatch(characteristic.notes || "", /Assumed general tolerance/);
});

test("inspection AI assumed general tolerance can be disabled", () => {
  const characteristic = _internals.normalizeExtractedCharacteristic({
    number: "10",
    label: "Depth",
    units: "in",
    nominal: "0.2500",
    toleranceType: "plusMinus",
    plusTolerance: "",
    minusTolerance: "",
    confidence: "high"
  }, 0, {
    assumedGeneralTolerances: {
      enabled: false,
      rules: [{ decimalPlaces: 4, tolerance: "0.0005" }]
    }
  });

  assert.equal(characteristic.plusTolerance, "");
  assert.equal(characteristic.minusTolerance, "");
});
