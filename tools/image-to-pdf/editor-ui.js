import { isProcessing, setProcessing } from './tool-state.js';
import { readPdf } from './pdf-tools.js';
import { EditHistory, boundMark, exportEdits } from './editor-model.js';
import { paintMarks, textHeight, fonts } from './editor-canvas.js';

const $ = id => document.getElementById(id);
const draft = () => ({ bytes: null, renderer: null, fileName: '', filename: '', page: 0, views: new Map(), history: new EditHistory(), assets: new Map(), selected: null, zoom: 1, download: null });
const drafts = { edit: draft(), sign: draft() };
let mode = null, renderTask = null, rendererModule = null, pointer = null, imageKind = 'image', signatureMode = 'draw', hasInk = false;
const measure = document.createElement('canvas').getContext('2d');
const kinds = { text: 'Text', image: 'Image', highlight: 'Highlight', rectangle: 'Rectangle', ellipse: 'Ellipse', signature: 'Signature' };
const current = () => drafts[mode];
const view = state => state.views.get(state.page);
const selected = state => state.history.marks.find(mark => mark.id === state.selected);
const onPage = state => state.history.marks.filter(mark => mark.pageIndex === state.page);
const filename = value => (value.trim().replace(/\.pdf$/i, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').trim() || 'document') + '.pdf';
const today = new Date();
$('sign-date').value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

function status(text = '', error = false) { $('edit-status').textContent = text; $('edit-status').classList.toggle('error', error); }
function invalidate(state) { if (state.download) URL.revokeObjectURL(state.download.url); state.download = null; $('edit-download').hidden = true; }
function syncValue(id, value) { if ($(id).value !== String(value)) $(id).value = value; }
function release(state) {
  if (state.download) URL.revokeObjectURL(state.download.url);
  for (const asset of state.assets.values()) asset.image.close?.();
  state.renderer?.loadingTask?.destroy().catch(() => {});
}
async function pdfjs() {
  if (!rendererModule) {
    rendererModule = await import('./pdfjs/pdf.mjs');
    rendererModule.GlobalWorkerOptions.workerSrc = new URL('./pdfjs/pdf.worker.mjs', import.meta.url).href;
  }
  return rendererModule;
}
function updateControls() {
  const state = current(); if (!state) return;
  const locked = isProcessing(), hasFile = Boolean(state.bytes), mark = selected(state);
  const pageReady = hasFile && Boolean(view(state)) && $('edit-page').dataset.ready === 'ready';
  for (const element of document.querySelectorAll('#edit-panel button, #edit-panel input, #edit-panel select, #edit-panel textarea')) element.disabled = locked;
  $('edit-workbench').hidden = !hasFile; $('edit-dropzone').hidden = hasFile; $('edit-replace').hidden = !hasFile;
  $('edit-add-tools').hidden = mode !== 'edit'; $('sign-add-tools').hidden = mode !== 'sign'; $('sign-details').hidden = mode !== 'sign';
  $('edit-workspace-title').textContent = mode === 'sign' ? 'Your signing desk' : 'Your canvas';
  $('edit-panel').setAttribute('aria-labelledby', `tool-${mode}`);
  $('edit-file-name').textContent = hasFile ? `${state.fileName} · ${state.renderer.numPages} pages` : 'Your PDF stays on your device.';
  $('edit-mark-count').textContent = `${state.history.marks.length} addition${state.history.marks.length === 1 ? '' : 's'}`;
  $('edit-prev').disabled = locked || !hasFile || state.page === 0;
  $('edit-next').disabled = locked || !hasFile || state.page >= state.renderer.numPages - 1;
  $('edit-undo').disabled = locked || !state.history.past.length;
  $('edit-redo').disabled = locked || !state.history.future.length;
  $('edit-reset').disabled = locked || !state.history.marks.length;
  $('edit-export').disabled = locked || !hasFile || !state.history.marks.length;
  $('edit-export').firstElementChild.textContent = locked ? 'Working…' : mode === 'sign' ? 'Download signed PDF' : 'Download edited PDF';
  for (const button of document.querySelectorAll('.edit-add-toolbar button')) button.disabled = locked || !pageReady;
  $('sign-add-name').disabled = locked || !pageReady || !$('sign-name').value.trim();
  $('sign-add-date').disabled = locked || !pageReady || !$('sign-date').value;
  $('edit-download').hidden = !state.download;
  if (state.download) { $('edit-download').href = state.download.url; $('edit-download').download = state.download.filename; }
  syncValue('edit-filename', state.filename || (mode === 'sign' ? 'signed' : 'edited'));
  syncValue('edit-zoom', state.zoom);
  $('edit-properties').hidden = !mark; $('edit-no-selection').hidden = Boolean(mark);
  $('edit-properties-title').textContent = mark ? kinds[mark.type] : 'Make it yours';
  $('edit-scope-note').textContent = mode === 'sign'
    ? 'Signatures are visual additions, not certificate-based digital signatures. Added content is flattened into the downloaded copy.'
    : 'Additions, including text, export as graphics. Existing PDF text stays intact. This tool does not remove underlying content.';
  if (!mark) return;
  $('edit-text-properties').hidden = mark.type !== 'text';
  $('edit-color-properties').hidden = ['image', 'signature'].includes(mark.type);
  $('edit-fill-label').hidden = !['rectangle', 'ellipse'].includes(mark.type);
  syncValue('edit-text', mark.text || ''); syncValue('edit-font', mark.font || 'sans'); syncValue('edit-font-size', Math.round(mark.fontSize || 20));
  syncValue('edit-color', mark.color || '#25332b'); syncValue('edit-opacity', mark.opacity ?? 1);
  $('edit-opacity-value').textContent = `${Math.round((mark.opacity ?? 1) * 100)}%`;
  $('edit-fill').checked = Boolean(mark.fill);
  for (const [id, key] of [['edit-x', 'x'], ['edit-y', 'y'], ['edit-width', 'w'], ['edit-height', 'h']]) syncValue(id, Math.round(mark[key]));
}
function layoutPage() {
  const state = current(), viewport = state && view(state); if (!viewport) return;
  const available = Math.max(100, $('edit-scroll').clientWidth - (innerWidth < 660 ? 26 : 48));
  const scale = Math.min(1, available / viewport.width) * state.zoom;
  $('edit-page').style.width = `${viewport.width * scale}px`; $('edit-page').style.height = `${viewport.height * scale}px`;
}
async function showPage() {
  const state = current(); if (!state?.renderer || isProcessing()) return;
  setProcessing('editor-render', true); updateControls();
  $('edit-page').dataset.ready = 'loading'; $('edit-page').setAttribute('aria-busy', 'true'); $('edit-objects').replaceChildren();
  try {
    const page = await state.renderer.getPage(state.page + 1), viewport = page.getViewport({ scale: 1 });
    if (viewport.width * viewport.height > 16_000_000) throw new Error('This page is too large for the visual editor. Use a smaller page size.');
    state.views.set(state.page, { width: viewport.width, height: viewport.height, transform: [...viewport.transform] });
    const scale = Math.min(2, Math.sqrt(8_000_000 / (viewport.width * viewport.height)));
    const rendered = page.getViewport({ scale }), canvas = $('edit-base');
    canvas.width = Math.ceil(rendered.width); canvas.height = Math.ceil(rendered.height);
    layoutPage();
    renderTask = page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport: rendered, background: '#ffffff' });
    await renderTask.promise; renderTask = null;
    $('edit-page-select').replaceChildren();
    for (let index = 0; index < state.renderer.numPages; index++) {
      const option = document.createElement('option'); option.value = index; option.textContent = `Page ${index + 1} of ${state.renderer.numPages}`; $('edit-page-select').append(option);
    }
    $('edit-page-select').value = state.page; renderMarks(); $('edit-page').dataset.ready = 'ready';
  } catch (error) { $('edit-page').dataset.ready = 'error'; $('edit-base').width = 1; $('edit-base').height = 1; status(`Couldn't preview this page. ${error.message}`, true); }
  finally { renderTask = null; $('edit-page').setAttribute('aria-busy', 'false'); setProcessing('editor-render', false); updateControls(); }
}
function paintElement(element, mark, state) {
  const viewport = view(state), canvas = element.firstElementChild;
  for (const [property, value, total] of [['left', mark.x, viewport.width], ['top', mark.y, viewport.height], ['width', mark.w, viewport.width], ['height', mark.h, viewport.height]]) element.style[property] = `${value / total * 100}%`;
  const scale = Math.min(2, Math.sqrt(4_000_000 / (mark.w * mark.h)));
  canvas.width = Math.max(1, Math.ceil(mark.w * scale)); canvas.height = Math.max(1, Math.ceil(mark.h * scale));
  const context = canvas.getContext('2d'); context.scale(canvas.width / mark.w, canvas.height / mark.h);
  paintMarks(context, [{ ...mark, x: 0, y: 0 }], state.assets);
}
function selectMark(id) {
  const state = current(); state.selected = id;
  for (const element of $('edit-objects').children) element.classList.toggle('selected', element.dataset.id === id);
  updateControls();
}
function renderMarks(focus = false) {
  const state = current(); if (!state || !view(state)) return;
  if (!selected(state)) state.selected = null;
  $('edit-objects').replaceChildren();
  for (const mark of onPage(state)) {
    const element = document.createElement('div'); element.className = 'edit-mark' + (mark.id === state.selected ? ' selected' : '');
    element.dataset.id = mark.id; element.tabIndex = 0; element.setAttribute('role', 'button');
    element.setAttribute('aria-label', `${kinds[mark.type]} addition${mark.text ? ': ' + mark.text.slice(0, 60) : ''}. Use arrow keys to move.`);
    const canvas = document.createElement('canvas'); canvas.setAttribute('aria-hidden', 'true');
    const handle = document.createElement('button'); handle.className = 'resize-handle'; handle.dataset.resize = 'true'; handle.setAttribute('aria-label', 'Resize addition');
    handle.addEventListener('keydown', event => { if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation(); const delta = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 5 : -5;
      changeMark({ w: Math.max(4, mark.w + delta) }, 'w');
    } });
    element.append(canvas, handle); paintElement(element, mark, state);
    element.addEventListener('pointerdown', beginPointer);
    element.addEventListener('pointermove', movePointer);
    element.addEventListener('pointerup', finishPointer);
    element.addEventListener('pointercancel', () => { pointer = null; renderMarks(); });
    element.addEventListener('focus', () => selectMark(mark.id));
    element.addEventListener('click', event => { event.stopPropagation(); selectMark(mark.id); });
    element.addEventListener('keydown', event => {
      if (isProcessing()) return;
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectMark(mark.id); return; }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); removeMark(); return; }
      const step = event.shiftKey ? 10 : 1;
      const offset = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
      if (offset) { event.preventDefault(); selectMark(mark.id); changeMark({ x: mark.x + offset[0], y: mark.y + offset[1] }, null, true); }
    });
    $('edit-objects').append(element);
    if (focus && mark.id === state.selected) element.focus({ preventScroll: true });
  }
  updateControls();
}
function fitText(mark, viewport) {
  if (mark.type !== 'text') return boundMark(mark, viewport.width, viewport.height);
  mark.fontSize = Math.min(96, Math.max(6, mark.fontSize));
  mark.h = textHeight(measure, mark);
  if (mark.h > viewport.height) throw new Error('That text does not fit on this page. Use less text, a wider box, or a smaller font.');
  return boundMark(mark, viewport.width, viewport.height);
}
function resized(mark, proposed, axis, viewport) {
  if (!['image', 'signature', 'text'].includes(mark.type)) return boundMark({ ...mark, ...proposed }, viewport.width, viewport.height);
  const requested = axis === 'h' ? proposed.h / mark.h : proposed.w / mark.w;
  let scale = Math.min(Math.max(.05, requested), viewport.width / mark.w, viewport.height / mark.h);
  if (mark.type === 'text') scale = Math.min(scale, 96 / mark.fontSize);
  return fitText({ ...mark, w: mark.w * scale, h: mark.h * scale, ...(mark.type === 'text' ? { fontSize: mark.fontSize * scale } : {}) }, viewport);
}
function commit(marks, focus = false) {
  const state = current(); state.history.commit(marks); invalidate(state); status(); renderMarks(focus);
}
function changeMark(changes, axis = null, focus = false) {
  const state = current(), mark = state && selected(state); if (!mark || isProcessing()) return;
  try {
    const next = axis ? resized(mark, changes, axis, view(state)) : fitText({ ...mark, ...changes }, view(state));
    commit(state.history.marks.map(item => item.id === mark.id ? next : item), focus);
  } catch (error) { status(error.message, true); }
}
function beginPointer(event) {
  if (isProcessing() || event.button !== 0) return;
  event.preventDefault(); event.stopPropagation(); const state = current(); selectMark(event.currentTarget.dataset.id);
  const mark = selected(state), rect = $('edit-page').getBoundingClientRect();
  pointer = { id: event.pointerId, mark: { ...mark }, latest: mark, x: event.clientX, y: event.clientY, scale: view(state).width / rect.width, resize: Boolean(event.target.closest('[data-resize]')), element: event.currentTarget };
  try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* A cancelled pointer may no longer be active. */ }
}
function movePointer(event) {
  if (!pointer || pointer.id !== event.pointerId) return;
  const state = current(), viewport = view(state), original = pointer.mark;
  const dx = (event.clientX - pointer.x) * pointer.scale, dy = (event.clientY - pointer.y) * pointer.scale;
  try {
    if (pointer.resize) {
      const useWidth = Math.abs(dx / original.w) >= Math.abs(dy / original.h);
      pointer.latest = resized(original, useWidth ? { w: original.w + dx } : { h: original.h + dy }, useWidth ? 'w' : 'h', viewport);
      if (!['text', 'image', 'signature'].includes(original.type)) pointer.latest = boundMark({ ...original, w: original.w + dx, h: original.h + dy }, viewport.width, viewport.height);
    } else pointer.latest = boundMark({ ...original, x: original.x + dx, y: original.y + dy }, viewport.width, viewport.height);
    paintElement(pointer.element, pointer.latest, state);
  } catch { /* Keep the last valid size while dragging outside the page. */ }
}
function finishPointer(event) {
  if (!pointer || pointer.id !== event.pointerId) return;
  const { latest, mark } = pointer; pointer = null;
  commit(current().history.marks.map(item => item.id === mark.id ? latest : item), true);
}
function addMark(properties) {
  const state = current(), viewport = state && view(state); if (!viewport || isProcessing() || $('edit-page').dataset.ready !== 'ready') return;
  if (state.history.marks.length >= 100) { status('Use up to 100 additions in one document.', true); return; }
  const count = onPage(state).length;
  let mark = { id: crypto.randomUUID(), pageIndex: state.page, x: Math.min(50 + count * 13, viewport.width * .35), y: Math.min(90 + count * 35, viewport.height * .6), w: Math.min(230, viewport.width * .7), h: 65, opacity: 1, color: '#25332b', ...properties };
  try {
    mark = fitText(mark, viewport); state.selected = mark.id; commit([...state.history.marks, mark], true);
  } catch (error) { status(error.message, true); }
}
async function loadPdf(file) {
  if (!current() || isProcessing()) return;
  const targetMode = mode;
  setProcessing('editor-load', true); status('Opening your PDF…'); updateControls();
  let renderer, loadingTask;
  try {
    if (!file.size || file.size > 30 * 1024 * 1024) throw new Error('Use a PDF between 1 byte and 30 MB.');
    const bytes = new Uint8Array(await file.arrayBuffer()), document = await readPdf(bytes, window.PDFLib);
    if (document.getPageCount() > 200) throw new Error('Use a PDF with up to 200 pages in the visual editor.');
    const library = await pdfjs();
    loadingTask = library.getDocument({ data: bytes.slice(), isEvalSupported: false, enableXfa: false, useSystemFonts: true,
      cMapUrl: new URL('./pdfjs/cmaps/', import.meta.url).href, cMapPacked: true,
      standardFontDataUrl: new URL('./pdfjs/standard_fonts/', import.meta.url).href,
      wasmUrl: new URL('./pdfjs/wasm/', import.meta.url).href, iccUrl: new URL('./pdfjs/iccs/', import.meta.url).href });
    renderer = await loadingTask.promise;
    const first = (await renderer.getPage(1)).getViewport({ scale: 1 });
    if (first.width * first.height > 16_000_000) throw new Error('This page is too large for the visual editor. Use a smaller page size.');
    release(drafts[targetMode]); drafts[targetMode] = { ...draft(), bytes, renderer, fileName: file.name, filename: file.name.replace(/\.pdf$/i, '').slice(0, 90) + (targetMode === 'sign' ? '-signed' : '-edited') };
    renderer = null; loadingTask = null; status('Ready. Add an item, then drag it into place.');
  } catch (error) { await loadingTask?.destroy().catch(() => {}); status(`Couldn't open the PDF. ${error.message}`, true); }
  finally { setProcessing('editor-load', false); $('edit-file').value = ''; updateControls(); }
  if (drafts[targetMode].bytes && mode === targetMode) await showPage();
}
async function addBitmap(blob, type = 'image') {
  const state = current(); if (!state?.bytes || isProcessing()) return;
  setProcessing('editor-asset', true); updateControls();
  let image, properties;
  try {
    if (!blob.size || blob.size > 10 * 1024 * 1024) throw new Error('Use an image under 10 MB.');
    if (state.assets.size >= 20) throw new Error('Use up to 20 image/signature assets per draft.');
    if (!['image/png', 'image/jpeg'].includes(blob.type)) throw new Error('Choose a PNG or JPEG image.');
    image = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    if (image.width * image.height > 16_000_000) throw new Error('Use an image under 16 megapixels.');
    if (Array.from(state.assets.values()).reduce((sum, asset) => sum + asset.pixels, 0) + image.width * image.height > 32_000_000 || Array.from(state.assets.values()).reduce((sum, asset) => sum + asset.size, 0) + blob.size > 30 * 1024 * 1024) throw new Error('Use fewer image assets in this draft (30 MB / 32 megapixels combined).');
    const assetId = crypto.randomUUID(), viewport = view(state);
    const maxWidth = Math.min(type === 'signature' ? 240 : 280, viewport.width * .7);
    const scale = Math.min(maxWidth / image.width, viewport.height * .35 / image.height);
    state.assets.set(assetId, { image, pixels: image.width * image.height, size: blob.size });
    properties = { type, assetId, w: image.width * scale, h: image.height * scale,
      ...(type === 'signature' ? { x: viewport.width * .12, y: viewport.height * .65 } : {}) };
    image = null;
  } catch (error) { image?.close(); status(error.message, true); }
  finally { setProcessing('editor-asset', false); $('edit-image-file').value = ''; updateControls(); }
  if (properties) addMark(properties);
}
async function sample() {
  if (isProcessing()) return;
  setProcessing('editor-sample', true); updateControls();
  let file;
  try {
    const pdf = await window.PDFLib.PDFDocument.create();
    for (const [index, title] of ['A little paperwork', 'Your notes & approval'].entries()) {
      const page = pdf.addPage([595.28, 841.89]);
      page.drawRectangle({ x: 0, y: 765, width: 595.28, height: 77, color: window.PDFLib.rgb(.92, .95, .88) });
      page.drawText(title, { x: 45, y: 793, size: 24 });
      page.drawText(index ? 'A second page for the details that matter.' : 'A sample document for trying your finishing touches.', { x: 45, y: 712, size: 12 });
      page.drawText('Project brief', { x: 45, y: 656, size: 17 });
      page.drawText('Add a note or image. Highlight a detail. Make it yours.', { x: 45, y: 625, size: 11 });
      page.drawLine({ start: { x: 45, y: 600 }, end: { x: 550, y: 600 }, color: window.PDFLib.rgb(.8, .84, .75) });
      page.drawText('Signature', { x: 45, y: 300, size: 12 });
      page.drawLine({ start: { x: 45, y: 220 }, end: { x: 350, y: 220 }, color: window.PDFLib.rgb(.7, .76, .65) });
      page.drawText('Name', { x: 45, y: 170, size: 10 }); page.drawText('Date', { x: 330, y: 170, size: 10 });
      page.drawText(`SAMPLE DOCUMENT  /  ${index + 1}`, { x: 45, y: 40, size: 8 });
    }
    file = new File([await pdf.save()], 'Paperwork sample.pdf', { type: 'application/pdf' });
  } catch (error) { status(`Couldn't prepare the sample. ${error.message}`, true); }
  finally { setProcessing('editor-sample', false); updateControls(); }
  if (file) await loadPdf(file);
}
function removeMark() {
  const state = current(); if (!state?.selected || isProcessing()) return;
  commit(state.history.marks.filter(mark => mark.id !== state.selected));
}
function historyAction(action) {
  const state = current(); if (!state || isProcessing()) return;
  if (state.history[action]()) { invalidate(state); status(); renderMarks(); }
}
function croppedSignature(canvas) {
  const context = canvas.getContext('2d'), { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  let left = canvas.width, top = canvas.height, right = 0, bottom = 0;
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) if (data[(y * canvas.width + x) * 4 + 3] > 0) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
  if (left > right) throw new Error('Add your signature first.');
  const output = document.createElement('canvas'); output.width = right - left + 25; output.height = bottom - top + 25;
  output.getContext('2d').drawImage(canvas, left, top, right - left + 1, bottom - top + 1, 12, 12, right - left + 1, bottom - top + 1);
  return output;
}
function drawTypedSignature() {
  const canvas = $('signature-type-preview'), context = canvas.getContext('2d'); context.clearRect(0, 0, canvas.width, canvas.height);
  const text = $('signature-text').value.trim();
  context.font = `100px ${fonts[$('signature-font').value] || fonts.script}`;
  const size = Math.min(100, 95000 / Math.max(1, context.measureText(text).width));
  context.font = `${size}px ${fonts[$('signature-font').value] || fonts.script}`;
  context.textBaseline = 'middle'; context.fillStyle = '#25332b'; context.fillText(text, 35, 150);
  $('signature-use').disabled = !text;
}
function openSignature(type) {
  if (!current()?.bytes || isProcessing()) return;
  signatureMode = type; $('signature-draw-panel').hidden = type !== 'draw'; $('signature-type-panel').hidden = type !== 'type';
  $('signature-heading').textContent = type === 'draw' ? 'Draw your signature' : 'Type your signature';
  if (type === 'type') { $('signature-text').value = $('sign-name').value; drawTypedSignature(); }
  else $('signature-use').disabled = !hasInk;
  $('signature-dialog').showModal();
}
let drawing = null;
$('signature-canvas').addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  event.preventDefault(); const canvas = event.currentTarget, rect = canvas.getBoundingClientRect();
  drawing = { id: event.pointerId, x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
  try { canvas.setPointerCapture?.(event.pointerId); } catch { /* Pointer capture is unavailable after cancellation. */ }
  const context = canvas.getContext('2d'); context.fillStyle = '#25332b'; context.beginPath(); context.arc(drawing.x, drawing.y, 3, 0, Math.PI * 2); context.fill(); hasInk = true; $('signature-use').disabled = false;
});
$('signature-canvas').addEventListener('pointermove', event => {
  if (!drawing || drawing.id !== event.pointerId) return;
  const canvas = event.currentTarget, rect = canvas.getBoundingClientRect(), x = (event.clientX - rect.left) * canvas.width / rect.width, y = (event.clientY - rect.top) * canvas.height / rect.height;
  const context = canvas.getContext('2d'); context.strokeStyle = '#25332b'; context.lineWidth = 6; context.lineCap = 'round'; context.lineJoin = 'round'; context.beginPath(); context.moveTo(drawing.x, drawing.y); context.lineTo(x, y); context.stroke(); drawing.x = x; drawing.y = y;
});
for (const event of ['pointerup', 'pointercancel']) $('signature-canvas').addEventListener(event, () => { drawing = null; });
$('signature-clear').addEventListener('click', () => { const canvas = $('signature-canvas'); canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height); hasInk = false; $('signature-use').disabled = true; });
$('signature-text').addEventListener('input', drawTypedSignature); $('signature-font').addEventListener('change', drawTypedSignature);
$('signature-use').addEventListener('click', async () => {
  try {
    const canvas = croppedSignature($(signatureMode === 'draw' ? 'signature-canvas' : 'signature-type-preview'));
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not create a signature image.');
    $('signature-dialog').close(); await addBitmap(blob, 'signature');
  } catch (error) { status(error.message, true); }
});
document.addEventListener('paperwork-tool', event => {
  const next = event.detail.tool; mode = ['edit', 'sign'].includes(next) ? next : null;
  if (!mode) return;
  status(); updateControls(); if (current().renderer) showPage();
});
document.addEventListener('paperwork-processing', updateControls);
$('edit-file').addEventListener('change', event => { if (event.target.files[0]) loadPdf(event.target.files[0]); });
for (const id of ['edit-dropzone', 'edit-replace']) $(id).addEventListener('click', () => $('edit-file').click());
$('edit-demo').addEventListener('click', sample);
document.addEventListener('dragover', event => { if (mode && event.dataTransfer.types.includes('Files')) { event.preventDefault(); $('edit-dropzone').classList.add('dragover'); } });
document.addEventListener('dragleave', event => { if (!event.relatedTarget) $('edit-dropzone').classList.remove('dragover'); });
document.addEventListener('drop', event => { if (mode && event.dataTransfer.files.length) { event.preventDefault(); $('edit-dropzone').classList.remove('dragover'); if (event.dataTransfer.files.length !== 1) status('Choose one PDF at a time.', true); else loadPdf(event.dataTransfer.files[0]); } });
$('edit-add-text').addEventListener('click', () => addMark({ type: 'text', text: 'Your text', fontSize: 20, font: 'sans' }));
$('edit-add-highlight').addEventListener('click', () => addMark({ type: 'highlight', color: '#f1ce45', opacity: .3, w: 220, h: 28 }));
for (const type of ['rectangle', 'ellipse']) $('edit-add-' + type).addEventListener('click', () => addMark({ type, w: type === 'ellipse' ? 110 : 180, h: 80, fill: false }));
for (const [id, type] of [['edit-add-image', 'image'], ['sign-upload', 'signature']]) $(id).addEventListener('click', () => { imageKind = type; $('edit-image-file').click(); });
$('edit-image-file').addEventListener('change', event => { if (event.target.files[0]) addBitmap(event.target.files[0], imageKind); });
$('edit-prev').addEventListener('click', () => { if (isProcessing()) return; current().page--; current().selected = null; showPage(); });
$('edit-next').addEventListener('click', () => { if (isProcessing()) return; current().page++; current().selected = null; showPage(); });
$('edit-page-select').addEventListener('change', event => { if (isProcessing()) return; current().page = Number(event.target.value); current().selected = null; showPage(); });
$('edit-zoom').addEventListener('change', event => { current().zoom = Number(event.target.value); layoutPage(); });
$('edit-undo').addEventListener('click', () => historyAction('undo')); $('edit-redo').addEventListener('click', () => historyAction('redo'));
$('edit-reset').addEventListener('click', () => commit([])); $('edit-delete').addEventListener('click', removeMark);
$('edit-page').addEventListener('pointerdown', event => { if (!event.target.closest('.edit-mark')) selectMark(null); });
$('edit-text').addEventListener('input', event => changeMark({ text: event.target.value }));
$('edit-font').addEventListener('change', event => changeMark({ font: event.target.value }));
$('edit-font-size').addEventListener('change', event => { if (Number.isFinite(event.target.valueAsNumber)) changeMark({ fontSize: event.target.valueAsNumber }); });
$('edit-color').addEventListener('input', event => changeMark({ color: event.target.value }));
$('edit-opacity').addEventListener('input', event => changeMark({ opacity: Number(event.target.value) }));
$('edit-fill').addEventListener('change', event => changeMark({ fill: event.target.checked }));
for (const [id, key] of [['edit-x', 'x'], ['edit-y', 'y'], ['edit-width', 'w'], ['edit-height', 'h']]) $(id).addEventListener('change', event => { if (Number.isFinite(event.target.valueAsNumber)) changeMark({ [key]: event.target.valueAsNumber }, ['w', 'h'].includes(key) ? key : null); });
$('edit-filename').addEventListener('input', event => { current().filename = event.target.value; invalidate(current()); });
$('sign-name').addEventListener('input', updateControls); $('sign-date').addEventListener('input', updateControls);
$('sign-add-name').addEventListener('click', () => addMark({ type: 'text', text: $('sign-name').value.trim(), fontSize: 16, font: 'sans', x: view(current()).width * .12, y: view(current()).height * .8 }));
$('sign-add-date').addEventListener('click', () => {
  const [year, month, day] = $('sign-date').value.split('-').map(Number);
  addMark({ type: 'text', text: new Intl.DateTimeFormat('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(year, month - 1, day)), fontSize: 14, font: 'sans', x: view(current()).width * .56, y: view(current()).height * .8 });
});
$('sign-draw').addEventListener('click', () => openSignature('draw')); $('sign-type').addEventListener('click', () => openSignature('type'));
document.addEventListener('keydown', event => {
  if (!mode || $('signature-dialog').open || event.target.closest('input, textarea, select')) return;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); historyAction(event.shiftKey ? 'redo' : 'undo'); }
});
$('edit-export').addEventListener('click', async () => {
  const state = current(); if (!state?.history.marks.length || isProcessing()) return;
  setProcessing('editor-export', true); invalidate(state); status('Preparing your PDF…'); updateControls();
  try {
    const overlays = [];
    for (const pageIndex of new Set(state.history.marks.map(mark => mark.pageIndex))) {
      const viewport = state.views.get(pageIndex); if (!viewport) throw new Error('Reopen the edited page before exporting.');
      const scale = Math.min(2, Math.sqrt(16_000_000 / (viewport.width * viewport.height)));
      const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width * scale); canvas.height = Math.ceil(viewport.height * scale);
      const context = canvas.getContext('2d'); context.scale(canvas.width / viewport.width, canvas.height / viewport.height);
      paintMarks(context, state.history.marks.filter(mark => mark.pageIndex === pageIndex), state.assets);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png')); canvas.width = 1; canvas.height = 1;
      if (!blob) throw new Error('Could not render the additions.');
      overlays.push({ pageIndex, ...viewport, pngBytes: new Uint8Array(await blob.arrayBuffer()) });
      status(`Preparing page ${pageIndex + 1}…`);
    }
    const bytes = await exportEdits(state.bytes, overlays, window.PDFLib);
    state.download = { url: URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), filename: filename(state.filename) };
    $('edit-download').href = state.download.url; $('edit-download').download = state.download.filename; $('edit-download').click();
    status('Your PDF is ready. Your original document stays unchanged.');
  } catch (error) { status(`Couldn't export the PDF. ${error.message}`, true); }
  finally { setProcessing('editor-export', false); updateControls(); }
});
new ResizeObserver(layoutPage).observe($('edit-scroll'));
window.addEventListener('beforeunload', () => Object.values(drafts).forEach(release));
