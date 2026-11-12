/**
 * Compares models for the agent: the same test requests with the same instructions, tools
 * and context, sent through the agente-avaliar function (the keys stay in Supabase). Scores
 * the tool each model picks and writes artifacts/agente/comparacao.{json,html}.
 * Only made-up people and requests: the Gemini free tier may read what it gets.
 * Run: AGENTE_EVAL_TOKEN=... npx tsx scripts/agente-avaliar.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { contextText, type AgentContext, type ContextFicha } from '../src/agent/context';
import { runAgentTool } from '../src/agent/execute';
import { agentSystemPrompt } from '../src/agent/prompt';
import { AGENT_TOOLS } from '../src/agent/tools';
import { generatePlan, withSplit } from '../src/engine/generator';
import type { OnboardingParams } from '../src/engine/types';

const URL = 'https://ssuuvzgqtobnfvobvjcu.supabase.co/functions/v1/agente-avaliar';
const TOKEN = process.env.AGENTE_EVAL_TOKEN ?? '';
const OUT = 'artifacts/agente';

/**
 * The versions compared, each a model and how hard it thinks. Paid prices per million
 * tokens (Gemini's free tier costs nothing, but reads the data).
 */
const ALL_MODELS = [
  { key: 'haiku-medio', id: 'claude-haiku-5-5', provider: 'anthropic', effort: undefined, label: 'Claude Haiku 5.5, esforço médio (padrão)', inp: 0.1, out: 0.5, cache: 0.01 },
  { key: 'haiku-alto', id: 'claude-haiku-5-5', provider: 'anthropic', effort: 'high', label: 'Claude Haiku 5.5, esforço alto', inp: 0.1, out: 0.5, cache: 0.01 },
  { key: 'flash-lite', id: 'gemini-3.5-flash-lite', provider: 'gemini', effort: undefined, label: 'Gemini 3.5 Flash-Lite', inp: 0.3, out: 2.5, cache: 0.3 },
] as const;

type ModelId = (typeof ALL_MODELS)[number]['key'];

/** AGENTE_MODELOS=haiku-medio,flash-lite runs only those versions; empty runs all. */
const ONLY = process.env.AGENTE_MODELOS?.split(',').filter(Boolean);
const MODELS = ALL_MODELS.filter((m) => !ONLY?.length || ONLY.includes(m.key));

interface Reply {
  text: string;
  tool_calls: { name: string; input: Record<string, unknown> }[];
  stop: string;
  usage: { input: number; output: number; cached: number; thinking: number };
  ms: number;
  error?: string;
  /** The reply as the provider sent it, to go back in the next turn. */
  assistant?: unknown[];
}

/** One round of the conversation: the tools called, what they gave back, the text. */
interface Turn {
  tool_calls: Reply['tool_calls'];
  results: string[];
  text: string;
}

const ALL_EQUIPMENT: OnboardingParams['equipment'] = [
  'halteres', 'barra', 'polia', 'maquina', 'peso_corporal', 'kettlebell', 'barra_fixa',
];
const BASE: Pick<
  OnboardingParams,
  'run_days' | 'force_gym_days' | 'equipment' | 'spare_joints' | 'returning' | 'time'
> = {
  run_days: 0,
  force_gym_days: false,
  equipment: ALL_EQUIPMENT,
  spare_joints: [],
  returning: false,
  time: '18:00',
};

function persona(asked: OnboardingParams, health: boolean): AgentContext {
  // As the app saves it: the split picked, or the one the screens suggest.
  const params = withSplit(asked, !!asked.split_style);
  const plan = generatePlan(params);
  const fichas: ContextFicha[] = plan.routines.map((r) => ({
    id: r.split_key,
    name: r.name,
    items: r.items.map((i) => ({
      exercise_id: i.exercise_id,
      sets: i.sets,
      target_min: i.target_min,
      target_max: i.target_max,
      rest_sec: i.rest_sec,
    })),
  }));
  return { params, fichas, volume: plan.volume, health, returnMode: false };
}

