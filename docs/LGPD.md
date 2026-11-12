# LGPD no Anilha

Registro do que o app faz para cumprir a Lei Geral de Proteção de Dados (Lei nº 13.709/2018). Serve para o controlador consultar e para mostrar à ANPD, se ela pedir. Revisado em 19/10/2026.

Textos públicos: [Política de privacidade](../public/privacidade/index.html) (`/privacidade/`) e [Termos de uso](../public/termos/index.html) (`/termos/`).

## Conexão com o CRUNNING

Base legal: **a definir**, para revisão jurídica do Caio. A conexão é opcional e usa token pessoal revogável, guardado somente como SHA-256. Troca resumos de corridas e sessões de força feitas e planejadas para coordenar a semana. Não troca rota, GPS, coordenadas, ritmo ponto a ponto, amostras de batimento, dor, texto livre, nome ou e-mail. O nome curto do treino previsto no contrato identifica a atividade.

Corridas e planejados recebidos entram na exportação de Seus dados e no apagamento da conta por cascata. Revogar o token corta o acesso, mas não apaga o que já chegou. Metadados de criação, último uso e revogação ficam na conta, sem disponibilizar o hash ao cliente. Nenhuma versão dos termos foi alterada nesta implementação local.

## Papéis

- **Controlador**: Caio Smiderle, pessoa física.
- **Agente de tratamento de pequeno porte** (Resolução CD/ANPD nº 2/2022): pessoa natural, sem tratamento em larga escala. Dados de saúde são um critério específico de alto risco, mas o alto risco exige também um critério geral (larga escala ou efeito significativo sobre direitos fundamentais), que hoje não existe. Reavaliar se o número de contas crescer muito.
- **Encarregado**: dispensado (art. 11 da mesma resolução). O canal de comunicação com os titulares é o **Fale com o Anilha**, dentro do app (art. 11, § 1º).
- **Operadores**: Supabase (banco e login, servidor em São Paulo), Vercel (hospedagem), Resend (e-mail do código), serviços de push do navegador (Apple, Google, Mozilla; conteúdo cifrado).

## Registro das operações (art. 37)

| Operação                         | Dados                                                   | Finalidade                             | Base legal                             | Prazo                                    |
| -------------------------------- | ------------------------------------------------------- | -------------------------------------- | -------------------------------------- | ---------------------------------------- |
| Conta e login                    | e-mail, sessão                                          | entrar e identificar a conta           | execução de contrato (art. 7º, V)      | enquanto a conta existir                 |
| Plano e treinos                  | cadastro, treinos, séries, cargas, cardio, notas        | montar o plano e registrar os treinos  | execução de contrato (art. 7º, V)      | enquanto a conta existir                 |
| Faixa de idade                   | faixa (18 a 29 até 60 ou mais), não a data              | ajustar o começo do plano              | a definir (revisão jurídica)           | enquanto a conta existir                 |
| Gênero, opcional                 | feminino, masculino, outro ou prefiro não informar      | ajuste pequeno de volume               | a definir (revisão jurídica)           | enquanto a conta existir                 |
| Dados de saúde                   | peso, cintura, dores, articulações a poupar             | ajustar treinos e mostrar evolução     | consentimento específico (art. 11, I)  | até revogar ou apagar a conta            |
| Amigos e grupos                  | nome e sobrenome, amizades, grupos, reações, convites   | funções com amigos                     | execução de contrato (art. 7º, V)      | conta; convites usados 30 dias           |
| Lembretes                        | horário, inscrição de push                              | lembrar do treino                      | execução de contrato (art. 7º, V)      | enquanto ligado; fila 2 dias             |
| Fichas enviadas                  | exercícios, séries, recado, quem mandou                 | mandar e receber fichas                | execução de contrato (art. 7º, V)      | 30 dias após a resposta; 60 sem resposta |
| Prova de consentimento           | escolha, versão, data                                   | provar o consentimento (art. 8º, § 2º) | obrigação legal (art. 7º, II)          | enquanto a conta existir                 |
| Fale com o Anilha                | mensagem, resposta, versão do app, navegador (problema) | suporte e pedidos de titulares         | execução de contrato e obrigação legal | enquanto a conta existir                 |
| Assistente (em teste)            | pedido em texto e contexto de treino enviados à Anthropic; análise pós-treino envia somente números da sessão, nomes do catálogo e até três sessões da mesma ficha; no servidor, uso diário compartilhado | montar propostas de mudança, analisar a sessão concluída e sugerir até um ajuste confirmado pela pessoa | a definir (revisão jurídica) | conversa não guardada no servidor; análise e desfazer locais até limpar os dados do aparelho; resumos de pedidos enquanto a conta existir |
| Registro de erros                | mensagem, pilha, rota, versão, navegador, conta         | corrigir falhas                        | legítimo interesse (art. 7º, IX)       | 30 dias                                  |
| Painel de gestão                 | e-mail, cadastro, último acesso, contagens de uso       | suporte e melhoria do serviço          | legítimo interesse (art. 7º, IX)       | não guarda nada próprio                  |
| Registros de acesso (provedores) | IP, data, hora, página                                  | segurança e funcionamento              | legítimo interesse (art. 7º, IX)       | prazo do provedor                        |

