"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { PDFDocument } = require("pdf-lib");

const {
  _internals
} = require("../electron/backend/erp.cjs");

test("ballooned PDF generation preserves multi-page source drawings", async () => {
  const source = await PDFDocument.create();
  source.addPage([612, 792]);
  source.addPage([612, 792]);
  source.addPage([612, 792]);
  const sourceBytes = await source.save();

  const { pdfBytes, pageCount } = await _internals.drawBalloonsOnPdf(sourceBytes, [{
    id: "balloon-1",
    characteristicId: "characteristic-1",
    sourceDrawingDocumentId: "drawing-1",
    pageNumber: 2,
    x: 0.25,
    y: 0.75,
    labelText: "1",
    placementSource: "ai"
  }]);

  const generated = await PDFDocument.load(pdfBytes);
  assert.equal(pageCount, 3);
  assert.equal(generated.getPageCount(), 3);
});
