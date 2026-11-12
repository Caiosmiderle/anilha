"""Build the UI/UX dossier from reviewed findings and local browser evidence."""
from pathlib import Path
import json
import shutil
from collections import Counter
from html import escape

from PIL import Image as PILImage, ImageColor
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image, KeepTogether, Flowable

ROOT = Path(__file__).resolve().parents[2]
DATA = json.loads((Path(__file__).with_name('uiux-content.json')).read_text(encoding='utf-8'))
RAW = ROOT / 'artifacts/uiux-evidence'
EV = ROOT / 'docs/evidence/uiux-2026-10-22'
EV.mkdir(parents=True, exist_ok=True)
OUT = ROOT / 'docs'
OBS = [json.loads(line) for line in (RAW/'observations.jsonl').read_text(encoding='utf-8').splitlines() if line]
LOOK = {row['id']: row['data'] for row in OBS}
shutil.copyfile(RAW/'observations.jsonl', EV/'observations.jsonl')

def rgb(value):
    return ImageColor.getrgb(value)

def contrast(a, b):
    def lum(c):
        vals = [v/255 for v in rgb(c)]
        vals = [v/12.92 if v <= 0.04045 else ((v+0.055)/1.055)**2.4 for v in vals]
        return sum(v*k for v,k in zip(vals, [0.2126,0.7152,0.0722]))
    l1,l2=sorted([lum(a),lum(b)],reverse=True)
    return (l1+0.05)/(l2+0.05)

def blend(a,b,alpha=.25):
    return '#'+''.join(f'{round(x*alpha+y*(1-alpha)):02x}' for x,y in zip(rgb(a),rgb(b)))

light=LOOK['tokens-light']; dark=LOOK['tokens-dark']
RATIOS={
    'white_brand_top':contrast('#fff',light['--brand-300']),
    'white_brand_bottom':contrast('#fff',light['--brand-500']),
    'white_danger_dark':contrast('#fff',dark['--danger']),
    'focus_light':contrast(blend('#0099ff',light['--bg-surface']),light['--bg-surface']),
    'focus_dark':contrast(blend('#0099ff',dark['--bg-surface']),dark['--bg-surface']),
    'off_switch_light':contrast(light['--line-strong'],light['--bg-surface']),
    'off_switch_dark':contrast(dark['--line-strong'],dark['--bg-surface']),
}
(EV/'measurements.json').write_text(json.dumps({'base':DATA['base'],'browser_probes':7,'routes':9,'viewport_widths':[320,390,1440],'observations':len(OBS),'captures':len(list(RAW.glob('*.png'))),'contrast':RATIOS,'evidence':OBS},ensure_ascii=False,indent=2),encoding='utf-8')

def asset(source,name,crop=None,maxwidth=1100):
    im=PILImage.open(RAW/source).convert('RGB')
    if crop: im=im.crop(crop)
    if im.width>maxwidth: im=im.resize((maxwidth,round(im.height*maxwidth/im.width)))
    dest=EV/f'{name}.jpg'
    im.save(dest,quality=90,optimize=True)
    return dest

ASSETS={
    'draft':asset('foco-antes.png','01-editor-20kg-10reps',(20,1230,760,1688)),
    'focus':asset('foco-depois.png','02-foco-6-repeticoes',(10,530,770,950)),
    'dismiss_row':asset('progressao-ignorada.png','03-cartao-40kg',(50,290,730,450)),
    'dismiss_editor':asset('progressao-ignorada.png','04-editor-42kg',(20,1360,760,1675)),
    'settings':asset('ajustes-320.png','05-ajustes-cortado',(20,900,630,1140)),
    'history':asset('historico-320.png','06-historico-cortado',(0,210,640,375)),
    'day':asset('dia-depois.png','07-dia-06h',(25,900,755,1140)),
    'onboard':asset('cadastro-antes.png','09-cadastro'),
    'agent':asset('agente-rolagem.png','10-agente'),
}

