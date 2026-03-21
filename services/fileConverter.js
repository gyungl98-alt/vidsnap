
// fileConverter.js
const fs = require("fs");
const path = require("path");
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel } = require("docx");
const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");

/**
 * Simple parser: raw text -> structured blocks
 * Blocks: { type: 'heading'|'paragraph'|'list'|'table', ... }
 */
function parseToBlocks(rawText) {
  const lines = rawText.split(/\r?\n/).map(l => l.trim());
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line) { i++; continue; }

    // List detection
    if (/^(\-|\u2022|\*|\d+[\.\)]|[a-z]\))/i.test(line)) {
      const items = [];
      const ordered = /^\d+[\.\)]/.test(line);
      while (i < lines.length && lines[i] && /^(\-|\u2022|\*|\d+[\.\)]|[a-z]\))/i.test(lines[i])) {
        items.push(lines[i].replace(/^(\-|\u2022|\*|\d+[\.\)]|[a-z]\))\s*/i, "").trim());
        i++;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    // Table detection: multiple columns separated by tab or 2+ spaces
    const cols = line.split(/\t| {2,}/).map(c => c.trim()).filter(Boolean);
    if (cols.length >= 2) {
      const rows = [];
      while (i < lines.length) {
        const rcols = lines[i].split(/\t| {2,}/).map(c => c.trim()).filter(Boolean);
        if (rcols.length >= 2) {
          rows.push(rcols);
          i++;
        } else break;
      }
      blocks.push({ type: "table", rows });
      continue;
    }

    // Heading heuristic: short, uppercase or Title-like, no trailing punctuation
    if (line.length < 80 && /^[A-Z0-9 \-:()]+$/.test(line) && /[A-Z]/.test(line)) {
      blocks.push({ type: "heading", level: 1, text: line });
      i++;
      continue;
    }

    // Paragraph: join consecutive normal lines
    const paraLines = [line];
    i++;
    while (i < lines.length && lines[i] && !/^(\-|\u2022|\*|\d+[\.\)]|[a-z]\))/.test(lines[i]) && lines[i].split(/\t| {2,}/).length < 2) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({ type: "paragraph", text: paraLines.join(" ") });
  }

  return { blocks };
}

/* ---------------- Exporters ---------------- */

function ensureUploads() {
  const dir = path.join(__dirname, "uploads");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** TXT exporter: clean, readable */
function exportToTxt(struct, outPath) {
  const parts = [];
  for (const b of struct.blocks) {
    if (b.type === "heading") parts.push(b.text.toUpperCase());
    else if (b.type === "paragraph") parts.push(b.text);
    else if (b.type === "list") {
      parts.push(b.items.map((it, idx) => (b.ordered ? `${idx + 1}. ${it}` : `- ${it}`)).join("\n"));
    } else if (b.type === "table") {
      parts.push(b.rows.map(r => r.join("\t")).join("\n"));
    }
    parts.push(""); // blank line between blocks
  }
  fs.writeFileSync(outPath, parts.join("\n"));
}

/** DOCX exporter */
async function exportToDocx(struct, outPath) {
  const doc = new Document();
  const children = [];

  for (const b of struct.blocks) {
    if (b.type === "heading") {
      children.push(new Paragraph({ text: b.text, heading: HeadingLevel.HEADING_1 }));
    } else if (b.type === "paragraph") {
      children.push(new Paragraph(b.text));
    } else if (b.type === "list") {
      for (const it of b.items) {
        children.push(new Paragraph({ text: it, bullet: { level: 0 } }));
      }
    } else if (b.type === "table") {
      const rows = b.rows.map(r => new TableRow({
        children: r.map(cell => new TableCell({ children: [new Paragraph(cell || "")] }))
      }));
      const table = new Table({ rows });
      children.push(table);
    }
  }

  doc.addSection({ children });
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outPath, buffer);
}

