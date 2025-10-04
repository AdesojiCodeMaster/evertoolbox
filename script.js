/* EverToolbox - Unified script.js
   Replace the root script.js with this file.
   - Preserves UI (theme/menu)
   - Implements/fixes the tools: word-counter, case-converter, tts, seo, file-converter, zip/unzip, image tools
   - Defensive: only attaches handlers when elements exist
*/

(function () {
  "use strict";

  // --- utilities ---
  const $ = (id) => document.getElementById(id);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);
  const exists = (v) => !!v;
  const setVisible = (el, show) => { if (!el) return; el.style.display = show ? "" : "none"; };
  const downloadBlob = (blob, filename) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename || "download";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // Hide preview images that have no src (prevents broken-image UI)
  function hideEmptyPreviews() {
    const previews = document.querySelectorAll("img");
    previews.forEach(img => {
      if (!img.getAttribute("src") || img.getAttribute("src") === "") {
        img.style.display = "none";
      }
    });
  }
  document.addEventListener("DOMContentLoaded", hideEmptyPreviews);

  /* =========================
     UI: theme + mobile menu + smooth scroll
     ========================= */
  (function uiInit() {
    // restore theme
    const stored = localStorage.getItem("theme");
    if (stored) {
      document.documentElement.setAttribute("data-theme", stored === "dark" ? "dark" : "");
    } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      document.documentElement.setAttribute("data-theme", "dark");
    }

    document.addEventListener("DOMContentLoaded", function () {
      // theme toggle
      const themeBtn = $("theme-toggle");
      if (themeBtn) {
        themeBtn.addEventListener("click", function () {
          const now = document.documentElement.getAttribute("data-theme") === "dark" ? "" : "dark";
          document.documentElement.setAttribute("data-theme", now);
          localStorage.setItem("theme", now === "dark" ? "dark" : "light");
        });
      }

      // mobile menu
      const menuBtn = $("mobile-menu-btn");
      const mobileMenu = $("mobile-menu");
      if (menuBtn && mobileMenu) {
        menuBtn.addEventListener("click", function () {
          const open = mobileMenu.classList.toggle("open");
          menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
          mobileMenu.setAttribute("aria-hidden", open ? "false" : "true");
        });
        // close on link click
        if (mobileMenu.querySelectorAll) {
          mobileMenu.querySelectorAll("a").forEach(a => a.addEventListener("click", function () {
            mobileMenu.classList.remove("open");
            menuBtn.setAttribute("aria-expanded", "false");
          }));
        }
      }

      // smooth scroll for anchors
      if (document.querySelectorAll) {
        document.querySelectorAll('a[href^="#"]').forEach(a => {
          a.addEventListener("click", function (e) {
            const id = this.getAttribute("href").slice(1);
            const el = document.getElementById(id);
            if (el) {
              e.preventDefault();
              el.scrollIntoView({ behavior: "smooth", block: "start" });
            }
          });
        });
      }
    });
  })();

  /* =========================
     Word Counter — robust
     ========================= */
  window.countWords = function (text) {
    if (!text) return { words: 0, characters: 0 };
    const chars = text.length;
    const words = text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
    return { words, characters: chars };
  };

  window.updateWordCounter = function () {
    const ta = $("wc-input") || $("wordInput") || document.querySelector("textarea[data-tool='word-counter']");
    if (!ta) return;
    const res = countWords(ta.value || "");
    const wordEl = $("wordCount") || $("wc-words") || $("wc-output");
    const charEl = $("charCount") || $("wc-chars");
    const sentenceEl = $("sentenceCount");
    const paraEl = $("paraCount");
    const readingEl = $("readingTime");

    if (wordEl) wordEl.textContent = String(res.words);
    if (charEl) charEl.textContent = String(res.characters);

    // extra stats
    const text = (ta.value || "").trim();
    const sentences = text ? text.split(/[.!?]+/).filter(Boolean).length : 0;
    const paras = text ? text.split(/\n+/).filter(Boolean).length : 0;
    if (sentenceEl) sentenceEl.textContent = String(sentences);
    if (paraEl) paraEl.textContent = String(paras);
    if (readingEl) readingEl.textContent = Math.max(1, Math.ceil(res.words / 200)) + " min read";

    // create basic CTA/button if missing on page
    if (!document.querySelector(".wc-cta")) {
      try {
        const container = ta.parentElement || document.body;
        const cta = document.createElement("p");
        cta.className = "wc-cta";
        cta.innerHTML = `<a class="btn" href="tools.html">Try our free Word Counter tool now ✍️</a>`;
        container.appendChild(cta);
      } catch (e) { /* ignore DOM issues */ }
    }
  };

  (function attachWordCounter() {
    const ta = $("wc-input") || $("wordInput") || document.querySelector("textarea[data-tool='word-counter']");
    if (ta) {
      ta.addEventListener("input", window.updateWordCounter);
      window.updateWordCounter(); // initial
    }
  })();

  /* =========================
     Case Converter (keeps earlier functions compatible)
     ========================= */
  window.convertCase = function (mode) {
    const ta = $("case-input") || $("caseInput") || document.querySelector("textarea[data-tool='case-converter']");
    const out = $("case-output") || $("caseOutput");
    if (!ta) return;
    let v = ta.value || "";
    if (mode === "upper") v = v.toUpperCase();
    else if (mode === "lower") v = v.toLowerCase();
    else if (mode === "title") v = v.toLowerCase().replace(/\b(\w)/g, (m, p) => p.toUpperCase());
    else if (mode === "sentence") v = v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
    if (out && out.tagName === "TEXTAREA") out.value = v; else ta.value = v;
  };

  // attach any matching buttons
  (function attachCase() {
    const up = $("upperBtn") || $("to-upper");
    const low = $("lowerBtn") || $("to-lower");
    const title = $("titleBtn") || $("to-title");
    const sentence = $("sentenceBtn") || $("to-sentence");
    if (up) on(up, "click", () => convertCase("upper"));
    if (low) on(low, "click", () => convertCase("lower"));
    if (title) on(title, "click", () => convertCase("title"));
    if (sentence) on(sentence, "click", () => convertCase("sentence"));
  })();

  /* =========================
     Text-to-Speech + optional recording to download
     ========================= */
  (function ttsInit() {
    const input = $("tts-input") || $("ttsInput");
    const voiceSelect = $("tts-voices") || $("voiceSelect");
    const speakBtn = $("speakBtn") || document.querySelector("[data-tts-play]") || $("tts-play");
    const downloadBtn = $("tts-download") || $("tts-download-btn");

    window.synth = window.speechSynthesis || null;

    function populateVoices() {
      if (!voiceSelect || !window.synth) return;
      const voices = window.speechSynthesis.getVoices() || [];
      voiceSelect.innerHTML = "";
      voices.forEach((v, i) => {
        const opt = document.createElement("option");
        opt.value = i;
        opt.textContent = `${v.name} (${v.lang})${v.default ? " — default" : ""}`;
        opt.dataset.lang = v.lang || "";
        voiceSelect.appendChild(opt);
      });
      // try to preserve selection if previously set
      try {
        const saved = localStorage.getItem("ttsVoiceIndex");
        if (saved) voiceSelect.value = saved;
      } catch (e) {}
    }

    if (window.speechSynthesis) {
      populateVoices();
      window.speechSynthesis.onvoiceschanged = populateVoices;
    }

    window.speakText = function (preload) {
      if (!input) return alert("No text input found.");
      const text = input.value || (preload ? (input.dataset.demo || "") : "");
      if (!text) return alert("Enter text to speak or choose a demo.");
      const u = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
      const selIdx = voiceSelect ? parseInt(voiceSelect.value || "0", 10) : 0;
      if (voices && voices[selIdx]) u.voice = voices[selIdx];
      try { window.speechSynthesis.cancel(); } catch (e) {}
      window.speechSynthesis.speak(u);
    };

    // record & download via getDisplayMedia (tab audio capture) - requires user permission
    window.recordSpeechAndDownload = async function (filename) {
      const text = input ? input.value : "";
      if (!text) return alert("Type text to record and download.");
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        return alert("Your browser does not support recording tab audio (required to download TTS). Use a Chromium browser and allow 'Share audio' when prompted, or use a server-side TTS.");
      }
      try {
        // request tab/display capture (audio)
        const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
        // set up recorder
        const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
        const chunks = [];
        recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
        recorder.start();

        // speak
        const u = new SpeechSynthesisUtterance(text);
        const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
        const selIdx = voiceSelect ? parseInt(voiceSelect.value || "0", 10) : 0;
        if (voices && voices[selIdx]) u.voice = voices[selIdx];

        // after speech ends stop recorder
        u.onend = function () {
          // small timeout to ensure audio stream flushed
          setTimeout(() => {
            try { recorder.stop(); } catch (er) {}
          }, 200);
        };

        recorder.onstop = function () {
          const blob = new Blob(chunks, { type: "audio/webm" });
          downloadBlob(blob, filename || "speech.webm");
          // stop all tracks on stream
          stream.getTracks().forEach(t => t.stop());
        };

        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      } catch (err) {
        console.error(err);
        alert("Recording/download failed or was cancelled. " + (err && err.message ? err.message : ""));
      }
    };

    if (speakBtn) on(speakBtn, "click", () => window.speakText(false));
    if (downloadBtn) on(downloadBtn, "click", () => window.recordSpeechAndDownload("tts.webm"));

    // save selected voice index
    if (voiceSelect) voiceSelect.addEventListener("change", () => {
      try { localStorage.setItem("ttsVoiceIndex", String(voiceSelect.value)); } catch (e) {}
    });
  })();

  /* =========================
     SEO Analyzer
     ========================= */
  (function seoInit() {
    const titleEl = $("seo-title");
    const descEl = $("seo-desc");
    const runBtn = $("seo-run") || $("analyzeBtn") || $("seo-run-btn");
    const out = $("seo-report") || $("seoOutput");

    function analyze() {
      if (!out) return;
      const title = titleEl ? (titleEl.value || "") : "";
      const desc = descEl ? (descEl.value || "") : "";
      const words = (title + " " + desc).trim().split(/\s+/).filter(Boolean);
      const top = {};
      words.forEach(w => {
        const k = w.toLowerCase();
        top[k] = (top[k] || 0) + 1;
      });
      const topKeywords = Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 6);
      let html = `<p><strong>Title length:</strong> ${title.length} characters</p>`;
      html += `<p><strong>Description length:</strong> ${desc.length} characters</p>`;
      html += `<p><strong>Total words:</strong> ${words.length}</p>`;
      if (topKeywords.length) {
        html += `<p><strong>Top keywords:</strong></p><ul>${topKeywords.map(kv => `<li>${kv[0]} — ${kv[1]}</li>`).join("")}</ul>`;
      }
      out.innerHTML = html;
    }

    if (runBtn) on(runBtn, "click", analyze);
  })();

  /* =========================
     File Converter (text + image)
     - Hides previews before load
     - Supports text downloads and image convert to png/jpeg/webp
     - For server-only conversions (PDF/DOCX) shows a clear message
     ========================= */
  (function fileConverterInit() {
    const textName = $("fc-name");
    const textArea = $("fc-text");
    const fcBtn = $("fc-download") || $("fc-download-btn") || $("downloadTextBtn") || $("fc-download");
    const imageFile = $("ic-file") || $("fileInput") || $("file-converter-input");
    const imagePreview = $("ic-output") || $("preview") || $("filePreview");
    const imageFormat = $("ic-format") || $("formatSelect");
    const imageThumbSize = $("ic-thumb-size") || null;
    const imageConvertBtn = $("ic-convert") || $("ic-convert-btn") || $("convertImageBtn") || $("downloadImageBtn");

    // ensure preview hidden if empty
    if (imagePreview && (!imagePreview.getAttribute("src") || imagePreview.getAttribute("src") === "")) {
      imagePreview.style.display = "none";
    }

    window.downloadText = function (filename, content) {
      const blob = new Blob([content], { type: "text/plain" });
      downloadBlob(blob, filename || "download.txt");
    };

    window.handleTextDownload = function () {
      if (!textArea) return;
      const content = textArea.value || "";
      const name = (textName && textName.value) || "download.txt";
      window.downloadText(name, content);
    };

    if (fcBtn) on(fcBtn, "click", window.handleTextDownload);

    // image convert helper
    function imageToDataURL(file, type = "image/png", quality = 0.92, maxW = null, maxH = null) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        const img = new Image();
        reader.onload = function (e) {
          img.onload = function () {
            let w = img.width, h = img.height;
            if (maxW || maxH) {
              const scale = Math.min(maxW ? maxW / w : 1, maxH ? maxH / h : 1);
              if (scale < 1) { w = Math.round(w * scale); h = Math.round(h * scale); }
            }
            const canvas = document.createElement("canvas");
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, w, h);
            try {
              const data = canvas.toDataURL(type, quality);
              resolve(data);
            } catch (err) { reject(err); }
          };
          img.onerror = function (err) { reject(err); };
          img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    // convert & download image
    window.handleImageConvert = async function () {
      const input = imageFile;
      const out = imagePreview;
      if (!input || !out || !input.files || !input.files[0]) return alert("Choose an image first");
      const typeOption = imageFormat ? (imageFormat.value || "image/png") : "image/png";
      const allowedImageTypes = ["image/png", "image/jpeg", "image/webp"];
      if (!allowedImageTypes.includes(typeOption)) {
        return alert("Requested image format not supported in-browser. Supported: PNG, JPEG, WEBP.");
      }
      const thumb = imageThumbSize ? parseInt((imageThumbSize.value || imageThumbSize), 10) : null;
      try {
        const data = await imageToDataURL(input.files[0], typeOption, 0.92, thumb, thumb);
        out.src = data;
        out.style.display = "";
        const a = document.createElement("a");
        a.href = data;
        const ext = (typeOption || "image/png").split("/")[1];
        a.download = "converted." + ext;
        a.click();
      } catch (err) {
        console.error(err);
        alert("Image conversion failed: " + (err && err.message ? err.message : err));
      }
    };

    // preview handler (hide until loaded)
    if (imageFile && imagePreview) {
      imageFile.addEventListener("change", function (e) {
        const f = e.target.files && e.target.files[0];
        if (!f) { imagePreview.src = ""; setVisible(imagePreview, false); return; }
        if (f.type && f.type.startsWith("image/")) {
          const r = new FileReader();
          r.onload = function (ev) { imagePreview.src = ev.target.result; setVisible(imagePreview, true); };
          r.readAsDataURL(f);
        } else {
          imagePreview.src = ""; setVisible(imagePreview, false);
        }
      });
    }

    if (imageConvertBtn) on(imageConvertBtn, "click", window.handleImageConvert);
  })();

  /* =========================
     ZIP / Unzip improvements
     - unzip provides download links for each extracted file (requires JSZip)
     ========================= */
  (function zipInit() {
    const zipInput = $("zip-files") || $("zipInput") || $("zipInputFiles");
    const zipCreateBtn = $("zipBtn") || $("zip-create") || $("zipCreateBtn");
    const unzipFileInput = $("unzip-file") || $("unzipFile");
    const unzipBtn = $("unzipBtn") || $("unzip-extract") || $("zip-unpack");
    const unzipList = $("unzip-list") || $("zipOutput") || $("zipOutputList");

    window.handleZipCreate = async function () {
      const files = (zipInput && zipInput.files) || [];
      if (!files || !files.length) return alert("Select files to zip");
      try {
        if (window.JSZip && typeof JSZip === "function" && JSZip.prototype && JSZip.prototype.generateAsync) {
          const zip = new JSZip();
          for (let i = 0; i < files.length; i++) { const f = files[i]; zip.file(f.name, await f.arrayBuffer()); }
          const blob = await zip.generateAsync({ type: "blob" });
          downloadBlob(blob, "archive.zip");
          return;
        } else if (window.LocalZip && typeof window.LocalZip.createZipLike === "function") {
          const items = [];
          for (let i = 0; i < files.length; i++) { const f = files[i]; items.push({ name: f.name, arrayBuffer: await f.arrayBuffer() }); }
          const blob = await window.LocalZip.createZipLike(items);
          downloadBlob(blob, "archive.bundle");
          return;
        } else {
          alert("No zip library available to create a zip. (JSZip recommended).");
        }
      } catch (err) {
        console.error(err);
        alert("Failed to create zip: " + (err && err.message ? err.message : err));
      }
    };

    window.handleZipExtract = async function () {
      const file = (unzipFileInput && unzipFileInput.files && unzipFileInput.files[0]) || null;
      if (!file) return alert("Select a zip file to inspect/extract");
      if (!window.JSZip || typeof JSZip !== "function") {
        return alert("Unzip requires JSZip (include /libs/jszip.min.js or CDN).");
      }
      try {
        const zip = new JSZip();
        const data = await file.arrayBuffer();
        const loaded = await zip.loadAsync(data);
        if (unzipList) unzipList.innerHTML = "";
        const links = [];
        zip.forEach(async (relativePath, zfile) => {
          if (zfile.dir) {
            // show folder entry
            if (unzipList) {
              const li = document.createElement("li"); li.textContent = relativePath + " (dir)"; unzipList.appendChild(li);
            }
          } else {
            // produce a download link for file content
            const blob = await zfile.async("blob");
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = relativePath.split("/").pop() || relativePath;
            a.textContent = "Download " + relativePath;
            a.style.display = "inline-block";
            a.style.margin = "6px 0";
            if (unzipList) {
              const li = document.createElement("li");
              li.appendChild(a);
              unzipList.appendChild(li);
            } else {
              links.push(a);
            }
          }
        });
        if (!unzipList && links.length) {
          const w = window.open("", "_blank");
          links.forEach(a => w.document.body.appendChild(a));
        }
      } catch (err) {
        console.error(err);
        alert("Failed to inspect/unzip: " + (err && err.message ? err.message : err));
      }
    };

    if (zipCreateBtn) on(zipCreateBtn, "click", window.handleZipCreate);
    if (unzipBtn) on(unzipBtn, "click", window.handleZipExtract);
  })();

  /* =========================
     Image editor / converter / thumbnail
     - Adds editing UI if not present: text overlay, color pick, brightness slider
     ========================= */
  (function imageEditorInit() {
    const imageInput = $("imageInput") || $("ic-file") || $("fileInput") || $("thumbInput");
    const imagePreview = $("imagePreview") || $("ic-output") || $("preview") || $("filePreview");
    const downloadBtn = $("imageDownloadBtn") || $("downloadBtn") || $("ic-download");
    const thumbDownloadBtn = $("thumbDownloadBtn") || $("downloadThumbBtn") || null;
    const thumbSizeInput = $("ic-thumb-size") || $("thumbSize") || null;
    const imageFormatSelect = $("ic-format") || $("imageFormat") || null;

    if (!imageInput || !imagePreview) return; // no image tooling on this page

    // create small editor UI if not present
    function ensureEditorUI() {
      let editor = document.getElementById("et-editor");
      if (editor) return editor;
      editor = document.createElement("div");
      editor.id = "et-editor";
      editor.style.margin = "12px 0";
      editor.innerHTML = `
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <label>Overlay text: <input id="et-text" placeholder="Add text"/></label>
          <label>Text color: <input id="et-text-color" type="color" value="#ffffff"/></label>
          <label>Font size: <input id="et-font-size" type="number" value="28" style="width:80px"/></label>
          <label>Brightness: <input id="et-brightness" type="range" min="-100" max="100" value="0"/></label>
          <label>Overlay color: <input id="et-overlay-color" type="color" value="#000000"/></label>
          <label style="display:flex;align-items:center">Overlay opacity: <input id="et-overlay-opacity" type="range" min="0" max="1" step="0.05" value="0"/></label>
          <button id="et-apply" class="btn">Apply edits</button>
          <button id="et-reset" class="btn">Reset</button>
        </div>
      `;
      // insert after preview if possible
      try {
        imagePreview.parentElement.insertBefore(editor, imagePreview.nextSibling);
      } catch (e) {
        document.body.appendChild(editor);
      }
      return editor;
    }

    const editor = ensureEditorUI();
    const etText = document.getElementById("et-text");
    const etTextColor = document.getElementById("et-text-color");
    const etFontSize = document.getElementById("et-font-size");
    const etBrightness = document.getElementById("et-brightness");
    const etOverlayColor = document.getElementById("et-overlay-color");
    const etOverlayOpacity = document.getElementById("et-overlay-opacity");
    const etApply = document.getElementById("et-apply");
    const etReset = document.getElementById("et-reset");

    // apply edits: draw image to canvas then apply overlay / text / brightness
    async function applyEditsAndReturnDataURL(file, options = {}) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        const img = new Image();
        reader.onload = function (e) {
          img.onload = function () {
            try {
              let w = img.width, h = img.height;
              // limit size for performance
              const maxPixels = 2500 * 2500; // arbitrary safe cap
              if (w * h > maxPixels) {
                const scale = Math.sqrt(maxPixels / (w * h));
                w = Math.round(w * scale);
                h = Math.round(h * scale);
              }
              const canvas = document.createElement("canvas");
              canvas.width = w; canvas.height = h;
              const ctx = canvas.getContext("2d");
              ctx.drawImage(img, 0, 0, w, h);

              // brightness adjustment: naive per-pixel manipulation
              if (options.brightness && options.brightness !== 0) {
                const bright = parseInt(options.brightness, 10); // -100..100
                const imgd = ctx.getImageData(0, 0, w, h);
                const data = imgd.data;
                for (let i = 0; i < data.length; i += 4) {
                  data[i] = Math.min(255, Math.max(0, data[i] + bright));     // R
                  data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + bright)); // G
                  data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + bright)); // B
                }
                ctx.putImageData(imgd, 0, 0);
              }

              // overlay color
              if (options.overlayColor && options.overlayOpacity && parseFloat(options.overlayOpacity) > 0) {
                ctx.fillStyle = hexToRgba(options.overlayColor, parseFloat(options.overlayOpacity));
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

              const mime = options.mime || "image/png";
              const dataURL = canvas.toDataURL(mime, options.quality || 0.92);
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
      const h = hex.replace("#", "");
      const bigint = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
      const r = (bigint >> 16) & 255;
      const g = (bigint >> 8) & 255;
      const b = bigint & 255;
      return `rgba(${r},${g},${b},${alpha})`;
    }

    // attach preview
    imageInput.addEventListener("change", function (e) {
      const f = e.target.files && e.target.files[0];
      if (!f) { imagePreview.src = ""; setVisible(imagePreview, false); return; }
      if (f.type && f.type.startsWith("image/")) {
        const r = new FileReader();
        r.onload = function (ev) { imagePreview.src = ev.target.result; setVisible(imagePreview, true); };
        r.readAsDataURL(f);
      } else {
        imagePreview.src = ""; setVisible(imagePreview, false);
      }
    });

    // apply button: create edited image and replace preview
    etApply.addEventListener("click", async function () {
      const f = (imageInput && imageInput.files && imageInput.files[0]) || null;
      if (!f) return alert("Select an image first.");
      try {
        const data = await applyEditsAndReturnDataURL(f, {
          text: etText.value || "",
          textColor: etTextColor.value || "#ffffff",
          fontSize: etFontSize.value || 28,
          brightness: etBrightness.value || 0,
          overlayColor: etOverlayColor.value || "#000000",
          overlayOpacity: etOverlayOpacity.value || 0,
          mime: (imageFormatSelect && imageFormatSelect.value) || "image/png"
        });
        imagePreview.src = data;
        setVisible(imagePreview, true);
      } catch (err) {
        console.error(err);
        alert("Failed to apply edits: " + (err && err.message ? err.message : err));
      }
    });

    // reset editor to original preview
    etReset.addEventListener("click", function () {
      const f = (imageInput && imageInput.files && imageInput.files[0]) || null;
      if (!f) return;
      const r = new FileReader();
      r.onload = function (ev) { imagePreview.src = ev.target.result; setVisible(imagePreview, true); };
      r.readAsDataURL(f);
    });

    // download button (applies edits if any)
    if (downloadBtn) {
      downloadBtn.addEventListener("click", async function () {
        const f = (imageInput && imageInput.files && imageInput.files[0]) || null;
        if (!f) return alert("Select an image first.");
        try {
          const data = await applyEditsAndReturnDataURL(f, {
            text: etText.value || "",
            textColor: etTextColor.value || "#fff",
            fontSize: etFontSize.value || 28,
            brightness: etBrightness.value || 0,
            overlayColor: etOverlayColor.value || "#000",
            overlayOpacity: etOverlayOpacity.value || 0,
            mime: (imageFormatSelect && imageFormatSelect.value) || "image/png"
          });
          // convert dataURL to blob
          const res = await fetch(data);
          const blob = await res.blob();
          const ext = ((imageFormatSelect && imageFormatSelect.value) || "image/png").split("/")[1] || "png";
          downloadBlob(blob, "image-edited." + ext);
        } catch (err) {
          console.error(err);
          alert("Download failed: " + (err && err.message ? err.message : err));
        }
      });
    }

    // thumbnail download
    if (thumbDownloadBtn) {
      thumbDownloadBtn.addEventListener("click", async function () {
        const f = (imageInput && imageInput.files && imageInput.files[0]) || null;
        if (!f) return alert("Select an image first.");
        const maxSize = thumbSizeInput ? parseInt(thumbSizeInput.value || 200, 10) : 200;
        try {
          const dataURL = await applyEditsAndReturnDataURL(f, { maxSize: maxSize, mime: "image/png" });
          const res = await fetch(dataURL);
          const blob = await res.blob();
          downloadBlob(blob, "thumbnail.png");
        } catch (err) {
          console.error(err);
          alert("Thumbnail creation failed: " + (err && err.message ? err.message : err));
        }
      });
    }
  })();

  /* =========================
     Expose legacy function names for HTML inline compatibility
     (these will reference functions defined above if present)
     ========================= */
  window.updateWordCounter = window.updateWordCounter || function () { };
  window.convertCase = window.convertCase || function () { };
  window.speakText = window.speakText || function () { };
  window.handleImageConvert = window.handleImageConvert || function () { };
  window.handleTextDownload = window.handleTextDownload || function () { };
  window.handleZipCreate = window.handleZipCreate || function () { };
  window.handleZipExtract = window.handleZipExtract || function () { };

  // call updateWordCounter once DOM loaded (to seed counters)
  if (document.readyState === "complete" || document.readyState === "interactive") {
    try { window.updateWordCounter(); } catch (e) { /* ignore */ }
  } else {
    document.addEventListener("DOMContentLoaded", function () { try { window.updateWordCounter(); } catch (e) { } });
  }
})();





