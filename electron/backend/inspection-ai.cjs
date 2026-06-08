"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const OpenAI = require("openai");

function clean(value) {
  return String(value || "")
    .replace(/\u2212|\u2013|\u2014/g, "-")
    .replace(/\uff0b/g, "+")
    .replace(/\u00b1/g, "+/-")
    .replace(/\s+/g, " ")
    .trim();
}

const NUMERIC_TOKEN_PATTERN = /[-+]?\s*(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:\s*\/\s*\d+(?:\.\d*)?)?/g;
const STANDALONE_UNIT_PATTERN = /^(?:in|inch|inches|mm|millimeter|millimeters|deg|degree|degrees)$/i;
const DEFAULT_ASSUMED_GENERAL_TOLERANCE_RULES = [
  { decimalPlaces: 0, tolerance: "0.030" },
  { decimalPlaces: 1, tolerance: "0.010" },
  { decimalPlaces: 2, tolerance: "0.005" },
  { decimalPlaces: 3, tolerance: "0.001" },
  { decimalPlaces: 4, tolerance: "0.0005" }
];

function hasNumeric(value) {
  NUMERIC_TOKEN_PATTERN.lastIndex = 0;
  return NUMERIC_TOKEN_PATTERN.test(clean(value));
}

function numericTokens(value) {
  NUMERIC_TOKEN_PATTERN.lastIndex = 0;
  return clean(value).match(NUMERIC_TOKEN_PATTERN)?.map((token) => token.replace(/\s+/g, "")) || [];
}

function cleanNumeric(value) {
  const text = clean(value);
  if (!text || STANDALONE_UNIT_PATTERN.test(text) || !hasNumeric(text)) {
    return "";
  }
  return text;
}

function cleanToleranceMagnitude(value) {
  const token = numericTokens(value)[0] || "";
  return token.replace(/^[+-]/, "");
}

function normalizeAssumedGeneralToleranceSettings(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const suppliedRules = Array.isArray(source.rules)
    ? source.rules
    : (Array.isArray(source) ? source : DEFAULT_ASSUMED_GENERAL_TOLERANCE_RULES);
  const rulesByDecimals = new Map(DEFAULT_ASSUMED_GENERAL_TOLERANCE_RULES.map((rule) => [rule.decimalPlaces, { ...rule }]));
  for (const rule of suppliedRules) {
    const decimalPlaces = Math.max(0, Math.floor(Number(rule?.decimalPlaces)));
    const tolerance = cleanToleranceMagnitude(rule?.tolerance);
    if (!Number.isFinite(decimalPlaces) || !tolerance) {
      continue;
    }
    rulesByDecimals.set(decimalPlaces, { decimalPlaces, tolerance });
  }
  return {
    enabled: source.enabled === true,
    rules: Array.from(rulesByDecimals.values()).sort((left, right) => left.decimalPlaces - right.decimalPlaces)
  };
}

function decimalPlacesForNominal(value) {
  const tokens = numericTokens(value);
  return tokens.reduce((maxDecimals, token) => {
    const match = String(token || "").match(/\.(\d+)/);
    return Math.max(maxDecimals, match ? match[1].length : 0);
  }, 0);
}

function selectAssumedGeneralTolerance(settings, decimalPlaces) {
  const normalized = normalizeAssumedGeneralToleranceSettings(settings);
  if (!normalized.enabled || !normalized.rules.length) {
    return null;
  }
  const targetDecimals = Math.max(0, Math.floor(Number(decimalPlaces) || 0));
  const exact = normalized.rules.find((rule) => rule.decimalPlaces === targetDecimals);
  if (exact) {
    return exact;
  }
  return [...normalized.rules].reverse().find((rule) => rule.decimalPlaces <= targetDecimals) || normalized.rules[0];
}

function signedTolerance(value, sign) {
  const magnitude = cleanToleranceMagnitude(value);
  return magnitude ? `${sign}${magnitude}` : "";
}

function appendNote(existing, nextNote) {
  return [clean(existing), clean(nextNote)].filter(Boolean).join(existing ? "\n" : "");
}

function normalizeUnits(value) {
  const text = clean(value).toLowerCase();
  if (/^m(?:m|illimeters?)$/.test(text)) return "mm";
  if (/^(?:deg|degrees?)$/.test(text)) return "deg";
  if (!text || /^(?:in|inch|inches)$/.test(text)) return "in";
  return STANDALONE_UNIT_PATTERN.test(text) ? text : "in";
}

function splitStackedTolerance(nominal, plusTolerance, minusTolerance) {
  if (plusTolerance && minusTolerance) {
    return { nominal, plusTolerance, minusTolerance };
  }
  const tokens = numericTokens(nominal);
  const plusIndex = tokens.findIndex((token) => token.startsWith("+"));
  const minusIndex = tokens.findIndex((token) => token.startsWith("-"));
  if (plusIndex < 0 || minusIndex < 0) {
    return { nominal, plusTolerance, minusTolerance };
  }
  const firstToleranceIndex = Math.min(plusIndex, minusIndex);
  const nominalCandidates = tokens.slice(0, firstToleranceIndex).filter((token) => !token.startsWith("+") && !token.startsWith("-"));
  const nextNominal = nominalCandidates[nominalCandidates.length - 1] || cleanNumeric(nominal);
  return {
    nominal: nextNominal,
    plusTolerance: plusTolerance || tokens[plusIndex],
    minusTolerance: minusTolerance || tokens[minusIndex]
  };
}

