const fs = require("fs");
const path = require("path");
const { Document, Packer, Paragraph } = require("docx");
const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");

module.exports = async function convert(text, format) {
  const filePath = `uploads/result-${Date.now()}.${format}`;

  /* TXT */
  if (format === "txt") {
    fs.writeFileSync(filePath, text);
  }

  /* PDF */
  if (format === "pdf") {
    const pdf = new PDFDocument();
    pdf.pipe(fs.createWriteStream(filePath));
    pdf.fontSize(12).text(text);
    pdf.end();
  }

  /* DOCX */
  if (format === "docx") {
    const doc = new Document({
      sections: [
        {
          children: text
            .split("\n")
            .map(line => new Paragraph(line))
        }
      ]
    });

    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(filePath, buffer);
  }

  /* RTF */
  if (format === "rtf") {
    const rtfText =
      `{\\rtf1\\ansi\\deff0\n` +
      text
        .replace(/\\/g, "\\\\")
        .replace(/{/g, "\\{")
        .replace(/}/g, "\\}")
        .replace(/\n/g, "\\line\n") +
      `}`;

    fs.writeFileSync(filePath, rtfText);
  }

  /* EXCEL */
  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("OCR Text");

    text.split("\n").forEach((line, index) => {
      sheet.addRow([line]);
    });

    await workbook.xlsx.writeFile(filePath);
  }

  return filePath;
};
