import { ArrowLeft, CalendarCheck, Dumbbell } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccount } from '../app/account';
import { adoptPlan, DEFAULT_REMINDERS, getProfile, updateProfile } from '../data/ops';
import { canOfferReminders, enablePush, isIos, minutesBefore } from '../lib/push';
import { useToast } from '../ui/overlays';
import { useInitialPullDone, useProfile, useToday } from '../data/hooks';
import { EXERCISES_BY_ID } from '../engine/exercises';
import { exerciseFocus } from '../engine/focus';
import { generatePlan } from '../engine/generator';
import { splitName } from '../engine/format';
import { raceDateError } from '../engine/race';
import { ALL_EQUIPMENT, SPLITS } from '../engine/taxonomy';
import type { OnboardingParams } from '../engine/types';
import { Button, CheckRow, Icon, LoadingCard, Meter, TextField, Widget } from '../ui/primitives';
import { WeekStrip } from './parts/planVisuals';
import {
  AgeQuestion,
  FocusQuestion,
  focusList,
  GenderQuestion,
  GoalQuestion,
  LevelQuestion,
  MinutesQuestion,
  pickSplit,
  placeOf,
  PlaceQuestion,
  RaceQuestion,
  ReturningQuestion,
  SplitQuestion,
  WeekQuestion,
  withSplit,
  type Place,
} from './parts/trainingQuestions';

export function defaultParams(name = ''): OnboardingParams {
  return {
    // A name typed before in one field comes split: first word, then the rest.
    ...splitName(name),
    goal: 'hipertrofia',
    gym_days: 3,
    run_days: 0,
    force_gym_days: false,
    minutes: 60,
    equipment: [...ALL_EQUIPMENT],
    level: 'intermediario',
    spare_joints: [],
    returning: false,
    time: '06:00',
    fichas: 3,
    focus: ['equilibrado'],
    age_range: null,
    gender: null,
  };
}

/**
 * One question per screen, then the plan with every choice explained. Nothing about health
 * here: joints to spare are asked later, in Você, and only with the separate consent.
 */
type StepKey =
  | 'nome'
  | 'idade'
  | 'objetivo'
  | 'prova'
  | 'foco'
  | 'nivel'
  | 'pausa'
  | 'local'
  | 'semana'
  | 'duracao'
  | 'divisao'
  | 'genero'
  | 'plano';

const ORDER: StepKey[] = [
  'nome',
  'idade',
  'objetivo',
  'prova',
  'foco',
  'nivel',
  'pausa',
  'local',
  'semana',
  'duracao',
  'divisao',
  'genero',
  'plano',
];

const TITLE: Record<StepKey, string> = {
  nome: 'Vamos montar seu plano',
  idade: 'Qual a sua idade?',
  objetivo: 'Qual o seu objetivo principal?',
  prova: 'Tem prova marcada?',
  foco: 'Quer mais foco em algum grupo?',
  nivel: 'Qual o seu nível?',
  pausa: 'Está voltando de uma pausa longa?',
  local: 'Onde você treina?',
  semana: 'Quantos dias por semana?',
  duracao: 'Quanto tempo por treino?',
  divisao: 'Como dividir os treinos?',
  genero: 'Como você se identifica?',
  plano: 'Seu plano da semana',
};

export default function Onboarding() {
  const profile = useProfile();
  const pulled = useInitialPullDone();
  if (profile === undefined || pulled === undefined)
    return (
      <main className="app-main">
        <LoadingCard />
      </main>
    );
  return (
    <OnboardingFlow
      initial={profile?.onboarding ?? defaultParams(profile?.display_name ?? '')}
      splitChosen={!!profile?.onboarding?.split_style}
    />
  );
}

