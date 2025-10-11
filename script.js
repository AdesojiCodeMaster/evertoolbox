/* ===========================================================================
   EverToolbox - Final script.js (with in-browser edit-before-download)
   Hybrid: client-side edits + optional backend conversion
   Backend base:
   const API_BASE = 'https://evertoolbox-backend.onrender.com'
   =========================================================================== */

const API_BASE = "https://evertoolbox-backend.onrender.com";
const BACKEND_TIMEOUT_MS = 20000;

const $ = id => document.getElementById(id);
const on = (el, ev, fn) => el && el.addEventListener(ev, fn);
const safeJSON = async (r) => { try { return await r.json() } catch(e){ return null } };
const fetchWithTimeout = async (url, opts={}, t=BACKEND_TIMEOUT_MS) => {
  const controller = new AbortController();
  const id = setTimeout(()=>controller.abort(), t);
  try { const res = await fetch(url, {...opts, signal: controller.signal}); clearTimeout(id); return res; }
  catch(e){ clearTimeout(id); throw e; }
};
const downloadBlob = (blob, filename) => {
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url; a.download = filename || 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 2000);
};

/* =========================
   UI: theme, mobile menu, smooth scroll
   ========================= */
(function uiInit(){
  document.documentElement.setAttribute('data-theme', localStorage.getItem('theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light'));
  document.addEventListener('DOMContentLoaded', () => {
    const themeBtn = $('theme-toggle');
    if (themeBtn) themeBtn.addEventListener('click', () => {
      const now = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      if (now === 'dark') document.documentElement.setAttribute('data-theme','dark'); else document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('theme', now === 'dark' ? 'dark' : 'light');
    });
    const menuBtn = $('mobile-menu-btn'), mobileMenu = $('mobile-menu');
    if (menuBtn && mobileMenu) {
      menuBtn.addEventListener('click', () => {
        const open = mobileMenu.classList.toggle('open');
        menuBtn.setAttribute('aria-expanded', open ? 'true':'false');
        mobileMenu.setAttribute('aria-hidden', open ? 'false':'true');
      });
      mobileMenu.querySelectorAll && mobileMenu.querySelectorAll('a').forEach(a=>a.addEventListener('click', () => {
        mobileMenu.classList.remove('open'); menuBtn.setAttribute('aria-expanded','false');
      }));
    }
    document.querySelectorAll && document.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener('click', (e)=>{
      const id = a.getAttribute('href').slice(1); const el = document.getElementById(id);
      if (el) { e.preventDefault(); el.scrollIntoView({behavior:'smooth', block:'start'}); }
    }));
  });
})();

/* =========================
   Word counter
   ========================= */
(function wordCounterInit(){
  const ta = $('wc-input') || $('wordInput');
  const out = $('wc-output') || $('wc-output');
  if (!ta || !out) return;
  function update(){
    const text = ta.value || '';
    const words = text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
    const chars = text.length;
    out.textContent = `${words} words — ${chars} characters`;
  }
  on(ta, 'input', update); setTimeout(update, 50);
})();

/* =========================
   Case converter (preserve behavior)
   ========================= */
window.convertCase = window.convertCase || function(mode){
  const ta = $('case-input') || $('caseInput'), out=$('case-output')||$('caseOutput');
  if (!ta) return;
  let v = ta.value || '';
  if (mode==='upper') v=v.toUpperCase();
  if (mode==='lower') v=v.toLowerCase();
  if (mode==='title') v=v.toLowerCase().replace(/\b(\w)/g,(m,p)=>p.toUpperCase());
  if (out && (out.tagName==='TEXTAREA' || out.tagName==='INPUT')) out.value=v; else ta.value=v;
};

/* =========================
   Text-to-speech (play locally + backend download)
   ========================= */
/* =========================
   TTS: send selected language to backend (POST /api/tts)
   - Uses API_BASE from your main script
   - Expects backend route: POST /api/tts { text, lang }
   ========================= */
