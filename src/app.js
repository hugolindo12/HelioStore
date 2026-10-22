// ════════════════════════════════════════════════════════════
//  HELIO STORE — interface (renderer)
// ════════════════════════════════════════════════════════════
// Fonte Inter carregada sem travar a abertura (sem internet, a loja usa a fonte do sistema)
try { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'; document.head.appendChild(l); } catch {}
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cleanErr = (e) => String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

// Modo "dock flutuante": janela transparente que mostra só o dock quando a loja vai pro 2º plano
const DOCK_MODE = new URLSearchParams(location.search).get('dock') === '1';
if (DOCK_MODE) document.documentElement.classList.add('dock-only');

const S = {
  apps: [], featured: [], installed: {}, settings: {},
  sort: '',
  account: null,       // conta do GitHub conectada
  self: null,          // estado da atualização da própria loja
  auth: { device: null, busy: false, error: '', showToken: false },
  sizes: {},           // id -> bytes em disco (apps .zip)
  local: new Set(),    // instalações iniciadas por esta janela
  jobs: {},            // id -> { phase, percent, received, total, speed }
  running: new Set(),  // apps abertos nesta sessão
  view: 'discover', cat: 'Todos', query: '', detailId: null,
  publish: { repos: null, reposBusy: false, reposErr: '', allRepos: false, input: '', busy: false, progress: '', error: '', errors: [], ok: '', resultId: null, clip: '' },
  checking: false, lastCheck: null, dockCollapsed: false,
};
const byId = (id) => S.apps.find((a) => a.id === id);

// ───────────── Ícones ─────────────
const ICON = {
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"/><path d="M19 15l.7 2.1L22 18l-2.3.9L19 21l-.7-2.1L16 18l2.3-.9L19 15z"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 5v14l11-7z" fill="currentColor" stroke="none"/></svg>',
  refresh: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 0 0-14.9-3M4 13a8 8 0 0 0 14.9 3"/><path d="M4 4v4h4M20 20v-4h-4"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  help: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.2-2.5 3.9M12 17.2h.01"/></svg>',
  rocket: '<svg viewBox="0 0 24 24"><path d="M5 15c-1.5 1.3-2 4-2 4s2.7-.5 4-2M12 15l-3-3a22 22 0 0 1 2-4 12 12 0 0 1 9-5 12 12 0 0 1-5 9 22 22 0 0 1-4 2zM9 12H4s.5-3 2-4c1.6-1 5 0 5 0M12 15v5s3-.5 4-2c1-1.6 0-5 0-5"/><circle cx="15" cy="9" r="1.2"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15"/></svg>',
  github: '<svg viewBox="0 0 24 24"><path d="M9 19c-4 1.2-4-2-6-2.5m12 5v-3.5a3 3 0 0 0-.8-2.3c2.7-.3 5.5-1.3 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.7 11.7 0 0 0-6 0C6.5 2.8 5.5 3.1 5.5 3.1a4.3 4.3 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.8 5.7 5.5 6a3 3 0 0 0-.8 2.3V22"/></svg>',
  alert: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>',
};
const glyph = (n) => `<svg viewBox="0 0 24 24">${(window.GLYPHS || {})[n] || (window.GLYPHS || {}).box || ''}</svg>`;
const colorVars = (a) => `--c1:${a.colors?.[0] || '#ff7a3d'};--c2:${a.colors?.[1] || '#ff2e7e'}`;
function iconHTML(a, size) {
  const img = a.icon ? `<img src="${esc(a.icon)}" alt="" loading="lazy" decoding="async">` : '';
  return `<div class="app-icon" style="${size ? `--s:${size}px;` : ''}${colorVars(a)}">${glyph(a.glyph)}${img}</div>`;
}
function fmtBytes(b) {
  if (!b || b < 0) return '—';
  const u = ['B', 'KB', 'MB', 'GB']; let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return `${b.toFixed(b < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}

// ───────────── Estado de cada app ─────────────
function appStatus(a) {
  if (S.jobs[a.id]) return 'busy';
  const inst = S.installed[a.id];
  if (!inst) return 'none';
  return inst.version !== a.version ? 'update' : 'installed';
}
const updatesList = () => Object.keys(S.installed).filter((id) => byId(id) && S.installed[id].version !== byId(id).version && !S.jobs[id]);

function getBtnInner(a) {
  const st = appStatus(a), job = S.jobs[a.id];
  if (st === 'busy') {
    const label = job.phase === 'installing' ? 'Instalando…' : job.percent >= 0 ? `${job.percent}%` : 'Baixando…';
    return { cls: `busy${job.percent < 0 || job.phase === 'installing' ? ' indeterminate' : ''}`, p: job.percent, html: `<span class="lbl">${label}</span>` };
  }
  if (st === 'installed') return { cls: 'installed', p: 0, html: `<span class="lbl">${ICON.play} Abrir</span>` };
  if (st === 'update') return { cls: 'upd', p: 0, html: `<span class="lbl">${ICON.refresh} Atualizar</span>` };
  return { cls: '', p: 0, html: `<span class="lbl">${ICON.download} Obter</span>` };
}
function getBtn(a, lg = false) {
  const b = getBtnInner(a);
  return `<button class="get ${lg ? 'lg ' : ''}${b.cls}" data-get="${esc(a.id)}" style="--p:${b.p}"><span class="fill"></span>${b.html}</button>`;
}
function refreshButtons(id) {
  const a = byId(id); if (!a) return;
  $$(`[data-get="${CSS.escape(id)}"]`).forEach((btn) => {
    const b = getBtnInner(a);
    btn.className = `get ${btn.classList.contains('lg') ? 'lg ' : ''}${b.cls}`;
    btn.style.setProperty('--p', b.p);
    const lbl = btn.querySelector('.lbl'), tmp = document.createElement('div');
    tmp.innerHTML = b.html;
    if (lbl.innerHTML !== tmp.firstChild.innerHTML) lbl.replaceWith(tmp.firstChild);
  });
}

function toast(title, msg, a = null, error = false) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `${a ? iconHTML(a, 34) : error ? `<div class="t-ic">${ICON.alert}</div>` : ''}<div><strong>${esc(title)}</strong><span>${esc(msg)}</span></div>`;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 4600);
}

// ───────────── Navegação ─────────────
function go(view) {
  S.view = view;
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === view));
  $('#btn-settings').classList.toggle('active', view === 'settings');
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
  render();
  if (view === 'library') window.helio.sizes?.().then((z) => { S.sizes = z || {}; if (S.view === 'library') renderLibrary(); }).catch(() => {});
  if (view === 'publish') { if (S.account && !S.publish.repos) loadRepos(); checkPubClipboard(); if (!S.settings.creatorSeen) { S.settings.creatorSeen = true; window.helio.settings.set({ creatorSeen: true }); setTimeout(openCreatorGuide, 250); } }
  $('#content').scrollTop = 0;
}
function render() {
  ({ discover: renderDiscover, library: renderLibrary, publish: renderPublish, settings: renderSettings }[S.view] || renderDiscover)();
  updateCounters();
}
function updateCounters() {
  const n = updatesList().length + Object.keys(S.jobs).length;
  const b = $('#badge-lib');
  if (b) { b.hidden = n === 0; b.textContent = n; }
}

// ───────────── Explorar ─────────────
const matches = (a, q) => [a.name, a.tagline, a.category, a.developer].some((t) => String(t || '').toLowerCase().includes(q));

function card(a) {
  const meta = [a.category, a.sizeMB ? `${a.sizeMB} MB` : null].filter(Boolean).join(' · ');
  return `<article class="card" data-open="${esc(a.id)}">${iconHTML(a, 52)}
    <div class="card-body"><h3><span class="nm">${esc(a.name)}</span>${a.community ? '<span class="tag">Comunidade</span>' : ''}${isNewApp(a) ? '<span class="tag new">Novo</span>' : ''}</h3><p>${esc(tx(a, 'tagline'))}</p><small>${esc(meta)}</small></div>
    ${getBtn(a)}</article>`;
}
// Destaques rotativos: mais baixado, escolhidos a dedo, atualizados há pouco e em alta
const WHY = { top: 'Mais baixado', feat: 'Em destaque', upd: 'Atualizado há pouco', hot: 'Em alta' };
function spotlight() {
  const seen = new Set(), pool = [];
  const push = (a, why) => { if (a && !seen.has(a.id)) { seen.add(a.id); pool.push({ a, why }); } };
  const dl = S.apps.filter((a) => a.meta?.downloads > 0).sort((x, y) => y.meta.downloads - x.meta.downloads);
  push(dl[0], 'top');
  S.featured.map(byId).forEach((a) => push(a, 'feat'));
  recentApps(14).slice(0, 4).forEach((a) => push(a, 'upd'));
  S.apps.filter((a) => a.meta?.stars > 0).sort((x, y) => y.meta.stars - x.meta.stars).slice(0, 3).forEach((a) => push(a, 'hot'));
  if (!pool.length) S.apps.slice(0, 6).forEach((a) => push(a, 'feat'));
  return pool;
}
const SPOT_N = 3;
function spotHTML() {
  const pool = spotlight(), pages = Math.max(1, Math.ceil(pool.length / SPOT_N));
  const page = ((S.spot || 0) % pages + pages) % pages;
  const items = Array.from({ length: Math.min(SPOT_N, pool.length) }, (_, i) => pool[(page * SPOT_N + i) % pool.length]);
  return { pages, page, html: items.map((x) => featCard(x.a, x.why)).join('') };
}
function spotDots(pages, page) {
  return pages > 1 ? Array.from({ length: pages }, (_, i) => `<button class="spot-dot ${i === page ? 'on' : ''}" data-spot="${i}" aria-label="${i + 1}"></button>`).join('') : '';
}
function updateSpot(anim) {
  const f = $('#feats'); if (!f) return;
  const r = spotHTML(), set = () => { f.innerHTML = r.html; const d = $('#spot-dots'); if (d) d.innerHTML = spotDots(r.pages, r.page); f.classList.remove('fade'); };
  if (!anim) return set();
  f.classList.add('fade'); setTimeout(set, 220);
}
let spotTimer = null;
function startSpot() {
  if (spotTimer) return;
  spotTimer = setInterval(() => {
    if (S.view !== 'discover' || S.query.trim() || document.hidden || S.settings.reduceMotion) return;
    const f = $('#feats'); if (!f || f.matches(':hover') || f.contains(document.activeElement)) return;
    S.spot = (S.spot || 0) + 1; updateSpot(true);
  }, 9000);
}
function featCard(a, why = 'feat') {
  return `<article class="feat" data-open="${esc(a.id)}" style="${colorVars(a)}">${iconHTML(a, 60)}
    <div class="feat-foot"><div><span class="eyebrow w-${why}">${esc(WHY[why] || WHY.feat)}</span><h3>${esc(a.name)}</h3><p>${esc(tx(a, 'tagline'))}</p></div>${getBtn(a)}</div></article>`;
}
// Ranking da comunidade: apps publicados por GitHub, ordenados por estrelas e downloads
function topCommunity() {
  const score = (a) => (a.meta?.stars || 0) * 3 + (a.meta?.downloads || 0);
  const top = S.apps.filter((a) => a.community).sort((x, y) => score(y) - score(x)).slice(0, 5);
  if (!top.length) return '';
  return `<div class="rank"><h3 class="rank-t">Em alta na comunidade</h3>${top.map((a, i) => `<div class="rank-row" data-open="${esc(a.id)}"><b>${i + 1}</b>${iconHTML(a, 36)}<div class="rank-i"><h4>${esc(a.name)}</h4><p>${esc(tx(a, 'tagline'))}</p></div><span class="rank-n">${a.meta?.stars ? '★ ' + fmtNum(a.meta.stars) : ''}${a.meta?.downloads ? ' · ⬇ ' + fmtNum(a.meta.downloads) : ''}</span></div>`).join('')}</div>`;
}

const COLLS = { 'Para trabalhar': ['Produtividade', 'Desenvolvimento', 'Utilitários', 'Segurança'], 'Para criar': ['Multimídia', 'Criatividade'], 'Para jogar': ['Jogos', 'Social'] };
function renderDiscover() {
  startSpot();
  const el = $('#view-discover'), q = S.query.trim().toLowerCase();
  if (!S.apps.length) { el.innerHTML = '<div class="empty"><strong>Nenhum app ainda</strong>Adicione o primeiro no Helio Creator.</div>'; return; }

  if (q) {
    const res = S.apps.filter((a) => matches(a, q));
    el.innerHTML = `<h1 class="title">Resultados</h1><p class="sub">${res.length} ${res.length === 1 ? 'app encontrado' : 'apps encontrados'} para “${esc(S.query.trim())}”</p>` + // i18n-ignore
      (res.length ? `<div class="grid">${res.map(card).join('')}</div>` : '<div class="empty"><strong>Nada encontrado</strong>Tente outra palavra.</div>');
    return;
  }
  const sp = spotHTML();
  const realCats = [...new Set(S.apps.map((a) => a.category).filter(Boolean))];
  const colls = Object.keys(COLLS).filter((k) => S.apps.some((a) => COLLS[k].includes(a.category)));
  const cats = ['Todos', ...colls, ...realCats];
  if (!cats.includes(S.cat)) S.cat = 'Todos';
  const when = (a) => Date.parse(a.meta?.updatedAt || a.source?.publishedAt || '') || 0;
  const F = S.flt || (S.flt = {});
  let list = S.cat === 'Todos' ? S.apps.slice() : COLLS[S.cat] ? S.apps.filter((a) => COLLS[S.cat].includes(a.category)) : S.apps.filter((a) => a.category === S.cat);
  if (F.ver) list = list.filter((a) => a.download?.sha256);
  if (F.lic) list = list.filter((a) => a.meta?.license);
  if (F.new) list = list.filter((a) => Date.now() - when(a) < 30 * 864e5);
  if (S.sort === 'new') list.sort((x, y) => when(y) - when(x));
  else if (S.sort === 'az') list.sort((x, y) => x.name.localeCompare(y.name, I18N.locale));
  else if (S.sort === 'stars') list.sort((x, y) => (y.meta?.stars || 0) - (x.meta?.stars || 0));
  el.innerHTML = `<h1 class="title">Explorar</h1><p class="sub">Instale, abra e mantenha seus apps atualizados em um só lugar.</p>
    ${S.cached ? '<div class="offline">Sem conexão com o catálogo: mostrando a última cópia salva.</div>' : ''}
    <div class="feats" id="feats">${sp.html}</div><div class="spot-dots" id="spot-dots">${spotDots(sp.pages, sp.page)}</div>
    ${S.cat === 'Todos' ? topCommunity() : ''}
    <div class="chips">${cats.map((c) => `<button class="chip ${c === S.cat ? 'active' : ''} ${COLLS[c] ? 'coll' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    <div class="sortbar"><span class="flts">${[['ver', 'Verificados'], ['lic', 'Com licença'], ['new', 'Novos']].map(([k, l]) => `<button class="sort ${F[k] ? 'on' : ''}" data-flt="${k}" aria-pressed="${!!F[k]}">${l}</button>`).join('')}</span>${[['', 'Destaque'], ['new', 'Recentes'], ['stars', 'Estrelas'], ['az', 'A–Z']].map(([k, l]) => `<button class="sort ${(S.sort || '') === k ? 'on' : ''}" data-sort="${k}">${l}</button>`).join('')}</div>
    ${list.length ? `<div class="grid">${list.map(card).join('')}</div>` : '<div class="empty"><strong>Nada encontrado</strong>Tente outra palavra.</div>'}`;
}

// ───────────── Exportar / importar a lista de apps ─────────────
function exportList() {
  const apps = Object.keys(S.installed).map(byId).filter(Boolean).map((a) => (a.source?.repo ? { id: a.id, repo: a.source.repo } : { id: a.id }));
  return JSON.stringify({ helio: 1, apps }, null, 2);
}
function openImport() {
  openModalHTML(`<h2>Importar lista</h2><p class="sub" style="margin:4px 0 14px">Cole a lista exportada de outro computador. A loja instala o que estiver faltando.</p>
    <textarea id="imp-text" class="fb-text mf-ta" rows="8" spellcheck="false" placeholder='{"helio":1,"apps":[…]}'></textarea>
    <div class="ed-foot"><span class="grow"></span><button class="btn" data-modal-close>Cancelar</button><button class="btn primary" data-imp-go>Instalar tudo</button></div>`);
  setTimeout(() => $('#imp-text')?.focus(), 50);
}
async function runImport() {
  let list;
  try { const j = JSON.parse($('#imp-text')?.value || ''); list = Array.isArray(j.apps) ? j.apps.slice(0, 60) : null; } catch {}
  if (!list || !list.length) return toast('Lista inválida', 'Cole a lista exportada pela loja.', null, true);
  closeModal();
  const todo = [];
  for (const it of list) {
    if (!it || typeof it.id !== 'string') continue;
    let a = byId(it.id);
    if (!a && typeof it.repo === 'string' && ghParse(it.repo)) { try { await window.helio.github.add(repoUrl(ghParse(it.repo))); await reloadCatalog(false); a = byId(it.id); } catch {} }
    if (a && !S.installed[a.id]) todo.push(a);
  }
  if (!todo.length) return toast('Tudo em dia', 'Nada para instalar.');
  if (todo.some((a) => a.community) && !confirm(I18N.t('Há apps da comunidade na lista, publicados por terceiros.\n\nInstale apenas se você confia no autor. Continuar?'))) return;
  toast('Instalando…', `${todo.length}`);
  for (const a of todo) await install(a.id, true);
}

// ───────────── Biblioteca ─────────────
function renderLibrary() {
  const el = $('#view-library');
  const jobs = Object.keys(S.jobs).filter(byId);
  const ups = updatesList();
  const ids = Object.keys(S.installed).filter((id) => byId(id));
  const jobRow = (id) => { const a = byId(id), j = S.jobs[id];
    return `<div class="row" data-open="${esc(id)}">${iconHTML(a, 44)}<div class="row-info"><h4>${esc(a.name)}</h4>
      <p data-job-txt="${esc(id)}">${jobText(j)}</p><div class="bar"><i data-job-bar="${esc(id)}" style="width:${Math.max(j.percent, 0)}%"></i></div></div>
      <div class="row-acts"><button class="btn sq" data-cancel="${esc(id)}" title="Cancelar">${ICON.x}</button></div></div>`; };
  const instRow = (id) => { const a = byId(id), r = S.installed[id], up = r.version !== a.version;
    return `<div class="row" data-open="${esc(id)}">${iconHTML(a, 44)}<div class="row-info"><h4>${esc(a.name)}${a.community ? '<span class="tag">Comunidade</span>' : ''}</h4>
      <p>v${esc(r.version)}${up ? ` → v${esc(a.version)} disponível` : ''} · instalado em ${new Date(r.installedAt).toLocaleDateString(I18N.locale)}${S.sizes[id] ? ' · ' + fmtBytes(S.sizes[id]) : ''}</p>${up && a.changelog ? `<p class="lib-chg">${esc(tx(a, 'changelog').split('\n').find((l) => l.trim()) || '').slice(0, 110)}</p>` : ''}</div>
      <div class="row-acts">${r.path ? `<button class="btn sq" data-folder="${esc(id)}" title="Abrir pasta">${ICON.folder}</button>` : ''}
      <button class="btn sq danger" data-uninstall="${esc(id)}" title="Desinstalar">${ICON.trash}</button>${getBtn(a)}</div></div>`; };

  let html = '<h1 class="title">Biblioteca</h1><p class="sub">Seus apps instalados, downloads em andamento e atualizações.</p>' +
    `<div class="lib-check"><button class="btn" id="lib-check" ${S.checking ? 'disabled' : ''}>${ICON.refresh} ${S.checking ? 'Verificando…' : 'Verificar atualizações'}</button><span>${S.lastCheck ? 'Última verificação às ' + S.lastCheck.toLocaleTimeString(I18N.locale, { hour: '2-digit', minute: '2-digit' }) : 'A loja verifica sozinha a cada 30 minutos.'}</span><span class="grow"></span><button class="btn" data-lib-export>${ICON.copy} Exportar lista</button><button class="btn" data-lib-import>Importar lista</button></div>`;
  if (jobs.length) html += `<div class="section"><h2>Baixando</h2></div><div class="rows">${jobs.map(jobRow).join('')}</div>`;
  if (ups.length) html += `<div class="section"><h2>Atualizações</h2><button class="btn" id="update-all">${ICON.refresh} Atualizar tudo</button></div><div class="rows">${ups.map(instRow).join('')}</div>`;
  const rest = ids.filter((id) => !ups.includes(id) && !S.jobs[id]);
  if (rest.length) html += `<div class="section"><h2>Instalados</h2><span>${rest.length}</span></div><div class="rows">${rest.map(instRow).join('')}</div>`;
  if (!jobs.length && !ids.length) html += '<div class="empty"><strong>Biblioteca vazia</strong>Os apps que você instalar aparecem aqui e no dock.</div>';
  el.innerHTML = html;
}
const jobText = (j) => (j.phase === 'queued' ? 'Na fila…' : j.phase === 'installing' ? 'Instalando…' : `${j.percent >= 0 ? j.percent + '% · ' : ''}${fmtBytes(j.received)}${j.total ? ' de ' + fmtBytes(j.total) : ''} · ${fmtBytes(j.speed)}/s`);
function updateJobRow(id) {
  const j = S.jobs[id]; if (!j) return;
  const t = $(`[data-job-txt="${CSS.escape(id)}"]`), b = $(`[data-job-bar="${CSS.escape(id)}"]`);
  if (t) t.textContent = jobText(j);
  if (b) b.style.width = `${Math.max(j.percent, 0)}%`;
}

// ───────────── Publicar (link do GitHub) ─────────────
const MANIFEST_EXAMPLE = `{
  "name": "Meu App",
  "tagline": "Uma frase curta",
  "description": "Texto mais longo sobre o app.",
  "category": "Produtividade",
  "glyph": "code",
  "colors": ["#ff7a3d", "#ffd166"],
  "icon": "assets/icon.png",
  "exe": "MeuApp.exe"
}`;
// Aceita https://github.com/dono/repo(.git)(/qualquer/coisa) ou só dono/repo
const ghParse = (v) => {
  const x = String(v || '').trim().replace(/\.git(?=$|[/?#])/i, '');
  const m = x.match(/github\.com[/:]([\w.-]+)\/([\w.-]+)/i) || x.match(/^([\w.-]+)\/([\w.-]+)$/);
  return m ? `${m[1]}/${m[2]}` : null;
};
const splitLinks = (v) => [...new Set(String(v || '').split(/[\s,;]+/).filter(Boolean))];
const repoUrl = (r) => `https://github.com/${r}`;
const pubHint = (v) => {
  const l = splitLinks(v); if (!l.length) return { t: '', ok: true };
  const ok = l.map(ghParse);
  if (ok.some((x) => !x)) return { t: 'Link inválido', ok: false };
  return { t: l.length === 1 ? `Repositório: ${ok[0]}` : `${l.length} repositórios detectados`, ok: true };
};

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  try { const t = document.createElement('textarea'); t.value = text; t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove(); return ok; } catch { return false; }
}

// Se a pessoa copiou um link do GitHub, oferece adicionar com um clique
async function checkPubClipboard() {
  const P = S.publish;
  if (S.view !== 'publish' || P.busy) return;
  let txt = ''; try { txt = (await window.helio.clipboardRead()).text || ''; } catch {}
  const have = new Set(S.apps.map((a) => (a.source?.repo || '').toLowerCase()));
  const link = splitLinks(txt).find((l) => { const r = ghParse(l); return r && /github\.com|^[\w.-]+\/[\w.-]+$/i.test(l) && !have.has(r.toLowerCase()); });
  const next = link && txt.length < 400 ? link : '';
  if (next !== P.clip) { P.clip = next; if (S.view === 'publish' && !P.busy) renderPublish(); }
}

// Capturas de tela em tela cheia (setas e Esc)
const LB = { list: [], i: 0 };
function openLightbox(list, i) {
  LB.list = list; LB.i = Math.max(0, i);
  let el = $('#lightbox');
  if (!el) { el = document.createElement('div'); el.id = 'lightbox'; document.body.appendChild(el); }
  el.innerHTML = `<button class="lb-x" aria-label="Fechar" title="Fechar">${ICON.x}</button>
    ${list.length > 1 ? `<button class="lb-nav prev" data-lb-prev aria-label="Anterior">‹</button><button class="lb-nav next" data-lb-next aria-label="Próxima">›</button>` : ''}
    <img id="lb-img" alt=""><span class="lb-n"></span>`;
  el.classList.add('open'); lbShow();
}
function lbShow() { const el = $('#lightbox'); if (!el) return; $('#lb-img').src = LB.list[LB.i]; const n = el.querySelector('.lb-n'); n.textContent = LB.list.length > 1 ? `${LB.i + 1} / ${LB.list.length}` : ''; }
function lbStep(d) { LB.i = (LB.i + d + LB.list.length) % LB.list.length; lbShow(); }
function closeLightbox() { const el = $('#lightbox'); if (el) el.classList.remove('open'); }
const lightboxOpen = () => $('#lightbox')?.classList.contains('open');

// Guia do Helio Creator: abre na primeira visita e a qualquer hora pelo botão "Como funciona"
function openCreatorGuide() {
  const step = (n, h, p) => `<div class="g-step"><b>${n}</b><div><h4>${h}</h4><p>${p}</p></div></div>`;
  $('#modal-card').innerHTML = `<div class="g-badge">${ICON.rocket}</div>
    <h2>Bem-vindo ao Helio Creator</h2>
    <p class="sub" style="margin:4px 0 18px">Publique seu app para o mundo em poucos minutos. Sem formulário e sem servidor.</p>
    <div class="g-steps">
      ${step(1, 'Coloque seu app no GitHub', 'Crie um repositório e publique um Release anexando o arquivo do app: .zip (portátil), .exe ou .msi.')}
      ${step(2, 'Cole o link aqui', 'Cole o link do repositório e clique em Adicionar. A loja lê nome, versão, ícone e descrição sozinha.')}
      ${step(3, 'Seu app aparece na loja', 'Ele ganha a etiqueta Comunidade e qualquer pessoa que use a Helio Store pode instalar.')}
      ${step(4, 'Atualizou? É automático', 'Publicou uma versão nova? A loja detecta a cada 30 minutos e mostra o botão Atualizar para quem já instalou.')}
    </div>
    <div class="g-tips"><h4>Dicas</h4>
      <p>Quer ícone, categoria e descrição sob medida? Use Editar no seu app ou coloque um arquivo helio.json na raiz do repositório.</p>
      <p>Para aparecer para todo mundo, adicione seu repositório ao catálogo público. O botão “Copiar lista para o registro público” já deixa tudo pronto.</p>
      <p>Só repositórios públicos funcionam. Se o GitHub limitar as consultas, adicione um token em Ajustes.</p></div>
    <div class="ed-foot"><span class="grow"></span><button class="btn primary" data-modal-close>Entendi, vamos lá</button></div>`;
  const m = $('#modal'); m.classList.add('open'); m.setAttribute('aria-hidden', 'false'); EDIT.id = null;
}

// Gerador do helio.json: preencha os campos e copie o arquivo pronto
const MF = {};
function manifestText() {
  const o = {};
  for (const k of ['name', 'tagline', 'description', 'category', 'icon', 'exe']) if (MF[k]) o[k] = MF[k];
  if (MF.i18n && Object.keys(MF.i18n).length) o.i18n = MF.i18n;
  return Object.keys(o).length ? JSON.stringify(o, null, 2) : MANIFEST_EXAMPLE;
}

// ───────────── Tradução dos textos dos apps ─────────────
// 1º o que o autor traduziu no helio.json ("i18n"), 2º tradução automática (com cache), 3º o texto original.
const TX = { map: new Map(), pend: new Set(), timer: 0, busy: false };
function txs(text) {
  const s = String(text || '');
  if (!s.trim() || S.settings.autoTranslate === false || !window.helio?.translate) return s;
  const k = I18N.lang + '|' + s.trim();
  if (TX.map.has(k)) return TX.map.get(k);
  if (!TX.pend.has(k)) { TX.pend.add(k); clearTimeout(TX.timer); TX.timer = setTimeout(flushTx, 350); }
  return s;
}
const tx = (a, field) => a.i18n?.[I18N.lang]?.[field] || txs(a[field]);
const txFeatures = (a) => a.i18n?.[I18N.lang]?.features || (a.features || []).map(txs);
async function flushTx() {
  if (TX.busy) { TX.timer = setTimeout(flushTx, 600); return; }
  const lang = I18N.lang, keys = [...TX.pend].filter((k) => k.startsWith(lang + '|')); if (!keys.length) return;
  keys.forEach((k) => TX.pend.delete(k)); TX.busy = true;
  let changed = false;
  try {
    for (let i = 0; i < keys.length; i += 20) {
      const part = keys.slice(i, i + 20), src = part.map((k) => k.slice(lang.length + 1));
      const out = await window.helio.translate(lang, src);
      part.forEach((k, j) => { const v = out?.[j] || src[j]; TX.map.set(k, v); if (v !== src[j]) changed = true; });
    }
  } catch {}
  TX.busy = false;
  if (changed && lang === I18N.lang) {
    if (['discover', 'library', 'publish'].includes(S.view) && !modalOpen()) render();
    if (S.detailId && $('#detail').classList.contains('open')) openDetail(S.detailId);
  }
  if (TX.pend.size) TX.timer = setTimeout(flushTx, 400);
}

// ───────────── Novidades e feedback ─────────────
const NEWS = window.NEWS || [];
const DAY = 864e5;
const recentApps = (days) => S.apps.filter((a) => a.meta?.updatedAt && Date.now() - Date.parse(a.meta.updatedAt) < days * DAY).sort((a, b) => Date.parse(b.meta.updatedAt) - Date.parse(a.meta.updatedAt));
const isNewApp = (a) => !!(a.meta?.updatedAt && Date.now() - Date.parse(a.meta.updatedAt) < 7 * DAY);
const newsSig = () => (NEWS[0]?.v || '') + '|' + recentApps(14).map((a) => a.id + '@' + a.version).join(',');
function refreshNewsDot() { const d = $('#news-dot'); if (d) d.hidden = !(NEWS.length && S.settings.newsSeen !== newsSig()); }
function ago(iso) {
  const d = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / DAY));
  try { return new Intl.RelativeTimeFormat(I18N.locale, { numeric: 'auto' }).format(-d, 'day'); } catch { return ''; }
}
async function openNews(auto) {
  const cur = S.self?.current, rec = recentApps(14).slice(0, 6);
  const notes = NEWS.slice(0, 3).map((n, i) => `<div class="nw-ver"><h4>${i === 0 ? 'Helio Store v' + esc(n.v) : 'Versão ' + esc(n.v)}</h4><ul>${n.items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`).join('');
  $('#modal-card').innerHTML = `<div class="g-badge">${ICON.spark}</div>
    <h2>${auto && cur ? 'Novidades da Helio Store v' + esc(cur) : 'Novidades'}</h2>
    <p class="sub" style="margin:4px 0 16px">${auto ? 'A loja foi atualizada. Veja o que mudou.' : 'O que há de novo na loja e nos apps.'}</p>
    <div class="nw-body">${notes}
      ${rec.length ? `<div class="nw-ver"><h4>Apps com novidades</h4><div class="nw-apps">${rec.map((a) => `<div class="nw-app" data-news-open="${esc(a.id)}">${iconHTML(a, 36)}<div><b>${esc(a.name)}</b><span>v${esc(a.version)} · ${esc(ago(a.meta.updatedAt))}${a.changelog ? ' · ' + esc((a.changelog.split('\n').find((l) => l.trim()) || '').replace(/^[#*\-\s]+/, '').slice(0, 60)) : ''}</span></div></div>`).join('')}</div></div>` : ''}</div>
    <div class="ed-foot"><button class="btn" data-feedback>Enviar feedback</button><span class="grow"></span><button class="btn primary" data-modal-close>Fechar</button></div>`;
  const m = $('#modal'); m.classList.add('open'); m.setAttribute('aria-hidden', 'false'); EDIT.id = null;
  try { S.settings = await window.helio.settings.set({ newsSeen: newsSig(), ...(cur ? { lastNewsVersion: cur } : {}) }); } catch {}
  refreshNewsDot();
}
const FB = { repo: '', label: '', version: '', type: 'idea', app: false, stars: 0, id: '', appRepo: '' };
function openFeedback(ctx) {
  Object.assign(FB, { repo: '', label: 'Helio Store', version: S.self?.current || '', type: 'idea', app: false, stars: 0, id: '', appRepo: '' }, ctx || {});
  if (!FB.repo) FB.repo = S.self?.repo || '';
  if (!FB.repo) return toast('Defina o repositório', 'Informe o repositório da Helio Store em Ajustes para enviar feedback.', null, true);
  const chip = (k, l) => `<button class="chip ${FB.type === k ? 'on' : ''}" data-fb-type="${k}" aria-pressed="${FB.type === k}">${l}</button>`;
  $('#modal-card').innerHTML = `<h2>Enviar feedback</h2>
    <p class="sub" style="margin:4px 0 14px"><b>${esc(FB.label)}</b> Abre uma página do GitHub com a sua mensagem já preenchida. Você só confirma lá (precisa de conta no GitHub) e ela fica pública.</p>
    <div class="d-shortcuts" style="margin:0 0 10px">${chip('idea', 'Ideia')}${chip('bug', 'Problema')}${chip('praise', 'Elogio')}${FB.app ? chip('report', 'Denunciar') : ''}</div>
    ${FB.type === 'report' ? '<p class="sub" style="margin:0 0 10px">A denúncia vai para o repositório da Helio Store, para a equipe analisar o app.</p>' : ''}
    ${FB.app ? `<div class="fb-stars" role="radiogroup" aria-label="Nota">${[1, 2, 3, 4, 5].map((n) => `<button class="star ${FB.stars >= n ? 'on' : ''}" data-fb-star="${n}" aria-label="${n}">★</button>`).join('')}</div>` : ''}
    <textarea id="fb-text" class="fb-text" rows="6" maxlength="3000" placeholder="Escreva aqui o que você quer contar…"></textarea>
    <div class="ed-foot"><span class="grow"></span><button class="btn" data-modal-close>Cancelar</button><button class="btn primary" data-fb-send>Abrir no GitHub</button></div>`;
  const m = $('#modal'); m.classList.add('open'); m.setAttribute('aria-hidden', 'false'); EDIT.id = null;
  setTimeout(() => $('#fb-text')?.focus(), 50);
}
function sendFeedback() {
  const txt = ($('#fb-text')?.value || '').trim();
  if (!txt && !FB.stars) { $('#fb-text')?.focus(); return toast('Escreva sua mensagem', 'O campo está vazio.'); }
  const kind = { idea: ['Ideia', 'enhancement'], bug: ['Problema', 'bug'], praise: ['Elogio', 'feedback'], report: ['Denúncia', 'report'] }[FB.type];
  let target = FB.repo;
  if (FB.type === 'report') { target = S.self?.repo || ''; if (!target) return toast('Defina o repositório', 'Informe o repositório da Helio Store em Ajustes para enviar feedback.', null, true); }
  const os = (navigator.userAgent.match(/Windows NT [\d.]+/) || ['Windows'])[0];
  const title = `[${kind[0]}${FB.stars ? ' ' + '★'.repeat(FB.stars) : ''}] ${txt.split('\n')[0].slice(0, 70)}`;
  const body = `${txt}\n\n---\n${FB.label}${FB.version ? ' v' + FB.version : ''} · ${os}${FB.type === 'report' && FB.appRepo ? `\nhttps://github.com/${FB.appRepo}` : ''}`;
  const url = `https://github.com/${target}/issues/new?labels=${encodeURIComponent(kind[1])}&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
  if (FB.app && FB.stars && FB.id && FB.type !== 'report') { const r = { ...(S.settings.ratings || {}), [FB.id]: FB.stars }; window.helio.settings.set({ ratings: r }).then((st) => { S.settings = st; if (S.detailId === FB.id) openDetail(FB.id); }).catch(() => {}); }
  window.helio.openExternal(url); closeModal(); toast('Abrindo o GitHub', 'Confirme o envio na página que abriu.');
}

// ───────────── Atualização da própria loja ─────────────
function renderSelf() {
  const el = $('#self-banner'), u = S.self; if (!el) return;
  const show = u && ['available', 'downloading', 'installing'].includes(u.status);
  el.hidden = !show;
  if (show) {
    el.innerHTML = u.status === 'available'
      ? `<b>Helio Store v${esc(u.version)} disponível</b><span>${esc(u.error || u.lastFail || 'Você está na v' + u.current + '.')}</span>${u.url && (u.error || u.lastFail) ? `<button class="btn" data-ext="${esc(u.url)}">Baixar manualmente</button>` : ''}<button class="btn primary" data-self-install>${u.error || u.lastFail ? 'Tentar de novo' : 'Atualizar agora'}</button>`
      : `<b>${u.status === 'installing' ? 'Instalando…' : 'Baixando a atualização…'}</b><div class="bar"><i style="width:${u.percent < 0 ? 40 : u.percent}%"></i></div><span style="flex:none">${u.percent >= 0 ? u.percent + '%' : ''}</span>`;
  }
  if (S.view === 'settings') { const r = $('#self-status'); if (r) r.textContent = selfText(); }
}
function selfText() {
  const u = S.self || {};
  if (u.status === 'available') return `Nova versão: v${u.version}`;
  if (u.status === 'uptodate') return 'Você está na versão mais recente.';
  if (u.status === 'error') return u.error;
  return `Versão instalada: v${u.current || '—'}`;
}
window.helio.self?.onChanged((u) => { S.self = u; renderSelf(); });
async function initSelf() {
  try { S.self = await window.helio.self?.get(); } catch {}
  renderSelf(); refreshNewsDot();
  // primeira abertura depois de atualizar (ou instalar): mostra as novidades uma vez
  const cur = S.self?.current;
  if (cur && S.settings.lastNewsVersion !== cur && NEWS.some((n) => n.v === cur)) setTimeout(() => { if (!modalOpen()) openNews(true); }, 900);
}

// ───────────── Perfil de criador (local) ─────────────
const PROF_COLORS = ['#0a84ff', '#30d158', '#ff9f0a', '#ff453a', '#bf5af2', '#64d2ff'];
function profAvatar(size) {
  const p = S.settings.profile || {};
  const pic = S.account?.avatar;
  if (pic) return `<img src="${esc(pic)}" alt="" style="width:${size}px;height:${size}px;border-radius:50%">`;
  return `<span class="prof-av" style="width:${size}px;height:${size}px;background:${esc(p.color || PROF_COLORS[0])};font-size:${Math.round(size * .44)}px">${esc((p.name || '?').trim().charAt(0).toUpperCase())}</span>`;
}
function profileHTML() {
  const p = S.settings.profile, E = S.profEdit;
  if (!p || E) {
    const cur = E?.color || p?.color || PROF_COLORS[0];
    return `<div class="acct"><div class="acct-h"><b>${p ? 'Editar perfil' : 'Crie seu perfil de criador'}</b><span>Seu nome aparece como autor dos apps que você publica. Fica salvo só neste computador.</span></div>
      <div class="pub-box"><input id="prof-name" type="text" maxlength="40" placeholder="Seu nome" value="${esc(E?.name ?? p?.name ?? S.account?.name ?? '')}" autocomplete="off" spellcheck="false"></div>
      <div class="prof-colors">${PROF_COLORS.map((c) => `<button class="prof-dot ${c === cur ? 'on' : ''}" data-prof-color="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}</div>
      <div class="acct-btns" style="margin-top:12px"><button class="btn primary" data-prof-save>${p ? 'Salvar' : 'Criar perfil'}</button>
        ${p ? '<button class="btn" data-prof-cancel>Cancelar</button><button class="btn" data-prof-del>Excluir perfil</button>' : ''}</div></div>`;
  }
  return `<div class="acct in">${profAvatar(44)}<div class="acct-who"><b>${esc(p.name)}</b><span>${S.account ? 'GitHub @' + esc(S.account.login) : 'Perfil neste computador'}</span></div>
    <button class="btn" data-prof-edit>Editar</button><button class="btn" data-signout>Sair</button></div>`;
}

// ───────────── Verificar o repositório antes de publicar ─────────────
function checkItems(d) {
  const it = [];
  const add = (ok, good, tip) => it.push({ ok, text: ok ? good : tip });
  add(true, `Release v${d.version} com ${d.file} (${d.type}, ${d.sizeMB} MB)`);
  add((d.installers || 1) <= 1, 'Um instalador no Release', `O Release ${d.tag || ''} tem ${d.installers} instaladores. Deixe só o da versão atual, senão a loja pode baixar o errado`);
  add(d.sha256, 'SHA-256 publicado: a loja confere o arquivo na instalação', 'Sem SHA-256: a loja não consegue conferir o arquivo. Crie o Release de novo pelo GitHub para ele ser gerado');
  add(!!d.license, `Licença: ${d.license}`, 'Sem licença detectada: adicione um arquivo LICENSE ao repositório');
  add(d.described, 'Descrição encontrada no README', 'Sem descrição: escreva um README ou preencha a descrição do repositório');
  add(d.iconSource !== 'avatar', d.iconSource === 'manifest' ? 'Ícone definido no helio.json' : 'Ícone encontrado no repositório', 'Sem ícone no repositório: a loja usa a sua foto do GitHub. Coloque icon.png na raiz');
  add(d.shots > 0, `${d.shots} captura(s) de tela`, 'Sem capturas de tela: coloque imagens no README ou na pasta screenshots');
  if (d.type === 'zip') add(!!d.exe, `Executável: ${d.exe}`, 'Executável não informado: a loja vai procurar sozinha. Defina "exe" no helio.json');
  add(!!d.i18nLangs?.length, `Traduções do autor: ${(d.i18nLangs || []).join(', ')}`, 'Sem traduções no helio.json: a loja traduz o texto sozinha para o idioma de cada pessoa (dá para refinar com “i18n” no helio.json)');
  add(d.manifest, 'helio.json encontrado', 'Sem helio.json (opcional): ele escolhe nome, ícone, categoria e executável');
  return it;
}
function healthBadge(h, repo) {
  const cls = h.err ? 'bad' : h.ok === h.total ? 'ok' : h.ok >= h.total - 2 ? 'mid' : 'bad';
  return `<button class="hb ${cls}" data-recheck="${esc(repo)}" aria-label="Verificar">${h.err ? '!' : h.ok + '/' + h.total}</button>`;
}
async function checkAll() {
  const P = S.publish, list = S.apps.filter((a) => a.mine && a.source?.repo).map((a) => a.source.repo);
  if (!list.length || P.healthBusy) return;
  P.health = P.health || {}; let done = 0;
  const upd = () => { P.healthBusy = `${done}/${list.length}`; if (S.view === 'publish') renderPublish(); };
  upd();
  const q = [...list];
  const worker = async () => { for (let r; (r = q.shift());) {
    try { const it = checkItems(await window.helio.github.inspect(repoUrl(r))); P.health[r.toLowerCase()] = { ok: it.filter((x) => x.ok).length, total: it.length }; }
    catch { P.health[r.toLowerCase()] = { err: true }; }
    done++; upd();
  } };
  await Promise.all([worker(), worker()]);
  P.healthBusy = ''; if (S.view === 'publish') renderPublish();
}
function checkHTML() {
  const C = S.publish.check; if (!C) return '';
  if (C.busy) return '<div class="chk-box"><em>Lendo o repositório no GitHub…</em></div>';
  if (C.error) return `<div class="pub-msg error">${esc(C.error)}</div>`;
  const d = C.data, it = checkItems(d);
  const okN = it.filter((x) => x.ok).length;
  const prev = { name: d.name, tagline: d.tagline, icon: d.icon, glyph: 'box' };
  return `<div class="chk-box"><div class="chk-h"><b>${esc(d.name)}</b><span>${okN} de ${it.length} itens ok</span></div>
    <div class="chk-prev"><span class="chk-prev-l">Assim ele aparece na loja</span><div class="chk-prev-c">${iconHTML(prev, 44)}<div><h4>${esc(d.name)}</h4><p>${esc(tx({ tagline: d.tagline, i18n: undefined }, 'tagline') || '')}</p></div></div></div>
    <div class="chk-act"><button class="btn" data-pub-preview>Pré-visualizar</button></div>
    ${it.map((x) => `<div class="chk ${x.ok ? 'c-ok' : 'c-warn'}"><i>${x.ok ? '✓' : '!'}</i><span>${esc(x.text)}</span></div>`).join('')}</div>`;
}

// ───────────── Helio Creator: nova versão, estatísticas, gerador ─────────────
const bumpPatch = (v) => { const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v || '')); return m ? `${m[1]}.${m[2]}.${+m[3] + 1}` : '1.0.0'; };
const NV = { id: '', repo: '' };
function openModalHTML(html) {
  $('#modal-card').innerHTML = html;
  const m = $('#modal'); m.classList.add('open'); m.setAttribute('aria-hidden', 'false'); EDIT.id = null;
}
async function openNewVersion(id) {
  const a = byId(id); if (!a?.source?.repo) return;
  NV.id = id; NV.repo = a.source.repo;
  openModalHTML(`<h2>Publicar nova versão</h2>
    <p class="sub" style="margin:4px 0 14px"><b>${esc(a.name)}</b> está na v${esc(a.version)}. A loja abre a página de Release do GitHub já preenchida; você só anexa o instalador e publica.</p>
    <div class="nv-form"><label>Versão<input id="nv-ver" value="${esc(bumpPatch(a.version))}" autocomplete="off" spellcheck="false"></label>
      <label>Título<input id="nv-title" value="${esc(a.name)} ${esc(bumpPatch(a.version))}" autocomplete="off"></label>
      <label>O que mudou<textarea id="nv-notes" class="fb-text" rows="5" placeholder="Escreva aqui o que você quer contar…"></textarea></label></div>
    <div class="chk-box" id="nv-chk"><em>Lendo o repositório no GitHub…</em></div>
    <div class="ed-foot"><span class="grow"></span><button class="btn" data-modal-close>Cancelar</button><button class="btn primary" data-nv-open>Abrir no GitHub</button></div>`);
  try {
    const d = await window.helio.github.inspect(repoUrl(a.source.repo)); if (NV.id !== id) return;
    const items = [
      [(d.installers || 1) <= 1, 'Um instalador no Release', `O Release ${d.tag || ''} tem ${d.installers} instaladores. Deixe só o da versão atual, senão a loja pode baixar o errado`],
      [!!d.sha256, 'SHA-256 publicado: a loja confere o arquivo na instalação', 'Sem SHA-256: a loja não consegue conferir o arquivo. Crie o Release de novo pelo GitHub para ele ser gerado'],
    ];
    const box = $('#nv-chk'); if (box) box.innerHTML = `<div class="chk c-ok"><i>i</i><span>${esc(I18N.t('Release atual: {0}').replace('{0}', d.tag || d.version))}</span></div>` + items.map(([ok, g, w]) => `<div class="chk ${ok ? 'c-ok' : 'c-warn'}"><i>${ok ? '✓' : '!'}</i><span>${esc(I18N.t(ok ? g : w).replace('{0}', ''))}</span></div>`).join('') + `<div class="chk c-ok"><i>i</i><span>${esc(I18N.t('Antes de publicar: aumente a versão no app e anexe o instalador novo.'))}</span></div>`;
  } catch (e) { const box = $('#nv-chk'); if (box) box.innerHTML = `<div class="chk c-warn"><i>!</i><span>${esc(cleanErr(e))}</span></div>`; }
}
function sendNewVersion() {
  const v = ($('#nv-ver')?.value || '').trim().replace(/^v/i, ''), title = ($('#nv-title')?.value || '').trim(), notes = ($('#nv-notes')?.value || '').trim();
  if (!/^\d+\.\d+\.\d+/.test(v)) { $('#nv-ver')?.focus(); return toast('Versão inválida', 'Use algo como 1.2.0.', null, true); }
  window.helio.openExternal(`https://github.com/${NV.repo}/releases/new?tag=v${encodeURIComponent(v)}&title=${encodeURIComponent(title)}&body=${encodeURIComponent(notes)}`);
  closeModal(); toast('Abrindo o GitHub', 'Confirme o envio na página que abriu.');
}
async function openStats(id) {
  const a = byId(id); if (!a?.source?.repo) return;
  openModalHTML(`<h2>Estatísticas</h2><p class="sub" style="margin:4px 0 14px"><b>${esc(a.name)}</b></p><div id="st-body"><em class="sub">Carregando…</em></div><div class="ed-foot"><span class="grow"></span><button class="btn primary" data-modal-close>Fechar</button></div>`);
  try {
    const rows = await window.helio.github.stats(a.source.repo); if (!$('#st-body')) return;
    const max = Math.max(1, ...rows.map((r) => r.downloads)), total = rows.reduce((n, r) => n + r.downloads, 0);
    $('#st-body').innerHTML = rows.length
      ? `<div class="st-sum"><div><b>${fmtNum(total)}</b><span>Downloads</span></div><div><b>${rows.length}</b><span>Versões</span></div><div><b>${fmtNum(a.meta?.stars || 0)}</b><span>Estrelas</span></div></div>
         <div class="st-rows">${rows.map((r) => `<div class="st-row"><span class="st-t">${esc(r.tag)}</span><div class="st-bar"><i style="width:${Math.max(2, Math.round(r.downloads / max * 100))}%"></i></div><b>${fmtNum(r.downloads)}</b></div>`).join('')}</div>`
      : '<div class="empty" style="padding:14px 0;text-align:left">Sem Release</div>';
  } catch (e) { if ($('#st-body')) $('#st-body').innerHTML = `<div class="pub-msg error">${esc(cleanErr(e))}</div>`; }
}
async function fillManifest() {
  const link = splitLinks($('#pub-url')?.value || S.publish.input)[0] || (S.publish.check?.data?.repo ? repoUrl(S.publish.check.data.repo) : '');
  if (!link) return toast('Link inválido', 'Cole o link do repositório no GitHub.', null, true);
  const btn = $('[data-mf-fill]'); if (btn) btn.disabled = true;
  try {
    const d = await window.helio.github.inspect(link);
    const v = { name: d.name, tagline: d.tagline, description: d.description, category: d.category, exe: d.exe };
    for (const [k, val] of Object.entries(v)) { MF[k] = val || ''; const i = $(`[data-mf="${k}"]`); if (i) i.value = val || ''; }
    const o = $('#mf-out'); if (o) o.textContent = manifestText();
    toast('helio.json preenchido', 'Revise os campos e copie o arquivo.');
  } catch (e) { toast('Não foi possível ler o repositório', cleanErr(e), null, true); }
  if (btn) btn.disabled = false;
}
function readmeTemplate() {
  const n = MF.name || 'Meu App', t = MF.tagline || 'Uma frase curta sobre o app.'; // i18n-ignore
  return `# ${n}\n\n${t}\n\n${MF.description || 'Descreva o que o app faz e para quem ele é.'}\n\n## Instalação\n\nBaixe o instalador na aba **Releases** ou instale pela Helio Store.\n\n## Recursos\n\n- \n- \n\n## Capturas de tela\n\n![Tela principal](screenshots/1.png)\n\n## Licença\n\nMIT\n`; // i18n-ignore
}

// ───────────── Acessibilidade: teclado e leitor de tela ─────────────
(function a11yInit() {
  const SEL = '.card[data-open], .feat[data-open], .rank-row[data-open], .row[data-open]';
  let raf = 0;
  const pass = () => {
    raf = 0;
    document.querySelectorAll(SEL).forEach((e) => { if (!e.hasAttribute('tabindex')) e.tabIndex = 0; if (!e.hasAttribute('role')) e.setAttribute('role', 'button'); });
    document.querySelectorAll('button[title]:not([aria-label])').forEach((b) => b.setAttribute('aria-label', b.getAttribute('title')));
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(pass); };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.(SEL)) { e.preventDefault(); e.target.click(); }
  });
  schedule();
})();

