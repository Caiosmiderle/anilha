# Dossiê LGPD para revisão jurídica do Anilha

Preparado pelo Claude em 12/11/2026 para o Caio levar a um advogado. **Nada aqui é decisão jurídica.** As bases legais marcadas como "sugestão" são hipóteses técnicas com a justificativa ao lado; no app e na política continuam como **"a definir"** até a validação. O registro completo das operações está em [`docs/LGPD.md`](LGPD.md); este dossiê aprofunda só as funcionalidades novas de 10/2026 a 11/2026.

## 1. Quem é quem

| Papel | Quem | Observação |
| --- | --- | --- |
| Controlador | Caio Smiderle, pessoa física | Agente de pequeno porte (Res. CD/ANPD nº 2/2022) |
| Encarregado | Dispensado (art. 11 da mesma resolução) | Canal: Fale com o Anilha, dentro do app |
| Operadores já listados | Supabase (banco e login, São Paulo), Vercel (site), Resend (e-mail do código), push do navegador | Ver `docs/LGPD.md` |
| **Operador novo, ainda não listado** | **Anthropic, PBC (EUA)**: modelos Claude Haiku 5.5, Sonnet 5.5 e Opus 5.5 | Recebe o conteúdo enviado às funções de IA abaixo. Precisa entrar na seção de operadores e na de transferência internacional |
| Outro app do mesmo controlador | CRUNNING (app de corrida, uso pessoal do Caio, não distribuído) | Troca dados com o Anilha só da conta que gerou o token |

## 2. Mapa de dados por funcionalidade

### 2.1 Assistente Waltér (chat)

- **O que a pessoa faz**: escreve um pedido ("troca o supino", "monta uma ficha de perna"); o app executa ferramentas no aparelho e só grava com o Salvar da pessoa.
- **Dados enviados à Anthropic**: o texto do pedido e o contexto de treino montado no aparelho (fichas, exercícios, séries, cargas, plano, nível). Dados de saúde (dor, articulações a poupar) **só** vão se a pessoa consentiu saúde (art. 11), para o assistente evitar exercício que agrida a articulação.
- **Guardado no servidor**: nada da conversa. Fica o uso diário (contagem de chamadas e tokens) para o limite de 60 por dia.
- **Retenção**: conversa só no aparelho; uso diário enquanto a conta existir.
- **Modelo**: Haiku 5.5 para todos.

### 2.2 Análise pós-treino

- **O que faz**: ao concluir a sessão, o Waltér comenta o planejado x feito e propõe no máximo um ajuste da ficha, que só vale com o Salvar.
- **Dados enviados à Anthropic** (lista permitida, `src/analysis/context.ts`): números da sessão (séries, cargas, repetições, esforço), nomes de exercícios do catálogo (exercício próprio vai como "Exercício personalizado"), até três sessões anteriores da mesma ficha, as últimas cinco vezes de cada exercício, a prévia de carga do motor, semana do plano e foco; **corridas agregadas** do CRUNNING dois dias antes e depois da sessão (tipo, km, duração, esforço); e, a partir da 0.11.0, a memória das três últimas análises da mesma ficha (avaliação, comentário gerado pela própria IA e se o ajuste foi aceito ou recusado).
- **Nunca enviados**: nome, e-mail, identificadores, data e hora exatas, notas livres, motivos livres, dor, articulações, idade, gênero, peso, medidas, GPS, rota, ritmo por km, batimentos.
- **Guardado**: a resposta fica no aparelho. Com a sincronização entre aparelhos (item 13 da missão), passa a ficar também no Supabase, numa tabela própria com RLS.
- **Modelo**: Haiku 5.5 para todos; Opus 5.5 para a conta do controlador (tabela `admins`).

### 2.3 Revisão da ficha (só o controlador)

- **O que faz**: o motor cria a ficha; o Sonnet dá um parecer e até três ajustes, cada um aplicado ou recusado separadamente.
- **Dados enviados à Anthropic**: a ficha (exercícios do catálogo, séries, faixa, aquecimento, ordem), o plano (divisão, dias, foco, semana leve), o volume semanal por grupo e os avisos do motor, as corridas agregadas do CRUNNING (14 dias feitas e 14 planejadas, com a marca de importante) e a projeção da semana com o aviso de perna na véspera. Mesmas exclusões da análise, inclusive saúde mesmo com consentimento.
- **Disponível para**: só contas da tabela `admins` (hoje, o controlador). O servidor recusa as demais antes de qualquer chamada.

### 2.4 Conexão com o CRUNNING

