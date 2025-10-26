// universal-filetool.js
// Orchestrates UI and calls functions from core-modules.js
import {
  formatBytes, ensureWithinCap, readAsArrayBuffer,
  ensureFFmpegLoaded, convertVideoTo, extractAudioFromVideo,
  convertImageTo, compressImage, convertDocumentTo, blobToFile
} from './core-modules.js';

// UI refs
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

// mode & helpers (same groups as index.html expects)
let mode = "convert";
const FORMAT_GROUPS = {
  Images: ["pdf","jpg","jpeg","png","webp","gif","tiff","bmp"],
  Audio: ["mp3","wav","m4a","ogg","flac","opus","aac","webm"],
  Video: ["mp4","avi","mov","webm","mkv","m4v"],
  Documents: ["pdf","docx","txt","md","html"]
};
const EQUIV_GROUPS = [["jpg","jpeg"],["mp4","m4v"]];

function extOfName(name) {
  if (!name) return "";
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : "";
}
function areEquivalentExts(a,b) {
  if (!a || !b) return false;
  a = a.toLowerCase(); b = b.toLowerCase();
  if (a === b) return true;
  for (const g of EQUIV_GROUPS) if (g.includes(a) && g.includes(b)) return true;
  return false;
}

function populateFormatSelect(groupNames) {
  const placeholder = `<option value="">Select target format...</option>`;
  let html = placeholder;
  for (const g of groupNames) {
    const items = FORMAT_GROUPS[g];
    if (!items || items.length === 0) continue;
    html += `<optgroup label="${g}">`;
    for (const it of items) html += `<option value="${it}">${it}</option>`;
    html += `</optgroup>`;
  }
  targetFormat.innerHTML = html;
  const firstOpt = Array.from(targetFormat.options).find(o=>o.value);
  if (firstOpt) targetFormat.value = firstOpt.value;
}

// Tab handlers
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

// PDF thumbnail renderer (uses pdf.js loaded from CDN in index.html)
async function renderPDFThumbnail(file, container) {
  try {
    const array = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: array }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 0.7 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width; canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    container.appendChild(canvas);
  } catch (err) {
    container.textContent = "📄 PDF preview unavailable.";
  }
}

function categoryForFile(file) {
  if (!file) return "all";
  const type = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();
  if (type.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif|tiff|bmp)$/i.test(name)) return "image";
  if (type.startsWith("video/") || /\.(mp4|avi|mov|mkv|webm|m4v)$/i.test(name)) return "video";
  if (type.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|flac|opus|aac)$/i.test(name)) return "audio";
  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (/\.(docx|txt|md|html)$/i.test(name)) return "document";
  return "all";
}

// UI: file selected
fileInput.addEventListener("change", async () => {
  filePreview.innerHTML = ""; fileInfo.textContent = ""; msgText.textContent = "";
  progressBar.style.width = "0%"; downloadLink.style.display = "none"; resetBtn.style.display = "none";
  const file = fileInput.files[0];
  if (!file) { populateFormatSelect(["Images","Audio","Video","Documents"]); return; }
  const cat = categoryForFile(file);
  const url = URL.createObjectURL(file);

  if (cat === "image") {
    const img = document.createElement("img"); img.src = url; filePreview.appendChild(img); populateFormatSelect(["Images"]);
  } else if (cat === "video") {
    const vid = document.createElement("video"); vid.src = url; vid.controls = true; filePreview.appendChild(vid); populateFormatSelect(["Video"]);
  } else if (cat === "audio") {
    const aud = document.createElement("audio"); aud.src = url; aud.controls = true; filePreview.appendChild(aud); populateFormatSelect(["Audio"]);
  } else if (cat === "pdf") {
    renderPDFThumbnail(file, filePreview); populateFormatSelect(["Images","Documents"]);
  } else if (cat === "document") {
    filePreview.textContent = `📄 ${file.name}`; populateFormatSelect(["Documents"]);
  } else {
    filePreview.textContent = `📄 ${file.name}`; populateFormatSelect(["Images","Audio","Video","Documents"]);
  }

  const sizeMB = (file.size / (1024*1024)).toFixed(2);
  fileInfo.textContent = `File: ${file.name} (${file.type || "unknown"}) • ${formatBytes(file.size)} (${sizeMB} MB)`;
  try { ensureWithinCap(file); } catch (e) { msgText.textContent = `❌ ${e.message}`; }
});

