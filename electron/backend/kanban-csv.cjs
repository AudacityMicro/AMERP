"use strict";

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeHeader(value) {
  return String(value || "").toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9]+/g, "");
}

function parseCsvRows(raw) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const text = String(raw || "");
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === "\"" && inQuotes && next === "\"") {
      cell += "\"";
      index += 1;
    } else if (char === "\"") {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell.trim());
      if (row.some(Boolean)) {
        rows.push(row);
      }
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) {
    rows.push(row);
  }
  return rows;
}

function objectsFromCsvRows(rows) {
  if (!rows.length) {
    return [];
  }
  const headers = rows[0].map(normalizeHeader);
  return rows.slice(1).map((row, index) => {
    const object = { rowNumber: index + 2 };
    headers.forEach((header, cellIndex) => {
      if (header && row[cellIndex] != null) {
        object[header] = normalizeWhitespace(row[cellIndex]);
      }
    });
    return object;
  }).filter((object) => Object.entries(object).some(([key, value]) => key !== "rowNumber" && value));
}

function firstField(object, keys) {
  for (const key of keys) {
    const value = object[normalizeHeader(key)];
    if (value) {
      return value;
    }
  }
  return "";
}

function parseBoolean(value, fallback = false) {
  const text = normalizeWhitespace(value).toLowerCase();
  if (!text) {
    return fallback;
  }
  if (["true", "yes", "y", "1", "review", "needs review"].includes(text)) {
    return true;
  }
  if (["false", "no", "n", "0", "reviewed", "complete"].includes(text)) {
    return false;
  }
  return fallback;
}

function extractUrlsFromText(text) {
  const matches = String(text || "").match(/https?:\/\/[^\s"',<>)]*/gi) || [];
  return matches
    .map((url) => url.replace(/[.;,\]]+$/g, ""))
    .filter(Boolean);
}

function extractKanbanUrlsFromCsv(raw) {
  return [...new Set(extractUrlsFromText(raw).map((url) => url.trim()).filter(Boolean))];
}

function canonicalKanbanStatus(value) {
  const normalized = normalizeHeader(value);
  if (normalized === "active") return "Active";
  if (normalized === "unprinted") return "Unprinted";
  if (normalized === "needsreview" || normalized === "review") return "Needs Review";
  if (normalized === "archived") return "Archived";
  return "";
}

function parseKanbanCardsCsv(raw, sourceFile = "") {
  const objects = objectsFromCsvRows(parseCsvRows(raw));
  return objects.map((object) => {
    const status = canonicalKanbanStatus(firstField(object, ["status", "card status", "kanban status"]));
    const explicitNeedsReview = parseBoolean(firstField(object, ["needsReview", "needs review", "review", "reviewRequired"]), true);
    return {
      sourceFile,
      sourceRow: object.rowNumber,
      itemName: firstField(object, ["itemName", "item name", "name", "title", "description"]),
      internalInventoryNumber: firstField(object, ["internalInventoryNumber", "inventoryNumber", "inventory number", "internal inventory number", "sku", "part number", "item number"]),
      minimumLevel: firstField(object, ["minimumLevel", "minimum level", "min", "minimum", "minLevel"]),
      orderQuantity: firstField(object, ["orderQuantity", "order quantity", "orderQty", "order qty", "quantity", "qty"]),
      storageLocation: firstField(object, ["storageLocation", "storage location", "location", "bin", "shelf"]),
      department: firstField(object, ["department", "area"]),
      category: firstField(object, ["category", "catagory", "type"]),
      vendor: firstField(object, ["vendor", "supplier"]),
      purchaseUrl: firstField(object, ["purchaseUrl", "purchase URL", "url", "link", "vendorUrl", "vendor URL"]),
      orderingNotes: firstField(object, ["orderingNotes", "ordering notes", "notes", "order notes", "purchasing notes"]),
      packSize: firstField(object, ["packSize", "pack size", "unit", "purchase unit"]),
      description: firstField(object, ["description", "longDescription", "long description", "cardDescription", "card description", "details"]),
      status,
      needsReview: status ? status === "Needs Review" : explicitNeedsReview,
      active: status ? status !== "Archived" : true
    };
  }).filter((card) => card.itemName || card.internalInventoryNumber || card.purchaseUrl);
}

module.exports = {
  extractKanbanUrlsFromCsv,
  parseCsvRows,
  parseKanbanCardsCsv
};
