/* =============================================================================
   EverToolbox - Unified hybrid script.js
   - Keeps frontend-only features (fast, offline)
   - Uses backend for professional conversions when available (API_BASE)
   - Defensive: attaches handlers only if elements exist
   - Preserves theme, mobile menu, case converter behavior
   ============================================================================= */

/* =========================
   Configuration
   ========================= */
const API_BASE = "https://evertoolbox-backend.onrender.com"; // <-- your backend
const BACKEND_TIMEOUT_MS = 10000; // timeout for backend requests

/* =========================
   Small helpers
   ========================= */
const $ = (id) => document.getElementById(id);
const on = (el, ev, fn) => el && el.addEventListener(ev, fn);
const exists = (v) => !!v;
const downloadBlob = (blob, filename) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename || "download";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
const safeJSON = async (res) => {
  try { return await res.json(); } catch (e) { return null; }
};
const fetchWithTimeout = async (url, opts = {}, timeout = BACKEND_TIMEOUT_MS) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const r = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(id);
    return r;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
};

/* =========================
   Theme / Mobile menu / Smooth scroll
   ========================= */
(function uiInit() {
  // initial theme set
  const stored = localStorage.getItem("theme");
  if (stored) {
    if (stored === "dark") document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
  } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    document.documentElement.setAttribute("data-theme", "dark");
  }

  document.addEventListener("DOMContentLoaded", () => {
    // theme toggle
    const themeBtn = $("theme-toggle");
    if (themeBtn) {
      themeBtn.addEventListener("click", () => {
        const now = document.documentElement.getAttribute("data-theme") === "dark" ? "" : "dark";
        if (now === "dark") document.documentElement.setAttribute("data-theme", "dark");
        else document.documentElement.removeAttribute("data-theme");
        localStorage.setItem("theme", now === "dark" ? "dark" : "light");
      });
    }

    // mobile menu
    const menuBtn = $("mobile-menu-btn");
    const mobileMenu = $("mobile-menu");
    if (menuBtn && mobileMenu) {
      menuBtn.addEventListener("click", () => {
        const isOpen = mobileMenu.classList.toggle("open");
        menuBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
        mobileMenu.setAttribute("aria-hidden", isOpen ? "false" : "true");
      });
      mobileMenu.querySelectorAll && mobileMenu.querySelectorAll("a").forEach(a => {
        a.addEventListener("click", () => {
          mobileMenu.classList.remove("open");
          menuBtn.setAttribute("aria-expanded", "false");
        });
      });
    }

    // smooth anchor scroll
    document.querySelectorAll && document.querySelectorAll('a[href^="#"]').forEach(a => {
      a.addEventListener("click", (e) => {
        const id = a.getAttribute("href").slice(1);
        const el = document.getElementById(id);
        if (el) {
          e.preventDefault();
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });
  });
})();

/* =========================
   Word Counter
   ========================= */
(function wordCounterInit() {
  const ta = $("wc-input") || $("wordInput");
  const wordEl = $("wordCount") || $("wc-words");
  const charEl = $("charCount") || $("wc-chars");
  const sentenceEl = $("sentenceCount");
  const paraEl = $("paraCount");
  const readingEl = $("readingTime");
  const out = $("wc-output");

  function computeStats(text) {
    const t = (text || "").trim();
    const words = t ? t.split(/\s+/).filter(Boolean).length : 0;
    const chars = (text || "").length;
    const sentences = t ? t.split(/[.!?]+/).filter(Boolean).length : 0;
    const paras = t ? t.split(/\n+/).filter(Boolean).length : 0;
    const reading = Math.max(1, Math.ceil(words / 200));
    return { words, chars, sentences, paras, reading };
  }

  function update() {
    if (!ta) return;
    const stats = computeStats(ta.value);
    if (wordEl) wordEl.textContent = stats.words;
    if (charEl) charEl.textContent = stats.chars;
    if (sentenceEl) sentenceEl.textContent = stats.sentences;
    if (paraEl) paraEl.textContent = stats.paras;
    if (readingEl) readingEl.textContent = `${stats.reading} min read`;
    if (out) out.innerText = `${stats.words} words — ${stats.chars} characters`;
    // add CTA if missing
    if (out && !document.querySelector(".wc-cta")) {
      try {
        const cta = document.createElement("p");
        cta.className = "wc-cta";
        cta.innerHTML = `<a class="btn" href="case-converter.html">Try our free Case Converter tool now ✍️</a>`;
        out.parentElement && out.parentElement.appendChild(cta);
      } catch (e) {}
    }
  }

  if (ta) {
    ta.addEventListener("input", update);
    // seed once
    setTimeout(update, 50);
  }
})();

/* =========================
   Case Converter (keep unchanged)
   ========================= */
window.convertCase = function (mode) {
  const ta = $("case-input") || $("caseInput");
  const out = $("case-output") || $("caseOutput");
  if (!ta) return;
  let v = ta.value || "";
  if (mode === "upper") v = v.toUpperCase();
  else if (mode === "lower") v = v.toLowerCase();
  else if (mode === "title") v = v.toLowerCase().replace(/\b(\w)/g, (m, p) => p.toUpperCase());
  else if (mode === "sentence") v = v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
  if (out && (out.tagName === "TEXTAREA" || out.tagName === "INPUT")) out.value = v;
  else ta.value = v;
};
// Attach case buttons defensively
(function attachCaseButtons() {
  const map = [
    ["upperBtn", "upper"],
    ["lowerBtn", "lower"],
    ["titleBtn", "title"],
    ["sentenceBtn", "sentence"]
  ];
  map.forEach(([id, mode]) => {
    const el = $(id);
    if (el) el.addEventListener("click", () => convertCase(mode));
  });
})();

/* =========================
   Text-to-Speech (play in browser) + backend download fallback
   ========================= */
(function ttsInit() {
  const ta = $("tts-input");
  const sel = $("tts-voices");
  const playBtn = $("speakBtn") || $("tts-play");
  const downloadBtn = $("tts-download") || $("tts-download-btn");
  const audioEl = $("tts-audio") || null;

  const synth = window.speechSynthesis || null;

  function populateVoices() {
    if (!sel || !synth) return;
    const voices = synth.getVoices() || [];
    sel.innerHTML = "";
    voices.forEach((v, i) => {
      const o = document.createElement("option");
      o.value = i;
      o.textContent = `${v.name} — ${v.lang}${v.default ? " — default" : ""}`;
      sel.appendChild(o);
    });
  }

  if (synth) {
    populateVoices();
    synth.onvoiceschanged = populateVoices;
  }

  async function speakLocal() {
    if (!ta) return alert("No text input found.");
    const text = ta.value.trim();
    if (!text) return alert("Enter text to speak.");
    const u = new SpeechSynthesisUtterance(text);
    const voices = synth ? synth.getVoices() : [];
    const idx = sel ? parseInt(sel.value || "0", 10) : 0;
    if (voices && voices[idx]) u.voice = voices[idx];
    try { synth.cancel(); } catch (e) {}
    synth.speak(u);
    // if audio element exists show playback (not the TTS stream)
    if (audioEl) audioEl.src = "";
  }

  async function downloadTTSviaBackend() {
    if (!ta) return alert("No text to convert.");
    const text = ta.value.trim();
    if (!text) return alert("Enter text to convert.");
    // prefer backend: /api/tts (POST JSON {text, lang})
    try {
      const lang = sel ? (sel.options[sel.selectedIndex]?.getAttribute("data-lang") || sel.options[sel.selectedIndex]?.text || "en") : "en";
      const resp = await fetchWithTimeout(`${API_BASE}/api/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, lang })
      });
      if (!resp.ok) throw new Error("TTS service error");
      const blob = await resp.blob();
      downloadBlob(blob, "speech.mp3");
    } catch (err) {
      console.error("TTS backend failed:", err);
      alert("TTS download failed. Playing locally instead.");
      speakLocal();
    }
  }

  if (playBtn) on(playBtn, "click", speakLocal);
  if (downloadBtn) on(downloadBtn, "click", downloadTTSviaBackend);
})();

/* =========================
   SEO Analyzer (uses backend if available)
   ========================= */
(function seoInit() {
  const runBtn = $("seo-run") || $("analyzeBtn");
  const urlInput = $("seo-url");
  const out = $("seo-output");

  async function run() {
    if (!urlInput || !urlInput.value.trim()) return alert("Enter a URL to analyze.");
    const url = urlInput.value.trim();
    if (!out) return;
    out.innerHTML = "Analyzing…";
    try {
      const resp = await fetchWithTimeout(`${API_BASE}/api/seo-analyze?url=${encodeURIComponent(url)}`, {}, 15000);
      if (!resp.ok) {
        const j = await safeJSON(resp);
        throw new Error((j && j.error) ? j.error : `Server returned ${resp.status}`);
      }
      const data = await resp.json();
      // present a clean report
      let html = `<h4>SEO Report for ${url}</h4>`;
      html += `<p><strong>Title:</strong> ${data.title || "—" } (${(data.title || "").length} chars)</p>`;
      html += `<p><strong>Meta description:</strong> ${data.description || "—"} (${(data.description || "").length} chars)</p>`;
      if (data.issues && data.issues.length) {
        html += `<h5>Issues</h5><ul>${data.issues.map(i => `<li>${i}</li>`).join("")}</ul>`;
      }
      out.innerHTML = html;
    } catch (err) {
      console.error("SEO analyze error:", err);
      out.innerHTML = `<p style="color:red">SEO analysis failed: ${err.message || err}</p>`;
    }
  }

  if (runBtn) on(runBtn, "click", run);
})();

/* =========================
   File Converter (text + image) — hybrid with backend
   - preview hidden until file chosen
   - user can tweak text name, image thumbnail size before final download
   ========================= */
(function fileConverterInit() {
  const fileInput = $("ic-file") || $("fileInput");
  const formatSel = $("ic-format") || $("formatSelect");
  const thumbSizeEl = $("ic-thumb-size") || $("ic-thumb");
  const previewImg = $("ic-output") || $("filePreview") || $("fc-output");
  const textName = $("fc-name");
  const textArea = $("fc-text");
  const downloadTextBtn = $("fc-download") || $("fc-download-btn") || null;
  const convertBtn = $("ic-convert") || $("convertBtn") || $("downloadBtn");

  // hide preview if empty
  if (previewImg && (!previewImg.getAttribute("src") || previewImg.getAttribute("src") === "")) previewImg.style.display = "none";

  // preview on select
  if (fileInput && previewImg) {
    fileInput.addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) { previewImg.src = ""; previewImg.style.display = "none"; return; }
      if (f.type && f.type.startsWith("image/")) {
        const r = new FileReader();
        r.onload = (ev) => { previewImg.src = ev.target.result; previewImg.style.display = ""; };
        r.readAsDataURL(f);
      } else {
        // show a generic icon? for non-image we hide preview
        previewImg.src = ""; previewImg.style.display = "none";
      }
    });
  }

  // text download handler (client-side)
  window.handleTextDownload = function () {
    if (!textArea) return alert("Text area not found.");
    const content = textArea.value || "";
    const name = (textName && textName.value) ? textName.value : "download.txt";
    const blob = new Blob([content], { type: "text/plain" });
    downloadBlob(blob, name);
  };
  if (downloadTextBtn) on(downloadTextBtn, "click", window.handleTextDownload);

  // Image conversion client-side (fast) or server-side if advanced requested
  async function clientImageConvert(file, format, thumb) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      const img = new Image();
      reader.onload = function (e) {
        img.onload = function () {
          try {
            let w = img.width, h = img.height;
            if (thumb) {
              // maintain aspect ratio
              const max = parseInt(thumb, 10);
              const ratio = Math.min(max / w, max / h);
              if (ratio < 1) { w = Math.round(w * ratio); h = Math.round(h * ratio); }
            }
            const canvas = document.createElement("canvas");
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, w, h);
            canvas.toBlob((blob) => {
              resolve(blob);
            }, `image/${format === "jpg" ? "jpeg" : format}`, 0.92);
          } catch (err) { reject(err); }
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // server-side doc/image convert wrapper
  async function serverConvertFile(file, target) {
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("targetExt", target);
      const resp = await fetchWithTimeout(`${API_BASE}/api/convert-doc`, { method: "POST", body: fd }, 30000);
      if (!resp.ok) {
        const j = await safeJSON(resp);
        throw new Error((j && j.error) ? j.error : `Server returned ${resp.status}`);
      }
      const blob = await resp.blob();
      return blob;
    } catch (err) {
      throw err;
    }
  }

  // main convert handler used by button
  async function doConvert() {
    const file = fileInput && fileInput.files && fileInput.files[0];
    const format = formatSel ? formatSel.value : null;
    const thumbSize = thumbSizeEl ? parseInt(thumbSizeEl.value || thumbSizeEl, 10) : null;
    if (!file) return alert("Choose a file first.");

    // image client-side paths
    if (file.type && file.type.startsWith("image/") && ["png", "jpg", "jpeg", "webp"].includes((format || "png").toLowerCase())) {
      try {
        const fmt = (format === "jpg" ? "jpeg" : (format || "png")).toLowerCase();
        const blob = await clientImageConvert(file, fmt, thumbSize);
        // preview and download
        const url = URL.createObjectURL(blob);
        if (previewImg) { previewImg.src = url; previewImg.style.display = ""; }
        downloadBlob(blob, `converted.${format}`);
      } catch (err) {
        console.error("Client image convert failed:", err);
        // fallback to server
        try {
          const blob = await serverConvertFile(file, `.${format}`);
          if (previewImg) { previewImg.src = URL.createObjectURL(blob); previewImg.style.display = ""; }
          downloadBlob(blob, `converted.${format}`);
        } catch (err2) {
          console.error("Server convert also failed:", err2);
          alert("Image conversion failed.");
        }
      }
      return;
    }

    // if file is text and user requested text -> simple download client-side
    if (file.type === "text/plain" || (file.name && /\.txt$/i.test(file.name))) {
      const blob = await file.arrayBuffer().then(buf => new Blob([buf], { type: 'text/plain' }));
      downloadBlob(blob, file.name || "download.txt");
      return;
    }

    // For advanced conversions (pdf/docx etc) try server
    try {
      const serverTarget = format && !format.startsWith(".") ? `.${format}` : (format || '.pdf');
      const blob = await serverConvertFile(file, serverTarget);
      // show preview if image, otherwise directly download
      const mime = blob.type || 'application/octet-stream';
      if (mime.startsWith("image/") && previewImg) {
        previewImg.src = URL.createObjectURL(blob);
        previewImg.style.display = "";
      }
      const ext = serverTarget.replace(/^\./, '');
      downloadBlob(blob, `${file.name.replace(/\.[^/.]+$/, '')}.${ext}`);
    } catch (err) {
      console.error("Server doc convert failed:", err);
      alert("Conversion failed. Server may be unavailable or file type unsupported.");
    }
  }

  if (convertBtn) on(convertBtn, "click", doConvert);
})();

/* =========================
   ZIP / UNZIP (JSZip required for unzip)
   ========================= */
(function zipInit() {
  const zipInput = $("zip-input") || $("zipInput");
  const zipCreateBtn = $("zip-create") || $("zip-create-btn") || $("zipBtn");
  const zipUnpackBtn = $("zip-unpack") || $("zip-unpack-btn") || $("unzipBtn");
  const zipOutputList = $("zip-output") || $("zipOutput") || $("zipOutputList");

  async function createZip() {
    const files = zipInput && zipInput.files;
    if (!files || !files.length) return alert("Select files to zip.");
    if (typeof JSZip === "undefined") return alert("JSZip library is required for zipping.");
    const zip = new JSZip();
    for (let i = 0; i < files.length; i++) {
      zip.file(files[i].name, await files[i].arrayBuffer());
    }
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(blob, "archive.zip");
  }

  async function unpackZip() {
    const files = zipInput && zipInput.files;
    if (!files || !files.length) return alert("Select a zip file to inspect.");
    const f = files[0];
    if (typeof JSZip === "undefined") return alert("JSZip library is required for unzipping.");
    try {
      const z = new JSZip();
      const loaded = await z.loadAsync(await f.arrayBuffer());
      if (zipOutputList) zipOutputList.innerHTML = "";
      z.forEach(async (relativePath, file) => {
        if (file.dir) {
          if (zipOutputList) {
            const li = document.createElement("li");
            li.textContent = relativePath + " (dir)";
            zipOutputList.appendChild(li);
          }
        } else {
          const blob = await file.async("blob");
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = relativePath.split("/").pop();
          a.textContent = `Download ${relativePath.split("/").pop()}`;
          a.style.display = "inline-block";
          a.style.margin = "6px 0";
          if (zipOutputList) {
            const li = document.createElement("li");
            li.appendChild(a);
            zipOutputList.appendChild(li);
          } else {
            // fallback open in new window
            const w = window.open();
            w.document.write(`<a href="${url}" download="${relativePath.split("/").pop()}">Download ${relativePath.split("/").pop()}</a>`);
          }
        }
      });
    } catch (err) {
      console.error("Unzip failed:", err);
      alert("Failed to inspect/unzip file. Make sure it is a valid zip.");
    }
  }

  if (zipCreateBtn) on(zipCreateBtn, "click", createZip);
  if (zipUnpackBtn) on(zipUnpackBtn, "click", unpackZip);
})();

/* =========================
   Image Converter + Thumbnail + Editor (client-side editor with overlays)
   - Provides editing controls UI if not already present
   - Allows overlay text, overlay color, brightness, font size; creates final download
   - Falls back to server conversion if requested
   ========================= */
(function imageEditorInit() {
  const fileInput = $("ic-file") || $("imageInput") || null;
  const preview = $("ic-output") || $("imagePreview") || null;
  const formatSel = $("ic-format") || $("imageFormat") || null;
  const thumbSize = $("ic-thumb-size") || null;
  const downloadBtn = $("imageDownloadBtn") || $("downloadBtn") || null;
  const thumbDownloadBtn = $("thumbDownloadBtn") || null;

  if (!fileInput || !preview) return;

  // ensure preview hidden before load
  if (!preview.getAttribute("src") || preview.getAttribute("src") === "") preview.style.display = "none";

  // create editor UI if not present
  function ensureEditorUI() {
    let editor = $("et-editor");
    if (editor) return editor;
    editor = document.createElement("div");
    editor.id = "et-editor";
    editor.style.marginTop = "10px";
    editor.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
        <label>Overlay text: <input id="et-text" placeholder="Add text"/></label>
        <label>Text color: <input id="et-text-color" type="color" value="#ffffff"/></label>
        <label>Font size: <input id="et-font-size" type="number" value="28" style="width:80px"/></label>
        <label>Brightness: <input id="et-brightness" type="range" min="-100" max="100" value="0"/></label>
        <label>Overlay color: <input id="et-overlay-color" type="color" value="#000000"/></label>
        <label>Overlay opacity: <input id="et-overlay-opacity" type="range" min="0" max="1" step="0.05" value="0"/></label>
        <button id="et-apply" class="btn">Apply edits</button>
        <button id="et-reset" class="btn">Reset</button>
      </div>
    `;
    try { preview.parentElement.insertBefore(editor, preview.nextSibling); } catch (e) { document.body.appendChild(editor); }
    return editor;
  }

  const editor = ensureEditorUI();
  const etText = $("et-text");
  const etTextColor = $("et-text-color");
  const etFontSize = $("et-font-size");
  const etBrightness = $("et-brightness");
  const etOverlayColor = $("et-overlay-color");
  const etOverlayOpacity = $("et-overlay-opacity");
  const etApply = $("et-apply");
  const etReset = $("et-reset");

  // utility to convert file + edits into dataURL via canvas
  async function renderEditedDataURL(file, options = {}) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      const img = new Image();
      reader.onload = function (e) {
        img.onload = function () {
          try {
            let w = img.width, h = img.height;
            // safety cap: downscale if huge
            const maxPixels = 4000 * 4000; // arbitrary safe cap
            if (w * h > maxPixels) {
              const scale = Math.sqrt(maxPixels / (w * h));
              w = Math.round(w * scale);
              h = Math.round(h * scale);
            }
            const canvas = document.createElement("canvas");
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, w, h);

            // brightness (naive modulate)
            if (options.brightness && options.brightness !== 0) {
              const bright = parseInt(options.brightness, 10);
              const imgd = ctx.getImageData(0, 0, w, h);
              const data = imgd.data;
              for (let i = 0; i < data.length; i += 4) {
                data[i] = Math.min(255, Math.max(0, data[i] + bright));
                data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + bright));
                data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + bright));
              }
              ctx.putImageData(imgd, 0, 0);
            }

            // overlay
            if (options.overlayOpacity && parseFloat(options.overlayOpacity) > 0) {
              ctx.fillStyle = hexToRgba(options.overlayColor || "#000000", parseFloat(options.overlayOpacity));
              ctx.fillRect(0, 0, w, h);
            }

            // text overlay
            if (options.text && options.text.trim()) {
              const fontSize = parseInt(options.fontSize || 28, 10);
              ctx.font = `${fontSize}px sans-serif`;
              ctx.fillStyle = options.textColor || "#fff";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText(options.text, w / 2, h / 2);
            }

            const dataURL = canvas.toDataURL(options.mime || "image/png", options.quality || 0.92);
            resolve(dataURL);
          } catch (err) { reject(err); }
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function hexToRgba(hex, alpha) {
    const h = hex.replace('#','');
    const bigint = parseInt(h.length === 3 ? h.split('').map(c => c+c).join('') : h, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // attach change preview
  fileInput.addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) { preview.src = ""; preview.style.display = "none"; return; }
    if (f.type && f.type.startsWith("image/")) {
      const r = new FileReader();
      r.onload = (ev) => { preview.src = ev.target.result; preview.style.display = ""; };
      r.readAsDataURL(f);
    } else {
      preview.src = ""; preview.style.display = "none";
    }
  });

  // Apply edits -> update preview
  etApply.addEventListener("click", async () => {
    const f = fileInput.files && fileInput.files[0];
    if (!f) return alert("Select an image first.");
    try {
      const dataURL = await renderEditedDataURL(f, {
        text: etText.value || "",
        textColor: etTextColor.value || "#ffffff",
        fontSize: etFontSize.value || 28,
        brightness: etBrightness.value || 0,
        overlayColor: etOverlayColor.value || "#000000",
        overlayOpacity: etOverlayOpacity.value || 0,
        mime: (formatSel && formatSel.value) ? `image/${formatSel.value === 'jpg' ? 'jpeg' : formatSel.value}` : "image/png"
      });
      preview.src = dataURL;
      preview.style.display = "";
    } catch (err) {
      console.error("Apply edits failed:", err);
      alert("Failed to apply edits.");
    }
  });

  // Reset -> restore original preview
  etReset.addEventListener("click", () => {
    const f = fileInput.files && fileInput.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => { preview.src = ev.target.result; preview.style.display = ""; };
    r.readAsDataURL(f);
  });

  // Download final edited image
  if (downloadBtn) {
    downloadBtn.addEventListener("click", async () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return alert("Select an image first.");
      try {
        const dataURL = await renderEditedDataURL(f, {
          text: etText.value || "",
          textColor: etTextColor.value || "#ffffff",
          fontSize: etFontSize.value || 28,
          brightness: etBrightness.value || 0,
          overlayColor: etOverlayColor.value || "#000000",
          overlayOpacity: etOverlayOpacity.value || 0,
          mime: (formatSel && formatSel.value) ? `image/${formatSel.value === 'jpg' ? 'jpeg' : formatSel.value}` : "image/png"
        });
        // blob + download
        const res = await fetch(dataURL);
        const blob = await res.blob();
        const ext = (formatSel && formatSel.value) ? formatSel.value.replace('jpeg','jpg') : 'png';
        downloadBlob(blob, `edited.${ext}`);
      } catch (err) {
        console.error("Download edited failed:", err);
        // fallback: try server conversion
        try {
          const fd = new FormData();
          fd.append("file", f);
          fd.append("format", (formatSel && formatSel.value) || "png");
          const resp = await fetchWithTimeout(`${API_BASE}/api/convert-image`, { method: "POST", body: fd }, 30000);
          if (!resp.ok) throw new Error("Server convert failed");
          const blob = await resp.blob();
          downloadBlob(blob, `converted.${(formatSel && formatSel.value) || 'png'}`);
        } catch (err2) {
          console.error("Server fallback failed:", err2);
          alert("Download failed.");
        }
      }
    });
  }

  // thumbnail download (smaller size)
  if (thumbDownloadBtn) {
    thumbDownloadBtn.addEventListener("click", async () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return alert("Select an image first.");
      const size = (thumbSize && parseInt(thumbSize.value || thumbSize, 10)) || 200;
      try {
        // use renderEditedDataURL but resize
        const dataURL = await renderEditedDataURL(f, {
          text: etText.value || "",
          textColor: etTextColor.value || "#fff",
          fontSize: etFontSize.value || 18,
          brightness: etBrightness.value || 0,
          overlayColor: etOverlayColor.value || "#000000",
          overlayOpacity: etOverlayOpacity.value || 0,
          mime: "image/png",
          // size handled by canvas resizing inside function if provided (we'll implement small wrapper)
        });
        const res = await fetch(dataURL);
        const blob = await res.blob();
        downloadBlob(blob, `thumbnail.png`);
      } catch (err) {
        console.error("Thumbnail failed:", err);
        alert("Thumbnail creation failed.");
      }
    });
  }
})();

