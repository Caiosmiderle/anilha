/**
 * The questions of the training profile, one component each: the onboarding shows one per
 * screen, and Você, Perfil de treino, edits the same ones later. Optional questions say in
 * one line what the answer is for.
 */
import { Building2, House, Moon, SlidersHorizontal, Warehouse } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { addDays, onWeekday, WEEKDAY_SHORT } from '../../engine/dates';
import { joinPt, plural } from '../../engine/format';
import {
  type GeneratedPlan,
  FOCUS_LABEL,
  fichasFor,
  focusesOf,
  splitFocus,
  suggestedSplit,
} from '../../engine/generator';
import { RACE_DISTANCES } from '../../engine/race';
import { ALL_EQUIPMENT, EQUIPMENT_LABEL } from '../../engine/taxonomy';
import type {
  AgeRange,
  Equipment,
  Gender,
  Goal,
  Level,
  OnboardingParams,
  Race,
  RaceDistance,
  SplitStyle,
  TrainingFocus,
} from '../../engine/types';
import {
  Choices,
  ErrorText,
  Icon,
  Segmented,
  Stepper,
  TextField,
  Widget,
} from '../../ui/primitives';
import { FichaPills, OptionCards, WeekStrip } from './planVisuals';

type SetParams = Dispatch<SetStateAction<OnboardingParams>>;

/** A line under the question: what it is for, or what to expect. */
function Note({ children }: { children: string }) {
  return (
    <p className="t-caption" style={{ margin: 0 }}>
      {children}
    </p>
  );
}

// Place and equipment.

export type Place = 'completa' | 'pequena' | 'casa' | 'custom';

export const PLACES: Record<Exclude<Place, 'custom'>, Equipment[]> = {
  completa: [...ALL_EQUIPMENT],
  pequena: ['halteres', 'polia', 'peso_corporal', 'barra_fixa'],
  casa: ['halteres', 'peso_corporal'],
};

export const PLACE_LABEL: Record<Place, string> = {
  completa: 'Academia completa',
  pequena: 'Academia pequena ou de prédio',
  casa: 'Em casa',
  custom: 'Do meu jeito',
};

export function placeOf(equipment: Equipment[]): Place {
  for (const [place, list] of Object.entries(PLACES) as [Exclude<Place, 'custom'>, Equipment[]][]) {
    if (list.length === equipment.length && list.every((e) => equipment.includes(e))) return place;
  }
  return 'custom';
}

export function PlaceQuestion({
  place,
  equipment,
  onPlace,
  onEquipment,
}: {
  place: Place;
  equipment: Equipment[];
  onPlace: (p: Place) => void;
  onEquipment: (e: Equipment[]) => void;
}) {
  return (
    <>
      <OptionCards<Place>
        label="Onde você treina"
        value={place}
        onChange={(v) => {
          onPlace(v);
          if (v !== 'custom') onEquipment(PLACES[v]);
        }}
        options={[
          {
            value: 'completa',
            icon: Building2,
            title: PLACE_LABEL.completa,
            text: 'Máquinas, polias, barras e halteres.',
          },
          {
            value: 'pequena',
            icon: Warehouse,
            title: PLACE_LABEL.pequena,
            text: 'Halteres, uma estação de polia e barra fixa.',
          },
          {
            value: 'casa',
            icon: House,
            title: PLACE_LABEL.casa,
            text: 'Halteres e o peso do corpo.',
          },
          {
            value: 'custom',
            icon: SlidersHorizontal,
            title: PLACE_LABEL.custom,
            text: 'Escolho item por item.',
          },
        ]}
      />
      {place === 'custom' ? (
        <>
          <Choices<Equipment>
            label="Equipamento"
            options={ALL_EQUIPMENT.filter((e) => e !== 'peso_corporal').map((e) => ({
              value: e,
              label: EQUIPMENT_LABEL[e],
            }))}
            selected={equipment}
            onToggle={(e) =>
              onEquipment(
                equipment.includes(e) ? equipment.filter((x) => x !== e) : [...equipment, e],
              )
            }
          />
          <Note>Peso corporal está sempre incluído.</Note>
        </>
      ) : null}
    </>
  );
}

// Goal and race.

