(() => {
  const params = new URLSearchParams(location.search);
  const cat = window.__CAT;
  const installed = { 'solidcraft-hl': { version: '0.15.0', type: 'zip', exe: 'C:\\apps\\solidcraft\\solidcraft.exe', installedAt: 1760000000000, name: 'SolidCraft HL' }, 'helio-notes': { version: '2.3.0', type: 'demo', installedAt: 1760000000000, name: 'Helio Notes' } };
  const user = {}; const ov = {};
  const settings = { creatorSeen: true, lastNewsVersion: window.__newsFresh ? '' : '2.0.0', newsSeen: window.__newsFresh ? '' : '*', catalogUrl: '', installDir: 'C:\\Users\\arcid\\AppData\\Roaming\\helio-store\\apps', autoLaunch: false, reduceMotion: false, githubToken: '' };
  window.helio = {
    win: { minimize() {}, maximize() {}, close() {}, onState() {} },
    catalog: async () => ({ apps: [...Object.values(user).map(a => { const o = ov[a.id] || {}; return { ...a, ...o, overrides: o, baseIcon: a.icon, community: true, mine: true }; }), ...cat.apps], featured: cat.featured }),
    state: async () => ({ installed, settings }),
    settings: { set: async (p) => Object.assign(settings, p), pickDir: async () => null, pickCatalog: async () => null },
    shortcut: async (id, where, on) => { if (window.__scFail) throw new Error("Error invoking remote method 'shortcut:set': Error: Não achei o executável deste app para criar o atalho."); const r = installed[id]; r.shortcuts = { ...(r.shortcuts || {}), [where]: on }; return r.shortcuts; },
    translate: async (lang, texts) => { window.__trCalls = (window.__trCalls || 0) + 1; return texts.map(t => '[' + lang + '] ' + t); },
    install: async () => ({}), cancel: async () => {}, uninstall: async () => {}, launch: async () => ({ ok: true }), openFolder() {}, openExternal() {}, onProgress() {},
    self: { _u: { repo: 'hugolindo12/HelioStore', status: 'idle', current: '2.0.0', version: '', percent: 0, error: '' }, _cb: null, get: async function () { return this._u; }, check: async function () { this._u = { status: 'available', current: '2.0.0', version: '2.1.0', percent: 0, error: '' }; return this._u; }, install: async function () { window.__selfInstalled = true; }, onChanged: function (cb) { window.__selfCb = cb; } },
    google: { _u: params.has('nologin') ? null : { name: 'Teste', email: 't@x.com', picture: '' }, get: async function () { return this._u; }, login: async function () { if (window.__gFail) throw new Error("Error invoking remote method 'google:login': Error: Login negado no Google."); this._u = { name: 'Hugo', email: 'h@x.com', picture: '' }; return this._u; }, cancel() {}, logout: async function () { this._u = null; } },
    diag: async () => 'Helio Store v2.0.2 (instalada)\nEletron 44\n--- últimos eventos ---\n(sem eventos)',
    github: {
      versions: async () => [{ tag: 'v1.4.0', version: '1.4.0', date: '2026-10-01', notes: 'Correções', sizeMB: 12, pre: false }, { tag: 'v1.3.0', version: '1.3.0', date: '2026-09-01', notes: '', sizeMB: 11, pre: false }],
      installVersion: async (id, tag) => { (window.__calls = window.__calls || []).push(['installVersion', id, tag]); return { version: tag.replace(/^v/, ''), type: 'zip', pinned: true, installedAt: Date.now() }; },
      stats: async (r) => [{ tag: 'v1.4.0', downloads: 320, date: '2026-10-01' }, { tag: 'v1.3.0', downloads: 910, date: '2026-09-01' }, { tag: 'v1.2.0', downloads: 120, date: '2026-08-01' }],
      inspect: async (u) => { if (/norel/.test(u)) throw new Error("Error invoking remote method 'github:inspect': Error: Esse repositório ainda não tem nenhum Release."); return { tagline: 'Ferramenta de ping rápida para você', icon: '', i18nLangs: ['en','es'], repo: 'fulano/ping', name: 'Ping Tool', version: '1.4.0', file: 'Ping-windows-x64.zip', type: 'zip', sizeMB: 12, sha256: !/nosha/.test(u), license: /nolic/.test(u) ? '' : 'MIT', manifest: false, iconSource: 'avatar', shots: 0, exe: '', described: true, category: 'Utilitários', installers: /multi/.test(u) ? 2 : 1, tag: 'v1.4.0' }; },
      add: async (u) => {
        if (!/github\.com\/[\w.-]+\/[\w.-]+/.test(u)) throw new Error("Error invoking remote method 'github:add': Error: Link inválido. Use algo como https://github.com/usuario/meu-app");
        const svg = 'data:image/svg+xml;utf8,' + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' fill='#0d9488'/><circle cx='32' cy='32' r='16' fill='white'/></svg>");
        const e = { id: 'gh-fulano-ping', name: 'Ping Tool', tagline: 'Monitor de rede minimalista', description: 'Mede latência e perda de pacotes em tempo real.', category: 'Utilitários', developer: 'fulano', version: '1.4.0', sizeMB: 12, glyph: 'chart', colors: ['#30d158', '#00b3a4'], icon: svg, iconSource: 'repo', baseIcon: svg, features: ['Gráfico ao vivo', 'Alertas de queda'], screenshots: [], changelog: 'Primeira versão', download: { url: 'x', type: 'zip' }, meta: { license: 'MIT', language: 'Rust', stars: 1280, forks: 40, downloads: 3420, updatedAt: '2026-10-18T12:00:00Z', homepage: 'https://ping.example' }, source: { type: 'github', repo: 'fulano/ping', url: 'https://github.com/fulano/ping' } };
        const existed = !!user[e.id]; if (!existed) user[e.id] = e; return { entry: user[e.id], existed };
      },
      override: async (id, patch) => {
        if (patch.__reset) { ov[id] = {}; return {}; }
        const cur = ov[id] || (ov[id] = {}); for (const [k, v] of Object.entries(patch)) { if (v == null) delete cur[k]; else cur[k] = v; }
        (window.__calls = window.__calls || []).push(['override', JSON.stringify(Object.keys(patch))]); return cur;
      },
      remove: async (id) => { delete user[id]; }, check: async () => ({ updated: [] }),
    },
    account: { _u: null, get: async function () { return this._u; },
      loginToken: async function (t) { if (t === 'bad') throw new Error("Error invoking remote method 'account:login-token': Error: Token inválido ou expirado."); settings.githubToken = t; return (this._u = { login: 'hugo', name: 'Hugo Lopes', avatar: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44"><circle cx="22" cy="22" r="22" fill="#7b3dff"/></svg>'), url: 'https://github.com/hugo' }); },
      loginDevice: async function () { if (!settings.githubClientId) throw new Error('Informe o Client ID do app OAuth do GitHub em Ajustes para entrar com código.'); return { user_code: 'ABCD-1234', verification_uri: 'https://github.com/login/device', expires_in: 900 }; },
      cancel: async () => {}, logout: async function () { this._u = null; settings.githubToken = ''; },
      repos: async () => ['solidcraft','helio-notes','ping-tool','a','b','c','d','e'].map((n, i) => ({ full_name: 'hugo/' + n, description: 'Descrição ' + n, stars: i * 7, language: 'Rust', pushed_at: '2026-01-01' })),
      onChanged(cb) { window.__acctCb = cb; } },
    sizes: async () => ({ 'solidcraft-hl': 123456789, 'helio-notes': 45678901 }), onCatalogChanged() {}, openStore() {}, dockFit(w, h) { (window.__calls = window.__calls || []).push(['fit', w, h]); }, dockIgnore(v) { (window.__calls = window.__calls || []).push(['ignore', v]); }, dockMenu(id) { (window.__calls = window.__calls || []).push(['menu', id]); }, running: async () => ['solidcraft-hl'], clipboardRead: async () => ({ image: window.__clipImg || null, text: window.__clipText || '' }), onRunning() {}, onDockRefresh() {},
  };
})();