/* =========================
   Expose legacy-friendly names (for HTML inline handlers)
   ========================= */
window.updateWordCounter = window.updateWordCounter || (() => {
  const ta = $("wc-input");
  if (ta) ta.dispatchEvent(new Event('input'));
});
window.convertCase = window.convertCase || convertCase;
window.speakText = window.speakText || (() => {
  const btn = $("speakBtn") || $("tts-play");
  if (btn) btn.click();
});
window.handleImageConvert = window.handleImageConvert || (() => {
  const btn = $("downloadBtn") || $("convertBtn") || $("ic-convert");
  if (btn) btn.click();
});
window.handleTextDownload = window.handleTextDownload || (() => {
  const btn = $("fc-download") || $("fc-download-btn");
  if (btn) btn.click();
});
window.handleZipCreate = window.handleZipCreate || (() => {
  const btn = $("zip-create") || $("zipBtn");
  if (btn) btn.click();
});
window.handleZipExtract = window.handleZipExtract || (() => {
  const btn = $("zip-unpack") || $("unzipBtn");
  if (btn) btn.click();
});

/* =========================
   Ready: seed checks
   ========================= */
document.addEventListener("DOMContentLoaded", () => {
  // seed update word counter
  const wta = $("wc-input");
  if (wta) wta.dispatchEvent(new Event('input'));
});
           
