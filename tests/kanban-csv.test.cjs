"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  extractKanbanUrlsFromCsv,
  parseKanbanCardsCsv
} = require("../electron/backend/kanban-csv.cjs");

test("extractKanbanUrlsFromCsv finds unique product links in CSV cells", () => {
  const csv = [
    "item,url,notes",
    "End Mill,https://example.com/tool-1,duplicate https://example.com/tool-1",
    "Gloves,,Buy at https://shop.example.com/gloves."
  ].join("\n");

  assert.deepEqual(extractKanbanUrlsFromCsv(csv), [
    "https://example.com/tool-1",
    "https://shop.example.com/gloves"
  ]);
});

test("parseKanbanCardsCsv maps common headers into Kanban card drafts", () => {
  const csv = [
    "Item Name,Inventory Number,Status,Min,Order Qty,Location,Department,Category,Vendor,URL,Pack Size,Description,Notes",
    "1/4 End Mill,TOOL-0001,Needs Review,2,4,Tool Crib A1,Machining,Cutting Tools,Harvey,https://example.com/endmill,Pack of 1,Carbide end mill,Keep two on hand",
    "Nitrile Gloves,SHOP-0002,Active,1 box,3 boxes,Assembly Shelf,Assembly,PPE,McMaster-Carr,https://example.com/gloves,Box of 100,Disposable gloves,Medium preferred"
  ].join("\n");

  const cards = parseKanbanCardsCsv(csv, "kanban.csv");
  assert.equal(cards.length, 2);
  assert.equal(cards[0].sourceFile, "kanban.csv");
  assert.equal(cards[0].sourceRow, 2);
  assert.equal(cards[0].itemName, "1/4 End Mill");
  assert.equal(cards[0].internalInventoryNumber, "TOOL-0001");
  assert.equal(cards[0].minimumLevel, "2");
  assert.equal(cards[0].orderQuantity, "4");
  assert.equal(cards[0].storageLocation, "Tool Crib A1");
  assert.equal(cards[0].category, "Cutting Tools");
  assert.equal(cards[0].packSize, "Pack of 1");
  assert.equal(cards[0].description, "Carbide end mill");
  assert.equal(cards[0].orderingNotes, "Keep two on hand");
  assert.equal(cards[0].status, "Needs Review");
  assert.equal(cards[0].needsReview, true);
  assert.equal(cards[1].status, "Active");
  assert.equal(cards[1].needsReview, false);
  assert.equal(cards[1].active, true);
});

test("parseKanbanCardsCsv supports archived and unprinted statuses", () => {
  const csv = [
    "name,sku,status",
    "Old Tape,SHOP-0004,Archived",
    "Shop Towels,SHOP-0005,Unprinted"
  ].join("\n");

  const cards = parseKanbanCardsCsv(csv);
  assert.equal(cards.length, 2);
  assert.equal(cards[0].status, "Archived");
  assert.equal(cards[0].active, false);
  assert.equal(cards[0].needsReview, false);
  assert.equal(cards[1].status, "Unprinted");
  assert.equal(cards[1].active, true);
  assert.equal(cards[1].needsReview, false);
});

test("parseKanbanCardsCsv defaults imported cards to needs review", () => {
  const csv = [
    "name,sku,link",
    "Shop Towels,SHOP-0003,https://example.com/towels"
  ].join("\n");

  const cards = parseKanbanCardsCsv(csv);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].needsReview, true);
});