findings=DATA['findings']; BY={f['id']:f for f in findings}; counts=Counter(f['priority'] for f in findings)
md=[f"# {DATA['title']}",f"\n**22/10/2026 | Codex | Base `{DATA['base']}` | Branch `codex/dossie-uiux`**",'\n## Parecer executivo',DATA['verdict'],f"\n**{len(findings)} achados: {counts['P1']} P1, {counts['P2']} P2 e {counts['P3']} P3.** Os três P1 foram reproduzidos localmente. Nenhuma correção de interface foi implementada nesta entrega.",'\n### Corrigir primeiro','\n1. UX-01: um rascunho único para editor e foco.\n2. UX-02: recusar progressão deve atualizar o controle que grava a série.\n3. UX-14: uma intenção de salvar deve gerar uma corrida.','\n## Método, cobertura e limites',DATA['scope'],DATA['limits'],f"\nSete cenários de investigação concluídos em 50,2 s, com {len(OBS)} observações e {len(list(RAW.glob('*.png')))} capturas. Os probes verificam/coletam comportamentos; sucesso do script não significa ausência de problemas de UX. Não repetimos a suíte completa que o Claude já registrou para f741f92.",'\n**Escala:** P1 = pode gravar dados incorretos/duplicados; P2 = quebra de controle, leitura, entendimento ou continuidade; P3 = oportunidade de produto que exige teste com pessoas. Prioridade é julgamento técnico, sem estimativa de frequência real.','\n**Evidência:** reproduzido = observado nos probes; código/cálculo = fluxo ou propriedade verificada sem tarefa completa; hipótese = efeito no comportamento ainda não medido.','\n## O que preservar']
md += [f'- {s}' for s in DATA['strengths']]
md += ['\n## Achados priorizados','\n| ID | Prioridade | Área | Achado |\n| --- | --- | --- | --- |']
md += [f"| {f['id']} | {f['priority']} | {f['area']} | {f['title']} |" for f in findings]
for f in findings:
    md += [f"\n### {f['id']} · {f['priority']} · {f['title']}",f"\n**Área:** {f['area']}. **Evidência:** {f['basis']}",f"\n**Cenário:** {f['scenario']}",f"\n**Observado:** {f['observed']}",f"\n**Impacto:** {f['impact']}",f"\n**Recomendação:** {f['recommendation']}",f"\n**Aceite:** {f['acceptance']}",f"\n**Código:** {'; '.join('`'+r+'`' for r in f['refs'])}."]
    if f['proof']: md += [f"\n**Registro:** {', '.join('`'+p+'`' for p in f['proof'])} em [observations.jsonl](evidence/uiux-2026-10-22/observations.jsonl)."]
md += ['\n## Evidências visuais','\nRecortes das capturas locais de contas de teste. Em 12/11/2026, a revisão de privacidade identificou origem pessoal na fixture usada pela coleta e retirou uma captura complementar da árvore pública. As seis imagens exibidas abaixo permanecem como evidências históricas dos cenários de interface. O tratamento e os limites estão no parecer [de preparação do repositório público](REVISAO_CODEX_REPO_PUBLICO_2026-11-12.md).']
for key,label in [('draft','Editor antes de alternar: 20 kg e 10 repetições'),('focus','Foco depois de alternar: 6 repetições'),('dismiss_row','Após recusar: cartão mostra 40 kg × 12'),('dismiss_editor','Após recusar: editor permanece em 42 kg × 8'),('settings','Ajustes em 320 px: última opção cortada'),('history','Histórico em 320 px: Corpo cortado')]:
    md += [f"\n**{label}**\n\n![{label}](evidence/uiux-2026-10-22/{ASSETS[key].name})"]
