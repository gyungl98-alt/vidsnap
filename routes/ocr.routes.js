
// routes/ocr.routes.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const imageOcr = require("../services/imageOcr");
const imageOcrEnhanced = require("../services/imageOcrEnhanced");
const videoOcr = require("../services/videoOcr");
const convertFile = require("../services/fileConverter");
const usageLimiter = require("../middleware/usageLimiter");

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
  if (!ocrResult) return { rawText: "", lines: [] };
  
  // Enhanced OCR returns more detailed structure
  if (ocrResult.structure) {
    const rawText = ocrResult.rawText || "";
    const lines = ocrResult.lines || [];
    return { 
      rawText, 
      lines,
      structure: ocrResult.structure,
      languages: ocrResult.languages,
      metadata: ocrResult.metadata
    };
  }
  
  if (typeof ocrResult === "string") {
    return { rawText: ocrResult, lines: ocrResult.split(/\r?\n/).map(l => l.trim()).filter(Boolean) };
  }
  
  const rawText = ocrResult.rawText || ocrResult.text || (ocrResult.lines ? ocrResult.lines.join("\n") : "");
  const lines = ocrResult.lines || (rawText ? rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean) : []);
  return { rawText, lines };
}

/* IMAGE OCR - Basic (legacy)
   - Standard OCR without preprocessing
*/
router.post("/image", usageLimiter.checkLimit("image"), upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: "No file uploaded" });

    const ocrRaw = await imageOcr(req.file.path);
    const { rawText, lines } = normalizeOcrResult(ocrRaw);

    const { format } = req.body || {};
    if (format) {
      const filePath = await convertFile(rawText, format);
      return res.json({
        success: true,
        text: rawText,
        lines,
        download: "/api/ocr/download/" + path.basename(filePath)
      });
    }

    res.json({ success: true, text: rawText, lines });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message || "OCR failed" });
  }
});

/* IMAGE OCR - Enhanced (with preprocessing, language detection, structure parsing)
   - Automatic image preprocessing (blur reduction, contrast enhancement)
   - Language auto-detection
   - Advanced structure detection (paragraphs, headings, lists, tables)
   - Optional: convert to target format immediately
*/
router.post("/image/enhanced", usageLimiter.checkLimit("image"), upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: "No file uploaded" });

    // Enable preprocessing by default, can be disabled with ?noPreprocess=true
    const enablePreprocessing = req.query.noPreprocess !== "true";

    const ocrRaw = await imageOcrEnhanced(req.file.path, {
      enablePreprocessing,
      logger: (log) => console.log("OCR: ", log)
    });

    const normalized = normalizeOcrResult(ocrRaw);
    const { rawText, lines, structure, languages, metadata } = normalized;

    // If client requested conversion immediately
    const { format } = req.body || {};
    if (format) {
      const filePath = await convertFile(rawText, format);
      return res.json({
        success: true,
        text: rawText,
        lines,
        structure,
        languages,
        metadata,
        download: "/api/ocr/download/" + path.basename(filePath)
      });
    }

    res.json({
      success: true,
      text: rawText,
      lines,
      structure,
      languages,
      metadata,
      confidence: ocrRaw.confidence
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message || "Enhanced OCR failed" });
  }
});

/* VIDEO OCR (standard)
   - Same behavior as image: returns text, or converts if format provided
*/
router.post("/video", usageLimiter.checkLimit("video"), upload.single("file"), async (req, res) => {
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
        lines,
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
   - Convert arbitrary text (sent in body) to requested format
   - Supports structural data (structure field) for better formatting
   - Body: { text: "...", format: "pdf", structure: {...} }
*/
router.post("/convert", async (req, res) => {
  try {
    const { text, format, structure } = req.body || {};
    if (!text || !format) return res.status(400).json({ success: false, error: "Missing text or format" });

    const filePath = await convertFile(text, format);
    const fileName = path.basename(filePath);

    res.json({
      success: true,
      download: `/api/ocr/download/${fileName}`
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message || "Conversion failed" });
  }
});

/* DOWNLOAD - Stream file and delete after
   - GET /api/ocr/download/result-1234.pdf
*/
router.get("/download/:filename", (req, res) => {
  const uploadsDir = path.join(__dirname, "..", "uploads");
  const filePath = path.join(uploadsDir, req.params.filename);

  // Security check
  if (!path.resolve(filePath).startsWith(path.resolve(uploadsDir))) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }

  res.download(filePath, (err) => {
    if (!err) {
      // Delete after download
      setTimeout(() => {
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          console.error("Could not delete file:", e);
        }
      }, 5000);
    }
  });
});

module.exports = router;



