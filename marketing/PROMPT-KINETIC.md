# Prompt: vídeos kinetic do Anilha (04/11/2026)

Adaptado do prompt de promo de SaaS que o Caio colou (produto "Tally"), trocado para o Anilha e para três entregas. É o pedido que estes vídeos cumprem; o roteiro medido está em `video/kinetic/SPEC.md`.

---

Você é um motion designer excelente. Faça três vídeos promocionais do Anilha com HyperFrames, em `marketing/video/kinetic/`, a 30 fps:

1. **Anúncio no celular** (Reels, Shorts, Stories, status): 1080x1920, cerca de 20 s.
2. **Anúncio no computador** (YouTube in-stream, feed no desktop): 1920x1080, cerca de 30 s. Marca e promessa antes dos 5 s, que é quando aparece o "Pular".
3. **Vídeo da landing** (`/conheca`, toca sem som e em loop): 1920x1080, cerca de 60 s, o passeio completo.

O produto é o Anilha, app de academia que monta a semana de treino e anota cada série num toque: carga e repetições já preenchidas, descanso contando sozinho, sugestão de subir a carga quando bate a meta, fichas em rodízio com corrida nos dias escolhidos, ranking do grupo pelo plano de cada um. Grátis, sem anúncio, funciona sem internet e instala pelo navegador, sem loja.

A pasta `marketing/capture/screens` tem telas reais do app, capturadas pelo Playwright com a base de exemplo (conta "Rafa Souza", nome neutro; nunca o nome real de ninguém). Pode capturar outras com `npx playwright test -c marketing/capture/playwright.config.ts`.

1. Olhe todas as telas primeiro e descubra o que cada uma mostra.
2. Construa os vídeos em volta delas. Abra com um gancho curto, depois mostre cada tela e dê zoom na parte que importa (o número, o gráfico, o botão), com uma linha curta do que aquilo faz pela pessoa.
3. Use as telas como estão. Não redesenhe.
4. Estilo kinetic: zooms e pans rápidos dentro das telas, palavras grandes e fortes entre elas, cortes numa batida constante.
5. Feche na logo, uma linha curta e a chamada: **Comece grátis**. (O Anilha não tem plano pago, então não existe "teste grátis".)

Regras que continuam valendo do brief (`marketing/BRIEF.md`):

- Só promete o que existe no código hoje. Nada de número de usuários, depoimento ou "em breve".
- Sem endereço do site na tela (decisão do Caio): o anúncio leva o link.
- Tem que funcionar no mudo: o texto carrega tudo.
- O vertical é diagramado para o vertical, não é corte do horizontal: texto e produto entre 168 e 1330 px de altura, nada sob a coluna de botões da direita.
- Identidade do próprio app (Harbor UI): fundo claro, azul `#0099ff`, pastéis dos grupos musculares, Inter. Sem roxo, vidro, brilho ou emoji.

Renders: `video/kinetic/<filme>/renders/` (fora do git); masters em `video/out/`.