// ───────────── Diagnóstico e versões anteriores ─────────────
function openPreview() {
  const d = S.publish.check?.data; if (!d) return;
  const a = { name: d.name, tagline: d.tagline, icon: d.icon, glyph: 'box' };
  const meta = [d.version ? 'v' + d.version : '', d.sizeMB ? d.sizeMB + ' MB' : '', d.category || '', d.license || ''].filter(Boolean).join(' · ');
  openModalHTML(`<h2>Pré-visualização</h2><p class="sub" style="margin:4px 0 14px">Assim a página do app aparece na loja.</p>
    <div class="chk-prev-c" style="margin-bottom:12px">${iconHTML(a, 64)}<div><h4 style="font-size:18px">${esc(d.name)}</h4><p>${esc(d.tagline || '')}</p><p style="opacity:.7">${esc(meta)}</p></div></div>
    <div class="txt">${esc(d.description || '')}</div>
    <div class="ed-foot"><span class="grow"></span><button class="btn primary" data-modal-close>Fechar</button></div>`);
}
function reportStore() {
  const txt = ($('#diag-pre')?.textContent || '').slice(0, 5500);
  const repo = S.self?.repo || 'hugolindo12/HelioStore';
  const body = `Descreva o problema aqui.\n\n---\nDiagnóstico:\n\`\`\`\n${txt}\n\`\`\``; // i18n-ignore
  window.helio.openExternal(`https://github.com/${repo}/issues/new?labels=bug&title=${encodeURIComponent('[Loja] Problema')}&body=${encodeURIComponent(body)}`);
  toast('Abrindo o GitHub', 'Confirme o envio na página que abriu.');
}
async function openDiag() {
  openModalHTML(`<h2>Diagnóstico</h2><p class="sub" style="margin:4px 0 12px">Versão, sistema e últimos eventos da loja.</p><pre id="diag-pre" class="diag-pre">…</pre>
    <div class="ed-foot"><button class="btn" data-diag-copy>${ICON.copy} Copiar</button><button class="btn" data-diag-report>Reportar problema</button><span class="grow"></span><button class="btn primary" data-modal-close>Fechar</button></div>`);
  try { const t = await window.helio.diag(); const pre = $('#diag-pre'); if (pre) pre.textContent = t; } catch (e) { const pre = $('#diag-pre'); if (pre) pre.textContent = cleanErr(e); }
}
async function loadVersions(id) {
  const a = byId(id), box = $('#d-vers'); if (!a?.source?.repo || !box) return;
  box.innerHTML = '<em class="sub">Carregando…</em>';
  try {
    const list = await window.helio.github.versions(a.source.repo), cur = S.installed[id]?.version;
    box.innerHTML = (S.installed[id]?.pinned ? '<p class="sub" style="margin:0 0 8px">Você instalou uma versão antiga: a atualização automática não mexe neste app. Clique em Atualizar para ir para a mais nova.</p>' : '') +
      list.map((v) => `<div class="ver-row"><div><b>v${esc(v.version)}</b>${v.pre ? '<span class="tag">pré</span>' : ''}<span class="ver-d">${esc(new Date(v.date).toLocaleDateString(I18N.locale))} · ${v.sizeMB} MB</span>${v.notes ? `<p>${esc(v.notes.split('\n').find((l) => l.trim()) || '')}</p>` : ''}</div>
        ${cur === v.version ? '<span class="tag">Instalado</span>' : `<button class="btn" data-vers-install="${esc(v.tag)}" data-vers-id="${esc(id)}" data-vers-ver="${esc(v.version)}">Instalar</button>`}</div>`).join('') || '<em class="sub">Sem Release</em>';
  } catch (e) { box.innerHTML = `<div class="pub-msg error">${esc(cleanErr(e))}</div>`; }
}
async function installVersion(id, tag, ver) {
  const a = byId(id); if (!a || S.jobs[id]) return;
  if (!confirm(I18N.t('Instalar a v{0}? A atualização automática deixa de mexer neste app até você atualizar manualmente.').replace('{0}', ver))) return;
  S.local.add(id); S.jobs[id] = { phase: 'downloading', percent: 0, received: 0, total: 0, speed: 0 };
  refreshButtons(id); renderDock();
  try {
    const rec = await window.helio.github.installVersion(id, tag);
    S.installed[id] = rec; toast(`${a.name} instalado`, `Versão ${rec.version} pronta para abrir.`, a);
  } catch (e) { toast(`Falha ao instalar ${a.name}`, cleanErr(e), null, true); }
  delete S.jobs[id]; S.local.delete(id); await reloadCatalog(false); renderDock(); render(); if (S.detailId === id) openDetail(id);
}

