# Auditoria da interface do Anilha no iPhone

Claude, 13/11/2026. Base: as 28 telas capturadas no simulador no build 36 (iOS 0.18.1, dados fictícios do modo demonstração, claro e escuro), o código de cada tela e o fluxo do site para comparação. Foco: o uso diário do Caio (academia com plano do motor, corridas pelo CRUNNING, Waltér). Não testado em aparelho.

## O que já funciona bem

- **Tela do treino em foco:** um número grande por vez (carga x repetições), "Série feita" e "Ajustar", descanso com +15 s, -15 s e Pular, esforço em quatro botões. É o melhor da app.
- **Resumo e evolução:** recordes, comparação com a última vez e setas de evolução, legíveis.
- **Semana na aba Plano e calendário:** força e corrida juntas, com feito e previsto.
- **Plano novo, chat e revisão:** antes e depois claros, nada muda sem confirmar.
- **Mesa de descanso:** desenhada com cuidado, retoma a partida.

## P1: errado, corrigir já (pequeno e sem risco)

1. **"1 exercícios"** na lista de fichas (plural fixo).
2. **Data crua "2026-11-12"** em "Última carga" na ficha. Na tela do exercício já sai "qui., 12/11".
3. **"Bracos"** sem cedilha como grupo do exercício na lista do treino (mostra a chave interna).
4. **Cor da corrida inconsistente:** verde no calendário do Histórico, laranja no Calendário e na semana do Hoje.
5. **Texto velho "no PWA"** no Hoje ("Confira as fichas no PWA", "Crie ou ajuste seu plano no PWA"). Agora existe Plano novo no app; e "PWA" não é palavra de usuário.
6. **Dois botões "Editar" na mesma tarefa:** a ficha abre com "Editar" e, dentro da edição, aparece outro "Editar" embaixo (é o de reordenar). Trocar por "Reordenar".

## P2: atrito no uso diário (o que mais falta)

7. **Ajustes do dia no Hoje.** No site, o Hoje tem "Tenho pouco tempo", "Hoje é descanso", "Trocar por corrida", "Focar em um grupo", "Sem equipamento" e "Poupar articulação". No iPhone não há nenhum. É a falta que mais pesa no dia a dia: hoje é preciso abrir o site para isso.
8. **Descartar treino em andamento.** O menu do treino só tem Concluir e Minimizar. Começou a ficha errada, não há como desfazer sem deixar um treino concluído no histórico (o site tem "Descartar treino").
9. **Corrigir uma série depois de concluir.** A tela do treino concluído é só leitura; uma carga digitada errada fica errada (o site deixa editar a série).
10. **Treinar outra ficha pelo Hoje.** Em dia de descanso ou para trocar a ficha do dia, o caminho é Plano > Fichas > ficha > Começar. Falta "Treinar outra ficha" no Hoje.
11. **Mudar respostas sem gerar plano novo.** O Perfil de treino mostra as respostas só para leitura; a única edição é dentro de Plano novo, que troca o plano. O site permite salvar o perfil e manter o plano.
12. **Ícones sem texto na aba Plano.** O de Exercícios (estante) parece gráfico e o de Plano novo (setas em círculo) parece "atualizar". Melhor um menu ou rótulos.

## P3: clareza e acabamento

13. **Título repetido:** muitas telas mostram o nome na barra e de novo grande logo abaixo (Histórico, Calendário, Fichas, Perfil, Plano novo), com selo e subtítulo; empurra o conteúdo meia tela para baixo. Escolher um.
14. **Dois calendários:** o do Histórico (só feito) e o Calendário (feito e previsto, aberto pelo Hoje). O segundo cobre o primeiro; dá para tirar o do Histórico e deixar a lista da semana.
15. **Conselho duplo no foco:** dica do Waltér e sugestão do motor, uma embaixo da outra, inclusive no aquecimento ("Mantenha a carga..." com "Ignorar" em série de aquecimento, onde não há o que ignorar). Mostrar a sugestão só nas séries de trabalho e o "Ignorar" só quando muda carga.
16. **Verbos diferentes para a mesma ação:** a análise usa "Salvar / Ajustar / Recusar"; a revisão usa "Aplicar / Recusar". Unificar em "Aplicar".
17. **Rodapé técnico na análise e na revisão:** "claude-haiku-5-5 · 2.345/210 tokens · est. US$ 0,0003395". Para você é útil, mas pode ser "Haiku · US$ 0,0003".
18. **Jargão:** "RIR" aparece explicado só no topo da evolução; "1RM estimado (Epley)" no progresso. Trocar por "reps na reserva" e "carga máxima estimada".
19. **Atribuição do RepDB em inglês** na tela do exercício. A licença pede a atribuição; dá para manter o texto exigido e pôr antes "Imagens e dados:".

## Pendências já conhecidas

- Pedir plano novo pelo chat do Waltér (precisa de proposta, avisos e desfazer para todas as fichas).
- Revisão do Waltér antes de salvar o plano (hoje é depois, nas fichas novas).

## Ordem que eu proponho

1. P1 inteiro, numa versão (0.18.3).
2. P2: 7 (ajustes do dia), 8 (descartar), 9 (corrigir série), 10 (outra ficha), 11 (perfil sem plano), 12 (rótulos).
3. P3 junto com o próximo passe visual.
