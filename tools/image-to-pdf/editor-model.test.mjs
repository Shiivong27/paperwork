import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import library from 'pdf-lib';
import { EditHistory, boundMark, inverseTransform, overlayTransform, exportEdits, inspectEditorPdf, flattenEditorForm } from './editor-model.js';

const point = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
test('overlay mapping matches display coordinates at all rotations, crop offsets, and UserUnit scale', () => {
  for (const [matrix, width, height] of [
    [[1, 0, 0, -1, -10, 520], 300, 500], [[0, 1, 1, 0, -20, -10], 500, 300],
    [[-1, 0, 0, 1, 310, -20], 300, 500], [[0, -1, -1, 0, 520, 310], 500, 300],
    [[2, 0, 0, -2, -20, 1040], 600, 1000],
  ]) {
    const overlay = overlayTransform(matrix, height);
    for (const [x, y] of [[0, 0], [0, height], [width, 0], [width, height], [width / 3, height / 2]]) {
      const pdfPoint = point(overlay, x, y), displayPoint = point(matrix, ...pdfPoint);
      assert.ok(Math.abs(displayPoint[0] - x) < 1e-8);
      assert.ok(Math.abs(displayPoint[1] - (height - y)) < 1e-8);
    }
  }
  assert.throws(() => inverseTransform([0, 0, 0, 0, 0, 0]));
  assert.throws(() => inverseTransform([1, NaN, 0, 1, 0, 0]));
});
test('object bounds keep moves and resizes on the displayed page', () => {
  assert.deepEqual(boundMark({ x: -10, y: 500, w: 80, h: 100 }, 300, 500), { x: 0, y: 400, w: 80, h: 100 });
  assert.deepEqual(boundMark({ x: 10, y: 20, w: 1000, h: 1000 }, 300, 500), { x: 0, y: 0, w: 300, h: 500 });
  assert.throws(() => boundMark({ x: NaN, y: 0, w: 20, h: 20 }, 300, 500));
});
test('history restores complete immutable object states, supports redo, and clears redo after a new edit', () => {
  const history = new EditHistory(), marks = [{ id: 'a', pageIndex: 0, text: 'First', x: 5, y: 10 }];
  history.commit(marks); marks[0].text = 'Mutated outside history';
  assert.equal(history.marks[0].text, 'First');
  history.commit([{ ...history.marks[0], x: 100 }]);
  assert.equal(history.undo(), true); assert.equal(history.marks[0].x, 5);
  assert.equal(history.redo(), true); assert.equal(history.marks[0].x, 100);
  history.undo(); history.commit([]); assert.equal(history.future.length, 0);
  history.undo(); assert.equal(history.marks[0].text, 'First');
  for (let index = 0; index < 70; index++) history.commit([{ id: String(index) }]);
  assert.equal(history.past.length, 50);
});
function png() {
  const crc = bytes => { let value = 0xffffffff; for (const byte of bytes) { value ^= byte; for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1; } return (value ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const name = Buffer.from(type), length = Buffer.alloc(4), checksum = Buffer.alloc(4); length.writeUInt32BE(data.length); checksum.writeUInt32BE(crc(Buffer.concat([name, data]))); return Buffer.concat([length, name, data, checksum]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.from([0, 255, 0, 0, 128]))), chunk('IEND', Buffer.alloc(0))]);
}
test('export keeps original pages, crop box and rotation; repeat exports do not accumulate additions', async () => {
  const source = await library.PDFDocument.create();
  const first = source.addPage([400, 600]); first.drawText('Original vector text'); first.setCropBox(10, 20, 300, 500); first.setRotation(library.degrees(90));
  source.addPage([500, 700]).drawText('Untouched second page');
  const bytes = await source.save(), original = Buffer.from(bytes);
  const overlays = [{ pageIndex: 0, width: 500, height: 300, transform: [0, 1, 1, 0, -20, -10], pngBytes: png() }];
  let contentCount;
  for (let repeat = 0; repeat < 2; repeat++) {
    const output = await library.PDFDocument.load(await exportEdits(bytes, overlays, library));
    assert.equal(output.getPageCount(), 2); assert.equal(output.getPage(0).getRotation().angle, 90);
    assert.deepEqual(output.getPage(0).getCropBox(), { x: 10, y: 20, width: 300, height: 500 });
    const contents = output.getPage(0).node.Contents().size();
    if (repeat) assert.equal(contents, contentCount); else contentCount = contents;
    assert.ok(contents > first.node.Contents().size());
    assert.equal(output.getPage(1).getWidth(), 500);
  }
  assert.deepEqual(Buffer.from(bytes), original);
  await assert.rejects(exportEdits(bytes, [], library), /Add something/);
  await assert.rejects(exportEdits(bytes, [{ ...overlays[0], pageIndex: 9 }], library), /Invalid edited page/);
});

