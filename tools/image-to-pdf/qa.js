// Browser integration checks, served only when PAPERWORK_QA=1.
import './app.js';
import { pageLayout } from './pdf.js';
import { runDocumentChecks } from './qa-document-tools.js';
import { runEditorChecks, runFormChecks } from './qa-editor.js';
const $ = id => document.getElementById(id);
const report = document.createElement('output'); report.id = 'qa-result'; report.hidden = true; document.body.append(report);
const assert = (value, text) => { if (!value) throw new Error(text); };
async function until(predicate) {
  const deadline = Date.now() + 20000;
  while (!predicate()) { if (Date.now() > deadline) throw new Error('Timed out waiting for app state: ' + $('message').textContent); await new Promise(resolve => setTimeout(resolve, 30)); }
}
async function fixture(name, width, height, type, color) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 28px sans-serif'; ctx.fillText(name, 24, 55);
  ctx.fillStyle = '#f7d98d'; ctx.fillRect(18, 80, 60, 60); ctx.fillStyle = '#fff'; ctx.fillRect(width - 80, height - 80, 60, 60);
  if (type === 'image/png') ctx.clearRect(width / 2 - 20, height / 2 - 20, 40, 40);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, type));
  return new File([blob], name, { type });
}
function upload(files) { const transfer = new DataTransfer(); files.forEach(file => transfer.items.add(file)); $('files').files = transfer.files; $('files').dispatchEvent(new Event('change', { bubbles: true })); }
let pdfBlob;
const createObjectURL = URL.createObjectURL.bind(URL);
URL.createObjectURL = blob => { if (blob.type === 'application/pdf') pdfBlob = blob; return createObjectURL(blob); };
document.addEventListener('click', event => { if (event.target.closest('a[download]')) event.preventDefault(); }, true);
try {
  assert($('convert').disabled, 'Empty export must be disabled');
  upload([new File(['no image'], 'fake.png', { type: 'image/png' })]);
  await until(() => !$('dropzone').disabled);
  assert($('count').textContent === '0' && $('message').classList.contains('error'), 'Invalid image must be rejected');
  const jpeg = await fixture('01-landscape.jpg', 640, 400, 'image/jpeg', '#345d49');
  const png = await fixture('02-portrait.png', 320, 480, 'image/png', '#a16d4c');
  upload([jpeg, png]); await until(() => !$('convert').disabled);
  assert($('count').textContent === '2', 'Both JPEG and PNG must be accepted');
  document.querySelector('[aria-label="Move later: 01-landscape.jpg"]').click();
  assert(document.querySelector('.image-name').textContent === png.name, 'Move later must reorder pages');
  $('sort').click(); assert(document.querySelector('.image-name').textContent === jpeg.name, 'Natural filename sorting must work');
  document.querySelector('[aria-label="Rotate clockwise: 01-landscape.jpg"]').click();
  assert(document.querySelector('.thumb-button img').style.transform === 'rotate(90deg)', 'Rotation must update the thumbnail');
  $('filename').value = 'browser-test';
  $('convert').click();
  assert($('tool-merge').disabled, 'Image processing must lock tool switching');
  $('tool-merge').click(); assert(!$('image-panel').hidden, 'Tool switch must be blocked while images are processing');
  await until(() => !$('convert').disabled && !$('download-again').hidden);
  assert(pdfBlob, 'Export must create a downloadable PDF');
  const pdf = await PDFLib.PDFDocument.load(await pdfBlob.arrayBuffer());
  assert(pdf.getPageCount() === 2, 'Export must contain one page per image');
  assert(pdf.getPages().every(page => page.getWidth() < page.getHeight()), 'Auto orientation must use rotated dimensions');
  assert($('download-again').download === 'browser-test.pdf', 'Filename must be preserved');
  const rotated = document.createElement('textarea'); rotated.id = 'qa-rotated-pdf'; rotated.hidden = true;
  rotated.textContent = btoa(Array.from(new Uint8Array(await pdfBlob.arrayBuffer()), byte => String.fromCharCode(byte)).join('')); document.body.append(rotated);
  const angles = [0, 90, 180, 270];
  for (const angle of angles) for (const size of ['a4', 'letter', 'image']) {
    const layout = pageLayout(640, 400, angle, { size, margin: 36, orientation: 'auto' });
    assert(layout.x >= 35.99 && layout.y >= 35.99, `Margins must fit for ${size}/${angle}`);
    assert(layout.x + layout.boxWidth <= layout.pageWidth - 35.99, 'Image must fit horizontal bounds');
    assert(layout.y + layout.boxHeight <= layout.pageHeight - 35.99, 'Image must fit vertical bounds');
  }
  $('size').value = 'image'; $('size').dispatchEvent(new Event('input'));
  assert($('orientation-field').disabled && $('download-again').hidden, 'Fit-to-image must disable orientation and clear stale download');
  $('size').value = 'a4'; $('size').dispatchEvent(new Event('input'));
  document.querySelector('[aria-label="Remove: 02-portrait.png"]').click();
  assert($('count').textContent === '1', 'Remove must update page count');
  $('clear').click(); assert($('count').textContent === '0' && $('convert').disabled, 'Clear must reset the workspace');
  upload([jpeg, png]); await until(() => !$('convert').disabled);
  $('convert').click(); await until(() => !$('convert').disabled && !$('download-again').hidden);
  const encoded = document.createElement('textarea'); encoded.id = 'qa-pdf'; encoded.hidden = true;
  const bytes = new Uint8Array(await pdfBlob.arrayBuffer());
  encoded.textContent = btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join('')); document.body.append(encoded);
  assert(document.documentElement.scrollWidth <= innerWidth, 'App must not overflow the viewport');
  await runDocumentChecks(assert, until, () => pdfBlob);
  await runEditorChecks(assert, until, () => pdfBlob);
  await runFormChecks(assert, until, () => pdfBlob);
  report.textContent = 'PASS: existing tools; editor/signature regression; form working-copy choice; cancel preserves draft; current form values; original file preservation; widget removal; signing an empty signature box.';
  report.dataset.status = 'passed';
} catch (error) { report.textContent = 'FAIL: ' + error.message; report.dataset.status = 'failed'; console.error(error); }