function warningLabel(item, index) {
  return clean(item?.number) || clean(item?.label) || `item ${index + 1}`;
}

function normalizedPageCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 1;
}

function normalizedPageNumber(value, pageCount, warnings, label) {
  const maxPage = normalizedPageCount(pageCount);
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1) {
    warnings?.push(`AI did not return a valid page for ${label}; defaulted to page 1.`);
    return 1;
  }
  const wholePage = Math.floor(numeric);
  if (wholePage > maxPage) {
    warnings?.push(`AI returned page ${wholePage} for ${label}, but the drawing has ${maxPage} page${maxPage === 1 ? "" : "s"}; clamped to page ${maxPage}.`);
    return maxPage;
  }
  return wholePage;
}

function normalizedCoordinate(value, axis, warnings, label) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    warnings?.push(`AI did not return a valid ${axis} balloon coordinate for ${label}; defaulted to center.`);
    return 0.5;
  }
  if (numeric < 0 || numeric > 1) {
    warnings?.push(`AI returned ${axis} balloon coordinate ${numeric} for ${label}; clamped to the drawing page.`);
  }
  return Math.max(0, Math.min(1, numeric));
}

function normalizeExtractedCharacteristic(item, index, options = {}) {
  const warnings = Array.isArray(options.warnings) ? options.warnings : null;
  const labelForWarnings = warningLabel(item, index);
  const rawNominal = clean(item?.nominal);
  let nominal = cleanNumeric(rawNominal);
  let plusTolerance = cleanNumeric(item?.plusTolerance);
  let minusTolerance = cleanNumeric(item?.minusTolerance);
  let lowerLimit = cleanNumeric(item?.lowerLimit);
  let upperLimit = cleanNumeric(item?.upperLimit);
  let gdTolerance = cleanNumeric(item?.gdTolerance);
  ({ nominal, plusTolerance, minusTolerance } = splitStackedTolerance(rawNominal || nominal, plusTolerance, minusTolerance));
  nominal = cleanNumeric(nominal);
  plusTolerance = cleanNumeric(plusTolerance);
  minusTolerance = cleanNumeric(minusTolerance);
  let notes = clean(item?.notes);
  const hasExplicitTolerance = hasNumeric(plusTolerance)
    || hasNumeric(minusTolerance)
    || hasNumeric(lowerLimit)
    || hasNumeric(upperLimit)
    || hasNumeric(gdTolerance);
  const assumedToleranceRule = !hasExplicitTolerance && hasNumeric(nominal)
    ? selectAssumedGeneralTolerance(options.assumedGeneralTolerances, decimalPlacesForNominal(nominal))
    : null;
  if (assumedToleranceRule) {
    plusTolerance = signedTolerance(assumedToleranceRule.tolerance, "+");
    minusTolerance = signedTolerance(assumedToleranceRule.tolerance, "-");
    const assumedToleranceMagnitude = cleanToleranceMagnitude(assumedToleranceRule.tolerance);
    notes = appendNote(notes, `Assumed general tolerance +/-${assumedToleranceMagnitude} based on ${assumedToleranceRule.decimalPlaces} decimal place${assumedToleranceRule.decimalPlaces === 1 ? "" : "s"}.`);
    warnings?.push(`Applied assumed general tolerance +/-${assumedToleranceMagnitude} to ${labelForWarnings}; no explicit tolerance was found.`);
  }
  const requestedToleranceType = clean(item?.toleranceType);
  const toleranceType = assumedToleranceRule
    ? "plusMinus"
    : (["plusMinus", "limits", "gdandt", "text"].includes(requestedToleranceType)
    ? requestedToleranceType
    : (gdTolerance ? "gdandt" : (lowerLimit || upperLimit ? "limits" : "plusMinus")));
  const hasInspectionValue = hasNumeric(nominal)
    || hasNumeric(plusTolerance)
    || hasNumeric(minusTolerance)
    || hasNumeric(lowerLimit)
    || hasNumeric(upperLimit)
    || hasNumeric(gdTolerance);
  if (!hasInspectionValue) {
    return null;
  }
  const label = STANDALONE_UNIT_PATTERN.test(clean(item?.label)) ? "" : clean(item?.label);
  const number = hasNumeric(item?.number) ? clean(item?.number) : String(index + 1);
  const confidence = confidenceValue(item?.confidence);
  if (confidence !== "high") {
    warnings?.push(`AI marked ${labelForWarnings} as ${confidence || "low"} confidence; review the characteristic and balloon placement.`);
  }
  return {
    number,
    label,
    type: clean(item?.type) || "Dimension",
    units: normalizeUnits(item?.units),
    nominal,
    toleranceType,
    plusTolerance,
    minusTolerance,
    lowerLimit,
    upperLimit,
    gdTolerance,
    datums: clean(item?.datums),
    notes,
    confidence,
    balloon: {
      pageNumber: normalizedPageNumber(item?.pageNumber, options.pageCount, warnings, labelForWarnings),
      x: normalizedCoordinate(item?.x, "x", warnings, labelForWarnings),
      y: normalizedCoordinate(item?.y, "y", warnings, labelForWarnings)
    }
  };
}

