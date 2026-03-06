let extractedText = "";

async function upload() {
  const fileInput = document.getElementById("file");
  const status = document.getElementById("status");
  const output = document.getElementById("output");
  const resultBox = document.getElementById("result");

  const file = fileInput.files[0];
  if (!file) {
    alert("Please select an image or video");
    return;
  }

  const formData = new FormData();
  formData.append("file", file);

  const type = file.type.startsWith("video") ? "video" : "image";

  status.innerText = "⏳ Extracting text...";
  resultBox.classList.add("hidden");

  try {
    const res = await fetch(`/api/ocr/${type}`, {
      method: "POST",
      body: formData
    });

    const data = await res.json();

    if (!data.success) {
      status.innerText = "❌ OCR failed";
      return;
    }

    extractedText = data.text;
    output.innerText = extractedText;

    status.innerText = "✅ Text extracted";
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

    if (!data.success) {
      status.innerText = "❌ Download failed";
      return;
    }

    window.location.href = data.download;
    status.innerText = "✅ Download started";

  } catch (err) {
    console.error(err);
    status.innerText = "❌ Server error";
  }
}

window.upload = upload;   
window.location.href = data.download;





   