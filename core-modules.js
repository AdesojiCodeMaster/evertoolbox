// core-modules.js
// CDN-based test build for GitHub Pages.
// Browser-only logic: image/audio/video/document conversion & compression.
// NOTE: heavy libraries (ffmpeg.wasm) are loaded from CDN at runtime.

import { createFFmpeg, fetchFile } from 'https://unpkg.com/@ffmpeg/ffmpeg@0.11.8/dist/ffmpeg.min.js';

// Limits and supported formats
export const MAX_SIZE = 200 * 1024 * 1024; // 200 MB
export const FORMATS = {
  image: ['png','jpg','jpeg','webp','gif','bmp','svg'],
  document: ['pdf','docx','txt','md','html','rtf','odt'],
  audio: ['mp3','wav','m4a','ogg','flac'],
  video: ['mp4','webm','mov','mkv','ogg']
};

export function extFromName(name){ const m=(name||'').split('.'); return m.length>1? m.pop().toLowerCase() : '' }
export function humanSize(n){ if(n<1024) return n+' B'; if(n<1024*1024) return (n/1024).toFixed(1)+' KB'; if(n<1024*1024*1024) return (n/1024/1024).toFixed(1)+' MB'; return (n/1024/1024/1024).toFixed(2)+' GB'; }
export function mimeFromExt(ext){
  ext = ext.toLowerCase();
  const map = {pdf:'application/pdf', txt:'text/plain', md:'text/markdown', html:'text/html', docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document', rtf:'application/rtf', odt:'application/vnd.oasis.opendocument.text', mp3:'audio/mpeg', wav:'audio/wav', mp4:'video/mp4', webm:'video/webm', png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', webp:'image/webp', gif:'image/gif', bmp:'image/bmp', svg:'image/svg+xml', flac:'audio/flac', m4a:'audio/mp4', ogg:'audio/ogg'};
  return map[ext] || 'application/octet-stream';
}

export function makeProgress(){ let cb=null; return { onProgress(fn){cb=fn}, emit(v){ if(cb) cb(v) } } }

// ----------- Image: canvas-based conversion/compression -----------
export async function convertImageTo(file, targetExt, quality=0.75, onProgress){
  // targetExt: 'jpg'|'png'|'webp'|'gif'|'bmp'|'svg' (svg handled as passthrough/rasterization)
  const ext = targetExt.replace('.', '').toLowerCase();
  const blob = file instanceof Blob ? file : new Blob([file]);
  // If input is SVG and target is SVG, passthrough
  if(ext === 'svg' && (file.type === 'image/svg+xml' || extFromName(file.name) === 'svg')){
    return new File([blob], changeExt(file.name, 'svg'), {type:'image/svg+xml'});
  }

  // Create ImageBitmap for high perf
  const imgBitmap = await createImageBitmap(blob);
  let canvas;
  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(imgBitmap.width, imgBitmap.height);
  } else {
    canvas = document.createElement('canvas');
    canvas.width = imgBitmap.width; canvas.height = imgBitmap.height;
  }
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imgBitmap, 0, 0);

  // Determine mime
  let mime;
  if(ext === 'png') mime = 'image/png';
  else if(ext === 'webp') mime = 'image/webp';
  else if(ext === 'bmp') mime = 'image/bmp';
  else mime = 'image/jpeg';

  // use convertToBlob when available (OffscreenCanvas), else canvas.toBlob
  const q = Math.max(0.05, Math.min(1, quality));
  const blobOut = await (canvas.convertToBlob ? canvas.convertToBlob({type:mime, quality:q}) : new Promise(res=> canvas.toBlob(res, mime, q)));
  if(onProgress) onProgress({ loaded: blobOut.size, total: blob.size });
  return new File([blobOut], changeExt(file.name, ext), { type: mime });
}

function changeExt(name, ext){ const base = name.includes('.') ? name.slice(0,name.lastIndexOf('.')) : name; return base + '.' + ext }

// ----------- FFmpeg.wasm singleton (audio & video) -----------
let _ffmpeg = null;
export async function ensureFFmpeg(onProgress){
  if(_ffmpeg) return _ffmpeg;
  // corePath points to the ffmpeg-core JS (which loads the .wasm)
  _ffmpeg = createFFmpeg({
    log: false,
    corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js',
    progress: p => { if(onProgress) onProgress(p) }
  });
  await _ffmpeg.load();
  return _ffmpeg;
}

// Audio conversion/compression
export async function convertAudio(file, targetExt='mp3', bitrate='128k', onProgress){
  const ff = await ensureFFmpeg(onProgress);
  const inName = 'in.' + extFromName(file.name || 'input');
  const outName = 'out.' + targetExt;
  ff.FS('writeFile', inName, await fetchFile(file));
  // simple mapping: keep bitrate param
  await ff.run('-i', inName, '-b:a', bitrate, outName);
  const data = ff.FS('readFile', outName);
  try { ff.FS('unlink', inName); ff.FS('unlink', outName); } catch(e){}
  return new File([data.buffer], changeExt(file.name, targetExt), { type: mimeFromExt(targetExt) });
}

// Video conversion/compression
export async function convertVideo(file, targetExt='mp4', preset='medium', crf=28, onProgress){
  const ff = await ensureFFmpeg(onProgress);
  const inName = 'in.' + extFromName(file.name || 'input');
  const outName = 'out.' + targetExt;
  ff.FS('writeFile', inName, await fetchFile(file));

  // choose codecs based on target
  let vcodec = 'libx264', acodec = 'aac';
  if(targetExt === 'webm') { vcodec = 'libvpx'; acodec = 'libvorbis'; }
  if(targetExt === 'ogg') { vcodec = 'libtheora'; acodec = 'libvorbis'; }

  const args = ['-i', inName, '-c:v', vcodec, '-preset', preset, '-crf', String(crf), '-c:a', acodec, outName];
  try {
    await ff.run(...args);
  } catch (err) {
    // fallback: simple remux if codec missing
    await ff.run('-i', inName, outName);
  }

  const data = ff.FS('readFile', outName);
  try { ff.FS('unlink', inName); ff.FS('unlink', outName); } catch(e){}
  return new File([data.buffer], changeExt(file.name, targetExt), { type: mimeFromExt(targetExt) });
}

// ----------- Documents (best-effort in-browser) -----------
export async function docxToPdf(file, onProgress){
  // Use mammoth -> html -> html2pdf
  const mammoth = await import('https://unpkg.com/mammoth/mammoth.browser.min.js');
  const html2pdf = await import('https://unpkg.com/html2pdf.js/dist/html2pdf.min.js');
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  const html = result.value;
  // render hidden container
  const wrap = document.createElement('div'); wrap.style.position='fixed'; wrap.style.left='-9999px'; wrap.style.top='0'; wrap.innerHTML = html;
  document.body.appendChild(wrap);
  const opt = { margin: 0.4, filename: changeExt(file.name, 'pdf'), image: { type: 'jpeg', quality: 0.9 }, html2canvas: { scale: 1 } };
  await html2pdf.default().from(wrap).set(opt).save();
  document.body.removeChild(wrap);
  return null; // html2pdf already triggers download
}

// fallback passthrough
export async function passthrough(file){ return file }
