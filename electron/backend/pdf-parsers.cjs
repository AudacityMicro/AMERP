"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const SUMMARY_LABELS = [
  "Process",
  "Preferred Subprocess",
  "Material",
  "Color",
  "Finish",
  "Threads and Tapped Holes",
  "Inserts",
  "Precision Tolerance",
  "Precision Surface Roughness",
  "Inspection",
  "Certificates and Supplier Qualifications",
  "Notes"
];

const DESCRIPTION_EXTENSIONS = [".ipt", ".sldprt", ".sldasm", ".step", ".stp", ".x_t", ".xt"];
const MONTHS = new Map([
  ["january", 1],
  ["jan", 1],
  ["february", 2],
  ["feb", 2],
  ["march", 3],
  ["mar", 3],
  ["april", 4],
  ["apr", 4],
  ["may", 5],
  ["june", 6],
  ["jun", 6],
  ["july", 7],
  ["jul", 7],
  ["august", 8],
  ["aug", 8],
  ["september", 9],
  ["sep", 9],
  ["october", 10],
  ["oct", 10],
  ["november", 11],
  ["nov", 11],
  ["december", 12],
  ["dec", 12]
]);

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function dateIso(year, month, day) {
  if (!year || !month || !day) {
    return "";
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDate(value) {
  const text = normalizeText(String(value || "").replace(/\(.*?\)/g, "").replace(/\b[A-Z]{2,4}\b/g, "").replace(" ,", ","));
  if (!text) {
    return "";
  }
  const slash = text.match(/\b(?<month>\d{1,2})\/(?<day>\d{1,2})\/(?<year>\d{4})\b/);
  if (slash?.groups) {
    return dateIso(slash.groups.year, slash.groups.month, slash.groups.day);
  }
  const named = text.match(/\b(?<month>[A-Za-z]+)\s+(?<day>\d{1,2}),\s*(?<year>\d{4})\b/);
  if (named?.groups) {
    const month = MONTHS.get(named.groups.month.toLowerCase());
    return dateIso(named.groups.year, month, named.groups.day);
  }
  return "";
}

async function parseFailedDownload(filePath, label) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const payload = JSON.parse(raw);
    const error = payload?.data?.error || payload?.info?.message;
    return error ? `Not a valid PDF ${label}: ${error}.` : null;
  } catch {
    return null;
  }
}

async function extractPdfPages(filePath) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const raw = await fs.readFile(filePath);
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(raw),
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: true
  });
  const document = await loadingTask.promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const rows = [];
    for (const item of content.items || []) {
      const text = normalizeText(item.str);
      if (!text) {
        continue;
      }
      const transform = item.transform || [];
      const x = Number(transform[4] || 0);
      const y = Number(transform[5] || 0);
      let row = rows.find((candidate) => Math.abs(candidate.y - y) <= 2);
      if (!row) {
        row = { y, items: [] };
        rows.push(row);
      }
      row.items.push({ x, text });
    }
    rows.sort((left, right) => right.y - left.y);
    const lines = rows.map((row) => row.items.sort((left, right) => left.x - right.x).map((item) => item.text).join(" "));
    pages.push(lines.join("\n"));
  }
  await document.destroy();
  return pages;
}

function extract(pattern, text) {
  return new RegExp(pattern, "i").exec(text);
}

function collectBlock(lines, startLabel, endLabel) {
  const startIndex = lines.indexOf(startLabel);
  if (startIndex < 0) {
    return [];
  }
  const foundEnd = lines.indexOf(endLabel, startIndex + 1);
  const endIndex = foundEnd >= 0 ? foundEnd : lines.length;
  return lines.slice(startIndex + 1, endIndex).filter((line) => normalizeText(line));
}

function valueAfter(lines, label) {
  const index = lines.indexOf(label);
  return index >= 0 && index + 1 < lines.length ? normalizeText(lines[index + 1]) : "";
}

function valueAfterAny(lines, labels) {
  for (const label of labels) {
    const value = valueAfter(lines, label);
    if (value) {
      return value;
    }
  }
  return "";
}

function lineIncludesAll(line, labels) {
  const normalized = normalizeText(line).toLowerCase();
  return labels.every((label) => normalized.includes(label.toLowerCase()));
}

