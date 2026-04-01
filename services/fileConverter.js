
// fileConverter.js
const fs = require("fs");
const path = require("path");
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, BorderStyle } = require("docx");
const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");

/**
 * Advanced parser: raw text -> structured blocks with improved table detection
 * Blocks: { type: 'heading'|'paragraph'|'list'|'table', ... }
 */
function parseToBlocks(rawText) {
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l !== "");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // List detection (-, •, *, →, numbered, lettered)
    if (/^(\-|\u2022|\*|•|→|\d+[\.\)]|[a-z]\))/i.test(line)) {
      const items = [];
      const isOrdered = /^\d+[\.\)]/.test(line);
      
      while (
        i < lines.length &&
        lines[i] &&
        /^(\-|\u2022|\*|•|→|\d+[\.\)]|[a-z]\))/i.test(lines[i])
      ) {
        const item = lines[i]
          .replace(/^(\-|\u2022|\*|•|→|\d+[\.\)]|[a-z]\))\s*/i, "")
          .trim();
        if (item) items.push(item);
        i++;
      }

      if (items.length > 0) {
        blocks.push({ type: "list", ordered: isOrdered, items });
      }
      continue;
    }

    // Table detection: multiple columns with tabs/spaces or comma-separated values
    const cols = line.split(/\t| {2,}/).map(c => c.trim()).filter(Boolean);
    const commaCols = line.split(",").map(c => c.trim()).filter(Boolean);
    const canBeCommaTable = commaCols.length >= 2 && commaCols.length <= 20 && line.includes(",");
    const useCommaTable = canBeCommaTable && commaCols.every(c => c.length > 0);

    if ((cols.length >= 2 && cols.length <= 10) || useCommaTable) {
      const rows = [];
      const startIdx = i;
      const firstColCount = useCommaTable ? commaCols.length : cols.length;
      const splitter = useCommaTable ? "," : /\t| {2,}/;

      while (i < lines.length && lines[i]) {
        const rowCols = lines[i]
          .split(splitter)
          .map(c => c.trim())
          .filter(Boolean);

        if (rowCols.length >= 2 && Math.abs(rowCols.length - firstColCount) <= 1) {
          rows.push(rowCols);
          i++;
        } else {
          break;
        }
      }

      if (rows.length >= 1) {
        blocks.push({ type: "table", rows });
        continue;
      } else {
        i = startIdx + 1;
      }
    }

    // Row-list (vertical values) detection, make one-column table
    const candidateRows = [];
    let rowCursor = i;
    while (rowCursor < lines.length) {
      const item = lines[rowCursor].trim();
      if (!item) break;
      if (/^(\-|\u2022|\*|•|→|\d+[\.\)]|[a-z]\))/i.test(item)) break;
      if (item.includes("\t") || item.split(/\s{2,}/).length > 1 || item.includes(",")) break;
      if (item.length > 120) break;

      candidateRows.push([item]);
      rowCursor++;
    }

    if (candidateRows.length >= 3) {
      blocks.push({ type: "table", rows: candidateRows });
      i = rowCursor;
      continue;
    }

    // Heading heuristic: short, uppercase/title-case, no punctuation clutter
    if (
      line.length < 100 &&
      /^[A-Z0-9À-ÿ\s\-:()\.]+$/i.test(line) &&
      /[A-Z0-9À-ÿ]/.test(line) &&
      !line.match(/^[a-z]/)
    ) {
      blocks.push({ type: "heading", level: 1, text: line });
      i++;
      continue;
    }

    // Paragraph: join consecutive normal lines
    const paraLines = [line];
    i++;

    while (i < lines.length && lines[i]) {
      const nextLine = lines[i];

      // Stop if next line is special
      if (/^(\-|\u2022|\*|•|→|\d+[\.\)]|[a-z]\))/i.test(nextLine)) break;
      if (/^[A-Z0-9À-ÿ\s\-:()\.]+$/i.test(nextLine) && nextLine.length < 100)
        break;

      const nextCols = nextLine.split(/\t| {2,}/).map(c => c.trim()).filter(Boolean);
      if (nextCols.length >= 2) break;

      paraLines.push(nextLine);
      i++;
    }

    const paraText = paraLines.join(" ").replace(/\s+/g, " ").trim();
    if (paraText.length > 0) {
      blocks.push({ type: "paragraph", text: paraText });
    }
  }

  return { blocks };
}

/* ---------------- Exporters ---------------- */