// ───────────── Conta do GitHub ─────────────
function acctHTML(gate) {
  const A = S.auth, P = S.publish;
  if (S.account) {
    const have = new Set(S.apps.map((a) => (a.source?.repo || '').toLowerCase()));
    const repos = P.repos || [], shown = P.allRepos ? repos : repos.slice(0, 6);
    return `<div class="section"><h2>Seus repositórios no GitHub</h2><button class="btn" data-repos-load ${P.reposBusy ? 'disabled' : ''}>${ICON.refresh} ${P.reposBusy ? 'Carregando…' : 'Atualizar lista'}</button></div>
      ${P.reposErr ? `<div class="pub-msg error">${esc(P.reposErr)}</div>` : ''}
      ${repos.length ? `<div class="rows">${shown.map((r) => `<div class="row"><div class="row-info"><h4>${esc(r.full_name)}</h4>
        <p>${[r.release ? 'v' + r.release : (r.release === '' ? 'Sem Release' : ''), r.description, r.language, r.stars ? '★ ' + fmtNum(r.stars) : ''].filter(Boolean).map(esc).join(' · ') || '—'}</p></div>
        <div class="row-acts">${have.has(r.full_name.toLowerCase()) ? '<span class="tag">Na loja</span>' : `<button class="btn" data-repo-add="${esc(r.full_name)}" ${P.busy ? 'disabled' : ''}>Adicionar</button>`}</div></div>`).join('')}</div>
        ${repos.length > 6 && !P.allRepos ? `<button class="btn" data-repos-all style="margin-top:8px">Ver todos (${repos.length})</button>` : ''}`
        : (!P.reposBusy && P.repos ? '<div class="empty" style="padding:14px 0;text-align:left">Nenhum repositório público encontrado.</div>' : '')}`;
  }
  const hasId = !!(S.settings.githubClientId || '').trim();
  return `<div class="acct"><div class="acct-h"><b>${gate ? 'Entrar com o GitHub' : 'Vincular o GitHub'}</b><span>${gate ? 'Publique apps e veja seus repositórios para adicionar com um clique.' : 'Opcional. Mostra seus repositórios para adicionar com um clique e aumenta o limite de consultas.'}</span></div>
    ${A.device ? `<div class="acct-code"><span>Digite este código em github.com/login/device</span><code>${esc(A.device.user_code)}</code>
        <div class="acct-btns"><button class="btn primary" data-acct-open>Abrir github.com/login/device</button><button class="btn" data-acct-cancel>Cancelar</button></div><em>Aguardando a autorização…</em></div>`
    : `<div class="acct-btns">${hasId ? `<button class="btn primary" data-acct-device ${A.busy ? 'disabled' : ''}>${ICON.github} Entrar com o GitHub</button>` : ''}
        <button class="btn ${hasId ? '' : 'primary'}" data-acct-tokentoggle>${ICON.github} Entrar com um token</button></div>
      ${hasId ? '' : '<p class="acct-note">Para entrar com código (sem colar token), informe o Client ID de um app OAuth do GitHub em Ajustes.</p>'}
      ${A.showToken ? `<div class="pub-box" style="margin-top:10px"><input id="acct-token" type="password" placeholder="ghp_…" autocomplete="off" spellcheck="false"><button class="btn primary" id="acct-token-go" ${A.busy ? 'disabled' : ''}>Entrar</button></div>
        <p class="acct-note">Crie em github.com/settings/tokens. Para repositórios públicos não precisa marcar nenhuma permissão.</p>` : ''}`}
    ${A.error ? `<div class="pub-msg error">${esc(A.error)}</div>` : ''}</div>`;
}
async function loadRepos() {
  const P = S.publish; if (!S.account || P.reposBusy) return;
  P.reposBusy = true; P.reposErr = ''; if (S.view === 'publish') renderPublish();
  try { P.repos = await window.helio.account.repos(); } catch (e) { P.reposErr = cleanErr(e); }
  P.reposBusy = false; if (S.view === 'publish') renderPublish();
}
async function afterLogin(user) {
  S.account = user; S.auth = { device: null, busy: false, error: '', showToken: false }; S.publish.repos = null;
  try { S.settings = (await window.helio.state()).settings; } catch {}
  if (!S.settings.profile) { S.settings = await window.helio.settings.set({ profile: { name: user.name || user.login, color: PROF_COLORS[0] } }); }
  toast('Conectado ao GitHub', `@${user.login}`); if (S.view === 'publish') renderPublish(); loadRepos();
}
window.helio.account?.onChanged(async (p) => {
  if (p.ok) { try { await afterLogin(await window.helio.account.get()); } catch {} }
  else { S.auth.device = null; S.auth.busy = false; S.auth.error = p.error || ''; if (S.view === 'publish') renderPublish(); }
});

