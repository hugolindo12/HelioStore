// Helio Store — processo principal (Electron)
const { app, globalShortcut, BrowserWindow, ipcMain, shell, dialog, nativeTheme, Tray, Menu, nativeImage, screen, clipboard, Notification, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const http = require('http');
const https = require('https');
const { spawn, execFile } = require('child_process');
const gh = require('./github');

const isDev = process.argv.includes('--dev');
const launchArgOf = (argv) => { const a = (argv || []).find((x) => String(x).startsWith('--launch=')); return a ? a.slice(9) : null; };
const launchOnly = launchArgOf(process.argv); // atalho do app: abre o app e a loja não aparece
const startHidden = process.argv.includes('--hidden') || !!launchOnly; // iniciado com o Windows: só o dock, sem abrir a janela

// Uma instância só: abrir de novo apenas traz a loja para a frente
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
app.on('second-instance', (_, argv) => {
  if (!app.isReady()) return;
  const id = launchArgOf(argv);
  if (id) launchApp(id).catch(() => {}); // veio de um atalho: só abre o app
  else showWindow();
});
let win = null;
let tray = null;
let dockWin = null;
let isQuitting = false;
let trayHintShown = false;

// ───────────────────────── Estado persistente ─────────────────────────
const statePath = () => path.join(app.getPath('userData'), 'helio-state.json');
const defaultState = () => ({
  account: null,  // conta do GitHub conectada { login, name, avatar, url }
  installed: {},
  userApps: {},
  overrides: {},  // personalizações do dono (ícone, nome, descrição...) que sobrevivem às atualizações do GitHub   // apps adicionados pela comunidade via link do GitHub (id -> entrada de catálogo)
  latest: {},     // último release conhecido de apps do catálogo com campo "repo"
  repoCache: {},  // repo -> { entry, at } para listas de registro remoto
  settings: {
    githubToken: '',
    autoUpdateSelf: true,   // atualizar a própria loja sozinha quando ela está em segundo plano
    lastNewsVersion: '',    // última versão cujas novidades foram mostradas
    newsSeen: '',           // assinatura das novidades já vistas (sino)
    selfRepo: '',           // repositório da própria loja (dono/repo) para a atualização automática
    githubClientId: '',     // Client ID do app OAuth (login com código)
    dockAutoHide: false,
    dockSize: 'm',
    dockClassic: false,
    lang: 'auto',           // idioma da interface (auto = do sistema)
    autoStart: false,       // iniciar com o Windows, em segundo plano
    autoUpdateApps: false,  // atualizar sozinho os apps instalados (.zip)
    notify: true,           // notificações do Windows
    catalogUrl: '',
    installDir: path.join(app.getPath('userData'), 'apps'),
    autoLaunch: false,
    reduceMotion: false,
  },
});

function readStateFile() {
  // tenta o arquivo principal e, se estiver corrompido (queda de energia no meio da gravação), a cópia de segurança
  for (const f of [statePath(), statePath() + '.bak']) {
    try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); if (j && typeof j === 'object') return j; } catch {}
  }
  return null;
}
function loadState() {
  try {
    const raw = readStateFile();
    if (!raw) return defaultState();
    const def = defaultState();
    const st = { ...def, ...raw, settings: { ...def.settings, ...(raw.settings || {}) } };
    // token do GitHub guardado criptografado (DPAPI no Windows); tokens antigos em texto continuam valendo
    if (st.settings.githubTokenEnc) {
      try { st.settings.githubToken = safeStorage.decryptString(Buffer.from(st.settings.githubTokenEnc, 'base64')); } catch { st.settings.githubToken = ''; st.account = null; } // não deu para ler o token (outro usuário/PC): pede para entrar de novo
    }
    delete st.settings.githubTokenEnc;
    return st;
  } catch {
    return defaultState();
  }
}
let state = null;
process.on('unhandledRejection', (e) => console.error('Erro não tratado:', e));
function saveState() {
  fs.mkdirSync(path.dirname(statePath()), { recursive: true });
  let out = state;
  try {
    if (state.settings.githubToken && safeStorage.isEncryptionAvailable()) {
      out = { ...state, settings: { ...state.settings, githubToken: '', githubTokenEnc: safeStorage.encryptString(state.settings.githubToken).toString('base64') } };
    }
  } catch {}
  // gravação atômica: escreve num arquivo temporário e troca; a versão anterior vira .bak
  const f = statePath(), tmp = f + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(out, null, 2));
    try { fs.copyFileSync(f, f + '.bak'); } catch {}
    fs.renameSync(tmp, f);
  } catch (e) { console.error('Falha ao salvar o estado:', e.message); }
  rebuildTrayMenu();
}

// ───────────────────────── Utilidades ─────────────────────────
const expandEnv = (p) =>
  String(p || '').replace(/%([^%]+)%/g, (_, k) => process.env[k] ?? process.env[k.toUpperCase()] ?? `%${k}%`);

function send(channel, payload) {
  for (const w of [win, dockWin]) {
    if (w && !w.isDestroyed()) { try { w.webContents.send(channel, payload); } catch {} }
  }
}

function fetchBuffer(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    if (!/^https?:\/\//i.test(url)) return reject(new Error('Endereço inválido (use http ou https).'));
    const lib = url.startsWith('https') ? https : http;
    lib
      .get(url, { headers: { 'User-Agent': 'HelioStore/1.0' }, timeout: 20000 }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
          res.resume();
          return resolve(fetchBuffer(new URL(res.headers.location, url).toString(), redirects - 1));
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        const chunks = []; let size = 0;
        res.on('data', (c) => { size += c.length; if (size > 5e6) return res.destroy(new Error('Catálogo grande demais (limite de 5 MB).')); chunks.push(c); });
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      })
      .on('timeout', function () { this.destroy(new Error('Tempo esgotado ao carregar o catálogo remoto.')); })
      .on('error', reject);
  });
}

// Download com progresso (suporta http(s), file:// e caminhos locais)
const activeJobs = new Map(); // id -> { cancel }

function download(id, url, dest, onProgress, redirects = 5) {
  return new Promise((resolve, reject) => {
    // Arquivo local — copia com progresso
    if (url.startsWith('file://') || /^[a-zA-Z]:[\\/]/.test(url) || url.startsWith('\\\\')) {
      const src = url.startsWith('file://') ? decodeURIComponent(new URL(url).pathname.replace(/^\/([a-zA-Z]:)/, '$1')) : url;
      const total = fs.statSync(src).size;
      let received = 0;
      const rs = fs.createReadStream(src);
      const ws = fs.createWriteStream(dest);
      activeJobs.set(id, { cancel: () => { rs.destroy(new Error('Cancelado')); } });
      rs.on('data', (c) => { received += c.length; onProgress(received, total); });
      rs.on('error', reject);
      ws.on('finish', resolve);
      rs.pipe(ws);
      return;
    }

    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers: { 'User-Agent': 'HelioStore/1.0' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
        res.resume();
        return resolve(download(id, new URL(res.headers.location, url).toString(), dest, onProgress, redirects - 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`Falha no download (HTTP ${res.statusCode})`)); }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let received = 0;
      const ws = fs.createWriteStream(dest);
      res.on('data', (c) => { received += c.length; onProgress(received, total); });
      res.on('error', reject);
      res.on('aborted', () => reject(Object.assign(new Error('Conexão interrompida durante o download'), { retry: true })));
      ws.on('finish', () => (total && received < total ? reject(Object.assign(new Error('Download incompleto'), { retry: true })) : resolve()));
      ws.on('error', reject);
      res.pipe(ws);
    });
    req.on('error', (e) => reject(/Cancelado/.test(e.message) ? e : Object.assign(e, { retry: true })));
    req.setTimeout(30000, () => req.destroy(Object.assign(new Error('Tempo esgotado na conexão'), { retry: true })));
    activeJobs.set(id, { cancel: () => req.destroy(new Error('Cancelado')) });
  });
}

