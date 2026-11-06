# Visual PDF editor and signatures

Branch: feature/pdf-editor-and-signatures. Local review before PR or deployment.

## Accepted scope

- Edit PDF: add text, JPEG/PNG images, transparent highlights, rectangles, and
  ellipses over a rendered PDF page. Select, move, resize, delete, undo, and redo.
- Sign PDF: draw, type, or upload a signature; place/resize it; add name and date.
- Separate in-memory Edit and Sign drafts with page navigation and zoom.
- Existing text is preserved; the app adds content rather than rewriting it.
- Signatures are visual additions, not certificate-based digital signatures.

## Acceptance criteria

- Existing tools continue to work and preserve their queues.
- Render source pages locally using bundled PDF.js assets and worker.
- The exported additions match the preview on normal, cropped, and rotated pages.
- Preserve original page content and page count. Only pages with additions change.
- Empty, unsupported, protected, interactive-form, or oversized inputs have clear errors.
- Undo/redo restores complete object states; repeated exports do not accumulate additions.
- Mouse, touch, keyboard movement, and numeric position/size controls are supported.
- Signatures and documents stay in browser memory; no upload or third-party asset requests.
- Tests cover geometry, histories, PDF export, browser controls, signature methods,
  rotated/cropped page output, existing-tool regressions, and mobile layout.
- Keep the feature branch separate from main and leave a working local preview for review.

## Export design

Render additions to transparent high-resolution page overlays and embed them over
original PDF pages using the inverse PDF.js viewport transform. This keeps base
page text/vector content intact and makes exported additions match the browser
font/image appearance. Added text/signatures are flattened graphics and are not
searchable text or certificate-based signatures. Highlights are visual overlays,
not semantic PDF highlight annotations. This is not a redaction tool.

## Implementation and validation

- PDF.js 6.5.438 is pinned with a local worker, fonts, CMaps, ICC files, decoders,
  and licenses. Browser input is passed directly as bytes, with no document URL
  or upload endpoint. The server accepts only GET/HEAD for static assets.
- Eleven Node tests pass, including affine mapping at 0/90/180/270 degrees,
  CropBox offsets and UserUnit scale, immutable undo history, bounds, and
  non-accumulating exports that preserve original crop/rotation/page content.
- Desktop and 390px mobile browser checks pass with generated documents. Mobile
  checks use simulated touch pointers, not a physical-device test.
- Browser tests render exported pages independently to verify exact overlay
  placement on cropped/rotated pages. All observed requests were GETs to the
  local preview origin; no page errors were retained in the passing runs.
- Generated edited and signed outputs were rendered independently with macOS
  PDFKit and visually inspected for images, Unicode text, transparent highlights,
  signature placement, names/dates, and crop/rotation alignment.
- Replacing drafts destroys the PDF.js loading task and releases image bitmaps.
  A shared processing guard covers sample preparation, parsing, rendering,
  assets, and export so users cannot switch tools mid-operation.
- Protected and interactive-form PDFs remain unsupported. Drafts and signature
  assets are memory-only and are lost when the page is refreshed.

Local QA artifacts are retained in ignored `.rea/tmp/editor-*` and
`.rea/tmp/qa-editor-*` / `.rea/tmp/qa-signed-*` paths. No user documents are included.
