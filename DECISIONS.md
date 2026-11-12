# Decisões

Uma linha por decisão: o que foi decidido e por quê.

## Produto

- 23/10/2026: editar perfil de treino e pedir plano novo usam o mesmo formulário preenchido, com intenções diferentes. Salvar perfil grava preferências sem substituir fichas/calendário; trocar de plano exige revisar e confirmar a prévia, mesmo sem mudar respostas. Visual inspirado nos cartões Questions e Review and Approve do beUI, usando Harbor existente. O cadastro inicial continua reutilizando os mesmos componentes de perguntas. O motor permanece determinístico, então respostas iguais podem produzir o mesmo plano.

- Nome Anilha, marca de anilha com anel quase fechado: objeto de academia que todo mundo reconhece; o vão do anel é o descanso planejado.
- Constância medida por semanas cumprindo o plano, nunca por sequência de dias: sequência premia treinar todo dia, e excesso é desvio.
- Semana com mais academia que o planejado não recebe reconhecimento e aparece como desvio, sem bronca: o app segura o plano do próprio usuário.
- Descanso planejado conta como cumprido e aparece no reconhecimento ("2 dias de descanso, como planejado").
- Ranking do grupo é a porcentagem do próprio plano, cada tipo limitado ao planejado (5 de 3 vale 3 de 3), empate divide a posição: ninguém sobe treinando a mais.
- Reação de amigo é um tipo só, "Boa" com ícone de polegar: um toque, sem emoji, sem comentário.
- Privado por padrão: nada é público; para amigos, aderência, treinos (tipo e data) e recordes ligados, cargas, repetições e notas desligadas até o dono liberar.
- Sugestão de carga aplicada por padrão no pré-preenchimento e desfeita com um toque ("Ignorar" volta para os valores da última vez).
- Editor da série parte da última série feita no mesmo exercício quando não há histórico: na primeira sessão o polegar só ajusta.
- Tocar no check de uma série vazia abre ela nos steppers em vez de salvar em branco.
- Esforço é perguntado logo depois de cada série de trabalho, com quatro botões; aquecimento nunca pede esforço.
- 18/10 da semana de exemplo: os 5 treinos em 7 dias só fecham contando o treino do próprio domingo. Com o treino do dia feito, Hoje mostra "Treino de hoje feito" e manda descanso citando os dois avisos; antes do treino, mostra "descanso ou algo leve" com 4 treinos em 7 dias e costas e bíceps duas vezes em 6 dias.
- Onboarding em 6 telas: 5 perguntas agrupadas e a tela do plano gerado com o porquê de cada escolha.
- Tema escuro não feito: o Harbor não tem, os pastéis perdem o caráter no escuro e a prioridade foi AA impecável no claro.

## Motor

- Módulo puro em `src/engine`, sem React nem banco, determinístico e testado: é o coração e o lugar onde um coach por IA pode entrar depois sem mexer na interface.
- RIR dos rótulos: fácil 3, ok 2, pesado 1, no limite 0. A interface mostra o rótulo, o dado guarda RIR.
- Dupla progressão sobre as séries de trabalho das últimas sessões do exercício; aquecimento nunca conta, nem no volume semanal.
- O topo uma vez não basta: a carga sobe depois de duas sessões seguidas no topo com a mesma carga, ou de uma passando 2 repetições do topo em todas. Na primeira vez, "Repita a carga: se bater o topo de novo, a carga sobe".
- O salto precisa caber na faixa: com cerca de 2,5% da carga por repetição, o app confere onde as repetições cairiam com o próximo peso. Halter leve (6 para 8 kg são 33%) pede mais repetições antes, até 30, em vez de um salto que joga abaixo do piso. Quem tem halteres de 1 em 1 kg ajusta o incremento no exercício. Fontes em docs/CIENCIA.md.
- A escolha da divisão (a da pessoa, ou a sugerida para os dias e o foco) mora no gerador (`withSplit`), usada pelas telas e pelo agente. Um plano sem divisão, feito antes da pergunta de divisão, também respeita o foco em pernas: antes, sem fichas próprias de perna, esse foco não mudava nada (achado na comparação de modelos do agente, em 22/10/2026).
- Foco em pernas e glúteos (22/10/2026, pesquisa pedida pelo Caio sobre treino feminino): não existe "treino feminino" próprio, os ganhos relativos são parecidos; quem quer mais glúteo e perna escolhe o foco. O foco ganhou divisões: pernas por partes (com 4 dias, perna 3 vezes e parte de cima 1, a sugestão até 60 anos), superior e inferior com mais perna (2 e 2) e corpo inteiro com perna primeiro. A partir dos 60 a sugestão sempre dá 2 dias para a parte de cima. O agente avisa quando um grupo cai para o nível de manter. Fontes em docs/CIENCIA.md.
- Esforço que falta só importa na última série de trabalho: sobe com confiança menor e o texto diz que faltou o esforço.
- Redução só depois de duas sessões seguidas abaixo do piso; destreino a partir de 21 dias sem o exercício (sugere repetir ou reduzir um passo).
- Incremento mínimo por equipamento (halteres 2 kg, barra 2 kg, polia e máquina 2,5 kg, leg press e panturrilha 5 kg), editável por exercício; em libras o passo é arredondado para 2,5 lb.
- Carga guardada sempre em kg; a unidade é só exibição, então trocar de unidade não altera histórico nem progressão.
- Peso corporal progride por repetições e depois por variação descrita no próprio exercício (ex.: pernas mais esticadas, descida mais lenta) ou carga extra.
- Variações de equipamento são exercícios distintos; após substituição as séries contam para o exercício executado.
- Volume semanal por grupos finos (bíceps e tríceps separados, perna em quadríceps, posteriores e panturrilha): com um único grupo "pernas", o limite de 10 séries do modo retorno estrangularia um dia de perna.
- Gerador de semana por busca exaustiva (no máximo alguns milhares de combinações): regras duras (perna nunca na véspera de corrida, inclusive domingo para segunda) e conforto pontuado (sem dias seguidos de academia, longão no fim de semana).
- 5 ou mais dias de academia: gera 4 e explica; o usuário pode forçar.
- Tempo por sessão: (minutos menos 5) dividido por 8 exercícios de 3 séries, o que dá 5 em 45 min como pede a especificação.
- Fadiga: aviso quando os treinos de academia dos últimos 7 dias passam do plano, quando um tipo de treino se repete além do planejado, quando o músculo de ontem volta hoje e quando a corrida de ontem pesa (distância vezes esforço dividido por 10, a partir de 8) para perna.
- Dor: janela de 14 dias; sugere exercício do mesmo padrão sem a articulação, senão do mesmo grupo e tipo, senão corte.
- Modo retorno: 4 semanas a partir da primeira sessão depois de mais de 21 dias parado, ou ligado à mão; aviso uma vez por retorno.
- Recordes: carga máxima e 1RM estimado (Epley, só até 12 repetições); a primeira sessão de cada exercício é a base e nunca é recorde.
- Entrada rápida: parser determinístico; esforço escrito depois de um número vale para aquela série; nome no início casa com os exercícios da sessão; se não entende, nada é salvo e o texto fica guardado.

## Dados, sync e backend

