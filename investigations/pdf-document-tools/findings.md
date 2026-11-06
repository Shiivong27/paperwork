# PDF document tools

## Selected scope

Feature branch: `feature/pdf-document-tools`.

Implement three complementary tools with browser-local processing:

1. Merge two or more PDFs, preserving the displayed document order.
2. Extract selected pages into one new PDF, preserving entered page order.
3. Rotate selected PDF pages clockwise, counterclockwise, or by a half turn.

Retain the existing image converter and the green/cream Paperwork visual style.
Keep each tool's in-memory queue separate. Local review precedes a PR into main;
this feature branch is not deployed automatically.

## Reference observations

REA 6.8.0 captured the initial DOM and accessibility state of these pages in
owned temporary headless browsers on 7 November 2026. Each browser terminated
after capture. No user documents were uploaded.

| Tool | Reference | Evidence ID |
| --- | --- | --- |
| Merge | https://www.ilovepdf.com/merge_pdf | `ev_da1e006d6e42af4a3a6684ca79dedd705eb611766e6af9024c593e3c92dca7c6` |
| Extract | https://www.ilovepdf.com/split_pdf | `ev_8a331591fb38e2c409ccbd6bb493d6301ea11bed65790f255083dd19d8c573cf` |
| Rotate | https://www.ilovepdf.com/rotate_pdf | `ev_96e23e7277c7160f19e388427b2f247cebddd3530a73d3f403aba8a3cc33a78e` |

Reproducible scenario JSON files are tracked beside this report. Complete local
Evidence records are in the ignored `evidence/` directory.

Observed page declarations:

- Merge offers PDF selection/drop and describes combining PDFs in a chosen order.
- Split offers range/page extraction options, with both individual page and
  combined-range output concepts in the delivered markup.
- Rotate offers PDF selection/drop, left/right rotation, reset, and
  all/portrait/landscape filtering controls in its markup.

These observations establish the delivered interface and declarations. They do
not establish successful conversion, source-code internals, server algorithms,
output fidelity, or behavior on encrypted or interactive PDFs. Those reference
conversions were not executed.

## Acceptance criteria for our implementation

- PDF input errors are understandable; unsupported protected, interactive-form,
  damaged, empty, and oversized documents are rejected.
- Merge needs at least two PDFs and respects file reordering.
- Page selection accepts `all`, individual numbers, and ascending ranges.
  Repeated pages are included once; user-entered order is preserved.
- Selection rejects incomplete, descending, and out-of-bounds ranges.
- Extraction outputs exactly the requested pages in order.
- Rotation adds to original page rotation, affects selected pages only, retains
  all pages, and does not accumulate across repeated exports.
- Users can name outputs and repeat downloads. Editing input/settings
  invalidates the previous download link.
- Switching tools preserves each queue. Controls remain usable by keyboard and
  at mobile widths. Images and PDFs are not uploaded.
- PR checks build and test without deployment. Only main may deploy.

## Implementation choices and limits

Use the existing pdf-lib dependency; no new runtime dependencies are needed.
The page tiles show page numbers, dimensions, selection, and orientation, not
rendered page contents. Page ranges allow an exact selection even for long PDFs.

PDF inputs are limited to 30 MB and 1,000 pages per file. Merge accepts up to 20
files, 150 MB, and 1,000 pages total. Interactive forms and protected PDFs are
unsupported; the tool asks for an unprotected, flattened copy. Merge/extract
create new page collections and do not promise document-level bookmarks or
metadata preservation. These tools do not implement OCR, compression, digital
signing, or every reference-site option.

## Validation

- Seven Node test groups pass, covering input validation, form/protected-file
  rejection, limits, ordered merge/extract, retained page content streams,
  relative rotation, and repeated-export nonmutation.
- Desktop (1280px) and mobile (390px) REA browser checks pass for all tools and
  the existing image converter. They also cover invalid ranges, download
  invalidation, independent tool state, shared processing locks, keyboard tab
  navigation, clear/reset, and horizontal overflow. No page-error events were
  retained, and both owned browsers were terminated after capture.
- Generated five-page merged, two-page extracted, and three-page rotated PDFs
  were reopened and rendered with macOS PDFKit. Representative pages were
  visually checked for intact content, requested ordering, and selected rotation.
- Build output contains only the static app and local PDF library/license.
- Ref-specific CI concurrency keeps PR builds separate from main deployments;
  deployment requires main and is disabled for pull-request events.

Review screenshots and generated test documents are retained only in the ignored
`.rea/tmp/document-tools-*` and `.rea/tmp/qa-*-pdf*` paths.