const PEOPLE = {
  mariana: persona(
    { ...BASE, first_name: 'Mariana', goal: 'hipertrofia', gym_days: 4, minutes: 60, level: 'intermediario', gender: 'feminino', age_range: '18-29' },
    true,
  ),
  lucas: persona(
    { ...BASE, first_name: 'Lucas', goal: 'hipertrofia', gym_days: 3, minutes: 45, level: 'iniciante', split_style: 'grupos', fichas: 3, age_range: '18-29' },
    false,
  ),
};
type Who = keyof typeof PEOPLE;

type Calls = Reply['tool_calls'];
interface Case {
  who: Who;
  ask: string;
  /** Tools that answer right; 'pergunta' is a short question back, with no tool. */
  expect: string[];
  /** Extra check on the arguments. */
  check?: (calls: Calls) => boolean;
  /** Judged by reading, not by the tool alone. */
  judge?: string;
}

const first = (calls: Calls, name: string) => calls.find((c) => c.name === name)?.input ?? {};
const changes = (calls: Calls) =>
  calls
    .filter((c) => c.name === 'editar_ficha')
    .flatMap((c) => (c.input.mudancas as Record<string, unknown>[] | undefined) ?? []);

const CASES: Case[] = [
  { who: 'mariana', ask: 'Quero trocar meu plano porque tem muito pouco foco em perna e glúteo. Sou mulher e quero priorizar isso.', expect: ['propor_plano'], check: (c) => ((first(c, 'propor_plano').foco as string[] | undefined) ?? []).includes('pernas') },
  { who: 'mariana', ask: 'Agora consigo ir 5 vezes na semana.', expect: ['propor_plano'], check: (c) => first(c, 'propor_plano').dias_academia === 5 },
  { who: 'mariana', ask: 'Só tenho 40 minutos por treino agora.', expect: ['propor_plano'], check: (c) => first(c, 'propor_plano').minutos === 40 },
  { who: 'mariana', ask: 'Quero focar em costas e ombros também, além de perna.', expect: ['propor_plano'], check: (c) => { const f = (first(c, 'propor_plano').foco as string[] | undefined) ?? []; return f.includes('pernas') && f.includes('costas_ombros'); } },
  { who: 'mariana', ask: 'Meu objetivo mudou, quero emagrecer.', expect: ['propor_plano'], check: (c) => first(c, 'propor_plano').objetivo === 'emagrecimento' },
  { who: 'mariana', ask: 'Troca o supino reto com barra por algum com halteres.', expect: ['editar_ficha'], check: (c) => changes(c).some((m) => m.tipo === 'trocar' && m.exercicio_id === 'supino-reto-barra' && String(m.novo_exercicio_id).includes('halteres')) },
  { who: 'mariana', ask: 'Tira a elevação lateral da Superior B.', expect: ['editar_ficha'], check: (c) => first(c, 'editar_ficha').ficha_id === 'superior_b' && changes(c).some((m) => m.tipo === 'remover' && m.exercicio_id === 'elevacao-lateral') },
  { who: 'mariana', ask: 'Quero 4 séries no agachamento em vez de 3.', expect: ['editar_ficha'], check: (c) => changes(c).some((m) => m.tipo === 'series' && m.exercicio_id === 'agachamento-livre' && m.series === 4) },
  { who: 'mariana', ask: 'Coloca o leg press antes do agachamento.', expect: ['editar_ficha'], check: (c) => changes(c).some((m) => m.tipo === 'mover' && m.exercicio_id === 'leg-press-45') || changes(c).some((m) => m.tipo === 'mover' && m.exercicio_id === 'agachamento-livre') },
  { who: 'mariana', ask: 'Descanso de 2 minutos é muito pra mim, quero 90 segundos nos exercícios grandes.', expect: ['editar_ficha', 'mostrar_onde'] },
  { who: 'mariana', ask: 'A academia não tem cadeira flexora, o que eu faço?', expect: ['substitutos', 'editar_ficha'] },
  { who: 'mariana', ask: 'O leg press tá sempre ocupado no horário que eu vou.', expect: ['substitutos', 'editar_ficha'] },
  { who: 'mariana', ask: 'Cria uma ficha de glúteo pra entrar no lugar da Superior B.', expect: ['nova_ficha'], check: (c) => first(c, 'nova_ficha').substitui_ficha_id === 'superior_b' },
  { who: 'mariana', ask: 'Monta uma ficha curta de 30 minutos pra dias corridos.', expect: ['nova_ficha'] },
  { who: 'mariana', ask: 'Quero treinar perna todo dia, 7 dias por semana.', expect: ['propor_plano', 'pergunta', 'resposta'], judge: 'Exagero: deve propor com aviso ou explicar o limite, sem montar 7 dias.' },
  { who: 'mariana', ask: 'Quero 10 séries de rosca direta em cada treino.', expect: ['editar_ficha', 'pergunta', 'resposta'], judge: 'Exagero: pode propor, mas precisa deixar claro o excesso.' },
  { who: 'mariana', ask: 'Meu ombro dói quando faço desenvolvimento.', expect: ['mostrar_onde', 'substitutos', 'resposta', 'editar_ficha'], judge: 'Sem diagnóstico nem tratamento; sugerir marcar a dor, modo retorno, profissional.' },
  { who: 'mariana', ask: 'Como eu mudo para libras?', expect: ['mostrar_onde'], check: (c) => first(c, 'mostrar_onde').lugar === 'ajustes' },
  { who: 'mariana', ask: 'Minha academia tem halter de 1 em 1 kg, dá pra subir de 1 em 1?', expect: ['mostrar_onde'], check: (c) => first(c, 'mostrar_onde').lugar === 'exercicio' },
  { who: 'mariana', ask: 'Faz uma dieta pra eu ganhar massa.', expect: ['nao_consigo'], check: (c) => first(c, 'nao_consigo').categoria === 'nutricao' },
  { who: 'lucas', ask: 'Quero fazer ABCD em vez de ABC.', expect: ['propor_plano'], check: (c) => first(c, 'propor_plano').fichas === 4 },
  { who: 'lucas', ask: 'Acho que já não sou mais iniciante.', expect: ['propor_plano', 'pergunta'] },
  { who: 'lucas', ask: 'Monta uma ficha só de braço pra eu fazer no sábado.', expect: ['nova_ficha'] },
  { who: 'lucas', ask: 'Como eu mando minha ficha pro meu amigo?', expect: ['mostrar_onde'], check: (c) => ['enviar_ficha', 'amigos'].includes(String(first(c, 'mostrar_onde').lugar)) },
  { who: 'lucas', ask: 'Onde eu exporto minhas fichas pra planilha?', expect: ['mostrar_onde'], check: (c) => first(c, 'mostrar_onde').lugar === 'seus_dados' },
  { who: 'lucas', ask: 'Conecta com meu Apple Watch pra contar as calorias.', expect: ['nao_consigo'], check: (c) => first(c, 'nao_consigo').categoria === 'integracao' },
  { who: 'lucas', ask: 'Quero treinar em casa só com elástico.', expect: ['nao_consigo', 'mostrar_onde'] },
  { who: 'lucas', ask: 'Me lembra de beber água durante o treino.', expect: ['nao_consigo'] },
  { who: 'lucas', ask: 'Muda meu treino.', expect: ['pergunta'] },
  { who: 'lucas', ask: 'Coloca abdominal no fim de todas as fichas.', expect: ['editar_ficha'], check: (c) => new Set(c.filter((x) => x.name === 'editar_ficha').map((x) => x.input.ficha_id)).size === 3 },
];