- SPA React 19, Vite 8 e TypeScript estrito: offline simples, deploy estático, nada de servidor no fluxo de treino.
- IndexedDB (Dexie) é a fonte de verdade da interface: registrar série nunca espera a rede.
- Uma base local por conta: celular compartilhado não mistura dados; sair com "apagar" limpa tudo.
- Sync próprio por duas RPCs (`sync_push`, `sync_pull`) em vez de tabelas expostas: menos superfície, validação no servidor e o mesmo contrato no servidor local.
- IDs gerados no cliente e upsert por (usuário, id): reenviar o mesmo lote não duplica nada, então retentativa offline é segura.
- Conflito por última escrita vence, pelo relógio do cliente com carimbo monotônico; escrita mais velha é ignorada e contada.
- Fila de saída com uma entrada por linha (a versão mais nova) e remoção só se a linha não mudou durante o envio.
- Cursor de pull por sequência do servidor com trava consultiva por usuário: o pull espera pushes em andamento, então nenhuma linha confirmada é pulada.
- Exclusão por marca (`deleted`): apagar num aparelho some nos outros.
- Exercícios embutidos vivem no app; só mudanças do usuário sincronizam.
- Perfil local só é criado depois do primeiro pull: num aparelho novo, um perfil em branco sobrescreveria o da nuvem.
- Supabase (Postgres, Auth e RLS) na nuvem: políticas por usuário no banco e plano gratuito suficiente.
- Login com código de 6 dígitos por e-mail: o código é digitado dentro do app, então funciona no app instalado do iOS, cujo armazenamento é separado do Safari; link mágico abriria o Safari e o login não chegaria ao app. Sessão longa com refresh automático.
- O link do mesmo e-mail também entra (computador e Android): a sessão vem no hash da URL, é lida antes do roteador e sai da barra de endereço na hora.
- Convite aberto sem conta mostra o código em vez de mandar para o login: o convite fica no localStorage (o link do e-mail abre outra aba e conta nova passa pelo onboarding antes) e o código serve para digitar no app instalado do iPhone, que não enxerga o armazenamento do Safari.
- Código de 6 dígitos com validade de 15 min (o projeto novo vinha com 8 dígitos e 1 hora): 6 caixas no app e janela curta para compensar o código menor.
- Privacidade no banco: tabelas de detalhe (sessões, itens, séries, corridas, exercícios) só são legíveis por amigo com `share_details`; o resumo de amigos sai de uma função que aplica as preferências. Testado direto contra o banco local e contra o Postgres de produção.
- Funções sociais com SECURITY DEFINER e checagens explícitas: o aviso do Supabase sobre isso é intencional; as internas (`week_counts`, `are_friends`, `display_name_of`) não são executáveis por usuário.
- `code_attempts` e `reminder_log` com RLS e sem política: só funções internas escrevem nelas.
- Limite de tentativas: 20 códigos de convite ou grupo errados por hora por usuário; no login, os limites do Supabase Auth (e no servidor local, 5 envios em 10 min e 5 tentativas por código).
- Validação no servidor por CHECK em todas as colunas (cargas até 1000 kg, repetições até 500, textos com tamanho máximo); linha inválida é rejeitada sem travar o resto do lote.
- Excluir conta apaga o usuário em `auth.users` e tudo cai em cascata; o app apaga a base local.
- Corrida guarda `source` e `external_id`: importar do Strava ou de relógio depois não exige migração.
- `.env.production` versionado com URL e chave publicável do Supabase: são públicas por natureza (vão no JavaScript) e assim a Vercel não precisa de variável nenhuma. Segredos de verdade (VAPID privada, segredo do cron) ficam no Vault do Supabase.

- Convite direto para grupo: só membro convida, só amigo é convidado, um convite aberto por pessoa e grupo, no máximo 30 por dia. A pessoa aceita ou recusa nos Avisos; aceitar entra no grupo na hora. O código do grupo continua para quem ainda não é amigo.
- Avisos (`inbox`): uma função junta reações, convites de grupo, amigo que aceitou seu convite e amigo que entrou no seu grupo, dos últimos 30 dias. O que já foi visto fica guardado no aparelho; convite de grupo aberto continua contando até ser respondido. Sem push para isso por enquanto: o lembrete de treino segue sendo o único push.
- Contador do sino em `brand-700` com número branco (contraste AA); laranja com branco não passaria.

- Notificações além do lembrete diário: fim do descanso e atividade de amigos (reação, convite de grupo, convite aceito, amigo que entrou no grupo). Ficam numa fila com hora de envio; um despachante do pg_cron a cada 5 s só chama a função de envio quando há algo vencido, então segundo ocioso custa uma consulta.
- Fim do descanso: o celular avisa o servidor quando o descanso termina, a próxima série substitui o aviso e pular o descanso cancela. Se o app estiver na tela 4 s antes do fim, o aviso é cancelado e só o toque do app soa. O texto diz a próxima série ("Próxima: supino, 2ª série, 40 kg × 6").
- Atividade de amigos: no máximo uma notificação do mesmo tipo a cada 10 min; o resto fica no sino.
- Preferências de notificação vão com a conta (`reminders.rest` e `reminders.social`, ligadas se não houver valor). Atividade ao vivo do iPhone (contagem na tela bloqueada) exige app nativo; ficou de fora.
- Sincronização grava só as colunas que o aparelho mandou: um aparelho com versão antiga não apaga campo novo. Por isso toda coluna nova é anulável (o Postgres exige as obrigatórias antes de decidir entre inserir e atualizar).

- Corpo: peso e cintura em `body_logs`, sincronizado como o resto e visível só para o dono (amigo nunca vê). A tela mostra a média da semana, não a pesagem do dia (água e sal mexem 1 a 2 kg), e o ritmo em % do peso por semana. Para hipertrofia o alvo é subir de 0,25% a 0,5% por semana (Iraki e colegas, 2019): parado, o app sugere comer um pouco mais; acima disso, avisa que tende a vir mais gordura; cintura 2 cm acima, sugere segurar. Só peso e cintura: são as duas medidas que a pessoa faz sozinha com confiança.
- Importar corrida do relógio por arquivo `.gpx` ou `.tcx` (exportado do Strava, Garmin, Coros, Apple Saúde via app): lido no aparelho, distância pela soma dos pontos e tempo em movimento (parado abaixo de 0,5 m/s não conta). `.fit` é binário e fica de fora. Integração direta com o Strava exige app aprovado e servidor com segredo; o arquivo resolve sem nada disso.
- Erros em produção: o app manda mensagem, pilha, rota e versão para `log_client_error`, sem dado de treino e sem e-mail. O banco agrupa o mesmo erro do dia, aceita no máximo 30 por hora por pessoa e apaga com 30 dias. Falha de rede não é erro do app e não é enviada. Arquivo novo que sumiu depois de um deploy recarrega a página uma vez.

## Ambiente local e testes

- Supabase local imitado por um servidor Node com PGlite: roda e testa sem Docker nem conta; mesmas migrações, mesma RLS, e o cliente usa o mesmo supabase-js em dev e em produção.
- O código de login aparece na tela só no servidor local (`VITE_SHOW_DEV_CODE`), nunca no build de produção.
- Semana de exemplo semeada só no servidor local, com dois amigos e um grupo para todas as telas terem conteúdo.
- Testes de banco rodam as migrações reais com usuários simulados por `SET ROLE authenticated`.
- E2E com Playwright em build de produção, service worker ativo e viewport 390x844; offline via `setOffline`.
- Lighthouse rodado contra o build, no login e na tela Hoje logada.

## Divisão em fichas

- Pergunta da divisão no onboarding (por grupo muscular, superior e inferior, corpo inteiro), sem passar de 6 telas: minutos foram para a tela da semana e equipamento divide a tela com o nível.
- Fichas em rodízio: a ficha de hoje é a seguinte à última feita, não a do dia da semana. Com 5 dias e 3 fichas fica A, B, C, A, B e a semana seguinte continua em C. Faltar um dia não pula ficha.
- Por grupo: A peito e tríceps, B costas e bíceps, C perna (a ficha de academia que todo mundo conhece); 4 fichas somam ombro e abdômen; 5 separam peito, costas, perna, ombro e braços. Sugestão padrão: ABC a partir de 3 dias, corpo inteiro até 2.
- No rodízio o plano salvo não fixa ficha por dia (o dia é só academia, corrida ou descanso). Se a ficha da vez for perna na véspera de corrida, vai a seguinte e perna fica para o próximo treino.
- Planos feitos antes da pergunta continuam com a divisão fixa por dia da semana; refazer o plano pergunta a divisão.
- Volume semanal por grupo no rodízio conta a média de vezes que cada ficha volta na semana (dias de academia divididos pelo número de fichas).

## Treino

- Cardio além da corrida (caminhada, bike, elíptico, natação, remo, escada, outro) sem tela nova: a folha de corrida ganhou uma fileira de atividades no topo e esconde o que não se aplica (sem distância no elíptico e na escada, sem tipo fora da corrida). Distância em metros na natação e no remo; ritmo na unidade de cada esporte (min/km, km/h, /100 m, /500 m). Abre na última atividade usada no aparelho; em dia de corrida do plano, abre na corrida.
- Mesma tabela `runs` com a coluna `activity` (vazia é corrida): sincroniza, entra no feed dos amigos e nas reações sem nada novo. Marcos de distância só para corrida.
- Outro cardio conta para os dias de cardio do plano só enquanto preenche um; passou disso é bônus, não desvio, e um elíptico antes da musculação não fecha o dia de academia. A corrida segue contando como antes. A mesma regra vale no servidor (aderência dos amigos e grupos).
- Carga na perna para a regra de "perna depois de corrida forte": corrida pelos km; o resto pelos minutos como se fosse corrida a 6 min/km, vezes o quanto a atividade usa a perna (estimativa: caminhada 0,3, remo 0,4, elíptico 0,5, bike 0,6, escada 0,8, natação 0).

