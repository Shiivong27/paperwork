# Paperwork

JPEG and PNG images to PDF, privately in your browser.

## Features

- Add images using the picker or drag and drop.
- Reorder, sort, rotate, and remove pages.
- A4, Letter, and image-sized pages with adjustable margins.
- Live previews and automatic page orientation.
- Custom filenames and local PDF downloads.

## Run locally

```sh
npm ci
npm start
```

Open http://127.0.0.1:4173.

## Build

`npm run build` creates a standalone site in `dist/`. GitHub Actions publishes
that folder to GitHub Pages on pushes to main. Only the generated static files
are deployed. No conversion server is required.

## Privacy and limits

Images are processed in browser memory and are never uploaded. Refreshing resets
the queue. The web host receives normal page requests. Batches support up to 100
images / 300 MB, with 30 MB and 40 megapixels per image. JPEG images are normalized
at quality 0.97; PNG encoding is lossless. Fit-to-image assumes 96 pixels per inch.

PDF generation uses [pdf-lib](https://github.com/Hopding/pdf-lib), distributed
with its MIT license.
