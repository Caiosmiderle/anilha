import { ArrowLeft, ArrowRight, Check, ChevronRight, CircleHelp, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useProfile, useReturnMode, useToday } from '../data/hooks';
import { adoptPlan, saveTrainingProfile, updateProfile } from '../data/ops';
import { EXERCISES_BY_ID } from '../engine/exercises';
import { formatDDMM } from '../engine/dates';
import { plural } from '../engine/format';
import { generatePlan } from '../engine/generator';
import { raceDateError, raceLabel } from '../engine/race';
import { JOINT_LABEL } from '../engine/taxonomy';
import type { OnboardingParams, ProfileRow } from '../engine/types';
import { healthOn, useConsent } from '../sync/consent';
import { useToast } from '../ui/overlays';
import {
  Button,
  ErrorText,
  Icon,
  IconButton,
  LoadingCard,
  Segmented,
  TextField,
  Widget,
} from '../ui/primitives';
import { HealthOffCard } from './parts/HealthConsent';
import { BodyMap, WeekStrip } from './parts/planVisuals';
import {
  AGE_LABEL,
  AgeQuestion,
  FocusQuestion,
  focusList,
  focusSummary,
  GENDER_LABEL,
  GenderQuestion,
  GOAL_LABEL,
  GoalQuestion,
  LEVEL_LABEL,
  LevelQuestion,
  MinutesQuestion,
  pickSplit,
  PLACE_LABEL,
  placeOf,
  PlaceQuestion,
  RaceQuestion,
  ReturningQuestion,
  SPLIT_LABEL,
  SplitQuestion,
  WeekQuestion,
  withSplit,
  type Place,
} from './parts/trainingQuestions';

/** One form, two intentions: save preferences, or review and explicitly replace a plan. */
export default function TrainingProfile() {
  const profile = useProfile();
  if (profile === undefined) return <LoadingCard lines={6} />;
  if (!profile?.onboarding) return <Navigate to="/comecar" replace />;
  return <Editor key={profile.id} initial={profile.onboarding} />;
}

type Field =
  | 'objetivo'
  | 'prova'
  | 'foco'
  | 'nivel'
  | 'pausa'
  | 'idade'
  | 'genero'
  | 'local'
  | 'semana'
  | 'duracao'
  | 'horario'
  | 'divisao'
  | 'articulacoes';

const TITLE: Record<Field, string> = {
  objetivo: 'Objetivo',
  prova: 'Prova',
  foco: 'Foco',
  nivel: 'Nível',
  pausa: 'Voltando de pausa',
  idade: 'Faixa de idade',
  genero: 'Gênero',
  local: 'Onde treina',
  semana: 'Dias por semana',
  duracao: 'Tempo por treino',
  horario: 'Horário dos treinos',
  divisao: 'Divisão',
  articulacoes: 'Articulações a poupar',
};

