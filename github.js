// Helio Store — leitor de repositórios do GitHub
// Transforma um link github.com/usuario/repo em uma entrada de catálogo,
// lendo o último Release (download + versão) e o arquivo opcional helio.json.
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');

const UA = 'HelioStore/2.0';
const etagCache = new Map(); // url -> { etag, body }

const PALETTES = [
  ['#ff7a3d', '#ffd166'], ['#00d4ff', '#1e7bff'], ['#7b3dff', '#ff2e7e'], ['#30d158', '#00b3a4'],
  ['#ff9a3c', '#ff3d77'], ['#5ac8fa', '#5e5ce6'], ['#ff453a', '#ff9f0a'], ['#64d2ff', '#30d158'],
];

function parseRepo(input) {
  const s = String(input || '').trim().replace(/\.git$/i, '');
  let m = s.match(/github\.com[/:]([\w.-]+)\/([\w.-]+)/i);
  if (!m) m = s.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/i, '') };
}

// Estado de rede: depois de um limite de consultas ou de uma queda de conexão, as próximas
// chamadas falham na hora em vez de acumular timeouts (uma lista de apps levaria minutos).
let limitedUntil = 0, limitMsg = '', offlineUntil = 0;
const hhmm = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
function request(url, opts = {}) {
  const isApiUrl = /^https:\/\/api\.github\.com\//.test(url);
  if (isApiUrl && Date.now() < limitedUntil) return Promise.reject(new Error(limitMsg));
  if (Date.now() < offlineUntil) return Promise.reject(new Error('Sem conexão com o GitHub. Verifique sua internet.'));
  return rawRequest(url, opts);
}
function rawRequest(url, { token, accept = 'application/vnd.github+json', redirects = 5, noCache = false } = {}) {
  return new Promise((resolve, reject) => {
    const headers = { 'User-Agent': UA, Accept: accept };
    const isApi = /^https:\/\/api\.github\.com\//.test(url);
    if (token && isApi) headers.Authorization = `Bearer ${token}`;
    const cached = noCache ? null : etagCache.get(url);
    if (cached && isApi) headers['If-None-Match'] = cached.etag;
    const req = https.get(url, { headers, timeout: 20000 }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
        res.resume();
        return resolve(rawRequest(new URL(res.headers.location, url).toString(), { token, accept, redirects: redirects - 1, noCache }));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode === 304 && cached) return resolve({ status: 200, body: cached.body });
        if (res.statusCode === 200 && res.headers.etag && isApi && !noCache) etagCache.set(url, { etag: res.headers.etag, body });
        const limited = res.statusCode === 429 || (res.statusCode === 403 && (/rate limit|abuse/i.test(body) || res.headers['x-ratelimit-remaining'] === '0'));
        if (limited) {
          const reset = Number(res.headers['x-ratelimit-reset']) * 1000, wait = Number(res.headers['retry-after']) * 1000;
          limitedUntil = Date.now() + (wait || (reset > Date.now() ? Math.min(reset - Date.now(), 3600e3) : 120e3));
          limitMsg = `Limite de consultas do GitHub atingido. Tente de novo às ${hhmm(limitedUntil)}${token ? '' : ' ou adicione um token em Ajustes'}.`;
          return reject(new Error(limitMsg));
        }
        resolve({ status: res.statusCode, body });
      });
    });
    req.on('timeout', () => { offlineUntil = Date.now() + 45e3; req.destroy(new Error('Tempo esgotado ao falar com o GitHub')); });
    req.on('error', (e) => {
      if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ENETUNREACH|ECONNRESET|ETIMEDOUT/.test(e.code || '')) offlineUntil = Date.now() + 30e3;
      reject(new Error(`Sem conexão com o GitHub (${e.message})`));
    });
  });
}

