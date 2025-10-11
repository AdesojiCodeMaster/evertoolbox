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


// === FILE CONVERTER + COMPRESSOR TOOL ===
// Lazy-load trigger (tool only initializes when visible)
document.addEventListener("DOMContentLoaded", () => {
  const tool = document.getElementById("fileConverterTool");
  if (!tool) return;
  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      initFileConverterTool();
      observer.disconnect();
    }
  });
  observer.observe(tool);
});

function initFileConverterTool() {
  const uploadInput = document.getElementById("fileInput");
  const formatSelect = document.getElementById("formatSelect");
  const qualityInput = document.getElementById("qualityInput");
  const convertBtn = document.getElementById("convertBtn");
  const resultDiv = document.getElementById("result");

  let selectedFile = null;

  uploadInput.addEventListener("change", (e) => {
    selectedFile = e.target.files[0];
    if (selectedFile) {
      resultDiv.textContent = `Selected: ${selectedFile.name} (${(selectedFile.size / 1024 / 1024).toFixed(2)} MB)`;
    }
  });

  convertBtn.addEventListener("click", async () => {
    if (!selectedFile) return alert("Please upload a file first.");

    const targetFormat = formatSelect.value;
    const ext = selectedFile.name.split(".").pop().toLowerCase();
    if (ext === targetFormat.toLowerCase())
      return alert("File is already in the selected format.");

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("targetFormat", targetFormat);
    formData.append("quality", qualityInput.value || 70);

    resultDiv.textContent = "Processing file... ⏳";

    try {
      const res = await fetch("https://evertoolbox-backend.onrender.com/api/tools/file/process", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Conversion failed.");

      // Extract filename from Content-Disposition
      const disposition = res.headers.get("Content-Disposition");
      const filenameMatch = disposition && disposition.match(/filename="(.+)"/);
      const filename = filenameMatch ? filenameMatch[1] : `converted.${targetFormat}`;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.textContent = "Download Converted File";
      link.className = "download-btn";

      resultDiv.innerHTML = "";
      resultDiv.appendChild(link);
    } catch (err) {
      console.error(err);
      resultDiv.textContent = "❌ Error converting file.";
    }
  });
}
   



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