async function speakTextWithSelectedLang() {
  const ta = document.getElementById('tts-input');
  const sel = document.getElementById('tts-voices');
  const out = document.getElementById('tts-output');

  if (!ta) return alert('TTS input (#tts-input) not found.');
  const text = (ta.value || '').trim();
  if (!text) return alert('Enter text to speak.');

  const lang = sel ? (sel.value || sel.options[sel.selectedIndex]?.value || 'en') : 'en';

  // helpers fallback if missing in your script.js
  const _fetchTimeout = (typeof fetchWithTimeout === 'function')
    ? fetchWithTimeout
    : async (u, o = {}, t = 20000) => {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), t);
        try { const r = await fetch(u, {...o, signal: controller.signal}); clearTimeout(id); return r; }
        catch(e){ clearTimeout(id); throw e; }
      };

  const _downloadBlob = (typeof downloadBlob === 'function')
    ? downloadBlob
    : (b, name) => {
        const a = document.createElement('a');
        const url = URL.createObjectURL(b);
        a.href = url; a.download = name || 'speech.mp3';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(()=>URL.revokeObjectURL(url), 2000);
      };

  if (out) out.innerHTML = '<em>Generating audio…</em>';

  try {
    const resp = await fetch('https://evertoolbox-backend.onrender.com/api/tts', {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    text,
    lang: sel.value || "auto"   // 👈 send the selected language
  })
}, 30000);

    if (!resp.ok) {
      // try to read JSON error
      let errMsg = `Server returned ${resp.status}`;
      try { const j = await resp.json(); if (j && j.error) errMsg = j.error; } catch(e){}
      throw new Error(errMsg);
    }

    const ctype = resp.headers.get('content-type') || '';
    if (!/audio|mpeg|ogg|wav|octet/i.test(ctype)) {
      // server may have returned JSON with an error
      const j = await resp.json().catch(()=>null);
      const em = (j && j.error) ? j.error : `Unexpected content-type: ${ctype}`;
      throw new Error(em);
    }

    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);

    // Build player + download link
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.src = url;
    audio.autoplay = true;
    const dl = document.createElement('a');
    dl.href = url;
    dl.download = 'speech.mp3';
    dl.textContent = 'Download MP3';
    dl.style.display = 'inline-block';
    dl.style.marginLeft = '10px';

    if (out) { out.innerHTML = ''; out.appendChild(audio); out.appendChild(dl); }
    else { document.body.appendChild(audio); document.body.appendChild(dl); }

    // Revoke later (give user time to download/play)
    setTimeout(()=>URL.revokeObjectURL(url), 60_000);

  } catch (err) {
    console.error('TTS server error:', err);
    if (out) out.innerHTML = `<p style="color:red">TTS failed: ${err.message}</p>`;

    // Fallback: ask user if they want local speechSynthesis in their browser
    if ('speechSynthesis' in window) {
      const useLocal = confirm(`TTS server failed: ${err.message}\n\nUse local browser speech (no downloadable file) as fallback?`);
      if (!useLocal) return;
      try {
        const utter = new SpeechSynthesisUtterance(text);

        // Try pick a voice that best matches requested language
        const voices = speechSynthesis.getVoices();
        if (voices && voices.length) {
          // match by prefix (e.g., 'en' should match 'en-US' voices)
          const prefix = (lang || 'en').toLowerCase().split('-')[0];
          const match = voices.find(v => v.lang && v.lang.toLowerCase().startsWith(prefix));
          if (match) utter.voice = match;
        }

        speechSynthesis.cancel();
        speechSynthesis.speak(utter);
        if (out) out.innerHTML = '<p>Playing locally via browser speech (not downloadable).</p>';
      } catch (e) {
        console.error('Local speech failed', e);
        alert('Both server TTS and local speech failed: ' + (e.message || e));
      }
    } else {
      alert('TTS failed and browser does not support speechSynthesis.');
    }
  }
}