function Editor({ initial }: { initial: OnboardingParams }) {
  const today = useToday();
  const navigate = useNavigate();
  const toast = useToast();
  const { health } = useConsent();
  const [search] = useSearchParams();
  const newPlan = search.get('acao') === 'novo-plano';
  const [baseline, setBaseline] = useState(() => ({
    ...initial,
    spare_joints: health ? initial.spare_joints : [],
  }));
  const [p, setP] = useState<OnboardingParams>(() => ({
    ...initial,
    spare_joints: health ? initial.spare_joints : [],
  }));
  const [previousHealth, setPreviousHealth] = useState(health);
  if (previousHealth !== health) {
    setPreviousHealth(health);
    if (!health) {
      setP((draft) => ({ ...draft, spare_joints: [] }));
      setBaseline((saved) => ({ ...saved, spare_joints: [] }));
    }
  }
  const [selected, setSelected] = useState<Field>('objetivo');
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const card = useRef<HTMLElement>(null);
  const questionBody = useRef<HTMLDivElement>(null);
  const questionNav = useRef<HTMLOListElement>(null);
  const focusNext = useRef(false);
  const revealNext = useRef(false);
  const [place, setPlace] = useState<Place>(() => placeOf(initial.equipment));
  const [splitPicked, setSplitPicked] = useState(!!initial.split_style);
  const effective = useMemo(
    () => withSplit({ ...p, spare_joints: health ? p.spare_joints : [] }, splitPicked),
    [p, splitPicked, health],
  );
  const changed =
    JSON.stringify({ ...p, spare_joints: effective.spare_joints }) !==
    JSON.stringify({ ...baseline, spare_joints: health ? baseline.spare_joints : [] });
  // Consent can change in another tab while this draft is open.
  const open =
    selected === 'articulacoes' && !health
      ? 'objetivo'
      : selected === 'divisao' && !p.gym_days
        ? 'semana'
        : selected === 'prova' && p.goal !== 'corrida' && !p.race
          ? 'objetivo'
          : selected;
  const preview = useMemo(
    () => (confirm || open === 'divisao' ? generatePlan(effective) : null),
    [confirm, open, effective],
  );
  const set = <K extends keyof OnboardingParams>(k: K, v: OnboardingParams[K]) => {
    setError(null);
    setP((x) => ({ ...x, [k]: v }));
  };

  useEffect(() => {
    if (!focusNext.current) return;
    focusNext.current = false;
    card.current?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
    if (revealNext.current) {
      revealNext.current = false;
      card.current?.scrollIntoView({ block: 'start' });
    }
    if (questionBody.current) questionBody.current.scrollTop = 0;
    const nav = questionNav.current;
    const active = nav?.querySelector<HTMLButtonElement>('[aria-current="step"]');
    if (nav && active) {
      // Reveal the active step inside its own rail; never scroll the document.
      nav.scrollLeft = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
      nav.scrollTop = Math.max(0, active.offsetTop - (nav.clientHeight - active.offsetHeight) / 2);
    }
  }, [open, confirm]);

  useEffect(() => {
    if (!changed) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [changed]);

  /** Validate before leaving a question or committing either intention. */
  function problem(field: Field | null): string | null {
    if ((field === 'prova' || field === null) && p.race) return raceDateError(p.race.date, today);
    if ((field === 'semana' || field === null) && p.gym_days + p.run_days === 0)
      return 'Escolha ao menos um dia';
    return null;
  }

  function go(field: Field, reveal = false) {
    const why = problem(open);
    if (why) {
      setError(why);
      return;
    }
    setError(null);
    if (field === open && !confirm) {
      card.current?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
      if (reveal) card.current?.scrollIntoView({ block: 'start' });
      if (questionBody.current) questionBody.current.scrollTop = 0;
      return;
    }
    focusNext.current = true;
    revealNext.current = reveal || confirm;
    setConfirm(false);
    setSelected(field);
  }

  function valid() {
    const why = problem(null);
    if (why) {
      setError(why);
      focusNext.current = true;
      revealNext.current = true;
      setConfirm(false);
      setSelected(p.race && raceDateError(p.race.date, today) ? 'prova' : 'semana');
      return false;
    }
    return true;
  }

  function ask() {
    if (!valid()) return;
    setError(null);
    focusNext.current = true;
    revealNext.current = true;
    setConfirm(true);
  }

  async function commit(replacePlan: boolean) {
    if (busy.current || !valid() || (replacePlan && !preview)) return;
    busy.current = true;
    setError(null);
    setSaving(true);
    try {
      const params = { ...effective, spare_joints: healthOn() ? effective.spare_joints : [] };
      if (replacePlan) {
        // Generate from the current consent, including if it changed since review opened.
        await adoptPlan(generatePlan(params), params, today);
        toast.show('Plano novo pronto');
        navigate('/plano');
      } else {
        await saveTrainingProfile(params);
        setBaseline(params);
        setP(params);
        setSplitPicked(!!params.split_style);
        toast.show('Perfil salvo. Seu plano foi mantido.');
      }
    } catch {
      setError('Não foi possível salvar. Suas respostas continuam aqui. Tente novamente.');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  const rows: [Field, string][] = [
    ['objetivo', GOAL_LABEL[p.goal]],
    ...(p.goal === 'corrida' || p.race
      ? [
          [
            'prova',
            p.race
              ? `${raceLabel(p.race.distance_km)}${p.race.date ? ` em ${formatDDMM(p.race.date)}` : ''}`
              : 'Sem prova marcada',
          ] as [Field, string],
        ]
      : []),
    ['foco', focusSummary(p)],
    ['nivel', LEVEL_LABEL[p.level]],
    ['pausa', p.returning ? 'Sim' : 'Não'],
    ['local', PLACE_LABEL[place]],
    [
      'semana',
      [
        p.gym_days ? `${p.gym_days} de academia` : '',
        p.run_days ? `${p.run_days} ${plural(p.run_days, 'corrida', 'corridas')}` : '',
      ]
        .filter(Boolean)
        .join(', ') || 'Nenhum dia',
    ],
    ['duracao', `${p.minutes} min`],
    ['horario', p.time],
    ...(p.gym_days > 0
      ? [
          [
            'divisao',
            effective.split_style ? SPLIT_LABEL[effective.split_style] : 'Pelos dias da semana',
          ] as [Field, string],
        ]
      : []),
    ['idade', p.age_range ? AGE_LABEL[p.age_range] : 'Não informada'],
    ['genero', p.gender ? GENDER_LABEL[p.gender] : 'Não informado'],
    ...(health
      ? [
          [
            'articulacoes',
            effective.spare_joints.length
              ? effective.spare_joints.map((j) => JOINT_LABEL[j]).join(', ')
              : 'Nenhuma',
          ] as [Field, string],
        ]
      : []),
  ];

  let body: ReactNode = null;
  if (open === 'objetivo') body = <GoalQuestion value={p.goal} onChange={(g) => set('goal', g)} />;
  else if (open === 'prova')
    body = (
      <RaceQuestion race={p.race} today={today} error={error} onChange={(r) => set('race', r)} />
    );
  else if (open === 'foco')
    body = <FocusQuestion value={focusList(p)} onChange={(f) => set('focus', f)} />;
  else if (open === 'nivel')
    body = <LevelQuestion value={p.level} onChange={(l) => set('level', l)} />;
  else if (open === 'pausa')
    body = <ReturningQuestion value={p.returning} onChange={(v) => set('returning', v)} />;
  else if (open === 'idade')
    body = <AgeQuestion value={p.age_range} onChange={(a) => set('age_range', a)} />;
  else if (open === 'genero')
    body = <GenderQuestion value={p.gender} onChange={(g) => set('gender', g)} />;
  else if (open === 'local')
    body = (
      <PlaceQuestion
        place={place}
        equipment={p.equipment}
        onPlace={setPlace}
        onEquipment={(e) => set('equipment', e)}
      />
    );
  else if (open === 'semana')
    body = (
      <WeekQuestion
        p={p}
        setP={(u) => {
          setError(null);
          setP(u);
        }}
        error={error}
      />
    );
  else if (open === 'duracao')
    body = <MinutesQuestion value={p.minutes} onChange={(m) => set('minutes', m)} />;
  else if (open === 'horario')
    body = (
      <TextField
        label="Horário dos treinos"
        type="time"
        value={p.time}
        onChange={(e) => set('time', e.target.value || '06:00')}
      />
    );
  else if (open === 'divisao')
    body = (
      <SplitQuestion
        p={effective}
        plan={preview}
        onPick={(s) => {
          setSplitPicked(true);
          setP((x) => pickSplit(withSplit(x, splitPicked), s));
        }}
        onFichas={(f) => {
          setSplitPicked(true);
          setP((x) => ({ ...withSplit(x, splitPicked), fichas: f }));
        }}
      />
    );
  else if (open === 'articulacoes')
    body = (
      <>
        <p className="t-regular t-muted" style={{ margin: 0 }}>
          Toque no que pede cuidado. Os exercícios que forçam essas partes ficam de fora.
        </p>
        <BodyMap
          selected={effective.spare_joints}
          onToggle={(j) =>
            set(
              'spare_joints',
              effective.spare_joints.includes(j)
                ? effective.spare_joints.filter((x) => x !== j)
                : [...effective.spare_joints, j],
            )
          }
        />
      </>
    );

  const index = rows.findIndex(([field]) => field === open);
  const previousField = rows[index - 1]?.[0];
  const nextField = rows[index + 1]?.[0];
  const reset = () => {
    setP({ ...baseline, spare_joints: health ? baseline.spare_joints : [] });
    setPlace(placeOf(baseline.equipment));
    setSplitPicked(!!baseline.split_style);
    setError(null);
  };

  return (
    <div className="training-form stack">
      <header className="page-head">
        <div>
          <h1 className="page-title">{newPlan ? 'Plano novo' : 'Perfil de treino'}</h1>
          <p className="page-sub">
            {newPlan
              ? 'Confira suas respostas. Você verá o plano antes de trocar.'
              : 'Ajuste uma resposta ou várias. Depois, salve o perfil ou escolha um plano novo.'}
          </p>
        </div>
      </header>

      <div className="training-editor-layout">
        <nav className="training-step-nav" aria-label="Perguntas do perfil">
          <div className="training-step-nav-head">
            <span className="t-label">Perguntas</span>
            <span className="t-caption">Escolha o que quer mudar</span>
          </div>
          <ol ref={questionNav}>
            {rows.map(([field], step) => (
              <li key={field}>
                <button
                  type="button"
                  aria-label={TITLE[field]}
                  aria-current={!confirm && field === open ? 'step' : undefined}
                  disabled={saving}
                  onClick={() => go(field)}
                >
                  <span className="training-step-number" aria-hidden="true">
                    {step + 1}
                  </span>
                  <span>{TITLE[field]}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
        <div className="training-editor-main stack">
          <section
            ref={card}
            className={`training-card${confirm ? ' is-review' : ' is-question'}`}
            aria-label={confirm ? 'Revisão do plano' : 'Formulário de treino'}
            aria-busy={saving}
          >
            <fieldset disabled={saving} className="training-card-fields">
              <div className="training-card-head">
                <span className="training-card-icon">
                  <Icon icon={confirm ? RefreshCw : CircleHelp} />
                </span>
                <span className="t-caption">
                  {confirm ? 'Antes de trocar' : `Pergunta ${index + 1} de ${rows.length}`}
                </span>
                <span className="training-card-status">
                  {confirm ? 'Sua confirmação' : changed ? 'Não salvo' : 'Respostas salvas'}
                </span>
              </div>
              {confirm && preview ? (
                <div className="training-card-body stack">
                  <h2 className="training-card-title" tabIndex={-1}>
                    Este será seu novo plano
                  </h2>
                  <p className="t-regular t-muted">
                    O plano e as fichas de agora vão para o histórico, e o novo começa hoje. Seus
                    treinos próprios e os treinos já feitos ficam.
                  </p>
                  <dl className="training-review-values">
                    <div>
                      <dt>Objetivo</dt>
                      <dd>{GOAL_LABEL[effective.goal]}</dd>
                    </div>
                    <div>
                      <dt>Foco</dt>
                      <dd>{focusSummary(effective)}</dd>
                    </div>
                    <div>
                      <dt>Semana</dt>
                      <dd>
                        {preview.gym_per_week} de academia, {preview.run_per_week} de corrida
                      </dd>
                    </div>
                    <div>
                      <dt>Por treino</dt>
                      <dd>
                        {effective.minutes} min · {effective.time}
                      </dd>
                    </div>
                  </dl>
                  <WeekStrip days={preview.days} rotation={preview.rules.rotation} />
                  <div className="stack-sm">
                    {preview.routines.map((routine) => (
                      <details className="training-review-routine" key={routine.split_key}>
                        <summary>
                          {routine.name}
                          <span className="t-caption">{routine.items.length} exercícios</span>
                        </summary>
                        <ol className="stack-sm t-regular">
                          {routine.items.map((item) => (
                            <li key={item.exercise_id}>
                              {EXERCISES_BY_ID.get(item.exercise_id)?.name ?? item.exercise_id}
                              <span className="t-caption">
                                {item.sets} × {item.target_min}-{item.target_max}
                                {EXERCISES_BY_ID.get(item.exercise_id)?.measure === 'time'
                                  ? ' s'
                                  : ' rep.'}{' '}
                                · descanso {item.rest_sec} s
                                {item.warmup_sets ? ` · ${item.warmup_sets} aquec.` : ''}
                              </span>
                            </li>
                          ))}
                        </ol>
                      </details>
                    ))}
                  </div>
                  <details className="training-review-routine">
                    <summary>Por que este plano</summary>
                    <ul className="stack-sm t-regular">
                      {preview.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </details>
                  <p className="t-caption">
                    Com as mesmas respostas, o plano pode ser igual ao anterior. Ele segue suas
                    preferências, sem sorteio.
                  </p>
                  {error ? <ErrorText>{error}</ErrorText> : null}
                  <div className="stack-sm">
                    <Button variant="primary" block icon={Check} onClick={() => void commit(true)}>
                      {saving ? 'Salvando…' : 'Gerar plano novo'}
                    </Button>
                    <Button
                      block
                      onClick={() => {
                        focusNext.current = true;
                        revealNext.current = true;
                        setConfirm(false);
                        setError(null);
                      }}
                    >
                      Voltar às respostas
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="training-question-heading">
                    <h2 className="training-card-title" tabIndex={-1}>
                      {TITLE[open]}
                    </h2>
                  </div>
                  <div
                    ref={questionBody}
                    className="training-question-body stack"
                    role="region"
                    aria-label={`Opções: ${TITLE[open]}`}
                    tabIndex={0}
                  >
                    <div className="stack" key={open}>
                      {body}
                    </div>
                    {error ? <ErrorText>{error}</ErrorText> : null}
                  </div>
                  <div className="training-question-footer">
                    <IconButton
                      icon={ArrowLeft}
                      label="Pergunta anterior"
                      disabled={!previousField}
                      onClick={() => previousField && go(previousField)}
                    />
                    <div className="training-progress" aria-hidden="true">
                      {rows.map(([field], i) => (
                        <span key={field} data-active={i === index} data-done={i < index} />
                      ))}
                    </div>
                    <IconButton
                      icon={ArrowRight}
                      label={index === rows.length - 1 ? 'Revisar plano novo' : 'Próxima pergunta'}
                      onClick={() => (nextField ? go(nextField) : ask())}
                    />
                  </div>
                </>
              )}
            </fieldset>
          </section>

          {!confirm ? (
            <div className="stack-sm training-form-actions" aria-busy={saving}>
              {newPlan ? (
                <>
                  <Button variant="primary" block icon={RefreshCw} disabled={saving} onClick={ask}>
                    Revisar plano novo
                  </Button>
                  <p className="t-caption">Você só troca de plano depois de confirmar a prévia.</p>
                  {changed ? (
                    <Button block disabled={saving} onClick={() => void commit(false)}>
                      {saving ? 'Salvando…' : 'Salvar só o perfil'}
                    </Button>
                  ) : null}
                </>
              ) : (
                <>
                  <Button
                    variant="primary"
                    block
                    icon={Check}
                    disabled={!changed || saving}
                    onClick={() => void commit(false)}
                  >
                    {saving ? 'Salvando…' : 'Salvar perfil'}
                  </Button>
                  <p className="t-caption">
                    Salva suas preferências sem substituir o plano e as fichas atuais. As sugestões
                    do app passam a considerar seu perfil atualizado.
                  </p>
                  <Button block icon={RefreshCw} disabled={saving} onClick={ask}>
                    Revisar plano novo
                  </Button>
                </>
              )}
              {changed ? (
                <Button variant="ghost" block disabled={saving} onClick={reset}>
                  Descartar mudanças
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      {!confirm ? (
        <>
          <details className="training-answers hb-widget">
            <summary>Revisar todas as respostas</summary>
            <section aria-label="Suas respostas" className="hb-list">
              {rows.map(([field, value]) => (
                <button
                  key={field}
                  type="button"
                  className="hb-list-row"
                  disabled={saving}
                  aria-label={`${TITLE[field]}: ${value}. Mudar`}
                  onClick={() => go(field, true)}
                >
                  <span className="hb-list-main">
                    <span className="hb-list-sub" style={{ display: 'block' }}>
                      {TITLE[field]}
                    </span>
                    <span className="hb-list-title" style={{ display: 'block' }}>
                      {value}
                    </span>
                  </span>
                  <Icon icon={ChevronRight} className="t-muted" />
                </button>
              ))}
            </section>
          </details>
          <ReturnMode />
          {!health ? <HealthOffCard title="Quer poupar alguma articulação?" /> : null}
        </>
      ) : null}
    </div>
  );
}

/** Back from a long break: fewer sets and more room per set for 4 weeks. */
function ReturnMode() {
  const profile = useProfile();
  const today = useToday();
  const ret = useReturnMode(today);
  if (!profile) return null;
  return (
    <Widget title="Modo retorno" sub="Este ajuste é salvo na hora, sem trocar o plano.">
      <div className="stack">
        <Segmented<ProfileRow['return_mode']>
          label="Modo retorno"
          value={profile.return_mode}
          options={[
            { value: 'auto', label: 'Automático' },
            { value: 'on', label: 'Ligado' },
            { value: 'off', label: 'Desligado' },
          ]}
          onChange={(return_mode) =>
            void updateProfile({
              return_mode,
              return_started_on:
                return_mode === 'on'
                  ? (profile.return_started_on ?? today)
                  : profile.return_started_on,
            })
          }
        />
        <p className="t-regular t-muted" style={{ margin: 0 }}>
          {ret.active
            ? `Ativo até ${ret.ends_on ? formatDDMM(ret.ends_on) : ''}: até 10 séries por grupo na semana e 2 a 3 repetições na reserva.`
            : 'Liga sozinho depois de mais de 3 semanas sem treino e dura 4 semanas.'}
        </p>
      </div>
    </Widget>
  );
}