function parseTravelerIdentity(lines) {
  const headerIndex = lines.findIndex((line) => lineIncludesAll(line, ["Customer Part ID", "Part Name", "Quantity"]));
  if (headerIndex < 0) {
    return null;
  }
  const processIndex = lines.findIndex((line, index) => index > headerIndex && lineIncludesAll(line, ["Process", "Preferred Subprocess", "Material"]));
  const rows = lines.slice(headerIndex + 1, processIndex > headerIndex ? processIndex : headerIndex + 5).map(normalizeText).filter(Boolean);
  const joined = normalizeText(rows.join(" "));
  let match = joined.match(/^(?<part_number>[A-Z0-9]{6,})\s+(?<part_name>.+?)\s+(?<quantity>\d+)$/i);
  if (match?.groups) {
    return {
      part_number: normalizeText(match.groups.part_number),
      part_name: normalizeText(match.groups.part_name),
      quantity: normalizeText(match.groups.quantity)
    };
  }
  const idRowIndex = rows.findIndex((line) => /\b[A-Z0-9]{6,}\b\s+\d+\b/i.test(line));
  if (idRowIndex >= 0) {
    match = rows[idRowIndex].match(/\b(?<part_number>[A-Z0-9]{6,})\b\s+(?<quantity>\d+)\b/i);
    if (match?.groups) {
      const namePieces = [
        ...rows.slice(0, idRowIndex),
        normalizeText(rows[idRowIndex].replace(match[0], "")),
        ...rows.slice(idRowIndex + 1)
      ].filter(Boolean);
      return {
        part_number: normalizeText(match.groups.part_number),
        part_name: normalizeText(namePieces.join(" ")),
        quantity: normalizeText(match.groups.quantity)
      };
    }
  }
  return null;
}

function parseSubtractHeader(lines) {
  const index = lines.findIndex((line) => lineIncludesAll(line, ["PO NUMBER", "ISSUE DATE", "SHIP DATE"]));
  if (index < 0 || index + 1 >= lines.length) {
    return {};
  }
  const valueLine = normalizeText(lines[index + 1]);
  const match = valueLine.match(/^(?<purchase_order>\S+)\s+(?<issue_date>[A-Za-z]+ \d{1,2}, \d{4})\s+(?<ship_date>[A-Za-z]+ \d{1,2}, \d{4})$/);
  return match?.groups ? {
    purchase_order: normalizeText(match.groups.purchase_order),
    issue_date: normalizeText(match.groups.issue_date),
    ship_date: normalizeText(match.groups.ship_date)
  } : {};
}

function parseTravelerSummaryFromLines(lines) {
  const summary = {};
  const processIndex = lines.findIndex((line) => lineIncludesAll(line, ["Process", "Preferred Subprocess", "Material"]));
  const finishIndex = lines.findIndex((line, index) => index > processIndex && (
    lineIncludesAll(line, ["Color", "Finish", "Threads"])
    || lineIncludesAll(line, ["Finish", "Threads", "Inserts"])
  ));
  if (processIndex >= 0 && finishIndex > processIndex) {
    const combined = normalizeText(lines.slice(processIndex + 1, finishIndex).join(" "));
    const processMatch = combined.match(/\b(CNC Machining|Sheet Metal|3D Printing|Injection Molding|Urethane Casting|Laser Cutting|Waterjet Cutting|Tube Cutting)\b/i);
    const preferenceMatch = combined.match(/\b(No Preference)\b/i);
    if (processMatch) {
      summary.process = normalizeText(processMatch[1]);
    }
    if (preferenceMatch) {
      summary.preferred_subprocess = normalizeText(preferenceMatch[1]);
    }
    if (summary.process && summary.preferred_subprocess) {
      summary.material = normalizeText(combined.replace(processMatch[0], " ").replace(preferenceMatch[0], " "));
    } else {
      summary.material = combined;
    }
  }

  const nextMajorIndex = (startIndex, predicates) => {
    for (let index = startIndex + 1; index < lines.length; index += 1) {
      if (predicates.some((predicate) => predicate(lines[index]))) {
        return index;
      }
    }
    return lines.length;
  };

  const colorFinishIndex = lines.findIndex((line, index) => index > processIndex && lineIncludesAll(line, ["Color", "Finish", "Threads"]));
  const insertIndex = lines.findIndex((line, index) => index > colorFinishIndex && lineIncludesAll(line, ["Inserts", "Precision Tolerance", "Precision Surface Roughness"]));
  if (colorFinishIndex >= 0 && insertIndex > colorFinishIndex) {
    const tokens = normalizeText(lines.slice(colorFinishIndex + 1, insertIndex).join(" ")).split(/\s+/).filter(Boolean);
    if (tokens.length >= 3) {
      summary.threads = tokens[tokens.length - 1];
      summary.finish = tokens[tokens.length - 2];
      summary.color = normalizeText(tokens.slice(0, -2).join(" "));
    }
    const certIndex = nextMajorIndex(insertIndex, [
      (line) => lineIncludesAll(line, ["Inspection"]),
      (line) => line === "Notes"
    ]);
    const insertTokens = normalizeText(lines.slice(insertIndex + 1, certIndex).join(" ")).split(/\s+/).filter(Boolean);
    if (insertTokens.length >= 3) {
      summary.inserts = insertTokens[0];
      summary.precision_tolerance = insertTokens[1];
      summary.surface_roughness = normalizeText(insertTokens.slice(2).join(" "));
    }
  } else if (finishIndex >= 0) {
    const precisionIndex = lines.findIndex((line, index) => index > finishIndex && lineIncludesAll(line, ["Precision Tolerance", "Precision Surface Roughness", "Inspection"]));
    const finishEnd = precisionIndex > finishIndex ? precisionIndex : nextMajorIndex(finishIndex, [(line) => line === "Notes"]);
    const tokens = normalizeText(lines.slice(finishIndex + 1, finishEnd).join(" ")).split(/\s+/).filter(Boolean);
    if (tokens.length >= 3) {
      summary.threads = tokens[tokens.length - 2];
      summary.inserts = tokens[tokens.length - 1];
      summary.finish = normalizeText(tokens.slice(0, -2).join(" "));
    }
    if (precisionIndex > finishIndex) {
      const qualityEnd = nextMajorIndex(precisionIndex, [(line) => line === "Notes"]);
      const qualityText = normalizeText(lines.slice(precisionIndex + 1, qualityEnd).join(" "));
      const inspectionMatch = qualityText.match(/\b(Standard Inspection|Formal Inspection[^]*?)$/i);
      const firstToken = qualityText.split(/\s+/)[0] || "";
      summary.precision_tolerance = firstToken;
      const remainder = normalizeText(qualityText.replace(firstToken, ""));
      if (inspectionMatch) {
        summary.inspection = normalizeText(inspectionMatch[1]);
        summary.surface_roughness = normalizeText(remainder.replace(inspectionMatch[1], ""));
      } else {
        summary.surface_roughness = remainder;
      }
    }
  }

  if (summary.surface_roughness) {
    summary.surface_roughness = normalizeText(summary.surface_roughness.replace(/\bCertificates and Supplier\b.*$/i, ""));
  }
  const inspectionLine = lines.find((line) => line.includes("Standard Inspection") && /Certif/i.test(line)) || "";
  if (inspectionLine) {
    summary.inspection = "Standard Inspection";
    summary.certificates = normalizeText(inspectionLine.replace("Standard Inspection", ""));
  }
  return summary;
}