// attach to button(s)
(function attachTTS() {
  const btn = document.getElementById('tts-speak') || document.getElementById('tts-run') || document.getElementById('tts-play') || document.getElementById('tts-download');
  if (btn) btn.addEventListener('click', (ev) => { ev.preventDefault(); speakTextWithSelectedLang(); });
})();
     

/* =========================
   SEO Analyzer (already wired to backend)
   ========================= */
(function seoInit(){
  const run = $('seo-run') || $('analyzeBtn'), urlInput = $('seo-url'), out = $('seo-output');
  if (!run || !urlInput || !out) return;
  on(run,'click', async ()=>{
    const url = urlInput.value.trim(); if (!url) return alert('Enter a URL to analyze.');
    out.innerHTML = 'Analyzing…';
    try {
      const resp = await fetchWithTimeout(`${API_BASE}/api/seo-analyze?url=${encodeURIComponent(url)}`, {}, 20000);
      if (!resp.ok) { const j = await safeJSON(resp); throw new Error((j&&j.error) ? j.error : `Server returned ${resp.status}`); }
      const data = await resp.json();
      let html = `<h4>SEO Report for ${url}</h4>`;
      html += `<p><strong>Title:</strong> ${data.title||'—'} (${(data.title||'').length} chars)</p>`;
      html += `<p><strong>Meta description:</strong> ${data.description||'—'} (${(data.description||'').length} chars)</p>`;
      if (data.issues && data.issues.length) html += `<h5>Issues</h5><ul>${data.issues.map(i=>' <li>'+i+'</li>').join('')}</ul>`;
      out.innerHTML = html;
    } catch(err) { console.error('SEO error',err); out.innerHTML = `<p style="color:red">SEO analysis failed: ${err.message||err}</p>`; }
  });
})();

/* =========================================================================
   FILE CONVERTER (text editing + image editing before download or server convert)
   - Supports: text edit (txt->pdf via server), image edit (client-side) + server upload if user chooses server conversion
   ========================================================================== */


// script.js - FINAL (client-side editing + uploader for File Converter + Compressor)
// Works with backend endpoint: POST /api/tools/file/process
// Expects server mounted at same origin (or adjust URLs below)

const fileInput = document.getElementById('fileInput');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const formatSelect = document.getElementById('formatSelect');
const qualityInput = document.getElementById('quality');
const widthInput = document.getElementById('width');
const heightInput = document.getElementById('height');
const rotateInput = document.getElementById('rotate');
const cropInput = document.getElementById('crop');
const overlayTextInput = document.getElementById('overlayText');
const textColorInput = document.getElementById('textColor');
const textSizeInput = document.getElementById('textSize');
const applyEditsBtn = document.getElementById('applyEdits');
const convertBtn = document.getElementById('convertBtn');
const compressBtn = document.getElementById('compressBtn');
const statusEl = document.getElementById('status');
const previewInfo = document.getElementById('previewInfo');

let currentFile = null;
let img = new Image();
let lastDrawParams = null;

// DRAW & PREVIEW
function drawImageOnCanvas(image, opts = {}) {
  // safety limits to avoid huge canvases
  const maxW = 1600, maxH = 1200;
  let iw = image.naturalWidth || image.width;
  let ih = image.naturalHeight || image.height;
  let scale = Math.min(1, maxW / Math.max(1, iw), maxH / Math.max(1, ih));
  const targetW = parseInt(widthInput.value) || Math.round(iw * scale);
  const targetH = parseInt(heightInput.value) || Math.round(ih * scale);

  canvas.width = targetW;
  canvas.height = targetH;

  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // rotation around center
  const rot = ((opts.rotate || 0) % 360) * Math.PI / 180;
  if (rot !== 0) {
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(rot);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);
  }

  // draw scaled
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  // crop preview rectangle
  if (opts.crop) {
    ctx.strokeStyle = 'yellow';
    ctx.lineWidth = 2;
    ctx.strokeRect(opts.crop.left, opts.crop.top, opts.crop.width, opts.crop.height);
  }

  // overlay text
  if (opts.text && opts.text.value) {
    ctx.fillStyle = opts.text.color || '#ffffff';
    ctx.font = `${opts.text.size||36}px sans-serif`;
    ctx.fillText(opts.text.value, opts.text.x || 20, opts.text.y || (opts.text.size || 36));
  }

  ctx.restore();

  lastDrawParams = opts;
  previewInfo.textContent = `Preview ${canvas.width}×${canvas.height}`;
}