export const GOALS: { value: Goal; title: string; text: string }[] = [
  {
    value: 'hipertrofia',
    title: 'Ganhar massa',
    text: 'Músculo maior, com carga e séries subindo aos poucos.',
  },
  { value: 'emagrecimento', title: 'Emagrecer', text: 'Perder gordura e manter o músculo.' },
  {
    value: 'condicionamento',
    title: 'Condicionamento',
    text: 'Mais fôlego e resistência, com descanso mais curto.',
  },
  { value: 'saude', title: 'Saúde geral', text: 'Constância e força para o dia a dia.' },
  { value: 'forca', title: 'Ficar mais forte', text: 'Cargas altas e poucas repetições.' },
  { value: 'corrida', title: 'Correr provas', text: 'Plano de corrida com musculação de apoio.' },
];

export const GOAL_LABEL = Object.fromEntries(GOALS.map((g) => [g.value, g.title])) as Record<
  Goal,
  string
>;

export function GoalQuestion({ value, onChange }: { value: Goal; onChange: (g: Goal) => void }) {
  return (
    <OptionCards<Goal>
      label="Objetivo"
      value={value}
      onChange={onChange}
      options={GOALS.map((g) => ({ value: g.value, title: g.title, text: g.text }))}
    />
  );
}

export function RaceQuestion({
  race,
  today,
  error,
  onChange,
}: {
  race: Race | null | undefined;
  today: string;
  error: string | null;
  onChange: (r: Race | null) => void;
}) {
  return (
    <>
      <Choices
        label="Prova marcada"
        options={[
          { value: '0', label: 'Ainda não' },
          ...RACE_DISTANCES.map((d) => ({ value: String(d), label: `${d} km` })),
        ]}
        selected={[String(race?.distance_km ?? 0)]}
        onToggle={(v) => {
          const d = Number(v) as RaceDistance | 0;
          onChange(d ? { distance_km: d, date: race?.date ?? '', from: today } : null);
        }}
      />
      {race ? (
        <TextField
          label="Data da prova"
          type="date"
          min={today}
          max={addDays(today, 365)}
          value={race.date}
          onChange={(e) => onChange({ ...race, date: e.target.value })}
          error={error}
        />
      ) : (
        <Note>Com a prova marcada, o longão cresce até ela e a semana final alivia.</Note>
      )}
    </>
  );
}

// Focus.

const FOCUS_ORDER: TrainingFocus[] = [
  'equilibrado',
  'pernas',
  'costas_ombros',
  'peito_bracos',
  'abdomen',
];

/** The focus as the screen shows it: the whole body evenly when nothing else is picked. */
export function focusList(p: Pick<OnboardingParams, 'focus'>): TrainingFocus[] {
  const list = focusesOf(p);
  return list.length ? list : ['equilibrado'];
}

/** Evenly clears the others; any other one clears evenly; none left is evenly again. */
export function toggleFocus(current: TrainingFocus[], f: TrainingFocus): TrainingFocus[] {
  if (f === 'equilibrado') return ['equilibrado'];
  const rest = current.filter((x) => x !== 'equilibrado');
  const next = rest.includes(f) ? rest.filter((x) => x !== f) : [...rest, f];
  return next.length ? next : ['equilibrado'];
}

export function focusSummary(p: Pick<OnboardingParams, 'focus'>): string {
  return joinPt(focusList(p).map((f) => FOCUS_LABEL[f]));
}

export function FocusQuestion({
  value,
  onChange,
}: {
  value: TrainingFocus[];
  onChange: (f: TrainingFocus[]) => void;
}) {
  return (
    <>
      <Choices<TrainingFocus>
        label="Foco do treino"
        options={FOCUS_ORDER.map((f) => ({ value: f, label: FOCUS_LABEL[f] }))}
        selected={value}
        onToggle={(f) => onChange(toggleFocus(value, f))}
      />
      <Note>
        {value.includes('pernas')
          ? 'Anterior, posterior e glúteos ganham fichas próprias, e o primeiro treino já é de perna. O resto do corpo segue no plano.'
          : value.includes('equilibrado')
            ? 'Opcional. Pode marcar mais de um. Sem foco, a semana divide o trabalho por igual.'
            : 'Esses grupos ganham mais séries na semana e entram primeiro no treino. Os outros seguem no plano.'}
      </Note>
    </>
  );
}

// Level and break.

export const LEVELS: { value: Level; title: string; text: string }[] = [
  {
    value: 'iniciante',
    title: 'Iniciante',
    text: 'Menos de 6 meses treinando, ou sem constância.',
  },
  { value: 'intermediario', title: 'Intermediário', text: 'De 6 meses a 2 anos com constância.' },
  { value: 'avancado', title: 'Avançado', text: 'Mais de 2 anos e técnica firme nos básicos.' },
];

export const LEVEL_LABEL = Object.fromEntries(LEVELS.map((l) => [l.value, l.title])) as Record<
  Level,
  string