- Dias de corrida escolhidos na montagem do plano (opcional): o gerador deixa esses dias fixos e encaixa a academia em volta, ainda tentando não pôr perna na véspera; se não der, avisa no porquê do plano. Sem escolha, distribui como antes.
- Dias de academia escolhidos do mesmo jeito, numa linha acima da de corrida. Veio de um pedido. Mantive o número de dias no contador e os dias como escolha opcional: quem só sabe "3 vezes por semana" segue sem escolher, e quem tem agenda fixa marca os dias. Um dia é academia ou corrida: marcado numa linha, sai da outra. Escolheu menos dias que o número, o resto o app encaixa; escolheu 5 e aceitou a sugestão de 4, o melhor dia para descansar entre os escolhidos vira descanso, e o porquê do plano diz qual. No rodízio, o primeiro dia escolhido da semana recebe a ficha A (com foco em pernas, a primeira é de perna). Um aviso só embaixo das duas linhas diz o que falta escolher.
- Plano pronto: tocar num dia (em Plano ou na semana da tela Hoje) permite trocar com outro dia em um toque; o que estava lá vem para o lugar. Vale a partir desta semana. Veio de um relato: mudar a corrida de dia exigia editar dois dias separados, e a semana da tela Hoje não respondia ao toque.

- Aquecimento obrigatório no primeiro exercício com carga de todo treino, mesmo em rotina feita à mão ou em "repetir treino".
- Intermediário e avançado: 2 séries de 6 a 40% e 80% da carga de trabalho, 1 min entre elas (Ribeiro e colegas, 2020, IJERPH 17:6882: melhor aquecimento no supino em homens treinados; aquecer só leve foi o pior no supino e no agachamento). Duas séries cobrem os dois casos do estudo (no agachamento uma série a 80% bastou) e não há evidência de ganho com três ou mais.
- Iniciante e modo retorno: 1 série de 10 a 40%. A carga ainda é baixa e o objetivo é ensaiar o movimento sem cansar antes das séries que contam.
- Cargas do aquecimento calculadas sobre a carga de trabalho sugerida e arredondadas ao incremento do aparelho; sem carga conhecida (primeira vez), o card mostra a regra em vez de inventar carga.
- Ordem do treino: um músculo por vez, composto antes do isolado (peito, peito, peito, ombro, tríceps, abdômen). Pernas e peito antes de braços; panturrilha e abdômen no fim. Rotinas antigas ganham o botão "Ordenar por grupo".
- Cada exercício diz o que trabalha em linguagem de academia (peitoral superior, deltoide lateral, tríceps cabeça longa); exercício criado pela pessoa mostra os músculos cadastrados.
- Treino encerrado pode ser corrigido: tocar numa série abre a mesma edição do treino em andamento (sem "desmarcar feita"), e dá para adicionar uma série esquecida. A sugestão da próxima vez usa os valores corrigidos.
- Recordes recalculados do zero para o exercício a cada correção, série apagada ou treino apagado: um recorde que deixou de ser some, e um treino posterior pode virar o recorde. O mesmo vale para os marcos de corrida.
- Cronômetro do treino com segundos, calculado do horário de início (sobrevive a recarregar e a tela bloqueada); a duração aparece na lista do histórico.
- Semana leve (deload) oferecida, nunca imposta: 8 semanas seguidas treinando, ou 5 semanas e um sinal de cansaço (nenhum recorde em 4 semanas, ou 40% das séries das últimas 2 semanas até o limite). Quem pratica faz uma a cada 5 ou 6 semanas, por cerca de uma semana (Rogerson e colegas, 2024), e a definição segue o consenso de Bell e colegas (2023). Um ensaio de 2024 não achou ganho extra de músculo com ela, por isso o app só sugere. Recusada, volta a falar em 2 semanas; nada no modo retorno.
- Na semana leve: mesmos exercícios e dias, metade das séries (no mínimo uma), 10% menos carga e 3 a 4 repetições sobrando. Esses treinos não entram na sugestão da próxima carga nem em recordes, e a semana não conta na sequência.
- Bi-set montado na rotina, com o exercício de baixo: aquecimento primeiro, depois A1, B1 sem descanso no meio, descanso ao fechar a rodada; se um tem mais séries, as que sobram vão sozinhas com descanso normal. Superséries economizam tempo sem perder volume nem ganho a longo prazo, e pares opostos (peito e costas, bíceps e tríceps) ainda rendem algumas repetições a mais (meta-análise na Sports Medicine, 2025); por isso o app avisa, sem proibir, quando os dois são do mesmo grupo.
- Par de bi-set só existe lado a lado: subir ou descer um deles para longe desfaz o par (com aviso), "Ordenar por grupo" mantém os dois juntos e tirar um da rotina solta o outro.

## Design

- Equipamento em 4 cartões (academia completa, pequena, em casa, do meu jeito) e articulações num desenho do corpo: o primeiro uso mostrou que listas longas de chips cansam.
- Segurar um treino no histórico abre o menu dele (Ver, Repetir, Apagar). O toque longo do iPhone abria a prévia de link do sistema; ela foi desligada nos links do app.
- Zoom de pinça continua (acessibilidade); o que some é o zoom acidental: dois toques rápidos (`touch-action: manipulation`) e o zoom do iOS em campo com menos de 16 px.
- Tela de Ajustes: tema (automático, claro, escuro), aviso do fim do descanso (som e vibração, só vibrar, só na tela) e tela acesa ficam no aparelho; unidade, descanso padrão e notificações vão com a conta. No iPhone o app web não vibra: "só vibrar" fica sem som e a notificação segue o modo silencioso do aparelho.
- Tema escuro pelos mesmos tokens do Harbor, redefinidos; segue o sistema por padrão. Pastéis viram tons profundos com texto claro; todos os pares conferidos em AA. Um script de 6 linhas aplica a escolha antes da primeira pintura (arquivo próprio, a CSP proíbe script embutido).
- Diretrizes de tela para o que vier: durante o treino só o que serve à próxima série; registrar com um toque e valores já preenchidos; ações principais embaixo; detalhe atrás de menu ou toque longo; em tela pequena, mais telas em vez de tela apertada; aviso por som, vibração ou notificação quando a pessoa não está olhando.
- Sem seleção de texto ao segurar o dedo, fora dos campos de digitação: é um app, não uma página.
- iPad com o app instalado: o iPadOS 26 desenha um desfoque de vidro sobre os ~40 pt de cima da página, por cima do app, e nenhum CSS ou meta tag desliga (relatado em vários projetos). Ali a barra de cima ganha uma faixa de 40 px na própria cor e as abas descem para fora do desfoque. Só no iPad instalado; Safari, iPhone e computador seguem iguais. Abas de cima com 44 pt de altura em tela de toque.
- "Voltar" no canto superior esquerdo de toda tela abaixo de uma aba, onde o iOS põe: o app instalado no iPhone não tem botão de voltar do navegador e a Apple desliga o gesto da borda em app web. Volta para a tela anterior; aberta direto (link ou notificação), vai para a tela de cima. No app instalado do iPhone, arrastar da borda esquerda faz o mesmo; no Safari e no Android o gesto já é do sistema e não é duplicado.
- Linha da rotina: tocar em qualquer parte abre a edição e as setas ficam empilhadas à direita, para o nome do exercício caber inteiro.
- Marca no topo da tela Hoje no celular, com o status de sincronização ao lado; no computador ela já está na barra de cima.
- Harbor UI como base, copiado sem alteração em `design/harbor-ui/`; tudo novo está em `extensions.css` e documentado em `EXTENSIONS.md`.
- Botão primário sempre 18 px peso 600 (contraste do branco sobre brand-500 é 2,9:1) e no máximo um por tela.
- `ink-muted` sobre `bg-page` dá 4,4:1, abaixo de AA: texto secundário usa `--ink-muted-aa`, mistura de `ink-muted` e `ink-strong`. Aba e navegação, sobre branco, seguem com `ink-muted`.
- Mapa de pastéis: costas sky, peito peach, pernas lime, ombros lavender, braços pink, corrida mint, plano e reconhecimento butter, abdômen e treino misto neutro (`bg-subtle`). Sete pastéis para oito tipos: abdômen quase nunca aparece sozinho.
- Ícones Lucide com traço absoluto de 1,8 px a 20 px, uma família só.
- Abas inferiores com pílula brand-50 no celular; barra superior do Harbor a partir de 1024 px.
- Folhas e modais com `<dialog>` nativo: foco preso, Esc fecha e o fundo fica inerte sem biblioteca.
- Gráficos em SVG próprio com largura real medida, para o texto ficar em 12 px.
- Formatos brasileiros: vírgula decimal, datas dd/mm, semana começando na segunda, horário 24 h.

## Publicação

