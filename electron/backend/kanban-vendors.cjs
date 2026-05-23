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

function decodeJsonText(value) {
  const raw = String(value || "");
  try {
    return normalizeWhitespace(JSON.parse(`"${raw.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`));
  } catch {
    return normalizeWhitespace(raw
      .replace(/\\u([0-9a-f]{4})/gi, (_match, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\"/g, '"')
      .replace(/\\\//g, "/"));
  }
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

function firstJsonStringMatch(text, keys) {
  const source = String(text || "");
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`["']${escaped}["']\\s*:\\s*["']([^"']{2,800})["']`, "i");
    const match = source.match(pattern);
    if (match?.[1]) {
      return decodeJsonText(match[1]);
    }
  }
  return "";
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

function findProductLikeObject(value, depth = 0) {
  if (!value || depth > 8) {
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findProductLikeObject(item, depth + 1);
      if (found) {
        return found;
      }
    }
    return null;
  }
  if (typeof value !== "object") {
    return null;
  }
  const type = String(value["@type"] || value.type || value.__typename || "").toLowerCase();
  const hasProductShape = type.includes("product")
    || (value.name && (value.sku || value.mpn || value.image || value.description))
    || (value.title && (value.image || value.description || value.brand));
  if (hasProductShape) {
    return value;
  }
  for (const item of Object.values(value)) {
    const found = findProductLikeObject(item, depth + 1);
    if (found) {
      return found;
    }
  }
  return null;
}

function extractEmbeddedJsonProduct(html) {
  const scripts = String(html || "").match(/<script\b[^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const script of scripts) {
    const raw = script.replace(/^<script\b[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    if (!raw || raw.length > 2_000_000 || !/[{[]/.test(raw)) {
      continue;
    }
    try {
      const parsed = JSON.parse(raw);
      const product = findProductLikeObject(parsed);
      if (product) {
        return product;
      }
    } catch {
      // Most storefront scripts are JS, not JSON. Regex fallbacks handle common keys.
    }
  }
  return {};
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

function imageFromProduct(product) {
  const image = product?.image || product?.images || product?.imageUrl || product?.thumbnail || product?.thumbnailUrl || product?.primaryImage;
  if (Array.isArray(image)) {
    const first = image[0];
    return typeof first === "string" ? first : first?.url || first?.src || "";
  }
  if (typeof image === "string") {
    return image;
  }
  return image?.url || image?.src || "";
}

function extractVendorPartNumber(html, product) {
  const text = stripTags(html);
  return normalizeWhitespace(product?.sku || product?.mpn || product?.partNumber || product?.itemNumber || product?.productNumber || "")
    || firstJsonStringMatch(html, ["sku", "mpn", "partNumber", "itemNumber", "productNumber", "catalogNumber", "model"])
    || firstMatch(text, /(?:sku|mpn|part(?:\s+number)?|item(?:\s+number)?|model(?:\s+#| number)?|catalog(?:\s+#| number)?)[^A-Z0-9]{0,25}([A-Z0-9][A-Z0-9_.-]{2,})/i)
    || firstMatch(html, /"(?:(?:sku)|(?:mpn)|(?:partNumber))"\s*:\s*"([^"]+)"/i);
}

function extractPackSize(html, product) {
  const text = stripTags(html);
  return normalizeWhitespace(product?.size || product?.unitText || product?.unit || product?.packageQuantity || "")
    || firstJsonStringMatch(html, ["packSize", "packageQuantity", "unitSize", "unitText", "quantity"])
    || firstMatch(text, /(?:Pack\s*Size|Package\s*Quantity|Qty\/Pack|Sold\s*In|Unit\s*Size|Pkg\.?\s*Qty\.?)\s*[:#]?\s*([0-9][A-Za-z0-9 ./-]{0,40})/i)
    || firstMatch(text, /(?:Pack\s*of|Pkg\.?\s*of|Qty\s*:)\s*([0-9][A-Za-z0-9 ./-]{0,40})/i);
}

function extractUrlFacts(url) {
  try {
    const parsed = new URL(url);
    const tokens = decodeURIComponent(parsed.pathname)
      .split(/[/?#&=+_\-.%]+/)
      .map((part) => normalizeWhitespace(part))
      .filter((part) => part && !/^(dp|gp|product|products|p|itm|shop|catalog|detail|www)$/i.test(part))
      .slice(0, 12);
    return {
      hostname: parsed.hostname.replace(/^www\./, ""),
      pathTokens: tokens
    };
  } catch {
    return {
      hostname: "",
      pathTokens: []
    };
  }
}

function buildPageContext(url, html) {
  const text = stripTags(html);
  const facts = extractUrlFacts(url);
  const h1 = stripTags(firstMatch(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i));
  const title = normalizeWhitespace(
    extractMetaContent(html, (name) => name === "og:title" || name === "twitter:title")
      || h1
      || stripTags(firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i))
  );
  return {
    ...facts,
    title,
    h1,
    textSnippet: text.slice(0, 12000)
  };
}

function extractProductData(url, html) {
  const vendor = inferVendorName(url);
  const jsonLdObjects = extractJsonLdObjects(html);
  const product = jsonLdObjects.find((entry) => {
    const type = entry?.["@type"];
    if (Array.isArray(type)) {
      return type.some((item) => String(item).toLowerCase() === "product");
    }
    return String(type || "").toLowerCase() === "product";
  }) || extractEmbeddedJsonProduct(html) || {};
  const pageContext = buildPageContext(url, html);

  const title = normalizeWhitespace(product?.name || product?.title || product?.productName || "")
    || firstJsonStringMatch(html, ["productName", "productTitle", "name", "title"])
    || pageContext.title;

  const description = normalizeWhitespace(product?.description || product?.shortDescription || "")
    || firstJsonStringMatch(html, ["description", "shortDescription", "productDescription"])
    || extractMetaContent(html, (name) => name === "description" || name === "og:description" || name === "twitter:description")
    || stripTags(firstMatch(html, /<div\b[^>]*(?:id|class)=["'][^"']*(?:description|product-detail|product-info)[^"']*["'][^>]*>([\s\S]{20,2500}?)<\/div>/i))
    || firstMatch(html, /"description"\s*:\s*"([^"]{10,})"/i);

  const imageUrl = asAbsoluteUrl(
    url,
    imageFromProduct(product)
      || firstJsonStringMatch(html, ["imageUrl", "thumbnailUrl", "thumbnail", "primaryImage"])
      || firstMatch(html, /<link\b[^>]*rel=["']image_src["'][^>]*href=["']([^"']+)["']/i)
      || extractMetaContent(html, (name) => name === "og:image" || name === "twitter:image")
  );

  const itemName = normalizeTitle(title, vendor);
  const vendorPartNumber = extractVendorPartNumber(html, product);
  const packSize = extractPackSize(html, product);
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
    pageContext,
    warnings
  };
}

module.exports = {
  buildPageContext,
  extractProductData,
  inferVendorName
};
