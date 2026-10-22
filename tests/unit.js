// Testes rápidos da lógica (sem rede): escolha do instalador e conferência dos comandos.
const assert = require('assert');
const gh = require('../github');
const n = (x) => ({ name: x, size: 1 });
let ok = 0; const t = (nome, fn) => { try { fn(); ok++; } catch (e) { console.error('✗ ' + nome + ': ' + e.message); process.exitCode = 1; } };

t('Release com dois .exe: pega o de maior versão', () => assert.equal(gh.pickAsset([n('HelioStore-Setup-2.0.0.exe'), n('HelioStore-Setup-2.0.1.exe')]).name, 'HelioStore-Setup-2.0.1.exe'));
t('mesma coisa em outra ordem', () => assert.equal(gh.pickAsset([n('HelioStore-Setup-2.0.1.exe'), n('HelioStore-Setup-2.0.0.exe')]).name, 'HelioStore-Setup-2.0.1.exe'));
t('ignora blockmap, linux e mac', () => assert.equal(gh.pickAsset([n('app-linux.zip'), n('app-mac.zip'), n('app-win.zip'), n('app.exe.blockmap')]).name, 'app-win.zip'));
t('dica do helio.json manda', () => assert.equal(gh.pickAsset([n('a-win.zip'), n('portable.zip')], 'portable').name, 'portable.zip'));
t('sem instalador devolve null', () => assert.equal(gh.pickAsset([n('notes.txt')]), null));
t('parseRepo aceita link e usuario/repo', () => { assert.deepEqual(gh.parseRepo('https://github.com/u/r.git'), gh.parseRepo('u/r')); assert.equal(gh.parseRepo('lixo'), null); });

// Canal beta: com ele ligado pega o pré-lançamento mais novo; desligado, só o estável
const https = require('https'), { EventEmitter } = require('events');
const REL = { '/repos/u/r/releases/latest': { tag_name: 'v1.0.0' }, '/repos/u/r/releases?per_page=10': [{ tag_name: 'v1.1.0-beta.1', prerelease: true }, { tag_name: 'v1.0.0' }] };
https.get = (url, o, cb) => { const path = new URL(url).pathname + new URL(url).search; const body = REL[path]; const res = new EventEmitter(); res.statusCode = body ? 200 : 404; res.headers = {};
  const req = new EventEmitter(); req.destroy = () => {}; process.nextTick(() => { cb(res); if (body) res.emit('data', Buffer.from(JSON.stringify(body))); res.emit('end'); }); return req; };
(async () => {
  gh.setBeta(false); const a = await gh.fetchRelease('u', 'r', null);
  gh.setBeta(true); const b = await gh.fetchRelease('u', 'r', null); const c = await gh.fetchRelease('u', 'r', null, { pre: false });
  t('canal estável pega a v1.0.0', () => assert.equal(a.tag_name, 'v1.0.0'));
  t('canal beta pega o pré-lançamento', () => assert.equal(b.tag_name, 'v1.1.0-beta.1'));
  t('pre:false ignora o beta (atualização da loja)', () => assert.equal(c.tag_name, 'v1.0.0'));
  console.log(process.exitCode ? 'falhou' : `✓ ${ok} testes de lógica ok`);
})();