function parseXometryShipHeader(lines) {
  const index = lines.findIndex((line) => lineIncludesAll(line, ["Partner Quote ID", "Ship Date", "Shipping Method"]));
  if (index < 0 || index + 1 >= lines.length) {
    return {};
  }
  const valueLine = normalizeText(lines[index + 1]);
  const match = valueLine.match(/^(?<partner_quote_id>\S+)\s+(?<ship_date>\d{1,2}\/\d{1,2}\/\d{4}(?:\s+[A-Z]{2,4})?(?:\s+\(Expedited\))?)\s+(?<shipping_method>.+)$/i);
  return match?.groups ? {
    partner_quote_id: normalizeText(match.groups.partner_quote_id),
    ship_date: normalizeText(match.groups.ship_date),
    shipping_method: normalizeText(match.groups.shipping_method)
  } : {};
}

async function parseXometryTraveler(filePath) {
  const result = {
    source_path: String(filePath),
    source_filename: path.basename(filePath),
    warnings: []
  };
  let pages;
  try {
    pages = await extractPdfPages(filePath);
  } catch (error) {
    result.error = await parseFailedDownload(filePath, "traveler") || `Unable to read PDF: ${error.message}`;
    return result;
  }

  const text = normalizeText(pages.join(" "));
  const lines = pages.join("\n").split(/\r?\n/).map((line) => line.trim()).filter((line) => normalizeText(line));
  if (!text) {
    result.error = "No extractable text found in the traveler PDF.";
    return result;
  }
  if (!text.includes("Customer Part ID") || !text.includes("Part Name") || !text.includes("Quantity")) {
    result.error = "The PDF text does not match the expected Xometry traveler layout.";
    return result;
  }

  const identity = parseTravelerIdentity(lines);
  const lineSummary = parseTravelerSummaryFromLines(lines);
  const partHeader = extract(
    "Customer Part ID Part Name Quantity\\s+(?<part_number>\\S+)\\s+(?<part_name>.*?)\\s+(?<quantity>\\d+)\\s+Process Preferred Subprocess Material",
    text
  );
  let processBlock = extract(
    "Process Preferred Subprocess Material\\s+(?<process>.*?)\\s+(?<preferred_subprocess>.*?)\\s+(?<material>.*?)\\s+Finish Threads and Tapped Holes Inserts",
    text
  );
  let finishBlock = extract(
    "Finish Threads and Tapped Holes Inserts\\s+(?<finish>.*?)\\s+(?<threads>Yes|No)\\s+(?<inserts>Yes|No)\\s+Precision Tolerance",
    text
  );
  let qualityBlock = extract(
    "Precision Tolerance Precision Surface Roughness Inspection\\s+(?<precision_tolerance>.*?)\\s+(?<surface_roughness>.*?)\\s+(?<inspection>.*?)(?=\\s+(?:Certificates and Supplier Qualifications|Notes)\\s+)",
    text
  );
  const notesBlock = extract(
    "Notes\\s+(?<notes>.*?)(?:\\s+Jobs Job ID:\\s+(?<traveler_job_id>\\S+))?\\s+Revision #(?<revision>\\d+)\\s+Last revised on\\s+(?<last_revised>.*?)(?:\\s+(?<extra_requirements>This job is expedited\\..*?))?\\s+Report Generated at\\s+(?<report_generated>.*)$",
    text
  );
  const partBlock = extract(
    "Part\\s+(?<part_index>\\d+)\\s+of\\s+(?<part_total>\\d+)\\s+(?<dimensions>.*?)\\s+Purchase Order",
    text
  );
  const poBlock = extract(
    "Purchase Order Due Date Contact\\s+(?<purchase_order>\\S+)\\s+(?<due_date>.*?)\\s+(?<contact>[\\w.+-]+@[\\w.-]+)",
    text
  );
  let certificatesBlock = extract("Certificates and Supplier Qualifications\\s+(?<certificates>.*?)\\s+Notes", text);
  const colorProcessBlock = extract(
    "Process Preferred Subprocess Material\\s+(?<process>.*?)\\s+(?<preferred_subprocess>.*?)\\s+(?<material>.*?)(?=\\s+Color Finish Threads and Tapped Holes\\s+)",
    text
  );
  const colorFinishBlock = extract(
    "Color Finish Threads and Tapped Holes\\s+(?<color>.*?)\\s+(?<finish>.*?)\\s+(?<threads>Yes|No)\\s+Inserts Precision Tolerance Precision Surface Roughness\\s+(?<inserts>Yes|No)\\s+(?<precision_tolerance>Yes|No)\\s+(?<surface_roughness>.*?)(?=\\s+Inspection Certificates and Supplier Qualifications\\s+)",
    text
  );
  const colorInspectionBlock = extract(
    "Inspection Certificates and Supplier Qualifications\\s+(?<inspection>.*?)\\s+(?<certificates>.*?)\\s+Notes",
    text
  );

  processBlock = processBlock || colorProcessBlock;
  finishBlock = finishBlock || colorFinishBlock;
  qualityBlock = qualityBlock || colorFinishBlock;
  certificatesBlock = certificatesBlock || colorInspectionBlock;

  if (!identity && !partHeader) {
    result.error = "Unable to locate Customer Part ID / Part Name / Quantity in the traveler.";
    return result;
  }
  if (!processBlock && !lineSummary.process && !lineSummary.material) result.warnings.push("Process, subprocess, or material fields could not be parsed.");
  if (!finishBlock && !lineSummary.finish) result.warnings.push("Finish, thread, or insert fields could not be parsed.");
  if (!qualityBlock && !lineSummary.precision_tolerance && !lineSummary.inspection) result.warnings.push("Tolerance, roughness, or inspection fields could not be parsed.");
  if (!notesBlock) result.warnings.push("Notes and revision metadata could not be fully parsed.");

  Object.assign(result, {
    part_number: normalizeText(identity?.part_number || partHeader?.groups?.part_number),
    part_name: normalizeText(identity?.part_name || partHeader?.groups?.part_name),
    quantity: normalizeText(identity?.quantity || partHeader?.groups?.quantity),
    dimensions: normalizeText(partBlock?.groups?.dimensions),
    part_index: normalizeText(partBlock?.groups?.part_index),
    part_total: normalizeText(partBlock?.groups?.part_total),
    purchase_order: normalizeText(poBlock?.groups?.purchase_order),
    due_date: normalizeText(poBlock?.groups?.due_date),
    contact: normalizeText(poBlock?.groups?.contact),
    process: normalizeText(lineSummary.process || processBlock?.groups?.process),
    preferred_subprocess: normalizeText(lineSummary.preferred_subprocess || processBlock?.groups?.preferred_subprocess),
    material: normalizeText(lineSummary.material || processBlock?.groups?.material),
    finish: normalizeText(lineSummary.finish || finishBlock?.groups?.finish),
    threads: normalizeText(lineSummary.threads || finishBlock?.groups?.threads),
    inserts: normalizeText(lineSummary.inserts || finishBlock?.groups?.inserts),
    precision_tolerance: normalizeText(lineSummary.precision_tolerance || qualityBlock?.groups?.precision_tolerance),
    surface_roughness: normalizeText(lineSummary.surface_roughness || qualityBlock?.groups?.surface_roughness),
    inspection: normalizeText(lineSummary.inspection || qualityBlock?.groups?.inspection || colorInspectionBlock?.groups?.inspection),
    certificates: normalizeText(lineSummary.certificates || certificatesBlock?.groups?.certificates),
    notes: normalizeText(notesBlock?.groups?.notes),
    traveler_job_id: normalizeText(notesBlock?.groups?.traveler_job_id),
    revision: normalizeText(notesBlock?.groups?.revision),
    last_revised: normalizeText(notesBlock?.groups?.last_revised),
    last_revised_iso: parseDate(notesBlock?.groups?.last_revised),
    report_generated: normalizeText(notesBlock?.groups?.report_generated),
    extra_requirements: normalizeText(notesBlock?.groups?.extra_requirements)
  });

  const combinedProcess = normalizeText([result.process, result.preferred_subprocess, result.material].join(" "));
  if (combinedProcess.includes("No Preference") && result.preferred_subprocess !== "No Preference") {
    const [processText, materialText] = combinedProcess.split("No Preference");
    result.process = normalizeText(processText);
    result.preferred_subprocess = "No Preference";
    result.material = normalizeText(materialText);
  }

  if (result.inspection.startsWith("Roughness:") && result.inspection.includes(" Standard Inspection")) {
    const [roughnessTail] = result.inspection.split(" Standard Inspection");
    result.surface_roughness = normalizeText(`${result.surface_roughness} ${roughnessTail}`);
    result.inspection = "Standard Inspection";
  }
  if (result.certificates.startsWith("Standard Inspection ") && ["", "Standard"].includes(result.inspection)) {
    result.inspection = "Standard Inspection";
    result.certificates = normalizeText(result.certificates.replace(/^Standard Inspection\s+/, ""));
  } else if (result.certificates.startsWith("Inspection ") && result.inspection === "Standard") {
    result.inspection = "Standard Inspection";
    result.certificates = normalizeText(result.certificates.replace(/^Inspection\s+/, ""));
  }

  result.expedited = result.due_date.includes("(Expedited)") || result.extra_requirements.toLowerCase().includes("expedited");
  result.additional_notes = result.extra_requirements ? [result.extra_requirements] : [];
  return result;
}