function loginGate(el) {
  el.innerHTML = `<div class="creator-head"><h1 class="title">Helio Creator</h1><button class="btn" data-guide>${ICON.help} Como funciona</button></div>
    <p class="sub">Entre com o GitHub para usar o Helio Creator.</p>
    <div class="login-grid">${acctHTML(true)}</div>`;
}
function renderPublish() {
  const el = $('#view-publish'), P = S.publish;
  if (!S.account) return loginGate(el);
  const mine = S.apps.filter((a) => a.mine);
  const res = P.resultId && byId(P.resultId);
  const hint = pubHint(P.input);
  const oneLink = hint.ok && splitLinks(P.input).length === 1;
  const clipRepo = P.clip && ghParse(P.clip);
  const row = (a) => {
    const m = a.meta || {}, repo = a.source?.repo;
    const info = [`v${a.version}`, repo, m.stars ? `★ ${fmtNum(m.stars)}` : '', m.downloads ? `⬇ ${fmtNum(m.downloads)}` : '', m.updatedAt ? new Date(m.updatedAt).toLocaleDateString(I18N.locale) : ''].filter(Boolean);
    return `<div class="row" data-open="${esc(a.id)}">${iconHTML(a, 44)}
      <div class="row-info"><h4>${esc(a.name)}${S.account && repo && repo.split('/')[0].toLowerCase() === S.account.login.toLowerCase() ? '<span class="tag">Seu repositório</span>' : ''}</h4><p>${info.map(esc).join(' · ')}</p></div>
      <div class="row-acts">${repo ? `<button class="btn sq" data-copy="${esc(repoUrl(repo))}" title="Copiar link">${ICON.copy}</button><button class="btn sq" data-ext="${esc(repoUrl(repo))}" title="Abrir no GitHub">${ICON.github}</button>` : ''}
        ${repo && P.health?.[repo.toLowerCase()] ? healthBadge(P.health[repo.toLowerCase()], repo) : ''}${repo ? `<button class="btn" data-recheck="${esc(repo)}">Verificar</button><button class="btn" data-newver="${esc(a.id)}">Nova versão</button><button class="btn" data-stats="${esc(a.id)}">Estatísticas</button>` : ''}<button class="btn" data-edit="${esc(a.id)}">Editar</button><button class="btn" data-remove="${esc(a.id)}">Remover</button>${getBtn(a)}</div></div>`;
  };
  el.innerHTML = `<div class="creator-head"><h1 class="title">Helio Creator</h1><button class="btn" data-guide>${ICON.help} Como funciona</button></div>
    <p class="sub">Cole o link do repositório no GitHub. A loja lê o último Release, instala e mantém o app atualizado sozinha sempre que você publicar uma versão nova.</p>
    <div class="acct-wrap">${profileHTML()}${acctHTML()}</div>
    <div class="pub-box"><input id="pub-url" type="text" placeholder="https://github.com/usuario/meu-app" value="${esc(P.input)}" spellcheck="false" autocomplete="off">
      <button class="btn" id="pub-check" ${P.busy || P.check?.busy || !oneLink ? 'disabled' : ''}>${P.check?.busy ? 'Verificando…' : 'Verificar'}</button>
      <button class="btn primary" id="pub-add" ${P.busy || !hint.ok ? 'disabled' : ''}>${P.busy ? esc(P.progress || 'Lendo…') : 'Adicionar'}</button></div>
    <div class="pub-hint ${hint.ok ? '' : 'bad'}" id="pub-hint">${hint.t ? esc(hint.t) : 'Dica: cole vários links de uma vez (separados por espaço ou linha).'}</div>
    ${checkHTML()}
    ${clipRepo && !P.input ? `<button class="clip-chip" data-pub-clip="${esc(P.clip)}">${ICON.github}<span>Link do GitHub copiado:</span><b>${esc(clipRepo)}</b><em>Adicionar agora</em></button>` : ''}
    ${P.error ? `<div class="pub-msg error">${esc(P.error)}</div>` : ''}
    ${(P.errors || []).length ? `<div class="pub-msg error"><b>Não foi possível adicionar:</b>${P.errors.map((e) => `<div class="pub-fail"><code>${esc(e.repo)}</code><span>${esc(e.msg)}</span></div>`).join('')}</div>` : ''}
    ${P.ok ? `<div class="pub-msg ok">${esc(P.ok)}</div>` : ''}
    ${res ? `<div class="pub-result">${card(res)}<button class="btn" data-edit="${esc(res.id)}" style="margin-top:10px">Personalizar ícone e informações</button></div>` : ''}
    <div class="steps">
      <div class="step"><b>1</b><h4>Publique um Release</h4><p>No GitHub, crie um Release e anexe o <code>.zip</code> (ou <code>.exe</code> / <code>.msi</code>) do app.</p></div>
      <div class="step"><b>2</b><h4>Cole o link aqui</h4><p>A loja lê nome, versão e arquivo sozinha. Nada de formulário.</p></div>
      <div class="step"><b>3</b><h4>Atualize quando quiser</h4><p>Publicou uma tag nova? A loja detecta e mostra <code>Atualizar</code> para quem já instalou.</p></div>
    </div>
    <details class="manifest"><summary>Personalizar com helio.json (opcional)</summary>
      <p class="sub" style="margin:10px 0 8px">Coloque este arquivo na raiz do repositório para definir ícone, categoria e descrição.</p>
      <div class="mf-form">
        <input data-mf="name" placeholder="Nome do app" autocomplete="off" spellcheck="false">
        <input data-mf="tagline" placeholder="Frase curta" autocomplete="off">
        <textarea data-mf="description" class="mf-ta" rows="3" placeholder="Descrição" autocomplete="off"></textarea>
        <input data-mf="category" placeholder="Categoria" list="mf-cats" autocomplete="off">
        <input data-mf="exe" placeholder="Executável (ex.: MeuApp.exe)" autocomplete="off" spellcheck="false">
        <input data-mf="icon" placeholder="Ícone (ex.: assets/icon.png)" autocomplete="off" spellcheck="false">
        <datalist id="mf-cats">${[...new Set(S.apps.map((a) => a.category).filter(Boolean))].map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
      </div>
      <button class="btn" data-copy-manifest>${ICON.copy} Copiar</button> <button class="btn" data-mf-translate ${MF.busy ? 'disabled' : ''}>${MF.busy ? 'Traduzindo…' : 'Traduzir para todos os idiomas'}</button> <button class="btn" data-mf-fill>Preencher pelo repositório</button> <button class="btn" data-copy-readme>Copiar README modelo</button>
      <p class="sub" style="margin:8px 0 0">Gera o bloco “i18n” com a frase curta e a descrição em cada idioma da loja. Revise antes de publicar.</p><pre id="mf-out">${esc(manifestText())}</pre></details>
    <div class="section"><h2>Seus apps</h2>${mine.some((a) => a.source?.repo) ? `<button class="btn" data-check-all ${P.healthBusy ? 'disabled' : ''}>${ICON.refresh} ${P.healthBusy ? esc(P.healthBusy) : 'Verificar todos'}</button>` : ''}<span>${mine.length}${mine.length ? ' · ★ ' + fmtNum(mine.reduce((n, a) => n + (a.meta?.stars || 0), 0)) + ' · ⬇ ' + fmtNum(mine.reduce((n, a) => n + (a.meta?.downloads || 0), 0)) : ''}</span></div>
    ${mine.length ? `<div class="rows">${mine.map(row).join('')}</div>
      <div class="reg-box"><p>Para aparecer para todo mundo, adicione seus repositórios à lista “repos” do catálogo público.</p><button class="btn" data-copy-registry>${ICON.copy} Copiar lista para o registro público</button></div>`
      : '<div class="empty" style="padding:22px 0;text-align:left">Você ainda não adicionou nenhum app.</div>'}
    <div class="foot-acts"><button class="btn" id="check-updates" ${S.checking ? 'disabled' : ''}>${ICON.refresh} ${S.checking ? 'Verificando…' : 'Verificar atualizações'}</button>
      <span>${S.lastCheck ? 'Última verificação às ' + S.lastCheck.toLocaleTimeString(I18N.locale, { hour: '2-digit', minute: '2-digit' }) : 'A loja verifica automaticamente a cada 30 minutos.'}</span></div>`;
}

