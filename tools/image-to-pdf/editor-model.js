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
  const output = await readPdf(sourceBytes, library), seen = new Set();
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
  return output.save();
}
