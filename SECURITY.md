# Segurança

Encontrou uma falha na Helio Store? Abra uma **issue privada** em *Security → Report a vulnerability* neste repositório (ou, se não estiver disponível, uma issue sem detalhes técnicos pedindo contato).

- Não publique detalhes de uma falha antes de ela ser corrigida.
- A loja instala programas de terceiros: ela confere o SHA-256 quando o GitHub o publica, mas **não garante que um app seja inofensivo**. Instale só apps em que você confia.
- Tokens do GitHub ficam apenas no seu computador, criptografados pelo Windows.

## Arquivos protegidos

- `.github/CODEOWNERS` marca os arquivos críticos (`main.js`, `preload.js`, `github.js`, `package*.json`, workflows, catálogo) como do dono do repositório.
- Os workflows rodam com permissão mínima (`check.yml` só lê; `release.yml` só escreve no Release).
- Para valer de fato, no GitHub ative em *Settings → Branches → Branch protection rules* (main): exigir Pull Request, **Require review from Code Owners**, bloquear force-push e exclusão. Em *Settings → Rules → Rulesets* proteja também as tags `v*`.
- Nenhuma chave secreta fica no código. O *Client ID* do login do GitHub é público por natureza; o token de cada usuário fica criptografado no computador dele.