>;

export function LevelQuestion({ value, onChange }: { value: Level; onChange: (l: Level) => void }) {
  return <OptionCards<Level> label="Nível" value={value} onChange={onChange} options={LEVELS} />;
}

export function ReturningQuestion({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <>
      <Segmented
        label="Voltando de pausa"
        value={value ? 'sim' : 'nao'}
        options={[
          { value: 'nao', label: 'Não' },
          { value: 'sim', label: 'Sim, mais de 3 semanas' },
        ]}
        onChange={(v) => onChange(v === 'sim')}
      />
      <Note>Na volta, 4 semanas com menos séries e mais folga em cada uma.</Note>
    </>
  );
}

// Age and gender.

export const AGE_RANGES: AgeRange[] = ['18-29', '30-39', '40-49', '50-59', '60+'];

export const AGE_LABEL: Record<AgeRange, string> = {
  '18-29': '18 a 29',
  '30-39': '30 a 39',
  '40-49': '40 a 49',
  '50-59': '50 a 59',
  '60+': '60 ou mais',
};

export function AgeQuestion({
  value,
  error,
  onChange,
}: {
  value: AgeRange | null | undefined;
  error?: string | null;
  onChange: (a: AgeRange) => void;
}) {
  return (
    <>
      <Choices<AgeRange>
        label="Faixa de idade"
        options={AGE_RANGES.map((a) => ({ value: a, label: AGE_LABEL[a] }))}
        selected={value ? [value] : []}
        onToggle={onChange}
      />
      <Note>
        Ajusta o começo do plano. Guardamos só a faixa, não a data de nascimento. O Anilha é para
        maiores de 18 anos.
      </Note>
      {error ? <ErrorText>{error}</ErrorText> : null}
    </>
  );
}

export const GENDER_LABEL: Record<Gender, string> = {
  feminino: 'Feminino',
  masculino: 'Masculino',
  outro: 'Outro',
  nao_informar: 'Prefiro não informar',
};

export function GenderQuestion({
  value,
  onChange,
}: {
  value: Gender | null | undefined;
  onChange: (g: Gender) => void;
}) {
  return (
    <>
      <Choices<Gender>
        label="Gênero"
        options={(Object.keys(GENDER_LABEL) as Gender[]).map((g) => ({
          value: g,
          label: GENDER_LABEL[g],
        }))}
        selected={value ? [value] : []}
        onToggle={onChange}
      />
      <Note>
        Opcional. Só ajusta um pouco o volume da semana e nunca muda o foco que você escolheu.
      </Note>
    </>
  );
}

// The week.

/**
 * Picks a gym or run day; past the number of days, the oldest pick gives way. A day is one
 * or the other: picked here, it leaves the other row.
 */
function toggleDay(x: OnboardingParams, kind: 'gym' | 'run', d: number): OnboardingParams {
  const gym = x.gym_weekdays ?? [];
  const run = x.run_weekdays ?? [];
  if (kind === 'gym') {
    if (gym.includes(d)) return { ...x, gym_weekdays: gym.filter((y) => y !== d) };
    return {
      ...x,
      gym_weekdays: [...gym, d].slice(-x.gym_days),
      run_weekdays: run.filter((y) => y !== d),
    };
  }
  if (run.includes(d)) return { ...x, run_weekdays: run.filter((y) => y !== d) };
  return {
    ...x,
    run_weekdays: [...run, d].slice(-x.run_days),
    gym_weekdays: gym.filter((y) => y !== d),
  };
}