md += ['\n## Plano de ação','\n| Ordem | Objetivo | Itens | Aceite de saída |\n| --- | --- | --- | --- |\n| 1 | Confiabilidade do registro | UX-01, UX-02, UX-14 | Uma fonte de valores por série; recusa respeitada; corrida sem reentrada |\n| 2 | Continuidade e acesso | UX-03 a UX-08, UX-16 | Rascunhos preservados; escolhas legíveis a 320 px; contraste e teclado conferidos |\n| 3 | Clareza e controle | UX-09 a UX-13, UX-15, UX-17 | Leitura controlável, proposta inspecionável, ações com origem/efeito previsíveis |\n| 4 | Ativação | UX-18 | Protótipo comparado com o fluxo atual em tarefas com pessoas |','\n### Protocolo de avaliação com pessoas','\nRodada qualitativa proposta com seis participantes: três novos e três habituados a musculação. Não interpretar uma amostra pequena como estimativa estatística de conversão. Tarefas: montar plano; começar e corrigir série; alternar foco; recusar progressão; mudar dia e horário; conferir proposta; registrar uma corrida. Observar tempo, conclusão sem ajuda, erros, recuperações e explicação do que foi salvo. Incluir uma rodada com teclado/leitor de tela e outra em iPhone instalado.','\n### Direção visual recomendada','\nPreservar Harbor UI, cinco áreas e paleta semântica. Reforçar contraste da ação principal, hierarquia da próxima tarefa e distinção entre salvo, rascunho e proposta. Usar divulgação progressiva para regras, fichas e avisos; manter contexto indispensável no foco. Não há redesenho implementado neste dossiê.','\n## Revisão mútua com o Claude','\nA correção de pirâmide e a reabertura sem redigitar já estão em f741f92; não foram contadas como problemas antigos. A animação restaurada introduz o problema de controle de rolagem UX-09, reproduzido nesta coleta. O restante da regra de progressão, incluindo qual série desce, exige revisão funcional própria e não foi aprovado integralmente nesta auditoria de UI/UX.','\nO Claude deve revisar os três P1 e os critérios de aceite antes de implementar. Teclado do iPhone continua hipótese a validar em aparelho real. Nenhum deploy, merge na main ou chamada real ao modelo ocorreu.','\n## Reproduzir a coleta','\n```powershell\nnpx playwright test -c scripts/audits/uiux.config.ts\n```','\nOs testes usam API/banco locais e resposta de modelo simulada no caso de rolagem. Evidências cruas vão para `artifacts/uiux-evidence`; os registros retidos estão em `docs/evidence/uiux-2026-10-22/`.','\n## Fontes e referências','\nCódigo e interface: Anilha f741f92. Critérios externos consultados em 22/10/2026:']
md += [f"\n- [{s['id']}: {s['title']}]({s['url']})" for s in DATA['sources']]
md += ['\nA meta prática de 44 px do produto é diferente do mínimo WCAG AA de 24 CSS px, que tem exceções. Não foram considerados conformidade integral, taxa de abandono ou ganho de desempenho sem medição.']
(OUT/'DOSSIE_UIUX_2026-10-22.md').write_text('\n'.join(md)+'\n',encoding='utf-8')

