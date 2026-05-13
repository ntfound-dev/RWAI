/**
 * Generate sample RWA document files for testing the tokenize upload flow.
 * Output: app/public/samples/
 *
 * Run: node scripts/generate-samples.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import zlib from "zlib";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "../app/public/samples");
fs.mkdirSync(OUT, { recursive: true });

// ─── PDF helper ────────────────────────────────────────────────────────────

async function makePdf(lines) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  const { height } = page.getSize();
  let y = height - 50;
  for (const line of lines) {
    if (line === "") { y -= 12; continue; }
    page.drawText(line, { x: 50, y, size: 11, font, color: rgb(0, 0, 0) });
    y -= 16;
  }
  return Buffer.from(await doc.save());
}

fs.writeFileSync(
  path.join(OUT, "sample-deed.pdf"),
  await makePdf([
    "DEED OF REAL PROPERTY",
    "Property: 123 Broadway, New York, NY 10006",
    "Parcel ID: NYC-MAN-2024-00123",
    "Grantor: Manhattan Holdings LLC",
    "Grantee: RWAi Token Trust",
    "Assessed Value: $4,250,000",
    "Lot Area: 3,200 sq ft",
    "Zoning: C6-4 Commercial",
    "Date of Transfer: January 15, 2024",
    "Recording Number: 2024-NYC-0034521",
  ])
);
console.log("✓ sample-deed.pdf");

// ─── 2. PDF — Appraisal Report ────────────────────────────────────────────

fs.writeFileSync(
  path.join(OUT, "sample-appraisal.pdf"),
  await makePdf([
    "REAL ESTATE APPRAISAL REPORT",
    "Subject Property: 123 Broadway, New York, NY 10006",
    "Appraiser: John Smith, MAI - License #NY-CGA-04521",
    "Date of Appraisal: December 10, 2023",
    "Purpose: Tokenization market value estimate",
    "Market Value: $4,250,000",
    "Capitalization Rate: 5.2%",
    "Net Operating Income: $221,000/year",
    "Occupancy Rate: 97%",
    "Comparable Sale 1: 111 Wall St - $4,100,000 (Sep 2023)",
    "Comparable Sale 2: 99 Fulton St - $4,400,000 (Nov 2023)",
    "Condition: Excellent",
    "Appraiser Certification: This appraisal is USPAP compliant.",
  ])
);
console.log("✓ sample-appraisal.pdf");

// ─── 3. PDF — Income Statement ────────────────────────────────────────────

fs.writeFileSync(
  path.join(OUT, "sample-income-statement.pdf"),
  await makePdf([
    "PROPERTY INCOME STATEMENT — FY 2023",
    "Property: 123 Broadway, New York, NY 10006",
    "GROSS RENTAL INCOME",
    "  Office Space (8,000 sqft @ $32/sqft/yr): $256,000",
    "  Retail (1,200 sqft @ $48/sqft/yr):        $57,600",
    "  Parking (12 spaces @ $400/mo):            $57,600",
    "Total Gross Income:                         $371,200",
    "OPERATING EXPENSES",
    "  Property Management (5%):                 ($18,560)",
    "  Insurance:                                ($12,000)",
    "  Property Taxes:                           ($85,000)",
    "  Maintenance & Repairs:                    ($22,000)",
    "  Utilities (common areas):                  ($8,640)",
    "  Reserve Fund (1%):                         ($3,712)",
    "Total Expenses:                            ($149,912)",
    "NET OPERATING INCOME:                       $221,288",
    "Cap Rate (based on $4.25M value): 5.21%",
  ])
);
console.log("✓ sample-income-statement.pdf");

// ─── 4. DOCX — Ownership Certificate ─────────────────────────────────────
// DOCX = ZIP containing XML files

function makeDocx(paragraphs) {
  const wParagraphs = paragraphs
    .map(
      (text) =>
        `<w:p><w:r><w:t xml:space="preserve">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</w:t></w:r></w:p>`
    )
    .join("\n");

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
${wParagraphs}
  </w:body>
</w:document>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const relsMain = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const relsWord = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

  // Build minimal ZIP manually
  function crc32(buf) {
    let crc = 0xffffffff;
    for (const byte of buf) {
      crc ^= byte;
      for (let j = 0; j < 8; j++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function localFileHeader(name, data) {
    const nameBuf = Buffer.from(name);
    const crc = crc32(data);
    const hdr = Buffer.alloc(30 + nameBuf.length);
    hdr.writeUInt32LE(0x04034b50, 0);  // signature
    hdr.writeUInt16LE(20, 4);           // version needed
    hdr.writeUInt16LE(0, 6);            // flags
    hdr.writeUInt16LE(0, 8);            // compression (stored)
    hdr.writeUInt16LE(0, 10);           // mod time
    hdr.writeUInt16LE(0, 12);           // mod date
    hdr.writeUInt32LE(crc, 14);
    hdr.writeUInt32LE(data.length, 18);
    hdr.writeUInt32LE(data.length, 22);
    hdr.writeUInt16LE(nameBuf.length, 26);
    hdr.writeUInt16LE(0, 28);
    nameBuf.copy(hdr, 30);
    return { hdr, crc };
  }

  function centralDirEntry(name, data, offset, crc) {
    const nameBuf = Buffer.from(name);
    const entry = Buffer.alloc(46 + nameBuf.length);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0, 8);
    entry.writeUInt16LE(0, 10);
    entry.writeUInt16LE(0, 12);
    entry.writeUInt16LE(0, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBuf.length, 28);
    entry.writeUInt16LE(0, 30);
    entry.writeUInt16LE(0, 32);
    entry.writeUInt16LE(0, 34);
    entry.writeUInt16LE(0, 36);
    entry.writeUInt32LE(0, 38);
    entry.writeUInt32LE(offset, 42);
    nameBuf.copy(entry, 46);
    return entry;
  }

  const files = [
    { name: "[Content_Types].xml", data: Buffer.from(contentTypes) },
    { name: "_rels/.rels", data: Buffer.from(relsMain) },
    { name: "word/document.xml", data: Buffer.from(documentXml) },
    { name: "word/_rels/document.xml.rels", data: Buffer.from(relsWord) },
  ];

  const parts = [];
  const centralParts = [];
  let offset = 0;

  for (const { name, data } of files) {
    const { hdr, crc } = localFileHeader(name, data);
    parts.push(hdr, data);
    centralParts.push(centralDirEntry(name, data, offset, crc));
    offset += hdr.length + data.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...parts, centralDir, eocd]);
}

fs.writeFileSync(
  path.join(OUT, "sample-ownership-certificate.docx"),
  makeDocx([
    "CERTIFICATE OF OWNERSHIP",
    "",
    "This certifies that RWAi Token Trust holds full legal title to:",
    "",
    "Property Address: 123 Broadway, New York, NY 10006",
    "Legal Description: Block 52, Lot 7, Manhattan, New York County",
    "Owner: RWAi Token Trust (EIN: 47-1234567)",
    "Date of Acquisition: January 15, 2024",
    "Purchase Price: $4,100,000",
    "Current Assessed Value: $4,250,000",
    "",
    "Encumbrances: None",
    "Liens: None",
    "Title Insurance: Stewart Title Guaranty Co. — Policy #STG-2024-00921",
    "",
    "Issued by: New York County Clerk",
    "Recording Date: January 16, 2024",
    "Book/Page: 12847/391",
  ])
);
console.log("✓ sample-ownership-certificate.docx");

// ─── 5. PNG — Appraisal Photo (synthetic) ─────────────────────────────────
// Minimal valid PNG: 200x150 px, white background with text-like noise pattern

function makePng(width, height) {
  function adler32(data) {
    let s1 = 1, s2 = 0;
    for (const b of data) { s1 = (s1 + b) % 65521; s2 = (s2 + s1) % 65521; }
    return (s2 << 16) | s1;
  }

  function crc32png(buf) {
    const table = [];
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c;
    }
    let crc = 0xffffffff;
    for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
    return ((crc ^ 0xffffffff) >>> 0);
  }

  function chunk(type, data) {
    const typeBuf = Buffer.from(type, "ascii");
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32png(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);  // bit depth
  ihdr.writeUInt8(2, 9);  // RGB color
  ihdr.writeUInt8(0, 10); ihdr.writeUInt8(0, 11); ihdr.writeUInt8(0, 12);

  // Raw scanlines: filter byte (0) + RGB pixels
  const scanlines = [];
  for (let y = 0; y < height; y++) {
    const row = [0]; // filter type
    for (let x = 0; x < width; x++) {
      // White background with dark "text block" stripes to simulate a document
      const inTextLine = y > 20 && y < height - 20 && (Math.floor((y - 20) / 18) % 2 === 0);
      const inMargin = x < 20 || x > width - 20;
      if (inMargin || !inTextLine) {
        row.push(245, 245, 245); // near-white
      } else {
        const noise = (x * 7 + y * 13) % 60;
        row.push(40 + noise, 40 + noise, 50 + noise); // dark "ink"
      }
    }
    scanlines.push(...row);
  }

  const rawData = Buffer.from(scanlines);
  const deflated = zlib.deflateSync(rawData);

  // Add zlib wrapper manually since deflateSync adds it already — just use as-is
  const idat = chunk("IDAT", deflated);

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // PNG signature
    chunk("IHDR", ihdr),
    idat,
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

fs.writeFileSync(path.join(OUT, "sample-appraisal-photo.png"), makePng(400, 300));
console.log("✓ sample-appraisal-photo.png");

// ─── 6. JPEG — Property Photo ─────────────────────────────────────────────
// Minimal valid JPEG (SOI + APP0 + SOF0 + SOS + EOI) — 1x1 white pixel

const minimalJpeg = Buffer.from([
  0xff,0xd8,                          // SOI
  0xff,0xe0,0x00,0x10,                // APP0 marker + length
  0x4a,0x46,0x49,0x46,0x00,          // "JFIF\0"
  0x01,0x01,                          // version 1.1
  0x00,                               // aspect ratio units
  0x00,0x01,0x00,0x01,               // 1x1 density
  0x00,0x00,                          // thumbnail
  // Minimal quantization table
  0xff,0xdb,0x00,0x43,0x00,
  ...Array(64).fill(16),
  // SOF0: 8x8, 3 components
  0xff,0xc0,0x00,0x0b,0x08,0x00,0x08,0x00,0x08,0x01,0x01,0x11,0x00,
  // DHT
  0xff,0xc4,0x00,0x1f,0x00,
  0x00,0x01,0x05,0x01,0x01,0x01,0x01,0x01,0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
  0x00,0x01,0x02,0x03,0x04,0x05,0x06,0x07,0x08,0x09,0x0a,0x0b,
  // SOS
  0xff,0xda,0x00,0x08,0x01,0x01,0x00,0x00,0x3f,0x00,
  0xf8,                               // compressed data
  0xff,0xd9,                          // EOI
]);

fs.writeFileSync(path.join(OUT, "sample-property-photo.jpg"), minimalJpeg);
console.log("✓ sample-property-photo.jpg");

// ─── Done ──────────────────────────────────────────────────────────────────

console.log(`\nAll samples written to: app/public/samples/`);
console.log("Files:");
for (const f of fs.readdirSync(OUT)) {
  const size = fs.statSync(path.join(OUT, f)).size;
  console.log(`  ${f.padEnd(40)} ${(size / 1024).toFixed(1)} KB`);
}
