
// routes/ocr.routes.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const imageOcr = require("../services/imageOcr");
const videoOcr = require("../services/videoOcr");
const convertFile = require("../services/fileConverter");

/* upload config */
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

/* helper to normalize OCR result */
function normalizeOcrResult(ocrResult) {
  // Accept either a string or an object { rawText, lines }
  if (!ocrResult) return { rawText: "", lines: [] };
  if (typeof ocrResult === "string") {
    return { rawText: ocrResult, lines: ocrResult.split(/\r?\n/).map(l => l.trim()).filter(Boolean) };
  }
  // object case
  const rawText = ocrResult.rawText || ocrResult.text || (ocrResult.lines ? ocrResult.lines.join("\n") : "");
  const lines = ocrResult.lines || (rawText ? rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean) : []);
  return { rawText, lines };
}

/* IMAGE OCR
   - If client sends `format` in body (e.g., { format: "pdf" }), route will convert OCR output and return download link.
*/
router.post("/image", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: "No file uploaded" });

    const ocrRaw = await imageOcr(req.file.path);
    const { rawText, lines } = normalizeOcrResult(ocrRaw);

    // If client requested conversion immediately
    const { format } = req.body || {};
    if (format) {
      const filePath = await convertFile(rawText, format);
      return res.json({
        success: true,
        text: rawText,
        download: "/api/ocr/download/" + path.basename(filePath)
      });
    }

    res.json({ success: true, text: rawText, lines });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message || "OCR failed" });
  }
});

/* VIDEO OCR
   - Same behavior as image endpoint: returns text, or converts if `format` provided.
*/
router.post("/video", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: "No file uploaded" });

    const ocrRaw = await videoOcr(req.file.path);
    const { rawText, lines } = normalizeOcrResult(ocrRaw);

    const { format } = req.body || {};
    if (format) {
      const filePath = await convertFile(rawText, format);
      return res.json({
        success: true,
        text: rawText,
        download: "/api/ocr/download/" + path.basename(filePath)
      });
    }

    res.json({ success: true, text: rawText, lines });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message || "Video OCR failed" });
  }
});

/* FILE CONVERT
   - Convert arbitrary text (sent in body) to requested format.
   - Body: { text: "...", format: "pdf" }
*/
router.post("/convert", async (req, res) => {
  try {
    const { text, format } = req.body || {};
    if (!text || !format) return res.status(400).json({ success: false, error: "Missing text or format" });

    const filePath = await convertFile(text, format);
    res.json({
      success: true,
      download: "/api/ocr/download/" + path.basename(filePath)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message || "Conversion failed" });
  }
});

/* DOWNLOAD converted files */
router.get("/download/:filename", (req, res) => {
  try {
    const filename = req.params.filename;
    if (!filename) return res.status(400).send("Missing filename");

    const filePath = path.join(__dirname, "..", "uploads", filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, error: "File not found" });

    res.download(filePath);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message || "Download failed" });
  }
});

module.exports = router;


