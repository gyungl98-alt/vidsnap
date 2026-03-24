
let extractedText = "";
let lastDownloadUrl = "";
let lastOcrData = null;

async function upload() {
  const fileInput = document.getElementById("file");
  const status = document.getElementById("status");
  const output = document.getElementById("output");
  const resultBox = document.getElementById("result");
  const formatSelect = document.getElementById("format");
  const infoDiv = document.getElementById("ocrInfo");

  const file = fileInput.files[0];
  if (!file) {
    alert("Please select an image or video");
    return;
  }

  const formData = new FormData();
  formData.append("file", file);

  // If user selected a format, send it so server can auto-convert and return download link
  const selectedFormat = formatSelect.value;
  if (selectedFormat) formData.append("format", selectedFormat);

  const type = file.type.startsWith("video") ? "video" : "image";

  status.innerText = "⏳ Extracting text with AI preprocessing...";
  resultBox.classList.add("hidden");
  extractedText = "";
  lastDownloadUrl = "";
  lastOcrData = null;
  document.getElementById("downloadLink").classList.add("hidden");

  try {
    // Use enhanced endpoint for images
    const endpoint = type === "image" ? "/api/ocr/image/enhanced" : `/api/ocr/${type}`;
    
    const res = await fetch(endpoint, {
      method: "POST",
      body: formData
    });

    const data = await res.json();

    if (!data || !data.success) {
      status.innerText = "❌ OCR failed";
      console.error("OCR error response:", data);
      return;
    }

    // Store OCR data for later use
    lastOcrData = data;

    // Prefer rawText if returned as object, otherwise fallback to text
    const text = data.rawText || data.text || (data.lines ? data.lines.join("\n") : "");
    extractedText = text || "";

    output.innerText = extractedText || "(no text detected)";

    // Display additional OCR information
    if (infoDiv) {
      let infoHtml = "<div style='margin-top: 12px; padding: 10px; background: #f0f0f0; border-radius: 4px; font-size: 12px; color: #333;'>";
      
      if (data.languages) {
        infoHtml += `<strong>🌐 Detected Languages:</strong> ${data.languages.join(", ")}<br>`;
      }
      
      if (data.metadata?.wasPreprocessed) {
        infoHtml += `<strong>🔧 Image Preprocessing:</strong> Applied (blur reduction, contrast enhancement)<br>`;
      }
      
      if (data.confidence !== null && data.confidence !== undefined) {
        infoHtml += `<strong>✓ Confidence:</strong> ${Math.round(data.confidence)}%<br>`;
      }

      if (data.structure?.blocks) {
        const blockTypes = {};
        data.structure.blocks.forEach(block => {
          blockTypes[block.type] = (blockTypes[block.type] || 0) + 1;
        });
        infoHtml += `<strong>📊 Detected Structure:</strong>`;
        infoHtml += Object.entries(blockTypes)
          .map(([type, count]) => {
            const icons = { heading: "📌", paragraph: "📄", list: "📋", table: "📊" };
            return `${icons[type] || ""} ${count} ${type}`;
          })
          .join(", ");
        infoHtml += "<br>";
      }

      if (data.bestFormat) {
        infoHtml += `<strong>✅ Suggested Export:</strong> ${data.bestFormat.toUpperCase()}<br>`;
        const formatSelect = document.getElementById("format");
        if (formatSelect) {
          formatSelect.value = data.bestFormat;
        }
      }

      infoHtml += "</div>";
      infoDiv.innerHTML = infoHtml;
      infoDiv.classList.remove("hidden");
    }

    // If server returned a download link (auto-convert), show it
    if (data.download) {
      lastDownloadUrl = data.download;
      showDownloadLink(data.download);
      status.innerText = "✅ Text extracted with AI enhancement and file ready!";
    } else {
      status.innerText = "✅ Text extracted with AI enhancement";
    }

    resultBox.classList.remove("hidden");
  } catch (err) {
    console.error(err);
    status.innerText = "❌ Server error";
  }
}

async function downloadFile() {
  const format = document.getElementById("format").value;
  const status = document.getElementById("status");

  if (!extractedText) {
    alert("No text to download");
    return;
  }

  if (!format) {
    alert("Please select an output format from the dropdown");
    return;
  }

  status.innerText = "⏳ Preparing file with best formatting...";

  try {
    const res = await fetch("/api/ocr/convert", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: extractedText,
        format: format,
        structure: lastOcrData?.structure || null
      })
    });

    const data = await res.json();

    if (!data || !data.success) {
      status.innerText = "❌ Conversion failed";
      console.error("Conversion error response:", data);
      return;
    }

    // Show download link and trigger browser navigation to start download
    lastDownloadUrl = data.download;
    showDownloadLink(data.download);
    
    // Auto-download
    setTimeout(() => {
      window.location.href = data.download;
      status.innerText = "✅ Download started";
    }, 150);
  } catch (err) {
    console.error(err);
    status.innerText = "❌ Server error";
  }
}

function showDownloadLink(url) {
  const link = document.getElementById("downloadLink");
  link.href = url;
  // set filename if possible
  try {
    const name = url.split("/").pop();
    link.setAttribute("download", name);
    link.innerText = "📥 Download file";
  } catch (e) {
    link.innerText = "📥 Download file";
  }
  link.classList.remove("hidden");
}

// wire buttons
document.getElementById("extractBtn").addEventListener("click", upload);
document.getElementById("convertBtn").addEventListener("click", downloadFile);

// expose for debugging
window.upload = upload;
window.downloadFile = downloadFile;
