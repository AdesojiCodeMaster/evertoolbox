/* EverToolbox - consolidated script.js
   Replaces existing root script.js. Vanilla JS, defensive, enables all tools + UI.
*/

/* -----------------------
   Utility helpers
   ----------------------- */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);
  const exists = (el) => !!el;
  const setVisible = (el, show) => {
    if (!el) return;
    el.style.display = show ? "" : "none";
  };

  /* -----------------------
     Theme toggle & mobile menu
     ----------------------- */
  (function uiInit() {
    // set theme from storage or prefers
    const stored = localStorage.getItem("theme");
    if (stored) {
      document.documentElement.setAttribute("data-theme", stored);
    } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      document.documentElement.setAttribute("data-theme", "dark");
    }

    on(document, "DOMContentLoaded", function () {
      const themeBtn = $("theme-toggle");
      if (themeBtn) {
        themeBtn.addEventListener("click", function () {
          const now = document.documentElement.getAttribute("data-theme") === "dark" ? "" : "dark";
          document.documentElement.setAttribute("data-theme", now);
          localStorage.setItem("theme", now || "light");
        });
      }

      // mobile menu toggle
      const menuBtn = $("mobile-menu-btn");
      const mobileMenu = $("mobile-menu");
      if (menuBtn && mobileMenu) {
        menuBtn.addEventListener("click", function () {
          const open = mobileMenu.classList.toggle("open");
          menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
          mobileMenu.setAttribute("aria-hidden", open ? "false" : "true");
        });
        // close on link click
        mobileMenu.querySelectorAll && mobileMenu.querySelectorAll("a").forEach((a) => {
          a.addEventListener("click", function () {
            mobileMenu.classList.remove("open");
            menuBtn.setAttribute("aria-expanded", "false");
          });
        });
      }

      // smooth scroll for anchors
      document.querySelectorAll && document.querySelectorAll('a[href^="#"]').forEach((a) => {
        a.addEventListener("click", function (e) {
          const id = this.getAttribute("href").slice(1);
          const el = document.getElementById(id);
          if (el) {
            e.preventDefault();
            el.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        });
      });
    });
  })();

  /* -----------------------
     Word counter
     ----------------------- */
  window.countWords = function (text) {
    if (!text) return { words: 0, characters: 0 };
    const chars = text.length;
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    return { words, characters: chars };
  };

  window.updateWordCounter = function () {
    const ta = $("wc-input") || $("wordInput");
    const out = $("wc-output") || $("wordCount") || $("charCount");
    // If there are multiple outputs in the page: try filling them
    const charEl = $("charCount");
    const wordEl = $("wordCount");
    const sentenceEl = $("sentenceCount");
    const paraEl = $("paraCount");
    const readingEl = $("readingTime");

    if (!ta) return;
    const res = countWords(ta.value);
    if (out && out.tagName === "OUTPUT") out.value = `${res.words} words — ${res.characters} characters`;
    if (wordEl) wordEl.textContent = res.words;
    if (charEl) charEl.textContent = res.characters;
    // more stats
    const text = ta.value.trim();
    const sentences = text ? text.split(/[.!?]+/).filter(Boolean).length : 0;
    const paras = text ? text.split(/\n+/).filter(Boolean).length : 0;
    if (sentenceEl) sentenceEl.textContent = sentences;
    if (paraEl) paraEl.textContent = paras;
    if (readingEl) readingEl.textContent = Math.max(1, Math.ceil(res.words / 200)) + " min read";
  };

  // attach to inputs if present
  (function attachWordCounter() {
    const ta = $("wc-input") || $("wordInput");
    if (ta) {
      ta.addEventListener("input", window.updateWordCounter);
      // initial update
      window.updateWordCounter();
    }
  })();

  /* -----------------------
     Case converter
     ----------------------- */
  window.convertCase = function (mode) {
    const ta = $("case-input") || $("caseInput");
    const out = $("case-output") || $("caseOutput");
    if (!ta) return;
    let v = ta.value || "";
    if (mode === "upper") v = v.toUpperCase();
    else if (mode === "lower") v = v.toLowerCase();
    else if (mode === "title")
      v = v.toLowerCase().replace(/\b(\w)/g, function (m, p1) {
        return p1.toUpperCase();
      });
    else if (mode === "sentence") v = v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
    if (out && out.tagName === "TEXTAREA") out.value = v;
    else ta.value = v;
  };

  (function attachCaseButtons() {
    const upper = $("upperBtn") || $("to-upper");
    const lower = $("lowerBtn") || $("to-lower");
    const title = $("titleBtn") || $("to-title");
    const sentence = $("sentenceBtn") || $("to-sentence");

    if (upper) on(upper, "click", () => window.convertCase("upper"));
    if (lower) on(lower, "click", () => window.convertCase("lower"));
    if (title) on(title, "click", () => window.convertCase("title"));
    if (sentence) on(sentence, "click", () => window.convertCase("sentence"));
  })();

  /* -----------------------
     Text-to-Speech
     ----------------------- */
  (function ttsInit() {
    const input = $("tts-input") || $("ttsInput");
    const voicesSelect = $("tts-voices") || $("voiceSelect");
    const speakButtons = document.querySelectorAll && document.querySelectorAll("[data-tts-play]");

    window.synth = window.speechSynthesis || null;

    function populateVoices() {
      if (!voicesSelect || !window.synth) return;
      const voices = window.speechSynthesis.getVoices() || [];
      voicesSelect.innerHTML = "";
      voices.forEach((v, i) => {
        const opt = document.createElement("option");
        opt.value = i;
        opt.textContent = `${v.name} (${v.lang})${v.default ? " — default" : ""}`;
        voicesSelect.appendChild(opt);
      });
    }

    if (window.speechSynthesis) {
      populateVoices();
      window.speechSynthesis.onvoiceschanged = populateVoices;
    }

    window.speakText = function (preload) {
      if (!input) return alert("No text input found.");
      const text = input.value || (preload ? input.dataset.demo || "" : "");
      if (!text) return alert("Enter text to speak or choose a demo.");
      const u = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
      const selIdx = voicesSelect ? parseInt(voicesSelect.value, 10) : 0;
      if (voices && voices[selIdx]) u.voice = voices[selIdx];
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    };

    // attach click handler to any element with data-tts-play or id speakBtn
    const speakBtn = $("speakBtn") || $("tts-play");
    if (speakBtn) on(speakBtn, "click", () => window.speakText(false));
    if (speakButtons && speakButtons.length) {
      speakButtons.forEach((b) => b.addEventListener("click", () => window.speakText(false)));
    }
  })();

  /* -----------------------
     SEO Analyzer (basic)
     ----------------------- */
  (function seoInit() {
    const titleInput = $("seo-title");
    const descInput = $("seo-desc");
    const keywordsInput = $("seo-keywords");
    const runBtn = $("seo-run") || $("analyzeBtn");
    const reportEl = $("seo-report") || $("seoOutput");

    function analyze() {
      if (!reportEl) return;
      const title = titleInput ? titleInput.value : "";
      const desc = descInput ? descInput.value : "";
      const keywords = keywordsInput ? keywordsInput.value : "";
      const words = (title + " " + desc).trim().split(/\s+/).filter(Boolean);
      const html = [];
      html.push(`<p><strong>Title length:</strong> ${title.length} characters</p>`);
      html.push(`<p><strong>Description length:</strong> ${desc.length} characters</p>`);
      html.push(`<p><strong>Total words:</strong> ${words.length}</p>`);
      if (keywords) {
        html.push(`<p><strong>Keywords:</strong> ${keywords}</p>`);
      }
      reportEl.innerHTML = html.join("");
    }

    if (runBtn) on(runBtn, "click", analyze);
  })();

  /* -----------------------
     File converter (text + image convert & preview)
     ----------------------- */
  (function fileConverterInit() {
    const textName = $("fc-name");
    const textArea = $("fc-text");
    const fcBtn = $("fc-download") || $("fc-download-btn") || $("downloadTextBtn");
    const imageFile = $("ic-file") || $("fileInput");
    const imagePreview = $("ic-output") || $("preview") || $("filePreview");
    const imageFormat = $("ic-format") || $("formatSelect");
    const imageThumbSize = $("ic-thumb-size") || $("ic-thumb") || null;
    const imageConvertBtn = $("ic-convert") || $("ic-convert-btn") || $("convertImageBtn");

    window.downloadText = function (filename, content) {
      const a = document.createElement("a");
      const blob = new Blob([content], { type: "text/plain" });
      a.href = URL.createObjectURL(blob);
      a.download = filename || "download.txt";
      document.body.appendChild(a);
      a.click();
      a.remove();
    };

    window.handleTextDownload = function () {
      if (!textArea) return;
      const content = textArea.value || "";
      const name = (textName && textName.value) || "download.txt";
      window.downloadText(name, content);
    };

    if (fcBtn) on(fcBtn, "click", window.handleTextDownload);

    // image preview and convert
    async function imageToDataURL(file, type = "image/png", quality = 0.9, maxW = null, maxH = null) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        const reader = new FileReader();
        reader.onload = function (e) {
          img.onload = function () {
            let w = img.width;
            let h = img.height;
            if (maxW || maxH) {
              const scale = Math.min(maxW ? maxW / w : 1, maxH ? maxH / h : 1);
              if (scale < 1) {
                w = Math.round(w * scale);
                h = Math.round(h * scale);
              }
            }
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, w, h);
            const mime = type || "image/png";
            const data = canvas.toDataURL(mime, quality);
            resolve(data);
          };
          img.onerror = reject;
          img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    window.handleImageConvert = async function () {
      const input = imageFile;
      const out = imagePreview;
      if (!input || !out || !input.files || !input.files[0]) return alert("Choose an image first");
      const type = (imageFormat && imageFormat.value) || "image/png";
      const thumb = imageThumbSize ? parseInt(imageThumbSize.value || imageThumbSize) : null;
      try {
        const data = await imageToDataURL(input.files[0], type, 0.9, thumb, thumb);
        out.src = data;
        out.style.display = "";
        const a = document.createElement("a");
        a.href = data;
        // convert mime to ext
        const ext = (type || "image/png").split("/")[1];
        a.download = "converted." + ext;
        a.click();
      } catch (err) {
        console.error(err);
        alert("Image conversion failed: " + (err && err.message ? err.message : err));
      }
    };

    // preview on file select
    if (imageFile && imagePreview) {
      imageFile.addEventListener("change", function (e) {
        const f = e.target.files && e.target.files[0];
        if (!f) {
          imagePreview.src = "";
          setVisible(imagePreview, false);
          return;
        }
        if (f.type && f.type.startsWith("image/")) {
          const reader = new FileReader();
          reader.onload = function (ev) {
            imagePreview.src = ev.target.result;
            setVisible(imagePreview, true);
          };
          reader.readAsDataURL(f);
        } else {
          imagePreview.src = "";
          setVisible(imagePreview, false);
        }
      });
    }

    if (imageConvertBtn) on(imageConvertBtn, "click", window.handleImageConvert);
  })();

  /* -----------------------
     ZIP / Unzip tool
     ----------------------- */
  (function zipInit() {
    const zipInput = $("zip-files") || $("zipInput");
    const zipCreateBtn = $("zipBtn") || $("createZipBtn") || $("zip-create");
    const unzipFileInput = $("unzip-file") || $("unzipFile");
    const unzipBtn = $("unzipBtn") || $("inspectZipBtn") || $("zip-unpack");
    const unzipList = $("unzip-list") || $("zipOutput") || $("zipOutputList");

    // local fallback zip creator (very basic concatenation fallback - not a real ZIP)
    window.LocalZip = window.LocalZip || (function () {
      return {
        createZipLike: async function (items) {
          // This is a fallback that packages raw blobs into a single blob with a crude header.
          // It is not a real zip file format. JSZip is recommended for full functionality.
          const parts = [];
          for (let i = 0; i < items.length; i++) {
            const it = items[i];
            const nameBytes = new TextEncoder().encode(it.name);
            const header = new Uint8Array(4 + nameBytes.length);
            header[0] = nameBytes.length & 255;
            header[1] = (nameBytes.length >> 8) & 255;
            header[2] = 0;
            header[3] = 0;
            parts.push(header.buffer, nameBytes.buffer, it.arrayBuffer);
          }
          return new Blob(parts, { type: "application/octet-stream" });
        },
      };
    })();

    window.handleZipCreate = async function () {
      const files = (zipInput && zipInput.files) || [];
      if (!files || !files.length) return alert("Select files to zip");
      try {
        if (window.JSZip && typeof JSZip === "function" && JSZip.prototype && JSZip.prototype.generateAsync) {
          const zip = new JSZip();
          for (let i = 0; i < files.length; i++) {
            const f = files[i];
            // JSZip supports adding from arrayBuffer
            zip.file(f.name, await f.arrayBuffer());
          }
          const blob = await zip.generateAsync({ type: "blob" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "archive.zip";
          a.click();
          return;
        } else if (window.LocalZip && typeof window.LocalZip.createZipLike === "function") {
          const items = [];
          for (let i = 0; i < files.length; i++) {
            const f = files[i];
            items.push({ name: f.name, arrayBuffer: await f.arrayBuffer() });
          }
          const blob = await window.LocalZip.createZipLike(items);
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "archive.bundle";
          a.click();
          return;
        } else {
          alert("No zip library available.");
        }
      } catch (err) {
        console.error(err);
        alert("Failed to create zip: " + (err && err.message ? err.message : err));
      }
    };

    window.handleZipExtract = async function () {
      const f = (unzipFileInput && unzipFileInput.files && unzipFileInput.files[0]) || null;
      if (!f) return alert("Select a zip file to inspect");
      if (window.JSZip && typeof JSZip === "function") {
        const zip = new JSZip();
        const data = await f.arrayBuffer();
        const loaded = await zip.loadAsync(data);
        if (unzipList) {
          unzipList.innerHTML = "";
          zip.forEach((relativePath, file) => {
            const li = document.createElement("li");
            li.textContent = relativePath + (file.dir ? " (dir)" : "");
            unzipList.appendChild(li);
          });
        } else {
          // fallback alert
          const names = [];
          zip.forEach((p) => names.push(p));
          alert("Zip contains:\n" + names.join("\n"));
        }
      } else {
        alert("Unzip requires JSZip (include /libs/jszip.min.js or CDN).");
      }
    };

    if (zipCreateBtn) on(zipCreateBtn, "click", window.handleZipCreate);
    if (unzipBtn) on(unzipBtn, "click", window.handleZipExtract);
  })();

  /* -----------------------
     Image Converter & Thumbnail generator
     ----------------------- */
  (function imageToolsInit() {
    const imageInput = $("imageInput") || $("ic-file") || $("fileInput");
    const imagePreview = $("imagePreview") || $("ic-output") || $("preview");
    const thumbInput = $("thumbInput") || $("ic-file") || $("thumbInput");
    const thumbPreview = $("thumbPreview") || $("thumbPreview") || $("ic-output");
    const imageDownloadBtn = $("imageDownloadBtn") || $("downloadBtn") || $("ic-download");
    const thumbDownloadBtn = $("thumbDownloadBtn") || $("downloadThumbBtn") || null;
    const thumbSizeInput = $("ic-thumb-size") || $("thumbSize") || null;
    const imageFormatSelect = $("ic-format") || $("imageFormat") || null;

    // generic preview handler
    function attachPreview(fileInput, previewEl) {
      if (!fileInput || !previewEl) return;
      fileInput.addEventListener("change", function (e) {
        const f = e.target.files && e.target.files[0];
        if (!f) {
          previewEl.src = "";
          setVisible(previewEl, false);
          return;
        }
        if (f.type && f.type.startsWith("image/")) {
          const reader = new FileReader();
          reader.onload = function (ev) {
            previewEl.src = ev.target.result;
            setVisible(previewEl, true);
          };
          reader.readAsDataURL(f);
        } else {
          previewEl.src = "";
          setVisible(previewEl, false);
        }
      });
    }

    attachPreview(imageInput, imagePreview);
    attachPreview(thumbInput, thumbPreview);

    function downloadCanvasImage(canvas, filename, mime) {
      const a = document.createElement("a");
      a.href = canvas.toDataURL(mime || "image/png");
      a.download = filename || "image.png";
      a.click();
    }

    function convertAndDownloadImage(file, options = {}) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        const reader = new FileReader();
        reader.onload = function (ev) {
          img.onload = function () {
            try {
              // compute size
              let w = img.width, h = img.height;
              if (options.maxSize) {
                const max = options.maxSize;
                if (w > h) {
                  h = Math.round((h * max) / w);
                  w = max;
                } else {
                  w = Math.round((w * max) / h);
                  h = max;
                }
              }
              const canvas = document.createElement("canvas");
              canvas.width = w;
              canvas.height = h;
              const ctx = canvas.getContext("2d");
              ctx.drawImage(img, 0, 0, w, h);
              const mime = options.mime || "image/png";
              const filename = options.filename || "converted.png";
              downloadCanvasImage(canvas, filename, mime);
              resolve();
            } catch (err) { reject(err); }
          };
          img.onerror = reject;
          img.src = ev.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    if (imageDownloadBtn) {
      imageDownloadBtn.addEventListener("click", function () {
        const f = (imageInput && imageInput.files && imageInput.files[0]) || null;
        if (!f) return alert("Select an image first.");
        const fmt = (imageFormatSelect && imageFormatSelect.value) || "image/png";
        convertAndDownloadImage(f, { mime: fmt, filename: "converted." + fmt.split("/")[1] }).catch((e) => {
          console.error(e);
          alert("Convert failed: " + e.message);
        });
      });
    }

    if (thumbDownloadBtn) {
      thumbDownloadBtn.addEventListener("click", function () {
        const f = (thumbInput && thumbInput.files && thumbInput.files[0]) || null;
        if (!f) return alert("Select an image first.");
        const maxSize = thumbSizeInput ? parseInt(thumbSizeInput.value || 200, 10) : 200;
        convertAndDownloadImage(f, { maxSize: maxSize, mime: "image/png", filename: "thumbnail.png" }).catch((e) => {
          console.error(e);
          alert("Thumbnail failed: " + e.message);
        });
      });
    }
  })();

  /* -----------------------
     Final safety: expose functions preserved previously
     ----------------------- */
  // Expose names used by legacy HTML inline calls
  window.handleZipCreate = window.handleZipCreate || window.handleZipCreate;
  window.handleZipExtract = window.handleZipExtract || window.handleZipExtract;
  window.handleImageConvert = window.handleImageConvert || window.handleImageConvert;
  window.handleTextDownload = window.handleTextDownload || window.handleTextDownload;
  window.speakText = window.speakText || window.speakText;
  window.updateWordCounter = window.updateWordCounter || window.updateWordCounter;
  window.convertCase = window.convertCase || window.convertCase;

  // small initialization sweep in case page was already loaded before script replacement
  if (document.readyState === "interactive" || document.readyState === "complete") {
    // run word counter once if present
    try { window.updateWordCounter && window.updateWordCounter(); } catch (e) {}
  } else {
    document.addEventListener("DOMContentLoaded", function () {
      try { window.updateWordCounter && window.updateWordCounter(); } catch (e) {}
    });
  }
})();
      
