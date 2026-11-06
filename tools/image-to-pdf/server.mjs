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
  ['/pdf-lib.js', ['node_modules/pdf-lib/dist/pdf-lib.min.js', 'text/javascript; charset=utf-8']],
]);
const port = Number(process.env.PORT || 4173);
const qa = process.env.PAPERWORK_QA === '1';
if (qa) {
  files.set('/qa.js', ['qa.js', 'text/javascript; charset=utf-8']);
  files.set('/qa-document-tools.js', ['qa-document-tools.js', 'text/javascript; charset=utf-8']);
}
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const testPage = qa && pathname === '/qa';
  const item = testPage ? files.get('/') : files.get(pathname);
  if (!item || !['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(404); return res.end('Not found');
  }
  try {
    let data = await readFile(fileURLToPath(new URL(item[0], import.meta.url)));
    if (testPage) data = data.toString().replace('</body>', '<script type="module" src="/qa.js"></script></body>');
    res.writeHead(200, { 'Content-Type': item[1], 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(500); res.end('Missing app files. Run npm ci in tools/image-to-pdf.'); }
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Paperwork is ready at http://127.0.0.1:${port}`));
