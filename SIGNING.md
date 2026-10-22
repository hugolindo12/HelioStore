# Assinatura de código (instalador do Windows)

O instalador já está **preparado** para ser assinado. Enquanto não houver certificado, ele sai sem assinatura (o Windows mostra "editor desconhecido" no SmartScreen). Quando você tiver o certificado, não precisa mexer no código.

## O que comprar

Um certificado de assinatura de código para Windows (arquivo `.pfx`/`.p12`), de uma autoridade como DigiCert, Sectigo ou SSL.com. Certificados **EV** removem o aviso do SmartScreen na hora; os comuns (OV) vão ganhando reputação com o uso. Observação: várias autoridades agora entregam a chave em token/HSM; para o GitHub Actions o jeito mais simples é um serviço de assinatura em nuvem (por exemplo Azure Trusted Signing ou o do próprio emissor) ou um `.pfx` exportável.

## Como ativar (com um `.pfx`)

1. Converta o `.pfx` em texto: no PowerShell, `[Convert]::ToBase64String([IO.File]::ReadAllBytes("certificado.pfx")) | Set-Clipboard`.
2. No GitHub: **Settings → Secrets and variables → Actions → New repository secret**:
   - `CSC_LINK` = o texto copiado (base64 do `.pfx`)
   - `CSC_KEY_PASSWORD` = a senha do certificado
3. Crie uma Release com tag nova (ex.: `v2.0.3`). O workflow *Release* assina o `.exe` sozinho, confere a assinatura e só então anexa o arquivo.

Nunca coloque o `.pfx` nem a senha no repositório (o `.gitignore` já bloqueia `*.pfx`, `*.p12`, `*.key`, `*.pem`).

## Como saber se deu certo

No log do workflow aparece **"Instalador assinado por: …"**. No Windows: botão direito no `.exe` → Propriedades → *Assinaturas Digitais*.
