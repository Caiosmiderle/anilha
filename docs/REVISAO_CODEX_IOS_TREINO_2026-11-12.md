# Parecer Codex: iOS etapa 3B, execução e envio

Autor: Codex. Data: 12/11/2026. Branch recebida: `codex/ios-treino`, base `c32ca5b` (0.2.0). Checkout inicialmente limpo. Intenção: executar ficha existente offline e gravar na mesma conta do PWA. Revisão do Claude desta entrega: **PENDENTE**.

Implementação no checkout, versão **0.3.0**. Sem escrita em `.git`, branch nova, commit, push, merge, deploy ou acesso a dados de produção, conforme pedido expresso do Caio. Nenhuma migração, coluna ou RPC criada ou alterada. `../crunning-app` foi consultado só para referência de interação, e `../Treinapp` não foi alterado. Nenhuma dependência adicionada.

O aceite completo da etapa depende de CI e iPhone. O Caio informou que a parte A compilou no CI, instalou e permitiu login e consulta com conta real. Isso é evidência relatada da 0.2.0, não teste desta 0.3.0 nem execução feita pelo Codex.

## Política antes de gravar

Análise completa em [POLITICA_SYNC_IOS.md](POLITICA_SYNC_IOS.md), escrita antes da implementação das mutações. Fontes: `src/data/ops.ts`, `src/data/store.ts`, `src/sync/sync.ts` e migrações 3, 7, 10, 12 e 21.

- Escrita local e fila na mesma transação; UUID do cliente, `user_id` da conta, `updated_at` inteiro em ms, monotônico. Fila compactada por tabela e ID. O carimbo local persiste entre aberturas.
- A RPC vigente usa **`cur.updated_at <= excluded.updated_at`**, não comparação estrita. Igual reaplica os campos enviados e pode gerar nova sequência, sem duplicar o ID. Colunas ausentes não são zeradas. Mais velha é stale. Cada linha resolve o conflito separadamente, sem merge da sessão inteira.
- No pull, só uma edição COM fila e estritamente mais nova é preservada. Empate ou versão remota maior remove a fila e aplica o servidor. ACK só retira a versão enviada se não houve edição durante a requisição.
- `deleted` é lápide; a retenção de 30 dias usa `updated_at`. `horizon` e cursor são sequências do servidor. `sync_ids` permite limpar ausentes, preservando fila e linhas de catálogo com carimbo zero. A recuperação ocorre uma vez no começo do ciclo, sem apagar toda a base.
- Rejeição sai da fila enviável, como no PWA, e fica como marca local visível, sem registrar payload/SQL em logs. Pull posterior ainda pode substituir a linha. A saída avisa tanto pendências quanto rejeições.
- JWT, conta e geração são capturados. Resposta tardia não confirma fila nem grava na conta seguinte. Não há pedido de alteração do protocolo de produção.

## Revisão da base e achados

Conferidos status, branch, últimos cinco commits, fontes Swift da parte A, fluxo web e diff desta intervenção. Não existe commit posterior do Claude com outra implementação de treino a auditar nesta branch. A parte A é do próprio Codex; a revisão mútua desta parte B continua para o Claude.

| Prioridade                  | Arquivo e cenário                                                          | Evidência e classificação                                                                                                                                                                               | Tratamento                                                                                                                                                       |
| --------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 na evolução para escrita | `ContaStore.swift`, recuperação antiga de horizonte usava `cache.apagar()` | Confirmado por leitura da base c32ca5b. Adequado ao cliente só de leitura da parte A; se reaproveitado com fila, perderia treino offline. Hipótese de regressão na evolução, não perda real reproduzida | Substituído por `sync_ids`, preservando pendentes; teste Swift preparado                                                                                         |
| P2                          | `HistoricoView.swift`, sessão ativa criada no próprio iPhone               | Texto da base atribuía toda sessão ativa ao PWA. Confirmado estaticamente                                                                                                                               | Agora diz apenas treino em andamento; abre execução/resumo                                                                                                       |
| P1 preventivo               | `CacheLeitura.swift`, entrada de `records` na lista de pull                | A parte A já atravessava essas sequências sem guardá-las. Só incluir a tabela deixaria dados antigos ausentes. Confirmado pelo desenho do cursor                                                        | Releitura desde zero uma vez, preservando linhas/fila. Guarda cursor anterior até conferir retenção para não conservar fantasmas purgados. Teste Swift preparado |

Nenhum incidente de perda de dados, vazamento ou bug de runtime iOS foi reproduzido aqui. Não transformar a revisão estática em prova de execução.

## O que mudou