// FILE SELECTION
fileInput.addEventListener('change', () => {
  const f = fileInput.files[0];
  if (!f) return;
  currentFile = f;
  statusEl.textContent = '';
  previewInfo.textContent = '';
  // If image type, preview on canvas; otherwise clear canvas and display name
  if (f.type.startsWith('image/')) {
    const url = URL.createObjectURL(f);
    img.onload = () => {
      drawImageOnCanvas(img, { rotate: 0 });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      statusEl.textContent = 'Unable to preview image.';
    };
    img.src = url;
  } else {
    // Clear canvas and show info
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    previewInfo.textContent = `Selected file: ${f.name} (${Math.round(f.size/1024)} KB)`;
  }
});

// Build edits JSON from UI
function buildEditsFromUI() {
  const rotate = parseFloat(rotateInput.value || 0);
  let crop = null;
  if (cropInput.value.trim()) {
    const parts = cropInput.value.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    if (parts.length === 4) crop = { left: parts[0], top: parts[1], width: parts[2], height: parts[3] };
  }
  const textVal = overlayTextInput.value.trim();
  const text = textVal ? { value: textVal, x: 20, y: parseInt(textSizeInput.value||36), size: parseInt(textSizeInput.value||36), color: textColorInput.value } : null;
  return { rotate, crop, text };
}

// Apply edits preview (client-side)
applyEditsBtn.addEventListener('click', () => {
  if (!currentFile) return alert('Load an image first');
  if (!currentFile.type.startsWith('image/')) return alert('Edits preview only available for images');
  const edits = buildEditsFromUI();
  drawImageOnCanvas(img, edits);
  statusEl.textContent = 'Edits applied to preview.';
});

// Convert / Compress helpers
async function canvasToBlobWithCrop(edits, mimeType='image/png', quality = 0.9) {
  return new Promise(resolve => {
    if (!edits || !edits.crop) {
      canvas.toBlob(blob => resolve(blob), mimeType, quality);
    } else {
      const c = document.createElement('canvas');
      c.width = edits.crop.width;
      c.height = edits.crop.height;
      const cctx = c.getContext('2d');
      cctx.drawImage(canvas, edits.crop.left, edits.crop.top, edits.crop.width, edits.crop.height, 0, 0, edits.crop.width, edits.crop.height);
      c.toBlob(blob => resolve(blob), mimeType, quality);
    }
  });
}

async function downloadResponseAsFile(response, fallbackName) {
  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') || '';
  let filename = fallbackName || 'download';
  const m = disposition.match(/filename="?([^"]+)"?/);
  if (m && m[1]) filename = m[1];
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// Upload routine (Central)
async function uploadFinalBlob(blob, filename, options = { action: 'convert', targetFormat: 'webp', quality: 80, edits: null, width: null, height: null }) {
  const fd = new FormData();
  fd.append('file', blob, filename);
  if (options.targetFormat) fd.append('targetFormat', options.targetFormat);
  fd.append('quality', String(options.quality || 80));
  if (options.action) fd.append('action', options.action);
  if (options.edits) fd.append('edits', JSON.stringify(options.edits));
  if (options.width) fd.append('width', String(options.width));
  if (options.height) fd.append('height', String(options.height));

  const resp = await fetch('/api/tools/file/process', { method: 'POST', body: fd });
  return resp;
}