/** What the model did: the first tool, a question back, or a plain answer. */
function kindOf(r: Reply): string {
  if (r.tool_calls.length) return r.tool_calls[0]!.name;
  return r.text.includes('?') ? 'pergunta' : 'resposta';
}

/** Arguments that point at something the person does not have. */
function invalid(r: Reply, who: Who): string[] {
  const fichas = new Map(PEOPLE[who].fichas.map((f) => [f.id, f]));
  const out: string[] = [];
  for (const call of r.tool_calls) {
    const i = call.input;
    if (call.name === 'editar_ficha') {
      const f = fichas.get(String(i.ficha_id));
      if (!f) out.push(`ficha inexistente: ${String(i.ficha_id)}`);
      for (const m of (i.mudancas as Record<string, unknown>[] | undefined) ?? []) {
        if (m.tipo !== 'adicionar' && f && m.exercicio_id && !f.items.some((x) => x.exercise_id === m.exercicio_id))
          out.push(`${String(m.exercicio_id)} não está em ${f.id}`);
      }
    }
    if (call.name === 'nova_ficha' && i.substitui_ficha_id && !fichas.has(String(i.substitui_ficha_id)))
      out.push(`ficha inexistente: ${String(i.substitui_ficha_id)}`);
    if (call.name === 'propor_plano') {
      const d = i.dias_academia as number | undefined;
      if (d != null && (d < 1 || d > 6)) out.push(`dias_academia ${d}`);
    }
  }
  return out;
}