// Adiciona um ou vários links (um por linha, espaço ou vírgula)
async function addFromGithub(forced) {
  const P = S.publish, v = (forced || $('#pub-url')?.value || P.input).trim();
  P.input = v; P.error = ''; P.errors = []; P.ok = ''; P.resultId = null; P.progress = ''; P.clip = '';
  const links = splitLinks(v);
  if (!links.length) { P.error = 'Cole o link do repositório no GitHub.'; return renderPublish(); }
  const bad = links.filter((l) => !ghParse(l));
  if (bad.length) { P.error = links.length === 1 ? 'Link inválido. Use algo como https://github.com/usuario/meu-app' : `Estes links não são válidos: ${bad.join(', ')}`; return renderPublish(); }
  P.busy = true; renderPublish();
  const added = []; let last = null, existedOne = false;
  for (let i = 0; i < links.length; i++) {
    if (links.length > 1) { P.progress = `Lendo ${i + 1} de ${links.length}…`; renderPublish(); }
    try { const r = await window.helio.github.add(links[i]); added.push(r); last = r; existedOne = r.existed; }
    catch (e) { P.errors.push({ repo: ghParse(links[i]), msg: cleanErr(e) }); }
  }
  if (added.length) await reloadCatalog(false);
  if (added.length === 1 && !P.errors.length) {
    const r = last; P.resultId = r.entry.id; P.input = '';
    const ic = { manifest: 'ícone do helio.json', repo: 'ícone encontrado no repositório', avatar: 'sem ícone no repositório, usando a foto do autor' }[r.entry.iconSource] || '';
    P.ok = (existedOne ? `${r.entry.name} foi atualizado para a v${r.entry.version}.` : `${r.entry.name} (v${r.entry.version}) foi adicionado à loja.`) + (ic ? ` Ícone: ${ic}.` : '');
  } else if (added.length) {
    P.resultId = last.entry.id; P.input = P.errors.map((e) => e.repo).join(' ');
    P.ok = added.length === 1 ? `${last.entry.name} (v${last.entry.version}) foi adicionado à loja.` : `${added.length} apps adicionados à loja.`;
  } else if (P.errors.length === 1) { P.error = P.errors[0].msg; P.errors = []; }
  P.busy = false; if (S.view === 'publish') renderPublish();
}
async function checkUpdatesNow() {
  S.checking = true; render();
  try {
    const r = await window.helio.github.check();
    await reloadCatalog(false);
    toast(r.updated.length ? 'Atualizações encontradas' : 'Tudo em dia', r.updated.length ? `${r.updated.length} app(s) com versão nova.` : 'Nenhum app tem versão nova.');
  } catch (e) { toast('Não foi possível verificar', cleanErr(e), null, true); }
  S.checking = false; S.lastCheck = new Date(); render();
}

// ───────────── Informações extras do GitHub ─────────────
const fmtNum = (n) => I18N.num(n);
function shortcutsRow(a, inst) {
  if (!inst || !(inst.exe || inst.launch) || inst.type === 'demo') return '';
  const sc = inst.shortcuts || {};
  const chip = (w, label) => `<button class="chip ${sc[w] ? 'on' : ''}" data-shortcut="${esc(a.id)}|${w}" aria-pressed="${!!sc[w]}"><b>${sc[w] ? '✓' : '+'}</b>${label}</button>`;
  return `<div class="d-shortcuts"><span>Atalhos</span>${chip('desktop', 'Área de Trabalho')}${chip('start', 'Menu Iniciar')}<small>Abrem o app sem precisar da loja.</small></div>`;
}
function trustNote(a) {
  if (!a.community && !a.remote) return '';
  const ok = !!a.download?.sha256;
  return `<div class="d-trust ${ok ? 'ok' : 'warn'}"><b>${ok ? 'Arquivo verificado' : 'Arquivo sem verificação'}</b><span>${ok
    ? 'O GitHub publica o SHA-256 deste download. A loja confere o arquivo antes de instalar.'
    : 'Este app não publica o SHA-256, então a loja não consegue conferir o arquivo. Instale só se você confia no autor.'}</span></div>`;
}
function metaRows(a) {
  const m = a.meta; if (!m) return '';
  const rows = [['Licença', m.license], ['Linguagem', m.language], ['Downloads', m.downloads ? fmtNum(m.downloads) : null], ['Estrelas', m.stars ? fmtNum(m.stars) : null],
    ['Atualizado', m.updatedAt ? new Date(m.updatedAt).toLocaleDateString(I18N.locale) : null],
    ['Integridade', a.download?.sha256 ? 'SHA-256 verificado' : null]].filter((r) => r[1]);
  return rows.length ? `<div class="d-meta">${rows.map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join('')}</div>` : '';
}

// ───────────── Personalizar app (ícone, nome, descrição, cores) ─────────────
const EDIT = { id: null, draft: {}, orig: {}, iconNew: null, iconClear: false };
const modalOpen = () => $('#modal').classList.contains('open');
function closeModal() { const m = $('#modal'); m.classList.remove('open'); m.setAttribute('aria-hidden', 'true'); EDIT.id = null; }

// Recorta no centro e reduz para 256x256 (fica leve para guardar)
function toIconDataURL(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height, s = Math.min(w, h) || 1;
      c.getContext('2d').drawImage(img, (w - s) / 2, (h - s) / 2, s, s, 0, 0, 256, 256);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Não foi possível ler essa imagem.'));
    img.src = src;
  });
}
const fileToIcon = (file) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => toIconDataURL(fr.result).then(res, rej); fr.onerror = () => rej(new Error('Falha ao ler o arquivo.')); fr.readAsDataURL(file); });