async function formFixture(signed = false) {
  const pdf = await library.PDFDocument.create(), page = pdf.addPage([400, 600]), form = pdf.getForm();
  page.drawText('Original page text');
  const field = form.createTextField('Customer'); field.setText('Alex Morgan'); field.addToPage(page, { x: 40, y: 400, width: 250, height: 30 });
  const signature = pdf.context.obj({ Type: 'Annot', Subtype: 'Widget', FT: 'Sig', T: library.PDFHexString.fromText('Signature'), Rect: [40, 100, 280, 150], P: page.ref });
  if (signed) signature.set(library.PDFName.of('V'), pdf.context.obj({ Type: 'Sig', Contents: library.PDFHexString.of('30010203'), ByteRange: [0, 30, 40, 100] }));
  const signatureRef = pdf.context.register(signature); page.node.addAnnot(signatureRef); form.acroForm.addField(signatureRef);
  const link = pdf.context.register(pdf.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [10, 10, 40, 20] })); page.node.addAnnot(link);
  return pdf.save();
}
test('editor accepts ordinary forms and empty signature widgets without changing the source', async () => {
  const bytes = await formFixture(), before = Buffer.from(bytes), inspected = await inspectEditorPdf(bytes, library);
  assert.equal(inspected.fieldCount, 2); assert.equal(inspected.widgetPages.length, 1);
  assert.equal(inspected.widgetPages[0].rectangles.length, 2);
  assert.equal(inspected.fieldHasValue.get('Customer'), true);
  assert.equal(inspected.fieldHasValue.get('Signature'), false);
  assert.deepEqual(Buffer.from(bytes), before);
  assert.equal((await library.PDFDocument.load(bytes)).getForm().getTextField('Customer').getText(), 'Alex Morgan');
});
test('flat working copies remove all widgets and form fields while retaining other annotations and page content', async () => {
  const bytes = await formFixture(), before = Buffer.from(bytes);
  const output = await library.PDFDocument.load(await flattenEditorForm(bytes, [{ pageIndex: 0, width: 400, height: 600, transform: [1, 0, 0, -1, 0, 600], pngBytes: png() }], library));
  assert.equal(output.catalog.has(library.PDFName.of('AcroForm')), false);
  const annotations = output.getPage(0).node.Annots(); assert.equal(annotations.size(), 1);
  assert.equal(output.context.lookup(annotations.get(0)).get(library.PDFName.of('Subtype')).toString(), '/Link');
  assert.ok(output.getPage(0).node.Contents().size() > 1);
  assert.deepEqual(Buffer.from(bytes), before);
  await assert.rejects(flattenEditorForm(bytes, [], library), /incomplete/);
});
test('certificate signature values, XFA forms and orphan form widgets have separate actionable errors', async () => {
  await assert.rejects(inspectEditorPdf(await formFixture(true), library), /certificate signature/);
  const xfa = await library.PDFDocument.create(); xfa.addPage(); xfa.getForm().acroForm.dict.set(library.PDFName.of('XFA'), xfa.context.obj([]));
  await assert.rejects(inspectEditorPdf(await xfa.save({ updateFieldAppearances: false }), library), /XFA forms/);
  const orphan = await library.PDFDocument.create(), page = orphan.addPage();
  page.node.addAnnot(orphan.context.register(orphan.context.obj({ Type: 'Annot', Subtype: 'Widget', FT: 'Tx', Rect: [10, 10, 50, 30] })));
  await assert.rejects(inspectEditorPdf(await orphan.save(), library), /inconsistent form structure/);
});