async function api(path, token) {
  let r;
  for (let i = 0; ; i++) {
    r = await request(`https://api.github.com${path}`, { token });
    if (r.status < 500 || i >= 2) break; // 5xx do GitHub costuma passar sozinho
    await new Promise((ok) => setTimeout(ok, 800 * (i + 1)));
  }
  if (r.status === 404) return null;
  if (r.status !== 200) throw new Error(`GitHub respondeu HTTP ${r.status}`);
  return JSON.parse(r.body);
}

function pickAsset(assets = [], hint) {
  const list = assets.filter((a) => /\.(zip|exe|msi)$/i.test(a.name));
  if (hint) {
    try { const re = new RegExp(hint, 'i'); const h = list.find((a) => re.test(a.name)); if (h) return h; } catch {}
  }
  const score = (a) => {
    const n = a.name.toLowerCase();
    let s = 0;
    if (/win|windows|x64|x86_64|amd64/.test(n)) s += 5;
    if (/arm|aarch|linux|mac|darwin|osx|android|source|src|debug/.test(n)) s -= 8;
    if (/setup|install/.test(n)) s += 1;
    if (n.endsWith('.zip')) s += 2; // zip é o mais seguro de instalar sem UAC
    if (n.endsWith('.msi')) s += 1;
    if (/blockmap|\.sig|sha256/.test(n)) s -= 20;
    return s;
  };
  return list.sort((a, b) => score(b) - score(a))[0] || null;
}

const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const abs = (u, base) => (u ? (/^https?:\/\//i.test(u) ? u : base + u.replace(/^\.?\//, '')) : u);

async function fetchRelease(owner, repo, token) {
  let rel = await api(`/repos/${owner}/${repo}/releases/latest`, token);
  if (!rel) {
    const all = await api(`/repos/${owner}/${repo}/releases?per_page=5`, token);
    rel = (all || []).find((r) => !r.draft) || null;
  }
  return rel;
}

// ───────── Extras: categoria por tópicos, ícone/capturas na árvore, README ─────────
const TOPIC_CATS = [
  [/^(game|games|gaming|jogo|jogos|gamedev)$/, 'Jogos'],
  [/^(security|privacy|antivirus|vpn|encryption|password|passwords|cybersecurity)$/, 'Segurança'],
  [/^(music|audio|video|media|player|streaming|podcast|multimedia)$/, 'Multimídia'],
  [/^(design|photo|image|images|art|graphics|drawing|creative|illustration)$/, 'Criatividade'],
  [/^(productivity|notes|note-taking|todo|office|calendar|cad|3d|cad-software)$/, 'Produtividade'],
  [/^(developer-tools|devtools|dev-tools|cli|editor|ide|compiler|programming|code-editor)$/, 'Desenvolvimento'],
  [/^(chat|social|messenger|messaging|social-network)$/, 'Social'],
  [/^(utility|utilities|tool|tools|system|monitor|network|file-manager|system-tools)$/, 'Utilitários'],
];
const categoryFromTopics = (topics = []) => { for (const [re, c] of TOPIC_CATS) if (topics.some((t) => re.test(String(t).toLowerCase()))) return c; return null; };

const IMG_EXT = /\.(png|jpe?g|webp|gif|svg)$/i;
const BAD_PATH = /(^|\/)(node_modules|target|build|dist|\.git|\.github|tests?|android|ios|mipmap[^/]*|favicon[^/]*)(\/|$)/i;
const ICON_RE = /(^|\/)(app[-_]?icon|icon|logo)[^/]*\.(png|jpe?g|webp|svg)$/i;
const MB = 1048576;

// Acha o melhor ícone e as capturas de tela olhando a lista de arquivos do repositório
function scanTree(files) {
  const imgs = files.filter((f) => IMG_EXT.test(f.path) && !BAD_PATH.test(f.path) && f.size < 5 * MB);
  const rank = (p) => (/\.png$/i.test(p) ? 0 : /\.webp$/i.test(p) ? 1 : /\.svg$/i.test(p) ? 2 : 3);
  const exact = (f) => (/(^|\/)(app[-_]?icon|icon)\.[a-z]+$/i.test(f.path) ? 0 : 1);
  const depth = (f) => f.path.split('/').length;
  const icons = imgs.filter((f) => ICON_RE.test(f.path) && f.size > 200 && f.size < 2 * MB)
    .sort((a, b) => exact(a) - exact(b) || depth(a) - depth(b) || rank(a.path) - rank(b.path) || a.path.length - b.path.length);
  const shots = imgs.filter((f) => !ICON_RE.test(f.path) && /(^|\/)(screenshots?|screens?|previews?)\/|screenshot|preview/i.test(f.path))
    .map((f) => f.path).sort().slice(0, 5);
  return { icon: icons[0]?.path || null, screenshots: shots };
}

const stripMd = (t) => String(t).replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/<[^>]+>/g, '').replace(/[*_`~]/g, '').replace(/\s+/g, ' ').trim();

// Descrição (1º parágrafo), recursos (lista sob "Recursos/Features") e imagens do README
function readmeInfo(md = '', rawBase = '') {
  const lines = String(md).replace(/\r/g, '').split('\n');
  const para = [];
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) { if (para.length) break; continue; }
    if (/^(#|>|!\[|\[!\[|<|```|---|===|\||[-*+]\s|\d+\.\s)/.test(l)) { if (para.length) break; continue; }
    para.push(l);
  }
  const features = [];
  let inF = false;
  for (const raw of lines) {
    const l = raw.trim();
    if (/^#{1,4}\s/.test(l)) { inF = /feature|recurso|funcionalidade|destaque|highlight|caracter/i.test(l); continue; }
    if (inF) { const m = l.match(/^[-*+]\s+(.*)$/); const t = m && stripMd(m[1]); if (t) features.push(t.slice(0, 90)); }
  }
  const images = [];
  const re = /!\[[^\]]*\]\(\s*([^)\s]+)[^)]*\)|<img[^>]+src=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(md))) {
    const u = m[1] || m[2];
    if (!u || /shields\.io|badge|workflows\/|codecov|travis|buymeacoffee|ko-fi|\.svg(\?|$)/i.test(u)) continue;
    images.push(abs(u, rawBase));
  }
  return { description: stripMd(para.join(' ')).slice(0, 600), features: features.slice(0, 6), images };
}