const STYLE = new RegExp(`[${String.fromCodePoint(0x2013, 0x2014)}]|\\p{Extended_Pictographic}`, 'u');

type Message = { role: 'user' | 'assistant'; content: string | unknown[] };

/**
 * The whole conversation, as the app will run it: the model calls tools, the tools run for
 * real (the generator, the substitutes, the risks) and go back, until the model writes to
 * the person. A request that ends without a message for the person counts as wrong.
 */
async function converse(
  model: (typeof MODELS)[number],
  c: Case,
): Promise<Reply & { kind: string; turns: Turn[] }> {
  const messages: Message[] = [
    { role: 'user', content: `${contextText(PEOPLE[c.who])}\n\nPedido: ${c.ask}` },
  ];
  const turns: Turn[] = [];
  const total: Reply = {
    text: '',
    tool_calls: [],
    stop: '',
    usage: { input: 0, output: 0, cached: 0, thinking: 0 },
    ms: 0,
  };
  let kind = '';
  for (let round = 0; round < 4; round += 1) {
    const r = await call(model, messages);
    if (r.error) return { ...total, stop: r.stop, error: r.error, kind, turns };
    if (round === 0) kind = kindOf(r);
    total.text = r.text;
    total.stop = r.stop;
    total.ms += r.ms;
    total.tool_calls.push(...r.tool_calls);
    for (const k of ['input', 'output', 'cached', 'thinking'] as const) total.usage[k] += r.usage[k];
    const uses = (r.assistant ?? []).filter(
      (b): b is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } =>
        (b as { type?: string }).type === 'tool_use',
    );
    const results = uses.map((u) => ({
      type: 'tool_result',
      tool_use_id: u.id,
      content: runAgentTool(u.name, u.input, PEOPLE[c.who]),
    }));
    turns.push({ tool_calls: r.tool_calls, results: results.map((x) => x.content), text: r.text });
    if (r.stop !== 'tool_use' || !uses.length) break;
    messages.push({ role: 'assistant', content: r.assistant ?? [] }, { role: 'user', content: results });
  }
  return { ...total, kind, turns };
}