function parseXometrySummary(lines) {
  const result = {};
  const startIndex = lines.indexOf("Requirements Summary");
  const endIndex = lines.indexOf("Item Code Part ID** Order ID Description Qty.", startIndex + 1);
  if (startIndex < 0 || endIndex < 0) {
    return result;
  }
  let index = startIndex + 1;
  while (index < endIndex) {
    const label = lines[index];
    if (!SUMMARY_LABELS.includes(label)) {
      index += 1;
      continue;
    }
    const valueLines = [];
    index += 1;
    while (index < endIndex && !SUMMARY_LABELS.includes(lines[index])) {
      valueLines.push(lines[index]);
      index += 1;
    }
    const value = normalizeText(valueLines.join(" "));
    result[label] = result[label] && value && value !== result[label] ? normalizeText(`${result[label]} ${value}`) : value;
  }
  return result;
}

function parseXometryRowLine(line) {
  const normalized = normalizeText(line);
  const match = normalized.match(/^(?<item_number>\d+)\s+(?<item_code>\S+)\s+(?<part_id>\S+)\s+(?<order_id>\S+)(?:\s+(?<tail>.*))?$/);
  if (!match?.groups || match.groups.item_number === "0" || !normalizeText(match.groups.item_code).startsWith("CNC-")) {
    return null;
  }
  const tail = normalizeText(match.groups.tail);
  let quantity = "";
  let description = "";
  if (tail) {
    const qtyInline = tail.match(/^(?<qty>\d+)(?<desc>.+)$/);
    const descThenQty = tail.match(/^(?<desc>.+?)\s+(?<qty>\d+)$/);
    if (/^\d+$/.test(tail)) {
      quantity = tail;
    } else if (qtyInline?.groups) {
      quantity = normalizeText(qtyInline.groups.qty);
      description = normalizeText(qtyInline.groups.desc);
    } else if (descThenQty?.groups) {
      description = normalizeText(descThenQty.groups.desc);
      quantity = normalizeText(descThenQty.groups.qty);
    } else {
      description = tail;
    }
  }
  return {
    item_number: normalizeText(match.groups.item_number),
    item_code: normalizeText(match.groups.item_code),
    part_id: normalizeText(match.groups.part_id),
    order_id: normalizeText(match.groups.order_id),
    quantity,
    description
  };
}

