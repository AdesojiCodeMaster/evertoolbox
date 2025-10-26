// ==========================
// universal-filetool.js
// Robust pure-browser controller for Universal File Tool
// ==========================

import {
  formatBytes,
  ensureWithinCap,
  ensureFFmpegLoaded,
  convertVideoTo,
  extractAudioFromVideo,
  convertImageTo,
  compressImage,
  convertDocumentTo,
  blobToFile
} from "./core-modules.js";

// ---- UI references ----
const convertTab = document.getElementById("convertTab");
const compressTab = document.getElementById("compressTab");
const actionBtn = document.getElementById("actionBtn");
const fileInput = document.getElementById("fileInput");
const targetFormat = document.getElementById("targetFormat");
const filePreview = document.getElementById("filePreview");
const fileInfo = document.getElementById("fileInfo");
const progressBar = document.getElementById("progressBar");
const spinner = document.getElementById("spinner");
const msgText = document.getElementById("msgText");
const downloadLink = document.getElementById("downloadLink");
const resetBtn = document.getElementById("resetBtn");
const form = document.getElementById("fileForm");

let mode = "convert";

// ---- Format groups ----
const FORMAT_GROUPS = {
  Images: ["jpg", "jpeg", "png", "webp", "gif", "tiff", "bmp", "pdf"],
  Audio: ["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus"],
  Video: ["mp4", "webm", "mkv", "avi", "mov"],
  Documents: ["pdf", "docx", "txt", "md", "html"]
};
const EQUIV_GROUPS = [["jpg", "jpeg"], ["mp4", "m4v"]];

function extOfName(name) {
  const m = name.match(/\.([^.]+)$/);
  return m ? m[1].toLowerCase() : "";
}
function areEquivalentExts(a, b) {
  if (a === b) return true;
  for (const g of EQUIV_GROUPS) if (g.includes(a) && g.includes(b)) return true;
  return false;
}

function populateFormatSelect(groups) {
  let html = `<option value="">Select target format...</option>`;
  for (const g of groups) {
    const items = FORMAT_GROUPS[g];
    if (!items) continue;
    html += `<optgroup label="${g}">`;
    for (const f of items) html += `<option value="${f}">${f}</option>`;
    html += `</optgroup>`;
  }
  targetFormat.innerHTML = html;
  const first = targetFormat.querySelector("option[value]");
  if (first) targetFormat.value = first.value;
}

// ---- Tabs ----
convertTab.onclick = () => {
  mode = "convert";
  convertTab.classList.add("active");
  compressTab.classList.remove("active");
  targetFormat.disabled = false;
  actionBtn.textContent = "Convert";
};
compressTab.onclick = () => {
  mode = "compress";
  compressTab.classList.add("active");
  convertTab.classList.remove("active");
  targetFormat.disabled = true;
  actionBtn.textContent = "Compress";
};

// ---- File detection ----
function fileCategory(file) {
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  if (name.endsWith(".pdf")) return "pdf";
  if (/\.(docx|txt|md|html)$/i.test(name)) return "document";
  return "other";
}

// ---- Previews ----
fileInput.addEventListener("change", async () => {
  filePreview.innerHTML = "";
  fileInfo.textContent = "";
  msgText.textContent = "";
  downloadLink.style.display = "none";
  resetBtn.style.display = "none";
  progressBar.style.width = "0%";

  const file = fileInput.files[0];
  if (!file) return;

  try {
    ensureWithinCap(file);
  } catch (err) {
    msgText.textContent = `❌ ${err.message}`;
    return;
  }

  const cat = fileCategory(file);
  const url = URL.createObjectURL(file);
  if (cat === "image") {
    const img = document.createElement("img");
    img.src = url;
    img.style.maxHeight = "150px";
    filePreview.appendChild(img);
    populateFormatSelect(["Images"]);
  } else if (cat === "video") {
    const vid = document.createElement("video");
    vid.src = url;
    vid.controls = true;
    filePreview.appendChild(vid);
    populateFormatSelect(["Video"]);
  } else if (cat === "audio") {
    const aud = document.createElement("audio");
    aud.src = url;
    aud.controls = true;
    filePreview.appendChild(aud);
    populateFormatSelect(["Audio"]);
  } else {
    const div = document.createElement("div");
    div.textContent = `📄 ${file.name}`;
    filePreview.appendChild(div);
    populateFormatSelect(["Documents"]);
  }

  fileInfo.textContent = `File: ${file.name} • ${formatBytes(file.size)}`;
});

