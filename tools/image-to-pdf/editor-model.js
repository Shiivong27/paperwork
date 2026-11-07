import { readPdf } from './pdf-tools.js';

export function inverseTransform(matrix) {
  if (!Array.isArray(matrix) || matrix.length !== 6 || !matrix.every(Number.isFinite)) throw new Error('Invalid page coordinates.');
  const [a, b, c, d, e, f] = matrix, determinant = a * d - b * c;
  if (Math.abs(determinant) < 1e-12) throw new Error('This page has unsupported coordinates.');
  return [d / determinant, -b / determinant, -c / determinant, a / determinant,
    (c * f - d * e) / determinant, (b * e - a * f) / determinant];
}

// PNG coordinates are bottom-up in PDF; the editor uses the displayed page's
// top-left origin. Invert the PDF.js viewport, including CropBox and rotation.
export function overlayTransform(viewportTransform, displayedHeight) {
  if (!Number.isFinite(displayedHeight) || displayedHeight <= 0) throw new Error('Invalid page height.');
  const [a, b, c, d, e, f] = inverseTransform(viewportTransform);
  return [a, b, -c, -d, c * displayedHeight + e, d * displayedHeight + f];
}

export function boundMark(mark, width, height) {
  if (![mark.x, mark.y, mark.w, mark.h, width, height].every(Number.isFinite) || width <= 0 || height <= 0) throw new Error('Invalid object dimensions.');
  const w = Math.min(width, Math.max(4, mark.w)), h = Math.min(height, Math.max(4, mark.h));
  return { ...mark, w, h, x: Math.max(0, Math.min(width - w, mark.x)), y: Math.max(0, Math.min(height - h, mark.y)) };
}

export class EditHistory {
  constructor() { this.marks = []; this.past = []; this.future = []; }
  commit(marks) {
    if (JSON.stringify(marks) === JSON.stringify(this.marks)) return false;
    this.past.push(structuredClone(this.marks));
    if (this.past.length > 50) this.past.shift();
    this.marks = structuredClone(marks); this.future = []; return true;
  }
  undo() {
    if (!this.past.length) return false;
    this.future.push(structuredClone(this.marks)); this.marks = this.past.pop(); return true;
  }
  redo() {
    if (!this.future.length) return false;
    this.past.push(structuredClone(this.marks)); this.marks = this.future.pop(); return true;
  }
}

export async function exportEdits(sourceBytes, overlays, library) {
  if (!overlays.length) throw new Error('Add something to your PDF first.');
  const output = await readPdf(sourceBytes, library);
  await applyOverlays(output, overlays, library);
  return output.save();
}

async function applyOverlays(output, overlays, library) {
  const seen = new Set();
  for (const overlay of overlays) {
    if (!Number.isInteger(overlay.pageIndex) || overlay.pageIndex < 0 || overlay.pageIndex >= output.getPageCount() || seen.has(overlay.pageIndex)) throw new Error('Invalid edited page.');
    if (![overlay.width, overlay.height].every(value => Number.isFinite(value) && value > 0)) throw new Error('Invalid overlay dimensions.');
    seen.add(overlay.pageIndex);
    const matrix = overlayTransform(overlay.transform, overlay.height);
    const image = await output.embedPng(overlay.pngBytes), page = output.getPage(overlay.pageIndex);
    page.pushOperators(library.pushGraphicsState(), library.concatTransformationMatrix(...matrix));
    page.drawImage(image, { x: 0, y: 0, width: overlay.width, height: overlay.height });
    page.pushOperators(library.popGraphicsState());
  }
}