// small randomized backoff
function randomDelayMs(min=5000,max=10000){ return Math.floor(min + Math.random()*(max-min)); }

// show/hide spinner & message
function showWorking(msg="Processing...") {
  spinner.style.display = "inline-block";
  msgText.textContent = msg;
}
function hideWorking() {
  spinner.style.display = "none";
}

// prepare download (naked single file)
function prepareDownload(blob, suggestedName) {
  const url = URL.createObjectURL(blob);
  downloadLink.href = url;
  downloadLink.download = suggestedName;
  downloadLink.style.display = "block";
  resetBtn.style.display = "block";
  msgText.textContent = "✅ Success! Click below to download.";
  progressBar.style.width = "100%";
}

// conversion orchestration
form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const file = fileInput.files[0];
  if (!file) return alert("Please choose a file first.");
  const srcExt = extOfName(file.name);
  const tgtExt = (targetFormat.value || "").toLowerCase();

  // identical-format guard
  if (mode === "convert" && srcExt && tgtExt && areEquivalentExts(srcExt, tgtExt)) {
    msgText.textContent = `❌ Conversion disallowed: source and target formats are identical (.${srcExt})`;
    return;
  }

  // ensure within cap
  try { ensureWithinCap(file); } catch (e) { msgText.textContent = `❌ ${e.message}`; return; }

  // UI prepare
  progressBar.style.width = "4%";
  showWorking("⏳ Processing... please wait...");
  downloadLink.style.display = "none";
  resetBtn.style.display = "none";

  try {
    let resultBlob = null;
    const cat = categoryForFile(file);

    // If compress mode -> route to compression helpers
    if (mode === "compress") {
      // images -> compressImage
      if (cat === "image" || file.type.startsWith('image/')) {
        progressBar.style.width = "8%";
        resultBlob = await compressImage(file, { maxWidth: 1600, maxHeight: 1600, quality: 0.65 });
      } else if (cat === "video" || file.type.startsWith('video/')) {
        // video compression using ffmpeg (lazy-load)
        showWorking("⏳ Loading ffmpeg for video compression...");
        progressBar.style.width = "12%";
        await ensureFFmpegLoaded(); // may throw
        // compress to mp4 with higher CRF
        resultBlob = await convertVideoTo(file, 'mp4', (p)=>{ progressBar.style.width = `${10 + Math.floor(p*70)}%`; });
      } else if (cat === "audio" || file.type.startsWith('audio/')) {
        showWorking("⏳ Loading ffmpeg for audio compression...");
        await ensureFFmpegLoaded();
        resultBlob = await extractAudioFromVideo(file, 'mp3', (p)=>{ progressBar.style.width = `${10 + Math.floor(p*80)}%`; });
      } else {
        // documents -> try converting to pdf & recompress or return original
        showWorking("⏳ Compressing document (best-effort)...");
        resultBlob = await convertDocumentTo(file, 'pdf');
      }
    } else { // convert mode
      // image conversions (fast, canvas-based)
      if (cat === "image" || file.type.startsWith('image/')) {
        progressBar.style.width = "10%";
        if (tgtExt === 'pdf') {
          resultBlob = await convertDocumentTo(file, 'pdf');
        } else {
          resultBlob = await convertImageTo(file, tgtExt || 'jpg', 0.9);
        }
      }
      // video conversions (use ffmpeg.wasm)
      else if (cat === "video" || file.type.startsWith('video/')) {
        showWorking("⏳ Loading ffmpeg (this may take a few seconds)...");
        progressBar.style.width = "6%";
        await ensureFFmpegLoaded();
        // if target is audio -> extract audio
        if (['mp3','wav','aac','m4a','ogg','flac','opus'].includes(tgtExt)) {
          resultBlob = await extractAudioFromVideo(file, tgtExt, (p)=>{ progressBar.style.width = `${6 + Math.floor(p*80)}%`; });
        } else {
          resultBlob = await convertVideoTo(file, tgtExt || 'mp4', (p)=>{ progressBar.style.width = `${6 + Math.floor(p*80)}%`; });
        }
      }
      // audio conversions
      else if (cat === "audio" || file.type.startsWith('audio/')) {
        showWorking("⏳ Loading ffmpeg (audio)...");
        progressBar.style.width = "6%";
        await ensureFFmpegLoaded();
        // use extractAudioFromVideo for general audio conversions (works for many types)
        resultBlob = await extractAudioFromVideo(file, tgtExt || 'mp3', (p)=>{ progressBar.style.width = `${6 + Math.floor(p*85)}%`; });
      }
      // pdf/document conversions
      else if (cat === "pdf" || file.type === 'application/pdf' || srcExt === 'pdf' || /\.(docx|txt|md|html)$/i.test(file.name)) {
        progressBar.style.width = "10%";
        resultBlob = await convertDocumentTo(file, tgtExt || 'pdf');
      } else {
        // fallback: return original file
        resultBlob = file;
      }
    }

    if (!resultBlob) throw new Error("Conversion failed (no output).");
    // final size check, stable progress
    progressBar.style.width = "95%";
    // prepare final download filename
    const baseName = (file.name || 'file').replace(/\.[^/.]+$/, '');
    const finalExt = (() => {
      if (resultBlob.type) {
        const m = resultBlob.type.split('/')[1];
        if (m) return m.split('+')[0];
      }
      // fallback to target or source
      return (mode === "compress") ? extOfName(file.name) : (targetFormat.value || extOfName(file.name) || 'bin');
    })();
    const suggested = `${baseName}.${finalExt}`;
    // ensure Blob -> File object for proper filename on download
    const outFile = blobToFile(resultBlob, suggested);

    prepareDownload(outFile, suggested);
    hideWorking();
    progressBar.style.width = "100%";
  } catch (err) {
    hideWorking();
    progressBar.style.width = "0%";
    // "server busy" simulation: if error message contains busy-like content, show retry logic
    const msg = (err && err.message) ? err.message : 'Conversion failed.';
    if (/busy|quota|timeout|busy/i.test(msg)) {
      // randomized retry
      const delay = randomDelayMs();
      let remain = Math.round(delay/1000);
      spinner.style.display = "inline-block";
      msgText.textContent = `⚠️ Busy — retrying in ${remain}s...`;
      const cd = setInterval(()=>{ remain--; if (remain>=0) msgText.textContent = `⚠️ Busy — retrying in ${remain}s...`; if (remain<=0) clearInterval(cd); }, 1000);
      setTimeout(()=> {
        // attempt to submit again programmatically (this simply triggers the user to click again)
        spinner.style.display = "none";
        msgText.textContent = "⚠️ Retry the operation now.";
      }, delay);
    } else {
      msgText.textContent = `❌ ${msg}`;
    }
    console.error("Conversion error:", err);
  }
});

// Reset
resetBtn.addEventListener("click", () => {
  fileInput.value = "";
  filePreview.innerHTML = "";
  fileInfo.textContent = "";
  progressBar.style.width = "0%";
  msgText.textContent = "";
  spinner.style.display = "none";
  downloadLink.style.display = "none";
  resetBtn.style.display = "none";
  populateFormatSelect(["Images","Audio","Video","Documents"]);
});

// initialize UI select
populateFormatSelect(["Images","Audio","Video","Documents"]);