function isDescriptionLine(line) {
  const normalized = normalizeText(line);
  const lower = normalized.toLowerCase();
  return Boolean(normalized) && DESCRIPTION_EXTENSIONS.some((extension) => lower.endsWith(extension)) && !parseXometryRowLine(line);
}

async function parseXometryPurchaseOrder(filePath) {
  const result = {
    source_path: String(filePath),
    source_filename: path.basename(filePath),
    warnings: [],
    parts: []
  };
  let pages;
  try {
    pages = await extractPdfPages(filePath);
  } catch (error) {
    result.error = await parseFailedDownload(filePath, "purchase order") || `Unable to read PDF: ${error.message}`;
    return result;
  }

  const rawText = pages.join("\n");
  if (!normalizeText(rawText)) {
    result.error = "No extractable text found in the purchase order PDF.";
    return result;
  }
  const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter((line) => normalizeText(line));
  const joined = normalizeText(rawText);
  if (!/P\.?\s*O\.?\s+No\./i.test(joined) || !joined.includes("Requirements Summary")) {
    result.error = "The PDF text does not match the expected Xometry PO layout.";
    return result;
  }

  result.purchase_order = valueAfterAny(lines, ["P.O. No.", "P .O. No."]);
  result.issue_date = valueAfter(lines, "Date:");
  result.issue_date_iso = parseDate(result.issue_date);
  const shipHeader = parseXometryShipHeader(lines);
  result.partner_quote_id = valueAfter(lines, "Partner Quote ID:") || shipHeader.partner_quote_id || "";
  result.ship_date = valueAfter(lines, "Ship Date*:") || shipHeader.ship_date || "";
  result.ship_date_iso = parseDate(result.ship_date);
  result.shipping_method = valueAfter(lines, "Shipping Method:") || shipHeader.shipping_method || "";
  result.expedited = result.ship_date.toLowerCase().includes("expedited");

  const issuerBlock = collectBlock(lines, "PURCHASE ORDER", "P .O. No.");
  const toBlock = collectBlock(lines, "To:", "Ship To:");
  const shipToBlock = collectBlock(lines, "Ship To:", "PO number should");
  result.issuer_name = "Xometry";
  result.issuer_address = issuerBlock.length ? issuerBlock.slice(0, -1) : [];
  result.issuer_phone = issuerBlock.length ? issuerBlock[issuerBlock.length - 1] : "";
  result.to_lines = toBlock;
  result.ship_to_lines = shipToBlock;
  result.vendor_name = normalizeText(toBlock[0]);
  result.vendor_address = toBlock.length > 1 ? toBlock.slice(1) : [];
  result.ship_to_name = normalizeText(shipToBlock[0]);
  result.ship_to_address = shipToBlock.length > 1 ? shipToBlock.slice(1) : [];

  const totalMatch = joined.match(/TOTAL\s+\$?(?<amount>[\d,]+(?:\.\d{2})?)/i);
  result.total_amount = normalizeText(totalMatch?.groups?.amount);

  const summary = parseXometrySummary(lines);
  result.summary = {
    process: summary.Process || "",
    preferred_subprocess: summary["Preferred Subprocess"] || "",
    material: summary.Material || "",
    color: summary.Color || "",
    finish: summary.Finish || "",
    threads: summary["Threads and Tapped Holes"] || "",
    inserts: summary.Inserts || "",
    precision_tolerance: summary["Precision Tolerance"] || "",
    surface_roughness: summary["Precision Surface Roughness"] || "",
    inspection: summary.Inspection || "",
    certificates: summary["Certificates and Supplier Qualifications"] || "",
    notes: summary.Notes || ""
  };

  const itemRows = [];
  let inRows = false;
  for (const line of lines) {
    if (lineIncludesAll(line, ["Item", "Code", "Part ID", "Order ID", "Description", "Qty"])) {
      inRows = true;
      continue;
    }
    if (inRows && line.startsWith("* Ship Date")) {
      break;
    }
    if (!inRows) {
      continue;
    }
    const parsed = parseXometryRowLine(line);
    if (parsed) {
      itemRows.push(parsed);
    }
  }
  if (!itemRows.length) {
    result.error = "No item rows could be parsed from the Xometry purchase order.";
    return result;
  }

  const standaloneDescriptions = lines.filter(isDescriptionLine);
  const missingDescriptionRows = itemRows.filter((row) => !row.description);
  if (standaloneDescriptions.length >= missingDescriptionRows.length) {
    missingDescriptionRows.forEach((row, index) => {
      row.description = standaloneDescriptions[index];
    });
  } else {
    missingDescriptionRows.forEach((row) => result.warnings.push(`Description could not be fully parsed for part ${row.part_id || row.item_number}.`));
  }

  result.parts = itemRows.map((row) => ({
    ...row,
    process: result.summary.process,
    preferred_subprocess: result.summary.preferred_subprocess,
    material: result.summary.material,
    color: result.summary.color,
    finish: result.summary.finish,
    threads: result.summary.threads,
    inserts: result.summary.inserts,
    precision_tolerance: result.summary.precision_tolerance,
    surface_roughness: result.summary.surface_roughness,
    inspection: result.summary.inspection,
    certificates: result.summary.certificates,
    notes: result.summary.notes
  }));

  if (!result.purchase_order) {
    result.error = "Missing P.O. No. in the purchase order.";
  }
  return result;
}

