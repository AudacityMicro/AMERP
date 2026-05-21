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

function normalizeExtractedCharacteristic(item, index) {
  const rawNominal = clean(item?.nominal);
  let nominal = cleanNumeric(rawNominal);
  let plusTolerance = cleanNumeric(item?.plusTolerance);
  let minusTolerance = cleanNumeric(item?.minusTolerance);
  const lowerLimit = cleanNumeric(item?.lowerLimit);
  const upperLimit = cleanNumeric(item?.upperLimit);
  const gdTolerance = cleanNumeric(item?.gdTolerance);
  ({ nominal, plusTolerance, minusTolerance } = splitStackedTolerance(rawNominal || nominal, plusTolerance, minusTolerance));
  nominal = cleanNumeric(nominal);
  plusTolerance = cleanNumeric(plusTolerance);
  minusTolerance = cleanNumeric(minusTolerance);
  const requestedToleranceType = clean(item?.toleranceType);
  const toleranceType = ["plusMinus", "limits", "gdandt", "text"].includes(requestedToleranceType)
    ? requestedToleranceType
    : (gdTolerance ? "gdandt" : (lowerLimit || upperLimit ? "limits" : "plusMinus"));
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
    notes: clean(item?.notes),
    confidence: confidenceValue(item?.confidence),
    balloon: {
      pageNumber: Number.isFinite(Number(item?.pageNumber)) && Number(item?.pageNumber) > 0 ? Number(item.pageNumber) : 1,
      x: Number.isFinite(Number(item?.x)) ? Math.max(0, Math.min(1, Number(item.x))) : 0.5,
      y: Number.isFinite(Number(item?.y)) ? Math.max(0, Math.min(1, Number(item.y))) : 0.5
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

async function extractInspectionFromDrawing({ apiKey, filePath, filename }) {
  const client = requireClient(apiKey);
  const buffer = await fs.readFile(filePath);
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
            text: "Extract inspection characteristics and likely balloon positions from this PDF drawing."
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
  const characteristics = rawCharacteristics
    .map((item, index) => normalizeExtractedCharacteristic(item, index))
    .filter(Boolean);
  const discardedCount = rawCharacteristics.length - characteristics.length;
  const warnings = (Array.isArray(parsed.warnings) ? parsed.warnings : []).map(clean).filter(Boolean);
  if (discardedCount > 0) {
    warnings.push(`Ignored ${discardedCount} non-numeric drawing callout${discardedCount === 1 ? "" : "s"}.`);
  }
  return {
    characteristics,
    warnings
  };
}

module.exports = {
  extractInspectionFromDrawing,
  _internals: {
    cleanNumeric,
    normalizeExtractedCharacteristic,
    splitStackedTolerance
  }
};
