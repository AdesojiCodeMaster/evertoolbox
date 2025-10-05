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
   TTS: backend POST + fallback
   Expects server route: POST /api/tts  (JSON { text, lang })
   ========================= */
async function speakTextViaServer() {
  const ta = document.getElementById('tts-input');
  const sel = document.getElementById('tts-voices');
  const out = document.getElementById('tts-output');

  if (!ta) return alert('Text input #tts-input not found in HTML.');
  const text = (ta.value || '').trim();
  if (!text) return alert('Please enter text to convert to speech.');

  const lang = sel ? (sel.value || sel.options[sel.selectedIndex]?.value || 'en') : 'en';

  // Safe defaults if helper exists
  const fetchTimeout = typeof fetchWithTimeout === 'function' ? fetchWithTimeout : async (u, o = {}, t = 20000) => {
    const controller = new AbortController();
    const id = setTimeout(()=>controller.abort(), t);
    try { const r = await fetch(u, { ...o, signal: controller.signal }); clearTimeout(id); return r; }
    catch(e){ clearTimeout(id); throw e; }
  };
  const blobDownloader = typeof downloadBlob === 'function' ? downloadBlob : (b, name) => {
    const a = document.createElement('a');
    const url = URL.createObjectURL(b);
    a.href = url; a.download = name || 'speech.mp3';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),2000);
  };

  // show status
  if (out) out.innerHTML = '<em>Generating audio…</em>';

  try {
    const resp = await fetchTimeout(`${API_BASE}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, lang })
    }, 25000);

    if (!resp.ok) {
      // try to parse JSON error
      let errMsg = `Server returned ${resp.status}`;
      try { const j = await resp.json(); if (j && j.error) errMsg = j.error; } catch(e) {}
      throw new Error(errMsg);
    }

    // ensure response looks like audio
    const ctype = resp.headers.get('content-type') || '';
    if (!/audio|mpeg|ogg|wav|octet/i.test(ctype)) {
      // maybe server returned json error
      const j = await resp.json().catch(()=>null);
      const em = (j && j.error) ? j.error : `Unexpected response content-type: ${ctype}`;
      throw new Error(em);
    }

    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);

    // create audio player + download link
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.src = url;
    try { audio.play().catch(()=>{}); } catch(e){}

    const dl = document.createElement('a');
    dl.href = url;
    dl.download = 'speech.mp3';
    dl.textContent = 'Download MP3';
    dl.style.display = 'inline-block';
    dl.style.marginLeft = '10px';

    if (out) {
      out.innerHTML = '';
      out.appendChild(audio);
      out.appendChild(dl);
    } else {
      // if no designated output container, append to body (non-ideal but safe)
      document.body.appendChild(audio);
      document.body.appendChild(dl);
    }

    // optional: revoke URL after some time when user likely downloaded/played
    setTimeout(()=>URL.revokeObjectURL(url), 60 * 1000);

  } catch (err) {
    console.error('TTS server error:', err);
    // show error
    if (out) out.innerHTML = `<p style="color:red">TTS failed: ${err.message}</p>`;

    // fallback to local speechSynthesis if available
    if ('speechSynthesis' in window) {
      const useLocal = confirm(`TTS server failed: ${err.message}\n\nUse local browser speech (no download) instead?`);
      if (useLocal) {
        try {
          const utter = new SpeechSynthesisUtterance(text);
          const voices = speechSynthesis.getVoices();
          // try to pick a voice with same lang if present
          if (voices && voices.length) {
            const match = voices.find(v => (v.lang && v.lang.toLowerCase().startsWith((sel?.value||'en').toLowerCase().split('-')[0])));
            if (match) utter.voice = match;
          }
          speechSynthesis.cancel();
          speechSynthesis.speak(utter);
          if (out) {
            out.innerHTML = '<p>Playing locally via browser speech synthesis (not downloadable).</p>';
          }
        } catch (e) {
          console.error('Local TTS failed', e);
          alert('Local TTS failed: ' + (e.message || e));
        }
      }
    } else {
      alert('TTS failed and no local speechSynthesis fallback available.');
    }
  }
}

// Attach to button(s) defensively
(function attachTTSButtons(){
  const btn = document.getElementById('tts-speak') || document.getElementById('tts-run') || document.getElementById('tts-play') || document.getElementById('tts-download');
  if (btn) btn.addEventListener('click', (e) => { e.preventDefault(); speakTextViaServer(); });
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
(function fileConverterInit(){
  // Support multiple ID variants to match user's html
  const fileInput = $('fc-file') || $('fc-file-input') || $('fc-filepicker') || $('ic-file') || $('fileInput') || $('file-input');
  const textArea = $('fc-text') || $('fc-textarea') || $('file-text');
  const nameInput = $('fc-name') || $('file-name');
  const formatSel = $('fc-format') || $('fc-format-select') || $('ic-format') || $('file-format');
  const convertBtn = $('fc-run') || $('fc-convert') || $('convertBtn') || $('fc-run-btn') || $('fc-run-btn');
  const outputArea = $('fc-output') || $('fc-output-area') || $('file-output');
  const previewImg = $('fc-output') || $('ic-output') || $('file-preview');

  // dynamic editor panel for images (reused also by image section)
  function createImageEditorPanel(previewEl) {
    // create only once
    if (document.getElementById('ft-image-editor')) return document.getElementById('ft-image-editor');
    const container = document.createElement('div');
    container.id = 'ft-image-editor';
    container.style.marginTop = '10px';
    container.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
        <label>Brightness: <input id="ft-brightness" type="range" min="-100" max="100" value="0"/></label>
        <label>Overlay text: <input id="ft-overlay-text" type="text" placeholder="Text"/></label>
        <label>Text color: <input id="ft-overlay-color" type="color" value="#ffffff"/></label>
        <label>Font size: <input id="ft-font-size" type="number" value="36" style="width:80px"/></label>
        <button id="ft-apply" class="btn">Apply Edits</button>
        <button id="ft-reset" class="btn">Reset</button>
        <button id="ft-download" class="btn">Download Edited Image</button>
        <button id="ft-send-server" class="btn">Send to Server (convert)</button>
      </div>
    `;
    try { previewEl.parentNode.insertBefore(container, previewEl.nextSibling); } catch(e){ document.body.appendChild(container); }
    return container;
  }

  async function fileToText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => resolve(reader.result);
      reader.readAsText(file);
    });
  }

  async function fileToDataURL(file) {
    return new Promise((resolve,reject) => {
      const r = new FileReader();
      r.onerror = reject;
      r.onload = () => resolve(r.result);
      r.readAsDataURL(file);
    });
  }

  // render image on canvas and apply edits -> returns blob
  async function renderImageWithEdits(fileOrDataURL, opts={}) {
    // fileOrDataURL can be File or dataURL string
    return new Promise((resolve,reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onerror = reject;
      img.onload = async () => {
        try {
          // compute scaled dims if opts.width/height specified
          let w = img.width, h = img.height;
          if (opts.maxSize) {
            const s = Math.min(1, opts.maxSize / Math.max(w,h));
            if (s < 1) { w = Math.round(w*s); h = Math.round(h*s); }
          }
          const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);

          // brightness
          if (opts.brightness && opts.brightness !== 0) {
            const imgd = ctx.getImageData(0,0,w,h); const d = imgd.data;
            const delta = parseInt(opts.brightness,10);
            for (let i=0;i<d.length;i+=4){ d[i]=Math.min(255,Math.max(0,d[i]+delta)); d[i+1]=Math.min(255,Math.max(0,d[i+1]+delta)); d[i+2]=Math.min(255,Math.max(0,d[i+2]+delta)); }
            ctx.putImageData(imgd,0,0);
          }

          // overlay
          if (opts.overlayOpacity && opts.overlayOpacity>0) {
            ctx.fillStyle = opts.overlayColor || '#000';
            ctx.globalAlpha = opts.overlayOpacity;
            ctx.fillRect(0,0,w,h);
            ctx.globalAlpha = 1;
          }

          // text
          if (opts.overlayText && opts.overlayText.trim()) {
            ctx.font = `${opts.fontSize||36}px sans-serif`;
            ctx.fillStyle = opts.overlayTextColor || '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(opts.overlayText, w/2, h/2);
          }

          // export as blob
          const mime = (opts.mime || 'image/png');
          canvas.toBlob(blob => {
            if (!blob) return reject(new Error('Failed to create blob'));
            resolve({ blob, dataURL: canvas.toDataURL(mime) });
          }, mime, opts.quality || 0.92);
        } catch(e){ reject(e); }
      };
      if (typeof fileOrDataURL === 'string') img.src = fileOrDataURL; else img.src = URL.createObjectURL(fileOrDataURL);
    });
  }

  // reset preview
  function hidePreview(p) { if (!p) return; p.src=''; p.style.display='none'; }

  if (!convertBtn) return;

  // file selected -> for text files populate textarea for editing; for images show preview and editor
  if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) { if (textArea) textArea.value=''; hidePreview(previewImg); return; }
      // text
      if (f.type.startsWith('text/') || /\.txt$/i.test(f.name)) {
        // load into textarea so user can edit before converting/downloading
        if (textArea) {
          try {
            const txt = await fileToText(f);
            textArea.value = txt;
            if (outputArea) outputArea.innerHTML = `<p>Text file loaded. Edit below then click Convert.</p>`;
          } catch(err) { console.error('read text failed', err); }
        }
        hidePreview(previewImg);
        return;
      }
      // image
      if (f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(f.name)) {
        try {
          const dataUrl = await fileToDataURL(f);
          if (previewImg) { previewImg.src = dataUrl; previewImg.style.display='block'; }
          // ensure image editor UI exists
          const editor = createImageEditorPanel(previewImg);
          // attach editor controls
          attachImageEditorHandlers(editor, f);
        } catch(err) { console.error('image preview failed', err); }
        if (outputArea) outputArea.innerHTML = '<p>Image loaded. Use editor to adjust before download or server convert.</p>';
        return;
      }
      // other files
      hidePreview(previewImg);
      if (outputArea) outputArea.innerHTML = `<p>File loaded: ${f.name} (${Math.round(f.size/1024)} KB). Select a target format and click Convert (server conversion required for some formats).</p>`;
    });
  }

  // attach editor handlers - created per-file context (replaces redundant listeners)
  function attachImageEditorHandlers(editorEl, originalFile) {
    if (!editorEl) return;
    const brightnessEl = $('ft-brightness');
    const overlayTextEl = $('ft-overlay-text');
    const overlayColorEl = $('ft-overlay-color');
    const fontSizeEl = $('ft-font-size');
    const applyBtn = $('ft-apply');
    const resetBtn = $('ft-reset');
    const downloadBtn = $('ft-download');
    const sendServerBtn = $('ft-send-server');

    // Store last preview dataURL for reset
    let lastOriginalDataURL = null;
    (async()=>{
      try { lastOriginalDataURL = await fileToDataURL(originalFile); } catch(e){console.error(e);}
    })();

    on(applyBtn, 'click', async ()=>{
      try {
        const opts = {
          brightness: brightnessEl ? parseInt(brightnessEl.value||'0',10) : 0,
          overlayText: overlayTextEl ? overlayTextEl.value : '',
          overlayTextColor: overlayColorEl ? overlayColorEl.value : '#fff',
          overlayColor: '#000000',
          overlayOpacity: 0,
          fontSize: fontSizeEl ? parseInt(fontSizeEl.value||'36',10) : 36,
          mime: 'image/png',
          quality: 0.92,
          maxSize: 2000
        };
        const res = await renderImageWithEdits(lastOriginalDataURL || originalFile, opts);
        if (previewImg) { previewImg.src = res.dataURL; previewImg.style.display='block'; }
        if (outputArea) outputArea.innerHTML = `<p>Edits applied. Click Download Edited Image to save locally or "Send to Server (convert)" for backend conversion.</p>`;
        // save produced blob in element for download/send
        previewImg._editedBlob = res.blob;
      } catch(err){ console.error('apply edits failed', err); alert('Apply edits failed'); }
    });
    on(resetBtn, 'click', ()=>{
      if (lastOriginalDataURL) previewImg.src = lastOriginalDataURL;
      previewImg._editedBlob = null;
      if (outputArea) outputArea.innerHTML = `<p>Reset to original.</p>`;
    });
    on(downloadBtn, 'click', async ()=>{
      try {
        let blob = previewImg._editedBlob;
        if (!blob) {
          // produce blob from current preview or original
          const dataURL = previewImg.src || (lastOriginalDataURL || '');
          if (!dataURL) return alert('No edited image available to download.');
          const res = await fetch(dataURL); blob = await res.blob();
        }
        downloadBlob(blob, `image-edited.png`);
      } catch(err){ console.error('download edited failed', err); alert('Download failed'); }
    });
    on(sendServerBtn, 'click', async ()=>{
      try {
        let blob = previewImg._editedBlob;
        if (!blob) {
          if (!previewImg.src) return alert('No edited image to send.');
          const res = await fetch(previewImg.src); blob = await res.blob();
        }
        // prepare formdata and send to server for conversion using selected target format
        const fd = new FormData();
        fd.append('file', blob, (originalFile && originalFile.name) ? originalFile.name : 'edited.png');
        const targetFormat = formatSel && formatSel.value ? formatSel.value : 'png';
        fd.append('format', targetFormat);
        // attach any extra options if available
        const resp = await fetchWithTimeout(`${API_BASE}/api/convert-image`, { method:'POST', body: fd }, 30000);
        if (!resp.ok) { const j = await safeJSON(resp); throw new Error((j && j.error) ? j.error : `Server ${resp.status}`); }
        const serverBlob = await resp.blob();
        downloadBlob(serverBlob, `server-converted.${targetFormat}`);
      } catch(err){ console.error('send server failed', err); alert('Server conversion failed: '+(err.message||err)); }
    });
  }

  // do conversion handler (top-level)
  on(convertBtn, 'click', async ()=>{
    try {
      const f = fileInput && fileInput.files && fileInput.files[0];
      const target = formatSel && formatSel.value ? formatSel.value : null;
      // If user edited text area and wants to convert text -> create blob from textarea
      if (textArea && textArea.value && (!f || (f && (f.type.startsWith('text/') || /\.txt$/i.test(f.name))))) {
        const name = (nameInput && nameInput.value) ? nameInput.value : (f ? f.name.replace(/\.[^/.]+$/,'')+'.txt' : 'document.txt');
        const textBlob = new Blob([textArea.value], { type: 'text/plain' });
        // if target is 'pdf' or other, send to server
        if (target && target !== 'txt') {
          const fd = new FormData(); fd.append('file', textBlob, name); fd.append('targetExt', target.startsWith('.')?target:`.${target}`);
          const resp = await fetchWithTimeout(`${API_BASE}/api/convert-doc`, { method:'POST', body: fd }, 300000);
          if (!resp.ok) { const j = await safeJSON(resp); throw new Error((j && j.error) ? j.error : `Server ${resp.status}`); }
          const blob = await resp.blob(); downloadBlob(blob, (name.replace(/\.[^/.]+$/,'') + (target.startsWith('.')?target:`.${target}`)));
          if (outputArea) outputArea.innerHTML = `<p>Server conversion completed.</p>`;
        } else {
          // just download txt
          downloadBlob(textBlob, name);
        }
        return;
      }

      // If file exists and is image -> prefer client-side edit or create blob then possibly server convert
      if (f && f.type.startsWith('image/')) {
        // if preview has edited blob, download it locally or send to server depending on target
        const previewEditedBlob = (previewImg && previewImg._editedBlob) ? previewImg._editedBlob : null;
        if (!target || target === 'png' || target === 'jpg' || target === 'jpeg' || target==='webp') {
          // if user edited, download edited; otherwise client convert using canvas
          if (previewEditedBlob) { downloadBlob(previewEditedBlob, `image-edited.${target||'png'}`); return; }
          // try client conversion
          try {
            const { blob } = await renderImageWithEdits(f, { mime: `image/${target||'png'}`, quality: 0.92, maxSize: 2000 });
            downloadBlob(blob, `converted.${target||'png'}`);
            return;
          } catch(e) { console.warn('client image convert failed, will try server', e); }
        }
        // fallback to server convert
        const fd = new FormData(); fd.append('file', previewEditedBlob || f); fd.append('targetExt', target? (target.startsWith('.')?target:`.${target}`) : '.png');
        const resp = await fetchWithTimeout(`${API_BASE}/api/convert-doc`, { method:'POST', body: fd }, 300000);
        if (!resp.ok) { const j = await safeJSON(resp); throw new Error((j && j.error)?j.error:`Server ${resp.status}`); }
        const blob = await resp.blob(); downloadBlob(blob, `converted.${target||'out'}`);
        return;
      }

      // Other generic files -> prefer server conversion (docx,pdf,etc)
      if (f) {
        if (!target) return alert('Choose a target format for conversion.');
        const fd = new FormData(); fd.append('file', f); fd.append('targetExt', target.startsWith('.')?target:`.${target}`);
        const resp = await fetchWithTimeout(`${API_BASE}/api/convert-doc`, { method:'POST', body: fd }, 300000);
        if (!resp.ok) { const j = await safeJSON(resp); throw new Error((j && j.error)?j.error:`Server ${resp.status}`); }
        const blob = await resp.blob(); downloadBlob(blob, f.name.replace(/\.[^/.]+$/,'') + (target.startsWith('.')?target:`.${target}`));
        return;
      }

      alert('No file or editable text found to convert.');
    } catch(err) { console.error('convert error',err); alert('Conversion failed: '+(err.message||err)); }
  });

})(); // end fileConverterInit

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
   