**YouTube**: não é operador. O player do Como fazer só carrega depois do toque, no modo
youtube-nocookie; a partir daí o Google trata os dados técnicos como controlador próprio. A
política de privacidade diz isso na seção 4 (parágrafo novo, marcado para revisão).

**Revisão jurídica pendente**: a coluna de base legal desta tabela e da política de
privacidade foi redigida sem advogado. As linhas "a definir" são dados novos (outubro de 2026) sem base escolhida. Depois da revisão, subir a versão dos termos (`TERMS_VERSION` em
`src/sync/consent.ts` e a data no topo da política) pede o aceite de novo a todos.

Menores de idade: a conta é bloqueada para menores. O aceite pede 18 anos ou mais e a faixa de
idade do cadastro começa em 18; conta de menor descoberta é apagada.

O app não coleta localização, contatos, fotos, câmera, microfone nem pagamento. A importação de arquivo de corrida é lida no aparelho e guarda só data e hora, distância, duração e tipo.

## Dados de saúde (art. 11)

- Contam como saúde: `body_logs` (peso, cintura), `pain_reports` (dor por articulação), `session_items.pain_joint`, `day_overrides` com `spare_joint` e `profiles.onboarding.spare_joints`. Treinos e cargas não: são o serviço contratado.
- **Como é pedido**: nunca antes de usar o app. Fica como pendência em Você (ponto vermelho na aba e um cartão no topo, com Permitir e Não permitir) e no lugar de cada função de saúde (aba Corpo), sempre com o mesmo texto: o que é, para quê e como desligar. Nada vem marcado; recusar não impede o uso. Versão do texto em `HEALTH_VERSION` (`src/sync/consent.ts`).
- **Prova**: tabela `consents`, só acrescenta linhas (quem, o quê, versão, sim ou não, quando). A pessoa baixa o próprio histórico no JSON de exportação.
- **Sem consentimento**: aba Corpo, "Marcar dor", "Poupar articulação" e a pergunta de articulações do cadastro somem; a importação de backup ignora dados de saúde.
- **Revogação** (Você, Privacidade): `record_consent('saude', false)` apaga no servidor na hora (`drop_health_data`: marca como excluído e apaga os valores) e o `sync_push` passa a recusar dados de saúde da conta; o aparelho limpa a cópia local (`wipeHealthLocal`) e os outros aparelhos limpam ao saber da revogação.
- **Contas antigas** (de antes de 19/10/2026): veem a tela de termos na próxima abertura e a pendência de saúde em Você. Enquanto não respondem sobre saúde, o app esconde as funções de saúde (os registros antigos continuam guardados) e o servidor sincroniza como antes, porque não sabe se o aparelho já atualizou.

## Direitos dos titulares (art. 18)

Sozinho, no app: cópia de tudo (JSON, e CSV de séries e corridas), correção (Você, Ajustes, Histórico), dados de saúde (Você, Privacidade), apagar tudo (Você, Conta).

Pelo **Fale com o Anilha** (tabela `tickets`): assunto "Meus dados e privacidade" com o pedido (acesso, correção, exclusão, portabilidade, compartilhamento, revogação, outro). Prazo: **15 dias** (art. 19, II). A resposta aparece no app e no sino de avisos.

Como responder: no painel de gestão do app (`/admin`, só para a conta do controlador), aba Mensagens. Sem o painel, pelo SQL Editor:

```sql
select id, created_at, kind, message from tickets where status = 'aberto' order by created_at;
update tickets set status = 'respondido', answer = 'texto da resposta', answered_at = now()
  where id = 'id-da-mensagem';
```

Roteiro por pedido:

- **Acesso ou portabilidade**: indicar o JSON de Você, Seus dados (tem tudo, inclusive consentimentos e mensagens). Se a pessoa não conseguir, gerar pelo SQL e combinar a entrega.
- **Exclusão parcial**: apagar pelo SQL o que foi pedido (marcando `deleted = true` e `updated_at` no momento, para os aparelhos receberem) e confirmar.
- **Correção**: indicar onde se corrige; se não der pelo app, corrigir pelo SQL.
- **Compartilhamento**: lista de operadores da seção 4 da política.
- **Oposição ao legítimo interesse**: avaliar o caso; o registro de erros pode ser desligado por conta, se pedido.

A pessoa pode reclamar à ANPD (art. 18, § 1º).

## Retenção (arts. 15 e 16)

`public.purge_old_data()`, todo dia às 03:41 UTC (pg_cron `anilha-retencao`, em `supabase/setup/retention.sql`):

| O quê                                               | Some depois de |
| --------------------------------------------------- | -------------- |
| Linhas excluídas (marcas de exclusão do sync)       | 30 dias        |
| Tentativas de código de convite                     | 1 dia          |
| Marcas de lembrete enviado                          | 7 dias         |
| Convites de grupo respondidos                       | 30 dias        |
| Convites de amizade usados ou vencidos              | 30 dias        |
| Fichas enviadas respondidas (sem resposta: 60 dias) | 30 dias        |
| Registro de erros                                   | 30 dias        |
| Fila de notificações                                | 2 dias         |