pdfmetrics.registerFont(TTFont('Segoe',r'C:\Windows\Fonts\segoeui.ttf'))
pdfmetrics.registerFont(TTFont('SegoeBold',r'C:\Windows\Fonts\segoeuib.ttf'))
pdfmetrics.registerFontFamily('Segoe',normal='Segoe',bold='SegoeBold',italic='Segoe',boldItalic='SegoeBold')
NAVY=colors.HexColor('#102D40'); BLUE=colors.HexColor('#006BB3'); INK=colors.HexColor('#1D2D3C'); MUTED=colors.HexColor('#526675'); PALE=colors.HexColor('#EDF5F9'); LINE=colors.HexColor('#D8E4EB'); RED=colors.HexColor('#A52D30')
W,H=A4; CW=W-88
styles={
 'body':ParagraphStyle('body',fontName='Segoe',fontSize=9.2,leading=13.3,textColor=INK,spaceAfter=7),
 'small':ParagraphStyle('small',fontName='Segoe',fontSize=7.7,leading=10.8,textColor=MUTED,spaceAfter=6),
 'h1':ParagraphStyle('h1',fontName='SegoeBold',fontSize=24,leading=29,textColor=NAVY,spaceAfter=13),
 'h2':ParagraphStyle('h2',fontName='SegoeBold',fontSize=13.5,leading=18,textColor=NAVY,spaceBefore=5,spaceAfter=7),
 'card':ParagraphStyle('card',fontName='SegoeBold',fontSize=12,leading=16,textColor=NAVY,spaceBefore=9,spaceAfter=4),
 'label':ParagraphStyle('label',fontName='SegoeBold',fontSize=8.3,leading=12,textColor=BLUE,spaceAfter=5),
 'cover':ParagraphStyle('cover',fontName='SegoeBold',fontSize=38,leading=44,textColor=colors.white,spaceAfter=20),
 'coverbody':ParagraphStyle('coverbody',fontName='Segoe',fontSize=11.5,leading=17,textColor=colors.HexColor('#E2EFF6'),spaceAfter=13),
 'whiteSmall':ParagraphStyle('whiteSmall',fontName='SegoeBold',fontSize=9,leading=13,textColor=colors.HexColor('#B8E1F4'),spaceAfter=12),
}

def p(text,style='body'):
    return Paragraph(text,styles[style])

def tx(text): return escape(text).replace('\n','<br/>')
story=[]
def add(text,style='body'): story.append(p(text,style))
def gap(n=7): story.append(Spacer(1,n))
def title(kicker,name):
    add(kicker.upper(),'label'); add(name,'h1')
def card(fid):
    f=BY[fid]
    severity=RED if f['priority']=='P1' else BLUE
    block=[p(f"<font color='{severity.hexval()}'>{f['priority']} · {fid}</font>  {tx(f['title'])}",'card'), p(tx(f['basis']),'small'),p('<b>Observado.</b> '+tx(f['observed'])),p('<b>Recomendação.</b> '+tx(f['recommendation'])),p('<b>Aceite.</b> '+tx(f['acceptance'])),p('Código: '+tx('; '.join(f['refs'])),'small')]
    story.append(KeepTogether(block))
def table(rows,widths=None):
    cells=[[p(tx(str(c)),'small') for c in row] for row in rows]
    t=Table(cells,colWidths=widths or [CW/len(rows[0])]*len(rows[0]),hAlign='LEFT')
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),PALE),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),6),('LINEBELOW',(0,0),(-1,0),.7,LINE),('LINEBELOW',(0,1),(-1,-1),.35,LINE)]))
    story.append(t); gap(7)
def image_pair(a,b,caption_a,caption_b,height=115):
    pics=[]
    for key,label in [(a,caption_a),(b,caption_b)]:
        im=PILImage.open(ASSETS[key]); w=(CW-18)/2; h=min(height,w*im.height/im.width); iw=h*im.width/im.height
        pics.append([Image(str(ASSETS[key]),width=iw,height=h),p(tx(label),'small')])
    t=Table([[pics[0],pics[1]]],colWidths=[CW/2,CW/2]);t.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),9)]));story.append(t);gap(5)

class Timeline(Flowable):
    def __init__(self): Flowable.__init__(self); self.width=CW;self.height=97
    def draw(self):
        c=self.canv
        for y,label,points in [(70,'Atual: mesmo intervalo visual',[0,.5,1]),(25,'Por dias decorridos',[0,1/21,1])]:
            c.setFont('Segoe',8);c.setFillColor(MUTED);c.drawString(0,y+16,label)
            left=190;right=CW-15;c.setStrokeColor(LINE);c.line(left,y,right,y)
            for idx,fraction in enumerate(points):
                x=left+(right-left)*fraction;c.setFillColor(BLUE);c.circle(x,y,3,fill=1,stroke=0)
                c.setFont('Segoe',7);c.setFillColor(INK)
                label_y = y+8 if y == 25 and idx == 1 else y-13
                c.drawCentredString(x,label_y,['01/10','02/10','22/10'][idx])

