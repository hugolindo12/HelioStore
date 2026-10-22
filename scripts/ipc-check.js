// Confere se todo comando que a interface chama (preload.js) tem quem responda no main.js, e vice-versa.
const fs = require('fs');
const pre = fs.readFileSync(__dirname + '/../preload.js', 'utf8');
const main = fs.readFileSync(__dirname + '/../main.js', 'utf8');
const used = new Set([...pre.matchAll(/invoke\(\s*['"]([\w:.-]+)['"]/g)].map((m) => m[1]));
const handled = new Set([...main.matchAll(/ipcMain\.handle\(\s*['"]([\w:.-]+)['"]/g)].map((m) => m[1]));
const missing = [...used].filter((c) => !handled.has(c));
const unused = [...handled].filter((c) => !used.has(c));
if (missing.length) { console.error('✗ comandos chamados pela interface sem resposta no main.js:\n  ' + missing.join('\n  ')); process.exit(1); }
console.log(`✓ ${used.size} comandos conferidos` + (unused.length ? ` (sem uso na interface: ${unused.join(', ')})` : ''));
