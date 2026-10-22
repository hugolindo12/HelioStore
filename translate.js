'use strict';
// Tradução automática dos textos dos apps (descrição, frase curta…) para o idioma da interface.
// Usa o serviço gratuito MyMemory (api.mymemory.translated.net). Só o texto público do app é enviado.
// Tudo é guardado em cache, então cada texto é traduzido uma única vez por idioma.
const https = require('https');

const CODE = { pt: 'pt', en: 'en', es: 'es', fr: 'fr', de: 'de', it: 'it', ja: 'ja', zh: 'zh-CN', ru: 'ru', hi: 'hi' };

// Adivinha se o texto está em pt/en/es (suficiente para não traduzir o que já está no idioma certo)
const WORDS = {
  pt: 'o a os as de do da dos das um uma para com sem não que em no na por mais é são você seu sua e ou ao como já',
  en: 'the a an and of to in for with without not that is are you your it this on or as from by at be can',
  es: 'el la los las de del un una para con sin no que en por más es son tú su y o al como ya lo se',
  fr: 'le la les un une des du de et en pour avec sans pas que est sont vous votre ou au comme sur dans',
  de: 'der die das ein eine und von zu mit ohne nicht ist sind sie ihr oder als auf für im den dem',
  it: 'il lo la i gli le un una e di del per con senza non che è sono tu il tuo o come su in da',
};
const SETS = Object.fromEntries(Object.entries(WORDS).map(([k, v]) => [k, new Set(v.split(' '))]));
function guessLang(text) {
  if (/[぀-ヿ]/.test(text)) return 'ja';
  if (/[一-鿿]/.test(text)) return 'zh';
  if (/[Ѐ-ӿ]/.test(text)) return 'ru';
  if (/[ऀ-ॿ]/.test(text)) return 'hi';
  const w = String(text).toLowerCase().match(/[a-zà-ÿ]+/g) || [];
  if (w.length < 3) return null;
  let best = null, bs = 0, second = 0;
  for (const [l, set] of Object.entries(SETS)) {
    const s = w.reduce((n, x) => n + (set.has(x) ? 1 : 0), 0);
    if (s > bs) { second = bs; bs = s; best = l; } else if (s > second) second = s;
  }
  return bs >= 2 && bs > second ? best : null;
}

function split(text, max = 450) { // pedaços de até 450 caracteres, quebrando em frases
  if (text.length <= max) return [text];
  const out = []; let cur = '';
  for (const part of text.split(/(?<=[.!?。\n])\s+/)) {
    if ((cur + ' ' + part).length > max && cur) { out.push(cur); cur = ''; }
    if (part.length > max) { for (let i = 0; i < part.length; i += max) out.push(part.slice(i, i + max)); continue; }
    cur = cur ? cur + ' ' + part : part;
  }
  if (cur) out.push(cur);
  return out;
}

function get(url, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'HelioStore', Accept: 'application/json' }, timeout }, (res) => {
      const chunks = []; let n = 0;
      res.on('data', (c) => { n += c.length; if (n > 200000) { req.destroy(new Error('resposta grande demais')); } else chunks.push(c); });
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('timeout', () => req.destroy(new Error('tempo esgotado')));
    req.on('error', reject);
  });
}

const BAD = /MYMEMORY WARNING|PLEASE SELECT|INVALID (SOURCE|TARGET|LANGUAGE)|QUERY LENGTH LIMIT|NO QUERY SPECIFIED/i;
let blockedUntil = 0;

async function one(text, to, opts) {
  const from = guessLang(text);
  if (from === to) return text;
  const pair = `${from ? CODE[from] : 'Autodetect'}|${CODE[to] || to}`;
  const fetcher = opts.get || get;
  const parts = [];
  for (const chunk of split(text)) {
    const r = await fetcher(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=${encodeURIComponent(pair)}`);
    let j; try { j = JSON.parse(r.body); } catch { throw new Error('resposta inválida'); }
    const t = j && j.responseData && j.responseData.translatedText;
    if (r.status === 429 || j.responseStatus === 429 || (t && /ALL AVAILABLE FREE TRANSLATIONS/i.test(t))) { blockedUntil = Date.now() + 6 * 3600e3; throw new Error('limite diário do serviço'); }
    if (r.status !== 200 || String(j.responseStatus) !== '200' || !t || BAD.test(t)) throw new Error('sem tradução');
    parts.push(t);
  }
  return parts.join(' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}

// translate(['texto', …], 'en', { cache: Map, get? }) → ['text', …]  (mantém o original se falhar)
async function translate(texts, to, opts = {}) {
  const cache = opts.cache || new Map(), out = [];
  for (const raw of texts) {
    const text = String(raw || '').trim();
    if (!text || text.length > 4000) { out.push(raw); continue; }
    const key = `${to}|${text}`;
    if (cache.has(key)) { out.push(cache.get(key)); continue; }
    if (Date.now() < blockedUntil && !opts.get) { out.push(raw); continue; }
    try {
      const t = await one(text, to, opts);
      cache.set(key, t); out.push(t);
    } catch { out.push(raw); }
  }
  return out;
}
module.exports = { translate, guessLang, split, _unblock: () => { blockedUntil = 0; } };