- Projeto Supabase `anilha` em São Paulo (sa-east-1), criado pelo conector já autenticado; custo informado de US$ 0/mês.
- Lembretes: Edge Function `send-reminders` chamada pelo pg_cron a cada 15 min, janela de 20 min e no máximo um aviso por dia garantido por chave primária.
- Vercel com `vercel.json` (SPA, cache imutável dos assets, service worker sem cache, CSP restrita ao próprio domínio e ao Supabase).
- GitHub (`Caiosmiderle/anilha`, privado) e Vercel conectados pelo Caio no navegador; cada push na `main` publica em https://anilha-eight.vercel.app (`anilha.vercel.app` já era de outra pessoa).
- E-mail de login pelo Resend via SMTP, remetente `anilha@perfilscore.com.br`: o domínio do PerfilScore já estava verificado e o Resend sem domínio só entrega para o dono da conta. Chave própria `Anilha`, só envio e só esse domínio, para revogar sem afetar o PerfilScore.
- Assunto do e-mail começa pelo código: aparece na notificação do celular sem abrir o e-mail. Modelos versionados em `supabase/templates/` e colados no painel em uma linha.

## Privacidade e LGPD

Detalhes e registro das operações em [docs/LGPD.md](docs/LGPD.md).

- Sem cookies e sem banner de cookies: o app só guarda no navegador o que é estritamente necessário (sessão, conta aberta, preferências, dados offline), e o Guia de Cookies da ANPD dispensa consentimento nesse caso. A seção 6 da política lista cada item, com nome e para quê.
- Tela de termos antes de tudo, uma vez por versão (`TERMS_VERSION`): só termos e 18 anos. Dados de saúde não entram nela (escolha do Caio, para não travar o começo): ficam como pendência em Você, com um ponto vermelho na aba, e as funções de saúde (aba Corpo, dores, articulações a poupar) ficam desligadas até a pessoa responder. Recusar não muda o resto do app.
- Contam como saúde peso, cintura, dores e articulações a poupar. Treinos e cargas são o serviço contratado, não pedem consentimento.
- A escolha fica no servidor (prova, art. 8º) e no aparelho (o app abre offline). Sem resposta guardada e sem internet, o app abre com saúde desligada em vez de travar na tela de abertura; espera no máximo 4 s pelo servidor.
- Revogar saúde apaga no servidor na hora e o `sync_push` passa a recusar dados de saúde: um celular offline com um peso na fila não traz o dado de volta. Itens de saúde excluídos sobem sem os valores.
- Retenção: marcas de exclusão do sync saem do servidor depois de 30 dias. O `sync_pull` devolve o `horizon` do que já foi apagado; um aparelho que passou mais tempo sem sincronizar pede a lista de ids e apaga o que sobrou. Uma limpeza diária pelo pg_cron cuida também de convites, tentativas, lembretes, erros e fila de push.
- Canal do titular e de suporte é o mesmo: Fale com o Anilha (tabela `tickets`), com resposta no app e no sino. Pedidos sobre dados mostram o prazo de 15 dias e, antes de enviar, o que a pessoa já consegue fazer sozinha. Escolha do controlador: sem e-mail público.
- Política e termos em páginas estáticas (`/privacidade/`, `/termos/`) com o visual da landing, fora do service worker; no app abrem em outra aba para não perder o lugar.
- Transferência internacional pelo art. 33, IX (necessária ao serviço): treinos e saúde ficam em São Paulo; o e-mail passa pelo Resend e os acessos pela Vercel.

## Painel de gestão

- Dentro do app (`/admin`), não um sistema à parte: o mesmo login, o mesmo visual, publicado junto. Só aparece em Você para quem está na tabela `admins`; cada função do banco confere isso, e o código do painel fica fora do cache offline de todo mundo.
- Mostra o necessário para cuidar do app e das pessoas: contas, atividade (dias com treino ou cardio), funil do cadastro à segunda semana, mensagens com prazo e erros agrupados. Não mostra dado de saúde, conteúdo de treino, nem guarda anotação sobre pessoas.
- "Ativo" é quem registrou treino ou cardio nos últimos 7 dias, não quem abriu o app: para um app de treino é o número que importa, e não exige rastrear acessos.
- Segmentos: novo (conta de até 7 dias), ativo, em risco (8 a 21 dias sem treino), inativo, nunca treinou. Calendário do Brasil para a data da conta.
- Responder uma mensagem avisa no sino da pessoa; responder de novo atualiza a resposta.

## Lembretes e resumo da semana

- O lembrete é oferecido onde faz sentido, não escondido em Ajustes: na última tela do cadastro (já marcado, 30 minutos antes do horário do treino) e uma vez em Hoje para quem já tinha plano sem lembrete. A resposta fica no perfil (`reminders.offered`), então nenhum aparelho pergunta de novo.
- A permissão do navegador é pedida no próprio toque, antes de qualquer espera: o Safari e o Chrome recusam o pedido fora do gesto.
- No iPhone fora do app instalado não há notificação: no lugar da opção, o cadastro diz para instalar.
- Resumo da semana no domingo às 20:00, no fuso da pessoa: feito contra o planejado ("Você fez 3 de 4 treinos e 1 de 2 corridas"), semana fechada ou sem treino com texto próprio. Tem vaga própria no registro de lembretes, então não toma o lugar do lembrete da corrida de segunda. Liga junto com o lembrete do treino e tem interruptor próprio.

## Foco em pernas e glúteos

- Sugestão de uma usuária: treino focado em pernas desde o primeiro treino. O cadastro pergunta o foco, não o sexo: o que muda o treino é a preferência (há mulheres que preferem a parte de cima e homens que querem mais perna), e a LGPD pede só o dado necessário.
- Com o foco, a perna vira três fichas, como a ficha feminina comum da academia: anterior de coxa, posterior de coxa e glúteos, e a parte de cima tem a sua. 4 fichas por padrão (A anterior, B parte de cima, C posterior, D glúteos); com 3, posterior e glúteos dividem a C; com 5, a parte de cima ganha uma B. A ficha A é de perna, então o primeiro treino também é.
- Até 2 dias: corpo inteiro com mais perna (dois exercícios de perna abrindo e glúteo em todo treino).
- Quadríceps e posteriores ganham 4 séries a mais no teto semanal; o resto segue o teto do nível.
- Cada ficha de perna abre com o músculo dela (stiff no posterior, elevação pélvica no glúteos), não com o quadríceps da ordem geral.

## Conteúdo do Anilha

- Avisos e fichas prontas são escritos no painel, sem deploy: o conteúdo muda sem mexer no código.
- Aviso aparece no sino por 30 dias e abre uma tela do app (nunca link de fora). Conta nova não recebe aviso antigo: o sino de quem acabou de chegar começa limpo. A notificação é opcional, e o padrão é não mandar.
- Fichas prontas reaproveitam o formato da ficha enviada (mesmos limites e a mesma cópia no aparelho, com ids tirados da ficha, então adicionar de novo não duplica). O servidor só conta quantas vezes cada uma foi adicionada, nunca quem.
- A biblioteca estreia com quatro fichas feitas com os exercícios do app (corpo inteiro com máquinas, 30 minutos em bi-sets, em casa com halteres, glúteo e posterior), para não abrir vazia.
- No painel, as cinco seções viraram chips que quebram linha: a barra segmentada não cabe cinco nomes no celular.

## Fichas enviadas

- Qualquer pessoa manda uma das suas fichas para um amigo; o admin manda para qualquer conta pelo painel, assinado "Anilha". Sem conta especial de personal: prescrever treino no Brasil pede CREF, e um selo daria a entender que o app conferiu. Se um dia houver selo, só com conferência do CREF pelo admin.
- Nada muda no plano de ninguém sem aceite: a ficha chega no sino (e por notificação, se ligada), a pessoa vê exercícios, séries e descanso e escolhe adicionar ou recusar. Quem mandou fica sabendo quando um amigo adiciona.
- Adicionar copia no aparelho de quem aceita, como uma rotina livre (fora do rodízio), com ids tirados da ficha enviada: aceitar de novo depois de ficar sem sinal grava as mesmas linhas. Exercícios criados por quem mandou vão junto; os da biblioteca, não.
- O servidor só aceita a ficha dentro dos limites de uma rotina (1 a 30 exercícios, séries, faixa e descanso válidos), 20 por dia por pessoa. O motivo do plano de quem mandou não viaja.
- O painel mostra só números das fichas e as que o próprio Anilha mandou; fichas entre amigos são conversa entre usuários e não aparecem.
- Responder uma mensagem no painel também manda notificação, além do sino.

## Prova alvo

