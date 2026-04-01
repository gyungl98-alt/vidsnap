// services/imageOcrEnhanced.js
const Tesseract = require("tesseract.js");
const path = require("path");
const { spawn } = require("child_process");
const fs = require("fs");

/**
 * Auto-detect language from text (basic detection)
 * Returns: language code (eng, hin, ara, etc.)
 */
function detectLanguage(text) {
  // Common language patterns
  const patterns = {
    hin: /[\u0900-\u097F]/g,      // Devanagari (Hindi)
    ara: /[\u0600-\u06FF]/g,      // Arabic
    chi_sim: /[\u4E00-\u9FFF]/g,  // Simplified Chinese
    chi_tra: /[\u4E00-\u9FFF]/g,  // Traditional Chinese
    ben: /[\u0980-\u09FF]/g,      // Bengali
    tam: /[\u0B80-\u0BFF]/g,      // Tamil
    tel: /[\u0C00-\u0C7F]/g,      // Telugu
    kan: /[\u0C80-\u0CFF]/g,      // Kannada
    mal: /[\u0D00-\u0D3F]/g,      // Malayalam
    or_: /[\u0B00-\u0B7F]/g,      // Odia
  };

  let detectedLang = "eng"; // default
  let maxMatches = 0;

  for (const [lang, regex] of Object.entries(patterns)) {
    const matches = (text.match(regex) || []).length;
    if (matches > maxMatches) {
      maxMatches = matches;
      detectedLang = lang;
    }
  }

  // If English was detected but other languages present, try to detect mixed
  if (detectedLang !== "eng" && maxMatches > 10) {
    return detectedLang;
  }

  return detectedLang;
}

/**
 * Preprocess image using Python script
 * Returns: path to preprocessed image or null on failure
 */
async function preprocessImage(imagePath) {
  return new Promise((resolve) => {
    const outputPath = imagePath.replace(/\.(jpg|png|jpeg)$/i, "_preprocessed.png");
    
    try {
      const python = spawn("python", [
        path.join(__dirname, "imagePreprocessor.py"),
        imagePath,
        outputPath
      ]);

      let stdout = "";
      python.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      python.on("close", (code) => {
        try {
          const result = JSON.parse(stdout);
          if (result.success) {
            resolve(outputPath);
          } else {
            resolve(null); // Fall back to original
          }
        } catch {
          resolve(null);
        }
      });

      python.on("error", () => {
        resolve(null); // Python not available, use original
      });
    } catch {
      resolve(null);
    }
  });
}

/**
 * Enhanced OCR with: language detection, preprocessing, structure parsing
 * Returns: {
 *   rawText: string,
 *   languages: [string],
 *   confidence: number,
 *   structure: { blocks: [...] },
 *   lines: string[],
 *   metadata: object
 * }
 */
