"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { extractProductData } = require("../electron/backend/kanban-vendors.cjs");
const { ERPBackend } = require("../electron/backend/erp.cjs");

test("extractProductData reads embedded storefront product JSON", () => {
  const html = `
    <html>
      <head><title>Generic page title</title></head>
      <body>
        <script type="application/json">
          {
            "props": {
              "pageProps": {
                "product": {
                  "__typename": "Product",
                  "productName": "1/4 in Carbide End Mill",
                  "description": "Four flute carbide end mill for aluminum.",
                  "sku": "EM-250-4F",
                  "packSize": "Pack of 1",
                  "imageUrl": "/images/endmill.png"
                }
              }
            }
          }
        </script>
      </body>
    </html>
  `;
  const result = extractProductData("https://example-supply.com/products/EM-250-4F", html);
  assert.equal(result.itemName, "1/4 in Carbide End Mill");
  assert.equal(result.description, "Four flute carbide end mill for aluminum.");
  assert.equal(result.vendorPartNumber, "EM-250-4F");
  assert.equal(result.packSize, "Pack of 1");
  assert.equal(result.imageUrl, "https://example-supply.com/images/endmill.png");
});

test("extractProductData keeps URL path tokens for sparse blocked pages", () => {
  const html = "<html><head><title>Pardon Our Interruption</title></head><body>Access denied</body></html>";
  const result = extractProductData("https://www.mcmaster.com/91251A537/button-head-screws", html);
  assert.equal(result.vendor, "McMaster-Carr");
  assert.deepEqual(result.pageContext.pathTokens, ["91251A537", "button", "head", "screws"]);
});

test("extractProductData falls back to likely product img tags", () => {
  const html = `
    <html>
      <head><title>Bench Vise - Example Supply</title></head>
      <body>
        <img src="/assets/logo.png" alt="Example Supply logo" width="300" height="80">
        <img
          class="product-gallery-image"
          src="/images/vise-small.jpg"
          srcset="/images/vise-small.jpg 320w, /images/vise-large.jpg 1200w"
          alt="Bench vise"
          width="800"
          height="600"
        >
      </body>
    </html>
  `;
  const result = extractProductData("https://example-supply.com/products/bench-vise", html);
  assert.equal(result.itemName, "Bench Vise - Example Supply");
  assert.equal(result.imageUrl, "https://example-supply.com/images/vise-large.jpg");
});

test("extractProductData reads rendered snapshot image fallback", () => {
  const html = `
    <html>
      <head><title>Socket Head Cap Screw</title></head>
      <body>
        <script type="application/json" id="amerp-rendered-product-snapshot">
          {"images":[
            {"src":"https://example.com/logo.png","alt":"logo"},
            {"src":"https://example.com/socket-screw.png","alt":"Socket screw","width":900,"height":700}
          ]}
        </script>
      </body>
    </html>
  `;
  const result = extractProductData("https://example.com/socket-screw", html);
  assert.equal(result.imageUrl, "https://example.com/socket-screw.png");
});

test("extractProductData skips obvious logo metadata when a product image exists", () => {
  const html = `
    <html>
      <head>
        <title>Coolant Pump</title>
        <meta property="og:image" content="/assets/company-logo.png">
      </head>
      <body>
        <img class="main-product-image" src="/products/coolant-pump.jpg" alt="Coolant pump" width="900" height="650">
      </body>
    </html>
  `;
  const result = extractProductData("https://industrial.example/products/coolant-pump", html);
  assert.equal(result.imageUrl, "https://industrial.example/products/coolant-pump.jpg");
});

test("loadKanbanProductContext keeps the resolved product URL after a short-link redirect", async () => {
  const backend = new ERPBackend({
    app: {
      getPath: () => process.cwd(),
      getAppPath: () => process.cwd(),
      isPackaged: false
    },
    devServerUrl: "",
    pythonPath: "python"
  });
  backend.fetchHtml = async () => ({
    finalUrl: "https://www.amazon.com/dp/B0FGFBK38M",
    html: `
      <html>
        <head><title>Deburring Tool - Amazon</title></head>
        <body>
          <img class="main-product-image" src="https://images.example/deburring-tool.jpg" alt="Deburring tool" width="900" height="650">
        </body>
      </html>
    `
  });
  backend.fetchRenderedHtml = async () => {
    throw new Error("Rendered fallback should not be needed.");
  };

  const result = await backend.loadKanbanProductContext("https://amzn.to/49oLVpt");
  assert.equal(result.imported.vendor, "Amazon");
  assert.equal(result.imported.purchaseUrl, "https://www.amazon.com/dp/B0FGFBK38M");
  assert.equal(result.imported.imageUrl, "https://images.example/deburring-tool.jpg");
  assert.equal(result.usedRenderedFallback, false);
});
