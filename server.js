const express = require("express");
const path = require("path");
const multer = require("multer");

const ocrRoutes = require("./routes/ocr.routes");

const app = express();
const PORT = 3000;

/* middleware */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* routes */
app.use("/api/ocr", ocrRoutes);

/* start */
app.listen(PORT, () => {
  console.log("🚀 VidSnap running on http://localhost:" + PORT);
});


