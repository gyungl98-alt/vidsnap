const Tesseract = require("tesseract.js");

module.exports = async function imageOcr(imagePath) {
  const result = await Tesseract.recognize(
    imagePath,
    "eng"
  );
  return result.data.text;
};