function requireClient(apiKey) {
  const normalizedKey = String(apiKey || "").trim();
  if (!normalizedKey) {
    throw new Error("Add an OpenAI API key in Settings > AI before extracting inspection dimensions.");
  }
  return new OpenAI({ apiKey: normalizedKey });
}

function confidenceValue(value) {
  const text = String(value || "").trim().toLowerCase();
  if (["high", "medium", "low"].includes(text)) return text;
  return "low";
}

async function extractInspectionFromDrawing({ apiKey, filePath, filename, pageCount = 1, assumedGeneralTolerances = {} }) {
  const client = requireClient(apiKey);
  const buffer = await fs.readFile(filePath);
  const normalizedCount = normalizedPageCount(pageCount);
  const response = await client.responses.create({
    model: "gpt-5",
    input: [
      {
        role: "system",
        content: [{
          type: "input_text",
          text: [
            "You extract inspection characteristics from manufacturing drawings.",
            "Return only structured JSON.",
            "Extract dimensions, tolerances, notes, and GD&T callouts useful for inspection.",
            "Stacked tolerances printed above and below a nominal value are one characteristic; put the top value in plusTolerance and the bottom value in minusTolerance.",
            "Only return numeric inspection characteristics. Ignore standalone units or text such as in, inch, mm, title block words, material notes, and drawing boilerplate.",
            "Units such as in or mm belong only in the units field and must never be returned as nominal, tolerance, label, or a separate characteristic.",
            "Use conservative confidence. High confidence requires clear nominal value, tolerance or limit, and units.",
            `This PDF has ${normalizedCount} page${normalizedCount === 1 ? "" : "s"}. Return a valid 1-based pageNumber for every balloon.`,
            "Estimate balloon page and normalized x/y location when visible. Coordinates must be 0 to 1 relative to the page.",
            "Do not invent dimensions or tolerances."
          ].join(" ")
        }]
      },
      {
        role: "user",
        content: [
          {
            type: "input_file",
            filename: filename || path.basename(filePath),
            file_data: `data:application/pdf;base64,${buffer.toString("base64")}`
          },
          {
            type: "input_text",
            text: `Extract inspection characteristics and likely balloon positions from this ${normalizedCount}-page PDF drawing.`
          }
        ]
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "inspection_drawing_extraction",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            characteristics: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  number: { type: "string" },
                  label: { type: "string" },
                  type: { type: "string" },
                  units: { type: "string" },
                  nominal: { type: "string" },
                  toleranceType: { type: "string" },
                  plusTolerance: { type: "string" },
                  minusTolerance: { type: "string" },
                  lowerLimit: { type: "string" },
                  upperLimit: { type: "string" },
                  gdTolerance: { type: "string" },
                  datums: { type: "string" },
                  notes: { type: "string" },
                  confidence: { type: "string" },
                  pageNumber: { type: "number" },
                  x: { type: "number" },
                  y: { type: "number" }
                },
                required: ["number", "label", "type", "units", "nominal", "toleranceType", "plusTolerance", "minusTolerance", "lowerLimit", "upperLimit", "gdTolerance", "datums", "notes", "confidence", "pageNumber", "x", "y"]
              }
            },
            warnings: {
              type: "array",
              items: { type: "string" }
            }
          },
          required: ["characteristics", "warnings"]
        }
      }
    }
  });
  const parsed = JSON.parse(response.output_text || "{}");
  const rawCharacteristics = Array.isArray(parsed.characteristics) ? parsed.characteristics : [];
  const warnings = (Array.isArray(parsed.warnings) ? parsed.warnings : []).map(clean).filter(Boolean);
  const characteristics = rawCharacteristics
    .map((item, index) => normalizeExtractedCharacteristic(item, index, { pageCount: normalizedCount, warnings, assumedGeneralTolerances }))
    .filter(Boolean);
  const discardedCount = rawCharacteristics.length - characteristics.length;
  if (discardedCount > 0) {
    warnings.push(`Ignored ${discardedCount} non-numeric drawing callout${discardedCount === 1 ? "" : "s"}.`);
  }
  return {
    characteristics,
    warnings: Array.from(new Set(warnings))
  };
}

module.exports = {
  extractInspectionFromDrawing,
  normalizeAssumedGeneralToleranceSettings,
  _internals: {
    cleanNumeric,
    cleanToleranceMagnitude,
    decimalPlacesForNominal,
    normalizedPageNumber,
    normalizedCoordinate,
    normalizeAssumedGeneralToleranceSettings,
    normalizeExtractedCharacteristic,
    selectAssumedGeneralTolerance,
    splitStackedTolerance
  }
};
