
// services/imageOcr.js
const Tesseract = require("tesseract.js");
const path = require("path");

/**
 * Run OCR on an image and return a structured result.
 * Returns: { rawText: string, lines: string[], words: [{text, confidence, bbox}], confidence: number }
 *
 * Usage:
 *   const result = await imageOcr('/full/path/to/file.jpg');
 *   // result.rawText, result.lines, result.words
 */
module.exports = async function imageOcr(imagePath, options = {}) {
  const lang = options.lang || "eng";
  try {
    const { data } = await Tesseract.recognize(imagePath, lang, {
      logger: options.logger || (() => {}) // optional progress logger
    });

    // raw text
    const rawText = data && data.text ? data.text : "";

    // lines: prefer data.lines from tesseract.js if available
    const lines = (data && data.lines && Array.isArray(data.lines))
      ? data.lines.map(l => (l && l.text ? l.text.trim() : "")).filter(Boolean)
      : rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    // words with confidence and bbox (if available)
    const words = (data && data.words && Array.isArray(data.words))
      ? data.words.map(w => ({
          text: w.text || "",
          confidence: typeof w.confidence === "number" ? w.confidence : null,
          bbox: w.bbox || null
        }))
      : [];

    // overall mean confidence (if available)
    const confidence = (data && typeof data.confidence === "number")
      ? data.confidence
      : (words.length ? Math.round(words.reduce((s, w) => s + (w.confidence || 0), 0) / words.length) : null);

    return { rawText, lines, words, confidence };
  } catch (err) {
    // bubble up a helpful error
    const e = new Error(`Tesseract OCR failed: ${err.message || err}`);
    e.original = err;
    throw e;
  }
};