function openEditor(id) {
  const a = byId(id); if (!a || !a.mine) return;
  EDIT.id = id; EDIT.iconNew = null; EDIT.iconClear = false;
  EDIT.draft = { name: a.name || '', tagline: a.tagline || '', description: a.description || '', category: a.category || '', c1: a.colors?.[0] || '#ff7a3d', c2: a.colors?.[1] || '#ffd166' };
  EDIT.orig = { ...EDIT.draft };
  const d = EDIT.draft, cats = [...new Set(S.apps.map((x) => x.category).filter(Boolean))];
  $('#modal-card').innerHTML = `<h2>Personalizar app</h2>
    <p class="sub" style="margin:4px 0 18px">As mudanças ficam só na sua loja e continuam valendo nas próximas atualizações do GitHub.</p>
    <div class="ed-top"><div class="ed-icon" id="ed-drop"></div>
      <div class="ed-icon-acts">
        <p class="ed-hint">Arraste uma imagem para cá, cole com <kbd>Ctrl</kbd> + <kbd>V</kbd> (imagem ou link) ou use os botões.</p>
        <div class="ed-btns"><button class="btn" id="ed-file">Escolher imagem…</button><button class="btn" id="ed-paste">Colar da área de transferência</button><button class="btn" id="ed-icon-clear">Usar o ícone do GitHub</button></div>
        <input type="file" id="ed-file-input" accept="image/*" hidden>
        <input type="text" class="ed-in" id="ed-icon-url" placeholder="…ou cole o link de uma imagem (https://…)" spellcheck="false">
      </div></div>
    <label class="ed-f"><span>Nome</span><input type="text" class="ed-in" data-f="name" maxlength="60" value="${esc(d.name)}"></label>
    <label class="ed-f"><span>Frase curta</span><input type="text" class="ed-in" data-f="tagline" maxlength="140" value="${esc(d.tagline)}"></label>
    <label class="ed-f"><span>Categoria</span><input type="text" class="ed-in" data-f="category" maxlength="30" list="ed-cats" value="${esc(d.category)}"><datalist id="ed-cats">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label>
    <label class="ed-f"><span>Descrição</span><textarea class="ed-in" data-f="description" rows="4" maxlength="4000">${esc(d.description)}</textarea></label>
    <div class="ed-f"><span>Cores do ícone</span><div class="ed-colors"><input type="color" data-f="c1" value="${esc(d.c1)}"><input type="color" data-f="c2" value="${esc(d.c2)}"><small>aparecem atrás de ícones com fundo transparente</small></div></div>
    <div class="ed-foot"><button class="btn" id="ed-restore">Restaurar tudo do GitHub</button><span class="grow"></span><button class="btn" data-modal-close>Cancelar</button><button class="btn primary" id="ed-save">Salvar</button></div>`;
  refreshEdIcon();
  const m = $('#modal'); m.classList.add('open'); m.setAttribute('aria-hidden', 'false');
}
function refreshEdIcon() {
  const a = byId(EDIT.id); if (!a) return; const d = EDIT.draft;
  const icon = EDIT.iconClear ? a.baseIcon : (EDIT.iconNew || a.icon);
  $('#ed-drop').innerHTML = iconHTML({ ...a, icon, colors: [d.c1, d.c2] }, 96);
  $('#ed-icon-clear').disabled = EDIT.iconClear || !(EDIT.iconNew || a.overrides?.icon);
}
async function setEdIcon(promiseFn) {
  try { EDIT.iconNew = await promiseFn(); EDIT.iconClear = false; refreshEdIcon(); } catch (e) { toast('Ícone não aplicado', cleanErr(e), null, true); }
}
function setEdUrl(u) { const i = $('#ed-icon-url'); if (i) i.value = u; EDIT.iconNew = u; EDIT.iconClear = false; refreshEdIcon(); }
async function saveEditor() {
  const a = byId(EDIT.id); if (!a) return closeModal();
  const d = EDIT.draft, o = EDIT.orig, patch = {};
  for (const k of ['name', 'tagline', 'description', 'category']) if (d[k].trim() !== o[k].trim()) patch[k] = d[k].trim();
  if (EDIT.iconClear) patch.icon = null; else if (EDIT.iconNew) patch.icon = EDIT.iconNew;
  if (d.c1 !== o.c1 || d.c2 !== o.c2) patch.colors = [d.c1, d.c2];
  if (!Object.keys(patch).length) return closeModal();
  try { await window.helio.github.override(EDIT.id, patch); await reloadCatalog(); toast('Salvo', 'Personalização aplicada.', byId(EDIT.id)); closeModal(); }
  catch (e) { toast('Não foi possível salvar', cleanErr(e), null, true); }
}

// ───────────── Ajustes ─────────────
function renderSettings() {
  const s = S.settings, tg = (k) => `<button class="toggle ${s[k] ? 'on' : ''}" data-toggle="${k}"></button>`;
  $('#view-settings').innerHTML = `<h1 class="title">Ajustes</h1><p class="sub">Preferências da Helio Store.</p><div class="set">
    <div class="set-row"><div><h4>Pasta de instalação</h4><p>Onde os apps .zip são extraídos.</p></div><div class="ctl"><span class="path" title="${esc(s.installDir)}">${esc(s.installDir)}</span><button class="btn" id="pick-dir">Alterar</button></div></div>
    <div class="set-row"><div><h4>Catálogo remoto</h4><p>URL (ou arquivo .json) com apps e/ou uma lista <code>repos</code> de links do GitHub — é assim que um registro público funciona.</p></div>
      <div class="ctl"><input type="text" id="set-catalog" placeholder="https://…/apps.json" value="${esc(s.catalogUrl)}"><button class="btn" id="pick-catalog">Arquivo</button><button class="btn primary" id="save-catalog">Salvar</button></div></div>
    <div class="set-row"><div><h4>Token do GitHub</h4><p>Opcional. Aumenta o limite de consultas da API (útil com muitos apps).</p></div>
      <div class="ctl"><input type="password" id="set-token" placeholder="ghp_…" value="${esc(s.githubToken || '')}"><button class="btn" id="save-token">Salvar</button></div></div>
    <div class="set-row"><div><h4>Client ID do GitHub</h4><p>Para entrar com código no Helio Creator. Crie um app OAuth em github.com/settings/developers e ative o “Device Flow”.</p></div>
      <div class="ctl"><input type="text" id="set-clientid" placeholder="Iv1.…" value="${esc(s.githubClientId || '')}" spellcheck="false"><button class="btn" id="save-clientid">Salvar</button></div></div>
    <div class="set-row"><div><h4>Diagnóstico</h4><p>Versão, sistema e últimos eventos da loja. Copie e envie junto com o feedback quando algo der errado.</p></div><button class="btn" data-diag>Ver diagnóstico</button></div>
    <div class="set-row"><div><h4>Atualizações da loja</h4><p id="self-status">${esc(selfText())}</p></div><div class="ctl">${S.self?.status === 'available' ? '<button class="btn primary" data-self-install>Atualizar agora</button>' : ''}<button class="btn" id="self-check">Verificar</button></div></div>
    <div class="set-row"><div><h4>Repositório da Helio Store</h4><p>Repositório no GitHub (dono/nome) onde você publica os Releases da própria loja.</p></div>
      <div class="ctl"><input type="text" id="set-selfrepo" placeholder="${esc(S.self?.repo || 'usuario/heliostore')}" value="${esc(s.selfRepo || '')}" spellcheck="false"><button class="btn" id="save-selfrepo">Salvar</button></div></div>
    <div class="set-row"><div><h4>Atualizar a loja automaticamente</h4><p>Quando a loja está em segundo plano, ela baixa e instala as versões novas sozinha.</p></div><button class="toggle ${s.autoUpdateSelf !== false ? 'on' : ''}" data-toggle="autoUpdateSelf"></button></div>
    <div class="set-row"><div><h4>Feedback</h4><p>Conte uma ideia ou um problema. Abre uma página do GitHub com a mensagem pronta.</p></div><div class="ctl"><button class="btn" data-feedback>Enviar feedback</button><button class="btn" id="open-news">Novidades</button></div></div>
    <div class="set-row"><div><h4>Traduzir os textos dos apps</h4><p>Traduz automaticamente a descrição e as novidades dos apps para o idioma da loja. Usa o serviço gratuito MyMemory e envia só o texto público do app.</p></div>${tg('autoTranslate')}</div>
    <div class="set-row"><div><h4>Idioma</h4><p>Idioma da interface.</p></div>
      <select class="sel" id="set-lang" aria-label="Idioma">${[['auto', 'Automático'], ['pt', 'Português'], ['en', 'English'], ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch'], ['it', 'Italiano'], ['ja', '日本語'], ['zh', '中文'], ['ru', 'Русский'], ['hi', 'हिन्दी']].map(([k, l]) => `<option value="${k}" ${(s.lang || 'auto') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="set-row"><div><h4>Aparência</h4><p>Escuro, claro ou igual ao Windows.</p></div>
      <div class="seg">${[['dark', 'Escuro'], ['light', 'Claro'], ['auto', 'Sistema']].map(([k, l]) => `<button class="seg-b ${(s.theme || 'dark') === k ? 'on' : ''}" data-theme-set="${k}">${l}</button>`).join('')}</div></div>
    <div class="set-row"><div><h4>Tamanho do dock</h4><p>Barra de apps que aparece na tela quando a loja vai para o segundo plano.</p></div>
      <div class="seg">${['s', 'm', 'l'].map((k) => `<button class="seg-b ${(s.dockSize || 'm') === k ? 'on' : ''}" data-dock-size="${k}">${{ s: 'Pequeno', m: 'Médio', l: 'Grande' }[k]}</button>`).join('')}</div></div>
    <div class="set-row"><div><h4>Dock clássico</h4><p>Volta ao visual de vidro com reflexo e brilhos. Desligado, o dock fica minimalista.</p></div>${tg('dockClassic')}</div>
    <div class="set-row"><div><h4>Ocultar o dock automaticamente</h4><p>Recolhe para uma faixa fina na borda da tela e volta quando você passa o mouse.</p></div>${tg('dockAutoHide')}</div>
    <div class="set-row"><div><h4>Atalho global</h4><p>Pressione <code>Ctrl + Alt + H</code> em qualquer lugar para abrir a loja ou mandá-la para o segundo plano.</p></div></div>
    <div class="set-row"><div><h4>Iniciar com o Windows</h4><p>Abre em segundo plano, só com o dock na tela.</p></div>${tg('autoStart')}</div>
    <div class="set-row"><div><h4>Atualizar apps automaticamente</h4><p>Apps .zip instalados são atualizados sozinhos quando estão fechados.</p></div>${tg('autoUpdateApps')}</div>
    <div class="set-row"><div><h4>Notificações do Windows</h4><p>Avisa sobre atualizações e instalações concluídas.</p></div><button class="toggle ${s.notify !== false ? 'on' : ''}" data-toggle="notify"></button></div>
    <div class="set-row"><div><h4>Abrir app depois de instalar</h4></div>${tg('autoLaunch')}</div>
    <div class="set-row"><div><h4>Reduzir animações</h4></div>${tg('reduceMotion')}</div>
    <div class="set-row"><div><h4>Recarregar catálogo</h4><p>${S.apps.length} apps disponíveis.</p></div><button class="btn" id="reload-catalog">Recarregar</button></div></div>`;
}

// ───────────── Detalhes ─────────────
function openDetail(id) {
  const a = byId(id); if (!a) return;
  S.detailId = id;
  const inst = S.installed[id];
  $('#detail-panel').setAttribute('style', colorVars(a));
  const keepScroll = $('#detail').classList.contains('open') ? $('#detail-panel').scrollTop : 0;
  $('#detail-panel').innerHTML = `<div class="d-head">${iconHTML(a, 84)}<div><h2>${esc(a.name)}</h2><p>${esc(a.developer || (a.mine && S.settings.profile?.name) || '')}${a.community ? '<span class="tag">Comunidade</span>' : ''}</p></div></div>
    <div class="d-act">${getBtn(a, true)}${inst?.prevVersion ? `<button class="btn" data-rollback="${esc(id)}" title="Volta para a versão anterior guardada">Voltar para v${esc(inst.prevVersion)}</button>` : ''}${inst ? `<button class="btn danger" data-uninstall="${esc(id)}">Desinstalar</button>` : ''}${a.source?.url ? `<button class="btn" data-ext="${esc(a.source.url)}">${ICON.github} GitHub</button>` : ''}${a.source?.repo ? `<button class="btn" data-feedback-app="${esc(id)}">Feedback</button>` : ''}${/^https?:\/\//i.test(a.meta?.homepage || '') ? `<button class="btn" data-ext="${esc(a.meta.homepage)}">Site</button>` : ''}${a.mine ? `<button class="btn" data-edit="${esc(id)}">Personalizar</button>` : ''}</div>
    ${S.settings.ratings?.[id] ? `<div class="d-rate"><span>Sua nota</span><b>${'★'.repeat(S.settings.ratings[id])}${'☆'.repeat(5 - S.settings.ratings[id])}</b></div>` : ''}
    ${shortcutsRow(a, inst)}
    <div class="d-info"><div><span>Categoria</span><b>${esc(a.category || '—')}</b></div><div><span>Tamanho</span><b>${a.sizeMB ? a.sizeMB + ' MB' : '—'}</b></div><div><span>Versão</span><b>${esc(a.version)}</b></div></div>
    ${trustNote(a)}${metaRows(a)}
    ${a.screenshots?.length ? `<h3>Capturas</h3><div class="shots">${a.screenshots.map((u) => `<img src="${esc(u)}" alt="" loading="lazy" decoding="async">`).join('')}</div>` : ''}
    <h3>Sobre</h3><div class="txt">${esc(tx(a, 'description') || tx(a, 'tagline'))}</div>
    ${a.features?.length ? `<h3>Destaques</h3><ul>${txFeatures(a).map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
    ${a.changelog ? `<h3>Novidades da v${esc(a.version)}</h3><div class="txt">${esc(tx(a, 'changelog'))}</div>` : ''}
    ${a.source?.repo ? `<h3>Versões</h3><div class="vers" id="d-vers"><button class="btn" data-vers-load="${esc(id)}">Ver versões anteriores</button></div>` : ''}
    ${a.community ? '<div class="warn">App da comunidade, publicado por terceiros. Instale apenas se você confia no autor.</div>' : ''}`;
  const d = $('#detail'); d.classList.add('open'); d.setAttribute('aria-hidden', 'false');
  $('#detail-panel').scrollTop = keepScroll;
}
function closeDetail() { S.detailId = null; const d = $('#detail'); d.classList.remove('open'); d.setAttribute('aria-hidden', 'true'); }

// ───────────── Dock ─────────────
const DOCK_SIZES = { s: 40, m: 48, l: 58 };
function applyDockPrefs() {
  document.documentElement.style.setProperty('--di', `${DOCK_SIZES[S.settings.dockSize] || 48}px`);
  document.documentElement.classList.toggle('dock-classic', !!S.settings.dockClassic);
  if (DOCK_MODE && !S.settings.dockAutoHide && S.dockCollapsed) setDockCollapsed(false);
}
const dockLabel = (a, j) => (j ? `${a.name} · ${j.phase === 'installing' ? 'instalando…' : j.percent >= 0 ? j.percent + '%' : 'baixando…'}` : a.name);
const ringDash = (j) => (j.phase === 'installing' ? 100 : j.percent >= 0 ? j.percent : 25);
const ringHTML = (j) => `<svg class="dock-ring" viewBox="0 0 36 36" aria-hidden="true"><circle class="bg" cx="18" cy="18" r="15"/><circle class="fg" cx="18" cy="18" r="15" pathLength="100" stroke-dasharray="${ringDash(j)} 100"/></svg>`;

function renderDock(bounceId = null) {
  const box = $('#dock-installed-apps'); if (!box) return;
  const recent = (id) => S.installed[id].lastLaunch || S.installed[id].installedAt || 0;
  const ids = [...Object.keys(S.installed).filter(byId).sort((x, y) => recent(y) - recent(x)), ...Object.keys(S.jobs).filter((id) => byId(id) && !S.installed[id])];
  box.innerHTML = ids.map((id) => {
    const a = byId(id), job = S.jobs[id], run = S.running.has(id);
    const up = !job && S.installed[id] && S.installed[id].version !== a.version;
    return `<div class="dock-app${bounceId === id ? ' dock-bounce' : ''}${job ? ' busy' : ''}" data-dock-app="${esc(id)}" data-name="${esc(dockLabel(a, job))}" tabindex="0">
      <div class="dock-icon-box">${iconHTML(a)}${job ? ringHTML(job) : ''}${up ? '<i class="dock-up"></i>' : ''}</div>
      <div class="dock-dot ${job ? 'installing' : run ? 'active running' : 'idle'}"></div></div>`;
  }).join('');
  const div = $('.dock-divider'); if (div) div.style.display = ids.length ? '' : 'none';
  // selo com o número de atualizações no ícone da loja
  const n = updatesList().length, st = $('[data-dock-action] .dock-icon-box');
  if (st) { let b = st.querySelector('.dock-badge'); if (n) { if (!b) { b = document.createElement('span'); b.className = 'dock-badge'; st.appendChild(b); } b.textContent = n; } else if (b) b.remove(); }
  if (DOCK_MODE) fitDock();
}
function updateDockProgress(id) {
  const el = $(`[data-dock-app="${CSS.escape(id)}"]`), a = byId(id), j = S.jobs[id];
  if (!el || !a || !j) return;
  el.dataset.name = dockLabel(a, j);
  el.querySelector('.dock-ring .fg')?.setAttribute('stroke-dasharray', `${ringDash(j)} 100`);
}

// Dock flutuante (janela transparente): tamanho, animação, auto-ocultar e cliques que atravessam a área vazia
function fitDock() {
  requestAnimationFrame(() => {
    const d = $('#mac-dock'); if (!d || !window.helio?.dockFit) return;
    window.helio.dockFit(d.offsetWidth + 48, S.dockCollapsed ? 6 : d.offsetHeight + 96);
  });
}
function playDockEnter() { const d = $('#mac-dock'); if (!d) return; d.classList.remove('enter'); void d.offsetWidth; d.classList.add('enter'); }
let ignoring = null, hideT = null;
function setIgnore(v) { if (ignoring !== v) { ignoring = v; window.helio.dockIgnore?.(v); } }
function scheduleCollapse(ms) { clearTimeout(hideT); hideT = null; if (DOCK_MODE && S.settings.dockAutoHide) hideT = setTimeout(() => setDockCollapsed(true), ms); }
function setDockCollapsed(v) {
  S.dockCollapsed = v; document.documentElement.classList.toggle('dock-collapsed', v);
  if (v) { ignoring = null; setIgnore(false); }   // a faixa fina precisa receber o mouse para reaparecer
  fitDock();
}
function initDockWindowBehavior() {
  document.addEventListener('mousemove', (e) => {
    if (S.dockCollapsed) { setDockCollapsed(false); setIgnore(true); return; }
    const over = !!e.target.closest?.('.mac-dock');
    setIgnore(!over);
    if (over) { clearTimeout(hideT); hideT = null; } else scheduleCollapse(1200);
  });
  document.addEventListener('mouseleave', () => { if (!S.dockCollapsed) scheduleCollapse(600); });
}
function onDockShown() { playDockEnter(); setDockCollapsed(false); scheduleCollapse(2500); }

function initDockInteractions() {
  const dock = $('#mac-dock'), tip = $('#dock-tooltip'); if (!dock || !tip) return;
  dock.addEventListener('mousemove', (e) => {
    $$('.dock-app', dock).forEach((item) => {
      const r = item.getBoundingClientRect(), dist = Math.abs(e.clientX - (r.left + r.width / 2)), max = 90;
      if (dist < max) { const k = Math.cos((dist / max) * (Math.PI / 2)), mag = S.settings.dockClassic ? 0.28 : 0.15; item.style.transform = `translateY(${(S.settings.dockClassic ? -12 : -6) * k}px) scale(${1 + mag * k})`; }
      else item.style.transform = '';
    });
    const h = document.elementFromPoint(e.clientX, e.clientY)?.closest('.dock-app');
    if (h?.dataset.name) { const r = h.getBoundingClientRect(); tip.textContent = h.dataset.name; tip.style.left = `${r.left + r.width / 2 - tip.offsetWidth / 2}px`; tip.classList.add('show'); }
    else tip.classList.remove('show');
  });
  dock.addEventListener('mouseleave', () => { $$('.dock-app', dock).forEach((i) => (i.style.transform = '')); tip.classList.remove('show'); });
  dock.addEventListener('click', (e) => {
    const app = e.target.closest('[data-dock-app]');
    if (app) {
      const id = app.dataset.dockApp;
      if (!S.running.has(id)) { app.classList.remove('dock-bounce'); void app.offsetWidth; app.classList.add('dock-bounce'); }
      return launch(id);
    }
    if (e.target.closest('[data-dock-action]')) { if (DOCK_MODE) return window.helio.openStore?.(); go('discover'); }
  });
  // botão direito: Abrir / Ir para o app / Encerrar / Mostrar pasta
  dock.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const el = e.target.closest('.dock-app');
    if (el) window.helio.dockMenu?.(el.dataset.dockApp || '__store');
  });
  if (DOCK_MODE) initDockWindowBehavior();
}

// ───────────── Ações ─────────────
async function install(id, skipConfirm) {
  const a = byId(id); if (!a || S.jobs[id]) return;
  if (!skipConfirm && a.community && !S.installed[id] && !confirm(I18N.t(`${a.name} é um app da comunidade, publicado por ${a.developer || I18N.t('terceiros')}.\n\nInstale apenas se você confia no autor. Continuar?`))) return;
  S.local.add(id);
  S.jobs[id] = { phase: 'downloading', percent: 0, received: 0, total: 0, speed: 0 };
  refreshButtons(id); renderDock(); updateCounters();
  if (S.view === 'library') renderLibrary();
  try {
    const rec = await window.helio.install(a);
    S.installed[id] = rec; delete S.jobs[id]; S.local.delete(id);
    toast(`${a.name} instalado`, `Versão ${a.version} pronta para abrir.`, a);
    renderDock(id);
  } catch (e) {
    delete S.jobs[id]; S.local.delete(id);
    const msg = cleanErr(e);
    if (/Cancelado/.test(msg)) toast('Download cancelado', a.name, a); else toast(`Falha ao instalar ${a.name}`, msg, null, true);
    renderDock();
  }
  render(); refreshButtons(id);
  if (S.detailId === id) openDetail(id);
}
async function launch(id) {
  const a = byId(id); if (!a) return;
  try {
    const r = await window.helio.launch(id);
    if (r?.demo) return toast(a.name, 'App de demonstração. Configure "download.url" no catálogo para instalar o real.', a);
    if (r?.activated) toast(a.name, 'Já está aberto. Trazendo para a frente.', a); else toast(`Abrindo ${a.name}`, 'Iniciando aplicativo…', a);
  } catch (e) { toast(`Não foi possível abrir ${a.name}`, cleanErr(e), null, true); }
}
async function uninstall(id) {
  const a = byId(id); if (!a) return;
  const freed = await window.helio.uninstall(id);
  delete S.installed[id]; S.running.delete(id);
  toast(`${a.name} removido`, freed > 0 ? `O app foi desinstalado. Liberou ${fmtBytes(freed)}.` : 'O app foi desinstalado.', a);
  renderDock(); render(); if (S.detailId === id) openDetail(id);
}

// Tema: o dock flutuante fica sempre escuro (vidro sobre a área de trabalho)
function applyTheme() {
  const pref = S.settings.theme || 'dark';
  const light = pref === 'light' || (pref === 'auto' && window.matchMedia('(prefers-color-scheme: light)').matches);
  document.documentElement.dataset.theme = !DOCK_MODE && light ? 'light' : 'dark';
}
try { window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => applyTheme()); } catch {}