`AnilhaCore/Progression.swift` porta as decisões numéricas de `suggestNext`, pré-preenchimento por posição e valores anteriores: confirmação do topo, margem clara, esforço, salto mínimo em kg/lb, repetições antes de salto grande, destreino, redução, tempo, peso corporal e cargas variadas. As frases da tela são curtas; os valores e decisões vêm das regras portadas, sem regra nova.

`Workout.swift` porta a montagem e as mutações das mesmas linhas do PWA: sessão ativa única, exercícios ordenados, aquecimento obrigatório simples/progressivo, cargas de aquecimento com fallback, semana leve aceita, logs só de sessões concluídas fora de deload, editor com fallback na última série feita e arredondamento da unidade, bi-set, descanso após a rodada, mover mantendo o par, pular e substituir preservando o já feito. O contador usa `rest_started_at + rest_duration_sec * 1000`, sem depender de ticks em segundo plano. Concluir mantém o planejado, marca itens, cria lápides das séries pendentes e gera recordes pelas regras existentes. O nativo confirma conclusão e recordes juntos no armazenamento local.

O catálogo gerado agora inclui também `bodyweight`, `progression_hint`, `pattern` e `compound`. Não há catálogo paralelo nem alteração no motor TS.

`AnilhaCache` mantém envelopes SwiftData e acrescenta fila e rascunho local, sem tabelas remotas novas. Uma entrada de rascunho por dono/série, salva em cada ajuste e removida na gravação da série. Autosave e CloudKit continuam desligados. Falha de gravação dá rollback e mensagem de erro. A fila é persistente, compactada, em lotes de 200. Reenvia a mesma linha/ID, confirma só o carimbo enviado, depois faz pull paginado de 500 e salva cursor com a página.

`ContaStore` sincroniza ao concluir, ao abrir/voltar ao primeiro plano, ao puxar para atualizar e ao restabelecer rede via `NWPathMonitor`. Alteração durante sync pode pedir outro ciclo. Falha preserva fila e cache. Sair pede confirmação explicando que pendências/rejeições seriam apagadas. Keychain, sessão e invalidação de geração da parte A foram preservados.

Hoje e Ficha agora iniciam ou retomam a sessão real. A execução tem progresso, próxima série, aquecimento, sugestão, valores anteriores, steppers e entrada numérica, registro em um toque quando há valores válidos e esforço após série de trabalho. Permite trocar, mover ou pular exercício e ajustar/pular descanso. Conclusão mostra planejado e realizado por exercício, inclusive substituição, séries e cargas. Histórico e Feito hoje reabrem o resumo.

O visual usa `Tema` e cartões Harbor. Referências CRUNNING lidas: `App/Telas/Corrida/PainelTreino.swift` e `App/Telas/Plano/CartoesPlanoHoje.swift` (o segundo estava em `Plano`, não em `Corrida`). Referência de progresso, destaque da etapa atual e ação principal, sem copiar regras de corrida.

`DescansoLocal` usa apenas `UNUserNotificationCenter`, com autorização por ação explícita. Um identificador substitui/cancela o aviso anterior; operações serializadas evitam que um add atrasado restaure um aviso cancelado. Reabrir reconcilia com o fim persistido. Pular, concluir, sair e preferência `reminders.rest == false` cancelam. Há banner/som também em primeiro plano. Conteúdo genérico, sem carga ou dados pessoais. Sem push remoto, entitlement, extensão ou Live Activity.

## Paridade e interoperabilidade preparadas

`scripts/generate-ios.mjs` gera catálogo, recursos anteriores e novos `training.json`/`session.json`. `ios-training-source.ts` chama diretamente TS, incluindo progressão, aquecimento, retorno, bi-set, editor, ordem, prescrição de semana leve e recordes. Não codifica resultados esperados à mão. Há 819 vetores de progressão/recordes, 120 de aquecimento, 12 de retorno, 16 de bi-set, 18 de editor, seis de ordem e 16 de prescrição.

`ios-session-source.ts` usa IndexedDB fictício e as funções reais `startSession`, `completeSet`, `substituteExercise`, `skipItem`, `finishSession`. Produz uma ficha sintética com aquecimento, séries feitas, troca para exercício por tempo e lápides. Normaliza apenas `updated_at` para um ms fixo no teste de formato; relógio e ACK têm testes próprios. IDs, campos, nulos, vínculos e dados de domínio permanecem os escritos pelo PWA. Perfil e fuso são fictícios e determinísticos.

Os testes Swift comparam os mesmos vetores e a sessão montada em Swift, incluindo início e resultado final, e também o lote efetivamente retirado da fila SwiftData. Apenas os carimbos são normalizados para comparar o formato; a exportação ao E2E conserva os carimbos reais da fila. Cobrem fila/relógio, isolamento, ACK durante edição, rejeição, conflito/empate, lápides, purga, rollback, rascunho único e reabertura de arquivo em disco com descanso e fila. Há **20 métodos Swift no pacote**, incluindo os anteriores. Não executados neste Windows.