// Resolve um link do GitHub em uma entrada completa do catálogo
// helio.json pode trazer textos já traduzidos: { "i18n": { "en": { "tagline": "…", "description": "…" } } }
const I18N_LANGS = ['pt', 'en', 'es', 'fr', 'de', 'it', 'ja', 'zh', 'ru', 'hi'];
function cleanI18n(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  const out = {};
  for (const l of I18N_LANGS) {
    const v = raw[l]; if (!v || typeof v !== 'object') continue;
    const o = {};
    for (const f of ['tagline', 'description', 'changelog']) if (typeof v[f] === 'string' && v[f].trim()) o[f] = v[f].trim().slice(0, 1500);
    if (Array.isArray(v.features)) { const ft = v.features.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim().slice(0, 200)).slice(0, 12); if (ft.length) o.features = ft; }
    if (Object.keys(o).length) out[l] = o;
  }
  return Object.keys(out).length ? out : undefined;
}

async function resolveRepo(input, { token } = {}) {
  const p = parseRepo(input);
  if (!p) throw new Error('Link inválido. Use algo como https://github.com/usuario/meu-app');
  const { owner, repo } = p;

  const info = await api(`/repos/${owner}/${repo}`, token);
  if (!info) throw new Error('Repositório não encontrado (ou é privado).');
  const rel = await fetchRelease(info.owner.login, info.name, token);
  if (!rel) throw new Error('Esse repositório ainda não tem nenhum Release. Publique um Release no GitHub anexando o .zip ou .exe do app.');

  const rawBase = `https://raw.githubusercontent.com/${info.full_name}/${info.default_branch}/`;
  const rawUrl = (path) => rawBase + path.split('/').map(encodeURIComponent).join('/');
  let manifest = {};
  try {
    const m = await request(rawBase + 'helio.json', { accept: 'application/json' });
    if (m.status === 200) manifest = JSON.parse(m.body);
  } catch { /* helio.json é opcional */ }

  const asset = pickAsset(rel.assets, manifest.asset || manifest.download?.asset);
  if (!asset) throw new Error('O último Release não tem arquivo .zip, .exe ou .msi para instalar.');

  // Extras: qualquer falha aqui é ignorada (o app continua sendo adicionado)
  let tree = { icon: null, screenshots: [] };
  let readme = { description: '', features: [], images: [] };
  try {
    const t = await api(`/repos/${info.full_name}/git/trees/${encodeURIComponent(info.default_branch)}?recursive=1`, token);
    if (t?.tree) tree = scanTree(t.tree.filter((x) => x.type === 'blob').map((x) => ({ path: x.path, size: x.size || 0 })));
  } catch {}
  try {
    const r = await request(`https://api.github.com/repos/${info.full_name}/readme`, { token, accept: 'application/vnd.github.raw+json' });
    if (r.status === 200) readme = readmeInfo(r.body, rawBase);
  } catch {}

  let icon, iconSource;
  if (manifest.icon) { icon = abs(manifest.icon, rawBase); iconSource = 'manifest'; }
  else if (tree.icon) { icon = rawUrl(tree.icon); iconSource = 'repo'; }
  else if (info.owner.avatar_url) { icon = info.owner.avatar_url + (info.owner.avatar_url.includes('?') ? '&' : '?') + 's=256'; iconSource = 'avatar'; }

  const shots = manifest.screenshots?.length ? manifest.screenshots.map((u) => abs(u, rawBase))
    : [...new Set([...tree.screenshots.map(rawUrl), ...readme.images])].slice(0, 5);

  const id = String(manifest.id || `gh-${info.owner.login}-${info.name}`).toLowerCase().replace(/[^a-z0-9-_]/g, '-');
  const ext = asset.name.split('.').pop().toLowerCase();
  const dl = manifest.download || {};
  const version = String(rel.tag_name || '0.0.0').replace(/^v/i, '');
  const firstSentence = (readme.description.split(/(?<=[.!?])\s/)[0] || '').slice(0, 110);
  const lic = info.license?.spdx_id;

  return {
    id,
    name: manifest.name || info.name.replace(/[-_]+/g, ' '),
    tagline: manifest.tagline || info.description || firstSentence || 'App da comunidade Helio',
    description: manifest.description || readme.description || info.description || 'Sem descrição.',
    category: manifest.category || categoryFromTopics(info.topics) || 'Comunidade',
    developer: manifest.developer || info.owner.login,
    version,
    sizeMB: Math.max(1, Math.round(asset.size / MB)),
    glyph: manifest.glyph || 'box',
    colors: manifest.colors || PALETTES[hash(id) % PALETTES.length],
    icon, iconSource,
    screenshots: shots,
    features: manifest.features?.length ? manifest.features : readme.features,
    changelog: manifest.changelog || (rel.body || '').trim().slice(0, 700) || `Versão ${version}`,
    download: { url: asset.browser_download_url, sha256: (/^sha256:([0-9a-f]{64})$/i.exec(asset.digest || '') || [])[1] || undefined, type: ext, exe: manifest.exe || dl.exe, args: manifest.args || dl.args, launch: manifest.launch || dl.launch, uninstall: manifest.uninstall || dl.uninstall },
    meta: {
      license: lic && lic !== 'NOASSERTION' ? lic : null, language: info.language || null,
      stars: info.stargazers_count, forks: info.forks_count,
      downloads: (rel.assets || []).reduce((n, a) => n + (a.download_count || 0), 0),
      updatedAt: rel.published_at, homepage: info.homepage || null, topics: info.topics || [],
    },
    i18n: cleanI18n(manifest.i18n),
    source: { type: 'github', repo: info.full_name, url: info.html_url, stars: info.stargazers_count, publishedAt: rel.published_at, manifest: Object.keys(manifest).length > 0 },
  };
}

