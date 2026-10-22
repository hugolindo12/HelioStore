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
console.log(process.exitCode ? 'falhou' : `✓ ${ok} testes de lógica ok`);