async function call(model: (typeof MODELS)[number], messages: Message[]): Promise<Reply> {
  const body = {
    provider: model.provider,
    model: model.id,
    effort: model.effort,
    system: agentSystemPrompt(),
    tools: AGENT_TOOLS,
    messages,
  };
  // Two waits for a busy model (a per-minute limit); still busy after them is the daily quota.
  for (let attempt = 0; ; attempt += 1) {
    let res: Response;
    let json: Reply & { error?: string };
    try {
      res = await fetch(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-eval-token': TOKEN },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });
      json = (await res.json()) as Reply & { error?: string };
    } catch (err) {
      return failed(`sem resposta: ${(err as Error).message}`);
    }
    const busy = res.status === 502 && BUSY.test(json.error ?? '');
    if (busy && attempt < 2) {
      await new Promise((ok) => setTimeout(ok, 30_000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) return failed(json.error ?? String(res.status), busy);
    return json;
  }
}

const BUSY = /429|503|RESOURCE_EXHAUSTED|quota|overloaded|UNAVAILABLE/i;

function failed(error: string, quota = false): Reply {
  return {
    text: '',
    tool_calls: [],
    stop: quota ? 'sem cota' : 'erro',
    usage: { input: 0, output: 0, cached: 0, thinking: 0 },
    ms: 0,
    error,
  };
}

function cost(model: (typeof MODELS)[number], r: Reply): number {
  // Claude counts cached tokens apart from input; Gemini counts them inside it.
  const fresh =
    model.provider === 'anthropic' ? r.usage.input : Math.max(0, r.usage.input - r.usage.cached);
  return (fresh * model.inp + r.usage.cached * model.cache + (r.usage.output + r.usage.thinking) * model.out) / 1e6;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

type Row = Reply & { verdict: string; problems: string[]; turns: Turn[] };
type Results = Partial<Record<ModelId, (Row | null)[]>>;

/** Results so far: a run picks up where the last one stopped (quota, crash). */
function load(): Results {
  const empty = Object.fromEntries(MODELS.map((m) => [m.key, CASES.map(() => null)])) as Results;
  if (!existsSync(`${OUT}/comparacao.json`)) return empty;
  const saved = JSON.parse(readFileSync(`${OUT}/comparacao.json`, 'utf8')) as { results: Partial<Results> };
  for (const m of MODELS) {
    const rows = saved.results[m.key] ?? [];
    empty[m.key] = CASES.map((_, n) => {
      const r = rows[n];
      return r && !r.error ? r : null;
    });
  }
  return empty;
}

function save(results: Results) {
  writeFileSync(
    `${OUT}/comparacao.json`,
    JSON.stringify({ cases: CASES.map(({ check: _c, ...rest }) => rest), results }, null, 2),
  );
}

async function main() {
  if (!TOKEN) throw new Error('Falta AGENTE_EVAL_TOKEN');
  mkdirSync(OUT, { recursive: true });
  const results = load();
  for (const model of MODELS) {
    for (const [n, c] of CASES.entries()) {
      if (results[model.key]![n]) continue;
      const { kind, turns, ...r } = await converse(model, c);
      if (r.stop === 'sem cota') {
        console.log(`${model.label}: cota acabou no pedido ${n + 1} (${r.error}). Rode de novo amanhã para completar.`);
        break;
      }
      const problems = [...invalid(r, c.who)];
      const silent = !r.error && !r.text.trim();
      if (silent) problems.push('terminou sem mensagem para a pessoa');
      if (STYLE.test(turns.map((t) => t.text).join(' '))) problems.push('travessão ou emoji no texto');
      const right = !r.error && !silent && c.expect.includes(kind) && (c.check ? c.check(r.tool_calls) : true);
      const verdict = r.error ? 'erro' : !right ? 'errado' : c.judge ? 'ler' : problems.length ? 'com problema' : 'certo';
      results[model.key]![n] = { ...r, verdict, problems, turns };
      save(results);
      console.log(`${model.label} ${n + 1}/${CASES.length}: ${verdict} (${kind}, ${turns.length} rodadas, ${r.ms} ms)${r.error ? ` ${r.error}` : ''}${silent ? ' SEM RESPOSTA' : ''}`);
      if (model.provider === 'gemini') await new Promise((ok) => setTimeout(ok, 4500));
    }
  }

  const summary = MODELS.map((m) => {
    const rs = results[m.key]!.filter((r): r is Row => r !== null);
    const ok = rs.filter((r) => r.verdict === 'certo' || r.verdict === 'ler').length;
    const ms = rs.filter((r) => !r.error).map((r) => r.ms).sort((a, b) => a - b);
    const per = rs.length ? rs.reduce((s, r) => s + cost(m, r), 0) / rs.length : 0;
    return `<tr><td>${m.label}</td><td>${ok} de ${rs.length}${rs.length < CASES.length ? ` (rodou ${rs.length} de ${CASES.length})` : ''}</td><td>${rs.filter((r) => r.problems.length).length}</td><td>${ms[Math.floor(ms.length / 2)] ?? 0} ms</td><td>US$ ${(per * 1000).toFixed(2)}</td></tr>`;
  }).join('');
  const rows = CASES.map((c, n) => {
    const cells = MODELS.map((m) => {
      const r = results[m.key]![n];
      if (!r) return '<td><small>não rodou (cota)</small></td>';
      const turns = (r.turns ?? [])
        .map((t, k) => {
          const calls = t.tool_calls.map((x) => `<pre>${esc(x.name)} ${esc(JSON.stringify(x.input, null, 1))}</pre>`).join('');
          const back = t.results.map((x) => `<pre class="res">${esc(x)}</pre>`).join('');
          return `<div class="turn"><small>Rodada ${k + 1}</small>${t.text ? `<p>${esc(t.text)}</p>` : ''}${calls}${back}</div>`;
        })
        .join('');
      return `<td class="v-${r.verdict.replace(' ', '-')}"><b>${r.verdict}</b> <small>${r.ms} ms</small>${r.problems.length ? `<div class="pb">${esc(r.problems.join('; '))}</div>` : ''}${r.text ? `<p class="final"><small>Mensagem final para a pessoa</small><br>${esc(r.text)}</p>` : ''}${turns}${r.error ? `<p>${esc(r.error)}</p>` : ''}</td>`;
    }).join('');
    return `<tr><th><span>${n + 1}. ${c.who}</span><p>${esc(c.ask)}</p><small>Esperado: ${c.expect.join(' ou ')}${c.judge ? `. ${esc(c.judge)}` : ''}</small></th>${cells}</tr>`;
  }).join('');
  writeFileSync(
    `${OUT}/comparacao.html`,
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agente: comparação de modelos</title><style>
body{font:14px/1.45 system-ui,sans-serif;margin:16px;color:#1d1d1f;background:#fafafa}table{border-collapse:collapse;width:100%;background:#fff}th,td{border:1px solid #ddd;padding:8px;vertical-align:top;text-align:left}
th{width:22%;font-weight:400}th span{font-weight:600}pre{white-space:pre-wrap;font-size:12px;background:#f3f4f6;padding:6px;border-radius:6px;margin:6px 0}
.v-certo b{color:#0a7d36}.v-errado b,.v-erro b{color:#b42318}.v-ler b{color:#9a6700}.v-com-problema b{color:#9a6700}.pb{color:#b42318;font-size:12px}small{color:#666}h1{font-size:20px}
.sum{width:auto;margin-bottom:16px}.sum td,.sum th{width:auto}.final{background:#eef6ff;padding:8px;border-radius:8px}.turn{border-top:1px dashed #ddd;margin-top:8px;padding-top:4px}.res{background:#f6f3e8}</style></head><body><h1>Agente do Anilha: os mesmos ${CASES.length} pedidos em ${MODELS.length} modelos</h1>
<table class="sum"><tr><th>Modelo</th><th>Ferramenta certa</th><th>Com problema</th><th>Tempo (mediana)</th><th>Custo por 1.000 conversas</th></tr>${summary}</table>
<p><small>Conversa completa por pedido: o modelo chama as ferramentas, elas rodam de verdade (gerador, substitutos, avisos de risco) e voltam, até ele escrever para a pessoa. Terminar sem mensagem para a pessoa conta como errado. "ler" é caso de julgamento: a ferramenta está certa, falta ler o texto. Custo pelo preço pago, somando as rodadas.</small></p>
<table><tr><th>Pedido</th>${MODELS.map((m) => `<th>${m.label}</th>`).join('')}</tr>${rows}</table></body></html>`,
  );
  console.log(`${OUT}/comparacao.html`);
}

void main();
