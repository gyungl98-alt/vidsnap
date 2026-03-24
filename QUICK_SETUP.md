# Quick Setup Guide - VidSnap OCR Enhanced

## ⚡ 5-Minute Setup

### Step 1: Install Dependencies
```bash
# Navigate to vidsnap folder
cd vidsnap

# Install Node.js packages
npm install

# Install Python packages (for image preprocessing)
pip install opencv-python numpy
```

### Step 2: Verify Python Installation
```bash
# Check Python version (should be 3.7+)
python --version

# Test OpenCV
python -c "import cv2; print('OpenCV working!')"
```

### Step 3: Start Server
```bash
# Production
npm start

# Development (auto-reload on file changes)
npm run dev
```

### Step 4: Open in Browser
```
http://localhost:3000
```

---

## ✨ What's New

### Before (Old Version)
- ❌ Text scattered without proper formatting
- ❌ Manual language selection
- ❌ No image preprocessing (fails on blurry images)
- ❌ No table detection
- ❌ Basic text export only

### After (New Version) ✅
- ✅ Automatic language detection (10+ languages)
- ✅ Smart text structure (headings, paragraphs, lists, tables)
- ✅ Image preprocessing (handles blur, low contrast)
- ✅ Table detection → Excel export
- ✅ Professional formatting in all formats
- ✅ Confidence scores
- ✅ Multi-language support (Hindi, Arabic, Chinese, etc.)

---

## 🎯 Key Files Created/Updated

### NEW Files:
1. **`services/imagePreprocessor.py`**
   - Python script for image preprocessing
   - Removes blur, enhances contrast, improves OCR accuracy

2. **`services/imageOcrEnhanced.js`**
   - Enhanced OCR with preprocessing & language detection
   - Structure detection (headings, paragraphs, lists, tables)
   - Returns detailed OCR results

3. **`ENHANCED_README.md`**
   - Complete documentation
   - API reference, troubleshooting, use cases

### UPDATED Files:
1. **`routes/ocr.routes.js`**
   - New `/api/ocr/image/enhanced` endpoint
   - Improved error handling
   - Better response structure

2. **`services/fileConverter.js`**
   - Better table detection
   - Enhanced XLSX export with formatting
   - Support for structured data

3. **`public/app.js`**
   - Updated to use enhanced OCR endpoint
   - Display language detection
   - Show OCR confidence & structure info

4. **`public/index.html`**
   - Better UI with emojis
   - New info section for language/confidence
   - Improved layout

---

## 📱 How to Use

### Basic Usage
1. Upload an image or video
2. Click **"Extract Text"**
3. Wait for AI preprocessing + OCR
4. See detected language and structure
5. Choose format (PDF, Excel, Word, etc.)
6. Click **"Convert & Download"**

### Using Enhanced OCR
```javascript
// JavaScript
const formData = new FormData();
formData.append("file", imageFile);

// Use enhanced endpoint for preprocessed OCR
const response = await fetch("/api/ocr/image/enhanced", {
  method: "POST",
  body: formData
});

const result = await response.json();
console.log(result.languages); // Detected languages
console.log(result.structure); // Headings, paragraphs, lists, tables
console.log(result.confidence); // Confidence score
```

---

## 🔧 Customization

### Disable Image Preprocessing (if needed)
```javascript
// Add query parameter to skip preprocessing
fetch("/api/ocr/image/enhanced?noPreprocess=true", {
  method: "POST",
  body: formData
});
```

### Add More Languages
Edit `servicesl/imageOcrEnhanced.js` and add to `patterns` object:
```javascript
patterns = {
  // ... existing languages
  jpn: /[\u3040-\u309F\u30A0-\u30FF]/g,  // Japanese
  kor: /[\uAC00-\uD7AF]/g,               // Korean
}
```

---

## ⚙️ Environment Variables (Optional)

Create `.env` file in `vidsnap/` folder:
```env
NODE_ENV=production
PORT=3000
OCR_ENABLE_PREPROCESSING=true
MAX_UPLOAD_SIZE=50mb
```

---

## 🐛 Common Issues & Fixes

| Issue | Solution |
|-------|----------|
| "Python not found" | Install Python 3.7+ and add to PATH |
| "Module cv2 not found" | Run `pip install opencv-python` |
| Poor OCR accuracy | Use `/image/enhanced` endpoint (enables preprocessing) |
| Slow processing | Set `?noPreprocess=true` to skip preprocessing |
| Tables not detected | Ensure columns are separated by tabs or 2+ spaces |

---

## 📊 Performance Tips

1. **For best accuracy**: Upload clear, well-lit images (300x300+ pixels)
2. **For speed**: Use `?noPreprocess=true` if image is already clean
3. **For tables**: Ensure proper column separation (tabs or spaces)
4. **For export**: Use XLSX for table data, PDF/DOCX for documents

---

## ✅ Testing the Setup

```bash
# Test 1: Check Python preprocessing
python services/imagePreprocessor.py uploads/test.jpg uploads/test_preprocessed.png

# Test 2: Call API directly
curl -X POST http://localhost:3000/api/ocr/image/enhanced \
  -F "file=@test.jpg"

# Test 3: Check all dependencies
node -e "console.log(require('tesseract.js'))" && echo "✓ Tesseract OK"
npm list | grep express && echo "✓ All packages OK"
```

---

## 🎓 Learn More

- **API Documentation**: See `ENHANCED_README.md`
- **Tesseract.js**: https://github.com/naptha/tesseract.js
- **OpenCV Python**: https://opencv.org/
- **ExcelJS**: https://github.com/exceljs/exceljs

---

## 🚀 Ready to Go!

Your VidSnap OCR is now enhanced with AI-powered features. Start extracting text like never before!

If you encounter any issues, check `ENHANCED_README.md` troubleshooting section or review the code comments.
