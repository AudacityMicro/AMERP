"use strict";

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
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

function headerAliases(header) {
  const aliases = new Set([normalizeKey(header)]);
  const display = String(header || "").replace(/\([^)]*\)/g, " ");
  if (display.trim()) {
    aliases.add(normalizeKey(display));
  }
  for (const match of String(header || "").matchAll(/\(([^)]+)\)/g)) {
    aliases.add(normalizeKey(match[1]));
  }
  return [...aliases].filter(Boolean);
}

function objectsFromCsvRows(rows) {
  if (!rows.length) {
    return [];
  }
  const headers = rows[0].map(headerAliases);
  return rows.slice(1).map((row) => {
    const object = {};
    headers.forEach((aliases, index) => {
      const value = normalizeWhitespace(row[index]);
      if (!value) {
        return;
      }
      for (const alias of aliases) {
        if (!object[alias]) {
          object[alias] = value;
        }
      }
    });
    return object;
  }).filter((object) => Object.keys(object).length);
}

function field(object, keys) {
  for (const key of keys) {
    const value = object[normalizeKey(key)];
    if (value) {
      return value;
    }
  }
  return "";
}

function shortUnit(value) {
  const unit = String(value || "").trim().toLowerCase();
  if (unit.startsWith("inch")) return "in";
  if (unit.startsWith("millimeter") || unit === "mm") return "mm";
  return value || "";
}

function measurement(value, unit) {
  const text = normalizeWhitespace(value);
  if (!text) {
    return "";
  }
  const suffix = shortUnit(unit);
  return suffix && !text.toLowerCase().endsWith(String(suffix).toLowerCase()) ? `${text} ${suffix}` : text;
}

function toolInventoryNumber(toolNumber) {
  const text = normalizeWhitespace(toolNumber);
  if (!text) {
    return "";
  }
  return /^t/i.test(text) ? text.toUpperCase() : `T${text}`;
}

function buildUniqueKey(row) {
  const productLink = field(row, ["toolProductLink"]);
  const productId = field(row, ["toolProductId"]);
  const vendor = field(row, ["toolVendor", "vendor"]);
  const toolNumber = field(row, ["toolNumber", "number"]);
  const description = field(row, ["toolDescription", "description"]);
  const diameter = field(row, ["toolDiameter", "diameter"]);
  const type = field(row, ["toolType", "type"]);
  return [
    productLink ? `url:${productLink.toLowerCase()}` : "",
    !productLink && productId ? `sku:${vendor.toLowerCase()}|${productId.toLowerCase()}` : "",
    !productLink && !productId ? `tool:${toolNumber}|${description}|${diameter}|${type}`.toLowerCase() : ""
  ].find(Boolean);
}

function summarizeTool(row) {
  const unit = field(row, ["toolUnit", "unit"]);
  const toolNumber = field(row, ["toolNumber", "number"]);
  const inventoryNumber = toolInventoryNumber(toolNumber);
  const type = field(row, ["toolType", "type"]);
  const description = field(row, ["toolDescription", "description"]);
  const diameter = measurement(field(row, ["toolDiameter", "diameter"]), unit);
  const cornerRadius = measurement(field(row, ["toolCornerRadius", "cornerRadius"]), unit);
  const fluteLength = measurement(field(row, ["toolFluteLength", "fluteLength"]), unit);
  const overallLength = measurement(field(row, ["toolOverallLength", "overallLength"]), unit);
  const shaftDiameter = measurement(field(row, ["toolShaftDiameter", "shaftDiameter"]), unit);
  const numberOfFlutes = field(row, ["toolNumberOfFlutes", "numberOfFlutes"]);
  const material = field(row, ["toolMaterial", "material"]);
  const productId = field(row, ["toolProductId", "productId"]);
  const productLink = field(row, ["toolProductLink", "productLink"]);
  const vendor = field(row, ["toolVendor", "vendor"]) || field(row, ["holderVendor"]);
  const holderProductLink = field(row, ["holderProductLink"]);
  const baseItemName = description || [diameter, type].filter(Boolean).join(" ") || productId || inventoryNumber || "Fusion Tool";
  const prefix = `${inventoryNumber} - `;
  const cleanBaseItemName = inventoryNumber && baseItemName.toLowerCase().startsWith(prefix.toLowerCase())
    ? baseItemName.slice(prefix.length)
    : baseItemName;
  const itemName = inventoryNumber ? `${inventoryNumber} - ${cleanBaseItemName}` : baseItemName;
  const descriptionParts = [
    type,
    diameter ? `Diameter ${diameter}` : "",
    cornerRadius ? `Corner radius ${cornerRadius}` : "",
    fluteLength ? `Flute length ${fluteLength}` : "",
    numberOfFlutes ? `${numberOfFlutes} flutes` : "",
    material
  ].filter(Boolean);

  return {
    itemName,
    internalInventoryNumber: "",
    vendor,
    purchaseUrl: productLink || holderProductLink,
    category: "Cutting Tools",
    minimumLevel: "1",
    orderQuantity: "1",
    packSize: "1 tool",
    description: descriptionParts.join(" | "),
    productId,
    productLink,
    holderProductLink,
    toolNumber: inventoryNumber,
    type,
    diameter,
    cornerRadius,
    fluteLength,
    overallLength,
    shaftDiameter,
    numberOfFlutes,
    material
  };
}

function mergeToolSummary(target, row) {
  if (!target.purchaseUrl) target.purchaseUrl = field(row, ["toolProductLink", "holderProductLink"]);
  if (!target.vendor) target.vendor = field(row, ["toolVendor", "holderVendor", "vendor"]);
  return target;
}

function finalizeToolSummary(summary) {
  return {
    itemName: summary.itemName,
    internalInventoryNumber: summary.internalInventoryNumber,
    minimumLevel: summary.minimumLevel,
    orderQuantity: summary.orderQuantity,
    storageLocation: "",
    department: "",
    category: summary.category,
    photo: null,
    vendor: summary.vendor,
    purchaseUrl: summary.purchaseUrl,
    orderingNotes: "",
    packSize: summary.packSize,
    description: summary.description,
    needsReview: true,
    active: true
  };
}

function parseFusionToolLibraryKanbanItems(raw, sourceFile = "") {
  const rows = parseCsvRows(raw);
  const objects = objectsFromCsvRows(rows);
  const byKey = new Map();
  for (const row of objects) {
    const key = buildUniqueKey(row);
    if (!key) {
      continue;
    }
    if (!byKey.has(key)) {
      byKey.set(key, summarizeTool(row));
    }
    mergeToolSummary(byKey.get(key), row);
  }
  return [...byKey.values()].map(finalizeToolSummary);
}

module.exports = {
  parseCsvRows,
  parseFusionToolLibraryKanbanItems
};
