// services/videoOcr.js
const fs = require('fs');
const path = require('path');
const os = require('os');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const imageOcr = require('./imageOcr');

// Ensure fluent-ffmpeg uses the static ffmpeg binary
if (ffmpegStatic) {
  try { ffmpeg.setFfmpegPath(ffmpegStatic); } catch (e) { /* ignore if not supported */ }
}

/**
 * videoOcr(videoPath, options)
 * - videoPath: full path to video file
 * - options: { fps: number (frames per second to extract), lang: string }
 *
 * Returns: { rawText: string, lines: string[], framesCount: number }
 */
module.exports = async function videoOcr(videoPath, options = {}) {
  const fps = options.fps || 1; // extract 1 frame per second by default
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vidsnap-frames-'));
  const framePattern = path.join(tmpDir, 'frame-%04d.jpg');

  // Extract frames
  await new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .outputOptions(['-vf', `fps=${fps}`])
      .output(framePattern)
      .on('end', resolve)
      .on('error', err => reject(new Error('ffmpeg frame extraction failed: ' + err.message)))
      .run();
  });

  // Read extracted frames
  const files = fs.readdirSync(tmpDir).filter(f => /\.(jpe?g|png)$/i.test(f)).sort();
  const allLines = [];
  let framesCount = 0;

  try {
    for (const f of files) {
      framesCount++;
      const full = path.join(tmpDir, f);
      // imageOcr is expected to return { rawText, lines, ... }
      const ocrResult = await imageOcr(full, { lang: options.lang || 'eng' });
      if (ocrResult && Array.isArray(ocrResult.lines)) {
        allLines.push(...ocrResult.lines);
      } else if (ocrResult && typeof ocrResult.rawText === 'string') {
        const lines = ocrResult.rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        allLines.push(...lines);
      }
    }
  } finally {
    // Cleanup frames directory
    try {
      for (const f of fs.readdirSync(tmpDir)) {
        try { fs.unlinkSync(path.join(tmpDir, f)); } catch (e) {}
      }
      fs.rmdirSync(tmpDir);
    } catch (e) { /* ignore cleanup errors */ }
  }

  const uniqueLines = allLines.map(l => l.trim()).filter(Boolean);
  const rawText = uniqueLines.join('\n');

  return { rawText, lines: uniqueLines, framesCount };
};