// MAIN: Convert (button)
convertBtn.addEventListener('click', async () => {
  statusEl.textContent = '';
  try {
    if (!currentFile) return alert('Select a file first');
    const edits = buildEditsFromUI();
    let blobToSend, sendName;
    const targetFormat = formatSelect.value;
    const qualityVal = parseInt(qualityInput.value || '80');

    if (currentFile.type.startsWith('image/')) {
      // Use canvas blob (applies client edits and resize)
      // Choose mimeType according to target if it's an image; otherwise send as PNG then server will convert
      const imgTargetIsImage = ['webp','jpeg','jpg','png','avif'].includes(targetFormat.toLowerCase());
      const mimeType = imgTargetIsImage ? `image/${ targetFormat === 'jpg' ? 'jpeg' : targetFormat }` : 'image/png';
      blobToSend = await canvasToBlobWithCrop(edits, mimeType, Math.max(0.1, qualityVal/100));
      const ext = (imgTargetIsImage ? (targetFormat === 'jpg' ? 'jpg' : targetFormat) : (currentFile.name.split('.').pop() || 'png'));
      sendName = currentFile.name.replace(/\.[^/.]+$/, '') + '.' + ext;
    } else {
      // non-image: send original file (edits not applicable)
      blobToSend = currentFile;
      sendName = currentFile.name;
    }

    // same-format check on client side: prevent convert if file already in target format (except user chose different)
    const inputExt = (currentFile.name.split('.').pop() || '').toLowerCase();
    if (inputExt === targetFormat.toLowerCase()) {
      const proceed = confirm('File appears to already be in the chosen format. Continue?');
      if (!proceed) return;
    }

    statusEl.textContent = 'Converting... please wait';
    const resp = await uploadFinalBlob(blobToSend, sendName, { action: 'convert', targetFormat, quality: qualityVal, edits, width: widthInput.value || null, height: heightInput.value || null });

    if (!resp.ok) {
      const j = await resp.json().catch(()=>null);
      throw new Error((j && j.error) ? j.error : `Server returned ${resp.status}`);
    }

    await downloadResponseAsFile(resp, `${sendName}`);
    statusEl.textContent = 'Conversion completed';
  } catch (err) {
    console.error('Convert error', err);
    statusEl.textContent = 'Error: ' + (err.message || err);
  }
});

// MAIN: Compress (button)
compressBtn.addEventListener('click', async () => {
  statusEl.textContent = '';
  try {
    if (!currentFile) return alert('Select a file first');
    const edits = buildEditsFromUI();
    let blobToSend, sendName;
    const qualityVal = parseInt(qualityInput.value || '80');

    if (currentFile.type.startsWith('image/')) {
      // For compress: keep same type but reduce quality (canvas)
      const mimeType = currentFile.type || 'image/jpeg';
      blobToSend = await canvasToBlobWithCrop(edits, mimeType, Math.max(0.05, qualityVal/100));
      sendName = currentFile.name;
    } else {
      // non-image: compress request (server-side compression). Send original.
      blobToSend = currentFile;
      sendName = currentFile.name;
    }

    statusEl.textContent = 'Compressing... please wait';
    const resp = await uploadFinalBlob(blobToSend, sendName, { action: 'compress', targetFormat: formatSelect.value, quality: qualityVal, edits });

    if (!resp.ok) {
      const j = await resp.json().catch(()=>null);
      throw new Error((j && j.error) ? j.error : `Server returned ${resp.status}`);
    }

    await downloadResponseAsFile(resp, `${sendName}`);
    statusEl.textContent = 'Compression completed';
  } catch (err) {
    console.error('Compress error', err);
    statusEl.textContent = 'Error: ' + (err.message || err);
  }
});



/* =========================================================================
   IMAGE CONVERTER / THUMBNAIL (page-level - similar editor but with explicit thumb option)
   - Allows applying edits, previewing, download or server convert
   ========================================================================== */
