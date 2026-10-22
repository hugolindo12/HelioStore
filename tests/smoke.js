// Teste de fumaça da interface: abre a loja num Chromium com a API do Electron simulada (tests/stub.js),
// passa por todas as telas em todos os idiomas e falha se houver erro de JavaScript, rolagem horizontal ou texto cortado.
// Uso: npm i --no-save playwright && npx playwright install chromium && node tests/smoke.js
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
const cat = fs.readFileSync(path.join(root, 'catalog', 'apps.json'), 'utf8');
const stub = fs.readFileSync(path.join(__dirname, 'stub.js'), 'utf8');
// A página tem CSP (script-src 'self'): o catálogo e o stub vão como arquivos ao lado da loja, e são apagados no fim.
const extra = { '__smoke-cat.js': `window.__CAT=${cat}`, '__smoke-stub.js': stub, '__smoke.html': html.replace(/<script src="novidades\.js">/, () => '<script src="__smoke-cat.js"></script>\n<script src="__smoke-stub.js"></script>\n<script src="novidades.js">') };
for (const [n, c] of Object.entries(extra)) fs.writeFileSync(path.join(root, 'src', n), c);
const file = path.join(root, 'src', '__smoke.html');

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const langs = ['pt', 'en', 'es', 'fr', 'de', 'it', 'ja', 'zh', 'ru', 'hi'];
  let bad = 0;
  const fail = (m) => { bad++; console.log('✗', m); };
  try {
    for (const [w, h] of [[1200, 800], [900, 700]]) {
      const p = await b.newPage({ viewport: { width: w, height: h } });
      const errs = [];
      p.on('pageerror', (e) => errs.push(e.message));
      await p.goto('file://' + file); await p.waitForTimeout(900);
      for (const lang of langs) {
        await p.evaluate((l) => I18N.setLang(l), lang);
        for (const v of ['discover', 'library', 'publish', 'settings']) {
          await p.evaluate((x) => document.querySelector(`[data-view="${x}"]`).click(), v);
          await p.waitForTimeout(150);
          const r = await p.evaluate(() => {
            const out = [];
            if (document.documentElement.scrollWidth > innerWidth + 1) out.push('rolagem horizontal');
            document.querySelectorAll('button, .btn, .tab, .chip, h1, h2, h3, h4').forEach((el) => {
              if (el.offsetParent && el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'visible') out.push('cortado: ' + (el.textContent || '').trim().slice(0, 30));
            });
            return [...new Set(out)].slice(0, 3);
          });
          if (r.length) fail(`${w}px ${lang}/${v}: ${r.join(' | ')}`);
        }
        const a = await p.evaluate(() => S.apps[0]?.id);
        if (a) { await p.evaluate((i) => openDetail(i), a); await p.waitForTimeout(100); await p.evaluate(() => closeDetail()); }
      }
      if (errs.length) fail(`${w}px erros de JavaScript: ${[...new Set(errs)].slice(0, 3).join(' | ')}`);
      await p.close();
    }
  } finally { await b.close(); for (const n of Object.keys(extra)) fs.rmSync(path.join(root, 'src', n), { force: true }); }
  console.log(bad ? `\n${bad} problema(s)` : '✓ interface ok em 10 idiomas, 4 telas e 2 tamanhos de janela');
  process.exit(bad ? 1 : 0);
})();
