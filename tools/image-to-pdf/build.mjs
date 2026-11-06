import { mkdir, copyFile, readFile, readdir, writeFile, cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./', import.meta.url));
const output = path.join(root, 'dist');
const assets = ['index.html', 'style.css', 'editor.css', 'app.js', 'pdf.js', 'document-tools.js', 'pdf-tools.js', 'tool-state.js', 'editor-ui.js', 'editor-model.js', 'editor-canvas.js'];
await mkdir(output, { recursive: true });
// Refuse stale/unexpected content rather than publishing anything outside the app.
const expected = new Set([...assets, 'pdf-lib.js', 'pdf-lib.LICENSE', 'pdfjs', '.nojekyll']);
for (const filename of await readdir(output)) {
  if (!expected.has(filename)) throw new Error(`Unexpected build output: ${filename}. Use an empty dist directory.`);
}
for (const filename of assets) await copyFile(path.join(root, filename), path.join(output, filename));
await copyFile(path.join(root, 'node_modules/pdf-lib/dist/pdf-lib.min.js'), path.join(output, 'pdf-lib.js'));
await copyFile(path.join(root, 'node_modules/pdf-lib/LICENSE.md'), path.join(output, 'pdf-lib.LICENSE'));
await writeFile(path.join(output, '.nojekyll'), '');
const renderer = path.join(root, 'node_modules/pdfjs-dist');
await mkdir(path.join(output, 'pdfjs'), { recursive: true });
for (const name of ['pdf.mjs', 'pdf.worker.mjs']) await copyFile(path.join(renderer, 'build', name), path.join(output, 'pdfjs', name));
await copyFile(path.join(renderer, 'LICENSE'), path.join(output, 'pdfjs/LICENSE'));
for (const folder of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) await cp(path.join(renderer, folder), path.join(output, 'pdfjs', folder), { recursive: true });
const html = await readFile(path.join(output, 'index.html'), 'utf8');
if (/(?:src|href)="\//.test(html)) throw new Error('Root-relative assets would break a GitHub Pages project URL.');
console.log(`Built static app in ${output}, including bundled PDF.js assets.`);
