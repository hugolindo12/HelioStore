# Versão portátil (engavetada)

Um único `.exe` que roda sem instalar. **Ainda não é publicada**: está nesta branch (`feature/portatil`) para ser retomada quando quiser.

## O que já está pronto
- `npm run dist:portable` gera `dist/HelioStore-Portatil-<versão>.exe` (alvo *portable* do electron-builder).
- Dados e apps instalados ficam na pasta `HelioStoreDados`, ao lado do `.exe` (quando `PORTABLE_EXECUTABLE_DIR` existe). Nada vai para `%AppData%`.
- A atualização da loja **não roda instalador** no modo portátil: só abre a página da Release para baixar o novo `.exe`.
- A atualização da versão instalada ignora arquivos com "portable/portatil" no nome, então os dois tipos podem ficar na mesma Release.
- Workflow manual `Portable` (Actions → Portable → Run workflow) gera o arquivo como *artifact*, sem mexer nas Releases.

## O que falta antes de publicar
- Testar de verdade no Windows (o ambiente de desenvolvimento aqui é Linux): abrir de pen drive, instalar um app `.zip`, fechar e abrir de novo.
- Decidir onde o `.exe` portátil é guardado na Release e se a loja deve avisar "você está na versão portátil".
- Atalhos e inicialização com o Windows apontam para o caminho do `.exe`; se a pasta mudar, eles quebram.
- Assinatura de código (veja `SIGNING.md`) vale também para o portátil.

## Como retomar
Faça merge desta branch na `main` e, se quiser, inclua o `.exe` portátil no workflow `release.yml`.
