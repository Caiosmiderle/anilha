# Anilha em produção

Endereço: **https://anilha-eight.vercel.app**

## O que está no ar

- **Vercel**: projeto importado do GitHub `Caiosmiderle/anilha` (privado). Cada push na `main` publica sozinho. Não precisa de variável de ambiente: o `.env.production` já aponta para o Supabase (URL e chave publicável são públicas por natureza).
- **Supabase** `anilha` (São Paulo, plano gratuito): 15 migrações, políticas de acesso por usuário (RLS), funções de sincronização e de amigos, função de lembretes, agendamento a cada 15 minutos e segredos no Vault. Privacidade testada direto no banco de produção.
- **Login**: código de 6 dígitos por e-mail, válido por 15 minutos. O link do mesmo e-mail também entra. Site URL: `https://anilha-eight.vercel.app`.
- **E-mail**: Resend por SMTP (`smtp.resend.com`, porta 587, usuário `resend`), remetente `Anilha <anilha@perfilscore.com.br>`. Usa o domínio do PerfilScore, já verificado no Resend, com uma chave própria chamada `Anilha` (só envio, só esse domínio).
- **Modelos de e-mail**: [codigo-entrar.html](supabase/templates/codigo-entrar.html) (Magic link or OTP) e [codigo-cadastro.html](supabase/templates/codigo-cadastro.html) (Confirm sign up). Assunto dos dois: `{{ .Token }} é seu código do Anilha`. No painel o HTML vai compactado em uma linha, porque o editor do Supabase reindenta o que é digitado.

## Publicação de 22/10/2026

- Revisão após vídeo do iPhone: `bd093d5` nomeia o assistente **Waltér** e substitui a geometria anterior do teclado. Sete cenários passaram em Chromium e sete em WebKit no Windows; falta a conferência da nova versão no iPhone físico. Função `agente` em **v3**, sem mudança de tabelas. Publicação Vercel concluída e arquivos públicos conferidos; ver o fechamento mais recente no handoff.
- Código `9fed26a`: integra o popup/auditoria do Codex, a revisão do Claude e a correção do teclado via VisualViewport. Corrige também a recusa de progressão numa pirâmide parcialmente concluída.
- Enviado à `main`, com publicação Vercel concluída e domínio público conferido. Os commits anteriores estavam apenas nas branches locais, por isso ainda não tinham aparecido no site.
- Supabase: função `agente` atualizada para v2, sem migração de banco. Testes de dados executados localmente; nenhum ambiente de branch Supabase criado nesta entrega.
- Evidências, resultados dos testes, limites e próxima revisão do Claude em [AI_HANDOFF.md](docs/AI_HANDOFF.md). O teclado foi testado com geometria simulada; iPhone físico continua pendente.

## Ver erros do app

Erros que acontecem no celular de quem usa ficam na tabela `client_errors` (mensagem, rota, versão, quantas vezes no dia). No SQL Editor do Supabase:

```sql
select last_at, count, version, url, message from client_errors order by last_at desc limit 50;
```

## Painel de gestão

Em **Você, Painel de gestão** (rota `/admin`), só para contas da tabela `admins`: números do app, pessoas por situação (novos, ativos, em risco, inativos, nunca treinaram), mensagens para responder e erros agrupados. O servidor confere o admin em cada função; dado de saúde não aparece. Admin hoje: só a conta do Caio. Para dar acesso a outra conta, no SQL Editor:

```sql
insert into admins (user_id) select id from auth.users where email = 'email@da.conta';
```

## Mensagens e pedidos sobre dados

O que chega pelo Fale com o Anilha fica na tabela `tickets` e se responde no painel, aba Mensagens. Pedidos sobre dados pessoais têm prazo de 15 dias (LGPD, art. 19). Procedimento e roteiro por tipo de pedido em [docs/LGPD.md](docs/LGPD.md). Sem o painel, no SQL Editor:

```sql
select id, created_at, kind, message from tickets where status = 'aberto' order by created_at;
update tickets set status = 'respondido', answer = 'texto da resposta', answered_at = now()
  where id = 'id-da-mensagem';
```

## Limpeza diária

`supabase/setup/retention.sql` agenda `purge_old_data()` todo dia às 03:41 UTC (`anilha-retencao`): marcas de exclusão do sync depois de 30 dias, convites usados, tentativas, lembretes antigos, erros e fila de push.

## Limites do plano gratuito

- Resend: 100 e-mails por dia e 3.000 por mês, divididos com o PerfilScore.
- Supabase Auth: 30 e-mails por hora com SMTP próprio (Authentication, Rate Limits).
- Projeto Supabase gratuito pausa depois de 7 dias sem uso; para voltar, é só abrir o painel e restaurar.

## Se precisar trocar a chave do Resend