function parseSubtractPartRow(line) {
  const normalized = normalizeText(line);
  const tokens = normalized.split(" ");
  if (tokens.length < 6) {
    return null;
  }
  const printRequired = tokens[tokens.length - 1];
  if (!["Yes", "No"].includes(printRequired)) {
    return null;
  }
  const qtyIndex = tokens.findIndex((token, index) => index < tokens.length - 1 && /^\d+$/.test(token));
  if (qtyIndex <= 0) {
    return null;
  }
  let toleranceIndex = -1;
  for (let index = qtyIndex + 1; index < tokens.length - 1; index += 1) {
    const token = tokens[index];
    if (/\d/.test(token) && (token.includes(".") || /[^A-Za-z0-9]/.test(token))) {
      toleranceIndex = index;
      break;
    }
  }
  if (toleranceIndex <= qtyIndex + 1 || toleranceIndex >= tokens.length - 2) {
    return null;
  }
  return {
    part_name: normalizeText(tokens.slice(0, qtyIndex).join(" ")),
    quantity: normalizeText(tokens[qtyIndex]),
    material: normalizeText(tokens.slice(qtyIndex + 1, toleranceIndex).join(" ")),
    tolerance: normalizeText(tokens[toleranceIndex]),
    finishing: normalizeText(tokens.slice(toleranceIndex + 1, -1).join(" ")),
    print_required: normalizeText(printRequired)
  };
}