- Distância (5, 10, 21 ou 42 km) e data, perguntadas no cadastro para quem escolhe correr provas e editáveis em Plano. Ficam nas respostas do cadastro do perfil (`onboarding.race`), sem coluna nova: já sincronizam e entram na exportação.
- Revisto em 20/10/2026 com a literatura (docs/CIENCIA.md). O longão sobe no máximo 10 % sobre o maior das 4 semanas anteriores: sessões mais de 10 % acima da maior dos 30 dias anteriores aumentaram as lesões por sobrecarga numa coorte de 5.200 corredores (Frandsen e colegas, 2025). A versão anterior subia passos fixos de 0,5 a 2 km, que passavam disso.
- O ciclo é fixo a partir da semana em que a prova foi marcada (`race.from`) e começa no maior longão dos 30 dias antes dela: refazer o cálculo a cada dia faria a semana mais leve nunca chegar. Com mais semanas que a subida pede, as primeiras seguram o início; com menos, o longão vai até onde os 10 % deixam, e Plano diz até onde ("Até a prova, o longão chega a 13 km"). Prova sem `from` (marcada antes desta revisão): ciclo inteiro encostado na prova.
- Semana mais leve a cada 4, a três quartos, e longões máximos de 7, 12, 18 e 32 km: prática de treinador. Reta final com 40 % a 60 % menos volume e a mesma intensidade, de 1 a 3 semanas (Wang e colegas, 2023, meta-análise).
- Trava de segurança em Hoje e em Plano: 10 % sobre o maior longão dos últimos 30 dias, nunca abaixo de 3 km. Sem corrida registrada, não há trava, e o texto pede para fazer menos se a pessoa não vem correndo a distância.
- Com prova, a semana sempre tem uma corrida longa: o gerador trata o plano como de corrida, e definir a prova em Plano transforma a última corrida da semana em longa, avisando.

## Corrida do dia

- Cada corrida do plano vira uma sessão concreta em Hoje (o que fazer, em que ritmo e por quê), feita pelo motor em `src/engine/running.ts`. O plano diz o tipo (leve, intervalado, longo); o nível, o histórico e a prova dizem o resto.
- Ritmos pelas equações de Daniels e Gilbert (VDOT), a partir do melhor entre um tempo recente informado em Plano (até 4 meses) e as corridas fortes contínuas registradas (esforço 8 ou mais, 3 km ou mais, nunca intervalado, cuja média mistura o trote). Sem nenhum dos dois, a intensidade vai pelo esforço e pelo teste da fala. O tempo fica em `onboarding.run_mark`.
- Corrida quase toda leve e uma de qualidade por semana: para recreativos, polarizado e piramidal rendem parecido (Oliveira e colegas, 2024), e o simples cansa menos. Qualidade: intervalado de 2 a 5 min perto do VO2máx (Buchheit e Laursen, 2013) ou limiar; meia e maratona ficam no limiar, 5 km no intervalado, 10 km e sem prova alternam por semana. Iniciante e retorno fazem fartlek. A escada sobe um degrau por sessão de qualidade feita nas últimas 6 semanas: o progresso segue o que a pessoa fez, não o calendário.
- O tipo `intervalado` do plano aparece como corrida "de qualidade": em Hoje ele vira intervalado, limiar ou fartlek, e o nome antigo prometia só o primeiro.
- Semana da prova: corridas leves de 25 min e uma abertura (4 x 1 min no ritmo da prova). Dia da prova: primeiros 2 km uns 5 s/km mais devagar, porque largar rápido demais é o que mais faz quebrar (Smyth e Muniz-Pumares, 2020).

## Academia revista com a literatura

- Revisão de 20/10/2026, com as fontes em docs/CIENCIA.md. O que já seguia a evidência ficou (volume por nível, faixas de repetição, esforço por série, aquecimento, semana leve oferecida, perna fora da véspera de corrida).
- Descanso de 2 min nos compostos e 90 s nos isolados, no plano gerado, nas rotinas e nos ajustes: abaixo de 60 s rende menos músculo e acima de 90 s não houve ganho claro (Singer e colegas, 2024). Antes era 90 s e 60 s.
- Cadeira flexora antes da mesa (Maeo e colegas, 2021) e tríceps acima da cabeça em toda divisão (Maeo e colegas, 2023): os dois treinam o músculo alongado e cresceram mais nos estudos.
- Objetivo força: compostos em 5 a 8 repetições (antes 6 a 10): para força máxima a carga pesa mais (Robinson e colegas, 2024).
- Treino diferente para quem corre é exceção, só para quem escolhe "Correr provas longas" como objetivo: compostos em 5 a 8 repetições e 6 a 10 séries por grupo, porque carga alta melhora a economia de corrida (Llanos-Lagos e colegas, 2024) e menos séries poupam as pernas. Quem treina para ganhar massa, força ou saúde e também corre segue com o plano de academia completo; um teste prende isso.

## Entrada

- Ideia do Caio: o endereço do app, para quem não tem conta, abre a landing; o botão dela leva ao login. No app instalado (ou sem internet), uma tela só com a marca e o botão Entrar, que leva ao mesmo login.
- Quem tem conta abre Hoje direto: o login fica no aparelho, então a decisão é do app, não do servidor, e a landing nunca aparece para quem já usa.
- Só o endereço principal muda. Convites, notificações e links para uma tela seguem para o login (ou para a página do convite), e o link de login do e-mail, que volta para o endereço principal com a sessão, continua indo direto para o login.
- A página do app ganhou a mesma prévia da landing (título, texto e imagem com endereço completo), para o link aparecer bem no WhatsApp e no Instagram.

## Navegação e gestos

- Abas na ordem Histórico, Plano, Hoje, Amigos, Você (ideia do Caio): Hoje no meio, onde o polegar alcança melhor; o passado e o plano à esquerda, amigos e a pessoa à direita. A mesma ordem no computador.
- Quem tem conta chega à landing por "Página do Anilha", em Você e no menu da conta do computador. É uma página à parte do app (carrega inteira, não é uma rota).
- Celular: a barra de abas virou uma cápsula de vidro flutuante, como a do iOS 26 (referência mandada pelo Caio). A pílula da aba atual desliza até a aba tocada e, no caminho, cresce como uma lente de borda clara, assentando na nova aba. Telas de dentro acendem a aba de onde vêm (Ajustes e mensagens em Você, exercícios em Plano); fora delas, sem pílula. Quem pede menos movimento no sistema vê a troca sem deslizar. Também dá para segurar e arrastar a pílula pela barra, como no iOS: a lente segue o dedo, a aba embaixo dela acende (com um toque de vibração no Android ao passar de aba) e, ao soltar, abre essa aba. A barra fica com os arrastos de lado; um toque simples segue abrindo a aba.
- Altura e botões da barra medidos no print do WhatsApp do Caio (iPhone, iOS 26): a mesma altura de 64 pt, mas a barra do Anilha ficava 44 pt acima da borda da tela e a do sistema fica a 21 pt, quase encostada na barra de início. Agora: 21 pt da borda no iPhone com barra de início (área segura menos 13), 12 px nos outros celulares, 20 pt das laterais. Ícones de 26 pt com traço de 2 e rótulos de 10 pt em semibold, o mesmo peso em todas as abas (a ativa muda só a cor). O que flutua acima da barra (Treino em andamento, Mandar uma ficha) e o fim da página acompanham a nova altura.
- Computador: o menu passou para a lateral. Uma barra no alto não comporta o que vem (a área do personal que manda treinos, o painel de quem administra); a lateral cresce para baixo. Hoje, Plano, Histórico, Amigos e, para admin, Painel; a marca e o sino no alto; a pessoa embaixo, com Ver perfil, Ajustes, Página do Anilha e Sair. No iPad instalado o menu e a página começam abaixo da faixa do desfoque.
- Você mostra no topo o nome, o e-mail, Ajustes e Sair, sem precisar rolar. Sair só desconecta: os dados ficam no aparelho e voltam no próximo login.
- Hoje ficou no treino do dia: as reações dos amigos saíram (estão no sino) e dos recordes recentes fica só o mais novo (o resto está no Histórico).
- Avisos: abrir a lista não lê nada. Cada aviso fica novo (ponto e título forte) até ser tocado ou até "Marcar tudo como lido". No computador o sino abre um painel suspenso, sem trocar de tela, que fecha com um clique fora, Esc ou ao abrir um aviso; no celular continua a tela de avisos, que é para onde as notificações apontam e onde os botões de aceitar convite e ver ficha cabem.
- Entre arrastar para trocar de aba e arrastar itens, ficou o segundo: trocar de aba arrastando brigaria com as fileiras que rolam de lado em Hoje (ajustes do dia, cardio) e com o gesto de voltar pela borda do app instalado. No Histórico, arrastar um treino para a direita mostra Repetir; uma corrida, Editar; para a esquerda, Apagar. A ação revelada ainda pede um toque, e apagar ainda pergunta: um escorregão nunca apaga nada. As bordas da tela ficam com o gesto de voltar, a rolagem vertical continua da página, e segurar a linha abre o menu como antes. Fixar treino não existe no app, e compartilhar ainda é teste do admin; por isso não entraram no gesto.

