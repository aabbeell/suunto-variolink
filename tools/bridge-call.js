#!/usr/bin/env node
// ABOUTME: Command-line client for the SuuntoPlus MCP bridge running inside VS Code (http://127.0.0.1:39317/mcp).
// ABOUTME: Usage: node call.js <tool> '<json args>' [imageOut.png]; prints text results, saves an image result if given a path.

const http = require('http');
const fs = require('fs');

const [tool, argsJson = '{}', imageOut] = process.argv.slice(2);
if (!tool) {
  console.error("usage: node call.js <build|open_simulator|screenshot|sim_log> '<json args>' [imageOut.png]");
  process.exit(2);
}
const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: tool, arguments: JSON.parse(argsJson) } });
const req = http.request({ host: '127.0.0.1', port: 39317, path: '/mcp', method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: 600000 }, (res) => {
  let data = '';
  res.on('data', (c) => { data += c; });
  res.on('end', () => {
    const msg = JSON.parse(data);
    if (msg.error) { console.error('ERROR: ' + msg.error.message); process.exit(1); }
    for (const item of msg.result.content) {
      if (item.type === 'text') console.log(item.text);
      if (item.type === 'image' && imageOut) { fs.writeFileSync(imageOut, Buffer.from(item.data, 'base64')); console.log('Image saved to ' + imageOut); }
    }
    process.exit(msg.result.isError ? 1 : 0);
  });
});
req.on('error', (err) => { console.error('Bridge not reachable (is VS Code open with the SuuntoPlus MCP Bridge extension?): ' + err.message); process.exit(1); });
req.end(body);