module.exports = async function imageOcrEnhanced(
  imagePath,
  options = {}
) {
  const enablePreprocessing = options.enablePreprocessing !== false;
  const logger = options.logger || (() => {});

  try {
    // Validate image file exists and is readable
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image file not found: ${imagePath}`);
    }

    const stats = fs.statSync(imagePath);
    if (stats.size === 0) {
      throw new Error(`Image file is empty: ${imagePath}`);
    }

    // Step 1: Try preprocessing if enabled
    let processedPath = imagePath;
    let wasPreprocessed = false;

    if (enablePreprocessing) {
      logger({ status: "preprocessing", message: "Preprocessing image..." });
      const preprocessed = await preprocessImage(imagePath);
      if (preprocessed && fs.existsSync(preprocessed)) {
        processedPath = preprocessed;
        wasPreprocessed = true;
        logger({ status: "preprocessing", message: "Image preprocessed" });
      }
    }

    // Step 2: Detect language from minimal OCR first (quick pass)
    logger({ status: "detecting", message: "Detecting language..." });
    const quickOcr = await Tesseract.recognize(processedPath, "eng", {
      logger: () => {}
    });
    const detectedLang = detectLanguage(quickOcr.data.text || "");
    logger({ status: "detected_lang", lang: detectedLang });

    // Step 3: Full OCR with detected language(s)
    const languages = [detectedLang];
    if (detectedLang !== "eng") languages.push("eng"); // also try English

    logger({ status: "ocr", message: `Running OCR with languages: ${languages.join(", ")}` });

    let data;
    try {
      const result = await Tesseract.recognize(processedPath, languages.join("+"), {
        logger: options.logger || (() => {})
      });
      data = result.data;
    } catch (ocrError) {
      logger({ status: "ocr_fallback", message: "Enhanced OCR failed, trying basic OCR..." });
      // Fallback to basic OCR
      const fallbackResult = await Tesseract.recognize(processedPath, "eng", {
        logger: () => {}
      });
      data = fallbackResult.data;
    }

    // Step 4: Parse raw text
    const rawText = (data && data.text) ? data.text : "";

    // Step 5: Structure parsing
    const structure = parseStructuredText(rawText);

    // Step 6: Extract lines with filtering
    const lines = structure.blocks
      .flatMap(block => {
        if (block.type === "paragraph") return [block.text];
        if (block.type === "heading") return [block.text];
        if (block.type === "list") return block.items;
        if (block.type === "table") {
          return block.rows.map(r => r.join(" | "));
        }
        return [];
      })
      .filter(l => l && l.trim());

    // Step 7: Improved confidence calculation
    let confidence = null;
    if (data && typeof data.confidence === "number") {
      confidence = data.confidence;
    } else if (data && data.words && Array.isArray(data.words)) {
      const validWords = data.words.filter(w => w && w.confidence !== null && w.confidence !== undefined);
      if (validWords.length > 0) {
        confidence = validWords.reduce((sum, w) => sum + w.confidence, 0) / validWords.length;
      }
    }

    // Adjust confidence based on text quality
    if (confidence !== null) {
      // Penalize very short text (likely poor OCR)
      if (rawText.trim().length < 10) {
        confidence = Math.max(0, confidence - 30);
      }
      // Boost confidence for structured content
      if (structure.blocks.length > 1) {
        confidence = Math.min(100, confidence + 10);
      }
    }

    // Cleanup preprocessed file if created
    if (wasPreprocessed && processedPath !== imagePath) {
      try {
        fs.unlinkSync(processedPath);
      } catch {}
    }

    const bestFormat = determineBestFormat(structure);

    return {
      rawText,
      languages,
      confidence,
      structure,
      lines,
      bestFormat,
      metadata: {
        wasPreprocessed,
        detectedLang
      }
    };
  } catch (err) {
    const e = new Error(`Enhanced OCR failed: ${err.message || err}`);
    e.original = err;
    throw e;
  }
};

/**
 * Parse text into structured blocks: paragraphs, headings, lists, tables
 */
function parseStructuredText(rawText) {
  const lines = rawText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Check for list items
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

    // Check for table (multiple columns separated by tabs/spaces or comma-separated)
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
        const rowCols = lines[i].split(splitter).map(c => c.trim()).filter(Boolean);
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
        i = startIdx + 1; // Reset if not enough rows
      }
    }

    // Row-list (vertical values) detection: convert 3+ lines of sequential simple values into one-column table
    const candidateRows = [];
    let cursor = i;
    while (cursor < lines.length) {
      const next = lines[cursor].trim();
      if (!next) break;
      if (/^(\-|\u2022|\*|•|→|\d+[\.\)]|[a-z]\))/i.test(next)) break;
      if (next.includes("\t") || next.split(/\s{2,}/).length > 1 || next.includes(",")) break;
      if (next.length > 120) break;
      candidateRows.push([next]);
      cursor++;
    }

    if (candidateRows.length >= 3) {
      blocks.push({ type: "table", rows: candidateRows });
      i = cursor;
      continue;
    }

    // Check for heading (short line, mostly uppercase, no punctuation clutter)
    if (
      line.length < 100 &&
      /^[A-Z0-9À-ÿ\s\-:()\.]+$/i.test(line) &&
      /[A-Z0-9À-ÿ]/.test(line) &&
      !line.match(/^[a-z]/i)
    ) {
      blocks.push({ type: "heading", level: 1, text: line });
      i++;
      continue;
    }

    // Default: paragraph - join consecutive non-special lines
    const paraLines = [line];
    i++;

    while (i < lines.length && lines[i]) {
      const nextLine = lines[i];

      // Stop if next line is special
      if (/^(\-|\u2022|\*|•|→|\d+[\.\)]|[a-z]\))/i.test(nextLine)) break;
      if (/^[A-Z0-9À-ÿ\s\-:()\.]+$/i.test(nextLine) && nextLine.length < 100)
        break;

      const cols = nextLine.split(/\t| {2,}/).map(c => c.trim()).filter(Boolean);
      if (cols.length >= 2) break;

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

function determineBestFormat(structure) {
  if (!structure || !Array.isArray(structure.blocks)) return "txt";
  const hasTable = structure.blocks.some(b => b.type === "table");
  const hasList = structure.blocks.some(b => b.type === "list");
  const hasParagraph = structure.blocks.some(b => b.type === "paragraph");

  if (hasTable) return "xlsx";
  if (hasList && !hasParagraph) return "xlsx";
  if (hasParagraph && hasList) return "docx";
  if (hasParagraph) return "pdf";
  return "txt";
}
