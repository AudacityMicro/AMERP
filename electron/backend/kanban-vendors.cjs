"use strict";

function normalizeWhitespace(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#47;/gi, "/")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code) || 0));
}

function stripTags(value) {
  return normalizeWhitespace(decodeHtmlEntities(String(value || "").replace(/<[^>]+>/g, " ")));
}

function firstMatch(text, pattern, group = 1) {
  const match = String(text || "").match(pattern);
  if (!match) {
    return "";
  }
  return normalizeWhitespace(decodeHtmlEntities(match[group] || ""));
}

function extractMetaContent(html, predicate) {
  const matches = String(html || "").match(/<meta\b[^>]*>/gi) || [];
  for (const tag of matches) {
    const name = firstMatch(tag, /\b(?:name|property)\s*=\s*["']([^"']+)["']/i);
    const content = firstMatch(tag, /\bcontent\s*=\s*["']([^"']*)["']/i);
    if (name && predicate(String(name).toLowerCase()) && content) {
      return content;
    }
  }
  return "";
}

function extractJsonLdObjects(html) {
  const scripts = String(html || "").match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  const objects = [];
  for (const script of scripts) {
    const raw = script.replace(/^<script\b[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    if (!raw) {
      continue;
    }
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        objects.push(...parsed);
      } else if (parsed?.["@graph"] && Array.isArray(parsed["@graph"])) {
        objects.push(...parsed["@graph"]);
      } else {
        objects.push(parsed);
      }
    } catch {
      // Best-effort metadata extraction only.
    }
  }
  return objects.filter(Boolean);
}

function asAbsoluteUrl(url, candidate) {
  const value = normalizeWhitespace(candidate);
  if (!value) {
    return "";
  }
  try {
    return new URL(value, url).toString();
  } catch {
    return "";
  }
}

function inferVendorName(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (hostname.includes("mcmaster")) {
      return "McMaster-Carr";
    }
    if (hostname.includes("mscdirect")) {
      return "MSC";
    }
    if (hostname.includes("amazon.")) {
      return "Amazon";
    }
    return hostname
      .split(".")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(".");
  } catch {
    return "";
  }
}

function normalizeTitle(title, vendor) {
  const text = normalizeWhitespace(title);
  if (!text) {
    return "";
  }
  if (!vendor) {
    return text;
  }
  const escapedVendor = vendor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text
    .replace(new RegExp(`\\s*[:\\-|–]\\s*${escapedVendor}\\s*$`, "i"), "")
    .replace(new RegExp(`\\s*${escapedVendor}\\s*[:\\-|–]\\s*$`, "i"), "")
    .trim();
}

function extractVendorPartNumber(html, jsonLdProduct) {
  return normalizeWhitespace(jsonLdProduct?.sku || jsonLdProduct?.mpn || "")
    || firstMatch(html, /(?:sku|mpn|part(?:\s+number)?|item(?:\s+number)?)[^A-Z0-9]{0,20}([A-Z0-9-]{4,})/i)
    || firstMatch(html, /"(?:(?:sku)|(?:mpn)|(?:partNumber))"\s*:\s*"([^"]+)"/i);
}

function extractPackSize(html, jsonLdProduct) {
  return normalizeWhitespace(jsonLdProduct?.size || jsonLdProduct?.unitText || "")
    || firstMatch(html, /(?:Pack\s*Size|Package\s*Quantity|Qty\/Pack|Sold\s*In|Unit\s*Size)\s*[:#]?\s*<\/?[^>]*>\s*([^<]+)/i)
    || firstMatch(html, /(?:Pack\s*of|Qty\s*:\s*)([0-9][^<]+)/i);
}

function extractProductData(url, html) {
  const vendor = inferVendorName(url);
  const jsonLdObjects = extractJsonLdObjects(html);
  const jsonLdProduct = jsonLdObjects.find((entry) => {
    const type = entry?.["@type"];
    if (Array.isArray(type)) {
      return type.some((item) => String(item).toLowerCase() === "product");
    }
    return String(type || "").toLowerCase() === "product";
  }) || {};

  const title = normalizeWhitespace(jsonLdProduct?.name || "")
    || extractMetaContent(html, (name) => name === "og:title" || name === "twitter:title")
    || stripTags(firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i));

  const description = normalizeWhitespace(jsonLdProduct?.description || "")
    || extractMetaContent(html, (name) => name === "description" || name === "og:description" || name === "twitter:description")
    || firstMatch(html, /"description"\s*:\s*"([^"]{10,})"/i);

  const imageUrl = asAbsoluteUrl(
    url,
    jsonLdProduct?.image?.url
      || (Array.isArray(jsonLdProduct?.image) ? jsonLdProduct.image[0] : jsonLdProduct?.image)
      || extractMetaContent(html, (name) => name === "og:image" || name === "twitter:image")
  );

  const itemName = normalizeTitle(title, vendor);
  const vendorPartNumber = extractVendorPartNumber(html, jsonLdProduct);
  const packSize = extractPackSize(html, jsonLdProduct);
  const warnings = [];
  if (!itemName) {
    warnings.push("Could not extract product title automatically.");
  }
  if (!imageUrl) {
    warnings.push("Could not extract product image automatically.");
  }
  return {
    vendor,
    itemName,
    vendorPartNumber,
    description,
    purchaseUrl: url,
    imageUrl,
    packSize,
    warnings
  };
}

module.exports = {
  extractProductData,
  inferVendorName
};