## Atalhos

- Onde arrastar ajuda de verdade (pedido do Caio: pensar onde mais faz sentido):
  - Fichas: a ordem dos exercícios muda arrastando pela alça (⋮⋮), no lugar das setas de subir e descer, que pediam um toque por posição. A alça aceita as setas do teclado, para teclado e leitor de tela. Bi-set separado no arrasto é desfeito com aviso, como antes.
  - Plano: um dia arrastado sobre outro troca os dois (a corrida de terça vai para quinta e o que estava na quinta vem para terça), a mesma troca do "Trocar com" da folha do dia, sem abrir nada.
  - Histórico: arrastar um treino mostra Repetir ou Apagar (já existia).
  - Barra de abas: arrastar a pílula (já existia).
- Treino em andamento não ganhou arrastar: os cartões de série são grandes e o celular está na mão entre séries. O atalho certo ali é o do aparelho ocupado: no menu do exercício, "Deixar para o fim" (vai depois de todos) e "Fazer agora" (vem antes do que está em andamento), um toque cada; bi-set anda junto e a série atual segue a nova ordem.
- Ícone do app (Android e Chrome no computador): segurar mostra Treino de hoje, Registrar corrida e Histórico. "Treino de hoje" começa o treino do dia (ou volta ao que está em andamento; em dia sem academia, abre a escolha), e o endereço volta a ser só Hoje. O iPhone não oferece atalhos para apps instalados pelo navegador.

## Do plano ao primeiro treino

- Um dia depois de abrir, 7 de 8 contas tinham plano e só 2 tinham treinado. O gargalo era começar, não faltar função.
- Hoje mostra "Seu primeiro treino" até o primeiro treino ou corrida: o que vai acontecer em 3 ou 4 linhas (iniciar, escolher a primeira carga com 2 ou 3 repetições sobrando, marcar a série, encerrar quando quiser). Em dia de corrida, como correr e registrar; em dia de descanso, quando é o primeiro treino. Fica abaixo da sugestão do dia, para o botão de iniciar continuar no topo, e some sozinho depois do primeiro treino.
- Avisos do painel com público: todos, ou quem nunca treinou (nenhum treino encerrado, nenhuma corrida ou cardio). O painel mostra quantas contas o público alcança na hora. Quem treinar depois deixa de ver o aviso, que já não é para ela. A conta é do servidor (`never_trained`), fechada para o app: diria se outra conta treinou.

## Versão nova com o app aberto

- Erro real em produção: depois de um deploy, abrir uma tela ainda não carregada pedia um arquivo da versão anterior. A Vercel respondia com a página do app (HTML) e a tela quebrava antes do recarregamento.
- Arquivos que faltam em `/assets` agora dão 404; as telas e folhas carregadas sob demanda passam por `lazyScreen`, que recarrega uma vez na versão nova. Uma segunda falha em menos de 1 minuto mostra a tela de erro, sem recarregar em loop. Sem internet, não recarrega.
- "Script error." (sem mensagem nem pilha, vindo de scripts de outra origem, como navegadores de dentro de apps) não vai mais para o painel de erros.

## Cartão do treino

- Imagem no tamanho de story (1080x1920), desenhada no próprio aparelho, sem servidor: título, data, duração, séries, volume (carga vezes repetições das séries com carga), até 6 exercícios com a melhor série de cada e os recordes do treino. Nada de corpo, dor ou nota: só o que é do treino.
- Começou só para o admin, como teste. Aberto para todos em 20/10/2026, depois do teste do Caio: o botão Compartilhar treino fica no detalhe de um treino encerrado com séries feitas, e a landing fala dele.
- O teste mostrou que Salvar imagem não fazia nada no iPhone: baixar arquivo não funciona lá, sobretudo no app instalado. Agora é um botão só, Compartilhar ou salvar, que abre o menu do celular com a imagem (onde o iPhone tem Salvar imagem), e segurar a imagem também salva. Sem esse menu (computador), o botão é Baixar imagem. As exportações de Seus dados passam pelo mesmo caminho no iPhone (Salvar em Arquivos).
- A prévia usa imagem data: porque a política de conteúdo da página não aceita blob:.
- Sem endereço do site na imagem, como nos vídeos: a marca basta ("Registrado no Anilha").

## Marketing

- Landing estática em `/conheca/`, fora do pacote e do service worker do app: quem usa o app não baixa nada dela, e ela abre rápido para quem vem do anúncio (Lighthouse 100 nas três notas no celular). Linkada da tela de entrar e da tela Você.
- Um vídeo só por visita: o script escolhe o horizontal ou o vertical pela largura e só então define a fonte; sem som e em loop; botão para ativar o som; com movimento reduzido, não começa sozinho.
- Instalação: abre a aba do aparelho (Android, iPhone com os passos do iOS 26 ou do 18 primeiro, computador); botão de um toque quando o navegador oferece (`beforeinstallprompt`); some quando o app já está instalado; navegador interno (Instagram, Facebook, TikTok) ganha aviso, "Abrir no Chrome" no Android e "Copiar link". O projeto não tem analytics, então `appinstalled` só atualiza a página.
- Manifesto com `id`, capturas reais para a instalação rica no Android e no computador, e cor da barra do sistema por tema.
- Vídeos em HyperFrames com as telas reais do app (capturadas com Playwright a 3x sobre a base de exemplo e um histórico de três segundas enviado pelo próprio sync). Movimento de câmera no celular em vez de zoom dentro da tela: nada corta na lateral. Troca de tela em corte seco no toque, como o app faz.
- Sem endereço do site nos vídeos (pedido do Caio): o anúncio leva o link; o fim fecha com a marca e "Comece grátis".
- Som só onde algo acontece (pop no logo, tick no toque, counter no número, chime no fim), sem whoosh, sem música na primeira versão; edição em grade de 120 BPM para receber uma trilha depois.

## Cadastro, foco e plano equilibrado

- O viés para a parte de cima vinha da divisão padrão: ficha A, B, C por grupo com 3 fichas, dois dias de cima para um de perna. Sem foco, o padrão agora é corpo inteiro A e B até 3 dias e superior e inferior com 4 ou mais, com core na semana. A ficha por grupo continua, escolhida à mão.
- Foco com mais de uma escolha: glúteos e pernas (fichas próprias, como antes), costas e ombros, peito e braços, abdômen. Os grupos do foco ganham 4 séries, entram logo depois do primeiro exercício e o teto semanal deles sobe 4. Uma regra garante que nenhum grupo da semana equilibrada sai do plano: o que faltaria troca de lugar com um exercício repetido na semana, fora do foco quando dá.
- Uma pergunta por tela. Faixa de idade (não a data de nascimento) para o ajuste dos 60 anos ou mais. Gênero opcional, com Prefiro não informar e Pular, só soma 2 séries ao teto de quem informa feminino e nunca muda foco nem exercícios (um teste prende isso).
- Articulações a poupar saíram do cadastro: são dado de saúde e ficam em Você, Perfil de treino, só com a permissão separada.
- Menores: o mais simples, bloquear. O aceite dos termos já pede 18 anos ou mais e a faixa de idade começa em 18. Nada de responsável, nada de carga máxima.
- Perfil de treino em Você edita cada resposta numa folha; nada muda até Gerar plano novo e a confirmação. O plano de agora fica no histórico (as rotinas são arquivadas, os treinos ficam).
- Seus dados em Você: o que guardamos e para quê, em português simples, sem base legal. As bases legais da política ficam marcadas para revisão jurídica, e as linhas novas (faixa de idade e gênero) dizem "A definir". A versão dos termos não subiu: depois da revisão, subir a versão pede o aceite de novo a todos.
- Objetivos novos: emagrecer (musculação igual à de ganhar massa, e no peso a referência de 0,5% a 1% por semana) e condicionamento (mais repetições, descanso de 90 s e 60 s).

## Troca de exercício

- O problema: a folha de troca mostrava 5 parecidos e, logo abaixo, a biblioteca inteira.
- Agora: só o mesmo grupo muscular, no máximo 6, cada um com uma linha de porquê, e o link
  discreto "Ver todos de {grupo}" abre a biblioteca filtrada pelo grupo, com busca.