async function fetchAll() {
  const [cat, st] = await Promise.all([window.helio.catalog(), window.helio.state()]);
  S.apps = cat.apps; S.featured = cat.featured || []; S.installed = st.installed; S.settings = st.settings;
  document.body.classList.toggle('reduce-motion', !!S.settings.reduceMotion);
  applyTheme(); I18N.setLang(S.settings.lang || 'auto');
  try { S.running = new Set((await window.helio.running?.()) || []); } catch {}
  try { S.account = (await window.helio.account?.get()) || null; } catch {}
  document.documentElement.classList.toggle('big-catalog', S.apps.length > 150);
  refreshNewsDot();
  applyDockPrefs();
  S.cached = !!cat.cached;
  if (cat.remoteError) toast('Catálogo remoto indisponível', cat.remoteError, null, true);
}
async function reloadCatalog(rerender = true) {
  await fetchAll(); renderDock();
  if (rerender) render();
  if (S.detailId) openDetail(S.detailId);
}
let booted = false;
async function loadAll() {
  await fetchAll(); renderDock();
  if (!booted) { booted = true; initDockInteractions(); if (!DOCK_MODE) initSelf(); }
  if (!DOCK_MODE) go(S.view);
  else if (!dockBooted) { dockBooted = true; onDockShown(); }
}
let dockBooted = false;


