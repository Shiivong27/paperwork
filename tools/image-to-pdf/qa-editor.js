export async function runEditorChecks(assert, until, getBlob) {
  const $ = id => document.getElementById(id);
  const count = () => Number.parseInt($('edit-mark-count').textContent);
  const ready = () => until(() => !$('tool-edit').disabled && !$('edit-workbench').hidden && $('edit-page').dataset.ready === 'ready');
  const upload = (id, file) => { const transfer = new DataTransfer(); transfer.items.add(file); $(id).files = transfer.files; $(id).dispatchEvent(new Event('change', { bubbles: true })); };
  const property = (id, value, event = 'change') => { $(id).value = value; $(id).dispatchEvent(new Event(event, { bubbles: true })); };
  const retain = async id => { const element = document.createElement('textarea'); element.id = id; element.hidden = true; element.textContent = btoa(Array.from(new Uint8Array(await getBlob().arrayBuffer()), byte => String.fromCharCode(byte)).join('')); document.body.append(element); };
  const exported = async () => { $('edit-export').click(); assert($('tool-edit').disabled, 'Export must lock navigation'); await until(() => !$('tool-edit').disabled && !$('edit-download').hidden); return PDFLib.PDFDocument.load(await getBlob().arrayBuffer()); };
  const pointer = (target, type, x, y, id = 42) => target.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: innerWidth < 660 ? 'touch' : 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y, bubbles: true }));
  const image = document.createElement('canvas'); image.width = 180; image.height = 90;
  const ink = image.getContext('2d'); ink.fillStyle = '#42704e'; ink.fillRect(0, 0, 180, 90); ink.fillStyle = '#fff'; ink.font = '24px sans-serif'; ink.fillText('Sample', 35, 55);
  const logo = new File([await new Promise(resolve => image.toBlob(resolve, 'image/png'))], 'sample-image.png', { type: 'image/png' });

  $('tool-edit').click();
  upload('edit-file', new File(['not a pdf'], 'invalid.pdf', { type: 'application/pdf' }));
  await until(() => !$('tool-edit').disabled);
  assert($('edit-status').classList.contains('error'), 'Editor must reject malformed PDFs');
  $('edit-demo').click(); await ready();
  assert($('edit-base').width > 0 && $('edit-page-select').options.length === 2, 'Sample pages must render');
  $('edit-add-text').click(); property('edit-text', 'Reviewed ✓ — café', 'input'); property('edit-x', 55); property('edit-y', 270);
  assert(count() === 1 && $('edit-text').value.includes('café'), 'Unicode text must be editable');
  $('edit-add-highlight').click(); property('edit-x', 45); property('edit-y', 205); property('edit-width', 320);
  $('edit-add-rectangle').click(); property('edit-x', 45); property('edit-y', 330); property('edit-width', 200);
  $('edit-add-ellipse').click(); property('edit-color', '#ad6146', 'input');
  upload('edit-image-file', logo); await until(() => !$('tool-edit').disabled && count() === 5);
  let mark = $('edit-objects').querySelector('.selected'), before = mark.style.left, rect = mark.getBoundingClientRect();
  pointer(mark, 'pointerdown', rect.x + 15, rect.y + 15); pointer(mark, 'pointermove', rect.x + 35, rect.y + 30); pointer(mark, 'pointerup', rect.x + 35, rect.y + 30);
  mark = $('edit-objects').querySelector('.selected'); assert(mark.style.left !== before, 'Dragging must move additions');
  before = mark.style.width; rect = mark.getBoundingClientRect(); const handle = mark.querySelector('.resize-handle');
  pointer(handle, 'pointerdown', rect.right, rect.bottom, 43); pointer(mark, 'pointermove', rect.right + 25, rect.bottom + 15, 43); pointer(mark, 'pointerup', rect.right + 25, rect.bottom + 15, 43);
  mark = $('edit-objects').querySelector('.selected'); assert(mark.style.width !== before, 'Corner dragging must resize additions');
  $('edit-undo').click(); assert($('edit-objects').querySelector('.selected').style.width === before, 'Undo must restore the prior size');
  $('edit-redo').click(); assert($('edit-objects').querySelector('.selected').style.width !== before, 'Redo must restore the resized addition');
  before = $('edit-x').value; $('edit-objects').querySelector('.selected').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert(Number($('edit-x').value) > Number(before), 'Arrow keys must move the selected object');
  property('edit-opacity', '.65', 'input');
  const pixels = $('edit-objects').querySelector('.selected canvas').getContext('2d').getImageData(10, 10, 1, 1).data;
  assert(pixels[3] > 100 && pixels[3] < 230, 'Opacity must affect rendered additions');
  $('edit-next').click(); await ready(); $('edit-add-text').click(); property('edit-text', 'Notes on the second page', 'input');
  const result = await exported(); assert(result.getPageCount() === 2, 'Export must retain original pages');
  const contents = result.getPage(0).node.Contents().size();
  await retain('qa-editor-output');
  const repeated = await exported(); assert(repeated.getPage(0).node.Contents().size() === contents, 'Repeated exports must not accumulate additions');
  property('edit-color', '#42704e', 'input'); assert($('edit-download').hidden, 'Changing additions must invalidate downloads');
  $('edit-delete').click(); assert(count() === 5, 'Delete must remove the selected addition'); $('edit-undo').click(); assert(count() === 6, 'Deleted additions must be recoverable');

  // Use real CropBox and rotation metadata, then verify exported pixels through
  // PDF.js independently of the editor's DOM positioning.
  const crop = await PDFLib.PDFDocument.create();
  for (const angle of [0, 90]) { const page = crop.addPage([400, 600]); page.setCropBox(30, 40, 300, 500); page.setRotation(PDFLib.degrees(angle)); page.drawText('Original page content', { x: 50, y: 450, size: 13 }); }
  upload('edit-file', new File([await crop.save()], 'crop-and-rotation.pdf', { type: 'application/pdf' })); await ready();
  for (let index = 0; index < 2; index++) {
    if (index) { $('edit-next').click(); await ready(); }
    $('edit-add-rectangle').click(); $('edit-fill').checked = true; $('edit-fill').dispatchEvent(new Event('change'));
    property('edit-color', '#d02929', 'input'); property('edit-x', 20); property('edit-y', 20); property('edit-width', 50); property('edit-height', 35);
  }
  const croppedOutput = await exported(); assert(croppedOutput.getPage(1).getRotation().angle === 90, 'Original rotation must survive editing');
  assert(croppedOutput.getPage(0).getCropBox().x === 30, 'Original crop offsets must survive editing'); await retain('qa-editor-cropped-output');
  const pdfjs = await import('./pdfjs/pdf.mjs');
  const rendered = await pdfjs.getDocument({ data: new Uint8Array(await getBlob().arrayBuffer()), standardFontDataUrl: new URL('./pdfjs/standard_fonts/', import.meta.url).href, isEvalSupported: false }).promise;
  for (let index = 1; index <= 2; index++) {
    const page = await rendered.getPage(index), viewport = page.getViewport({ scale: 1 }), canvas = document.createElement('canvas'); canvas.width = viewport.width; canvas.height = viewport.height;
    await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise;
    const rgba = canvas.getContext('2d').getImageData(30, 30, 1, 1).data;
    assert(Math.abs(rgba[0] - 208) < 6 && Math.abs(rgba[1] - 41) < 6 && Math.abs(rgba[2] - 41) < 6, 'Exported placement must match the displayed cropped/rotated page');
  }
  await rendered.loadingTask.destroy();
  $('edit-reset').click(); assert(count() === 0, 'Clear additions must clear all pages'); $('edit-undo').click(); assert(count() === 2, 'Clear additions must be undoable');

  $('tool-sign').click(); assert($('edit-workbench').hidden, 'Signing must start with its own draft');
  $('edit-demo').click(); await ready(); property('sign-name', 'Alex Morgan', 'input'); property('sign-date', '2026-11-07', 'input');
  $('sign-type').click(); assert($('signature-dialog').open && !$('signature-use').disabled, 'Typed signature must use the signer name');
  $('signature-use').click(); await until(() => !$('tool-sign').disabled && count() === 1);
  $('sign-add-name').click(); $('sign-add-date').click(); assert(count() === 3, 'Name and date must be separate movable additions');
  assert($('edit-text').value.includes('2026'), 'Date must be inserted without timezone shifts');
  $('sign-draw').click(); $('signature-clear').click(); assert($('signature-use').disabled, 'Empty drawing must not be accepted');
  const pen = $('signature-canvas'), box = pen.getBoundingClientRect();
  const draw = () => { pointer(pen, 'pointerdown', box.left + 30, box.top + 70, 99); for (let x = 40; x < 200; x += 10) pointer(pen, 'pointermove', box.left + x, box.top + 70 + Math.sin(x / 20) * 20, 99); pointer(pen, 'pointerup', box.left + 200, box.top + 70, 99); };
  draw(); assert(!$('signature-use').disabled, 'Pointer drawing must create a signature'); $('signature-clear').click(); assert($('signature-use').disabled, 'Clear drawing must reset the signature');
  draw(); $('signature-use').click(); await until(() => !$('tool-sign').disabled && count() === 4);
  $('sign-upload').click(); upload('edit-image-file', logo); await until(() => !$('tool-sign').disabled && count() === 5);
  assert($('edit-properties-title').textContent === 'Signature', 'Uploaded signature must be a resizable signature addition');
  const signed = await exported(); assert(signed.getPageCount() === 2, 'Signing must retain original page count');
  assert($('edit-scope-note').textContent.includes('not certificate-based'), 'Signing scope must be explicit');
  $('edit-delete').click();
  const signatures = Array.from($('edit-objects').children).filter(element => element.getAttribute('aria-label').startsWith('Signature'));
  signatures.at(-1).focus(); $('edit-delete').click(); assert(count() === 3, 'Signature additions must support removal');
  await exported(); await retain('qa-signed-output');
  $('tool-edit').click(); await ready(); assert(count() === 2, 'Editing draft must survive signing tool changes');
  $('edit-demo').click(); await ready();
  $('edit-add-text').click(); property('edit-text', 'Reviewed and ready', 'input'); property('edit-x', 50); property('edit-y', 270);
  $('edit-add-highlight').click(); property('edit-x', 45); property('edit-y', 205); property('edit-width', 320);
  assert(document.documentElement.scrollWidth <= innerWidth, 'Visual editor must fit the viewport');
}