function parseSubtractPartCoreRow(line) {
  const normalized = normalizeText(line);
  const tokens = normalized.split(" ");
  if (tokens.length < 5) {
    return null;
  }
  const printRequired = tokens[tokens.length - 1];
  if (!["Yes", "No"].includes(printRequired)) {
    return null;
  }
  const qtyIndex = tokens.findIndex((token, index) => index < tokens.length - 1 && /^\d+$/.test(token));
  if (qtyIndex <= 0) {
    return null;
  }
  const toleranceIndex = qtyIndex + 1;
  const tolerance = tokens[toleranceIndex] || "";
  if (!/\d/.test(tolerance) || (!tolerance.includes(".") && !/[^A-Za-z0-9]/.test(tolerance))) {
    return null;
  }
  if (toleranceIndex >= tokens.length - 2) {
    return null;
  }
  return {
    part_name: normalizeText(tokens.slice(0, qtyIndex).join(" ")),
    quantity: normalizeText(tokens[qtyIndex]),
    material: "",
    tolerance: normalizeText(tolerance),
    finishing: normalizeText(tokens.slice(toleranceIndex + 1, -1).join(" ")),
    print_required: normalizeText(printRequired)
  };
}

function parseSubtractPartRows(rowLines) {
  const rows = rowLines.map(normalizeText).filter(Boolean);
  const coreIndexes = rows
    .map((line, index) => (parseSubtractPartRow(line) || parseSubtractPartCoreRow(line) ? index : -1))
    .filter((index) => index >= 0);
  const parts = [];
  const warnings = [];

  if (!coreIndexes.length) {
    return {
      parts,
      warnings: rows.map((line) => `Could not parse part row: ${line}`)
    };
  }

  coreIndexes.forEach((coreIndex, index) => {
    const segmentStart = index > 0 ? coreIndexes[index - 1] + 1 : 0;
    const segmentEnd = index + 1 < coreIndexes.length ? coreIndexes[index + 1] : rows.length;
    const segment = rows.slice(segmentStart, segmentEnd);
    const coreOffset = coreIndex - segmentStart;
    const parsed = parseSubtractPartRow(rows[coreIndex]) || parseSubtractPartCoreRow(rows[coreIndex]);
    if (!parsed) {
      warnings.push(`Could not parse part row: ${rows[coreIndex]}`);
      return;
    }
    const wrappedMaterial = normalizeText(segment
      .filter((_, offset) => offset !== coreOffset)
      .join(" "));
    parts.push({
      ...parsed,
      material: normalizeText([parsed.material, wrappedMaterial].filter(Boolean).join(" "))
    });
  });

  return { parts, warnings };
}

