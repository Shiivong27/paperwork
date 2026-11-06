import { readPdf, parsePageSelection, mergePdfs, extractPages, rotatePages } from './pdf-tools.js';
import { isProcessing, setProcessing } from './tool-state.js';

const $ = id => document.getElementById(id);
const definitions = {
  images: { title: 'Your images.<br>A perfectly simple <em>PDF.</em>', copy: 'Photos, scans, and screenshots, brought together.<br>Add your images, make it yours, and you\'re done.' },
  merge: { title: 'A few PDFs.<br>One tidy <em>document.</em>', copy: 'Bring your documents together, in your order.<br>All your pages, without the back and forth.', heading: 'Bring them together', summary: 'One tidy document', description: 'Combine PDFs in the order shown, with every page included.', button: 'Merge PDFs', name: 'merged' },
  extract: { title: 'Keep the pages.<br>Skip the <em>rest.</em>', copy: 'A chapter, a receipt, or just the good bits.<br>Pick the pages you need and make a fresh PDF.', heading: 'Just what you need', summary: 'A smaller collection', description: 'Choose pages by number or range. Reorder them by entering your preferred sequence.', button: 'Extract pages', name: 'extracted-pages' },
  rotate: { title: 'A fresh angle.<br>The right way <em>up.</em>', copy: 'Sideways scans happen. Fix a page or a whole PDF.<br>Turn only the pages you choose.', heading: 'Find the right angle', summary: 'A better perspective', description: 'Rotate selected pages while keeping the rest of your document intact.', button: 'Rotate PDF', name: 'rotated' },
};
const states = Object.fromEntries(['merge', 'extract', 'rotate'].map(key => [key, { files: [], selection: 'all', angle: 90, filename: definitions[key].name, message: '', error: false, download: null }]));
let active = 'images', busy = false;
const sizeText = value => value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`;
const safeName = text => (text.trim().replace(/\.pdf$/i, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').trim() || 'document') + '.pdf';
function invalidate(state) { if (state.download) URL.revokeObjectURL(state.download.url); state.download = null; }
function notify(state, text = '', error = false) { state.message = text; state.error = error; }
function selection(state) {
  if (!state.files.length || active === 'merge') return { indices: [], error: null };
  try { return { indices: parsePageSelection(state.selection, state.files[0].document.getPageCount()), error: null }; }
  catch (error) { return { indices: [], error: error.message }; }
}
function setTool(tool, focus = false) {
  if (isProcessing()) return;
  active = tool;
  for (const tab of document.querySelectorAll('[data-tool]')) {
    const selected = tab.dataset.tool === tool;
    tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
    if (selected && focus) tab.focus();
  }
  $('image-panel').hidden = tool !== 'images'; $('document-panel').hidden = tool === 'images';
  $('document-panel').setAttribute('aria-labelledby', `tool-${tool}`);
  $('intro-title').innerHTML = definitions[tool].title;
  $('intro-copy').innerHTML = definitions[tool].copy;
  if (tool !== 'images') render();
}
function render() {
  if (active === 'images') return;
  const state = states[active], config = definitions[active], merging = active === 'merge';
  const pages = state.files.reduce((sum, file) => sum + file.document.getPageCount(), 0);
  const picked = selection(state), valid = !picked.error;
  const outputPages = active === 'extract' ? picked.indices.length : pages;
  const canExport = merging ? state.files.length >= 2 && pages <= 1000 : state.files.length === 1 && valid && picked.indices.length > 0;
  $('pdf-count').textContent = state.files.length;
  $('pdf-settings-title').textContent = config.heading;
  $('pdf-summary-title').textContent = config.summary;
  $('pdf-summary-description').textContent = config.description;
  $('pdf-export-label').textContent = busy ? 'Working…' : config.button;
  $('pdf-output-count').textContent = `${outputPages} page${outputPages === 1 ? '' : 's'}`;
  $('pdf-upload-title').textContent = merging ? 'Drop your PDFs here' : 'Drop a PDF here';
  $('pdf-files').multiple = merging;
  $('pdf-dropzone').hidden = state.files.length > 0; $('pdf-dropzone').disabled = busy;
  $('pdf-clear').disabled = !state.files.length || busy;
  $('pdf-list-hint').hidden = !state.files.length;
  $('pdf-list-hint').textContent = merging ? 'Files are merged from top to bottom. Use the arrows to change their order.' : 'Your original file stays unchanged. Choose the pages to work with below.';
  $('pdf-add').hidden = !state.files.length; $('pdf-add').disabled = busy;
  $('pdf-add').textContent = merging ? '＋ Add more PDFs' : '↥ Choose a different PDF';
  $('pdf-export').disabled = !canExport || busy;
  $('pdf-export-note').textContent = !state.files.length ? (merging ? 'Add at least two PDFs to get started' : 'Add a PDF to get started') : merging && state.files.length < 2 ? 'Add one more PDF to merge' : merging && pages > 1000 ? 'Use fewer than 1,001 total pages' : active === 'rotate' ? `${picked.indices.length} of ${pages} pages will rotate` : `${outputPages} pages · ${state.files.length} file${state.files.length === 1 ? '' : 's'} · one PDF`;
  $('pdf-selection-settings').hidden = merging;
  $('pdf-rotation-settings').hidden = active !== 'rotate';
  $('pdf-range').value = state.selection; $('pdf-range').disabled = busy || !state.files.length;
  $('pdf-range').setAttribute('aria-invalid', String(Boolean(picked.error)));
  $('pdf-selection-summary').textContent = picked.error || (state.files.length ? `${picked.indices.length} of ${pages} pages selected` : 'Add a PDF to select its pages.');
  $('pdf-selection-summary').classList.toggle('invalid', Boolean(picked.error));
  $('pdf-range-help').textContent = active === 'extract' ? 'Use “all”, page numbers, or ranges, such as 1, 3-5. Your entered order is preserved.' : 'Use “all”, page numbers, or ranges, such as 1, 3-5. Only these pages will turn.';
  $('pdf-filename').value = state.filename; $('pdf-filename').disabled = busy;
  for (const input of document.querySelectorAll('[name="pdf-angle"]')) { input.checked = Number(input.value) === state.angle; input.disabled = busy; }
  $('pdf-status').textContent = state.message; $('pdf-status').classList.toggle('error', state.error);
  $('pdf-download').hidden = !state.download;
  if (state.download) { $('pdf-download').href = state.download.url; $('pdf-download').download = state.download.filename; }
  for (const tab of document.querySelectorAll('[data-tool]')) tab.disabled = isProcessing();
  renderFiles(state, merging); renderPages(state, picked.indices);
}
function renderFiles(state, merging) {
  $('pdf-list').replaceChildren();
  state.files.forEach((file, index) => {
    const card = document.createElement('article'); card.className = 'pdf-file-card';
    const icon = document.createElement('span'); icon.className = 'pdf-file-icon'; icon.textContent = 'PDF'; icon.setAttribute('aria-hidden', 'true');
    const details = document.createElement('div'); details.className = 'pdf-file-details';
    const name = document.createElement('strong'); name.textContent = file.name; name.title = file.name;
    const meta = document.createElement('span'); meta.textContent = `${file.document.getPageCount()} pages · ${sizeText(file.size)}`;
    details.append(name, meta);
    const actions = document.createElement('div'); actions.className = 'card-actions';
    const commands = merging ? [['↑', 'Move earlier', index === 0, () => reorder(state, index, index - 1)], ['↓', 'Move later', index === state.files.length - 1, () => reorder(state, index, index + 1)]] : [];
    commands.push(['×', 'Remove PDF', false, () => { state.files.splice(index, 1); invalidate(state); notify(state); render(); }]);
    for (const [symbol, label, disabled, action] of commands) {
      const button = document.createElement('button'); button.textContent = symbol; button.disabled = disabled || busy; button.setAttribute('aria-label', `${label}: ${file.name}`); button.title = label; button.addEventListener('click', action); actions.append(button);
    }
    card.append(icon, details, actions); $('pdf-list').append(card);
  });
}
function renderPages(state, indices) {
  $('pdf-page-grid').replaceChildren();
  const visible = active !== 'merge' && state.files.length > 0;
  $('pdf-page-section').hidden = !visible;
  $('pdf-select-all').disabled = busy; $('pdf-select-none').disabled = busy;
  if (!visible) return;
  const chosen = new Set(indices), pages = state.files[0].document.getPages();
  pages.forEach((page, index) => {
    const chip = document.createElement('button'); chip.className = 'page-chip'; chip.disabled = busy;
    const selected = chosen.has(index), current = page.getRotation().angle;
    const resulting = (current + (active === 'rotate' && selected ? state.angle : 0)) % 360;
    const sideways = resulting === 90 || resulting === 270;
    const landscape = sideways ? page.getHeight() > page.getWidth() : page.getWidth() > page.getHeight();
    chip.classList.toggle('chosen', selected); chip.setAttribute('aria-pressed', String(selected));
    chip.setAttribute('aria-label', `Page ${index + 1}${active === 'rotate' ? `, output rotation ${resulting} degrees` : ''}`);
    const paper = document.createElement('span'); paper.className = 'mini-page' + (landscape ? ' landscape' : ''); paper.textContent = selected ? '✓' : '';
    const text = document.createElement('span'); text.textContent = `Page ${index + 1}`;
    const hint = document.createElement('small'); hint.textContent = active === 'rotate' ? `${resulting}°` : `${Math.round(page.getWidth())} × ${Math.round(page.getHeight())} pt`;
    chip.append(paper, text, hint);
    chip.addEventListener('click', () => {
      const next = selection(state).indices;
      state.selection = next.includes(index) ? next.filter(value => value !== index).map(value => value + 1).join(', ') : [...next, index].map(value => value + 1).join(', ');
      invalidate(state); notify(state); render();
      $('pdf-page-grid').children[index]?.focus({ preventScroll: true });
    });
    $('pdf-page-grid').append(chip);
  });
}
function reorder(state, from, to) {
  const [file] = state.files.splice(from, 1); state.files.splice(to, 0, file);
  invalidate(state); notify(state); render();
}
async function addDocuments(files) {
  if (busy || active === 'images' || !files.length) return;
  const state = states[active], merging = active === 'merge';
  if (!merging && files.length !== 1) { notify(state, 'Choose one PDF at a time for this tool.', true); render(); return; }
  busy = true; setProcessing('documents', true); notify(state, 'Reading your PDF…'); render();
  const errors = [];
  try {
    for (const file of files) {
      try {
        if (!window.PDFLib) throw new Error('The PDF library did not load. Refresh the page and try again.');
        if (!file.size || file.size > 30 * 1024 * 1024) throw new Error('Use a PDF between 1 byte and 30 MB.');
        const total = merging ? state.files.reduce((sum, item) => sum + item.size, 0) : 0;
        if (total + file.size > 150 * 1024 * 1024 || merging && state.files.length >= 20) throw new Error('Use up to 20 PDFs and 150 MB in total.');
        const document = await readPdf(await file.arrayBuffer(), window.PDFLib);
        if (merging && document.getPageCount() + state.files.reduce((sum, item) => sum + item.document.getPageCount(), 0) > 1000) throw new Error('Use at most 1,000 pages in total.');
        const item = { document, size: file.size, name: file.name };
        if (merging) state.files.push(item);
        else { state.files = [item]; state.selection = 'all'; }
        invalidate(state);
      } catch (error) { errors.push(`${file.name}: ${error.message}`); }
    }
    notify(state, errors.length ? errors.join('\n') : 'Ready. Your PDFs stay on this device.', Boolean(errors.length));
  } finally { busy = false; setProcessing('documents', false); $('pdf-files').value = ''; render(); }
}
for (const tab of document.querySelectorAll('[data-tool]')) tab.addEventListener('click', () => setTool(tab.dataset.tool));
document.querySelector('.tool-switcher').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || isProcessing()) return;
  event.preventDefault(); const tools = ['images', 'merge', 'extract', 'rotate'];
  const offset = event.key === 'ArrowLeft' ? -1 : 1;
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? 3 : (tools.indexOf(active) + offset + 4) % 4;
  setTool(tools[index], true);
});
for (const id of ['pdf-dropzone', 'pdf-add']) $(id).addEventListener('click', () => $('pdf-files').click());
$('pdf-files').addEventListener('change', event => addDocuments(Array.from(event.target.files)));
document.addEventListener('dragover', event => { if (active !== 'images' && event.dataTransfer.types.includes('Files')) { event.preventDefault(); $('pdf-dropzone').classList.add('dragover'); } });
document.addEventListener('dragleave', event => { if (!event.relatedTarget) $('pdf-dropzone').classList.remove('dragover'); });
document.addEventListener('drop', event => { if (active !== 'images' && event.dataTransfer.files.length) { event.preventDefault(); $('pdf-dropzone').classList.remove('dragover'); addDocuments(Array.from(event.dataTransfer.files)); } });
$('pdf-clear').addEventListener('click', () => { const state = states[active]; state.files = []; state.selection = 'all'; invalidate(state); notify(state); render(); });
$('pdf-range').addEventListener('input', event => { const state = states[active]; state.selection = event.target.value; invalidate(state); notify(state); render(); });
$('pdf-filename').addEventListener('input', event => { const state = states[active]; state.filename = event.target.value; invalidate(state); notify(state); $('pdf-download').hidden = true; $('pdf-status').textContent = ''; });
for (const input of document.querySelectorAll('[name="pdf-angle"]')) input.addEventListener('change', event => { const state = states[active]; state.angle = Number(event.target.value); invalidate(state); notify(state); render(); });
$('pdf-select-all').addEventListener('click', () => { const state = states[active]; state.selection = 'all'; invalidate(state); notify(state); render(); });
$('pdf-select-none').addEventListener('click', () => { const state = states[active]; state.selection = ''; invalidate(state); notify(state); render(); });
$('pdf-export').addEventListener('click', async () => {
  if (busy || active === 'images' || $('pdf-export').disabled) return;
  const state = states[active], tool = active, selected = selection(state).indices;
  busy = true; setProcessing('documents', true); invalidate(state); notify(state, 'Creating your PDF…'); render();
  try {
    let bytes;
    if (tool === 'merge') bytes = await mergePdfs(state.files.map(file => file.document), window.PDFLib);
    else if (tool === 'extract') bytes = await extractPages(state.files[0].document, selected, window.PDFLib);
    else bytes = await rotatePages(state.files[0].document, selected, state.angle, window.PDFLib);
    state.download = { url: URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), filename: safeName(state.filename) };
    const pages = tool === 'extract' ? selected.length : state.files.reduce((sum, file) => sum + file.document.getPageCount(), 0);
    notify(state, `Your ${pages}-page PDF is ready. Download it below.`);
    $('pdf-download').href = state.download.url; $('pdf-download').download = state.download.filename;
    $('pdf-download').click();
  } catch (error) { notify(state, `Couldn't create the PDF. ${error.message}`, true); }
  finally { busy = false; setProcessing('documents', false); render(); }
});
document.addEventListener('paperwork-processing', () => {
  for (const tab of document.querySelectorAll('[data-tool]')) tab.disabled = isProcessing();
});
window.addEventListener('beforeunload', () => Object.values(states).forEach(invalidate));