export async function runFormChecks(assert, until, getBlob) {
  const $ = id => document.getElementById(id);
  const ready = () => until(() => !$('tool-edit').disabled && !$('edit-workbench').hidden && $('edit-page').dataset.ready === 'ready');
  const upload = file => { const transfer = new DataTransfer(); transfer.items.add(file); $('edit-file').files = transfer.files; $('edit-file').dispatchEvent(new Event('change', { bubbles: true })); };
  const source = await PDFLib.PDFDocument.create(), page = source.addPage([595, 842]), form = source.getForm();
  page.drawText('Form compatibility sample', { x: 50, y: 765, size: 20 });
  page.drawText('Name', { x: 50, y: 655, size: 12 });
  const name = form.createTextField('Customer'); name.setText('OLD'); name.addToPage(page, { x: 50, y: 600, width: 300, height: 32, borderWidth: 0 }); name.setFontSize(18);
  const check = form.createCheckBox('Approved'); check.addToPage(page, { x: 50, y: 530, width: 20, height: 20 }); check.check();
  const choice = form.createDropdown('Status'); choice.addOptions(['Draft', 'Approved']); choice.select('Approved'); choice.addToPage(page, { x: 100, y: 525, width: 180, height: 30 });
  page.drawText('Signature', { x: 50, y: 310, size: 12 });
  const signature = source.context.obj({ Type: 'Annot', Subtype: 'Widget', FT: 'Sig', T: PDFLib.PDFHexString.fromText('Signature'), Rect: [50, 210, 350, 280], P: page.ref });
  const ref = source.context.register(signature); page.node.addAnnot(ref); form.acroForm.addField(ref);
  form.updateFieldAppearances(); name.setText('CURRENT VALUE');
  const original = await source.save({ updateFieldAppearances: false }), file = new File([original], 'fillable-form.pdf', { type: 'application/pdf' });
  $('tool-edit').click(); await ready();
  const oldCount = $('edit-mark-count').textContent;
  upload(file); await until(() => !$('tool-edit').disabled && !$('edit-form-choice').hidden);
  assert($('edit-workbench').hidden && $('edit-export').disabled, 'Forms must offer an explicit working-copy choice');
  $('edit-form-cancel').click(); await ready(); assert($('edit-mark-count').textContent === oldCount, 'Cancelling must preserve the existing draft');
  upload(file); await until(() => !$('tool-edit').disabled && !$('edit-form-choice').hidden);
  $('edit-form-prepare').click(); await ready();
  assert($('edit-file-name').textContent.includes('flat form copy'), 'Prepared forms must be labelled');
  const canvas = $('edit-base'), sx = canvas.width / 595, sy = canvas.height / 842;
  const pixels = canvas.getContext('2d').getImageData(Math.round(52 * sx), Math.round(212 * sy), Math.round(295 * sx), Math.round(27 * sy));
  let left = pixels.width, right = 0;
  for (let y = 0; y < pixels.height; y++) for (let x = 0; x < pixels.width; x++) { const offset = (y * pixels.width + x) * 4; if (pixels.data[offset] < 100 && pixels.data[offset + 1] < 100 && pixels.data[offset + 2] < 100) { left = Math.min(left, x); right = Math.max(right, x); } }
  assert((right - left) / sx > 80, 'Current canonical text must be rendered, not the stale OLD appearance');
  $('edit-add-text').click(); $('edit-text').value = 'Added on the form'; $('edit-text').dispatchEvent(new Event('input'));
  $('edit-export').click(); await until(() => !$('tool-edit').disabled && !$('edit-download').hidden);
  const flattened = await PDFLib.PDFDocument.load(await getBlob().arrayBuffer());
  assert(!flattened.catalog.has(PDFLib.PDFName.of('AcroForm')), 'Prepared output must have no reachable form tree');
  assert(!flattened.getPage(0).node.Annots()?.size(), 'Prepared output must have no leftover widgets covering additions');
  const untouched = await PDFLib.PDFDocument.load(await file.arrayBuffer());
  assert(untouched.getForm().getTextField('Customer').getText() === 'CURRENT VALUE' && untouched.getForm().getCheckBox('Approved').isChecked(), 'The original file and its interactive values must stay unchanged');
  $('tool-sign').click(); await ready(); upload(file);
  await until(() => !$('tool-sign').disabled && !$('edit-form-choice').hidden); $('edit-form-prepare').click(); await ready();
  $('sign-name').value = 'Alex Morgan'; $('sign-name').dispatchEvent(new Event('input')); $('sign-type').click(); $('signature-use').click();
  await until(() => !$('tool-sign').disabled && $('edit-mark-count').textContent.startsWith('1 '));
  $('edit-y').value = '575'; $('edit-y').dispatchEvent(new Event('change')); $('sign-add-name').click();
  $('edit-export').click(); await until(() => !$('tool-sign').disabled && !$('edit-download').hidden);
  const result = document.createElement('textarea'); result.id = 'qa-form-signed-output'; result.hidden = true;
  result.textContent = btoa(Array.from(new Uint8Array(await getBlob().arrayBuffer()), byte => String.fromCharCode(byte)).join('')); document.body.append(result);
}
