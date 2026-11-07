const MAX_PAGES = 1000;

function pageCount(document) {
  if (!document || typeof document.getPageCount !== 'function') {
    throw new Error('Choose a valid PDF document.');
  }
  const count = document.getPageCount();
  if (!count) throw new Error('This PDF has no pages.');
  if (count > MAX_PAGES) throw new Error(`Use a PDF with no more than ${MAX_PAGES} pages.`);
  return count;
}

function checkDocument(document, library, { allowForms = false } = {}) {
  const count = pageCount(document);
  if (document.isEncrypted) throw new Error('Password-protected PDFs are not supported. Use an unprotected copy.');
  if (!allowForms && document.catalog.has(library.PDFName.of('AcroForm')) && document.getForm().getFields().length) {
    throw new Error('Interactive PDF forms are not supported. Export a flattened copy first.');
  }
  return count;
}

function checkIndices(indices, count) {
  if (!Array.isArray(indices) || !indices.length) throw new Error('Select at least one page.');
  if (indices.some(index => !Number.isInteger(index) || index < 0 || index >= count)) {
    throw new Error(`Choose pages between 1 and ${count}.`);
  }
  if (new Set(indices).size !== indices.length) throw new Error('Select each page only once.');
}

export function parsePageSelection(text, count) {
  if (!Number.isInteger(count) || count < 1 || count > MAX_PAGES) {
    throw new Error(`Use a PDF with between 1 and ${MAX_PAGES} pages.`);
  }
  if (typeof text !== 'string' || !text.trim()) throw new Error('Enter page numbers, a range, or all.');
  const value = text.trim();
  if (value.toLowerCase() === 'all') return Array.from({ length: count }, (_, index) => index);
  const selected = new Set();
  for (const part of value.split(',')) {
    const match = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part);
    if (!match) throw new Error('Use page numbers and ranges, such as 1, 3-5, 8.');
    const first = Number(match[1]), last = match[2] === undefined ? first : Number(match[2]);
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first < 1 || last > count) {
      throw new Error(`Choose pages between 1 and ${count}.`);
    }
    if (last < first) throw new Error('Enter ranges in ascending order, such as 3-5.');
    for (let number = first; number <= last; number++) selected.add(number - 1);
  }
  return [...selected];
}

export async function readPdf(bytes, library, options = {}) {
  let document;
  try {
    document = await library.PDFDocument.load(bytes, { updateMetadata: false });
  } catch (error) {
    if (error?.name === 'EncryptedPDFError' || /encrypt|password/i.test(error?.message || '')) {
      throw new Error('Password-protected PDFs are not supported. Use an unprotected copy.');
    }
    throw new Error('This file could not be read as a PDF. Choose a valid, undamaged PDF.');
  }
  checkDocument(document, library, options);
  return document;
}

export async function mergePdfs(documents, library) {
  if (!Array.isArray(documents) || documents.length < 2) throw new Error('Add at least two PDFs to merge.');
  const counts = documents.map(document => checkDocument(document, library));
  if (counts.reduce((total, count) => total + count, 0) > MAX_PAGES) {
    throw new Error(`Merge no more than ${MAX_PAGES} pages at once.`);
  }
  const output = await library.PDFDocument.create();
  for (const document of documents) {
    const pages = await output.copyPages(document, document.getPageIndices());
    pages.forEach(page => output.addPage(page));
  }
  return output.save();
}

export async function extractPages(document, indices, library) {
  checkIndices(indices, checkDocument(document, library));
  const output = await library.PDFDocument.create();
  const pages = await output.copyPages(document, indices);
  pages.forEach(page => output.addPage(page));
  return output.save();
}

export async function rotatePages(document, indices, angle, library) {
  checkIndices(indices, checkDocument(document, library));
  if (![90, 180, 270].includes(angle)) throw new Error('Choose a rotation of 90, 180, or 270 degrees.');
  // Work on a copy so repeated exports always start with the original document.
  const output = await library.PDFDocument.load(await document.save({ addDefaultPage: false }), { updateMetadata: false });
  for (const index of indices) {
    const page = output.getPage(index);
    page.setRotation(library.degrees((page.getRotation().angle + angle) % 360));
  }
  return output.save();
}
