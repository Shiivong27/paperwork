# iLovePDF JPG-to-PDF investigation

Target: https://www.ilovepdf.com/jpg_to_pdf

Captured: 7 November 2026 (Australia/Melbourne).

## Evidence and method

REA 6.8.0 `capture_browser_scenario` launched an owned temporary headless Chrome
profile, navigated to the target, waited for its heading, and captured DOM,
accessibility text, a screenshot, and page-error events. It terminated the owned
browser after capture. No personal files were uploaded.

- Evidence file: `evidence/initial-page.json` (local, ignored by Git).
- Screenshot: `evidence/initial-page.png` (local, ignored by Git).
- Evidence ID: `ev_47d90e54d5f2729304ce6ea5a81e10311e4aa77a3abf53a001f1c06300c8418f`.
- Reproducible capture input: `scenario.json`.
- REA reported complete requested capture sections and no retained page errors.

## Observed facts

- The initial visible page has a JPG file-selection control and a drag/drop hint.
- Captured page markup declares portrait and landscape settings.
- Its page-size select declares Fit to image, A4, and US Letter options.
- Its margin controls declare no margin, small, and big.
- It declares an option to merge images into a single PDF.
- Embedded default configuration declares portrait, A4, zero margin, and merged
  output. These are shipped configuration declarations, not verified conversion
  results.
- The page includes Google Drive/Dropbox import affordances.

## Unknowns and limitations

The capture covers initial-page behavior and delivered markup. It does not
establish successful uploads, actual output quality, precise margin dimensions,
backend algorithms, EXIF handling, error behavior, or private server source.
Cloud imports and conversion were not executed. Network bodies were not
requested. Accessibility text covers the visible initial state; some settings
were present in DOM but not visible in that state.

## Our behavior specification and acceptance criteria

- Accept decodable JPEG and PNG files; reject invalid data with a useful error.
- Display a thumbnail and page number for every image.
- Support explicit reorder, natural filename sorting, clockwise rotation,
  individual removal, and clearing the queue.
- Preserve the chosen page order and rotation in the resulting PDF.
- Support A4, Letter, and image-sized pages; fit the complete image without
  cropping, with the chosen margins.
- Automatically choose orientation per image; allow portrait/landscape overrides.
- Generate one downloadable PDF in the browser, with a custom filename.
- Do not send user images to a service or persist them after refresh.
- Provide keyboard-accessible controls and a responsive layout.

## Implementation choices

The original green/cream interface is called Paperwork. Improvements chosen for
this implementation are PNG support, local conversion, a persistent layout
panel, live selected-page preview, automatic per-image orientation, keyboard
reorder controls, repeat download, and visible validation errors.

Implementation: `../../tools/image-to-pdf/` using pdf-lib 1.17.1. The app is
independently implemented from the observed workflow; the reference's code,
branding, cloud imports, and server conversion are not reproduced.

## Verification results

REA captured the local integration harness at desktop and 390px mobile widths.
Generated JPEG and transparent PNG fixtures passed validation, reordering,
sorting, rotation, filename, export/page-count, layout geometry, stale-download,
fit-to-image, remove, clear, and mobile-overflow checks. No page errors were
retained. Both owned browser processes were terminated after capture.

The generated two-page PDFs were reopened and rendered with macOS PDFKit.
Visual inspection confirmed landscape/portrait auto layout, margins, complete
image placement, clockwise rotation, and white transparency regions.
Local test artifacts are in the ignored `.rea/tmp/converter-*` files.