O E2E `tests/e2e/ios-treino.spec.ts` envia pela RPC, reenvia, confere pull, lê o IndexedDB real do PWA, confere unicidade por ID e campos, simula edição mais nova na sessão e uma lápide. API, Postgres embutido e navegador locais. No Windows usa a fixture gerada pelo PWA. Isso prova o contrato do payload e o consumo web, **não a execução do código Swift**.

No CI, `swift test` continua antes do archive e emite sua própria montagem para o caminho absoluto `ANILHA_NATIVE_PAYLOAD`. A etapa seguinte exige esse JSON e o usa no mesmo E2E. Se estiver ausente ou houver divergência de paridade, o job deve falhar antes do archive. Nenhum sucesso desse caminho foi observado nesta intervenção.

## Validações reais

| Comando/check                                                                                | Resultado neste checkout                                                                 |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `node scripts/generate-ios.mjs` e `node scripts/generate-ios.mjs --check`                    | Passaram, inclusive após os últimos vetores                                              |
| `npm run lint`                                                                               | Passou, inclui varredura Swift/textos                                                    |
| `npm run typecheck`                                                                          | Passou                                                                                   |
| `npm run build`                                                                              | Passou, Vite e PWA locais                                                                |
| `npm test -- --maxWorkers=1 --no-file-parallelism`                                           | **791 testes em 64 arquivos passaram**, saída 0                                          |
| `npm test -- src/engine/__tests__/iosArtifacts.test.ts --maxWorkers=1 --no-file-parallelism` | **4 testes passaram** após ampliar os vetores, saída 0                                   |
| `npx playwright test -c playwright.node.config.ts tests/e2e/ios-treino.spec.ts`              | **1 cenário móvel passou**, saída 0; API pelo `scripts/local-api-node.mjs`, sem produção |
| `git diff --check`                                                                           | Passou                                                                                   |
| `swift test --package-path ios/AnilhaCore`                                                   | Não iniciou: `swift` não está instalado, saída 1 do PowerShell                           |

Falhas intermediárias corrigidas: o primeiro gerador usou IDs de exercícios com separador incorreto, corrigidos para IDs reais do catálogo; typecheck acusou `reason` ausente na ficha sintética e anotação de tipo no E2E, corrigidos. A primeira execução E2E falhou ao procurar o indicador de sync na tela Histórico, onde ele não existe; a espera agora acontece em Hoje. A primeira execução enviava e lia a sessão antes dessa falha, mas só a segunda execução completa é relatada como aprovada.

Revisão estática final também corrigiu os timestamps de domínio: `Date.timeIntervalSince1970 * 1000` pode ter frações, enquanto o PWA usa ms inteiros e essas colunas SQL são `bigint`. Início, conclusão e relógio do descanso agora passam por `floor`, além do `updated_at` já inteiro. Asserções Swift com horário fracionário foram preparadas; não houve rejeição real no iOS reproduzida aqui.

Neste Windows o runner esperou os servidores após o resultado do navegador. Conferidos por `netstat -ano` os processos desta execução nas portas 54329/4173 e encerrados apenas esses dois; runner então terminou com saída 0. A consulta via `Get-CimInstance` estava sem permissão; não foi necessária para o encerramento por PID/porta. Não houve encerramento geral de processos. Uma tentativa de contar vetores com `node -e` falhou por aspas do PowerShell, sem efeito nos artefatos.

Nenhuma validação local é validação de produção. Sem Xcode, simulador, build macOS, novo IPA instalado ou interação visual do iOS nesta intervenção. O E2E passou antes dos últimos ajustes exclusivamente Swift; o fixture de sessão e o comportamento web testado não mudaram depois.

## Roteiro no CI e iPhone

