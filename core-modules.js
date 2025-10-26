// ==============================
// core-modules.js
// Universal File Tool Core (Pure Browser Version)
// ==============================

// ---- Basic helpers ----
export function formatBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`;
  return `${(b / 1073741824).toFixed(1)} GB`;
}

export function ensureWithinCap(file, capMB = 200) {
  if (file.size > capMB * 1024 * 1024) {
    throw new Error(`File too large (${formatBytes(file.size)}). Limit: ${capMB} MB.`);
  }
}

// ---- FFmpeg setup (video/audio) ----
let ffmpegInstance = null;

export async function ensureFFmpegLoaded() {
  if (ffmpegInstance) return true;
  try {
    const { createFFmpeg, fetchFile } = FFmpeg;
    ffmpegInstance = createFFmpeg({
      log: false,
      corePath: "https://unpkg.com/@ffmpeg/core@0.12.7/dist/ffmpeg-core.js"
    });
    await ffmpegInstance.load();
    return true;
  } catch (err) {
    console.warn("⚠️ FFmpeg wasm could not load:", err);
    ffmpegInstance = null;
    return false;
  }
}

// ---- FFmpeg Helpers ----
export async function convertVideoTo(file, targetExt, onProgress = () => {}) {
  if (!ffmpegInstance) throw new Error("FFmpeg not available");
  const { name } = file;
  const inputExt = name.split(".").pop();
  const inputName = "input." + inputExt;
  const outputName = "output." + targetExt;

  ffmpegInstance.FS("writeFile", inputName, await fetchFile(file));
  await ffmpegInstance.run("-i", inputName, "-y", outputName);
  const data = ffmpegInstance.FS("readFile", outputName);
  onProgress(90);
  return new Blob([data.buffer], { type: `video/${targetExt}` });
}

export async function extractAudioFromVideo(file, targetExt, onProgress = () => {}) {
  if (!ffmpegInstance) throw new Error("FFmpeg not available");
  const { name } = file;
  const inputExt = name.split(".").pop();
  const inputName = "input." + inputExt;
  const outputName = "output." + targetExt;

  ffmpegInstance.FS("writeFile", inputName, await fetchFile(file));
  await ffmpegInstance.run("-i", inputName, "-vn", "-acodec", "copy", outputName);
  const data = ffmpegInstance.FS("readFile", outputName);
  onProgress(90);
  return new Blob([data.buffer], { type: `audio/${targetExt}` });
}

// ---- Image conversion ----
export async function convertImageTo(file, targetExt) {
  const img = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const mime = targetExt === "jpg" ? "image/jpeg" : `image/${targetExt}`;
  const blob = await new Promise(res => canvas.toBlob(res, mime, 0.92));
  return blob;
}

export async function compressImage(file, quality = 0.7) {
  const img = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", quality));
  return blob;
}

// ---- Document Conversion (Browser-based) ----
export async function convertDocToPDF(file) {
  try {
    const text = await file.text();
    const { PDFDocument, rgb } = PDFLib;
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 800]);
    const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
    const lines = text.split(/\r?\n/);
    let y = 780;
    for (const line of lines) {
      page.drawText(line.slice(0, 90), { x: 40, y, size: 12, color: rgb(0, 0, 0), font });
      y -= 16;
      if (y < 50) break;
    }
    const pdfBytes = await pdfDoc.save();
    return new Blob([pdfBytes], { type: "application/pdf" });
  } catch (e) {
    throw new Error("PDF conversion failed: " + e.message);
  }
}

export async function convertPDFToText(file) {
  try {
    const pdfData = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
    let text = "";
    const maxPages = pdf.numPages;
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(it => it.str).join(" ") + "\n";
    }
    return new Blob([text], { type: "text/plain" });
  } catch (err) {
    console.warn("PDF->text unavailable:", err);
    throw new Error("PDF -> text conversion not supported in this browser.");
  }
}

// ---- Compression (generic) ----
export async function compressGeneric(file) {
  if (file.type.startsWith("image/")) return compressImage(file);
  if (file.type.startsWith("video/") || file.type.startsWith("audio/")) {
    const ok = await ensureFFmpegLoaded();
    if (!ok) throw new Error("FFmpeg (wasm) not supported in this browser.");
    const { name } = file;
    const inputExt = name.split(".").pop();
    const outputName = "compressed." + inputExt;
    ffmpegInstance.FS("writeFile", "input." + inputExt, await fetchFile(file));
    await ffmpegInstance.run("-i", "input." + inputExt, "-b:v", "1M", outputName);
    const data = ffmpegInstance.FS("readFile", outputName);
    return new Blob([data.buffer], { type: file.type });
  }
  throw new Error("Compression not available for this file type.");
}

// ---- Central dispatcher ----
export async function convertFile(file, targetExt, onProgress = () => {}) {
  ensureWithinCap(file);

  const type = (file.type || "").toLowerCase();
  const srcExt = (file.name.split(".").pop() || "").toLowerCase();
  targetExt = targetExt.toLowerCase();

  // Same type check
  if (srcExt === targetExt) {
    throw new Error(`Source and target formats are identical (.${srcExt}).`);
  }

  // IMAGE conversion
  if (type.startsWith("image/")) {
    return await convertImageTo(file, targetExt);
  }

  // AUDIO/VIDEO
  if (type.startsWith("video/") || type.startsWith("audio/")) {
    const ok = await ensureFFmpegLoaded();
    if (!ok) throw new Error("FFmpeg (wasm) could not be loaded.");
    if (type.startsWith("video/") && targetExt.match(/mp3|wav|ogg|m4a|aac|flac/)) {
      return await extractAudioFromVideo(file, targetExt, onProgress);
    }
    return await convertVideoTo(file, targetExt, onProgress);
  }

  // DOCUMENT
  if (srcExt === "txt" && targetExt === "pdf") return await convertDocToPDF(file);
  if (srcExt === "pdf" && targetExt === "txt") return await convertPDFToText(file);

  throw new Error(`Conversion ${srcExt} → ${targetExt} not supported in this environment.`);
}

export async function compressFile(file) {
  ensureWithinCap(file);
  return await compressGeneric(file);
}

console.log("✅ core-modules.js loaded successfully");