/** PDF exporter (pdfkit) */
function exportToPdf(struct, outPath) {
  const doc = new PDFDocument({ margin: 50 });
  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);

  for (const b of struct.blocks) {
    if (b.type === "heading") {
      doc.fontSize(16).text(b.text, { underline: false });
      doc.moveDown(0.5);
    } else if (b.type === "paragraph") {
      doc.fontSize(11).text(b.text, { align: "left" });
      doc.moveDown(0.5);
    } else if (b.type === "list") {
      for (let idx = 0; idx < b.items.length; idx++) {
        const prefix = b.ordered ? `${idx + 1}. ` : "• ";
        doc.text(prefix + b.items[idx], { indent: 10 });
      }
      doc.moveDown(0.5);
    } else if (b.type === "table") {
      // simple monospace table rendering
      const colCount = Math.max(...b.rows.map(r => r.length));
      const colWidths = new Array(colCount).fill(0);
      b.rows.forEach(r => r.forEach((c, j) => { colWidths[j] = Math.max(colWidths[j], (c || "").length); }));
      b.rows.forEach(r => {
        const line = r.map((c, j) => (c || "").padEnd(colWidths[j] + 2)).join("");
        doc.font("Courier").text(line);
      });
      doc.font("Helvetica");
      doc.moveDown(0.5);
    }
  }

  doc.end();
}

/** XLSX exporter */
async function exportToXlsx(struct, outPath) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("OCR");

  let rowIndex = 1;
  for (const b of struct.blocks) {
    if (b.type === "heading") {
      ws.getCell(`A${rowIndex}`).value = b.text;
      ws.getRow(rowIndex).font = { bold: true };
      rowIndex++;
    } else if (b.type === "paragraph") {
      ws.getCell(`A${rowIndex}`).value = b.text;
      rowIndex++;
    } else if (b.type === "list") {
      b.items.forEach(it => {
        ws.getCell(`A${rowIndex}`).value = it;
        rowIndex++;
      });
    } else if (b.type === "table") {
      b.rows.forEach(r => {
        r.forEach((c, j) => {
          ws.getCell(rowIndex, j + 1).value = c;
        });
        rowIndex++;
      });
    }
    rowIndex++; // blank row
  }

  await wb.xlsx.writeFile(outPath);
}

/** RTF exporter (simple) */
function escapeRtf(text) {
  return text.replace(/\\/g, "\\\\").replace(/{/g, "\\{").replace(/}/g, "\\}");
}
function exportToRtf(struct, outPath) {
  const rtf = [];
  rtf.push("{\\rtf1\\ansi\\deff0");
  for (const b of struct.blocks) {
    if (b.type === "heading") {
      rtf.push(`{\\b ${escapeRtf(b.text)} }\\par`);
    } else if (b.type === "paragraph") {
      rtf.push(`${escapeRtf(b.text)}\\par`);
    } else if (b.type === "list") {
      b.items.forEach(it => rtf.push(`\\bullet\\tab ${escapeRtf(it)}\\par`));
    } else if (b.type === "table") {
      b.rows.forEach(r => {
        rtf.push(r.map(c => escapeRtf(c)).join("\\tab") + "\\par");
      });
    }
    rtf.push("\\par");
  }
  rtf.push("}");
  fs.writeFileSync(outPath, rtf.join("\n"));
}

/**
 * Main convert function (keeps original signature)
 * text: raw OCR text
 * format: 'txt'|'pdf'|'docx'|'rtf'|'xlsx'
 */
module.exports = async function convert(text, format) {
  ensureUploads();
  const timestamp = Date.now();
  const ext = format.toLowerCase();
  const filePath = path.join(__dirname, "uploads", `result-${timestamp}.${ext}`);

  // Build structured model
  const struct = parseToBlocks(text);

  // Route to exporter
  if (ext === "txt") {
    exportToTxt(struct, filePath);
  } else if (ext === "pdf") {
    exportToPdf(struct, filePath);
  } else if (ext === "docx") {
    await exportToDocx(struct, filePath);
  } else if (ext === "rtf") {
    exportToRtf(struct, filePath);
  } else if (ext === "xlsx" || ext === "xls") {
    await exportToXlsx(struct, filePath);
  } else {
    // fallback: plain text
    fs.writeFileSync(filePath, text);
  }

  return filePath;
};



