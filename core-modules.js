// core-modules.js
// CDN-focused, browser-only conversion + compression helpers.
// Exports conversion functions used by UI glue.
// WARNING: heavy operations (ffmpeg.wasm) are CPU & memory heavy on low-end devices.

import { createFFmpeg, fetchFile } from 'https://unpkg.com/@ffmpeg/ffmpeg@0.11.8/dist/ffmpeg.min.js';

// Limits + format lists
export const MAX_SIZE = 200 * 1024 * 1024;
export const FORMATS = {
  image: ['png','jpg','jpeg','webp','gif','bmp','svg'],
  document: ['pdf','docx','txt','md','html','rtf','odt'],
  audio: ['mp3','wav','m4a','ogg','flac'],
  video: ['mp4','webm','mov','mkv','ogg']
};

// Helpers
export function extFromName(name){ const m=(name||'').split('.'); return m.length>1? m.pop().toLowerCase() : ''; }
export function humanSize(n){ if(n<1024) return `${n} B`; if(n<1024*1024) return `${(n/1024).toFixed(1)} KB`; if(n<1024*1024*1024) return `${(n/1024/1024).toFixed(1)} MB`; return `${(n/1024/1024/1024).toFixed(2)} GB`; }
export function mimeFromExt(ext){
  ext = (ext||'').toLowerCase();
  const map = {
    pdf:'application/pdf', txt:'text/plain', md:'text/markdown', html:'text/html',
    docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    rtf:'application/rtf', odt:'application/vnd.oasis.opendocument.text',
    mp3:'audio/mpeg', wav:'audio/wav', mp4:'video/mp4', webm:'video/webm',
    png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', webp:'image/webp', gif:'image/gif', bmp:'image/bmp', svg:'image/svg+xml',
    flac:'audio/flac', m4a:'audio/mp4', ogg:'audio/ogg'
  };
  return map[ext] || 'application/octet-stream';
}
export function makeProgress(){ let cb=null; return { onProgress(fn){cb=fn}, emit(v){ if(cb) cb(v) } } }

// Small utility to change filename extension
function changeExt(name, ext){ const base = name.includes('.') ? name.slice(0,name.lastIndexOf('.')) : name; return `${base}.${ext}`; }

// ---------------- Image conversion/compression (Canvas)
export async function convertImageTo(file, targetExt, quality=0.75, onProgress){
  if(!file) throw new Error('No file passed to convertImageTo');
  const ext = (targetExt||'').toLowerCase();
  const blob = file instanceof Blob ? file : new Blob([file]);

  // If svg→svg or passthrough svg, return original
  if(ext === 'svg' && (file.type === 'image/svg+xml' || extFromName(file.name) === 'svg')){
    return new File([blob], changeExt(file.name, 'svg'), { type: 'image/svg+xml' });
  }

  // Create bitmap (works in modern browsers)
  const imgBitmap = await createImageBitmap(blob);
  let canvas;
  if(typeof OffscreenCanvas !== 'undefined'){
    canvas = new OffscreenCanvas(imgBitmap.width, imgBitmap.height);
  } else {
    canvas = document.createElement('canvas');
    canvas.width = imgBitmap.width; canvas.height = imgBitmap.height;
  }
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imgBitmap, 0, 0);

  // Determine mime for target
  let mime = 'image/jpeg';
  if(ext === 'png') mime = 'image/png';
  else if(ext === 'webp') mime = 'image/webp';
  else if(ext === 'bmp') mime = 'image/bmp';

  const q = Math.max(0.05, Math.min(1, quality));
  const blobOut = await (canvas.convertToBlob ? canvas.convertToBlob({ type: mime, quality: q }) : new Promise(res => canvas.toBlob(res, mime, q)));
  if(onProgress) onProgress({ loaded: blobOut.size, total: blob.size || blobOut.size });
  return new File([blobOut], changeExt(file.name, ext), { type: mime });
}

// ---------------- FFmpeg.wasm singleton (audio & video)
let _ffmpeg = null;
export async function ensureFFmpeg(onProgress){
  if(_ffmpeg) return _ffmpeg;
  _ffmpeg = createFFmpeg({
    log: false,
    corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js',
    progress: p => { if(onProgress) onProgress(p); }
  });
  await _ffmpeg.load();
  return _ffmpeg;
}

// Audio conversion
export async function convertAudio(file, targetExt='mp3', bitrate='128k', onProgress){
  if(!file) throw new Error('No file given to convertAudio');
  const ff = await ensureFFmpeg(onProgress);
  const inName = 'in.' + extFromName(file.name || 'input');
  const outName = 'out.' + targetExt;
  ff.FS('writeFile', inName, await fetchFile(file));
  try {
    await ff.run('-i', inName, '-b:a', bitrate, outName);
  } catch(e) {
    // try safe fallback (re-encode with libmp3lame when needed)
    try { await ff.run('-i', inName, '-c:a', 'libmp3lame', '-q:a', '2', outName); } catch(err){ throw err; }
  }
  const data = ff.FS('readFile', outName);
  try { ff.FS('unlink', inName); ff.FS('unlink', outName); } catch(e) {}
  return new File([data.buffer], changeExt(file.name, targetExt), { type: mimeFromExt(targetExt) });
}

// Video conversion
export async function convertVideo(file, targetExt='mp4', preset='medium', crf=28, onProgress){
  if(!file) throw new Error('No file given to convertVideo');
  const ff = await ensureFFmpeg(onProgress);
  const inName = 'in.' + extFromName(file.name || 'input');
  const outName = 'out.' + targetExt;
  ff.FS('writeFile', inName, await fetchFile(file));

  // Choose codecs heuristically
  let vcodec = 'libx264', acodec = 'aac';
  if(targetExt === 'webm'){ vcodec = 'libvpx'; acodec = 'libvorbis'; }
  if(targetExt === 'ogg'){ vcodec = 'libtheora'; acodec = 'libvorbis'; }

  const args = ['-i', inName, '-c:v', vcodec, '-preset', preset, '-crf', String(crf), '-c:a', acodec, outName];
  try {
    await ff.run(...args);
  } catch (err) {
    // fallback: simple remux
    await ff.run('-i', inName, outName);
  }

  const data = ff.FS('readFile', outName);
  try { ff.FS('unlink', inName); ff.FS('unlink', outName); } catch(e) {}
  return new File([data.buffer], changeExt(file.name, targetExt), { type: mimeFromExt(targetExt) });
}

// ---------------- Documents (best-effort)
export async function docxToPdf(file, onProgress){
  // docx -> html (mammoth) -> pdf (html2pdf)
  const mammoth = await import('https://unpkg.com/mammoth/mammoth.browser.min.js');
  const html2pdf = await import('https://unpkg.com/html2pdf.js/dist/html2pdf.min.js');
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  const html = result.value;

  const wrap = document.createElement('div'); wrap.style.position='fixed'; wrap.style.left='-9999px'; wrap.style.top='0'; wrap.innerHTML = html;
  document.body.appendChild(wrap);
  const opt = { margin: 0.4, filename: changeExt(file.name, 'pdf'), image: { type: 'jpeg', quality: 0.9 }, html2canvas: { scale: 1 } };
  await html2pdf.default().from(wrap).set(opt).save();
  document.body.removeChild(wrap);
  return null; // html2pdf triggers save/download
}

export async function passthrough(file){ return file; }