# 1. Executive cover.
gap(55);add('ANILHA / AUDITORIA DE PRODUTO / 22.10.2026','whiteSmall')
add('Dossiê de<br/>UI/UX','cover')
add('Precisão no registro.<br/>Clareza nas decisões.<br/>Acesso em qualquer tela.','coverbody')
gap(15)
stats=Table([[p('<b>18</b><br/>achados priorizados','coverbody'),p('<b>3 P1</b><br/>reproduzidos','coverbody'),p('<b>7</b><br/>cenários de coleta','coverbody')]],colWidths=[CW/3]*3)
stats.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),colors.HexColor('#1A4056')),('TOPPADDING',(0,0),(-1,-1),14),('BOTTOMPADDING',(0,0),(-1,-1),5),('LEFTPADDING',(0,0),(-1,-1),14)]));story.append(stats)
gap(24);add(tx(DATA['verdict']),'coverbody')
add('Primeiro: unificar os valores entre editor e foco, respeitar a recusa de progressão e impedir corrida duplicada.','coverbody')
gap(16);add('Base: f741f92, revisão final do Claude.<br/>Entrega: diagnóstico e plano de ação; interface preservada.','whiteSmall')
story.append(PageBreak())

# 2. Method and strengths.
title('Leitura do produto','Base consistente, com falhas de coerência')
add(tx(DATA['scope']))
table([['Cobertura','O que foi observado'],['Nove rotas','Hoje, Plano, Treinos, Histórico, Progresso, Amigos, Você, Ajustes e Privacidade.'],['Tarefas centrais','Cadastro, série, foco, recusa de progressão, mudança de dia, corrida e assistente.'],['Ambiente','Chromium local; 390 e 320 px; desktop 1440 px; tokens claro/escuro.']], [100,CW-100])
add('O que merece ser preservado','h2')
for s in DATA['strengths']: add('• '+tx(s))
add('Como ler as prioridades','h2')
add('<b>P1</b>: registro incorreto ou duplicado. <b>P2</b>: controle, acesso, leitura ou continuidade prejudicados. <b>P3</b>: hipótese de melhoria que exige testar com pessoas.')
add('Reproduzido indica comportamento observado. Código/cálculo indica evidência técnica sem tarefa integral. Uma hipótese não é tratada como bug confirmado.','small')
add(tx(DATA['limits']),'small');story.append(PageBreak())

# 3. Main integrity problems.
title('Confiabilidade / 01','A mesma série precisa ter um único valor')
image_pair('draft','focus','Editor: 20 kg × 10 digitados.','Foco: 6 repetições, antes de gravar.',105)
card('UX-01');card('UX-02')
image_pair('dismiss_row','dismiss_editor','Depois de Ignorar: cartão com 40 kg × 12.','O editor permanece em 42 kg × 8.',83)
story.append(PageBreak())

# 4. Save and continuity.
title('Confiabilidade / 02','Salvar e trocar exigem resultado previsível')
card('UX-14');card('UX-03');card('UX-04');story.append(PageBreak())

# 5. Visual access.
title('Legibilidade','O contraste e a largura limitam escolhas')
card('UX-05')
table([['Combinação ativa','Contraste','Critério de aceite'],['Branco / azul do gradiente','1,84:1 a <3,00:1','4,5:1 para o texto usado'],['Branco / perigo no escuro','2,79:1','4,5:1']], [CW*.43,CW*.25,CW*.32])
card('UX-06')
image_pair('settings','history','Ajustes: 316 px de conteúdo em 248 px.','Histórico: 330 px de conteúdo em 288 px.',88)
story.append(PageBreak())

