import test from 'node:test';
import assert from 'node:assert/strict';
import library from 'pdf-lib';
import { parsePageSelection, readPdf, mergePdfs, extractPages, rotatePages } from './pdf-tools.js';

async function fixture(widths = [300, 400, 500]) {
  const document = await library.PDFDocument.create();
  for (const [index, width] of widths.entries()) {
    const page = document.addPage([width, 600]);
    page.drawText(`Original page ${index + 1}`, { x: 25, y: 500 });
  }
  return document;
}

test('page selection preserves entered order and removes repeated pages', () => {
  assert.deepEqual(parsePageSelection(' 5, 2 - 4, 2, 1 ', 5), [4, 1, 2, 3, 0]);
  assert.deepEqual(parsePageSelection(' ALL ', 3), [0, 1, 2]);
  assert.deepEqual(parsePageSelection('1-1', 1), [0]);
});

test('page selection rejects incomplete, invalid, descending and out-of-range input', () => {
  for (const value of ['', ' ', '1,,2', '1,', '-1', '0', '4', '1-4', '3-1', '1.5', '1e2', 'all,1', '1-', '9007199254740992']) {
    assert.throws(() => parsePageSelection(value, 3), Error, value);
  }
  for (const count of [0, -1, 1.5, 1001]) assert.throws(() => parsePageSelection('all', count));
});

test('reads valid documents and rejects malformed, empty and oversized PDFs', async () => {
  const document = await fixture();
  assert.equal((await readPdf(await document.save(), library)).getPageCount(), 3);
  await assert.rejects(readPdf(new TextEncoder().encode('not a PDF'), library), /valid, undamaged PDF/);
  const empty = await library.PDFDocument.create();
  await assert.rejects(readPdf(await empty.save({ addDefaultPage: false }), library), /no pages/);
  const large = await library.PDFDocument.create();
  for (let i = 0; i < 1001; i++) large.addPage();
  await assert.rejects(readPdf(await large.save(), library), /1000 pages/);
});

test('rejects interactive forms and documents marked encrypted', async () => {
  const formDocument = await fixture([300]);
  formDocument.getForm().createTextField('name').addToPage(formDocument.getPage(0));
  await assert.rejects(readPdf(await formDocument.save(), library), /flattened copy/);
  await assert.rejects(mergePdfs([formDocument, await fixture([400])], library), /flattened copy/);
  const encrypted = await fixture([300]);
  encrypted.context.trailerInfo.Encrypt = encrypted.context.register(encrypted.context.obj({ Filter: library.PDFName.of('Standard') }));
  await assert.rejects(readPdf(await encrypted.save(), library), /Password-protected/);
});

test('merge preserves document order, page dimensions, rotation and content streams', async () => {
  const first = await fixture([300, 400]);
  const second = await fixture([500]); second.getPage(0).setRotation(library.degrees(90));
  const merged = await readPdf(await mergePdfs([second, first], library), library);
  assert.deepEqual(merged.getPages().map(page => page.getWidth()), [500, 300, 400]);
  assert.deepEqual(merged.getPages().map(page => page.getRotation().angle), [90, 0, 0]);
  assert.ok(merged.getPages().every(page => page.node.Contents()), 'original vector/text content remains attached');
  assert.equal(first.getPageCount(), 2); assert.equal(second.getPageCount(), 1);
  await assert.rejects(mergePdfs([first], library), /at least two/);
  const many = await fixture(Array(501).fill(300));
  await assert.rejects(mergePdfs([many, many], library), /1000 pages/);
});

test('extract preserves requested order and leaves the original intact', async () => {
  const source = await fixture();
  const selected = await readPdf(await extractPages(source, [2, 0], library), library);
  assert.deepEqual(selected.getPages().map(page => page.getWidth()), [500, 300]);
  assert.ok(selected.getPages().every(page => page.node.Contents()));
  assert.equal(source.getPageCount(), 3);
  for (const indices of [[], [-1], [3], [1.5], [0, 0]]) await assert.rejects(extractPages(source, indices, library));
});

test('rotation adds to existing angles, affects only selected pages and does not accumulate between exports', async () => {
  const source = await fixture(); source.getPage(0).setRotation(library.degrees(270));
  for (let repeat = 0; repeat < 2; repeat++) {
    const rotated = await readPdf(await rotatePages(source, [0, 2], 90, library), library);
    assert.deepEqual(rotated.getPages().map(page => page.getRotation().angle), [0, 0, 90]);
    assert.ok(rotated.getPages().every(page => page.node.Contents()));
    assert.deepEqual(source.getPages().map(page => page.getRotation().angle), [270, 0, 0]);
  }
  const halfTurn = await readPdf(await rotatePages(source, [1], 180, library), library);
  assert.equal(halfTurn.getPage(1).getRotation().angle, 180);
  const leftTurn = await readPdf(await rotatePages(source, [1], 270, library), library);
  assert.equal(leftTurn.getPage(1).getRotation().angle, 270);
  for (const angle of [0, 45, -90, 360, '90']) await assert.rejects(rotatePages(source, [0], angle, library), /rotation/);
  await assert.rejects(rotatePages(source, [3], 90, library), /between/);
});
