// universal-filetool.js
import * as core from './core-modules.js';

const drop = document.getElementById('drop');
const category = document.getElementById('category');
const action = document.getElementById('action');
const targetFormat = document.getElementById('targetFormat');
const quality = document.getElementById('quality');
const qLabel = document.getElementById('qLabel');
const startBtn = document.getElementById('start');
const resetBtn = document.getElementById('reset');
const info = document.getElementById('info');
const bar = document.getElementById('bar');

let currentFile = null;

function populateTargets(){
  const cat = category.value;
  targetFormat.innerHTML = '';
  core.FORMATS[cat].forEach(f=>{
    const o = document.createElement('option'); o.value = f; o.textContent = f; targetFormat.appendChild(o);
  });
}
populateTargets();
category.addEventListener('change', populateTargets);
quality.addEventListener('input', ()=> qLabel.textContent = quality.value);

// Drag & click
drop.addEventListener('click', ()=> pickFile());
drop.addEventListener('dragover', e=>{ e.preventDefault(); drop.style.borderColor='#66a' });
drop.addEventListener('dragleave', e=>{ drop.style.borderColor='#cfcfe0' });
drop.addEventListener('drop', async e=>{ e.preventDefault(); drop.style.borderColor='#cfcfe0'; const f = e.dataTransfer.files[0]; await setFile(f); });

async function pickFile(){
  const inp = document.createElement('input'); inp.type='file'; inp.accept='*/*'; inp.onchange = async ()=>{ const f = inp.files[0]; await setFile(f); }; inp.click();
}

async function setFile(f){
  if(!f) return;
  if(f.size > core.MAX_SIZE){ alert('File exceeds 200 MB limit'); return; }
  currentFile = f;
  info.textContent = `Selected: ${f.name} — ${core.humanSize(f.size)} — ${f.type || core.extFromName(f.name)}`;
  bar.style.width = '0%';
}

resetBtn.addEventListener('click', ()=>{ currentFile = null; info.textContent = 'No file selected.'; bar.style.width = '0%'; });

startBtn.addEventListener('click', async ()=>{
  if(!currentFile){ alert('Select a file first'); return; }
  startBtn.disabled = true; startBtn.textContent = 'Processing...'; bar.style.width = '0%';
  try{
    const cat = category.value;
    const act = action.value;
    const tgt = targetFormat.value;
    const q = Number(quality.value)/100;
    const progress = core.makeProgress();
    progress.onProgress(p=>{
      let pct = 0;
      if(typeof p === 'number') pct = p;
      else if(p && p.ratio) pct = Math.round(p.ratio * 100);
      else if(p && p.loaded && p.total) pct = Math.round((p.loaded / p.total) * 100);
      bar.style.width = pct + '%';
    });

    let outFile = null;

    if(cat === 'image'){
      // compress/convert via canvas
      outFile = await core.convertImageTo(currentFile, tgt, (act==='compress'? Math.max(0.2,q) : q), v=> progress.emit(v));
    } else if(cat === 'audio'){
      const bitrate = (q>=0.9)? '320k' : (q>=0.7)? '192k' : (q>=0.5)? '128k' : '96k';
      outFile = await core.convertAudio(currentFile, tgt, bitrate, p=> progress.emit(p));
    } else if(cat === 'video'){
      const crf = Math.max(18, Math.round(32 - (q * 14))); // smaller crf => better quality
      outFile = await core.convertVideo(currentFile, tgt, 'medium', crf, p=> progress.emit(p));
    } else if(cat === 'document'){
      const inExt = core.extFromName(currentFile.name);
      if(inExt === 'docx' && tgt === 'pdf'){
        await core.docxToPdf(currentFile, p=> progress.emit(p));
        info.textContent = 'Saved PDF (docx->pdf).';
        startBtn.disabled = false; startBtn.textContent = 'Start'; bar.style.width = '100%';
        return;
      } else {
        // basic conversions for test: passthrough
        outFile = await core.passthrough(currentFile);
      }
    }

    if(outFile){
      saveFileClient(outFile);
      info.textContent = `Done — output: ${outFile.name} — ${core.humanSize(outFile.size)}`;
      bar.style.width = '100%';
    } else {
      info.textContent = 'Processing completed (output saved).';
    }
  } catch(err){
    console.error(err);
    alert('Processing failed: ' + (err && err.message ? err.message : String(err)));
  } finally {
    startBtn.disabled = false;
    startBtn.textContent = 'Start';
  }
});

function saveFileClient(file){
  const url = URL.createObjectURL(file);
  const a = document.createElement('a'); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=> URL.revokeObjectURL(url), 5000);
}