(function imageConverterInit(){
  const fileInput = $('ic-file') || $('image-file') || $('imageInput');
  const formatSel = $('ic-format') || $('image-format');
  const thumbSize = $('ic-thumb-size') || $('image-thumb-size');
  const runBtn = $('ic-run') || $('image-run');
  const preview = $('ic-output') || $('image-preview');

  if (!fileInput || !runBtn || !preview) return;

  // create editor UI (if not existing) - reuse createImageEditorPanel from file converter area by triggering same id
  function ensureEditor() {
    if (document.getElementById('ft-image-editor')) return document.getElementById('ft-image-editor');
    const editor = document.createElement('div');
    editor.id = 'ft-image-editor';
    editor.style.marginTop = '10px';
    editor.innerHTML = `
      <label>Brightness: <input id="ic-brightness" type="range" min="-100" max="100" value="0"/></label>
      <label>Overlay text: <input id="ic-overlay-text" type="text" placeholder="Add text"/></label>
      <label>Text color: <input id="ic-overlay-color" type="color" value="#ffffff"/></label>
      <label>Font size: <input id="ic-font-size" type="number" value="28" style="width:80px"/></label>
      <button id="ic-apply" class="btn">Apply</button>
      <button id="ic-reset" class="btn">Reset</button>
      <button id="ic-download" class="btn">Download Edited</button>
      <button id="ic-server" class="btn">Send to Server</button>
    `;
    try { preview.parentNode.insertBefore(editor, preview.nextSibling); } catch(e){ document.body.appendChild(editor); }
    return editor;
  }
  const editor = ensureEditor();

  // store original dataURL to reset easily
  let originalDataURL = null;
  fileInput.addEventListener('change', async (e)=>{
    const f = e.target.files && e.target.files[0];
    if (!f) { preview.src=''; preview.style.display='none'; return; }
    if (!f.type.startsWith('image/')) return alert('Choose an image file');
    originalDataURL = await (async ()=>{ const r = new FileReader(); return new Promise((res,rej)=>{ r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(f); }) })();
    preview.src = originalDataURL; preview.style.display='block';
  });

  on($('ic-apply'), 'click', async ()=>{
    try {
      const brightness = parseInt($('ic-brightness')?.value||'0',10);
      const overlayText = $('ic-overlay-text')?.value || '';
      const overlayColor = $('ic-overlay-color')?.value || '#fff';
      const fontSize = parseInt($('ic-font-size')?.value || '28', 10);
      const opts = { brightness, overlayText, overlayTextColor: overlayColor, fontSize, mime: `image/${(formatSel && formatSel.value) ? formatSel.value : 'png'}`, quality: 0.92, maxSize: 2000 };
      const res = await renderImageWithEdits(originalDataURL, opts);
      preview.src = res.dataURL; preview._editedBlob = res.blob;
    } catch(err){ console.error('apply image edits', err); alert('Apply edits failed') }
  });

  on($('ic-reset'), 'click', ()=>{ if (originalDataURL) preview.src = originalDataURL; preview._editedBlob = null; });

  on($('ic-download'), 'click', async ()=>{
    try {
      let blob = preview._editedBlob;
      if (!blob) {
        if (!preview.src) return alert('Nothing to download');
        const resp = await fetch(preview.src); blob = await resp.blob();
      }
      const ext = (formatSel && formatSel.value) ? formatSel.value : 'png';
      downloadBlob(blob, `edited.${ext}`);
    } catch(err){ console.error('download edited', err); alert('Download failed'); }
  });

  on($('ic-server'), 'click', async ()=>{
    try {
      let blob = preview._editedBlob;
      if (!blob) {
        if (!preview.src) return alert('No edited image to send');
        const resp = await fetch(preview.src); blob = await resp.blob();
      }
      const fd = new FormData(); fd.append('file', blob, 'edited.png');
      fd.append('format', (formatSel && formatSel.value) ? formatSel.value : 'png');
      // example width/height using thumb size
      if (thumbSize && thumbSize.value) fd.append('width', thumbSize.value);
      const resp = await fetchWithTimeout(`${API_BASE}/api/convert-image`, { method:'POST', body: fd }, 60000);
      if (!resp.ok) { const j = await safeJSON(resp); throw new Error((j && j.error)?j.error:`Server ${resp.status}`); }
      const serverBlob = await resp.blob();
      downloadBlob(serverBlob, `server-converted.${formatSel && formatSel.value ? formatSel.value : 'png'}`);
    } catch(err){ console.error('server convert image', err); alert('Server conversion failed: '+(err.message||err)); }
  });

  // run button: if user clicks run, try conversion (prefers server if target not simple)
  on(runBtn, 'click', async ()=>{
    try {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return alert('Choose an image first');
      const desiredFormat = formatSel && formatSel.value ? formatSel.value : 'png';
      // if preview has edited blob and desiredFormat is same family, download
      if (preview._editedBlob && ['png','jpg','jpeg','webp'].includes(desiredFormat)) {
        downloadBlob(preview._editedBlob, `converted.${desiredFormat}`);
        return;
      }
      // otherwise do server conversion
      const fd = new FormData(); fd.append('file', (preview._editedBlob||f), f.name || 'image.png'); fd.append('format', desiredFormat);
      const resp = await fetchWithTimeout(`${API_BASE}/api/convert-image`, { method:'POST', body: fd }, 60000);
      if (!resp.ok) { const j = await safeJSON(resp); throw new Error((j && j.error)?j.error:`Server ${resp.status}`); }
      const blob = await resp.blob(); downloadBlob(blob, `converted.${desiredFormat}`);
    } catch(err){ console.error('image convert run', err); alert('Image conversion failed: '+(err.message||err)); }
  });
})();