// ───────────── Eventos ─────────────
document.addEventListener('click', async (e) => {
  const t = (s) => e.target.closest(s); let el;
  if ((el = t('[data-win]'))) return window.helio.win[el.dataset.win]();
  if ((el = t('[data-get]'))) {
    e.stopPropagation(); const id = el.dataset.get, st = appStatus(byId(id));
    return st === 'busy' ? window.helio.cancel(id) : st === 'installed' ? launch(id) : install(id);
  }
  if ((el = t('[data-cancel]'))) { e.stopPropagation(); return window.helio.cancel(el.dataset.cancel); }
  if ((el = t('[data-rollback]'))) {
    e.stopPropagation(); const id = el.dataset.rollback, a = byId(id);
    try { S.installed[id] = await window.helio.rollback(id); toast(`${a.name} voltou para v${S.installed[id].version}`, 'Versão anterior restaurada.', a); }
    catch (err) { toast('Não foi possível voltar a versão', cleanErr(err), null, true); }
    renderDock(); render(); if (S.detailId === id) openDetail(id); return;
  }
  if (t('#btn-news')) return openNews(false);
  if ((el = t('[data-news-open]'))) { closeModal(); return openDetail(el.dataset.newsOpen); }
  if ((el = t('[data-feedback-app]'))) { const fa = byId(el.dataset.feedbackApp); if (fa?.source?.repo) openFeedback({ repo: fa.source.repo, appRepo: fa.source.repo, id: fa.id, label: fa.name, version: fa.version, app: true }); return; }
  if (t('[data-feedback]')) return openFeedback();
  if ((el = t('[data-fb-type]'))) { const v = $('#fb-text')?.value || ''; FB.type = el.dataset.fbType; openFeedback({ type: FB.type, repo: FB.repo, label: FB.label, version: FB.version, app: FB.app, stars: FB.stars, id: FB.id, appRepo: FB.appRepo }); const ta = $('#fb-text'); if (ta) { ta.value = v; ta.focus(); } return; }
  if ((el = t('[data-fb-star]'))) { const v = $('#fb-text')?.value || ''; FB.stars = FB.stars === +el.dataset.fbStar ? 0 : +el.dataset.fbStar; openFeedback({ type: FB.type, repo: FB.repo, label: FB.label, version: FB.version, app: FB.app, stars: FB.stars, id: FB.id, appRepo: FB.appRepo }); const ta = $('#fb-text'); if (ta) { ta.value = v; ta.focus(); } return; }
  if (t('[data-fb-send]')) return sendFeedback();
  if ((el = t('[data-shortcut]'))) {
    const [sid, where] = el.dataset.shortcut.split('|'), on = el.getAttribute('aria-pressed') !== 'true';
    try { await window.helio.shortcut(sid, where, on); S.installed = (await window.helio.state()).installed; toast(on ? 'Atalho criado' : 'Atalho removido', where === 'desktop' ? 'Área de Trabalho' : 'Menu Iniciar'); }
    catch (err) { toast('Não foi possível criar o atalho', cleanErr(err), null, true); }
    return openDetail(sid);
  }
  if ((el = t('[data-uninstall]'))) { e.stopPropagation(); return uninstall(el.dataset.uninstall); }
  if ((el = t('[data-folder]'))) { e.stopPropagation(); return window.helio.openFolder(el.dataset.folder); }
  if ((el = t('[data-remove]'))) { e.stopPropagation(); await window.helio.github.remove(el.dataset.remove); S.publish.resultId = null; toast('App removido da loja', 'Ele não aparece mais no catálogo.'); return reloadCatalog(); }
  if ((el = t('[data-ext]'))) { e.stopPropagation(); return window.helio.openExternal(el.dataset.ext); }
  if (t('[data-close]')) return closeDetail();
  if (t('[data-mf-translate]')) {
    const src = { tagline: MF.tagline || '', description: MF.description || '' };
    if (!src.tagline && !src.description) return toast('Escreva a frase curta ou a descrição', 'Preencha os campos acima para traduzir.');
    MF.busy = true; MF.i18n = {}; const btn = t('[data-mf-translate]'); btn.disabled = true; btn.textContent = I18N.t('Traduzindo…');
    try {
      for (const l of ['pt', 'en', 'es', 'fr', 'de', 'it', 'ja', 'zh', 'ru', 'hi']) {
        const out = await window.helio.translate(l, [src.tagline, src.description]), o = {};
        if (src.tagline && out[0] && out[0] !== src.tagline) o.tagline = out[0];
        if (src.description && out[1] && out[1] !== src.description) o.description = out[1];
        if (Object.keys(o).length) MF.i18n[l] = o;
      }
    } catch {}
    MF.busy = false;
    const n = Object.keys(MF.i18n).length; if (!n) toast('Não foi possível traduzir agora', 'Verifique a conexão e tente de novo.', null, true); else toast('Traduções geradas', `${n} idiomas no bloco “i18n”. Revise e copie o helio.json.`);
    return renderPublish();
  }
  if ((el = t('[data-flt]'))) { S.flt = S.flt || {}; S.flt[el.dataset.flt] = !S.flt[el.dataset.flt]; return renderDiscover(); }
  if ((el = t('[data-spot]'))) { S.spot = +el.dataset.spot; updateSpot(true); return; }
  if (t('[data-lib-export]')) { await copyText(exportList()); return toast('Lista copiada', 'Cole no campo “Importar lista” do outro computador.'); }
  if (t('[data-lib-import]')) return openImport();
  if (t('[data-imp-go]')) return runImport();
  if (t('[data-check-all]')) return checkAll();
  if ((el = t('[data-newver]'))) return openNewVersion(el.dataset.newver);
  if (t('[data-nv-open]')) return sendNewVersion();
  if ((el = t('[data-stats]'))) return openStats(el.dataset.stats);
  if (t('[data-mf-fill]')) return fillManifest();
  if (t('[data-copy-readme]')) { await copyText(readmeTemplate()); return toast('README copiado', 'Cole no README.md do repositório.'); }
  if ((el = t('[data-recheck]'))) {
    const link = repoUrl(el.dataset.recheck); S.publish.input = link; S.publish.check = { busy: true }; renderPublish();
    $('#view-publish')?.scrollTo?.({ top: 0, behavior: 'smooth' }); window.scrollTo?.({ top: 0, behavior: 'smooth' });
    try { S.publish.check = { data: await window.helio.github.inspect(link) }; } catch (err) { S.publish.check = { error: cleanErr(err) }; }
    return renderPublish();
  }
  if ((el = t('[data-open]'))) return openDetail(el.dataset.open);
  if ((el = t('.shots img'))) return openLightbox([...el.parentElement.querySelectorAll('img')].map((i) => i.src), [...el.parentElement.children].indexOf(el));
  if (t('#lightbox')) { if (t('[data-lb-prev]')) return lbStep(-1); if (t('[data-lb-next]')) return lbStep(1); if (!t('#lb-img')) return closeLightbox(); return; }
  if (t('[data-prof-edit]')) { S.profEdit = {}; return renderPublish(); }
  if (t('[data-prof-cancel]')) { S.profEdit = null; return renderPublish(); }
  if ((el = t('[data-prof-color]'))) { S.profEdit = { name: $('#prof-name')?.value ?? '', color: el.dataset.profColor }; renderPublish(); return $('#prof-name')?.focus(); }
  if (t('[data-prof-save]')) {
    const name = $('#prof-name').value.trim(); if (!name) { $('#prof-name').focus(); return toast('Digite seu nome', 'O perfil precisa de um nome.'); }
    const color = S.profEdit?.color || S.settings.profile?.color || PROF_COLORS[0];
    S.settings = await window.helio.settings.set({ profile: { name, color } }); S.profEdit = null; toast('Perfil salvo', name); return renderPublish();
  }
  if (t('[data-prof-del]')) { S.settings = await window.helio.settings.set({ profile: null }); S.profEdit = null; toast('Perfil excluído', 'Removido deste computador.'); return renderPublish(); }
  if (t('[data-acct-tokentoggle]')) { S.auth.showToken = !S.auth.showToken; S.auth.error = ''; renderPublish(); return $('#acct-token')?.focus(); }
  if (t('#acct-token-go')) {
    const v = $('#acct-token').value.trim(); if (!v) { S.auth.error = 'Cole um token do GitHub.'; return renderPublish(); }
    S.auth.busy = true; S.auth.error = ''; renderPublish();
    try { return afterLogin(await window.helio.account.loginToken(v)); } catch (err) { S.auth.busy = false; S.auth.error = cleanErr(err); return renderPublish(); }
  }
  if (t('[data-acct-device]')) {
    S.auth.busy = true; S.auth.error = ''; renderPublish();
    try { S.auth.device = await window.helio.account.loginDevice(); S.auth.busy = false; } catch (err) { S.auth.busy = false; S.auth.error = cleanErr(err); }
    return renderPublish();
  }
  if (t('[data-acct-open]')) return window.helio.openExternal(S.auth.device?.verification_uri || 'https://github.com/login/device');
  if (t('[data-acct-cancel]')) { await window.helio.account.cancel(); S.auth.device = null; return renderPublish(); }
  if (t('[data-acct-logout]')) { await window.helio.account.logout(); S.account = null; S.publish.repos = null; S.publish.allRepos = false; try { S.settings = (await window.helio.state()).settings; } catch {} toast('GitHub desvinculado', 'Seu perfil continua neste computador.'); return renderPublish(); }
  if (t('[data-repos-load]')) return loadRepos();
  if (t('[data-repos-all]')) { S.publish.allRepos = true; return renderPublish(); }
  if ((el = t('[data-repo-add]'))) return addFromGithub(el.dataset.repoAdd);
  if (t('[data-guide]')) return openCreatorGuide();
  if ((el = t('[data-theme-set]'))) { S.settings = await window.helio.settings.set({ theme: el.dataset.themeSet }); applyTheme(); return renderSettings(); }
  if ((el = t('[data-sort]'))) { S.sort = el.dataset.sort; return renderDiscover(); }
  if ((el = t('[data-cat]'))) { S.cat = el.dataset.cat; return renderDiscover(); }
  if ((el = t('[data-view]'))) { if (el.classList.contains('tab') || el.id === 'btn-settings') { $('#search').value = ''; S.query = ''; closeDetail(); return go(el.dataset.view); } }
  if (t('#update-all')) return updatesList().forEach((id) => install(id));
  if ((el = t('[data-edit]'))) { e.stopPropagation(); closeDetail(); return openEditor(el.dataset.edit); }
  if (t('[data-modal-close]')) return closeModal();
  if (t('#ed-file')) return $('#ed-file-input').click();
  if (t('#ed-paste')) {
    const c = await window.helio.clipboardRead?.();
    if (c?.image) return setEdIcon(() => toIconDataURL(c.image));
    if (/^https?:\/\/\S+$/i.test((c?.text || '').trim())) return setEdUrl(c.text.trim());
    return toast('Nada para colar', 'Copie uma imagem (ou o link de uma imagem) e tente de novo.', null, true);
  }
  if (t('#ed-icon-clear')) { EDIT.iconNew = null; EDIT.iconClear = true; const u = $('#ed-icon-url'); if (u) u.value = ''; return refreshEdIcon(); }
  if (t('#ed-save')) return saveEditor();
  if (t('#ed-restore')) { await window.helio.github.override(EDIT.id, { __reset: true }); await reloadCatalog(); closeModal(); return toast('Restaurado', 'Voltou a usar as informações do GitHub.'); }
  if (t('#pub-check')) {
    const link = splitLinks($('#pub-url')?.value || S.publish.input)[0];
    S.publish.check = { busy: true }; renderPublish();
    try { S.publish.check = { data: await window.helio.github.inspect(link) }; } catch (err) { S.publish.check = { error: cleanErr(err) }; }
    return renderPublish();
  }
  if (t('#pub-add')) return addFromGithub();
  if ((el = t('[data-pub-clip]'))) return addFromGithub(el.dataset.pubClip);
  if ((el = t('[data-copy]'))) { e.stopPropagation(); return toast((await copyText(el.dataset.copy)) ? 'Link copiado' : 'Copiado', el.dataset.copy); }
  if (t('[data-copy-manifest]')) { await copyText(manifestText()); return toast('helio.json copiado', 'Salve como helio.json na raiz do repositório.'); }
  if (t('[data-copy-registry]')) {
    const repos = S.apps.filter((a) => a.mine && a.source?.repo).map((a) => a.source.repo);
    await copyText(JSON.stringify({ repos }, null, 2)); return toast('Lista copiada', 'Cole no campo “repos” do catálogo público.');
  }
  if (t('#check-updates') || t('#lib-check')) return checkUpdatesNow();
  if ((el = t('[data-toggle]'))) {
    const k = el.dataset.toggle, cur = k === 'notify' ? S.settings.notify !== false : !!S.settings[k]; S.settings = await window.helio.settings.set({ [k]: !cur });
    el.classList.toggle('on', k === 'notify' ? S.settings.notify !== false : !!S.settings[k]);
    if (k === 'reduceMotion') document.body.classList.toggle('reduce-motion', !!S.settings.reduceMotion);
    if (k === 'dockClassic') applyDockPrefs();
    return;
  }
  if ((el = t('[data-dock-size]'))) { S.settings = await window.helio.settings.set({ dockSize: el.dataset.dockSize }); applyDockPrefs(); return renderSettings(); }
  if (t('#pick-dir')) { const d = await window.helio.settings.pickDir(); if (d) { S.settings = await window.helio.settings.set({ installDir: d }); renderSettings(); } return; }
  if (t('#pick-catalog')) { const f = await window.helio.settings.pickCatalog(); if (f) $('#set-catalog').value = f; return; }
  if (t('#save-catalog')) { S.settings = await window.helio.settings.set({ catalogUrl: $('#set-catalog').value.trim() }); await reloadCatalog(); return toast('Catálogo atualizado', `${S.apps.length} apps carregados`); }
  if (t('[data-self-install]')) { try { await window.helio.self.install(); } catch (e) { toast('Não foi possível atualizar a loja', cleanErr(e), null, true); } return; }
  if (t('#open-news')) return openNews(false);
  if (t('#self-check')) { S.self = await window.helio.self.check(); renderSelf(); if (S.view === 'settings') renderSettings(); return; }
  if (t('#save-selfrepo')) { S.settings = await window.helio.settings.set({ selfRepo: $('#set-selfrepo').value.trim() }); toast('Repositório salvo', 'Clique em Verificar para checar atualizações da loja.'); return; }
  if (t('[data-goto-settings]')) return document.querySelector('[data-view="settings"]')?.click();
  if (t('[data-signout]')) {
    try { await window.helio.account.logout(); } catch {}
    S.account = null; S.publish.repos = null; S.publish.allRepos = false;
    try { S.settings = (await window.helio.state()).settings; } catch {}
    toast('Sessão encerrada', 'Entre de novo para usar o Helio Creator.'); return renderPublish();
  }
  if (t('[data-diag]')) return openDiag();
  if (t('[data-diag-report]')) return reportStore();
  if (t('[data-pub-preview]')) return openPreview();
  if (t('[data-diag-copy]')) { await copyText($('#diag-pre')?.textContent || ''); return toast('Diagnóstico copiado', 'Cole na mensagem de feedback.'); }
  if ((el = t('[data-vers-load]'))) return loadVersions(el.dataset.versLoad);
  if ((el = t('[data-vers-install]'))) return installVersion(el.dataset.versId, el.dataset.versInstall, el.dataset.versVer);
  if (t('#save-clientid')) { S.settings = await window.helio.settings.set({ githubClientId: $('#set-clientid').value.trim() }); return toast('Client ID salvo', 'Agora dá para entrar com código no Helio Creator.'); }
  if (t('#save-token')) { S.settings = await window.helio.settings.set({ githubToken: $('#set-token').value.trim() }); return toast('Token salvo', 'Usado nas próximas consultas ao GitHub.'); }
  if (t('#reload-catalog')) { await reloadCatalog(); return toast('Catálogo recarregado', `${S.apps.length} apps disponíveis`); }
});

document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset?.mf) { MF[el.dataset.mf] = el.value.trim(); const o = $('#mf-out'); if (o) o.textContent = manifestText(); }
  if (el.id === 'pub-url') {
    S.publish.input = el.value; if (S.publish.check && !S.publish.check.busy) { S.publish.check = null; $('.chk-box')?.remove(); }
    const h = pubHint(el.value), hn = $('#pub-hint'), b = $('#pub-add');
    if (hn) { hn.textContent = h.t || 'Dica: cole vários links de uma vez (separados por espaço ou linha).'; hn.classList.toggle('bad', !h.ok); }
    if (b && !S.publish.busy) b.disabled = !h.ok;
    const cb = $('#pub-check'); if (cb && !S.publish.busy) cb.disabled = !(h.ok && splitLinks(el.value).length === 1);
  }
  if (el.dataset?.f && EDIT.id) { EDIT.draft[el.dataset.f] = el.value; if (el.dataset.f === 'c1' || el.dataset.f === 'c2') refreshEdIcon(); }
  if (el.id === 'ed-icon-url' && /^https?:\/\/\S+$/i.test(el.value.trim())) { EDIT.iconNew = el.value.trim(); EDIT.iconClear = false; refreshEdIcon(); }
});
document.addEventListener('change', (e) => {
  if (e.target?.id === 'set-lang') {
    window.helio.settings.set({ lang: e.target.value }).then((st) => { S.settings = st; I18N.setLang(st.lang); render(); renderDock(); if (S.detailId) openDetail(S.detailId); });
    return;
  }
  if (e.target.id === 'ed-file-input' && e.target.files?.[0]) { const f = e.target.files[0]; e.target.value = ''; setEdIcon(() => fileToIcon(f)); }
});
// Colar imagem (Ctrl+V) e arrastar/soltar no editor; fora dele, impede que soltar um arquivo troque a página
document.addEventListener('paste', (e) => {
  if (!modalOpen() || !EDIT.id) return;
  const img = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
  if (img) { e.preventDefault(); const f = img.getAsFile(); return setEdIcon(() => fileToIcon(f)); }
  const txt = (e.clipboardData?.getData('text') || '').trim();
  if (/^https?:\/\/\S+$/i.test(txt) && !e.target.matches?.('input[type=text],textarea')) { e.preventDefault(); setEdUrl(txt); }
});
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
  e.preventDefault();
  if (!modalOpen() || !EDIT.id) return;
  const f = [...(e.dataTransfer?.files || [])].find((x) => x.type.startsWith('image/'));
  if (f) return setEdIcon(() => fileToIcon(f));
  const u = (e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text') || '').trim();
  if (/^https?:\/\//i.test(u)) setEdUrl(u);
});
// Navegação pelo teclado: Tab/setas entre os cards, Enter abre, Alt+1..4 troca de aba
function gridMove(cur, key) {
  const all = $$('[data-open][tabindex]').filter((n) => n.offsetParent);
  const i = all.indexOf(cur); if (i < 0) return;
  let next = null;
  if (key === 'ArrowRight') next = all[i + 1]; else if (key === 'ArrowLeft') next = all[i - 1];
  else {
    const r = cur.getBoundingClientRect(), dir = key === 'ArrowDown' ? 1 : -1;
    const cand = all.filter((n) => { const q = n.getBoundingClientRect(); return dir > 0 ? q.top > r.top + 8 : q.top < r.top - 8; });
    next = cand.sort((a, b) => { const A = a.getBoundingClientRect(), B = b.getBoundingClientRect(); return (Math.abs(A.top - r.top) - Math.abs(B.top - r.top)) * 1000 + Math.abs(A.left - r.left) - Math.abs(B.left - r.left); })[0];
  }
  if (next) { next.focus(); next.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
}
new MutationObserver(() => { $$('#content [data-open]:not([tabindex])').forEach((n) => { n.tabIndex = 0; }); }).observe($('#content'), { childList: true, subtree: true });
document.addEventListener('keydown', (e) => {
  if (lightboxOpen()) {
    if (e.key === 'Escape') { e.preventDefault(); return closeLightbox(); }
    if (e.key === 'ArrowRight') return lbStep(1); if (e.key === 'ArrowLeft') return lbStep(-1);
    return;
  }
  if (e.altKey && /^[1-4]$/.test(e.key)) { e.preventDefault(); return go(['discover', 'library', 'publish', 'settings'][+e.key - 1]); }
  const f = document.activeElement;
  if (f?.matches?.('[data-open][tabindex]') && !modalOpen()) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); return f.click(); }
    if (/^Arrow(Left|Right|Up|Down)$/.test(e.key)) { e.preventDefault(); return gridMove(f, e.key); }
  }
  if (e.target.id === 'pub-url' && e.key === 'Enter') return addFromGithub();
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#search').focus(); $('#search').select(); }
  if (e.key === 'Escape' && modalOpen()) return closeModal();
  if (e.key === 'Escape') { if ($('#detail').classList.contains('open')) closeDetail(); else if (document.activeElement === $('#search')) { $('#search').value = ''; S.query = ''; $('#search').blur(); render(); } }
});
let searchT;
$('#search').addEventListener('input', () => {
  clearTimeout(searchT);
  searchT = setTimeout(() => { S.query = $('#search').value; if (S.view !== 'discover') go('discover'); else renderDiscover(); }, 120);
});

window.helio.onProgress((p) => {
  if (p.phase === 'done' || p.phase === 'error') {
    // instalações feitas aqui são finalizadas por install(); as demais (atualização automática, dock) limpamos aqui
    if (DOCK_MODE || !S.local.has(p.id)) { delete S.jobs[p.id]; (DOCK_MODE ? loadAll() : reloadCatalog()); }
    return;
  }
  const isNew = !S.jobs[p.id];
  const j = S.jobs[p.id] || (S.jobs[p.id] = {});
  Object.assign(j, p); if (p.phase === 'installing') j.percent = 100;
  refreshButtons(p.id); updateJobRow(p.id);
  if (isNew) renderDock(); else updateDockProgress(p.id);
});
window.helio.onRunning?.((ids) => { S.running = new Set(ids); renderDock(); });
window.helio.onStateChanged?.(() => reloadCatalog());
window.helio.onCatalogChanged?.((p) => { reloadCatalog(); toast('Atualização disponível', `${p.updated.length} app(s) com versão nova na Biblioteca.`); });
if (DOCK_MODE && window.helio.onDockRefresh) window.helio.onDockRefresh(() => loadAll().then(onDockShown));
document.addEventListener('error', (e) => { if (e.target.tagName === 'IMG' && e.target.closest('.app-icon')) e.target.remove(); }, true);
window.helio.win.onState(() => {});

loadAll();

window.addEventListener('focus', () => { if (S.view === 'publish') checkPubClipboard(); });