function OnboardingFlow({
  initial,
  splitChosen,
}: {
  initial: OnboardingParams;
  /** A plan made before keeps its split; a new one follows the suggestion for the days. */
  splitChosen: boolean;
}) {
  const { email } = useAccount();
  const today = useToday();
  const navigate = useNavigate();
  const [key, setKey] = useState<StepKey>('nome');
  const [p, setP] = useState<OnboardingParams>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [remind, setRemind] = useState(true);
  const offerReminder = useMemo(() => canOfferReminders(), []);
  const toast = useToast();
  // The split suggestion follows the days and the focus until the person picks one.
  const [splitPicked, setSplitPicked] = useState(splitChosen);
  const [place, setPlace] = useState<Place>(() => placeOf(initial.equipment));
  const set = <K extends keyof OnboardingParams>(k: K, v: OnboardingParams[K]) => {
    setError(null);
    setP((x) => ({ ...x, [k]: v }));
  };

  const steps = ORDER.filter(
    (k) =>
      (k !== 'prova' || p.goal === 'corrida' || !!p.race) && (k !== 'divisao' || p.gym_days > 0),
  );
  const index = Math.max(0, steps.indexOf(key));
  const effective = useMemo(() => withSplit(p, splitPicked), [p, splitPicked]);
  const plan = useMemo(
    () => (key === 'divisao' || key === 'plano' ? generatePlan(effective) : null),
    [effective, key],
  );
  const weekLine = plan?.reasons.find(
    (r) => r.includes('giram') || r.includes('Uma ficha') || r.includes('a seguinte começa'),
  );

  /** What blocks the step, if anything. */
  function problem(): string | null {
    if (key === 'nome' && !p.first_name.trim()) return 'Diga seu nome';
    if (key === 'nome' && !p.last_name?.trim()) return 'Diga seu sobrenome';
    if (key === 'idade' && !p.age_range) return 'Escolha uma faixa';
    if (key === 'prova' && p.race) return raceDateError(p.race.date, today);
    if (key === 'semana' && p.gym_days + p.run_days === 0) return 'Escolha ao menos um dia';
    return null;
  }

  function next() {
    const why = problem();
    if (why) {
      setError(why);
      return;
    }
    setError(null);
    const to = steps[index + 1];
    if (to) {
      setKey(to);
      window.scrollTo(0, 0);
    }
  }

  function back() {
    setError(null);
    const to = steps[index - 1];
    if (to) setKey(to);
  }

  async function finish() {
    if (!plan) return;
    // The browser asks for notifications only inside the tap: ask before anything else.
    const push = offerReminder && remind ? enablePush() : null;
    setSaving(true);
    try {
      await adoptPlan(plan, effective, today);
      const current = (await getProfile())?.reminders ?? DEFAULT_REMINDERS;
      if (push) {
        const r = await push;
        await updateProfile({
          reminders: {
            ...current,
            enabled: r.ok,
            weekly: r.ok,
            gym_time: minutesBefore(p.time),
            offered: true,
          },
        });
        if (!r.ok && r.message) toast.show(r.message, { error: true });
      } else if (offerReminder) {
        // Said no here: Today does not ask again.
        await updateProfile({ reminders: { ...current, offered: true } });
      }
      navigate('/', { replace: true });
    } finally {
      setSaving(false);
    }
  }

  let body: ReactNode = null;
  if (key === 'nome')
    body = (
      <>
        <TextField
          label="Nome"
          autoComplete="given-name"
          value={p.first_name}
          maxLength={40}
          onChange={(e) => set('first_name', e.target.value)}
          error={error === 'Diga seu nome' ? error : null}
        />
        <TextField
          label="Sobrenome"
          autoComplete="family-name"
          value={p.last_name ?? ''}
          maxLength={60}
          onChange={(e) => set('last_name', e.target.value)}
          error={error === 'Diga seu sobrenome' ? error : null}
        />
        <p className="t-caption" style={{ margin: 0 }}>
          O app chama você pelo primeiro nome. O nome completo aparece para amigos, grupos e quem
          recebe um convite seu.
        </p>
      </>
    );
  else if (key === 'idade')
    body = <AgeQuestion value={p.age_range} error={error} onChange={(a) => set('age_range', a)} />;
  else if (key === 'objetivo')
    body = <GoalQuestion value={p.goal} onChange={(g) => set('goal', g)} />;
  else if (key === 'prova')
    body = (
      <RaceQuestion race={p.race} today={today} error={error} onChange={(r) => set('race', r)} />
    );
  else if (key === 'foco')
    body = <FocusQuestion value={focusList(p)} onChange={(f) => set('focus', f)} />;
  else if (key === 'nivel')
    body = <LevelQuestion value={p.level} onChange={(l) => set('level', l)} />;
  else if (key === 'pausa')
    body = <ReturningQuestion value={p.returning} onChange={(v) => set('returning', v)} />;
  else if (key === 'local')
    body = (
      <PlaceQuestion
        place={place}
        equipment={p.equipment}
        onPlace={setPlace}
        onEquipment={(e) => set('equipment', e)}
      />
    );
  else if (key === 'semana')
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
  else if (key === 'duracao')
    body = <MinutesQuestion value={p.minutes} onChange={(m) => set('minutes', m)} />;
  else if (key === 'divisao')
    body = (
      <SplitQuestion
        p={effective}
        plan={plan}
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
  else if (key === 'genero')
    body = <GenderQuestion value={p.gender} onChange={(g) => set('gender', g)} />;
  else if (key === 'plano' && plan)
    body = (
      <>
        <Widget
          icon={CalendarCheck}
          pastel="butter"
          title={`${plan.gym_per_week} de academia${plan.run_per_week ? `, ${plan.run_per_week} ${plan.run_per_week === 1 ? 'corrida' : 'corridas'}` : ''}`}
          sub={weekLine ?? `Sempre às ${p.time}`}
        >
          <WeekStrip days={plan.days} rotation={plan.rules.rotation} />
        </Widget>
        {plan.routines.map((r) => (
          <Widget
            key={r.split_key}
            icon={Dumbbell}
            pastel={SPLITS[r.split_key].pastel}
            title={r.name}
            sub={r.reason}
          >
            <ol className="stack-sm t-regular" style={{ margin: 0, paddingLeft: 20 }}>
              {r.items.map((it) => (
                <li key={it.exercise_id}>
                  {EXERCISES_BY_ID.get(it.exercise_id)?.name}{' '}
                  <span className="t-muted">
                    {it.sets}x {it.target_min}-{it.target_max}
                    {EXERCISES_BY_ID.get(it.exercise_id)?.measure === 'time' ? ' s' : ''}
                    {it.warmup_sets ? ` + ${it.warmup_sets} aquec.` : ''}
                  </span>
                  <span className="ex-focus t-caption">
                    {exerciseFocus(
                      EXERCISES_BY_ID.get(it.exercise_id) ?? { id: it.exercise_id, muscles: [] },
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </Widget>
        ))}
        <Widget title="Por que assim">
          <ul className="stack-sm t-regular" style={{ margin: 0, paddingLeft: 20 }}>
            {plan.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Widget>
        <TextField
          label="Horário dos treinos"
          type="time"
          value={p.time}
          onChange={(e) => set('time', e.target.value || '06:00')}
        />
        {offerReminder ? (
          <div className="stack-sm">
            <CheckRow
              label={`Me lembrar do treino 30 minutos antes, às ${minutesBefore(p.time)}${plan.run_per_week ? ', e na véspera das corridas' : ''}`}
              checked={remind}
              onChange={setRemind}
            />
            <span className="t-caption">
              No domingo à noite chega o resumo da semana. Tudo isso muda em Ajustes.
            </span>
          </div>
        ) : isIos() ? (
          <p className="t-caption" style={{ margin: 0 }}>
            Para receber lembretes no iPhone, instale o app na tela de início.
          </p>
        ) : null}
        <p className="t-caption" style={{ margin: 0 }}>
          Dá para mudar qualquer resposta depois em Você, Perfil de treino.
        </p>
      </>
    );

  return (
    <main className="app-main" style={{ maxWidth: 640 }}>
      <div className="stack-sm">
        <div className="row">
          {index > 0 ? (
            <button type="button" className="hb-btn-link" onClick={back}>
              <Icon icon={ArrowLeft} size={18} />
              Voltar
            </button>
          ) : (
            <span className="t-caption">{email}</span>
          )}
          <span className="spacer" />
          <span className="t-caption">
            Passo {index + 1} de {steps.length}
          </span>
        </div>
        <Meter value={(index + 1) / steps.length} label={`Passo ${index + 1} de ${steps.length}`} />
      </div>

      <section className="stack" key={key}>
        <h1 className="page-title">{TITLE[key]}</h1>
        {body}
      </section>

      <div className="actions">
        {key !== 'plano' ? (
          <Button variant="primary" block onClick={next}>
            {key === 'genero' && !p.gender ? 'Pular' : 'Continuar'}
          </Button>
        ) : (
          <Button variant="primary" block onClick={() => void finish()} disabled={saving}>
            {saving ? 'Salvando' : 'Usar este plano'}
          </Button>
        )}
      </div>
    </main>
  );
}