export function WeekQuestion({
  p,
  setP,
  error,
}: {
  p: OnboardingParams;
  setP: SetParams;
  error?: string | null;
}) {
  const gymPicked = p.gym_weekdays ?? [];
  const runPicked = p.run_weekdays ?? [];
  return (
    <>
      <div className="field-grid">
        <Stepper
          label="Academia"
          value={p.gym_days}
          min={0}
          max={6}
          onChange={(v) => {
            const n = v ?? 0;
            // Fewer days: keep the last days picked.
            setP((x) => ({
              ...x,
              gym_days: n,
              gym_weekdays: n ? (x.gym_weekdays ?? []).slice(-n) : [],
            }));
          }}
          unit="dias"
        />
        <Stepper
          label="Corrida"
          value={p.run_days}
          min={0}
          max={Math.max(0, 7 - p.gym_days)}
          onChange={(v) => {
            const n = Math.min(v ?? 0, 7 - p.gym_days);
            // Fewer runs: keep the last days picked.
            setP((x) => ({
              ...x,
              run_days: n,
              run_weekdays: n ? (x.run_weekdays ?? []).slice(-n) : [],
            }));
          }}
          unit="dias"
        />
      </div>
      {p.gym_days > 0 || p.run_days > 0 ? (
        <div className="stack-sm">
          {p.gym_days > 0 ? (
            <DayPick
              label="Dias de academia"
              picked={gymPicked}
              dayLabel={(d) => `Academia ${onWeekday(d)}`}
              onToggle={(d) => setP((x) => toggleDay(x, 'gym', d))}
            />
          ) : null}
          {p.run_days > 0 ? (
            <DayPick
              label="Dias de corrida"
              picked={runPicked}
              dayLabel={(d) => `Correr ${onWeekday(d)}`}
              onToggle={(d) => setP((x) => toggleDay(x, 'run', d))}
            />
          ) : null}
          <Note>{dayPickNote(p.gym_days, gymPicked.length, p.run_days, runPicked.length)}</Note>
        </div>
      ) : null}
      {p.gym_days >= 5 ? (
        <div className="hb-advice">
          <Icon icon={Moon} />
          <span>
            Com {p.gym_days} dias sobra pouco descanso. Vou sugerir 4 e explicar o porquê.{' '}
            <button
              type="button"
              className="hb-btn-link"
              onClick={() => setP((x) => ({ ...x, force_gym_days: !x.force_gym_days }))}
            >
              {p.force_gym_days ? `Usar a sugestão de 4` : `Quero ${p.gym_days} mesmo assim`}
            </button>
          </span>
        </div>
      ) : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </>
  );
}

/** One row of weekdays to pick from. */
function DayPick({
  label,
  picked,
  dayLabel,
  onToggle,
}: {
  label: string;
  picked: number[];
  dayLabel: (weekday: number) => string;
  onToggle: (weekday: number) => void;
}) {
  return (
    <div className="stack-sm" role="group" aria-label={label}>
      <span className="hb-label">{label}</span>
      <div className="daypick">
        {WEEKDAY_SHORT.map((short, d) => (
          <button
            key={short}
            type="button"
            className="hb-choice daypick-btn"
            aria-pressed={picked.includes(d)}
            aria-label={dayLabel(d)}
            onClick={() => onToggle(d)}
          >
            {short}
          </button>
        ))}
      </div>
    </div>
  );
}

/** What the day rows still need, in one line. */
function dayPickNote(
  gymDays: number,
  gymPicked: number,
  runDays: number,
  runPicked: number,
): string {
  if (!gymPicked && !runPicked) return 'Opcional. Sem escolher, eu distribuo pela semana.';
  const missing: [number, string][] = [];
  if (gymPicked && gymPicked < gymDays) missing.push([gymDays - gymPicked, 'de academia']);
  if (runPicked && runPicked < runDays) missing.push([runDays - runPicked, 'de corrida']);
  if (missing.length) {
    const list = missing.map(([n, what], i) =>
      i === 0 ? `${n} ${plural(n, 'dia', 'dias')} ${what}` : `${n} ${what}`,
    );
    return `Escolha mais ${joinPt(list)} ou deixe que eu encaixo.`;
  }
  if (gymDays > 0 && !gymPicked) return 'A academia se encaixa nos outros dias.';
  if (runDays > 0 && !runPicked) return 'A corrida se encaixa nos outros dias.';
  return 'Pronto: a semana fica nos dias que você escolheu.';
}

export function MinutesQuestion({
  value,
  onChange,
}: {
  value: number;
  onChange: (m: number) => void;
}) {
  return (
    <>
      <Segmented
        label="Minutos por treino"
        value={value}
        options={[30, 45, 60, 75, 90].map((m) => ({ value: m, label: `${m}` }))}
        onChange={onChange}
      />
      <Note>Em minutos, contando o descanso entre séries.</Note>
    </>
  );
}

// The split.

/** The split the plan uses: now in the engine, shared with the agent. */
export { withSplit } from '../../engine/generator';

export const SPLIT_LABEL: Record<SplitStyle, string> = {
  grupos: 'Por grupo muscular',
  superior_inferior: 'Superior e inferior',
  corpo_inteiro: 'Corpo inteiro',
};

export function SplitQuestion({
  p,
  plan,
  onPick,
  onFichas,
}: {
  /** With the split in use (withSplit). */
  p: OnboardingParams;
  plan: GeneratedPlan | null;
  onPick: (s: SplitStyle) => void;
  onFichas: (f: number) => void;
}) {
  const legs = splitFocus(p) === 'pernas';
  const suggested = suggestedSplit(p.gym_days, splitFocus(p));
  const badge = (s: SplitStyle) => (suggested.style === s ? 'Sugerido' : undefined);
  const weekLine = plan?.reasons.find(
    (r) => r.includes('giram') || r.includes('Uma ficha') || r.includes('a seguinte começa'),
  );
  return (
    <>
      <OptionCards<SplitStyle>
        label="Divisão dos treinos"
        value={p.split_style ?? null}
        onChange={onPick}
        options={
          legs
            ? [
                {
                  value: 'grupos',
                  title: 'Pernas por partes',
                  text: 'Anterior, posterior e glúteos em fichas próprias, e um dia para a parte de cima. Com 4 dias, perna 3 vezes na semana.',
                  badge: badge('grupos'),
                  extra: (
                    <FichaPills
                      rotation={fichasFor(
                        'grupos',
                        p.split_style === 'grupos' ? (p.fichas ?? 4) : 4,
                        p.gym_days,
                        'pernas',
                      )}
                    />
                  ),
                },
                {
                  value: 'superior_inferior',
                  title: 'Superior e inferior com mais perna',
                  text:
                    p.gym_days >= 5
                      ? 'Perna 3 vezes e parte de cima 2 vezes na semana: a perna lidera e o resto do corpo ainda cresce.'
                      : p.gym_days === 4
                        ? 'Dois dias de perna e dois da parte de cima: a perna lidera e o resto do corpo ainda cresce. O indicado a partir dos 60.'
                        : 'Perna 2 vezes e parte de cima 1 vez na semana, a mesma semana sempre.',
                  badge: badge('superior_inferior'),
                  extra: (
                    <FichaPills
                      rotation={fichasFor('superior_inferior', 0, p.gym_days, 'pernas')}
                    />
                  ),
                },
                {
                  value: 'corpo_inteiro',
                  title: 'Corpo inteiro com mais perna',
                  text: 'Pernas e glúteos em todo treino, com a parte de cima junto. Bom para 1 a 2 dias.',
                  badge: badge('corpo_inteiro'),
                  extra: <FichaPills rotation={fichasFor('corpo_inteiro', 0, p.gym_days)} />,
                },
              ]
            : [
                {
                  value: 'corpo_inteiro',
                  title: SPLIT_LABEL.corpo_inteiro,
                  text: 'Um pouco de tudo em cada treino, a semana equilibrada. Bom para 1 a 3 dias.',
                  badge: badge('corpo_inteiro'),
                  extra: <FichaPills rotation={fichasFor('corpo_inteiro', 0, p.gym_days)} />,
                },
                {
                  value: 'superior_inferior',
                  title: SPLIT_LABEL.superior_inferior,
                  text: 'Parte de cima num dia, pernas e abdômen no outro. Bom para 4 dias ou mais.',
                  badge: badge('superior_inferior'),
                  extra: <FichaPills rotation={fichasFor('superior_inferior', 0, p.gym_days)} />,
                },
                {
                  value: 'grupos',
                  title: SPLIT_LABEL.grupos,
                  text: 'Um grupo por dia, como a ficha A, B, C da academia. Com 3 fichas, a parte de cima tem dois dias para cada um de perna.',
                  badge: badge('grupos'),
                  extra: (
                    <FichaPills
                      rotation={fichasFor(
                        'grupos',
                        p.split_style === 'grupos' ? (p.fichas ?? 3) : 3,
                        p.gym_days,
                      )}
                    />
                  ),
                },
              ]
        }
      />
      {p.split_style === 'grupos' ? (
        <div className="stack-sm">
          <span className="hb-label">Quantas fichas?</span>
          <Segmented
            label="Quantas fichas"
            value={p.fichas ?? 3}
            options={[
              { value: 3, label: 'A a C' },
              { value: 4, label: 'A a D' },
              { value: 5, label: 'A a E' },
            ]}
            onChange={onFichas}
          />
        </div>
      ) : null}
      {plan ? (
        <Widget title="Sua semana" sub={weekLine}>
          <WeekStrip days={plan.days} rotation={plan.rules.rotation} />
        </Widget>
      ) : null}
    </>
  );
}

/** Picking a split by hand: muscle groups keep at least 3 fichas, 4 with the legs focus. */
export function pickSplit(x: OnboardingParams, style: SplitStyle): OnboardingParams {
  return {
    ...x,
    split_style: style,
    fichas:
      style === 'grupos'
        ? Math.min(5, Math.max(splitFocus(x) === 'pernas' ? 4 : 3, x.fichas ?? 3))
        : x.fichas,
  };
}
