"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  collectSubtractNotes,
  collectSubtractPartRowLines,
  parseSubtractHeader,
  parseSubtractPartRows
} = require("../electron/backend/pdf-parsers.cjs");

test("parseSubtractHeader accepts TBD ship dates without dropping the PO number", () => {
  assert.deepEqual(parseSubtractHeader([
    "PO NUMBER ISSUE DATE SHIP DATE",
    "26Z00042 June 1, 2026 TBD"
  ]), {
    purchase_order: "26Z00042",
    issue_date: "June 1, 2026",
    ship_date: "TBD"
  });
});

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

test("collectSubtractPartRowLines skips notes and keeps later revision part rows", () => {
  const lines = [
    "PARTS SPECIFICATION",
    "PART NAME QTY MATERIAL TOLERANCE FINISHING PRINT?",
    "501-01003 1 C101 Copper \u00b1.002 As Machined Yes",
    "NOTES: To be machined by Audacity Micro.",
    "501-01004_Rev2 1 C101 Copper \u00b1.002 As Machined Yes",
    "NOTES: Hole Positions will be inspected by customer.",
    "TOTAL AMOUNT $980.00"
  ];

  const rowLines = collectSubtractPartRowLines(lines, 0);
  const parsed = parseSubtractPartRows(rowLines);

  assert.deepEqual(rowLines, [
    "501-01003 1 C101 Copper \u00b1.002 As Machined Yes",
    "501-01004_Rev2 1 C101 Copper \u00b1.002 As Machined Yes"
  ]);
  assert.deepEqual(parsed.warnings, []);
  assert.deepEqual(parsed.parts.map((part) => part.part_name), ["501-01003", "501-01004_Rev2"]);
});

test("collectSubtractNotes dedupes repeated part notes without part-table rows", () => {
  assert.equal(collectSubtractNotes([
    "501-01003 1 C101 Copper \u00b1.002 As Machined Yes",
    "NOTES: To be machined by Audacity Micro.",
    "501-01004_Rev2 1 C101 Copper \u00b1.002 As Machined Yes",
    "NOTES: To be machined by Audacity Micro.",
    "TOTAL AMOUNT $980.00"
  ]), "To be machined by Audacity Micro.");
});