export async function inspectEditorPdf(bytes, library) {
  const document = await readPdf(bytes, library, { allowForms: true });
  const name = value => library.PDFName.of(value);
  const acro = document.catalog.lookupMaybe(name('AcroForm'), library.PDFDict);
  if (acro?.has(name('XFA'))) throw new Error('XFA forms are not supported. Export or print a standard PDF copy first.');
  const permissions = document.catalog.lookupMaybe(name('Perms'), library.PDFDict);
  if (permissions?.has(name('DocMDP'))) throw new Error('This PDF contains a certificate signature. Use an unsigned copy for editing.');
  const fields = acro ? document.getForm().getFields() : [], knownWidgets = new Set();
  const inherited = (dict, key) => {
    const visited = new Set();
    while (dict instanceof library.PDFDict && !visited.has(dict)) {
      visited.add(dict);
      if (dict.has(name(key))) return document.context.lookup(dict.get(name(key)));
      dict = document.context.lookup(dict.get(name('Parent')));
    }
    return undefined;
  };
  const checkSignature = dict => {
    if (inherited(dict, 'FT')?.toString() !== '/Sig') return;
    const value = inherited(dict, 'V');
    if (value && value !== library.PDFNull && value.toString() !== 'null' && !(['()', '<>'].includes(value.toString()))) throw new Error('This PDF contains a certificate signature value. Use an unsigned copy for editing.');
  };
  const fieldHasValue = new Map();
  for (const field of fields) {
    if (fieldHasValue.has(field.getName())) throw new Error('This PDF has conflicting form fields. Export or print a flat PDF copy first.');
    const value = inherited(field.acroField.dict, 'V');
    fieldHasValue.set(field.getName(), value !== undefined && value !== library.PDFNull);
    checkSignature(field.acroField.dict);
    field.acroField.getWidgets().forEach(widget => knownWidgets.add(widget.dict));
  }
  const widgetPages = [];
  document.getPages().forEach((page, pageIndex) => {
    const rectangles = [], annotations = page.node.Annots();
    for (let index = 0; index < (annotations?.size() || 0); index++) {
      const dict = document.context.lookup(annotations.get(index));
      if (!(dict instanceof library.PDFDict) || dict.get(name('Subtype'))?.toString() !== '/Widget') continue;
      checkSignature(dict);
      if (!knownWidgets.has(dict)) throw new Error('This PDF has an inconsistent form structure. Export or print a flat PDF copy first.');
      const rectangle = library.PDFWidgetAnnotation.fromDict(dict).getRectangle();
      rectangles.push([rectangle.x, rectangle.y, rectangle.x + rectangle.width, rectangle.y + rectangle.height]);
    }
    if (rectangles.length) widgetPages.push({ pageIndex, rectangles });
  });
  return { document, fieldCount: fields.length, widgetPages, fieldHasValue };
}

// Called only after the user chooses to prepare a flat working copy. The
// browser provides visible widget-region snapshots rendered from current values.
// Keep vector page content and non-widget annotations; remove the reachable form
// tree and every page widget so empty signature fields cannot cover additions.
export async function flattenEditorForm(sourceBytes, overlays, library) {
  const { document, widgetPages } = await inspectEditorPdf(sourceBytes, library);
  const expected = new Set(widgetPages.map(page => page.pageIndex));
  if (overlays.length !== expected.size || overlays.some(overlay => !expected.has(overlay.pageIndex))) throw new Error('The form preview is incomplete. Reopen the PDF and try again.');
  const name = value => library.PDFName.of(value);
  for (const page of document.getPages()) {
    const annotations = page.node.Annots();
    if (!annotations) continue;
    const keep = [];
    for (let index = 0; index < annotations.size(); index++) {
      const entry = annotations.get(index), dict = document.context.lookup(entry);
      if (!(dict instanceof library.PDFDict) || dict.get(name('Subtype'))?.toString() !== '/Widget') keep.push(entry);
    }
    if (keep.length) page.node.set(name('Annots'), document.context.obj(keep));
    else page.node.delete(name('Annots'));
  }
  document.catalog.delete(name('AcroForm'));
  await applyOverlays(document, overlays, library);
  return document.save({ updateFieldAppearances: false });
}