// Consulta leve (1 chamada, com ETag): só a tag mais recente
async function latestTag(repoFullName, token) {
  const p = parseRepo(repoFullName);
  if (!p) return null;
  const rel = await fetchRelease(p.owner, p.repo, token);
  return rel ? String(rel.tag_name).replace(/^v/i, '') : null;
}

// SHA-256 de um arquivo (streaming, não carrega tudo na memória)
function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file).on('data', (c) => h.update(c)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

// ───────── Conta do GitHub (login com código ou token) ─────────
function postForm(url, form) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(form).toString();
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: 'POST', timeout: 20000,
      headers: { 'User-Agent': UA, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => { let json = null; try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch {} resolve({ status: res.statusCode, json }); });
    });
    req.on('timeout', () => req.destroy(new Error('Tempo esgotado ao falar com o GitHub')));
    req.on('error', (e) => reject(new Error(`Sem conexão com o GitHub (${e.message})`)));
    req.end(body);
  });
}

// Device Flow: o GitHub devolve um código para a pessoa digitar em github.com/login/device
async function deviceStart(clientId) {
  const r = await postForm('https://github.com/login/device/code', { client_id: clientId, scope: 'read:user' });
  if (r.status !== 200 || !r.json || !r.json.device_code) {
    throw new Error('Não foi possível iniciar o login com o GitHub. Confira o Client ID e se o “Device Flow” está ativado no app OAuth.');
  }
  return r.json;
}
async function devicePoll(clientId, deviceCode) {
  const r = await postForm('https://github.com/login/oauth/access_token', { client_id: clientId, device_code: deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' });
  const j = r.json || {};
  if (j.access_token) return { token: j.access_token };
  if (j.error === 'authorization_pending') return { pending: true };
  if (j.error === 'slow_down') return { pending: true, slow: true };
  if (j.error === 'expired_token') return { error: 'O código expirou. Tente de novo.' };
  if (j.error === 'access_denied') return { error: 'Autorização negada no GitHub.' };
  return { error: 'Falha no login com o GitHub.' };
}
async function getUser(token) {
  const r = await request('https://api.github.com/user', { token, noCache: true });
  if (r.status === 401) throw new Error('Token inválido ou expirado.');
  if (r.status !== 200) throw new Error(`GitHub respondeu HTTP ${r.status}`);
  const u = JSON.parse(r.body);
  return { login: u.login, name: u.name || u.login, avatar: u.avatar_url, url: u.html_url };
}
async function listMyRepos(token) {
  const r = await request('https://api.github.com/user/repos?per_page=100&sort=pushed&affiliation=owner&visibility=public', { token, noCache: true });
  if (r.status === 401) throw new Error('Token inválido ou expirado.');
  if (r.status !== 200) throw new Error(`GitHub respondeu HTTP ${r.status}`);
  const list = JSON.parse(r.body).filter((x) => !x.fork && !x.archived).map((x) => ({
    full_name: x.full_name, description: x.description || '', stars: x.stargazers_count || 0, language: x.language || '', pushed_at: x.pushed_at,
  }));
  // descobre quais têm Release (os 15 mais recentes); quem não tem não dá para instalar pela loja
  await Promise.all(list.slice(0, 15).map(async (x) => {
    try { x.release = (await latestTag(x.full_name, token)) || ''; } catch { x.release = ''; }
  }));
  return list.sort((a, b) => (b.release ? 1 : 0) - (a.release ? 1 : 0));
}

const _resetNet = () => { limitedUntil = 0; offlineUntil = 0; }; // usado nos testes
module.exports = { cleanI18n, _resetNet, fetchRelease, deviceStart, devicePoll, getUser, listMyRepos, sha256File, parseRepo, resolveRepo, latestTag, pickAsset, scanTree, readmeInfo, categoryFromTopics };
