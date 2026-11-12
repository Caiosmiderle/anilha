# Roteiro de teste do Anilha no iPhone

O CI compila, roda os testes e tira prints no simulador, mas não usa o seu iPhone nem a sua conta. Tudo aqui está **não verificado** até você fazer o roteiro e me contar o resultado. Um print de cada problema resolve quase tudo. Não precisa fazer tudo de uma vez: cada bloco é independente.

O que já foi automatizado, e o resultado, está no fim deste arquivo e no `PROGRESSO.md`.

## 0. Instalar

1. Baixe o `.ipa` mais recente (link no `PROGRESSO.md`, seção Feito).
2. Sideloadly no PC, iPhone no cabo, mesmo Apple ID do CRUNNING, instalar por cima. Os dados ficam.
3. Abra o app. Se pedir, entre com a mesma conta do site.

## 1. Hoje (5 minutos)

1. A aba Hoje mostra o treino do dia (o mesmo do site), a semana com halteres de força e as corridas do CRUNNING.
2. "Falar com o Waltér" abre a conversa **no app** (não no site).
3. Calendário: abra pelo Hoje. Os dias com musculação e com corrida batem com o site.

## 2. Treino de verdade, na academia

1. Comece o treino do dia. A tela de foco mostra um exercício por vez, com poucos botões, tempo do treino e a dica do Waltér quando houver.
2. **Sugestão do motor:** no exercício com sugestão ("Subir para ..."), toque em **Ignorar**. A sugestão some só nesse exercício e, se era subir ou descer carga, as séries voltam para os valores da última vez. Feche o app e abra de novo: continua ignorada.
3. Faça uma série, toque em concluir, marque o esforço.
4. **Descanso com baralho:** no descanso, abra o jogo. Teste blackjack e pôquer:
   - as cartas são distribuídas e viram, as fichas descontam a aposta, aparece o resultado (verde, vermelho ou empate) e o celular vibra;
   - **feche a mesa no meio de uma mão**, faça a próxima série e abra o jogo no próximo descanso: a mão, as fichas e o histórico continuam de onde pararam;
   - teste no modo escuro (Central de Controle) e com o iPhone sem internet.
5. Termine o treino. O resumo aparece; abra a **análise** (para a sua conta é o Opus; demora até 2 minutos).
6. Confira no site que o treino chegou igual (cargas, repetições, esforço).

## 3. Sem internet (5 minutos)

1. Ligue o modo avião.
2. Faça uma série de um treino ou edite uma ficha (bloco 5).
3. O app mostra que há mudanças esperando. Nada some.
4. Desligue o modo avião, espere uns segundos e confira no site: a mudança chegou uma vez só.

## 4. Chat do Waltér

1. Peça: "quero descansar dois minutos na puxada". Ele mostra a proposta com antes e depois.
2. **Salvar**: a ficha muda (confira no Plano e no site). **Desfazer**: volta.
3. Peça uma ficha nova inteira ou um plano novo: ele avisa que isso ainda é pelo site.
4. Sem internet, o chat avisa e não perde o que você escreveu.

## 5. Plano e fichas

1. Aba Plano > Semana: os próximos dias com a ficha de cada um, igual ao site. Mude de semana com as setas.
2. Fichas > **Nova ficha**: nome, divisão, exercícios pelo catálogo, séries, repetições e descanso. Salve e confira no site.
3. Abra uma ficha > **Editar**: reordene, remova um exercício, mude o descanso. Salve, confira no site.
4. Apague uma ficha de teste (pede confirmação).
5. **Exercícios** (botão no canto do Plano): busca, filtro por grupo e "só máquinas"; abra um exercício e veja "como fazer" com as imagens; cadastre um exercício próprio e use numa ficha.

## 6. Você

1. Perfil de treino: suas respostas aparecem; mude o modo retorno e confira no site.
2. Ajustes de conta e sair/entrar de novo: os dados voltam.

## 7. Histórico e progresso

1. Histórico: treinos, progresso, semanas e corpo, como no site.
2. Abra um treino antigo: as séries batem com o site.

## 8. No site (computador ou celular)

1. **Corridas repetidas** (Histórico > aviso "corridas repetidas", quando houver): juntar, desfazer e "não é repetida".
2. **Seus dados:** exportar (baixa um arquivo com tudo) e, só se quiser de verdade, apagar a conta.

## O que me contar

- O que não bateu entre iPhone e site (qual tela, qual dado).
- Se a mesa do baralho voltou de onde parou.
- Se alguma mudança feita sem internet sumiu ou chegou duas vezes.
- Qualquer travamento, tela branca, texto cortado (principalmente em letra grande) ou botão difícil de tocar.

## Resultado do que foi automatizado

Preenchido pelo Claude a cada build; o resumo também fica no `PROGRESSO.md`.

| O quê | Onde roda | Resultado |
| --- | --- | --- |
| Testes do motor, análise, revisão, memória, calendário, duplicados, "como fazer", chat (TypeScript) | CI iOS | pendente |
| Paridade TS e Swift, fila de gravação, desfazer, chat e baralho (Swift) | CI iOS (`swift test`) | pendente |
| Payload do iPhone no servidor e PWA locais: treino, análise, revisão, calendário (e2e) | CI iOS (Playwright) | pendente |
| Prints de todas as telas, claro e escuro, mais baralho em tela pequena | CI iOS (simulador) | pendente |
| Site: unitários, e2e e sincronização sem internet | PC (`npm test`, Playwright) | pendente |
