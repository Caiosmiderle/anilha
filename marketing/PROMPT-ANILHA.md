Você é o dono do projeto Anilha. Todas as decisões de produto, design, copy, roteiro, estrutura de arquivos e stack são suas. Eu (Caio) sou só o agente de execução: rodo comando que precise de senha ou admin, subo pro GitHub/Vercel, testo em celular real, tiro prints e baixo arquivos que você pedir. Não me peça opinião sobre decisão que é sua. Só me peça o que você fisicamente não consegue fazer, sempre com instrução exata do que fazer.

MISSÃO: vender o Anilha. Duas frentes:
A) Dois vídeos de motion design pra anúncio.
B) Manual de uso + FAQ dentro da landing page do site.

REFERÊNCIAS (já estão em marketing/referencias/):
- Motion-Graphics-starter-kit/prompts.md: 14 prompts de motion testados com HyperFrames. Leia esse arquivo, não o PDF (o PDF quebra o texto).
- Motion-Graphics-starter-kit/sfx/: 9 efeitos sonoros feitos em código, sem licença pra se preocupar.
- Motion-Graphics-starter-kit/fonts/: fontes livres dos 4 estilos do guia.
- Motion-Graphics-with-Claude-Code.pdf e The-Katana-Process.pdf: guias visuais. O Katana depende do conector Higgsfield (plano pago, roda no claude.ai), então NÃO vamos usar a ferramenta. Use só as lições de ritmo, som e acabamento dele.

==================================================
FASE 0: ENTENDER ANTES DE CRIAR
==================================================
1. Leia o código do Anilha e liste as funcionalidades que EXISTEM e funcionam hoje. Vídeo e landing só prometem o que está implementado. Nada de "em breve", número de usuários, depoimento ou estatística inventada.
2. Extraia a identidade visual real do app (tokens do Harbor UI: cores, tipografia, raios, ícones). Vídeos e landing têm que parecer o próprio app, não template. Regra: nada com cara de IA (sem gradiente roxo genérico, sem glassmorphism gratuito, sem emoji como ícone, sem 3D fake). Os estilos do kit (Kinetic Type, Liquid Glass, Editorial Grain, Pop Bold) são vocabulário de movimento, não identidade: adapte às cores e fontes do Anilha.
3. Audite a instalabilidade do PWA: manifest (name, short_name, start_url, display standalone, theme_color, background_color, ícones 192 e 512 + maskable), service worker, apple-touch-icon e meta tags de iOS. Se tiver falha, corrija ANTES de escrever o manual, senão o manual ensina algo que não funciona.
4. Descubra onde os dados do usuário ficam (localStorage, IndexedDB, backend com login). Isso muda o FAQ: no iPhone, o app instalado na tela inicial tem armazenamento separado do Safari, então quem começou no Safari e depois instalou pode "perder" os dados se não houver login/sync. Se for o caso, decida se resolve no produto ou se deixa claro no manual.
5. Prepare o ambiente do HyperFrames: Node 22+, FFmpeg, skills (npx hyperframes skills) e npx hyperframes doctor. Whisper só é necessário se você decidir usar narração. Se algo exigir admin, me passe o comando exato.

Registre a Fase 0 e o seu plano em marketing/BRIEF.md: público, promessa principal em 1 frase, 3 a 5 provas reais do app, roteiro e storyboard de cada vídeo, estrutura da landing. Não espere aprovação, siga.

==================================================
FASE 1: OS DOIS VÍDEOS
==================================================
Mesma mensagem, cada um diagramado nativamente pro seu formato (o vertical NÃO é crop do horizontal):
- YouTube (anúncio in-stream): 1920x1080, 16:9.
- Celular (Shorts, Reels, Stories, status): 1080x1920, 9:16.

Regras:
- Os 5 primeiros segundos decidem tudo. No anúncio do YouTube o botão "Pular" aparece aos 5s, então marca + promessa estão na tela antes disso.
- Tem que funcionar 100% no mudo. O texto carrega a mensagem inteira, o som só reforça.
- Mostre o produto de verdade: rode o app localmente, capture telas reais com Playwright em viewport de celular, com dados de exemplo realistas de treino (exercícios, cargas, séries, rotina). Use isso dentro de mockup de celular ou cards, com zoom/pan na parte que importa (o número, o check, a rotina) e uma linha curta do que aquilo faz pela pessoa. Não redesenhe tela que já existe.
- Ritmo: nenhuma cena parada mais de ~2s, texto sempre em movimento, cortes no beat. Um punch-in na frase que a pessoa tem que lembrar.
- Final: nome/logo, uma linha e CTA claro com a URL legível.
- Vertical: texto dentro dos 80% centrais da largura e fora das zonas de interface das plataformas (topo ~250px, faixa inferior ~20%, lateral direita onde ficam like/comentário).
- Duração é decisão sua. Sugestão: 20 a 35s no horizontal, 15 a 25s no vertical.
- Copy em português do Brasil, frase curta, linguagem de academia de verdade, sem clichê de coach.

