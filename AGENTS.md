# Trabalho compartilhado entre Codex e Claude

Estas regras são pedidos do Caio e valem para todo o repositório.

## Antes de trabalhar

1. Leia `docs/AI_HANDOFF.md` e o relatório de auditoria nele indicado.
2. Confira branch, alterações locais e últimos commits. Preserve trabalho existente.
3. Nunca implemente na `main`. Crie uma branch com nome descritivo antes de editar.
4. Leia `README.md`, `docs/ARCHITECTURE.md` e as decisões recentes de `DECISIONS.md` quando o escopo exigir. O histórico contém decisões antigas já substituídas.

## Revisão mútua obrigatória

- Codex audita o trabalho anterior do Claude; Claude audita o trabalho anterior do Codex.
- Confira o diff e o comportamento, com foco em bugs, perda de dados, privacidade, desempenho e UI/UX. Não aprove só pela descrição do outro agente.
- Registre achados com arquivo, cenário de reprodução, prioridade e evidência. Diferencie bug reproduzido de hipótese.
- Corrija problemas confirmados na branch e rode os testes relevantes. Não publique nem faça merge na `main` sem autorização do Caio.
- Marque a revisão do outro agente como pendente até ela realmente acontecer. Revisão por subagentes do mesmo assistente não substitui a revisão mútua solicitada.

## Registro e entrega

- Atualize `docs/AI_HANDOFF.md` em toda intervenção: autor, data, branch, intenção, alterações, validações reais, pendências e o que o outro agente deve revisar.
- Para auditorias maiores, mantenha um relatório separado em `docs/` e referencie-o no handoff.
- Registre também falhas e limitações dos testes. Não apresente testes locais como validação de produção.
- Não registre senhas, tokens, chaves privadas ou dados pessoais reais.
- Faça commit na branch antes de encerrar quando solicitado. Quando o Caio autorizar enviar a entrega ao GitHub, faça também push da branch e informe URL e hash. Push de branch não autoriza merge, deploy ou publicação na main. Se o envio falhar, registre a falha e não diga que o conteúdo já está acessível remotamente.

## Passagem entre cloud e computador local

- GitHub e os arquivos versionados são a passagem entre Codex e Claude, inclusive quando trabalham em ambientes diferentes. Não dependa apenas do contexto do chat ou da memória do assistente para explicar a entrega.
- No checkout recebido, leia o handoff mais recente e confira branch, commit de origem e alterações locais. Não presuma um caminho de Windows, acesso ao computador do Caio, emulador, conta autenticada ou arquivos ignorados pelo Git.
- Quando houver pacote portátil de evidências, leia seu README e manifesto; restaure pelos scripts documentados e confira a integridade antes de usar os arquivos. Registre materiais ausentes e limites; não invente evidência nem trate restauração de arquivos como nova execução do aplicativo.
- Deixe no repositório o parecer completo, achados com evidência, alterações, comandos e resultados dos checks, falhas, testes não executados e pendências. Atualize `docs/AI_HANDOFF.md` para o próximo assistente saber o que conferir e de qual commit continuar.
- Quando commit/push estiverem autorizados para a passagem, conclua ambos na branch de trabalho e informe o hash remoto e a URL. Sem push confirmado, diferencie claramente o que ficou apenas no checkout local. Preserve credenciais e dados pessoais fora dos registros e pacotes.

## Verificação local

- `npm run lint`, `npm run typecheck`, `npm run build`.
- Em máquinas com pouca memória, rode os testes com `npm test -- --maxWorkers=1 --no-file-parallelism`; abrir vários PGlite ao mesmo tempo já esgotou a memória deste ambiente.
- Os testes Playwright usam API e banco locais. Nunca aponte testes destrutivos para produção.
- Evite novos pacotes e refatorações amplas sem necessidade demonstrada. Preserve o Harbor UI e as regras determinísticas do motor.
