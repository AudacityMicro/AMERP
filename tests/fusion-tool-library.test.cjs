"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { parseFusionToolLibraryKanbanItems } = require("../electron/backend/fusion-tool-library.cjs");

test("parseFusionToolLibraryKanbanItems dedupes Fusion presets into one Kanban card", () => {
  const csv = [
    "\"Tool Index (tool_index)\",\"Preset Name (preset_name)\",\"Type (tool_type)\",\"Description (tool_description)\",\"Diameter (tool_diameter)\",\"Number (tool_number)\",\"Unit (tool_unit)\",\"Holder Description (holder_description)\",\"Product ID (tool_productId)\",\"Product Link (tool_productLink)\",\"Vendor (tool_vendor)\",\"Number of Flutes (tool_numberOfFlutes)\",\"Material (tool_material)\",\"Flute Length (tool_fluteLength)\",\"Overall Length (tool_overallLength)\"",
    "1,\"Rough\",\"flat end mill\",\"1/4 Flat End Mill\",0.25,10,\"inches\",\"CAT40 Holder\",\"EM250\",\"https://example.com/em250\",\"Harvey\",4,\"carbide\",0.75,2.5",
    "1,\"Finish\",\"flat end mill\",\"1/4 Flat End Mill\",0.25,10,\"inches\",\"CAT40 Holder\",\"EM250\",\"https://example.com/em250\",\"Harvey\",4,\"carbide\",0.75,2.5"
  ].join("\n");

  const cards = parseFusionToolLibraryKanbanItems(csv, "tools.csv");
  assert.equal(cards.length, 1);
  assert.equal(cards[0].itemName, "T10 - 1/4 Flat End Mill");
  assert.equal(cards[0].internalInventoryNumber, "");
  assert.equal(cards[0].vendor, "Harvey");
  assert.equal(cards[0].purchaseUrl, "https://example.com/em250");
  assert.equal(cards[0].category, "Cutting Tools");
  assert.equal(cards[0].needsReview, true);
  assert.equal(cards[0].orderingNotes, "");
  assert.match(cards[0].description, /Diameter 0.25 in/);
});

test("parseFusionToolLibraryKanbanItems falls back when product link is missing", () => {
  const csv = [
    "\"Preset Name (preset_name)\",\"Type (tool_type)\",\"Description (tool_description)\",\"Diameter (tool_diameter)\",\"Number (tool_number)\",\"Unit (tool_unit)\"",
    "\"Rough\",\"ball end mill\",\"1/8 Ball End Mill\",0.125,42,\"inches\""
  ].join("\n");

  const cards = parseFusionToolLibraryKanbanItems(csv, "tools.csv");
  assert.equal(cards.length, 1);
  assert.equal(cards[0].itemName, "T42 - 1/8 Ball End Mill");
  assert.equal(cards[0].internalInventoryNumber, "");
  assert.match(cards[0].description, /Diameter 0.125 in/);
});