async function parseSubtractPurchaseOrder(filePath) {
  const result = {
    source_path: String(filePath),
    source_filename: path.basename(filePath),
    warnings: [],
    parts: []
  };
  let pages;
  try {
    pages = await extractPdfPages(filePath);
  } catch (error) {
    result.error = await parseFailedDownload(filePath, "purchase order") || `Unable to read PDF: ${error.message}`;
    return result;
  }

  const rawText = pages.join("\n");
  if (!normalizeText(rawText)) {
    result.error = "No extractable text found in the purchase order PDF.";
    return result;
  }
  const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter((line) => normalizeText(line));
  const joined = normalizeText(rawText);
  if (!joined.includes("PARTS SPECIFICATION") || !joined.includes("PO NUMBER")) {
    result.error = "The PDF text does not match the expected Subtract PO layout.";
    return result;
  }

  const subtractHeader = parseSubtractHeader(lines);
  result.purchase_order = valueAfter(lines, "PO NUMBER") || subtractHeader.purchase_order || "";
  result.issue_date = valueAfter(lines, "ISSUE DATE") || subtractHeader.issue_date || "";
  result.issue_date_iso = parseDate(result.issue_date);
  result.ship_date = valueAfter(lines, "SHIP DATE") || subtractHeader.ship_date || "";
  result.ship_date_iso = parseDate(result.ship_date);

  const fromBlock = collectBlock(lines, "FROM: SUBTRACT MANUFACTURING", "TO: VENDOR / SHOP");
  const deliverBlock = collectBlock(lines, "DELIVER TO: CUSTOMER", "PARTS SPECIFICATION");
  result.issuer_lines = fromBlock;
  result.deliver_to_lines = deliverBlock;
  if (fromBlock.length) {
    result.issuer_name = normalizeText(fromBlock[0]);
    result.issuer_email = fromBlock.find((line) => line.includes("@")) || "";
    result.issuer_phone = fromBlock.find((line) => line.includes("+") || /\d{3}[- )]/.test(line)) || "";
    result.issuer_address = fromBlock.slice(1).filter((line) => ![result.issuer_email, result.issuer_phone].includes(line));
  } else {
    result.issuer_name = "Subtract Manufacturing";
    result.issuer_email = "";
    result.issuer_phone = "";
    result.issuer_address = [];
    result.warnings.push("Issuer block could not be fully parsed.");
  }
  if (deliverBlock.length) {
    result.deliver_to_name = normalizeText(deliverBlock[0]);
    result.deliver_to_contact = normalizeText((deliverBlock.find((line) => line.toLowerCase().startsWith("contact:")) || "").split(":", 2)[1]);
    result.deliver_to_email = deliverBlock.find((line) => line.includes("@")) || "";
    result.deliver_to_phone = deliverBlock.find((line) => line.includes("+") || /\d{3}[- )]/.test(line)) || "";
    result.deliver_to_address = deliverBlock.slice(1).filter((line) => !line.toLowerCase().startsWith("contact:") && ![result.deliver_to_email, result.deliver_to_phone].includes(line));
  } else {
    result.deliver_to_name = "";
    result.deliver_to_contact = "";
    result.deliver_to_email = "";
    result.deliver_to_phone = "";
    result.deliver_to_address = [];
    result.warnings.push("Deliver-to block could not be fully parsed.");
  }

  const notesMatch = rawText.match(/NOTES:\s*(?<notes>.*?)(?:TOTAL AMOUNT\s+\$?(?<amount>[\d,]+(?:\.\d{2})?))/is);
  result.notes = normalizeText(notesMatch?.groups?.notes);
  result.total_amount = normalizeText(notesMatch?.groups?.amount);
  if (!result.total_amount) {
    const amountMatch = joined.match(/TOTAL AMOUNT\s+\$?(?<amount>[\d,]+(?:\.\d{2})?)/i);
    result.total_amount = normalizeText(amountMatch?.groups?.amount);
  }

  const partsIndex = lines.indexOf("PARTS SPECIFICATION");
  if (partsIndex < 0) {
    result.error = "Unable to locate PARTS SPECIFICATION.";
    return result;
  }
  const rowLines = [];
  for (const line of lines.slice(partsIndex + 1)) {
    if (line === "PART NAME QTY MATERIAL TOLERANCE FINISHING PRINT?") {
      continue;
    }
    if (line.startsWith("NOTES:") || line.startsWith("TOTAL AMOUNT")) {
      break;
    }
    rowLines.push(line);
  }
  const parsedRows = parseSubtractPartRows(rowLines);
  result.parts.push(...parsedRows.parts);
  result.warnings.push(...parsedRows.warnings);
  if (!result.purchase_order) {
    result.error = "Missing PO NUMBER in the purchase order.";
  } else if (!result.parts.length) {
    result.error = "No part rows could be parsed from PARTS SPECIFICATION.";
  }
  return result;
}

async function parseXometryTravelers(filePaths) {
  return { travelers: await Promise.all(filePaths.map(parseXometryTraveler)) };
}

async function parseXometryPurchaseOrders(filePaths) {
  return { purchase_orders: await Promise.all(filePaths.map(parseXometryPurchaseOrder)) };
}

async function parseSubtractPurchaseOrders(filePaths) {
  return { purchase_orders: await Promise.all(filePaths.map(parseSubtractPurchaseOrder)) };
}

module.exports = {
  parseXometryTravelers,
  parseXometryPurchaseOrders,
  parseSubtractPurchaseOrders,
  parseSubtractPartRows
};
