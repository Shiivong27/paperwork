# Paperwork: images to PDF

A local browser app inspired by the image-to-PDF workflow at
https://www.ilovepdf.com/jpg_to_pdf, with an original interface and client-side
conversion. See `../../investigations/ilovepdf/findings.md` for the observed
reference behavior, evidence, and implementation choices.

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

- Add JPEG/JPG and PNG files using the picker or drag and drop.
- Preview, reorder with drag or arrow buttons, sort by name, rotate, and remove.
- A4, US Letter, or a page sized to each image.
- Automatic orientation per image, or fixed portrait/landscape.
- Three margin sizes, a live preview, and a custom output filename.
- One combined PDF with one image per page, plus a repeat-download link.
- Corrupt/unsupported file checks and clear conversion errors.

Images are processed in the browser and never uploaded. The local server serves
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