/* =========================
   ZIP helpers (create/unpack)
   ========================= */
(function zipInit(){
  const zipInput = $('zip-input') || $('zipInput');
  const createBtn = $('zip-create') || $('zip-create-btn');
  const unpackBtn = $('zip-unpack') || $('zip-unpack-btn');
  const outList = $('zip-output') || $('zip-output-list');

  on(createBtn,'click', async ()=>{
    if (!zipInput || !zipInput.files || zipInput.files.length===0) return alert('Select files to zip.');
    if (typeof JSZip === 'undefined') return alert('JSZip required');
    const zip = new JSZip();
    for (let i=0;i<zipInput.files.length;i++){ const f = zipInput.files[i]; zip.file(f.name, await f.arrayBuffer()); }
    const blob = await zip.generateAsync({ type:'blob' });
    downloadBlob(blob, 'archive.zip');
  });

  on(unpackBtn,'click', async ()=>{
    if (!zipInput || !zipInput.files || zipInput.files.length===0) return alert('Choose a zip file to inspect');
    if (typeof JSZip === 'undefined') return alert('JSZip required');
    try {
      const f = zipInput.files[0]; const z = new JSZip(); const data = await z.loadAsync(await f.arrayBuffer());
      if (outList) outList.innerHTML = '';
      z.forEach(async (rel, file) => {
        if (file.dir) {
          if (outList) { const li=document.createElement('li'); li.textContent = rel+' (dir)'; outList.appendChild(li); }
        } else {
          const blob = await file.async('blob');
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = rel.split('/').pop(); a.textContent = 'Download '+rel.split('/').pop();
          const li = document.createElement('li'); li.appendChild(a);
          if (outList) outList.appendChild(li);
        }
      });
    } catch(err){ console.error('unpack error', err); alert('Failed to unpack zip'); }
  });
})();

/* =========================
   Expose a few global handlers for inline HTML compatibility
   ========================= */
window.handleFileConvert = () => { const btn = $('fc-run') || $('fc-convert') || $('convertBtn'); if (btn) btn.click(); };
window.handleImageConvert = () => { const btn = $('ic-run') || $('image-run') || $('convertBtn'); if (btn) btn.click(); };
window.handleTTSDownload = () => { const btn = $('tts-download') || $('tts-download-btn'); if (btn) btn.click(); };
window.updateWordCounter = () => { const ta = $('wc-input'); if (ta) ta.dispatchEvent(new Event('input')); };

document.addEventListener('DOMContentLoaded', ()=> {
  // seed word counter
  const w = $('wc-input'); if (w) w.dispatchEvent(new Event('input'));
});




     
