const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");

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

/* IMAGE OCR */
router.post("/image", upload.single("file"), async (req, res) => {
  try {
    const text = await imageOcr(req.file.path);
    res.json({ success: true, text });
  } catch (err) {
    console.error(err);
    res.json({ success: false });
  }
});

/* VIDEO OCR */
router.post("/video", upload.single("file"), async (req, res) => {
  try {
    const text = await videoOcr(req.file.path);
    res.json({ success: true, text });
  } catch (err) {
    console.error(err);
    res.json({ success: false });
  }
});

/* FILE CONVERT */
router.post("/convert", async (req, res) => {
  try {
    const { text, format } = req.body;
    const filePath = await convertFile(text, format);
    
res.json({
  success: true,
  download: "/api/ocr/download/" + path.basename(filePath)
});

  } catch (err) {
    console.error(err);
    res.json({ success: false });
  }
});

// add route to download converted files
router.get("/download/:filename", (req, res) => {
  const filePath = path.join(__dirname, "..", "uploads", req.params.filename);

  res.download(filePath); // 🔥 FORCE DOWNLOAD
});


module.exports = router;