Som:
- Os dois guias divergem. O Katana põe um som em cada movimento (incluindo whoosh). O guia do HyperFrames usa só clicks nos momentos que importam (tick, counter, chime) e nenhum whoosh. Escolha e justifique no BRIEF.
- O kit não tem música. Se quiser trilha, me diga exatamente o que buscar (clima, BPM, duração) e com qual licença (precisa cobrir anúncio no YouTube e uso no site). Eu baixo e coloco na pasta que você indicar, e você corta os vídeos no beat dela.
- Narração é opcional e decisão sua.

Processo:
- Projeto de vídeo isolado em marketing/video/ (não pode entrar no build do app). Renders pesados no .gitignore.
- Primeiro uma base completa, depois refine um momento de cada vez (é o método do guia).
- Depois de cada render, extraia frames com ffmpeg nos momentos-chave e OLHE: texto legível, nada cortado, nada fora da safe zone, contraste ok, timing certo. Corrija e renderize de novo sozinho até nada te incomodar.
- Exporte: masters H.264 + AAC em alta qualidade pro YouTube (anilha-youtube-16x9.mp4 e anilha-mobile-9x16.mp4), versões leves pra web (--crf 23 ou mais, poucos MB) e um poster (frame estático) de cada.

==================================================
FASE 2: LANDING PAGE + MANUAL + FAQ
==================================================
Estrutura, copy e layout são decisão sua. Requisitos:

Vídeo:
- Horizontal no desktop, vertical no celular, sem baixar os dois. Poster, muted + playsinline + loop pro autoplay, botão pra ativar o som.
- Landing leve: não pode piorar o carregamento do app.

Seção "Como instalar", detectando o aparelho e mostrando primeiro o tutorial certo (Android, iPhone, computador), com abas pros outros:
- Android (Chrome): menu ⋮ > "Instalar app" ou "Adicionar à tela inicial" > confirmar. Use o evento beforeinstallprompt pra ter um botão "Instalar" de um toque quando o navegador permitir.
- iPhone com iOS 26: no Safari, botão ⋯ ao lado da barra de endereço > Compartilhar > rolar > "Adicionar à Tela de Início" > deixar "Abrir como App Web" ligado > Adicionar.
- iPhone com iOS 18 ou anterior: botão Compartilhar na barra do Safari > "Adicionar à Tela de Início" > Adicionar.
- Confirme os nomes exatos dos botões em português. Se precisar de prints reais, me diga exatamente quais telas capturar no Android e no iPhone que eu tiro.
- Se o app já estiver rodando instalado (display-mode: standalone), esconda o tutorial e mostre que já está instalado.
- Detecte navegador interno (Instagram, Facebook, TikTok e afins) e mostre como abrir no Chrome/Safari, porque de dentro deles não dá pra instalar. Esse vai ser o problema nº 1 de quem vier do anúncio.
- Se o projeto tiver analytics, registre o evento appinstalled.

Manual de uso:
- Passo a passo dos fluxos principais que existem no app, do primeiro acesso ao primeiro treino registrado e o que vem depois. Curto, com print ou mini-animação por passo (pode reaproveitar trechos dos vídeos como loops curtos).

FAQ / Problemas comuns. No mínimo:
- Não aparece a opção de instalar
- Abri pelo link do Instagram/WhatsApp e não instala
- Instalei e sumiram meus dados (responda com base na Fase 0)
- Precisa de internet?
- Como atualizar
- Como desinstalar
- É pago?
- Funciona no computador?
Só responda o que for verdade no código. Corte pergunta que não se aplica e adicione as que você sabe que vão surgir.

Geral: mobile first e acessível (contraste, foco visível, alt nas imagens, texto do vídeo disponível em texto na página).

==================================================
FASE 3: VERIFICAÇÃO
==================================================
- Screenshots da landing com Playwright em 390x844 e 1440x900. Confira tudo e corrija o que estiver errado.
- Confirme manifest e service worker válidos no Chrome (DevTools > Application).
- Me passe um checklist de teste em celular real (Android e iPhone): o que eu clico e o que deve acontecer. Eu executo e te devolvo o resultado.

Trabalhe numa branch própria. No fim, me entregue:
1. Onde estão os 2 vídeos master, as versões web e os posters.
2. O que mudou no app e na landing (lista curta).
3. O que eu preciso fazer (deploy, subir no YouTube, testes), com comandos exatos.
