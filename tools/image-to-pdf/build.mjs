import { mkdir, copyFile, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./', import.meta.url));
const output = path.join(root, 'dist');
const assets = ['index.html', 'style.css', 'app.js', 'pdf.js', 'document-tools.js', 'pdf-tools.js', 'tool-state.js'];
await mkdir(output, { recursive: true });
// Refuse stale/unexpected content rather than publishing anything outside the app.
const expected = new Set([...assets, 'pdf-lib.js', 'pdf-lib.LICENSE', '.nojekyll']);
for (const filename of await readdir(output)) {
  if (!expected.has(filename)) throw new Error(`Unexpected build output: ${filename}. Use an empty dist directory.`);
}
for (const filename of assets) await copyFile(path.join(root, filename), path.join(output, filename));
await copyFile(path.join(root, 'node_modules/pdf-lib/dist/pdf-lib.min.js'), path.join(output, 'pdf-lib.js'));
await copyFile(path.join(root, 'node_modules/pdf-lib/LICENSE.md'), path.join(output, 'pdf-lib.LICENSE'));
await writeFile(path.join(output, '.nojekyll'), '');
const html = await readFile(path.join(output, 'index.html'), 'utf8');
if (/(?:src|href)="\//.test(html)) throw new Error('Root-relative assets would break a GitHub Pages project URL.');
console.log(`Built ${expected.size} static files in ${output}`);