// Tenta de novo até 3 vezes quando a rede cai (não repete cancelamento nem erro HTTP)
async function downloadRetry(id, url, dest, onProgress) {
  for (let i = 1; ; i++) {
    try { return await download(id, url, dest, onProgress); }
    catch (e) {
      await fsp.rm(dest, { force: true }).catch(() => {});
      if (!e.retry || i >= 3 || /Cancelado/.test(e.message)) throw e;
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
}

function run(cmd, args = [], opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true, ...opts }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout);
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ───────────────────────── Notificações e inicialização ─────────────────────────
// Textos do sistema (notificações, bandeja, menu do dock) no idioma escolhido
const MT = {
  en: {
    'Abrir Helio Store': 'Open Helio Store', 'Sair da Helio Store': 'Quit Helio Store', 'Sair': 'Quit', 'Meus aplicativos': 'My apps',
    'Ir para o app': 'Go to app', 'Abrir': 'Open', 'Encerrar': 'Quit app', 'Mostrar pasta do app': 'Show app folder',
    'Helio Store continua aberta': 'Helio Store is still running',
    'Ela segue rodando em segundo plano. Clique no ícone da bandeja para abrir de novo.': 'It keeps running in the background. Click the tray icon to open it again.',
    'Atualização disponível: {0}': 'Update available: {0}', '{0} atualizações disponíveis': '{0} updates available',
    '{0}. Abra a Helio Store para atualizar.': '{0}. Open Helio Store to update.',
    '{0} atualizado': '{0} updated', '{0} apps atualizados': '{0} apps updated', '{0} agora está na versão mais recente.': '{0} is now on the latest version.',
    '{0} instalado': '{0} installed', 'Versão {0} pronta para abrir.': 'Version {0} ready to open.',
    'Helio Store {0} disponível': 'Helio Store {0} available', 'Abra a loja e clique em Atualizar agora.': 'Open the store and click Update now.',
  },
  es: {
    'Abrir Helio Store': 'Abrir Helio Store', 'Sair da Helio Store': 'Salir de Helio Store', 'Sair': 'Salir', 'Meus aplicativos': 'Mis aplicaciones',
    'Ir para o app': 'Ir a la app', 'Abrir': 'Abrir', 'Encerrar': 'Cerrar app', 'Mostrar pasta do app': 'Mostrar carpeta de la app',
    'Helio Store continua aberta': 'Helio Store sigue abierta',
    'Ela segue rodando em segundo plano. Clique no ícone da bandeja para abrir de novo.': 'Sigue funcionando en segundo plano. Haz clic en el icono de la bandeja para abrirla de nuevo.',
    'Atualização disponível: {0}': 'Actualización disponible: {0}', '{0} atualizações disponíveis': '{0} actualizaciones disponibles',
    '{0}. Abra a Helio Store para atualizar.': '{0}. Abre Helio Store para actualizar.',
    '{0} atualizado': '{0} actualizada', '{0} apps atualizados': '{0} apps actualizadas', '{0} agora está na versão mais recente.': '{0} ya está en la última versión.',
    '{0} instalado': '{0} instalada', 'Versão {0} pronta para abrir.': 'Versión {0} lista para abrir.',
    'Helio Store {0} disponível': 'Helio Store {0} disponible', 'Abra a loja e clique em Atualizar agora.': 'Abre la tienda y haz clic en Actualizar ahora.',
  },
};
function uiLang() {
  const p = state?.settings?.lang;
  if (p === 'pt' || p === 'en' || p === 'es') return p;
  const l = String(app.getLocale() || 'pt').toLowerCase();
  return l.startsWith('es') ? 'es' : l.startsWith('en') ? 'en' : 'pt';
}
function mt(key, ...args) {
  const l = uiLang(), v = (l !== 'pt' && MT[l] && MT[l][key]) || key;
  return v.replace(/\{(\d+)\}/g, (_, i) => args[+i] ?? '');
}

function notify(title, body) {
  if (state?.settings.notify === false || !Notification.isSupported()) return;
  try { const n = new Notification({ title, body }); n.on('click', () => showWindow()); n.show(); } catch {}
}

// ───────────────────────── Segurança ─────────────────────────
// Só abre links web no navegador (nada de file://, ms-msdt:, etc.)
function safeOpen(url) {
  try { const u = new URL(String(url)); if (u.protocol === 'https:' || u.protocol === 'http:') return shell.openExternal(u.toString()); } catch {}
  return Promise.resolve();
}
// ids viram nomes de pasta: nada de "..", barras ou caracteres estranhos
const validId = (id) => typeof id === 'string' && /^[\w][\w.-]{0,79}$/.test(id) && !/\.\./.test(id);
const isLocalPath = (u) => /^file:/i.test(u) || /^[a-zA-Z]:[\\/]/.test(u) || u.startsWith('\\\\');
// um caminho só é aceito se ficar dentro da pasta base
const inside = (base, p) => { const r = path.relative(path.resolve(base), path.resolve(p)); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };
const isAppUrl = (u) => {
  try {
    u = String(u || ''); if (!/^file:/i.test(u)) return false;
    const p = path.resolve(require('url').fileURLToPath(u.split(/[?#]/)[0])).toLowerCase();
    const base = path.resolve(__dirname, 'src').toLowerCase();
    return p === base || p.startsWith(base + path.sep);
  } catch { return false; }
};
const trustedSender = (e) => { try { return isAppUrl(e.senderFrame?.url || e.sender.getURL()); } catch { return false; } };
function lockWindow(w) {
  w.webContents.setWindowOpenHandler(({ url }) => { safeOpen(url); return { action: 'deny' }; });
  w.webContents.on('will-navigate', (e, url) => { if (!isAppUrl(url)) { e.preventDefault(); safeOpen(url); } });
  w.webContents.session.setPermissionRequestHandler((_, __, cb) => cb(false));
}

function applyAutoStart() {
  try {
    app.setLoginItemSettings({
      openAtLogin: !!state.settings.autoStart,
      args: app.isPackaged ? ['--hidden'] : [app.getAppPath(), '--hidden'],
    });
  } catch {}
}

// ───────────────────────── Catálogo ─────────────────────────
const REPO_TTL = 60 * 60 * 1000;

// Aplica o último release conhecido (auto-update) sobre apps do catálogo que têm "repo"
function applyLatest(a) {
  const l = a.repo && state.latest[a.id];
  if (!l) return a;
  return { ...a, version: l.version, sizeMB: l.sizeMB || a.sizeMB, changelog: l.changelog || a.changelog,
    download: { ...a.download, url: l.url, sha256: l.sha256, type: l.type || a.download?.type } };
}

async function resolveRegistry(repos) {
  const out = [];
  await Promise.all((repos || []).map(async (r) => {
    const c = state.repoCache[r];
    if (c && Date.now() - c.at < REPO_TTL) return out.push(c.entry);
    try {
      const entry = await gh.resolveRepo(r, { token: state.settings.githubToken });
      entry.source = { ...entry.source, via: 'registry' };
      state.repoCache[r] = { entry, at: Date.now() };
      out.push(entry);
    } catch (e) { if (c) out.push(c.entry); }
  }));
  saveState();
  return out;
}

const OV_TEXT = { name: 60, tagline: 140, description: 4000, category: 30 };
function sanitizeOverride(patch = {}) {
  const out = {};
  for (const [k, max] of Object.entries(OV_TEXT)) {
    if (k in patch) out[k] = patch[k] == null || patch[k] === '' ? null : String(patch[k]).trim().slice(0, max);
  }
  if ('icon' in patch) {
    const i = patch.icon;
    if (i == null || i === '') out.icon = null;
    else if (/^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,/i.test(i) && i.length < 700000) out.icon = i;
    else if (/^https?:\/\//i.test(i) && i.length < 2000) out.icon = i;
  }
  if ('colors' in patch) {
    const c = patch.colors;
    out.colors = Array.isArray(c) && c.length === 2 && c.every((x) => /^#[0-9a-f]{6}$/i.test(x)) ? c : null;
  }
  return out;
}
const withOverrides = (a) => { const o = state.overrides?.[a.id]; return o && Object.keys(o).length ? { ...a, ...o, overrides: o, baseIcon: a.icon } : { ...a, baseIcon: a.icon }; };

// Variáveis de ambiente por app (campo "env" do catálogo LOCAL; catálogos online não podem definir)
let localEnv = {};
function readLocalEnv() {
  try {
    const cat = JSON.parse(fs.readFileSync(path.join(__dirname, 'catalog', 'apps.json'), 'utf8'));
    localEnv = {};
    for (const a of cat.apps || []) {
      if (!a.env || typeof a.env !== 'object') continue;
      const e = {};
      for (const [k, v] of Object.entries(a.env)) if (/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(k) && typeof v === 'string' && v.length < 200) e[k] = v;
      if (Object.keys(e).length) localEnv[a.id] = e;
    }
  } catch {}
}
async function loadCatalog() {
  const localFile = path.join(__dirname, 'catalog', 'apps.json');
  let local = { apps: [] };
  try { local = JSON.parse(await fsp.readFile(localFile, 'utf8')); } catch (e) { console.error(e); }

  let remote = { apps: [] };
  let remoteError = null;
  if (state.settings.catalogUrl) {
    try {
      const url = state.settings.catalogUrl;
      const buf = /^[a-zA-Z]:[\\/]/.test(url) ? await fsp.readFile(url) : await fetchBuffer(url);
      remote = JSON.parse(buf.toString('utf8'));
    } catch (e) {
      remoteError = e.message;
    }
  }
  const map = new Map();
  // 1) apps da comunidade (menor prioridade)  2) registro público (lista de links)  3) catálogo local  4) catálogo remoto
  for (const a of Object.values(state.userApps || {})) map.set(a.id, withOverrides({ ...a, community: true, mine: true }));
  for (const a of await resolveRegistry(remote.repos)) map.set(a.id, { ...a, community: true });
  for (const a of local.apps || []) map.set(a.id, applyLatest(a));
  const remoteWeb = /^https?:/i.test(String(state.settings.catalogUrl || ''));
  for (const a of remote.apps || []) map.set(a.id, remoteWeb ? { ...applyLatest(a), remote: true } : applyLatest(a));
  return { apps: [...map.values()], featured: remote.featured || local.featured || [], remoteError };
}

// ───────────────────── Conta do GitHub ─────────────────────
let deviceJob = null;
async function finishLogin(token) {
  const user = await gh.getUser(token);
  state.settings.githubToken = token; // o mesmo token passa a valer nas consultas (limite maior)
  state.account = user;
  saveState();
  return user;
}
async function loginToken(token) {
  token = String(token || '').trim();
  if (!token) throw new Error('Cole um token do GitHub.');
  return finishLogin(token);
}
function logout() {
  if (deviceJob) deviceJob.cancelled = true;
  state.settings.githubToken = '';
  state.account = null;
  saveState();
}
async function loginDevice() {
  const clientId = String(state.settings.githubClientId || '').trim();
  if (!clientId) throw new Error('Informe o Client ID do app OAuth do GitHub em Ajustes para entrar com código.');
  if (deviceJob) deviceJob.cancelled = true;
  const d = await gh.deviceStart(clientId);
  const job = (deviceJob = { cancelled: false });
  (async () => {
    let wait = d.interval || 5;
    const until = Date.now() + (d.expires_in || 900) * 1000;
    while (!job.cancelled && Date.now() < until) {
      await new Promise((r) => setTimeout(r, wait * 1000));
      if (job.cancelled) return;
      let r;
      try { r = await gh.devicePoll(clientId, d.device_code); } catch { continue; } // falha de rede: tenta de novo
      if (r.token) {
        try { await finishLogin(r.token); send('account:changed', { ok: true }); } catch (e) { send('account:changed', { error: e.message }); }
        return;
      }
      if (r.slow) wait += 5;
      if (r.error) { send('account:changed', { error: r.error }); return; }
    }
    if (!job.cancelled) send('account:changed', { error: 'O código expirou. Tente de novo.' });
  })();
  shell.openExternal(d.verification_uri).catch(() => {});
  return { user_code: d.user_code, verification_uri: d.verification_uri, expires_in: d.expires_in };
}

// ───────────────────── Publicar / atualizar via GitHub ─────────────────────
async function addGithubApp(input) {
  const entry = await gh.resolveRepo(input, { token: state.settings.githubToken });
  const existed = !!state.userApps[entry.id];
  state.userApps[entry.id] = { ...entry, addedAt: state.userApps[entry.id]?.addedAt || Date.now() };
  saveState();
  return { entry: state.userApps[entry.id], existed };
}

let checking = false;
async function checkUpdates() {
  if (checking) return { updated: [] };
  checking = true;
  const updated = [];
  const bumped = []; // apps que ganharam versão nova de verdade
  try {
    const token = state.settings.githubToken;
    // apps da comunidade: re-resolve só se a tag mudou
    for (const a of Object.values(state.userApps)) {
      try {
        const tag = await gh.latestTag(a.source.repo, token);
        if (tag && (tag !== a.version || !a.meta)) {
          if (tag !== a.version) bumped.push(a.id);
          const fresh = await gh.resolveRepo(a.source.repo, { token });
          state.userApps[a.id] = { ...fresh, addedAt: a.addedAt };
          updated.push(a.id);
        }
      } catch {}
    }
    // apps do catálogo com campo "repo"
    try {
      const cat = JSON.parse(await fsp.readFile(path.join(__dirname, 'catalog', 'apps.json'), 'utf8'));
      for (const a of (cat.apps || []).filter((x) => x.repo)) {
        try {
          const tag = await gh.latestTag(a.repo, token);
          const cur = state.latest[a.id]?.version || a.version;
          if (tag && tag !== cur) {
            bumped.push(a.id);
            const fresh = await gh.resolveRepo(a.repo, { token });
            state.latest[a.id] = { version: fresh.version, url: fresh.download.url, type: fresh.download.type, sha256: fresh.download.sha256, sizeMB: fresh.sizeMB, changelog: fresh.changelog };
            updated.push(a.id);
          }
        } catch {}
      }
    } catch {}
    // registro remoto: expira o cache para refazer na próxima carga
    for (const k of Object.keys(state.repoCache)) state.repoCache[k].at = 0;
    saveState();
    if (updated.length) send('catalog:changed', { updated });
    // avisa só quando há versão nova de um app que a pessoa já instalou
    const mine = bumped.filter((id) => state.installed[id] && state.installed[id].type !== 'demo');
    if (mine.length && !state.settings.autoUpdateApps) {
      const names = mine.map((id) => state.installed[id].name || id);
      notify(mine.length === 1 ? mt('Atualização disponível: {0}', names[0]) : mt('{0} atualizações disponíveis', mine.length), mt('{0}. Abra a Helio Store para atualizar.', names.join(', ')));
    }
    if (state.settings.autoUpdateApps) await autoUpdateInstalled();
  } finally { checking = false; }
  return { updated };
}

// ───────────────────── Atualização da própria loja ─────────────────────
// Lê o último Release do repositório da loja; se a versão for maior, baixa o instalador (.exe),
// confere o SHA-256 e roda em modo silencioso. A loja fecha e o instalador abre a nova versão.
let selfUpd = { status: 'idle', current: '', version: '', notes: '', percent: 0, error: '', repo: '' };
let selfAsset = null, selfNotified = '', selfAutoTried = '';
const vParts = (v) => String(v || '').replace(/^v/i, '').split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
function vNewer(a, b) {
  const x = vParts(a), y = vParts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0; }
  return false;
}
function selfRepoName() {
  let r = String(state.settings.selfRepo || '').trim();
  if (!r) { try { const pr = require('./package.json').repository; r = typeof pr === 'string' ? pr : (pr && pr.url) || ''; } catch {} }
  const p = gh.parseRepo(r);
  return p ? `${p.owner}/${p.repo}` : '';
}
function setSelf(patch) { Object.assign(selfUpd, { current: app.getVersion(), repo: selfRepoName() }, patch); send('self:changed', selfUpd); return selfUpd; }
async function checkSelfUpdate(manual) {
  if (selfUpd.status === 'downloading') return selfUpd;
  const repo = selfRepoName();
  if (!repo) return setSelf({ status: manual ? 'error' : 'idle', error: manual ? 'Informe o repositório da Helio Store em Ajustes para checar atualizações da loja.' : '' });
  try {
    const p = gh.parseRepo(repo);
    const rel = await gh.fetchRelease(p.owner, p.repo, state.settings.githubToken);
    const tag = rel && String(rel.tag_name).replace(/^v/i, '');
    if (!rel || !vNewer(tag, app.getVersion())) return setSelf({ status: manual ? 'uptodate' : 'idle', version: '', notes: '', error: '' });
    const exes = (rel.assets || []).filter((a) => /\.exe$/i.test(a.name) && !/blockmap|uninstall/i.test(a.name));
    const asset = exes.find((a) => /setup|install/i.test(a.name)) || exes[0];
    if (!asset) return setSelf({ status: manual ? 'error' : 'idle', error: manual ? `A versão ${tag} não tem um instalador .exe anexado.` : '' });
    if (!/^https:\/\/([\w-]+\.)?(github\.com|githubusercontent\.com)\//i.test(asset.browser_download_url || '')) throw new Error('Endereço de download inesperado no Release.');
    selfAsset = { url: asset.browser_download_url, name: asset.name, sha256: (/^sha256:([0-9a-f]{64})$/i.exec(asset.digest || '') || [])[1] };
    if (selfNotified !== tag) { selfNotified = tag; notify(mt('Helio Store {0} disponível', tag), mt('Abra a loja e clique em Atualizar agora.')); }
    const res = setSelf({ status: 'available', version: tag, notes: String(rel.body || '').slice(0, 1500), error: '' });
    // Atualização automática: só quando a loja está em segundo plano (janela escondida), uma tentativa por versão
    const hidden = !win || win.isDestroyed() || !win.isVisible();
    if (state.settings.autoUpdateSelf !== false && app.isPackaged && hidden && selfAutoTried !== tag) {
      selfAutoTried = tag;
      installSelfUpdate().catch(() => {});
    }
    return res;
  } catch (e) {
    return setSelf({ status: manual ? 'error' : selfUpd.status, error: manual ? e.message : '' });
  }
}
async function installSelfUpdate() {
  if (!app.isPackaged) throw new Error('A atualização da loja só funciona na versão instalada (não com npm start).');
  if (selfUpd.status !== 'available' || !selfAsset) await checkSelfUpdate(true);
  if (selfUpd.status !== 'available' || !selfAsset) throw new Error(selfUpd.error || 'Nenhuma atualização disponível.');
  setSelf({ status: 'downloading', percent: 0, error: '' });
  const dest = path.join(app.getPath('temp'), selfAsset.name);
  try {
    await downloadRetry('self-update', selfAsset.url, dest, (rec, total) => setSelf({ percent: total ? Math.round((rec / total) * 100) : -1 }));
    if (selfAsset.sha256 && (await gh.sha256File(dest)) !== selfAsset.sha256.toLowerCase()) {
      fsp.rm(dest, { force: true }).catch(() => {});
      throw new Error('O instalador baixado não confere com o SHA-256 publicado no GitHub. A atualização foi cancelada.');
    }
  } catch (e) {
    setSelf({ status: 'available', percent: 0, error: e.message });
    throw e;
  }
  setSelf({ status: 'installing', percent: 100 });
  // /S = silencioso; --updated e --force-run (electron-builder/NSIS) reabrem a loja ao terminar
  const child = spawn(dest, ['/S', '--updated', '--force-run'], { detached: true, stdio: 'ignore' });
  child.unref();
  setTimeout(() => { isQuitting = true; app.quit(); }, 600);
  return true;
}

// Atualiza sozinho os apps portáteis (.zip) que estão com versão antiga e fechados
async function autoUpdateInstalled() {
  const cat = await loadCatalog();
  const done = [];
  for (const a of cat.apps) {
    const rec = state.installed[a.id];
    if (!rec || rec.type !== 'zip' || rec.version === a.version) continue;
    if (running.has(a.id) || activeJobs.has(a.id)) continue; // em uso: tenta de novo na próxima checagem
    try { await installApp(a); done.push(a.name); } catch {}
  }
  if (done.length) {
    send('state:changed');
    notify(done.length === 1 ? mt('{0} atualizado', done[0]) : mt('{0} apps atualizados', done.length), mt('{0} agora está na versão mais recente.', done.join(', ')));
  }
}

// ───────────────────────── Instalação ─────────────────────────
// Procura o executável principal dentro da pasta extraída (quando o catálogo não informa "exe")
function autoFindExe(dir, appName = '') {
  const bad = /unins|uninstall|crash|update|redist|vc_|dxsetup|helper/i;
  const found = [];
  const walk = (d, depth) => {
    if (depth > 3) return;
    let items = [];
    try { items = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const it of items) {
      const full = path.join(d, it.name);
      if (it.isDirectory()) walk(full, depth + 1);
      else if (/\.exe$/i.test(it.name) && !bad.test(it.name)) found.push({ full, depth, size: fs.statSync(full).size });
    }
  };
  walk(dir, 0);
  const key = String(appName).toLowerCase().replace(/[^a-z0-9]/g, '');
  const score = (f) => (key && path.basename(f.full).toLowerCase().replace(/[^a-z0-9]/g, '').includes(key) ? 100 : 0) - f.depth * 5 + Math.min(f.size / 1e7, 10);
  found.sort((a, b) => score(b) - score(a));
  return found[0]?.full || null;
}

async function installApp(appInfo) {
  const { id, name, version } = appInfo;
  const dl = appInfo.download || {};
  if (!validId(id)) throw new Error('Esse app tem um identificador inválido e não pode ser instalado.');
  if ((appInfo.remote || appInfo.community || appInfo.source) && dl.url && isLocalPath(String(dl.url))) throw new Error('Apps de catálogos online não podem instalar a partir de arquivos do seu computador.');
  const progress = (phase, extra = {}) => send('install:progress', { id, phase, ...extra });

  if (activeJobs.has(id)) throw new Error('Instalação já em andamento');

  try {
    // Modo demonstração: simula o fluxo completo
    if (!dl.url || dl.url === 'demo') {
      activeJobs.set(id, { cancel: () => { activeJobs.get(id).cancelled = true; } });
      const total = (appInfo.sizeMB || 40) * 1024 * 1024;
      const start = Date.now();
      for (let i = 0; i <= 100; i += 2) {
        if (activeJobs.get(id)?.cancelled) throw new Error('Cancelado');
        const received = (total * i) / 100;
        const elapsed = (Date.now() - start) / 1000 || 0.001;
        progress('downloading', { percent: i, received, total, speed: received / elapsed });
        await sleep(45 + Math.random() * 40);
      }
      progress('installing', { percent: 100 });
      await sleep(900);
      state.installed[id] = { version, type: 'demo', installedAt: Date.now(), name };
      saveState();
      progress('done');
      return state.installed[id];
    }

    if (running.has(id)) throw new Error(`Feche ${name} antes de atualizar ou reinstalar.`);

    const tmpDir = path.join(app.getPath('temp'), 'helio-store');
    await fsp.mkdir(tmpDir, { recursive: true });
    const ext = (dl.type || path.extname(dl.url).slice(1) || 'exe').toLowerCase();
    const file = path.join(tmpDir, `${id}-${version}.${ext}`);

    const start = Date.now();
    let last = 0;
    await downloadRetry(id, dl.url, file, (received, total) => {
      const now = Date.now();
      if (now - last < 80 && received !== total) return;
      last = now;
      const elapsed = (now - start) / 1000 || 0.001;
      progress('downloading', {
        percent: total ? Math.round((received / total) * 100) : -1,
        received, total, speed: received / elapsed,
      });
    });

    progress('installing', { percent: 100 });
    // Confere o arquivo com o SHA-256 publicado pelo GitHub (quando existe)
    if (dl.sha256) {
      const got = await gh.sha256File(file);
      if (got !== String(dl.sha256).toLowerCase()) {
        fsp.rm(file, { force: true }).catch(() => {});
        throw new Error('O arquivo baixado não confere com o SHA-256 publicado no GitHub (pode estar corrompido ou ter sido alterado). A instalação foi cancelada.');
      }
    }
    let record = { version, type: ext, installedAt: Date.now(), name, verified: !!dl.sha256 };

    if (ext === 'zip') {
      const target = path.join(state.settings.installDir, id);
      // Extrai numa pasta temporária: se algo falhar, a versão antiga continua intacta
      const staging = target + '.novo';
      await fsp.rm(staging, { recursive: true, force: true });
      await fsp.mkdir(staging, { recursive: true });
      try {
        // tar (bsdtar) nativo do Windows 10+ extrai .zip
        await run('tar', ['-xf', file, '-C', staging]);
      } catch (e) { await fsp.rm(staging, { recursive: true, force: true }).catch(() => {}); throw e; }
      // Preserva dados do usuário que o app guarda ao lado do executável
      const KEEP = /^(data|dados|saves?|savegames?|config|configs|settings|userdata|user|profile|profiles|plugins|mods|logs?|.*\.(db|sqlite3?|ini|cfg|sav))$/i;
      try {
        for (const item of await fsp.readdir(target, { withFileTypes: true })) {
          if (KEEP.test(item.name)) await fsp.cp(path.join(target, item.name), path.join(staging, item.name), { recursive: true, force: true });
        }
      } catch {}
      // Guarda a versão anterior (uma só) para poder voltar atrás
      const prevDir = target + '.anterior', old = state.installed[id];
      await fsp.rm(prevDir, { recursive: true, force: true });
      if (old && old.type === 'zip' && fs.existsSync(target)) {
        await fsp.rename(target, prevDir);
        record.prevVersion = old.version;
        record.prevExeRel = old.exe ? path.relative(target, old.exe) : null;
      } else await fsp.rm(target, { recursive: true, force: true });
      await fsp.rename(staging, target);
      record.path = target;
      let exePath = dl.exe && inside(target, path.join(target, dl.exe)) ? path.join(target, dl.exe) : null;
      if (exePath && !fs.existsSync(exePath)) {
        const findExe = (dir) => {
          try {
            for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
              const full = path.join(dir, item.name);
              if (item.isDirectory()) {
                const found = findExe(full);
                if (found) return found;
              } else if (dl.exe && item.name.toLowerCase() === path.basename(dl.exe).toLowerCase()) {
                return full;
              }
            }
          } catch {}
          return null;
        };
        const found = findExe(target);
        if (found) exePath = found;
      }
      if (!exePath || !fs.existsSync(exePath)) exePath = autoFindExe(target, name);
      record.exe = exePath;
    } else if (ext === 'msi') {
      await run('msiexec', ['/i', file, ...(dl.args || ['/passive'])]);
      record.launch = dl.launch ? expandEnv(dl.launch) : null;
    } else {
      // .exe (instalador NSIS / Inno / Squirrel etc.)
      await new Promise((resolve, reject) => {
        const p = spawn(file, dl.args || [], { windowsHide: false });
        p.on('error', reject);
        p.on('exit', (code) => (code === 0 || code === null ? resolve() : reject(new Error(`Instalador saiu com código ${code}`))));
      });
      record.launch = dl.launch ? expandEnv(dl.launch) : null;
      record.uninstall = dl.uninstall ? expandEnv(dl.uninstall) : null;
    }

    fsp.rm(file, { force: true }).catch(() => {});
    if (state.installed[id]?.shortcuts) record.shortcuts = state.installed[id].shortcuts;
    state.installed[id] = record;
    saveState();
    refreshShortcuts(id);
    progress('done');
    if (win && !win.isVisible()) notify(mt('{0} instalado', name), mt('Versão {0} pronta para abrir.', version));
    if (state.settings.autoLaunch) launchApp(id).catch(() => {});
    return record;
  } catch (err) {
    progress('error', { message: err.message });
    throw err;
  } finally {
    activeJobs.delete(id);
  }
}

// ───────────────────── Atalhos (Área de Trabalho / Menu Iniciar) ─────────────────────
// O atalho aponta direto para o .exe do app, então funciona com a loja fechada. Só apps que
// precisam de variáveis de ambiente (campo "env") passam pela loja, que abre o app e some.
const SC_WHERE = ['desktop', 'start'];
const shortcutDir = (where) => (where === 'desktop' ? app.getPath('desktop') : path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs'));
const lnkPath = (id, rec, where) => path.join(shortcutDir(where), (String(rec.name || id).replace(/[\\/:*?"<>|]/g, '').trim() || id) + '.lnk');
function writeShortcut(id, where) {
  if (process.platform !== 'win32') throw new Error('Atalhos só estão disponíveis no Windows.');
  if (!SC_WHERE.includes(where)) throw new Error('Local de atalho inválido.');
  const rec = state.installed[id];
  if (!rec) throw new Error('App não instalado.');
  const exe = rec.exe || rec.launch;
  if (!exe || !fs.existsSync(exe)) throw new Error('Não achei o executável deste app para criar o atalho.');
  if (!Object.keys(localEnv).length) readLocalEnv();
  const viaStore = app.isPackaged && Object.keys(localEnv[id] || {}).length > 0;
  const opts = viaStore
    ? { target: process.execPath, args: `--launch=${id}`, cwd: path.dirname(exe), icon: exe, iconIndex: 0, description: rec.name || id }
    : { target: exe, cwd: path.dirname(exe), icon: exe, iconIndex: 0, description: rec.name || id };
  if (!shell.writeShortcutLink(lnkPath(id, rec, where), 'create', opts)) throw new Error('O Windows não deixou criar o atalho.');
  rec.shortcuts = { ...(rec.shortcuts || {}), [where]: true };
  saveState();
  return rec.shortcuts;
}
function removeShortcut(id, where) {
  const rec = state.installed[id];
  if (!rec || !SC_WHERE.includes(where)) return {};
  try { fs.rmSync(lnkPath(id, rec, where), { force: true }); } catch {}
  rec.shortcuts = { ...(rec.shortcuts || {}), [where]: false };
  saveState();
  return rec.shortcuts;
}
// depois de atualizar/voltar versão: recria os atalhos que o usuário tinha ligado
function refreshShortcuts(id) {
  const rec = state.installed[id];
  for (const w of SC_WHERE) if (rec?.shortcuts?.[w]) { try { writeShortcut(id, w); } catch {} }
}

async function uninstallApp(id) {
  const rec = state.installed[id];
  if (!rec) return;
  if (rec.type === 'zip' && rec.path) {
    await fsp.rm(rec.path, { recursive: true, force: true });
    await fsp.rm(rec.path + '.anterior', { recursive: true, force: true }).catch(() => {});
  } else if (rec.uninstall && fs.existsSync(rec.uninstall)) {
    await new Promise((resolve) => {
      const p = spawn(rec.uninstall, [], { detached: false });
      p.on('exit', resolve);
      p.on('error', resolve);
    });
  } else if (rec.type !== 'demo') {
    shell.openExternal('ms-settings:appsfeatures');
  }
  for (const w of SC_WHERE) if (rec.shortcuts?.[w]) removeShortcut(id, w);
  delete state.installed[id];
  saveState();
}

// ───────────── Apps em execução ─────────────
const running = new Map(); // id -> { pid }
const runningIds = () => [...running.keys()];
const broadcastRunning = () => send('running:changed', runningIds());

// Traz a janela do app para a frente (Windows) pelo PID
function activateApp(pid) {
  if (process.platform !== 'win32' || !pid) return;
  const ps = `$s = New-Object -ComObject WScript.Shell; [void]$s.AppActivate(${Number(pid)})`;
  execFile('powershell', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', ps], { windowsHide: true }, () => {});
}

function killApp(id) {
  const r = running.get(id);
  if (!r) return;
  if (process.platform === 'win32') execFile('taskkill', ['/PID', String(r.pid), '/T', '/F'], { windowsHide: true }, () => {});
  else { try { process.kill(r.pid); } catch {} }
}

async function launchApp(id) {
  const rec = state.installed[id];
  if (!rec) throw new Error('App não instalado');
  if (rec.type === 'demo') return { demo: true };
  // Já está aberto: só traz para a frente, sem abrir uma segunda cópia
  if (running.has(id)) { activateApp(running.get(id).pid); return { ok: true, activated: true }; }
  const target = rec.exe || rec.launch;
  if (!target) {
    if (rec.path) return shell.openPath(rec.path);
    throw new Error('Nenhum executável configurado no catálogo (campo "exe" ou "launch").');
  }
  if (!Object.keys(localEnv).length) readLocalEnv();
  const env = { ...process.env, ...(localEnv[id] || {}) };
  const p = spawn(target, [], { detached: true, stdio: 'ignore', cwd: path.dirname(target), env });
  p.on('error', () => { running.delete(id); broadcastRunning(); });
  p.on('exit', () => { running.delete(id); broadcastRunning(); });
  p.unref();
  if (p.pid) { running.set(id, { pid: p.pid }); broadcastRunning(); }
  rec.lastLaunch = Date.now(); saveState();
  return { ok: true };
}

// Espaço em disco dos apps .zip instalados (inclui a versão anterior guardada)
async function dirSize(dir, depth = 0) {
  let total = 0;
  let items = [];
  try { items = await fsp.readdir(dir, { withFileTypes: true }); } catch { return 0; }
  for (const it of items) {
    const full = path.join(dir, it.name);
    try {
      if (it.isDirectory()) { if (depth < 12) total += await dirSize(full, depth + 1); }
      else if (it.isFile()) total += (await fsp.stat(full)).size;
    } catch {}
  }
  return total;
}
async function appSizes() {
  const out = {};
  for (const [id, rec] of Object.entries(state.installed || {})) {
    if (rec.type === 'zip' && rec.path) out[id] = (await dirSize(rec.path)) + (await dirSize(rec.path + '.anterior'));
  }
  return out;
}

// Volta para a versão anterior guardada na última atualização (.zip)
async function rollbackApp(id) {
  const rec = state.installed[id];
  if (!rec || rec.type !== 'zip' || !rec.prevVersion) throw new Error('Não há versão anterior guardada.');
  if (running.has(id)) throw new Error(`Feche ${rec.name || 'o app'} antes de voltar a versão.`);
  const target = rec.path, prevDir = target + '.anterior';
  if (!fs.existsSync(prevDir)) throw new Error('A pasta da versão anterior não foi encontrada.');
  const tmp = target + '.troca';
  await fsp.rm(tmp, { recursive: true, force: true });
  await fsp.rename(target, tmp);
  await fsp.rename(prevDir, target);
  await fsp.rename(tmp, prevDir); // a versão que estava instalada vira a "anterior" (dá para voltar de novo)
  let exe = rec.prevExeRel ? path.join(target, rec.prevExeRel) : null;
  if (!exe || !fs.existsSync(exe)) exe = autoFindExe(target, rec.name || id);
  const next = { ...rec, version: rec.prevVersion, exe, prevVersion: rec.version, prevExeRel: rec.exe ? path.relative(rec.path, rec.exe) : null };
  state.installed[id] = next;
  saveState();
  refreshShortcuts(id);
  return next;
}

// ───────────────────────── Janela ─────────────────────────
function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1020,
    minHeight: 660,
    frame: false,
    backgroundColor: '#07060c',
    show: false,
    title: 'Helio Store',
    ...(fs.existsSync(path.join(__dirname, 'src', 'assets', 'icon.png')) ? { icon: path.join(__dirname, 'src', 'assets', 'icon.png') } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  nativeTheme.themeSource = ({ light: 'light', auto: 'system' })[state.settings.theme] || 'dark';
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.once('ready-to-show', () => {
    if (startHidden) return;
    if (!process.argv.some(a => a.startsWith('--shot='))) {
      win.maximize();
    }
    win.show();
  });
  const shotArg = process.argv.find((a) => a.startsWith('--shot='));
  if (shotArg) {
    win.webContents.once('did-finish-load', async () => {
      await sleep(2500);
      const js = !app.isPackaged && process.argv.find((a) => a.startsWith('--shot-js='));
      if (js) { await win.webContents.executeJavaScript(decodeURIComponent(js.slice(10))); await sleep(1800); }
      const img = await win.webContents.capturePage();
      fs.writeFileSync(shotArg.slice(7), img.toPNG());
      app.quit();
    });
  }
  win.on('maximize', () => send('win:state', { maximized: true }));
  win.on('unmaximize', () => send('win:state', { maximized: false }));
  if (isDev) win.webContents.openDevTools({ mode: 'detach' });
  lockWindow(win);

  // Fechar/minimizar NÃO encerra o app — ele continua em segundo plano na bandeja
  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      win.hide();
      showDock();
      showTrayHint();
    }
  });
}

// ───────────────────── Dock flutuante estilo macOS (2º plano) ─────────────────────
function createDockWindow() {
  dockWin = new BrowserWindow({
    width: 620, height: 150, show: false,
    frame: false, transparent: true, hasShadow: false, backgroundColor: '#00000000',
    resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, alwaysOnTop: true, focusable: true, title: 'Helio Dock',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  lockWindow(dockWin);
  dockWin.setAlwaysOnTop(true, 'screen-saver');
  dockWin.setVisibleOnAllWorkspaces(true);
  dockWin.loadFile(path.join(__dirname, 'src', 'index.html'), { query: { dock: '1' } });
  dockWin.on('close', (e) => { if (!isQuitting) { e.preventDefault(); dockWin.hide(); } });
}

let dockDisplay = null;
let dockLast = { w: 620, h: 150 };
function positionDock(w, h) {
  if (!dockWin || dockWin.isDestroyed()) return;
  if (w) dockLast = { w: Math.max(120, Math.ceil(w)), h: Math.max(4, Math.ceil(h)) };
  const wa = (dockDisplay || screen.getPrimaryDisplay()).workArea;
  dockWin.setBounds({
    width: dockLast.w, height: dockLast.h,
    x: Math.round(wa.x + (wa.width - dockLast.w) / 2),
    y: Math.round(wa.y + wa.height - dockLast.h + 2),
  });
}

function showDock() {
  if (!dockWin || dockWin.isDestroyed()) createDockWindow();
  // aparece no monitor em que o mouse está
  try { dockDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()); } catch { dockDisplay = null; }
  positionDock();
  // a área transparente não bloqueia cliques; o renderer reativa o mouse só quando está sobre o dock
  dockWin.setIgnoreMouseEvents(true, { forward: true });
  dockWin.showInactive();
  dockWin.setAlwaysOnTop(true, 'screen-saver');
  try { dockWin.webContents.send('dock:refresh'); } catch {}
}

function showDockMenu(id) {
  const items = [];
  if (id === '__store') {
    items.push({ label: mt('Abrir Helio Store'), click: () => showWindow() }, { type: 'separator' },
      { label: mt('Sair da Helio Store'), click: () => { isQuitting = true; app.quit(); } });
  } else {
    const rec = state.installed[id];
    if (!rec) return;
    const isRun = running.has(id);
    items.push({ label: isRun ? mt('Ir para o app') : mt('Abrir'), click: () => launchApp(id).catch(() => {}) });
    if (isRun) items.push({ label: mt('Encerrar'), click: () => killApp(id) });
    if (rec.path) items.push({ type: 'separator' }, { label: mt('Mostrar pasta do app'), click: () => shell.openPath(rec.path) });
    items.push({ type: 'separator' }, { label: mt('Abrir Helio Store'), click: () => showWindow() });
  }
  Menu.buildFromTemplate(items).popup({ window: BrowserWindow.getFocusedWindow() || dockWin || win });
}

function hideDock() {
  if (dockWin && !dockWin.isDestroyed()) dockWin.hide();
}

// ───────────────────────── Bandeja (segundo plano) ─────────────────────────
function showWindow() {
  hideDock();
  if (!win || win.isDestroyed()) { createWindow(); return; }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function showTrayHint() {
  if (trayHintShown || !tray) return;
  trayHintShown = true;
  try {
    tray.displayBalloon({
      title: mt('Helio Store continua aberta'),
      content: mt('Ela segue rodando em segundo plano. Clique no ícone da bandeja para abrir de novo.'),
    });
  } catch {}
}

function buildTrayMenu() {
  const items = [
    { label: mt('Abrir Helio Store'), click: () => showWindow() },
    { type: 'separator' },
  ];
  const ids = Object.keys(state?.installed || {}).filter((id) => state.installed[id]);
  if (ids.length) {
    items.push({ label: mt('Meus aplicativos'), enabled: false });
    for (const id of ids) {
      const rec = state.installed[id];
      items.push({ label: '   ' + (rec.name || id), click: () => launchApp(id).catch(() => {}) });
    }
    items.push({ type: 'separator' });
  }
  items.push({ label: mt('Sair'), click: () => { isQuitting = true; app.quit(); } });
  return Menu.buildFromTemplate(items);
}

function rebuildTrayMenu() {
  if (tray) tray.setContextMenu(buildTrayMenu());
}

function createTray() {
  const trayIcon = path.join(__dirname, 'src', 'assets', 'tray.png');
  const img = fs.existsSync(trayIcon)
    ? nativeImage.createFromPath(trayIcon)
    : nativeImage.createFromPath(path.join(__dirname, 'src', 'assets', 'icon.png'));
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
  tray.setToolTip('Helio Store');
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', () => {
    if (win && win.isVisible() && !win.isMinimized()) win.hide();
    else showWindow();
  });
  tray.on('double-click', () => showWindow());
}

app.whenReady().then(() => {
  if (!gotLock) return;
  state = loadState();
  // apps de demonstração (versões antigas da loja) não existem mais: tira do estado
  for (const [k, v] of Object.entries(state.installed || {})) if (v && v.type === 'demo') delete state.installed[k];

  // Aberto por um atalho de app (--launch=id): abre o app e fecha, sem mostrar a loja
  if (launchOnly) {
    readLocalEnv();
    launchApp(launchOnly).catch(() => {}).finally(() => setTimeout(() => { isQuitting = true; app.quit(); }, 1500));
    return;
  }

  // Só a nossa própria interface (arquivos da pasta src) pode chamar os comandos do app
  const _handle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (ch, fn) => _handle(ch, (e, ...args) => { if (!trustedSender(e)) throw new Error('Origem não autorizada.'); return fn(e, ...args); });

  ipcMain.handle('win:minimize', () => { if (win) { win.hide(); showDock(); showTrayHint(); } });
  ipcMain.handle('win:maximize', () => (win.isMaximized() ? win.unmaximize() : win.maximize()));
  ipcMain.handle('win:close', () => { if (win) win.close(); });

  ipcMain.handle('catalog:get', () => loadCatalog());
  ipcMain.handle('state:get', () => state);
  ipcMain.handle('settings:set', (_, patch) => { state.settings = { ...state.settings, ...patch }; saveState(); if ('autoStart' in patch) applyAutoStart(); if ('lang' in patch) rebuildTrayMenu(); if ('theme' in patch) nativeTheme.themeSource = ({ light: 'light', auto: 'system' })[patch.theme] || 'dark'; return state.settings; });
  ipcMain.handle('settings:pickDir', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('settings:pickCatalog', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Catálogo', extensions: ['json'] }] });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle('app:install', (_, info) => installApp(info));
  ipcMain.handle('app:cancel', (_, id) => { activeJobs.get(id)?.cancel(); });
  ipcMain.handle('app:uninstall', (_, id) => uninstallApp(id));
  ipcMain.handle('app:rollback', (_, id) => rollbackApp(id));
  ipcMain.handle('app:sizes', () => appSizes());
  ipcMain.handle('app:launch', (_, id) => launchApp(id));
  ipcMain.handle('shortcut:set', (_, id, where, on) => (on ? writeShortcut(id, where) : removeShortcut(id, where)));
  ipcMain.handle('app:openFolder', (_, id) => { const r = state.installed[id]; if (r?.path) shell.openPath(r.path); });
  ipcMain.handle('shell:open', (_, url) => safeOpen(url));
  ipcMain.handle('github:add', (_, input) => addGithubApp(input));
  // Confere o repositório antes de publicar (não adiciona nada à loja)
  ipcMain.handle('github:inspect', async (_, input) => {
    const e = await gh.resolveRepo(input, { token: state.settings.githubToken });
    return {
      repo: e.source.repo, name: e.name, version: e.version, file: String(e.download.url).split('/').pop(), type: e.download.type, sizeMB: e.sizeMB,
      sha256: !!e.download.sha256, license: e.meta.license || '', manifest: !!e.source.manifest, iconSource: e.iconSource,
      shots: (e.screenshots || []).length, exe: e.download.exe || '', described: e.description !== 'Sem descrição.', category: e.category,
    };
  });
  ipcMain.handle('self:get', () => setSelf({}));
  ipcMain.handle('self:check', () => checkSelfUpdate(true));
  ipcMain.handle('self:install', () => installSelfUpdate());
  ipcMain.handle('account:get', () => state.account || null);
  ipcMain.handle('account:login-token', (_, token) => loginToken(token));
  ipcMain.handle('account:login-device', () => loginDevice());
  ipcMain.handle('account:cancel', () => { if (deviceJob) deviceJob.cancelled = true; });
  ipcMain.handle('account:logout', () => logout());
  ipcMain.handle('account:repos', () => {
    if (!state.settings.githubToken) throw new Error('Entre com o GitHub primeiro.');
    return gh.listMyRepos(state.settings.githubToken);
  });
  ipcMain.handle('github:remove', (_, id) => { delete state.userApps[id]; delete state.overrides[id]; saveState(); });
  ipcMain.handle('github:override', (_, id, patch) => {
    if (!state.userApps[id]) throw new Error('App não encontrado');
    if (patch && patch.__reset) { delete state.overrides[id]; saveState(); return {}; }
    const clean = sanitizeOverride(patch);
    const cur = { ...(state.overrides[id] || {}) };
    for (const [k, v] of Object.entries(clean)) { if (v == null) delete cur[k]; else cur[k] = v; }
    if (Object.keys(cur).length) state.overrides[id] = cur; else delete state.overrides[id];
    saveState();
    return cur;
  });
  ipcMain.handle('clipboard:read', () => {
    const img = clipboard.readImage();
    return { image: img.isEmpty() ? null : img.toDataURL(), text: clipboard.readText() || '' };
  });
  ipcMain.handle('github:check', () => checkUpdates());
  ipcMain.handle('dock:openStore', () => showWindow());
  ipcMain.handle('dock:fit', (_, { w, h }) => positionDock(w, h));
  ipcMain.handle('dock:ignoreMouse', (_, ignore) => { if (dockWin && !dockWin.isDestroyed()) dockWin.setIgnoreMouseEvents(!!ignore, { forward: true }); });
  ipcMain.handle('dock:menu', (_, id) => showDockMenu(id));
  ipcMain.handle('running:get', () => runningIds());
  ipcMain.handle('app:quit', (_, id) => killApp(id));
  screen.on('display-metrics-changed', () => {
    if (dockDisplay) dockDisplay = screen.getAllDisplays().find((d) => d.id === dockDisplay.id) || null;
    positionDock();
  });

  createWindow();
  createTray();
  if (state.settings.autoStart) applyAutoStart();
  if (startHidden) showDock();
  // Atalho global: Ctrl+Alt+H abre a loja ou manda para o segundo plano (dock)
  try {
    globalShortcut.register('CommandOrControl+Alt+H', () => {
      if (win && !win.isDestroyed() && win.isVisible() && win.isFocused()) { win.hide(); showDock(); }
      else showWindow();
    });
  } catch {}
  setTimeout(() => { checkUpdates().catch(() => {}); checkSelfUpdate(false).catch(() => {}); }, 6000);
  setInterval(() => { checkUpdates().catch(() => {}); checkSelfUpdate(false).catch(() => {}); }, 30 * 60 * 1000);
});

app.on('window-all-closed', () => { if (isQuitting) app.quit(); });
app.on('before-quit', () => { isQuitting = true; try { globalShortcut.unregisterAll(); } catch {} });
app.on('activate', () => showWindow());