function ensureUploads() {
  const dir = path.join(__dirname, "..", "uploads");
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

  try {
    const doc = new Document({
      creator: "VidSnap OCR",
      description: "OCR extracted document",
      title: "OCR output",
      subject: "OCR conversion",
      keywords: "OCR, conversion",
      sections: [{
        properties: {},
        children
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(outPath, buffer);
  } catch (err) {
    console.error("exportToDocx failed, falling back to TXT:", err);
    exportToTxt(struct, outPath.replace(/\.docx$/i, ".txt"));
    return outPath.replace(/\.docx$/i, ".txt");
  }
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

/** XLSX exporter with table formatting and detection */
async function exportToXlsx(struct, outPath) {
  const wb = new ExcelJS.Workbook();
  let currentRow = 1;

  for (const b of struct.blocks) {
    if (b.type === "heading") {
      const ws = wb.getWorksheet("OCR") || wb.addWorksheet("OCR");
      const row = ws.addRow([b.text]);
      row.font = { bold: true, size: 14 };
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFCCCCCC" } };
      currentRow++;
    } else if (b.type === "paragraph") {
      const ws = wb.getWorksheet("OCR") || wb.addWorksheet("OCR");
      const row = ws.addRow([b.text]);
      row.alignment = { wrapText: true, vertical: "top" };
      currentRow++;
    } else if (b.type === "list") {
      const ws = wb.getWorksheet("OCR") || wb.addWorksheet("OCR");
      // If list is row-style (single line values), add as columns in one row
      if (b.items.length === 1 && b.items[0].includes(",")) {
        const values = b.items[0].split(",").map(v => v.trim()).filter(Boolean);
        const row = ws.addRow(values);
        row.alignment = { wrapText: true, vertical: "top" };
        currentRow += 1;
      } else {
        // Otherwise add each list item as own row (one-column list table)
        b.items.forEach(item => {
          const row = ws.addRow([item]);
          row.alignment = { wrapText: true, vertical: "top" };
        });
        currentRow += b.items.length;
      }
    } else if (b.type === "table") {
      // Create dedicated worksheet for each table
      const tableWs = wb.addWorksheet(`Table-${currentRow}`);

      if (b.rows.length > 0) {
        const headerRow = tableWs.addRow(b.rows[0]);
        headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
        headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };

        // Add data rows
        const dataRows = b.rows.slice(1);
        for (let i = 0; i < dataRows.length; i++) {
          const dataRow = tableWs.addRow(dataRows[i]);
          dataRow.alignment = { wrapText: true, vertical: "top" };
          if (i % 2 === 1) {
            dataRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
          }
        }

        // Add basic validations for each table column
        if (dataRows.length > 0) {
          for (let colIdx = 0; colIdx < b.rows[0].length; colIdx++) {
            const values = dataRows
              .map(row => (row[colIdx] || "").trim())
              .filter(v => v !== "");
            const unique = [...new Set(values)];
            const isNumeric = values.length > 0 && values.every(v => /^-?\d+(\.\d+)?$/.test(v));
            const isDateish = values.length > 0 && values.every(v => !isNaN(Date.parse(v)));
            const colLetter = String.fromCharCode(65 + colIdx);
            const startRow = 2;
            const endRow = dataRows.length + 1;

            if (isNumeric) {
              for (let r = startRow; r <= endRow; r++) {
                const cell = tableWs.getCell(`${colLetter}${r}`);
                cell.numFmt = "0.00";
              }
            }

            if (isDateish) {
              for (let r = startRow; r <= endRow; r++) {
                const cell = tableWs.getCell(`${colLetter}${r}`);
                cell.numFmt = "mm/dd/yyyy";
              }
            }

            if (unique.length > 1 && unique.length <= 20) {
              for (let r = startRow; r <= endRow; r++) {
                tableWs.getCell(`${colLetter}${r}`).dataValidation = {
                  type: "list",
                  allowBlank: true,
                  formulae: [`"${unique.join(",")}"`]
                };
              }
            }
          }
        }

        // Auto-fit columns
        if (Array.isArray(tableWs.columns)) {
          tableWs.columns.forEach(col => {
            let maxLength = 15;
            col.eachCell({ includeEmpty: true }, (cell) => {
              const cellLength = (cell.value || "").toString().length;
              if (cellLength > maxLength) maxLength = cellLength;
            });
            col.width = Math.min(maxLength + 2, 50);
          });
        }
      }

      currentRow += b.rows.length + 2;
    }
  }

  // Default sheet
  const ws = wb.getWorksheet("OCR") || wb.addWorksheet("OCR");
  if (Array.isArray(ws.columns)) {
    ws.columns.forEach(col => {
      col.width = 50;
    });
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

/** JSON exporter: structured data */
function exportToJson(struct, outPath) {
  const jsonData = {
    metadata: {
      exportedAt: new Date().toISOString(),
      tool: "VidSnap OCR",
      version: "1.0"
    },
    content: struct.blocks
  };
  fs.writeFileSync(outPath, JSON.stringify(jsonData, null, 2));
}

/**
 * Main convert function
 * text: raw OCR text
 * format: 'txt'|'pdf'|'docx'|'rtf'|'xlsx'
 */
function ensureUploads() {
  const dir = path.join(__dirname, "..", "uploads");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

module.exports = async function convert(text, format) {
  const dir = ensureUploads();
  const timestamp = Date.now();
  const ext = format.toLowerCase();
  const filePath = path.join(dir, `result-${timestamp}.${ext}`);

  // Build structured model
  const struct = parseToBlocks(text);

  // Route to exporter
  if (ext === "txt") {
    exportToTxt(struct, filePath);
  } else if (ext === "pdf") {
    exportToPdf(struct, filePath);
  } else if (ext === "docx") {
    const resultPath = await exportToDocx(struct, filePath);
    if (typeof resultPath === "string" && resultPath !== filePath) {
      return resultPath;
    }
  } else if (ext === "rtf") {
    exportToRtf(struct, filePath);
  } else if (ext === "xlsx" || ext === "xls") {
    await exportToXlsx(struct, filePath);
  } else if (ext === "json") {
    exportToJson(struct, filePath);
  } else {
    // fallback: plain text
    fs.writeFileSync(filePath, text);
  }

  return filePath;
};


