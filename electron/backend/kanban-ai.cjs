"use strict";

const OpenAI = require("openai");

function normalizeWhitespace(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function requireClient(apiKey) {
  const normalizedKey = String(apiKey || "").trim();
  if (!normalizedKey) {
    throw new Error("Add an OpenAI API key in Settings > AI before using Kanban AI.");
  }
  return new OpenAI({ apiKey: normalizedKey });
}

function buildCategoryInstruction(categories) {
  const items = Array.isArray(categories) ? categories.map((item) => normalizeWhitespace(item)).filter(Boolean) : [];
  if (!items.length) {
    return "If a category cannot be determined confidently, return an empty string.";
  }
  return `Choose category from this list when possible: ${items.join(", ")}. If none fit confidently, return an empty string.`;
}

function normalizeCategory(category, categories) {
  const normalized = normalizeWhitespace(category);
  if (!normalized) {
    return "";
  }
  const available = Array.isArray(categories) ? categories.map((item) => normalizeWhitespace(item)).filter(Boolean) : [];
  const match = available.find((item) => item.toLowerCase() === normalized.toLowerCase());
  return match || "";
}

function buildSeedPayload(card, vendorContext, categories) {
  const pageText = stripHtml(vendorContext?.html || "").slice(0, 5000);
  return {
    currentCard: {
      itemName: normalizeWhitespace(card?.itemName),
      internalInventoryNumber: normalizeWhitespace(card?.internalInventoryNumber),
      minimumLevel: normalizeWhitespace(card?.minimumLevel),
      maximumLevel: normalizeWhitespace(card?.maximumLevel),
      orderQuantity: normalizeWhitespace(card?.orderQuantity),
      storageLocation: normalizeWhitespace(card?.storageLocation),
      department: normalizeWhitespace(card?.department),
      vendor: normalizeWhitespace(card?.vendor),
      category: normalizeWhitespace(card?.category),
      purchaseUrl: normalizeWhitespace(card?.purchaseUrl),
      orderingNotes: String(card?.orderingNotes || "").trim(),
      packSize: normalizeWhitespace(card?.packSize),
      description: String(card?.description || "").trim()
    },
    allowedCategories: Array.isArray(categories) ? categories : [],
    vendorImport: vendorContext?.scraped || null,
    pageText
  };
}

async function enrichKanbanCardDraft({ apiKey, card, categories, vendorContext }) {
  const client = requireClient(apiKey);
  const response = await client.responses.create({
    model: "gpt-5",
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: [
              "You normalize purchasing card data for a local manufacturing ERP.",
              "Return only structured JSON.",
              "Make the item title short, human-readable, and suitable for a printed Kanban card.",
              "Keep the title brief, usually 2 to 8 words.",
              "Write a practical description that is short and to the point, usually one sentence and never more than two short sentences.",
              "Write concise ordering notes for a buyer.",
              "Do not include any URLs, web addresses, or link text in the description or ordering notes.",
              "Suggest reasonable minimum level, maximum level, order quantity, and pack size or purchase unit when they can be inferred from the product context.",
              "Do not invent pricing, stock, or ordering requirements.",
              buildCategoryInstruction(categories)
            ].join(" ")
          }
        ]
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: JSON.stringify(buildSeedPayload(card, vendorContext, categories))
          }
        ]
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "kanban_ai_fill",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            itemName: { type: "string" },
            description: { type: "string" },
            orderingNotes: { type: "string" },
            category: { type: "string" },
            vendor: { type: "string" },
            minimumLevel: { type: "string" },
            maximumLevel: { type: "string" },
            orderQuantity: { type: "string" },
            packSize: { type: "string" }
          },
          required: ["itemName", "description", "orderingNotes", "category", "vendor", "minimumLevel", "maximumLevel", "orderQuantity", "packSize"]
        }
      }
    }
  });

  const parsed = JSON.parse(response.output_text || "{}");
  return {
    itemName: normalizeWhitespace(parsed?.itemName),
    description: String(parsed?.description || "").trim(),
    orderingNotes: String(parsed?.orderingNotes || "").trim(),
    category: normalizeCategory(parsed?.category, categories),
    vendor: normalizeWhitespace(parsed?.vendor),
    minimumLevel: normalizeWhitespace(parsed?.minimumLevel),
    maximumLevel: normalizeWhitespace(parsed?.maximumLevel),
    orderQuantity: normalizeWhitespace(parsed?.orderQuantity),
    packSize: normalizeWhitespace(parsed?.packSize)
  };
}

async function generateKanbanReferenceImage({ apiKey, card }) {
  const client = requireClient(apiKey);
  const prompt = [
    "Create a neutral catalog-style product reference image on a plain white background.",
    "Use a realistic product photo style, centered composition, and no text, labels, logos, or watermark.",
    "Show only the product itself, suitable for a Kanban replenishment card.",
    `Item name: ${normalizeWhitespace(card?.itemName) || "Unspecified shop item"}.`,
    card?.description ? `Description: ${String(card.description).trim()}.` : "",
    card?.vendor ? `Vendor context: ${normalizeWhitespace(card.vendor)}.` : "",
    card?.packSize ? `Pack size or unit: ${normalizeWhitespace(card.packSize)}.` : "",
    card?.orderingNotes ? `Ordering notes: ${String(card.orderingNotes).trim()}.` : ""
  ].filter(Boolean).join(" ");

  const response = await client.images.generate({
    model: "gpt-image-1",
    prompt,
    size: "1024x1024"
  });

  const imageBase64 = response?.data?.[0]?.b64_json;
  if (!imageBase64) {
    throw new Error("OpenAI did not return image data.");
  }
  return {
    buffer: Buffer.from(imageBase64, "base64"),
    extension: ".png",
    mimeType: "image/png"
  };
}

module.exports = {
  enrichKanbanCardDraft,
  generateKanbanReferenceImage
};