# 6. Keyboard and state.
title('Acessibilidade','A tela ativa precisa ser a tela navegável')
card('UX-07');card('UX-08');card('UX-16');story.append(PageBreak())

# 7. Assistant.
title('Assistente','Ler e revisar devem estar sob controle')
card('UX-09');card('UX-10')
add('Estrutura recomendada para revisar um plano','h2')
table([['Camada','Conteúdo sugerido'],['Resumo','Objetivo, dias, duração e o que muda; manter o antes/depois já existente.'],['Detalhes por ficha','Abrir para ver exercícios, séries, faixa de repetições/tempo e descanso.'],['Decisão','Salvar, Ajustar e Recusar; avisos com contexto e indicação de impacto.']], [105,CW-105])
add('A animação de digitação pedida pelo Caio pode permanecer. O ajuste é respeitar a rolagem da pessoa e manter o comportamento de reabrir sem redigitar. Nenhum comportamento foi alterado nesta entrega.','small')
story.append(PageBreak())

# 8. Expectation and labels.
title('Contratos de interação','O verbo precisa descrever o que acontece')
card('UX-11');card('UX-12');card('UX-13');story.append(PageBreak())

# 9. Context and history.
title('Contexto e evolução','Simplificar preservando a informação essencial')
card('UX-15');card('UX-17')
add('Exemplo do eixo temporal atual','h2');story.append(Timeline())
add('No código atual, 1 dia e 20 dias recebem o mesmo espaço. Se o gráfico for por sessão, o eixo deve declarar essa escolha. Uma tabela também deve permitir consultar as duas séries sem depender da visão.','small')
story.append(PageBreak())

# 10. Activation.
title('Ativação','Experimentar mais cedo é uma hipótese a testar')
card('UX-18')
add('A sequência atual tem 12 etapas no caso de musculação','h2')
table([['1–4','5–8','9–12'],['Nome\nIdade\nObjetivo\nFoco','Nível\nPausa\nLocal\nSemana','Duração\nDivisão\nGênero\nPlano']], [CW/3]*3)
add('Direção recomendada','h2')
add('Definir o conjunto mínimo de respostas que o motor realmente precisa. Depois, testar uma opção de aceitar as sugestões para decisões avançadas e revisar o resultado antes de adotar. A edição detalhada continua acessível em Perfil de treino.')
add('Hoje: uma prioridade por vez','h2')
add('A próxima ação deve continuar evidente. Avisos extensos podem ter um resumo com detalhes acessíveis, preservando a informação relevante antes da execução. Na amostra visual, instruções de retorno ocupam uma parte expressiva do primeiro viewport.')
add('Não há medição de abandono ou ganho de conversão. A recomendação é uma hipótese de produto, com avaliação proposta na próxima página.','small')
story.append(PageBreak())

# 11. Priorities and evaluation.
title('Plano de ação','Uma ordem de trabalho verificável')
table([['Ordem','Objetivo','IDs','Aceite de saída'],['1','Registro confiável','01, 02, 14','Valores coerentes e uma corrida por intenção.'],['2','Continuidade e acesso','03–08, 16','Rascunhos, 320 px, contraste e teclado.'],['3','Clareza e controle','09–13, 15, 17','Leitura livre, detalhes revisáveis e origem das ações.'],['4','Ativação','18','Protótipo comparado com o fluxo atual.']], [42,123,66,CW-231])
add('Rodada qualitativa proposta','h2')
add('Seis participantes: três novos e três habituados a musculação. Observar tarefas e erros, sem usar a amostra pequena como estimativa estatística de conversão.')
for task in ['Montar um plano e explicar o que fará hoje.','Editar uma série, alternar foco e confirmar o que foi salvo.','Recusar uma progressão e explicar a carga que será registrada.','Trocar dia e horário, conferindo o resultado.','Revisar a proposta do assistente antes de salvar.','Registrar uma corrida e lidar com uma tentativa interrompida.']:
    add('• '+task)