1. Em https://resend.com/api-keys, crie uma chave nova (Sending access, domínio `perfilscore.com.br`) e apague a antiga.
2. Em https://supabase.com/dashboard/project/ssuuvzgqtobnfvobvjcu/auth/smtp, cole a chave nova em **Password** e salve.

## Instalar no celular

- **iPhone (Safari)**: abra a URL, toque em Compartilhar e em **Adicionar à Tela de Início**. Entre pelo app instalado: o login de lá é separado do Safari. Lembretes só funcionam assim (iOS 16.4 ou mais novo).
- **Android (Chrome)**: abra a URL e toque em **Instalar app** (ou no menu, **Adicionar à tela inicial**).

Depois de aberto uma vez, o app funciona sem sinal e sincroniza quando a rede volta.

## Rodar no computador

Não precisa de conta nenhuma: o servidor local imita o Supabase com Postgres embutido.

```bash
npm install
```

```bash
npm run dev
```

Abra http://localhost:5173 e entre com `caio@anilha.dev`. O código aparece na própria tela (só no modo local). Essa conta tem a semana de exemplo de outubro de 2026, dois amigos e um grupo. Os dados locais ficam em `.local/pgdata`; apague a pasta para recomeçar.

## Testes

```bash
npm test
```

```bash
npx playwright install chromium
```

```bash
npm run test:e2e
```

```bash
npm run lighthouse
```

`npm run verify` roda lint, tipos, testes, build e E2E em sequência.

## Se precisar recriar o Supabase do zero

1. Crie um projeto e rode `npm run sql:bundle`; cole `supabase/bundle.sql` no SQL Editor e execute.
2. Troque URL e chave em `.env.production` e o domínio do Supabase no `connect-src` do `vercel.json`.
3. Notificações de descanso e de amigos: depois de `reminders_cron.sql`, rode `supabase/setup/push_dispatch.sql` (cria o despachante a cada 5 s e a limpeza diária do log do pg_cron). Depois, `supabase/setup/retention.sql` (limpeza diária de dados antigos).
4. Login: em Authentication, SMTP Settings e Templates, repita a configuração de e-mail descrita acima; em Sign In / Providers, Email, deixe o código com 6 dígitos e 900 segundos; em URL Configuration, a Site URL.
5. Lembretes: publique `supabase/functions/send-reminders` com `npx supabase functions deploy send-reminders --no-verify-jwt`, gere chaves com `npx web-push generate-vapid-keys` e rode `supabase/setup/reminders_cron.sql` com os valores. A chave pública VAPID vai em `VITE_VAPID_PUBLIC_KEY`.

## Variáveis de ambiente

| Variável                 | Onde                               | Valor                                                                      |
| ------------------------ | ---------------------------------- | -------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`      | `.env.production`                  | Supabase, Project Settings, API: Project URL                               |
| `VITE_SUPABASE_ANON_KEY` | `.env.production`                  | Supabase, Project Settings, API Keys: publishable key                      |
| `VITE_VAPID_PUBLIC_KEY`  | `.env.production`                  | Chave pública VAPID (a privada fica só no Vault)                           |
| `VITE_SHOW_DEV_CODE`     | só `.env.development` e `.env.e2e` | `1` mostra o código de login na tela do servidor local. Nunca em produção. |

## Marketing

- Landing: `public/conheca/` (estática; vai junto no deploy). Somente pôsteres e imagem social em `public/conheca/media/`, sem vídeos.
- Vídeos: projetos HyperFrames em `marketing/video/youtube` (1920x1080) e `marketing/video/mobile` (1080x1920). Masters em `marketing/video/out/` (fora do git).
- Recapturar as telas do app: `npx playwright test -c marketing/capture/playwright.config.ts` (servidor local e base de exemplo; nunca toca produção). Depois copie as telas usadas para `marketing/video/*/assets/screens/`.
- Antes de renderizar, reponha localmente os 14 WAVs em `marketing/video/**/assets/sfx/`, nos caminhos referenciados pelas composições. Esses sons foram removidos do repositório público e as pastas são ignoradas até haver origem e licença documentadas. A trilha em `marketing/video/kinetic/music/trilha.mp3` também precisa ser reposta localmente para os renders que a usam. A retirada dos arquivos não altera as referências nas composições.
- Renderizar de novo (Windows, com o FFmpeg do winget e o Chromium do Playwright):

```bash
export PATH="$LOCALAPPDATA/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.2-full_build/bin:$PATH"
```

```bash
export HYPERFRAMES_BROWSER_PATH="$LOCALAPPDATA/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe"
```

```bash
cd marketing/video/youtube && npx hyperframes@0.8.174 render --quality delivery --output ../out/anilha-youtube-16x9.mp4
```
