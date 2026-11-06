import { pageLayout, createPdf } from './pdf.js';
import './document-tools.js';
import { setProcessing } from './tool-state.js';

const $ = id => document.getElementById(id);
const state = { images: [], selected: null, busy: false, loading: false, download: null };
const maxFileSize = 30 * 1024 * 1024, maxPixels = 40_000_000, maxTotalSize = 300 * 1024 * 1024;
const sizeText = bytes => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const options = () => ({ size: $('size').value, margin: Number($('margin').value), orientation: document.querySelector('[name="orientation"]:checked').value, title: $('filename').value.trim() || 'my-images' });
function message(text = '', error = false) { $('message').textContent = text; $('message').classList.toggle('error', error); }
function invalidateDownload() {
  if (state.download) URL.revokeObjectURL(state.download);
  state.download = null; $('download-again').hidden = true;
}
function preview() {
  const item = state.images.find(item => item.id === state.selected) || state.images[0];
  const settings = options();
  const layout = pageLayout(item?.width || 600, item?.height || 840, item?.rotation || 0, settings);
  const page = $('preview'); page.style.aspectRatio = `${layout.pageWidth}/${layout.pageHeight}`;
  const previewScale = Math.min(140 / layout.pageWidth, 180 / layout.pageHeight);
  page.style.width = `${layout.pageWidth * previewScale}px`;
  page.style.height = `${layout.pageHeight * previewScale}px`;
  $('page-dimensions').textContent = settings.size === 'image' ? 'FIT TO IMAGE' : settings.size.toUpperCase();
  $('orientation-field').disabled = settings.size === 'image';
  $('preview-placeholder').hidden = Boolean(item); $('preview-image').hidden = !item;
  $('preview-caption').textContent = item ? `PAGE ${state.images.indexOf(item) + 1} OF ${state.images.length}` : 'LIVE PREVIEW';
  if (item) {
    const image = $('preview-image'); image.src = item.url;
    image.style.width = `${layout.draw.width / layout.pageWidth * 100}%`;
    image.style.height = `${layout.draw.height / layout.pageHeight * 100}%`;
    image.style.transform = `rotate(${item.rotation}deg)`;
  }
}
function render() {
  const count = state.images.length, locked = state.busy || state.loading;
  $('count').textContent = count;
  $('clear').disabled = !count || locked; $('sort').disabled = count < 2 || locked;
  $('convert').disabled = !count || locked; $('dropzone').disabled = locked; $('add-more').disabled = locked;
  $('dropzone').hidden = count > 0; $('queue-hint').hidden = !count; $('add-more').hidden = !count;
  $('export-note').textContent = count ? `${count} image${count === 1 ? '' : 's'} · ${sizeText(state.images.reduce((sum, item) => sum + item.file.size, 0))} · one PDF` : 'Add an image to get started';
  $('images').replaceChildren();
  for (const [index, item] of state.images.entries()) {
    const card = document.createElement('article');
    card.className = `image-card${item.id === state.selected ? ' selected' : ''}`;
    card.draggable = !locked; card.dataset.id = item.id;
    const thumb = document.createElement('button'); thumb.className = 'thumb-button'; thumb.disabled = locked; thumb.setAttribute('aria-label', `Preview page ${index + 1}: ${item.file.name}`);
    const image = document.createElement('img'); image.src = item.url; image.alt = ''; image.draggable = false; image.style.transform = `rotate(${item.rotation}deg)`; thumb.append(image);
    thumb.addEventListener('click', () => { state.selected = item.id; render(); });
    const number = document.createElement('span'); number.className = 'page-number'; number.textContent = index + 1;
    const name = document.createElement('p'); name.className = 'image-name'; name.textContent = item.file.name; name.title = item.file.name;
    const meta = document.createElement('p'); meta.className = 'image-meta'; meta.textContent = `${item.width} × ${item.height} · ${sizeText(item.file.size)}`;
    const actions = document.createElement('div'); actions.className = 'card-actions';
    const definitions = [
      ['←', 'Move earlier', () => move(index, index - 1), index === 0],
      ['→', 'Move later', () => move(index, index + 1), index === count - 1],
      ['↻', 'Rotate clockwise', () => { item.rotation = (item.rotation + 90) % 360; invalidateDownload(); render(); }, false],
      ['×', 'Remove', () => { URL.revokeObjectURL(item.url); state.images.splice(index, 1); if (state.selected === item.id) state.selected = state.images[0]?.id; invalidateDownload(); render(); }, false],
    ];
    for (const [text, label, callback, disabled] of definitions) {
      const button = document.createElement('button'); button.textContent = text; button.title = label; button.setAttribute('aria-label', `${label}: ${item.file.name}`); button.disabled = disabled || locked; button.addEventListener('click', callback); actions.append(button);
    }
    card.addEventListener('dragstart', event => { if (locked) return event.preventDefault(); event.dataTransfer.setData('text/plain', item.id); event.dataTransfer.effectAllowed = 'move'; card.classList.add('dragging'); });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    card.addEventListener('dragover', event => { if (!locked && !event.dataTransfer.types.includes('Files')) event.preventDefault(); });
    card.addEventListener('drop', event => { if (event.dataTransfer.files.length) return; event.preventDefault(); if (locked) return; const from = state.images.findIndex(i => i.id === event.dataTransfer.getData('text/plain')); if (from >= 0) move(from, index); });
    card.append(thumb, number, name, meta, actions); $('images').append(card);
  }
  preview();
}
function move(from, to) { if (to < 0 || to >= state.images.length || from === to) return; const [item] = state.images.splice(from, 1); state.images.splice(to, 0, item); invalidateDownload(); render(); }
async function addFiles(files) {
  if (state.busy || state.loading) return;
  state.loading = true; setProcessing('images', true); invalidateDownload(); message('Reading images…'); render();
  const errors = [];
  try {
    for (const file of files) {
      let url;
      try {
        if (state.images.length >= 100) throw new Error('The limit is 100 images per PDF.');
        if (!file.size || file.size > maxFileSize) throw new Error('Use an image between 1 byte and 30 MB.');
        if (state.images.reduce((sum, item) => sum + item.file.size, 0) + file.size > maxTotalSize) throw new Error('The combined image limit is 300 MB.');
        const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
        const png = [137,80,78,71,13,10,26,10].every((byte, i) => signature[i] === byte);
        const jpeg = signature[0] === 255 && signature[1] === 216 && signature[2] === 255;
        if (!png && !jpeg) throw new Error('Only JPEG and PNG images are supported.');
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        const { width, height } = bitmap; bitmap.close();
        if (!width || !height || width * height > maxPixels) throw new Error('Use an image under 40 megapixels.');
        url = URL.createObjectURL(file);
        const item = { file, url, type: jpeg ? 'image/jpeg' : 'image/png', width, height, rotation: 0, id: crypto.randomUUID() };
        state.images.push(item); if (!state.selected) state.selected = item.id;
      } catch (error) { if (url) URL.revokeObjectURL(url); errors.push(`${file.name}: ${error.message}`); }
    }
  } finally { state.loading = false; setProcessing('images', false); $('files').value = ''; render(); }
  message(errors.length ? errors.join('\n') : `${files.length} image${files.length === 1 ? '' : 's'} added. Ready when you are.`, Boolean(errors.length));
}
async function prepareImage(item) {
  // Normalize EXIF orientation using the same browser decoder as the preview.
  const bitmap = await createImageBitmap(item.file, { imageOrientation: 'from-image' });
  try {
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d'); if (!context) throw new Error('Unable to create image canvas.');
    context.drawImage(bitmap, 0, 0);
    const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Image encoding failed.')), item.type, 0.97));
    canvas.width = 1; canvas.height = 1;
    return { bytes: await blob.arrayBuffer(), type: item.type, rotation: item.rotation };
  } finally { bitmap.close(); }
}
$('files').addEventListener('change', event => addFiles(Array.from(event.target.files)));
for (const id of ['dropzone', 'add-more']) $(id).addEventListener('click', () => $('files').click());
document.addEventListener('dragover', event => { if ($('image-panel').hidden) return; if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); $('dropzone').classList.add('dragover'); } });
document.addEventListener('dragleave', event => { if (!event.relatedTarget) $('dropzone').classList.remove('dragover'); });
document.addEventListener('drop', event => { if ($('image-panel').hidden) return; if (event.dataTransfer.files.length) { event.preventDefault(); $('dropzone').classList.remove('dragover'); addFiles(Array.from(event.dataTransfer.files)); } });
$('clear').addEventListener('click', () => { for (const item of state.images) URL.revokeObjectURL(item.url); state.images = []; state.selected = null; invalidateDownload(); message(); render(); });
$('sort').addEventListener('click', () => { state.images.sort((a,b) => a.file.name.localeCompare(b.file.name, undefined, { numeric: true })); invalidateDownload(); render(); });
for (const control of document.querySelectorAll('select, [name="orientation"], #filename')) control.addEventListener('input', () => { invalidateDownload(); preview(); });
$('convert').addEventListener('click', async () => {
  if (state.busy || !state.images.length || state.loading) return;
  state.busy = true; setProcessing('images', true); invalidateDownload(); render(); message('Creating your PDF…');
  const controls = Array.from(document.querySelectorAll('#image-panel .settings input, #image-panel .settings select'));
  controls.forEach(control => control.disabled = true);
  try {
    if (!window.PDFLib) throw new Error('The PDF library did not load. Restart the app and refresh the page.');
    const settings = options();
    const bytes = await createPdf(state.images.map(item => () => prepareImage(item)), settings, window.PDFLib, (done, total) => {
      message(`Creating PDF · ${done} of ${total} pages`);
    });
    state.download = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const filename = settings.title.replace(/\.pdf$/i, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').trim() || 'my-images';
    const link = $('download-again'); link.href = state.download; link.download = `${filename}.pdf`; link.hidden = false; link.click();
    message(`Your ${state.images.length}-page PDF is ready (${sizeText(bytes.length)}).`);
  } catch (error) { message(`Couldn't create the PDF. ${error.message}`, true); }
  finally { state.busy = false; setProcessing('images', false); controls.forEach(control => control.disabled = false); render(); }
});
window.addEventListener('beforeunload', () => { for (const item of state.images) URL.revokeObjectURL(item.url); if (state.download) URL.revokeObjectURL(state.download); });
render();
