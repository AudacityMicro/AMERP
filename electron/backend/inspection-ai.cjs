"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const OpenAI = require("openai");

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
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
  const characteristics = (Array.isArray(parsed.characteristics) ? parsed.characteristics : []).map((item, index) => ({
    number: clean(item.number) || String(index + 1),
    label: clean(item.label),
    type: clean(item.type) || "Dimension",
    units: clean(item.units) || "in",
    nominal: clean(item.nominal),
    toleranceType: ["plusMinus", "limits", "gdandt", "text"].includes(clean(item.toleranceType)) ? clean(item.toleranceType) : (clean(item.gdTolerance) ? "gdandt" : "plusMinus"),
    plusTolerance: clean(item.plusTolerance),
    minusTolerance: clean(item.minusTolerance),
    lowerLimit: clean(item.lowerLimit),
    upperLimit: clean(item.upperLimit),
    gdTolerance: clean(item.gdTolerance),
    datums: clean(item.datums),
    notes: clean(item.notes),
    confidence: confidenceValue(item.confidence),
    balloon: {
      pageNumber: Number.isFinite(Number(item.pageNumber)) && Number(item.pageNumber) > 0 ? Number(item.pageNumber) : 1,
      x: Number.isFinite(Number(item.x)) ? Math.max(0, Math.min(1, Number(item.x))) : 0.5,
      y: Number.isFinite(Number(item.y)) ? Math.max(0, Math.min(1, Number(item.y))) : 0.5
    }
  }));
  return {
    characteristics,
    warnings: (Array.isArray(parsed.warnings) ? parsed.warnings : []).map(clean).filter(Boolean)
  };
}

module.exports = {
  extractInspectionFromDrawing
};
