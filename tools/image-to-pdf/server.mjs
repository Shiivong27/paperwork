import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/pdf.js', ['pdf.js', 'text/javascript; charset=utf-8']],
  ['/pdf-tools.js', ['pdf-tools.js', 'text/javascript; charset=utf-8']],
  ['/document-tools.js', ['document-tools.js', 'text/javascript; charset=utf-8']],
  ['/tool-state.js', ['tool-state.js', 'text/javascript; charset=utf-8']],
  ['/editor.css', ['editor.css', 'text/css; charset=utf-8']],
  ['/editor-ui.js', ['editor-ui.js', 'text/javascript; charset=utf-8']],
  ['/editor-model.js', ['editor-model.js', 'text/javascript; charset=utf-8']],
  ['/editor-canvas.js', ['editor-canvas.js', 'text/javascript; charset=utf-8']],
  ['/pdfjs/pdf.mjs', ['node_modules/pdfjs-dist/build/pdf.mjs', 'text/javascript; charset=utf-8']],
  ['/pdfjs/pdf.worker.mjs', ['node_modules/pdfjs-dist/build/pdf.worker.mjs', 'text/javascript; charset=utf-8']],
  ['/pdf-lib.js', ['node_modules/pdf-lib/dist/pdf-lib.min.js', 'text/javascript; charset=utf-8']],
]);
const port = Number(process.env.PORT || 4173);
const qa = process.env.PAPERWORK_QA === '1';
if (qa) {
  files.set('/qa.js', ['qa.js', 'text/javascript; charset=utf-8']);
  files.set('/qa-document-tools.js', ['qa-document-tools.js', 'text/javascript; charset=utf-8']);
  files.set('/qa-editor.js', ['qa-editor.js', 'text/javascript; charset=utf-8']);
}
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const testPage = qa && pathname === '/qa';
  let item = testPage ? files.get('/') : files.get(pathname);
  if (/^\/pdfjs\/(cmaps|standard_fonts|wasm|iccs)\/[A-Za-z0-9_.-]+$/.test(pathname)) {
    const mime = pathname.endsWith('.wasm') ? 'application/wasm' : /\.(mjs|js)$/.test(pathname) ? 'text/javascript' : 'application/octet-stream';
    item = ['node_modules/pdfjs-dist/' + pathname.slice('/pdfjs/'.length), mime];
  }
  if (!item || !['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(404); return res.end('Not found');
  }
  try {
    let data = await readFile(fileURLToPath(new URL(item[0], import.meta.url)));
    if (testPage) data = data.toString().replace('</body>', '<script type="module" src="/qa.js"></script></body>');
    res.writeHead(200, { 'Content-Type': item[1], 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; font-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(500); res.end('Missing app files. Run npm ci in tools/image-to-pdf.'); }
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Paperwork is ready at http://127.0.0.1:${port}`));
