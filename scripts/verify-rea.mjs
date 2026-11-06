import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const client = new Client({ name: 'rea-workspace-verification', version: '1.0.0' });
function unpack(result) {
  if (result.isError) throw new Error(JSON.stringify(result));
  return result.structuredContent ?? JSON.parse(result.content.find(c => c.type === 'text').text);
}
try {
  const installed = JSON.parse(await readFile(path.join(root, 'node_modules/rea-agents/package.json'), 'utf8'));
  const source = await readFile(path.join(root, 'node_modules/rea-agents/skills/reverse-engineer-anything/SKILL.md'), 'utf8');
  const copied = await readFile(path.join(root, '.agents/skills/reverse-engineer-anything/SKILL.md'), 'utf8');
  if (source !== copied) throw new Error('Installed skill differs from the pinned runtime skill.');
  await client.connect(new StdioClientTransport({
    command: '/bin/bash', args: [path.join(root, 'scripts/rea.sh'), 'mcp'], cwd: root,
  }));
  const catalog = await client.listTools();
  if (!catalog.tools.some(t => t.name === 'analyze_javascript_application')) throw new Error('JavaScript analysis tool missing.');
  console.log(`REA ${installed.version}: MCP connected, ${catalog.tools.length} tools advertised; skill matches runtime.`);
  const session = unpack(await client.callTool({ name: 'binary_session', arguments: {} }));
  await mkdir(path.join(root, '.rea/tmp'), { recursive: true });
  const fixture = await mkdtemp(path.join(root, '.rea/tmp/smoke-'));
  await writeFile(path.join(fixture, 'package.json'), JSON.stringify({ name: 'rea-smoke-fixture', version: '1.0.0', main: 'index.js', type: 'module' }));
  await writeFile(path.join(fixture, 'index.js'), 'export function add(a, b) { return a + b; }\n');
  const analysis = unpack(await client.callTool({ name: 'analyze_javascript_application', arguments: { input_path: fixture } }));
  await writeFile(path.join(root, '.rea/tmp/verification.json'), JSON.stringify({ checkedAt: new Date().toISOString(), version: installed.version, toolCount: catalog.tools.length, session, analysis }, null, 2));
  console.log('Readiness and JavaScript analysis completed. Full results: .rea/tmp/verification.json');
} finally {
  await client.close();
}
