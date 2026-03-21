
let extractedText = "";
let lastDownloadUrl = "";

async function upload() {
  const fileInput = document.getElementById("file");
  const status = document.getElementById("status");
  const output = document.getElementById("output");
  const resultBox = document.getElementById("result");
  const formatSelect = document.getElementById("format");

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

  status.innerText = "⏳ Extracting text...";
  resultBox.classList.add("hidden");
  extractedText = "";
  lastDownloadUrl = "";
  document.getElementById("downloadLink").classList.add("hidden");

  try {
    const res = await fetch(`/api/ocr/${type}`, {
      method: "POST",
      body: formData
    });

    const data = await res.json();

    if (!data || !data.success) {
      status.innerText = "❌ OCR failed";
      console.error("OCR error response:", data);
      return;
    }

    // Prefer rawText if returned as object, otherwise fallback to text
    const text = data.rawText || data.text || (data.lines ? data.lines.join("\n") : "");
    extractedText = text || "";

    output.innerText = extractedText || "(no text detected)";

    // If server returned a download link (auto-convert), show it
    if (data.download) {
      lastDownloadUrl = data.download;
      showDownloadLink(data.download);
      status.innerText = "✅ Text extracted and file ready";
    } else {
      status.innerText = "✅ Text extracted";
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

  status.innerText = "⏳ Preparing file...";

  try {
    const res = await fetch("/api/ocr/convert", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: extractedText,
        format: format
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
    // Use a short delay to ensure link is visible before triggering
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
    link.innerText = "Download file";
  } catch (e) {
    link.innerText = "Download file";
  }
  link.classList.remove("hidden");
}

// wire buttons
document.getElementById("extractBtn").addEventListener("click", upload);
document.getElementById("convertBtn").addEventListener("click", downloadFile);

// expose for debugging
window.upload = upload;
window.downloadFile = downloadFile;