// ---- Spinner & progress ----
function showWorking(msg) {
  spinner.style.display = "inline-block";
  msgText.textContent = msg;
}
function hideWorking() {
  spinner.style.display = "none";
}
function progress(p) {
  progressBar.style.width = `${p}%`;
}
function prepareDownload(blob, newName) {
  const url = URL.createObjectURL(blob);
  downloadLink.href = url;
  downloadLink.download = newName;
  downloadLink.style.display = "block";
  resetBtn.style.display = "block";
  msgText.textContent = "✅ Done — click below to download.";
  progressBar.style.width = "100%";
}

// ---- Main handler ----
form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const file = fileInput.files[0];
  if (!file) return alert("Please choose a file first.");

  if (mode === "compress") {
    showWorking("Compressing...");
    try {
      const resultBlob = await compressImage(file, progress);
      const ext = extOfName(file.name);
      const newName = file.name.replace(`.${ext}`, `_compressed.${ext}`);
      prepareDownload(resultBlob, newName);
    } catch (err) {
      msgText.textContent = `❌ Compression failed: ${err.message}`;
    } finally {
      hideWorking();
    }
    return;
  }

  // ---- Convert mode ----
  const target = targetFormat.value;
  if (!target) return alert("Select target format.");

  showWorking("Converting...");
  progress(10);

  const srcExt = extOfName(file.name);
  let outBlob;

  try {
    const ffmpegReady = await ensureFFmpegLoaded();
    progress(30);

    if (ffmpegReady) {
      if (fileCategory(file) === "video" && FORMAT_GROUPS.Video.includes(target)) {
        outBlob = await convertVideoTo(file, target, progress);
      } else if (fileCategory(file) === "video" && FORMAT_GROUPS.Audio.includes(target)) {
        outBlob = await extractAudioFromVideo(file, target, progress);
      } else if (fileCategory(file) === "audio" && FORMAT_GROUPS.Audio.includes(target)) {
        outBlob = await convertVideoTo(file, target, progress); // same ffmpeg path
      } else if (fileCategory(file) === "image" && FORMAT_GROUPS.Images.includes(target)) {
        outBlob = await convertImageTo(file, target);
      } else if (fileCategory(file) === "document" || fileCategory(file) === "pdf") {
        outBlob = await convertDocumentTo(file, target);
      } else {
        throw new Error("Unsupported conversion path.");
      }
    } else {
      // FFmpeg not supported
      if (fileCategory(file) === "image") {
        outBlob = await convertImageTo(file, target);
      } else if (fileCategory(file) === "document" || fileCategory(file) === "pdf") {
        outBlob = await convertDocumentTo(file, target);
      } else {
        throw new Error("FFmpeg (wasm) not available in this browser for media conversion.");
      }
    }

    progress(90);

    const correctName = file.name.replace(/\.[^.]+$/, `.${target}`);
    prepareDownload(outBlob, correctName);
  } catch (err) {
    msgText.textContent = `❌ ${err.message}`;
    progressBar.style.width = "0%";
  } finally {
    hideWorking();
  }
});

// ---- Reset ----
resetBtn.onclick = () => {
  form.reset();
  filePreview.innerHTML = "";
  fileInfo.textContent = "";
  msgText.textContent = "";
  progressBar.style.width = "0%";
  downloadLink.style.display = "none";
  resetBtn.style.display = "none";
};
