# Paperwork: private PDF tools

A browser-local toolkit for images and PDFs, with an original interface and
client-side processing. Reference investigations and implementation choices are
in `../../investigations/ilovepdf/findings.md` and
`../../investigations/pdf-document-tools/findings.md`.

## Run

From the repository root:

```bash
npm start
```

Open **http://127.0.0.1:4173**. To restore the app dependency:

```bash
npm ci --prefix tools/image-to-pdf
```

Use `PORT=4174 npm start` if the default port is occupied.

## Features

Choose a tool using the four tabs. Each tool keeps its own files and settings
until the page is refreshed.

### Images to PDF

- Add JPEG/JPG and PNG files using the picker or drag and drop.
- Preview, reorder with drag or arrow buttons, sort by name, rotate, and remove.
- A4, US Letter, or a page sized to each image.
- Automatic orientation per image, or fixed portrait/landscape.
- Three margin sizes, a live preview, and a custom output filename.
- One combined PDF with one image per page, plus a repeat-download link.
- Corrupt/unsupported file checks and clear conversion errors.

### Merge PDF

Add two or more PDFs, change their order with the up/down arrows, and create
one PDF containing all pages. Limits: 20 files, 30 MB per file, 150 MB combined,
and 1,000 pages combined.

### Extract pages

Add one PDF and choose pages using the numbered tiles or a range such as
`3, 1, 5-7`. The new PDF follows the entered order; repeated page numbers are
included once. The source document stays intact.

### Rotate PDF

Choose one PDF, select pages, and apply 90 degrees clockwise, 180 degrees, or
90 degrees counterclockwise. Rotations add to the original page angle and affect
only selected pages. Repeating an export uses the original document each time.

PDF extraction and rotation accept one document up to 30 MB / 1,000 pages.
Protected PDFs and interactive forms are not supported; use a flattened,
unprotected copy. Merge/extract preserve page content but do not promise
document-level bookmarks, metadata, or signatures. Page tiles show page dimensions
and orientation rather than content thumbnails.

### Edit PDF

Open a PDF or use **Try a sample PDF**. Add text, JPEG/PNG images, transparent
highlights, rectangles, and ellipses. Select additions to drag them, resize using
the corner handle, or set their position/size in the properties panel. Text has
font, size, color, and opacity controls. Shapes support outlines or fills.

Use arrow keys to move a selected item (Shift moves faster), Delete to remove it,
and Ctrl/Command+Z to undo. Ctrl/Command+Shift+Z redoes an action. Clear additions
is also undoable. Each draft keeps up to 50 undo states. Page navigation and zoom
do not change object placement in the exported PDF.

### Sign PDF

Draw a signature with mouse/touch, type a name and choose a style, or upload a
JPEG/PNG signature image. Transparent PNGs work best. Place and resize the
signature, then add a movable name/date. Edit and Sign keep separate drafts.

Signatures are placed as visual graphics; this feature does not create
certificate-based digital signatures or an identity-verification/audit service.

The visual tools accept standard, unprotected PDFs up to 30 MB / 200 pages.
Interactive forms remain unsupported. A draft supports up to 100 additions and
20 image/signature assets (10 MB / 16 megapixels each, 30 MB / 32 megapixels
combined). Existing document content remains intact. Additions are flattened as
transparent graphics at up to 2x displayed-page resolution, capped at 16 megapixels
per edited page. Added text is not searchable/selectable PDF text. These tools
add content; they do not rewrite existing paragraphs or securely redact content.

Images and PDFs are processed in the browser and never uploaded. The local server serves
only app assets and rejects upload requests. All library assets are local; no
CDN, analytics, or account is required. Image lists are held in memory and reset
when the page is refreshed.

For memory use, batches are limited to 100 images / 300 MB total, with 30 MB and
40 megapixels per image. Browser memory limits can be lower on some devices;
split very large batches if necessary. Images are decoded using browser EXIF
orientation, normalized in a canvas, and fitted without cropping. PNG uses
lossless encoding; JPEG is re-encoded at high quality (0.97). Transparent image
regions appear white on PDF pages. Fit-to-image uses 96 pixels per inch; source
DPI metadata is not used.

This version does not provide OCR, separate PDFs/ZIP export, cloud storage
imports, or PDF compression.

## Verification

The browser integration harness is available only with `PAPERWORK_QA=1`:

```bash
PAPERWORK_QA=1 npm start
```

Visit `/qa` to run generated-image checks. The hidden `#qa-result` element
reports pass/fail. The harness covers invalid files, both formats, ordering,
sorting, rotation, output PDF parsing/page count, page geometry, filenames,
download invalidation, image-sized pages, remove/clear, and viewport overflow.
Normal startup does not serve the test route or test script.

`npm test` from the workspace root runs the document-operation tests. The browser
harness also covers the image converter, merge order, extraction order, invalid
page ranges, page tiles, selected-page rotation, repeat exports, filenames,
download invalidation, tool switching, and viewport overflow.

Editor checks also cover real page rendering, Unicode text, images, shapes,
mouse/touch pointer movement and resizing, keyboard movement, undo/redo/delete,
multi-page exports, cropped/rotated page pixel alignment, all three signature
methods, dates, independent drafts, and replacing a loaded document. Renderer
scripts, worker, font data, CMaps, ICC data, and decoders are bundled locally.
Same-origin requests load those assets; documents and signatures are never sent
to the server. PDF.js and its bundled data licenses are included in the build.

## Feature review

The visual editor and signatures are developed on
`feature/pdf-editor-and-signatures` for local review before a PR to main. A
separate local preview can run with:

```bash
PORT=4176 npm start
```

Then open http://127.0.0.1:4176. The Edit and Sign tabs each have a built-in sample.
The feature branch itself does not deploy; PR checks only build/test. Merging
the reviewed PR into main triggers the existing Pages deployment.

## GitHub Pages

App repository: https://github.com/Shiivong27/paperwork

Website URL: https://shiivong27.github.io/paperwork/

The workspace root is connected directly to this repository. App source lives
in `tools/image-to-pdf`; the root GitHub Actions workflow publishes only the
app's `dist/` output. Machine-specific settings, captured artifacts, installed
dependencies, and the old publishing checkout are ignored by Git.

To publish future edits, from the workspace root:

```bash
npm run build:app
git status
git add .
git commit -m "Update Paperwork"
git push
```

Review the status before committing. The `Publish Paperwork` GitHub Actions
workflow builds `tools/image-to-pdf/dist/` and deploys it after each push to `main`. The build
includes local copies of the PDF library and its license. Relative asset paths
support the `/paperwork/` URL prefix. Images remain in browser memory on the
published website, just as they do locally.
