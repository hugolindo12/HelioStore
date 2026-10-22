#!/usr/bin/env node
// Confere se todo texto da interface (escrito em português) tem tradução em inglês e espanhol.
// Uso: npm run i18n        (sai com código 1 se faltar tradução)
// Para traduzir um texto novo: adicione a frase em português como chave nos dicionários `en` e `es`
// de src/i18n.js (use {0}, {1}… no lugar de valores que mudam) e rode de novo.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
global.window = {}; global.document = { documentElement: {}, body: {} };
global.navigator = { language: 'pt-BR' }; global.MutationObserver = class { observe() {} takeRecords() { return []; } };
new Function(fs.readFileSync(path.join(root, 'src', 'i18n.js'), 'utf8'))();
const tr = window.I18N.tr;

// palavras que só existem em português (evita falso alarme com espanhol/inglês)
const PT = /[ãõç]|\b(não|você|vocês|seu|seus|sua|suas|uma|está|são|também|ainda|já|apenas|nenhum|nenhuma|aqui|abaixo|isso|esta|este|desta|pelo|pela|ao|aos|às|mais|muito|sobre|depois|antes|enquanto|quando|sem|para|com|nos|nas|dos|das|do|da|ou|que|em|no|na|os)\b/i;
const IGNORE = /^[\s\d.,:;·•→←↑↓+\-–—/\\|()[\]{}%#@*'"“”‘’!?…✓✗★↗⌘&=_<>~`$^]*$/;

function* literals(src) { // extrai '...', "..." e `...` (com ${} aninhado)
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2) + 2 || src.length; continue; }
    if (c === "'" || c === '"') {
      let j = i + 1, s = '';
      while (j < src.length && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\') { s += src[j + 1] === 'n' ? '\n' : src[j + 1]; j += 2; } else s += src[j++]; }
      yield s; i = j + 1; continue;
    }
    if (c === '`') { const r = template(src, i + 1); yield r.text; i = r.end; continue; }
    i++;
  }
}
function template(src, i) {
  let s = '', n = 0;
  while (i < src.length && src[i] !== '`') {
    if (src[i] === '\\') { s += src[i + 1] === 'n' ? '\n' : src[i + 1]; i += 2; continue; }
    if (src[i] === '$' && src[i + 1] === '{') {
      let d = 1, j = i + 2;
      while (j < src.length && d) {
        if (src[j] === '`') { j = template(src, j + 1).end; continue; }
        if (src[j] === '{') d++; else if (src[j] === '}') d--;
        j++;
      }
      s += `{${n++}}`; i = j; continue;
    }
    s += src[i++];
  }
  return { text: s, end: i + 1 };
}

// main.js tem a própria tabela MT (bandeja e notificações); ela vale como tradução e não é escaneada
let MT = { en: {}, es: {} }, mainSrc = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const mi = mainSrc.indexOf('const MT = {');
if (mi >= 0) {
  let d = 0, j = mainSrc.indexOf('{', mi);
  const start = j;
  for (; j < mainSrc.length; j++) { if (mainSrc[j] === '{') d++; else if (mainSrc[j] === '}' && !--d) break; }
  try { MT = new Function('return ' + mainSrc.slice(start, j + 1))(); } catch (e) { console.log('(aviso) não consegui ler MT de main.js:', e.message); }
  mainSrc = mainSrc.slice(0, mi) + mainSrc.slice(j + 1);
}
mainSrc = mainSrc.split('\n').filter((l) => !/console\.|\blog\(|i18n-ignore/.test(l)).join('\n');
const files = ['src/app.js', 'src/novidades.js'];
const stripIgnored = (t) => t.split('\n').filter((l) => !/i18n-ignore/.test(l)).join('\n');
const found = new Map();
const add = (t, f) => {
  for (let chunk of t.split(/<[^>]*>/)) {
    chunk = chunk.replace(/&[a-z]+;/g, ' ').trim();
    if (chunk.length < 3 || IGNORE.test(chunk) || /^[a-z0-9_.\-/:#]+$/i.test(chunk) || /^\{\d+\}$/.test(chunk) || /^(https?:|\{\s*")/.test(chunk)) continue;
    if (!PT.test(chunk)) continue;
    if (!found.has(chunk)) found.set(chunk, f);
  }
};
for (const l of literals(mainSrc)) add(l, 'main.js');
for (const f of files) { const p = path.join(root, f); if (fs.existsSync(p)) for (const l of literals(stripIgnored(fs.readFileSync(p, 'utf8')))) add(l, f); }
const html = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8').replace(/<(script|style)[\s\S]*?<\/\1>/g, '');
add(html, 'src/index.html');
for (const m of html.matchAll(/\b(?:title|placeholder|aria-label)="([^"]+)"/g)) add(m[1], 'src/index.html');

let bad = 0;
for (const lang of ['en', 'es']) {
  const miss = [...found].filter(([t]) => tr(t, lang) === t && !(MT[lang] && MT[lang][t]));
  if (!miss.length) { console.log(`✓ ${lang}: tudo traduzido`); continue; }
  bad += miss.length;
  console.log(`\n✗ ${lang}: ${miss.length} texto(s) sem tradução`);
  for (const [t, f] of miss) console.log(`  [${f}] ${t.length > 110 ? t.slice(0, 110) + '…' : t}`);
}
if (bad) { console.log('\nAdicione as frases acima aos dicionários en e es em src/i18n.js.'); process.exit(1); }