- Ordem: músculo principal, padrão de movimento, equipamento do local, nível. Equipamento
  vem depois do movimento, como pedido: quem treina em casa ainda vê a remada na polia, com
  "mas pede polia", depois das que dá para fazer com o mesmo movimento.
- Nível novo no catálogo (66 iniciante, 21 intermediário, 5 avançado), em docs/CATALOGO.md.
  Exercício acima do nível da pessoa vai para depois e diz "pede mais técnica".
- No empate vale a ordem do catálogo (a variação mais próxima primeiro): o aparelho guarda os
  exercícios por id, em ordem alfabética, e a primeira versão saía com a flexão no topo.

## Como fazer e mídia dos exercícios

- Botão pequeno "Como fazer" no card do exercício e na página do exercício. A folha: loop do
  movimento, 3 a 4 dicas e até 2 erros comuns escritos por nós (92 exercícios), vídeo do
  YouTube só quando o Caio escolher um e ele estiver de pé, senão "Buscar no YouTube"; sem
  internet, só as dicas. Nada de vídeo na tela da série. O descanso continua correndo com a
  folha aberta (teste com o relógio adiantado 10 s).
- Fachada: nada do YouTube carrega até o toque; o player é o youtube-nocookie. Sem miniatura
  do YouTube, para não puxar nada de fora antes do toque.
- 20/10/2026: o Caio prefere imagem a vídeo. A escolha de vídeos fica parada (o caminho continua
  no código, sem nenhum id) e "Buscar no YouTube" só aparece no exercício sem imagem, ou quando
  a imagem não carrega.
- Fonte de mídia: li os termos antes de importar. ExerciseDB V1 gratuito só permite uso não
  comercial (comercial exige plano pago na RapidAPI): o script recusa e para. RepDB gratuito
  permite uso comercial dentro do app com atribuição ("Exercise data by RepDB (repdb.co)"),
  sem redistribuir como dataset e sem usar as imagens em IA generativa. Mapa pronto: 89 de 92;
  sem equivalente: supino inclinado na máquina, tríceps na corda, panturrilha no leg press.
  O script não foi rodado: espera a escolha do Caio.
- Mídia no nosso armazenamento (bucket público midia-exercicios na Supabase), com fonte, autor,
  licença e link da licença por exercício, e cache no aparelho depois da primeira vez.
- Checagem semanal dos vídeos por oEmbed (GitHub Action às segundas): vídeo removido, privado
  ou sem incorporação sai do app. O arquivo só muda quando um vídeo muda, então semana quieta
  não gera commit nem deploy.

## Nome e sobrenome obrigatórios

- Pedido do Caio: saber como se dirigir à pessoa. A primeira tela do cadastro pede nome e
  sobrenome, os dois obrigatórios. Contas antigas, que já têm cadastro e não têm sobrenome,
  veem uma tela única antes do app.
- O app continua chamando pelo primeiro nome (Hoje, menu). O nome completo vira o nome que amigos,
  grupos e convites mostram, e o que aparece no painel de gestão. Em Você, os dois campos editam, e
  nenhum pode ficar vazio.
- Política e Seus dados atualizados ("Nome e sobrenome"). Mais um motivo para subir a versão
  dos termos depois da revisão jurídica.

## Mídia importada do RepDB

- O Caio escolheu o RepDB e pediu para pegar a chave de serviço no painel. Não copiei a chave
  (regra: chave e senha quem digita é ele). A importação rodou dentro da Supabase, por uma Edge
  Function de uso único que já tem a chave no ambiente, protegida por token, e depois foi
  publicada desligada.
- 89 de 92 exercícios com imagem (87 com começo e fim do movimento, que a folha alterna em loop;
  com movimento reduzido, as duas lado a lado). Sem imagem: supino inclinado na máquina, tríceps
  na corda e panturrilha no leg press, que ficam só com as dicas.
- A atribuição que a licença pede, "Exercise data by RepDB (repdb.co)", está em Você, Créditos
  e licenças, com o link da licença; um teste confere.

## Treinos separados do plano, e a semana com a ficha de cada dia

- Bug achado pelo Caio em 20/10/2026: gerar um plano novo arquivava todas as fichas ativas,
  inclusive as criadas pela pessoa. Nada foi apagado: restaurei na
  hora pelo banco. Correção: cada treino tem origem (plano, pessoa, pronta, recebida; migração
  17, coluna anulável, preenchida pelo motivo que o gerador sempre escreveu) e um plano novo só
  arquiva as fichas do plano. Hoje também prefere a ficha do plano quando a pessoa tem um treino
  do mesmo tipo.
- Plano ganhou duas abas em vez de uma sexta aba na barra (cinco já é o limite confortável):
  Semana e Treinos. Treinos: Do seu plano, Seus treinos e Arquivados com Restaurar (ficha de
  plano antigo volta como treino da pessoa). Ficha do plano pode ser duplicada como treino seu.
  O app passou a dizer "treino" onde dizia "rotina".
- Semana: o card dizia "Ficha da vez" em todo dia de academia. Agora a projeção põe a ficha de
  verdade em cada dia (rodízio a partir da próxima, perna fora da véspera de corrida, hoje igual
  à tela Hoje, dias que passaram com o que foi feito), com uma faixa da semana e os próximos 7
  dias com Hoje, Amanhã e a data. O horário aparece uma vez só, quando é o mesmo em todos.
- Trocar exercício na ficha, com os mesmos parecidos do treino (componente único).

## Modo foco, Você em grupos, Semana enxuta

- Ideias do Caio em 20/10/2026. Botão de volume do fone, "Descanso" tocando no iPhone e Live
  Activity: não dá num app web sem tomar o áudio da música (o iPhone só tem um "tocando agora";
  o modo que mistura com a música não ganha controles nem nome). Fica a notificação do fim do
  descanso. Volta à mesa se o Anilha virar app nativo.
- Modo foco no treino, no estilo dos apps de corrida: relógio, série em letra grande e um botão
  Série feita; descanso grande com Pular e +15 s. Ajustar volta à tela completa.
- Você tinha dois botões de ajustes e onze cartões soltos. Agora: Sair no topo e grupos de
  linhas (Seu treino, Conta, Ajuda, Gestão). Privacidade virou página; exportar e importar foram
  para Seus dados; modo retorno foi para Perfil de treino; nome numa folha.
- Semana: a semana aparecia duas vezes (faixa e lista) com alças de arrastar em toda linha.
  Ficou só a faixa, que abre o dia para mudar ou trocar, e uma linha com o próximo treino. Os
  porquês do plano ficam recolhidos.
- Treinos arquivados podem ser excluídos de vez (um ou todos), com confirmação; os treinos já
  feitos com eles ficam no histórico.
- Futuro: modo personal (em espera) e uma conversa por amigo só com as fichas mandadas e
  recebidas, sem texto livre.

## Foguinho, planilha das fichas e ideias que saíram

- Respostas do Caio em 20/10/2026. Login com Google saiu: o código por e-mail basta por
  enquanto e não traz mais um provedor para a política de privacidade. Escolha de vídeos saiu:
  imagem ensina melhor e não carrega nada de fora. Crescimento e números de uso esperam: o app
  ainda está sendo montado.
- Gamificar a constância, nunca a quantidade. O foguinho ao lado da saudação conta os dias
  seguidos em que a pessoa seguiu o plano: treino, corrida ou outro cardio registrado, ou dia
  de descanso do plano. Hoje é descanso num dia de treino pausa: não zera e não soma, para que
  marcar descanso todo dia não faça a conta crescer. Um dia de treino que passa sem registro
  zera. Hoje, ainda aberto, nunca zera; fica cinza até o treino. Aparece a partir de 5 dias.
  Sem notificação, sem aviso de perda e sem recompensa por treinar além do plano. Nada antes
  do primeiro plano conta; cada semana segue o plano daquela semana.
- Planilha das fichas: .xlsx escrito à mão (zip sem compressão e o XML do Excel), sem
  biblioteca nova; cabe em poucos kB. Uma aba por treino em uso, as do plano primeiro;
  exercício, séries, repetições, descanso, aquecimento, observação (bi-set e nota) e quatro
  colunas Semana em branco para anotar a carga no papel ou na planilha. Cabeçalho fixo e página
  deitada para imprimir. Conferida com um leitor independente (openpyxl). No iPhone vai pelo
  menu de compartilhar, como o cartão; o arquivo é montado dentro do toque, sem esperar rede,
  porque o iPhone só abre o menu a partir de um toque.