/* ===========================
   Backend Integration (Option A)
   =========================== */

// Base URL for backend
const API_BASE = "https://evertoolbox-backend.onrender.com";

// ---- TTS: Generate & Download Audio ----
async function handleTTSDownload() {
  const ta = document.getElementById("tts-input");
  const sel = document.getElementById("tts-voices");
  if (!ta || !sel) return alert("TTS input or voice selector missing.");

  const text = ta.value.trim();
  if (!text) return alert("Enter some text first.");

  const voice = sel.options[sel.selectedIndex]?.text || "default";

  try {
    const res = await fetch(`${API_BASE}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice })
    });

    if (!res.ok) throw new Error("TTS request failed");
    const blob = await res.blob();

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "speech.mp3";
    a.click();
  } catch (err) {
    console.error(err);
    alert("Failed to generate audio. Try again.");
  }
}

// ---- Document Conversion (PDF, DOCX, etc.) ----
async function handleDocConvert() {
  const fileInput = document.getElementById("ic-file");
  const format = document.getElementById("ic-format");
  if (!fileInput || !fileInput.files.length) {
    return alert("Choose a file first.");
  }

  const file = fileInput.files[0];
  const targetFormat = format?.value || "pdf";

  const formData = new FormData();
  formData.append("file", file);
  formData.append("target", targetFormat);

  try {
    const res = await fetch(`${API_BASE}/convert`, {
      method: "POST",
      body: formData
    });
    if (!res.ok) throw new Error("Conversion failed");

    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `converted.${targetFormat}`;
    a.click();
  } catch (err) {
    console.error(err);
    alert("Conversion error: " + err.message);
  }
}

// ---- Image Conversion (extra formats, editing) ----
async function handleImageEdit() {
  const fileInput = document.getElementById("ic-file");
  const thumbSize = document.getElementById("ic-thumb-size");
  const format = document.getElementById("ic-format");
  if (!fileInput || !fileInput.files.length) {
    return alert("Choose an image first.");
  }

  const file = fileInput.files[0];
  const targetFormat = format?.value || "png";
  const size = thumbSize?.value || 512;

  const formData = new FormData();
  formData.append("image", file);
  formData.append("target", targetFormat);
  formData.append("size", size);

  try {
    const res = await fetch(`${API_BASE}/image/convert`, {
      method: "POST",
      body: formData
    });
    if (!res.ok) throw new Error("Image conversion failed");

    const blob = await res.blob();
    const out = document.getElementById("ic-output");
    if (out) {
      out.src = URL.createObjectURL(blob);
    }

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `converted.${targetFormat}`;
    a.click();
  } catch (err) {
    console.error(err);
    alert("Image conversion error: " + err.message);
  }
}
