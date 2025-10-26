// core-modules.js
// Exports functions for conversion & compression that run in the browser.
// Usage: import { ensureFFmpegLoaded, convertVideoTo, convertAudioTo, convertImageTo, compressImage, convertDocumentTo, readAsArrayBuffer, formatBytes } from './core-modules.js'

const MAX_BYTES = 200 * 1024 * 1024; // 200 MB cap

// Simple utilities
export function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B","KB","MB","GB","TB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(2)} ${units[i]}`;
}

export function readAsArrayBuffer(file){ return file.arrayBuffer(); }
export function readAsBlob(file){ return file; }

// check file size against cap
export function ensureWithinCap(file) {
  if (!file) throw new Error("No file");
  if (file.size > MAX_BYTES) throw new Error(`File exceeds ${formatBytes(MAX_BYTES)} limit.`);
  return true;
}

// ---------------- FFmpeg WASM loader (lazy) ----------------
let _ffmpeg = null;
let _ffmpegLoading = null;

export async function ensureFFmpegLoaded({ log = false } = {}) {
  if (_ffmpeg) return _ffmpeg;
  if (_ffmpegLoading) return _ffmpegLoading;

  _ffmpegLoading = (async () => {
    // dynamic import from unpkg/jsDelivr – this tries to get a modern ESM build.
    // If this CDN fails, the caller will see an error and we fallback to telling user conversions aren't available.
    try {
      // createFFmpeg is provided by @ffmpeg/ffmpeg library
      const module = await import('https://unpkg.com/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js');
      const { createFFmpeg, fetchFile } = module;
      const ffmpeg = createFFmpeg({ log });
      await ffmpeg.load(); // downloads the wasm core
      _ffmpeg = { ffmpeg, fetchFile };
      return _ffmpeg;
    } catch (err) {
      // Try alternative CDN (jsdelivr)
      try {
        const module2 = await import('https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js');
        const { createFFmpeg, fetchFile } = module2;
        const ffmpeg = createFFmpeg({ log });
        await ffmpeg.load();
        _ffmpeg = { ffmpeg, fetchFile };
        return _ffmpeg;
      } catch (err2) {
        console.error("FFmpeg wasm load failed:", err, err2);
        throw new Error("FFmpeg (wasm) could not be loaded in this browser.");
      }
    }
  })();

  return _ffmpegLoading;
}

// ---------------- Video/Audio conversion helpers (ffmpeg) ----------------
export async function convertVideoTo(file, targetExt, onProgress = ()=>{}) {
  await ensureFFmpegLoaded({ log: false });
  const { ffmpeg, fetchFile } = _ffmpeg;
  const inputName = `input${Date.now()}.${getExt(file.name) || 'in'}`;
  const outputName = `output.${targetExt.replace(/^\./, '')}`;

  // write input
  const data = await fetchFile(file);
  ffmpeg.FS('writeFile', inputName, data);

  // set simple progress handler (ffmpeg wasm doesn't expose percent by default; we approximate)
  ffmpeg.setProgress(({ ratio }) => { try { onProgress(Math.min(0.99, ratio)); } catch {} });

  // choose a conservative codec preset to reduce memory/time
  const args = ['-i', inputName];
  if (targetExt === 'mp4' || targetExt === 'mov' || targetExt === 'm4v') {
    args.push('-c:v','libx264','-preset','veryfast','-crf','28','-c:a','aac','-b:a','128k');
  } else if (targetExt === 'webm') {
    args.push('-c:v','libvpx-vp9','-b:v','1M','-c:a','libopus','-b:a','96k');
  } else if (targetExt === 'mkv') {
    args.push('-c:v','libx264','-preset','veryfast','-crf','28','-c:a','aac','-b:a','96k');
  } else { // fallback container copy
    args.push('-c','copy');
  }
  args.push(outputName);

  await ffmpeg.run(...args);

  const outData = ffmpeg.FS('readFile', outputName);
  const blob = new Blob([outData.buffer], { type: mimeForExt(targetExt) || 'application/octet-stream' });
  // cleanup
  try { ffmpeg.FS('unlink', inputName); ffmpeg.FS('unlink', outputName); } catch {}
  return blob;
}

export async function extractAudioFromVideo(file, targetExt='mp3', onProgress=()=>{}) {
  await ensureFFmpegLoaded({ log:false });
  const { ffmpeg, fetchFile } = _ffmpeg;
  const inputName = `input${Date.now()}.${getExt(file.name) || 'in'}`;
  const outputName = `output.${targetExt}`;
  const data = await fetchFile(file);
  ffmpeg.FS('writeFile', inputName, data);
  ffmpeg.setProgress(({ ratio }) => { try { onProgress(Math.min(0.99, ratio)); } catch {} });

  const args = ['-i', inputName, '-vn'];
  if (targetExt === 'mp3') args.push('-codec:a','libmp3lame','-qscale:a','2');
  else if (targetExt === 'wav') args.push('-acodec','pcm_s16le','-ar','44100');
  else if (targetExt === 'aac' || targetExt === 'm4a') args.push('-c:a','aac','-b:a','128k');
  else args.push('-c','copy');
  args.push(outputName);

  await ffmpeg.run(...args);
  const outData = ffmpeg.FS('readFile', outputName);
  const blob = new Blob([outData.buffer], { type: mimeForExt(targetExt) || 'audio/*' });
  try { ffmpeg.FS('unlink', inputName); ffmpeg.FS('unlink', outputName); } catch {}
  return blob;
}

// ---------------- Image conversion & compression (canvas-based, robust) ----------------
function getExt(name='') { const m = (name||'').toLowerCase().match(/\.([a-z0-9]+)$/); return m ? m[1] : ''; }
function mimeForExt(ext='') {
  ext = (ext||'').replace(/^\./,'').toLowerCase();
  const m = { jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', webp:'image/webp', gif:'image/gif', tiff:'image/tiff', bmp:'image/bmp', pdf:'application/pdf', mp4:'video/mp4', mp3:'audio/mpeg' };
  return m[ext] || '';
}

// compress image using canvas and quality (for jpg/webp)
export async function convertImageTo(file, targetExt='jpg', quality=0.8) {
  // read into Image bitmap
  if (!file.type.startsWith('image/')) {
    // if PDF -> render handled elsewhere; else try to return original
    return file;
  }
  const blob = file;
  const imgBitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(imgBitmap.width, imgBitmap.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imgBitmap, 0, 0);
  // scaling not done here (could be added)
  const mime = mimeForExt(targetExt) || 'image/jpeg';
  const blobOut = await canvas.convertToBlob({ type: mime, quality });
  return blobOut;
}

// generic compress image (reduce quality & size)
export async function compressImage(file, options={ maxWidth:1600, maxHeight:1600, quality:0.7 }) {
  if (!file.type.startsWith('image/')) return file;
  const blob = file;
  const img = await createImageBitmap(blob);
  let w = img.width, h = img.height;
  const ratio = Math.min(1, Math.min(options.maxWidth / w, options.maxHeight / h));
  const tw = Math.round(w * ratio), th = Math.round(h * ratio);
  const canvas = new OffscreenCanvas(tw, th);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, tw, th);
  const mime = blob.type || 'image/jpeg';
  const out = await canvas.convertToBlob({ type: mime, quality: options.quality });
  return out;
}

// ---------------- Document handling (pdf-lib & simple fallbacks) ----------------
let _pdfLib = null;
export async function ensurePdfLib() {
  if (_pdfLib) return _pdfLib;
  try {
    _pdfLib = await import('https://unpkg.com/pdf-lib@1.18.1/dist/pdf-lib.min.js');
    return _pdfLib;
  } catch (err) {
    console.warn("pdf-lib load failed", err);
    throw new Error("pdf-lib could not be loaded for document conversions.");
  }
}

// Render first page of PDF as PNG using pdf.js (already on page via CDN)
export async function renderPdfFirstPageAsPng(file) {
  try {
    const array = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: array });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width; canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    const dataUrl = canvas.toDataURL('image/png');
    const res = await (await fetch(dataUrl)).blob();
    return res;
  } catch (err) {
    console.warn('PDF render failed', err);
    throw new Error('PDF render failed.');
  }
}

// Convert basic DOCX->text using mammoth if available, otherwise fallback to returning original file
export async function convertDocumentTo(file, targetExt='pdf') {
  const ext = getExt(file.name);
  if (ext === 'pdf' && targetExt !== 'pdf') {
    // attempt text extraction using pdf-lib isn't perfect; fallback to returning original
    const pdfLib = await ensurePdfLib().catch(()=>null);
    if (!pdfLib) throw new Error('PDF -> text conversion not available in this environment.');
    // try to extract text (best-effort)
    const uint8 = new Uint8Array(await file.arrayBuffer());
    const loaded = await pdfLib.PDFDocument.load(uint8);
    const pages = loaded.getPages();
    let txt = '';
    pages.forEach(p => { try { txt += p.getTextContent ? (p.getTextContent && p.getTextContent().items.map(i=>i.str).join(' ')) : ''; } catch(e){} });
    const blob = new Blob([txt], { type: (targetExt==='txt'?'text/plain':'text/plain') });
    return blob;
  }
  // If target is pdf and input is image: embed image in PDF
  if (targetExt === 'pdf' && file.type.startsWith('image/')) {
    const pdfLib = await ensurePdfLib();
    const uint8 = new Uint8Array(await file.arrayBuffer());
    const pdfDoc = await pdfLib.PDFDocument.create();
    const img = file.type === 'image/png' ? await pdfDoc.embedPng(uint8) : await pdfDoc.embedJpg(uint8).catch(async ()=>{ return await pdfDoc.embedPng(uint8) });
    const page = pdfDoc.addPage([img.width, img.height]);
    page.drawImage(img, { x:0, y:0, width: img.width, height: img.height });
    const pdfBytes = await pdfDoc.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
  }

  // fallback: return the original file (if we can't convert)
  return file;
}

// ---------------- small helpers ----------------
export function blobToFile(blob, name) {
  return new File([blob], name, { type: blob.type || 'application/octet-stream' });
}
