"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { extractProductData } = require("../electron/backend/kanban-vendors.cjs");

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