A marca de exclusão existe para avisar os outros aparelhos. Depois de 30 dias ela sai do servidor e `sync_horizons` guarda até onde já se apagou; um aparelho que ficou mais tempo sem sincronizar percebe pelo `horizon` do `sync_pull`, pede `sync_ids` e apaga o que o servidor não tem mais. Marcas de exclusão de saúde já chegam sem os valores.

Apagar a conta remove tudo na hora (`delete_account`, em cascata).

## Cookies e armazenamento no aparelho

O app não usa cookies (o login do Supabase está configurado para `localStorage`). Usa `localStorage`, `sessionStorage`, IndexedDB e o cache do service worker, todos **estritamente necessários** para o serviço pedido (sessão, conta aberta, preferências do aparelho, dados offline). Pelo Guia Orientativo de Cookies da ANPD (2022), isso dispensa consentimento e aviso de cookies, mas exige informação: a seção 6 da política lista cada item. A landing não guarda nada.

Se um dia entrar medição de audiência: agregada, do próprio domínio, sem cookie de terceiros, informada na política e com como se opor. Qualquer coisa de publicidade ou rastreamento entre sites exige banner com recusar tão fácil quanto aceitar, e consentimento antes de carregar.

## Avaliação de legítimo interesse (art. 10)

Vale para o registro de erros e para o painel de gestão.

1. **Finalidade**: manter o app funcionando, dar suporte e decidir melhorias. Concreta e ligada ao serviço que a pessoa usa.
2. **Necessidade**: o registro de erros guarda só o necessário para achar a falha e some em 30 dias. O painel mostra e-mail, datas e contagens; nada de saúde, nada do conteúdo dos treinos, nenhuma anotação livre sobre pessoas.
3. **Balanceamento**: a pessoa espera que um app gratuito cuide de erros e saiba quantas pessoas o usam; nada é usado para publicidade, perfilamento externo ou decisão que a afete.
4. **Salvaguardas**: informação na política (seção 2), oposição pelo Fale com o Anilha, acesso ao painel só pela conta do controlador, com checagem no servidor.

## Transferência internacional (art. 33)

Supabase, Vercel e Resend são empresas dos EUA. Os dados de treino e de saúde ficam no Brasil (Supabase em sa-east-1); fora do país passam o e-mail (Resend) e registros de acesso (Vercel). Base: art. 33, IX, combinado com o art. 7º, V (necessário à execução do contrato com o titular). As cláusulas-padrão da Resolução CD/ANPD nº 19/2024 só seriam exigidas se a base fosse contratual; se surgir transferência que não seja necessária ao serviço (por exemplo, uma ferramenta de análise), ela precisa de outra base, como as cláusulas-padrão.

## Segurança (art. 46)

- RLS em todas as tabelas; o que é sensível só passa por funções do banco que checam quem chama.
- Funções internas sem permissão para contas comuns; nada para anônimo.
- Painel de gestão: tabela `admins` e `require_admin()` checados no servidor em cada função; nenhuma chave de serviço no navegador. Uma conta admin hoje (a do controlador).
- CSP restrita ao próprio domínio e ao Supabase; login sem senha (código de 6 dígitos ou link, 15 minutos).
- Um banco local por conta no aparelho.

## Incidentes (Resolução CD/ANPD nº 15/2024)

1. Conter: revogar chaves, tirar do ar o que vazou, corrigir.
2. Avaliar: quais dados, quantas pessoas, se há risco ou dano relevante (dados de saúde pesam).
3. Se houver risco ou dano relevante: comunicar a ANPD (formulário no gov.br) e as pessoas afetadas em até 3 dias úteis; agente de pequeno porte tem prazo em dobro.
4. Registrar sempre, mesmo sem comunicar: data, o que houve, dados e pessoas afetadas, medidas e decisão sobre comunicar. Guardar o registro por 5 anos.

## Idade

Termos e tela de consentimento: só maiores de 18 anos (autodeclaração). O app não é voltado a crianças e adolescentes.

## Pendências

1. **Revisão por advogado** da política e dos termos. Estes textos foram escritos com base na LGPD, nas resoluções e guias da ANPD citados, mas não substituem revisão jurídica.
2. **Canal para quem não tem conta**: hoje o canal é só o formulário do app (escolha do controlador). Se aparecer pedido de alguém sem conta, criar um e-mail público de privacidade e citá-lo na política.
3. **ECA Digital** (Lei nº 15.211/2025): o app se declara para maiores; se o público mudar ou o app ficar "de acesso provável" por adolescentes, revisar.
4. **Contratos dos operadores**: guardar cópia dos termos de tratamento de dados (DPA) de Supabase, Vercel e Resend aceitos nas contas.
5. **Cópias de segurança** do Supabase: conferir no painel o que o plano oferece e por quanto tempo, e citar na política se passar a existir.
6. **Reavaliar este documento** a cada operador novo, finalidade nova, ferramenta de análise, app nativo ou crescimento grande.