- 21/10/2026: no iPhone do Caio a planilha não apareceu (o cartão, sim). Duas causas
  prováveis, as duas tratadas: o .xlsx usava texto em linha, que o Numbers e a prévia do
  iPhone não leem (agora tem a tabela de textos compartilhada e as propriedades, como o Excel
  grava); e o menu de compartilhar pode recusar o tipo da planilha (agora tenta o tipo
  genérico e, se nada passar, abre na prévia do sistema, que tem o botão Compartilhar). Toda
  falha de salvar no iPhone vai para os erros do painel. O botão também ficou em Seus dados.

## Conversa de fichas entre amigos

- Ideia do Caio (20/10/2026), liberada em 21/10/2026: uma conversa por amigo sem poder digitar,
  só vendo as fichas mandadas e recebidas. Fica em Amigos, no amigo, Fichas entre vocês.
- Sem campo de texto em lugar nenhum da conversa: responder é mandar uma ficha, escolhendo um
  dos seus treinos. O recado que já existia no envio pelo treino continua, dentro da ficha.
- Uma função nova no banco (routine_thread, migração 18): as últimas 60 fichas entre os dois,
  sem as da equipe, só entre amigos e sem bloqueio. Ler não muda nada; aceitar e recusar usam
  as mesmas funções de antes.

## Imagens próprias dos exercícios

- 21/10/2026, pedido do Caio: os 3 exercícios sem imagem (o RepDB não tem) ganharam imagens
  feitas em 3D como o motion, no formato das outras (512 por 512, fundo azul-claro, início e
  fim, regata azul, short escuro, tênis branco, sem rosto). Biomecânica: supino com as costas
  no encosto e empurrando na linha dele; tríceps com o cotovelo parado junto ao corpo e as
  pontas da corda abrindo no fim; panturrilha com as pernas paradas e só o tornozelo mexendo.
- Ficam no próprio app (`/midia/...`), não no bucket: são nossas, e a política de conteúdo
  já aceita imagens do próprio site. Créditos: fonte "Anilha".

## Assistente (agente)

- Ideia do Caio (21 e 22/10/2026): pedir mudanças em palavras ("mais perna e glúteo", "quero ABCD") e aceitar uma proposta, em vez de procurar o campo certo. Em teste só para admins (`agent_begin_turn` confere no banco); depois, para todos.
- Modelo: Claude Haiku 5.5, esforço médio, escolhido numa comparação com o Gemini 3.5 Flash-Lite e o Haiku com esforço alto nos mesmos 30 pedidos (`scripts/agente-avaliar.ts`): o Haiku acertou a ferramenta nos 30 e sai mais barato; o esforço alto não mudou nada. O Flash-Lite respondia só com texto em parte dos pedidos.
- O modelo não monta treino: ele escolhe a ferramenta e o gerador faz o trabalho (`src/agent/execute.ts`). As ferramentas rodam no celular, com os dados do aparelho; a função `agente` só confere conta e limite (60 chamadas por dia) e chama o modelo com instruções e ferramentas fixas, geradas de `src/agent` (um teste falha se divergirem). A conversa não fica no servidor.
- Exercícios só do catálogo (enum dos 92 ids) e todos os campos das ferramentas obrigatórios, com null para o que não muda: o Haiku pulava campos opcionais e dizia no texto que tinha feito.
- Nada muda sem Salvar. O cartão mostra o antes e depois: no plano, campo por campo do perfil de treino ("mantém" ou "muda"); na ficha, o que entra, muda e sai; o volume por semana e os avisos. "Voltar ao anterior" regrava cada linha como estava (`applyWithUndo`).
- Avisos de risco vêm de regras com fonte (`src/engine/risks.ts`): teto de volume do gerador e nível de manter, num aviso só por tipo. O modelo explica, não inventa aviso.
- Toda conversa termina com uma mensagem para a pessoa; se o modelo não fechar em 4 rodadas, o app escreve uma.
- Frases de status por etapa real (lendo, ou a ferramenta que rodou), sorteadas sem repetir; a resposta aparece com efeito de digitação, que só mostra o texto que já chegou. Sem ícone de brilho nem cara de IA.
- Fila de pedidos (`agent_requests`): um resumo por pedido, com nível (o app resolveu, feito à mão, não conseguiu) e resultado. No Painel, aba Assistente, agrupada; marcar "feito" manda um aviso no sino para quem pediu.

## Auditoria e popup do assistente (22/10/2026, Codex)

- Pedido do Caio: auditar desempenho, UI/UX e bugs; transformar a entrada do assistente em popup parecido com o feedback widget do beui.dev. Tudo na branch `codex/auditoria-agente-popup`, sem implementar na main.
- O botão flutuante abre um dialog no canto, com Harbor UI, carregamento sob demanda, Escape e retorno de foco. Minimizar preserva conversa, rascunho e desfazer. A rota antiga continua funcionando.
- Correções de isolamento entre contas, proteção do desfazer e das propostas, validação das ferramentas, carga extra herdada e consulta semanal de séries estão detalhadas em `docs/AUDIT_2026-10-22.md`.
- O Caio pediu registro de todas as intervenções e revisão mútua permanente: Codex audita Claude e Claude audita Codex. As regras estão em `AGENTS.md` e `CLAUDE.md`; o estado atual e as validações ficam em `docs/AI_HANDOFF.md`. A revisão desta intervenção pelo Claude está pendente.
- Progressão com cargas variadas e repetição de consultas ao iniciar treino ficam registradas para revisão, sem mudança de regra nesta intervenção.

## Revisão do Claude sobre a auditoria do Codex (22/10/2026)

- Pirâmide e séries com cargas diferentes: cada série fica com a sua carga e só a mais pesada sobe ou desce, voltando ao piso da faixa. Antes, uma carga só ia para todas: 40/30/20 kg virava 42/42/42, e numa crescente 20/25/30 a primeira série já começava com 30 kg, mesmo sem progressão. Recusar a sugestão volta cada série ao que era. O texto diz "Suba a série mais pesada para...". Escolha conservadora do app, como a progressão de 22/10.
- Popup do assistente: a resposta volta a aparecer digitada, como o Caio pediu. Digita uma vez só: minimizar e reabrir mostra a resposta inteira, e a proposta entra na tela depois do texto.
- Detalhes, evidências e o que ficou para o Codex revisar em `docs/AI_HANDOFF.md`.

## Integração e teclado do assistente (22/10/2026, Codex)

- O Caio autorizou integrar o trabalho das duas branches na main e publicar. As correções foram desenvolvidas e testadas antes em `codex/integracao-teclado-publicacao`.
- O popup acompanha a área visual que sobra quando o teclado abre (`VisualViewport`), incluindo deslocamento e safe areas, sem reiniciar a conversa. A regressão simula a geometria do iOS; o teste em aparelho físico continua pendente.
- Ao recusar progressão numa pirâmide já iniciada, cada série pendente conserva sua posição histórica, sem modificar concluídas ou aquecimentos. Não muda a regra de só progredir a maior carga.
- A função Supabase do agente é publicada separadamente do frontend. Esta integração não muda esquema de banco nem cria uma branch Supabase. Resultados e limitações em `docs/AI_HANDOFF.md`.

## Waltér e teclado após feedback em vídeo (22/10/2026)

- Nome pedido pelo Caio: Waltér, trocadilho com halter. Botão Falar com Waltér; o nome aparece na conversa e no prompt, sem mudar as regras de treino ou o salvamento explícito das propostas.
- O vídeo do aparelho mostrou o popup reduzido ao campo durante a digitação. A geometria agora usa altura e posição do VisualViewport diretamente; não mistura innerHeight com o espaço de posicionamento do dialog. Em pouco espaço, o popup usa folgas pequenas e deixa o corpo rolar.
- Propostas no popup rolam só a conversa, preservando a página ao fundo. Os testes incluem a janela reportada menor e viewport visual deslocada, rotação, envio e reabertura. WebKit no computador não substitui testar o teclado no iPhone físico.

## Waltér aberto para todos (09/11/2026)

- Pedido do Caio: liberar o Waltér para todos os usuários. O botão aparece para qualquer conta depois do cadastro, e o selo "Em teste" virou "Beta".
- Migração 20 (`20261109000020_agent_everyone.sql`), aplicada em produção antes do push: `agent_begin_turn` não confere mais a tabela de admins. O limite continua 60 chamadas por pessoa por dia (um pedido usa duas ou três). A fila de pedidos no Painel continua só para a equipe.
- Fica para a revisão jurídica, que o Caio quer fazer de uma vez: base legal do assistente (contexto do treino enviado à Anthropic) e os pedidos do assistente em "Seus dados".