1. Claude deve revisar o diff, gerar e conferir recursos, rodar os 20 testes Swift, observar o E2E com o payload exportado pelo Swift e só então archive. Conferir Swift 6, concorrência estrita, iOS 26, versão 0.3.0 e nenhuma extensão. Corrigir e registrar qualquer diagnóstico real; não presumir compilação pelo resultado da parte A.
2. Instalar **por cima da 0.2.0**, mantendo o bundle ID. Conferir migração automática do SwiftData, conta e cache existentes, releitura de `records`, modo avião e ausência de limpeza indevida. Testar também instalação limpa com conta de teste.
3. Baixar uma ficha real da conta de teste; comparar ordem, séries, faixa, último valor, aquecimento e sugestão com o PWA. Cobrir primeira vez, carga variada, kg/lb, tempo, iniciante, retorno e semana leve aceita. Bi-set deve alternar, aquecer antes e descansar só ao fechar a rodada.
4. Modo avião: começar em Hoje e depois repetir pela Ficha. Ajustar carga/repetições, minimizar e reabrir a mesma série. Não pode criar sessão nem rascunho duplicado. Registrar em um toque, escolher esforço; conferir persistência após encerrar o app.
5. Autorizar aviso local, registrar série e bloquear o iPhone. Esperar o fim. Reabrir durante o descanso e conferir que o restante vem do relógio persistido. Encerrar/reabrir, somar 30 s, pular, concluir e sair; nenhum aviso antigo deve reaparecer. Repetir com permissão negada, Foco e preferência de descanso desligada no PWA.
6. Trocar exercício antes e depois de uma série feita, inclusive de repetições para tempo. O feito mantém exercício original; o restante ganha nova prescrição. Mover para o fim/agora preservando o par e pular outro exercício. Concluir antecipado e conferir planejado/feito, pulados e não feitos.
7. Ainda offline, concluir, fechar e reabrir. Resumo deve estar no Histórico, fila deve continuar pendente. Tentar sair: aviso explícito de perda, cancelar. Restaurar rede e deixar sincronizar; repetir atualização e abertura. Na mesma conta do PWA, conferir **um ID de sessão**, mesmas séries/cargas/repetições/esforços, horários, aquecimento e lápides. Não usar dados reais em capturas ou logs públicos.
8. Conta de teste: editar a mesma sessão no PWA e no nativo com relógios controlados em ambiente local. Cobrir ms maior, menor, igual, reenvio e lápide. Conferir regra por linha, não uma promessa de merge global. Forçar falha de transporte depois de o servidor aceitar: retry mantém IDs e não duplica.
9. Testar saída durante refresh/push/pull, troca de conta, perda de acesso ao Keychain, falha de gravação e reabertura. Nenhuma resposta da conta antiga pode recriar dados. Na saída confirmada, fila/rascunhos/cache devem ser apagados e aviso cancelado.
10. Em ambiente local, exercitar mais de 200 linhas no push e 500 no pull, rejeição de uma linha, horizonte avançado e interrupção entre limpeza e página. Conferir pendentes preservados. Nunca usar testes destrutivos em produção.
11. Conferir claro/escuro, maior Dynamic Type, VoiceOver, teclado numérico, steppers e controles com uma mão no iPhone. Comparar com Harbor, sem declarar o layout aprovado pela inspeção de fonte.

## Limites e pendências

- Revisão do Claude, compilação/concorrência no CI e aceite offline/sync no iPhone **PENDENTES**. Não marcar etapa 3 concluída antes do roteiro principal passar.
- A tela Hoje continua sendo agenda/rotação da parte A. O recomendador completo de fadiga/ajustes não foi portado; iniciar uma ficha executa essa ficha. Não foi inventado um ajuste de treino no nativo.
- As explicações da progressão estão resumidas na UI; valores, limiares e pré-preenchimento têm paridade preparada. Edição completa do histórico e criação/edição de fichas continuam no PWA. Não há desfazer série concluída nesta tela nativa.
- Falhas reais de disco, migração do arquivo da 0.2.0, ciclo de vida do iOS, entrega de notificação com o app encerrado e UI/acessibilidade dependem de runtime Apple. O teste de reabertura escrito não equivale a encerrar o processo do iPhone.
- Rejeição aparece genericamente e bloqueia a promessa de tudo enviado; não há editor específico para corrigir payload recusado. A marca é local, nova edição da mesma linha pode recolocá-la na fila. O usuário deve conferir antes de apagar dados locais.
- LWW depende do relógio do cliente e resolve linhas isoladamente. Essas limitações já existem no PWA; qualquer mudança no protocolo exige proposta e OK do Caio, sem migração silenciosa.
- Sem commit/push autorizado nesta intervenção. Próximo assistente continua em `c32ca5b` mais este diff local, não há hash remoto novo.

## Fontes externas consultadas

[Changelog Supabase](https://supabase.com/changelog.md), [RPC Swift](https://supabase.com/docs/reference/swift/rpc), [agendamento e cancelamento local Apple](https://developer.apple.com/documentation/usernotifications/scheduling-a-notification-locally-from-your-app.md) e [ModelConfiguration](https://developer.apple.com/documentation/swiftdata/modelconfiguration). SDK Supabase 2.55.6 da parte A preservado. Nenhuma chamada ao Supabase de produção foi usada para esta análise. Os contratos específicos de sync vêm do SQL versionado, não da documentação genérica do SDK.