add('Medidas e verificação','h2')
add('Conclusão sem ajuda, tempo por tarefa, erros, recuperações e explicação do estado final. Complementar com teclado/leitor de tela e iPhone instalado, incluindo teclado virtual, rolagem e retorno do foco.')
add('As correções devem receber regressões que verifiquem a tarefa da pessoa, não apenas o estado interno. Não há implementação de melhorias nesta branch.','small');story.append(PageBreak())

# 12. Evidence and peer review.
title('Rastreabilidade','Evidências, fontes e revisão mútua')
add(f"A coleta produziu {len(OBS)} observações e {len(list(RAW.glob('*.png')))} capturas. Sete cenários de investigação foram concluídos. O script coleta comportamentos problemáticos de propósito; seu sucesso não aprova a experiência.")
table([['Registro','Evidência principal'],['focus-draft / focus-saved','20/10 digitados; foco e gravação com 6 repetições e carga nula.'],['dismiss-progression','Cartão 40 kg × 12; editor 42 kg × 8.'],['run-double-submit','Duas atividades de 5 km / 1.800 s.'],['day-swap / onboarding-reload','Horário 07:45 perdido; cadastro retorna à primeira etapa.'],['menu-keyboard / agent-scroll','Tab fora do menu; posição de leitura forçada ao fim.']], [172,CW-172])
add('O que mudou após a avaliação do Claude','h2')
add('A base f741f92 já contém a correção de pirâmide e de reabrir sem redigitar. Esses problemas antigos não foram contados novamente. UX-09 identifica uma regressão do acompanhamento da digitação. A revisão funcional integral da progressão não está encerrada por este dossiê.')
add('Fontes de referência','h2')
for s in DATA['sources']:
    add(f"<b>{s['id']}</b> · <link href='{s['url']}' color='#006BB3'>{tx(s['title'])}</link>",'small')
add('Os mínimos de contraste e reflow foram usados como critérios concretos. A meta de toque de 44 px do produto é distinta do mínimo AA de 24 CSS px, que admite exceções.','small')
add('Próxima revisão: Claude deve conferir os três P1, os recortes e os critérios de aceite antes de propor correções. Sem merge na main ou publicação.','small')

def page_decor(c,doc):
    c.saveState()
    if doc.page==1:
        c.setFillColor(NAVY);c.rect(0,0,W,H,fill=1,stroke=0)
        c.setFillColor(colors.HexColor('#39B6E9'));c.circle(W-40,H-40,125,fill=1,stroke=0)
        c.setFillColor(colors.HexColor('#174359'));c.circle(W+50,H-45,138,fill=1,stroke=0)
        c.setFillColor(colors.HexColor('#B8E1F4'))
    else:
        c.setFillColor(MUTED);c.setFont('Segoe',7.5);c.drawString(44,H-27,'ANILHA  /  DOSSIÊ DE UI/UX')
        c.drawRightString(W-44,H-27,'22.10.2026 · BASE f741f92')
        c.setStrokeColor(LINE);c.line(44,33,W-44,33)
    c.setFont('Segoe',7.3);c.drawString(44,20,'Codex · Auditoria com evidências locais')
    c.drawRightString(W-44,20,str(doc.page))
    c.restoreState()

pdf=OUT/'DOSSIE_UIUX_2026-10-22.pdf'
doc=SimpleDocTemplate(str(pdf),pagesize=A4,rightMargin=44,leftMargin=44,topMargin=50,bottomMargin=43,title=DATA['title'],author='Codex',subject='Auditoria UI/UX do Anilha, base f741f92')
doc.build(story,onFirstPage=page_decor,onLaterPages=page_decor)
print(json.dumps({'pdf':str(pdf),'markdown':str(OUT/'DOSSIE_UIUX_2026-10-22.md'),'findings':dict(counts),'observations':len(OBS),'contrast':RATIOS},ensure_ascii=False,indent=2))