- **O que faz**: o CRUNNING manda corridas feitas e planejadas (14 dias); o Anilha devolve sessões de força feitas e previstas (só nome da ficha, dia, status, se teve perna e quantas séries de perna).
- **Credencial**: token pessoal gerado pela pessoa no Anilha, guardado só como SHA-256, revogável a qualquer momento.
- **Nunca trocados**: rota, GPS, coordenadas, ritmo ponto a ponto, amostras de batimento, dor, texto livre, nome, e-mail, cargas.
- **Retenção**: corridas recebidas entram na exportação e no apagamento da conta (cascata). Revogar o token corta o acesso, mas não apaga o que já chegou (a tela avisa).
- **Do lado do CRUNNING**: a força recebida fica num arquivo do próprio iPhone, protegido pelo sistema; desconectar apaga. O CRUNNING manda à Anthropic, com a chave do próprio Caio, só agregados da força (dias relativos, nome da ficha, séries de perna).

## 3. Sugestões de base legal (para validar)

| Funcionalidade | Sugestão técnica | Por quê | Ponto de atenção para o advogado |
| --- | --- | --- | --- |
| Assistente (chat) | Execução de contrato, art. 7º, V | A pessoa aciona a função para obter o serviço pedido (montar ou ajustar ficha). Sem a chamada, o serviço não acontece | É função opcional: avaliar se "necessário à execução" se sustenta ou se o consentimento (art. 7º, I) é mais seguro. Com dado de saúde, a base é o consentimento do art. 11, I, já colhido |
| Análise pós-treino | Execução de contrato, art. 7º, V | Faz parte do acompanhamento do treino que a pessoa usa; sem dado de saúde | Mesma questão de "necessidade" de uma função opcional e automática ao concluir |
| Revisão da ficha | Execução de contrato, art. 7º, V | Hoje só o controlador usa (dado do próprio controlador) | Se for aberta a outras contas, reavaliar |
| Conexão com o CRUNNING | Execução de contrato, art. 7º, V | A pessoa cria o token e pede a troca; o objetivo é coordenar a semana dela | Hoje só o controlador usa. Avaliar consentimento se outros usuários puderem conectar apps de terceiros |
| Sincronização das análises | Mesma base da análise | Guardar o que já foi gerado para a pessoa ver em outro aparelho | Retenção proposta: enquanto a conta existir, apagada com a conta |

## 4. Transferência internacional (art. 33)

A Anthropic processa nos EUA. Se a base for execução de contrato, a transferência pode se apoiar no art. 33, IX (necessária à execução de contrato, combinado com o art. 7º, V), como já está registrado para Supabase, Vercel e Resend. Se a base escolhida for consentimento, o consentimento precisa ser específico e destacado para a transferência (art. 33, VIII). **Para o advogado conferir** nos termos comerciais da Anthropic: se o conteúdo enviado pela API é usado para treinar modelos, por quanto tempo é retido e se há DPA (acordo de tratamento) aceito na conta.

## 5. Direitos dos titulares e o que já existe no app

| Direito | Como já funciona | O que muda com esta missão |
| --- | --- | --- |
| Consentimento explícito para saúde (art. 11) | Pendência em Você, nada pré-marcado, prova na tabela `consents` (só acrescenta) | Nada; as funções de IA não usam saúde, exceto o chat com consentimento |
| Acesso e portabilidade (art. 18, II e V) | Exportação JSON e CSV em Você, Seus dados | A tabela nova de análises sincronizadas entra na exportação |
| Eliminação (art. 18, VI) | Apagar a conta remove tudo em cascata; revogar saúde apaga os dados de saúde na hora | A tabela nova de análises usa `on delete cascade` e entra na limpeza |
| Revogação | Saúde e token do CRUNNING revogáveis no app | Sem mudança |
| Informação sobre compartilhamento (art. 18, VII) | Seção 4 da política lista os operadores | **Falta incluir a Anthropic** (ver item 1) |

## 6. Pendências técnicas para depois da revisão

1. Incluir a Anthropic na seção de operadores e de transferência internacional da política e de `docs/LGPD.md`, com o texto que o advogado aprovar.
2. Trocar "a definir" pelas bases aprovadas no registro de operações e na política.
3. Subir `TERMS_VERSION` em `src/sync/consent.ts` e a data da política, para pedir o aceite de novo a todos.
4. Se o advogado preferir consentimento para as funções de IA: criar o pedido no mesmo padrão do consentimento de saúde (pendência em Você, nada pré-marcado, prova em `consents`), antes da primeira chamada.

## 7. Perguntas objetivas para levar ao advogado

1. Funções de IA opcionais podem usar execução de contrato, ou é melhor consentimento?
2. A transferência para a Anthropic (EUA) se apoia no art. 33, IX, ou precisa de cláusulas-padrão (Res. CD/ANPD nº 19/2024)?
3. Basta informar a Anthropic na política como operadora, ou é preciso aviso específico na tela da análise?
4. A memória das análises (texto gerado pela IA, guardado por conta) muda alguma coisa na retenção ou na base?
5. Faixa de idade e gênero opcional: execução de contrato ou consentimento?
