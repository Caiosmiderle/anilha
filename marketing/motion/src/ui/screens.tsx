import {
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CirclePlay,
  CircleUser,
  Clock,
  Dumbbell,
  Ellipsis,
  Flame,
  Focus,
  Footprints,
  History,
  House,
  Keyboard,
  KeyRound,
  Maximize2,
  Minimize2,
  Minus,
  Moon,
  Pencil,
  Plus,
  ThumbsUp,
  Timer,
  UserPlus,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { interpolate } from 'remotion';
import { Avatar, Button, Disc, Icon, IconButton, Meter, Widget } from '../../../../src/ui/primitives';
import { Wordmark } from '../../../../src/ui/brand';
import { CLAMP, harborSpring, press, rise, sheetIn } from '../anim';
import { HARBOR } from '../harbor';

/**
 * Telas do Anilha como são hoje, com os componentes do app (src/ui) e as mesmas classes.
 * Os textos e números são de uma semana de exemplo: Ana, plano de 3 dias, segunda 19/10.
 * Só aparece o que existe no app: treino sugerido, registro de carga, modo foco, recorde,
 * semana cumprida, foguinho e amigos.
 */

export const DAY = 'Segunda, 19/10';

/** Estado visual de um toque: o :active do Harbor (desce 1 px) e o halo de foco. */
function pressed(p: number): CSSProperties {
  return p > 0
    ? { transform: `translateY(${HARBOR.pressPx * p}px)`, boxShadow: p > 0.4 ? 'var(--shadow-button), var(--shadow-focus)' : undefined }
    : {};
}

export function StatusRow() {
  return (
    <div className="mobile-brand">
      <Wordmark />
      <span className="row" style={{ gap: 4 }}>
        <span className="hb-status">
          <i style={{ background: 'var(--accent-teal)' }} aria-hidden="true" />
          Sincronizado
        </span>
        <span className="hb-iconbtn inbox-bell">
          <Icon icon={Bell} />
        </span>
      </span>
    </div>
  );
}

const TABS: { label: string; icon: LucideIcon }[] = [
  { label: 'Histórico', icon: History },
  { label: 'Plano', icon: CalendarDays },
  { label: 'Hoje', icon: House },
  { label: 'Amigos', icon: Users },
  { label: 'Você', icon: CircleUser },
];

export function TabBar({ active }: { active: number }) {
  return (
    <nav className="hb-tabbar" style={{ '--tab-index': active, bottom: 10 } as CSSProperties}>
      <span className="tab-pill" aria-hidden="true" />
      {TABS.map((t, i) => (
        <span key={t.label} className={`hb-tab ${i === active ? 'is-active' : ''}`}>
          <Icon icon={t.icon} />
          <span>{t.label}</span>
        </span>
      ))}
    </nav>
  );
}

/** O foguinho do Hoje: cinza enquanto falta o treino do dia, aceso depois. */
export function StreakPill({ days, pending, pop = 1 }: { days: number; pending: boolean; pop?: number }) {
  return (
    <span
      className="streak-pill"
      data-pending={pending}
      style={{ transform: `scale(${1 + (1 - pop) * 0.18})`, transformOrigin: '50% 50%' }}
    >
      <Icon icon={Flame} size={18} />
      <span>{days}</span>
    </span>
  );
}

export function PageHead({ title, sub, streak }: { title: string; sub: string; streak?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <div className="page-title-row">
          <h1 className="page-title">{title}</h1>
          {streak}
        </div>
        <p className="page-sub">{sub}</p>
      </div>
    </header>
  );
}

function Screen({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'var(--bg-page)', ...style }}>{children}</div>
  );
}

/* ------------------------------------------------------------------ Hoje */

export function HojeScreen({ f, tapAt }: { f: number; tapAt: number }) {
  const p = press(f, tapAt);
  const chips: { label: string; icon: LucideIcon; pastel: string }[] = [
    { label: 'Tenho pouco tempo', icon: Clock, pastel: 'var(--pastel-sky)' },
    { label: 'Focar em um grupo', icon: Focus, pastel: 'var(--pastel-lavender)' },
    { label: 'Sem equipamento', icon: Wrench, pastel: 'var(--pastel-peach)' },
    { label: 'Trocar por corrida', icon: Footprints, pastel: 'var(--pastel-mint)' },
    { label: 'Hoje é descanso', icon: Moon, pastel: 'var(--bg-subtle)' },
  ];
  return (
    <Screen>
      <main className="app-main">
        <StatusRow />
        <PageHead title="Bom dia, Ana" sub={DAY} streak={<StreakPill days={28} pending />} />
        <Widget
          icon={Dumbbell}
          pastel="peach"
          title="Hoje: ficha A, peito e tríceps"
          sub="6 exercícios · Plano: academia às 07:00"
          foot={
            <>
              <Button variant="primary" block style={pressed(p)}>
                Iniciar treino
              </Button>
              <Button variant="tint">Escolher outro</Button>
            </>
          }
        >
          <div className="stack-sm">
            <p className="t-regular" style={{ margin: 0 }}>
              Ficha A: Peito e tríceps é a próxima do rodízio. Faltam 3 de academia nesta semana.
            </p>
            <button type="button" className="hb-btn-link" style={{ alignSelf: 'flex-start' }}>
              Ignorar sugestão
            </button>
          </div>
        </Widget>
        <section className="scroll-x" aria-label="Ajustar o dia">
          {chips.map((c) => (
            <span key={c.label} className="hb-qa">
              <span className="hb-qa-icon" style={{ background: c.pastel }}>
                <Icon icon={c.icon} size={14} />
              </span>
              {c.label}
            </span>
          ))}
        </section>
      </main>
      <TabBar active={2} />
    </Screen>
  );
}

/* ------------------------------------------------------------------ Treino */

function VStepper({ label, value, pop }: { label: string; value: string; pop: number }) {
  return (
    <div className="stack-sm" style={{ gap: 4 }}>
      <label className="t-caption">{label}</label>
      <div className="hb-stepper">
        <button type="button">
          <Icon icon={Minus} size={22} />
        </button>
        <div className="hb-stepper-value">
          <input
            readOnly
            value={value}
            placeholder="0"
            style={{ transform: `scale(${1 + (1 - pop) * 0.35})`, opacity: value ? Math.min(1, pop * 3) : 1 }}
          />
        </div>
        <button type="button">
          <Icon icon={Plus} size={22} />
        </button>
      </div>
    </div>
  );
}

/**
 * Treino em andamento: o card do supino com as séries e o dock embaixo. `landAt` é quando
 * a carga e as repetições caem nos campos; `tapAt`, o toque em Concluir série.
 */
export function SessionScreen({ f, fps, landAt, tapAt }: { f: number; fps: number; landAt: number; tapAt: number }) {
  const landed = f >= landAt;
  const pop = harborSpring(f, landAt, fps, 360);
  const done = f >= tapAt + 4;
  const p = press(f, tapAt);
  const restSec = Math.max(0, 120 - Math.floor((f - tapAt) / fps));
  const restPct = Math.min(100, ((f - tapAt) / fps / 120) * 100);
  const clockSec = 6 * 60 + 12 + Math.floor(f / fps);
  const clock = `${Math.floor(clockSec / 60)}:${String(clockSec % 60).padStart(2, '0')}`;
  const rows = [
    { kind: 'work', text: '20 kg × 8', done, active: !done },
    { kind: 'work', text: '20 kg × 8', done: false, active: done },
    { kind: 'work', text: '20 kg × 8', done: false, active: false },
  ];
  return (
    <Screen>
      <div className="app-shell" style={{ minHeight: 0, height: '100%' }}>
        <header className="session-head">
          <IconButton icon={ChevronDown} label="Minimizar treino" />
          <div className="session-head-title">
            <strong>Ficha A: Peito e tríceps</strong>
            <span className="session-clock">
              <span className="session-clock-time">
                <Icon icon={Timer} size={14} />
                {clock}
              </span>
              <span className="t-caption">{done ? '1 série feita' : '0 séries feitas'}</span>
            </span>
          </div>
          <IconButton icon={Maximize2} label="Modo foco" />
          <IconButton icon={Ellipsis} label="Opções do treino" />
        </header>
        <main className="app-main is-session" style={{ gap: 'var(--space-4)' }}>
          <section className="hb-widget">
            <div className="hb-widget-head">
              <Disc icon={Dumbbell} pastel="peach" />
              <div style={{ minWidth: 0, flex: 1 }}>
                <h2 className="hb-widget-title" style={{ margin: 0 }}>
                  Supino reto com barra
                </h2>
                <div className="hb-widget-sub">
                  <span className="ex-focus">Peitoral médio</span>
                  3x 8-12 · descanso 120 s
                </div>
                <span className="howto-btn">
                  <Icon icon={CirclePlay} size={16} />
                  Como fazer
                </span>
              </div>
              <IconButton icon={Ellipsis} label="Opções" />
            </div>
            <div className="hb-widget-body stack-sm">
              {rows.map((r, i) => (
                <div key={i} className={`hb-setrow ${r.done ? 'is-done' : ''} ${r.active ? 'is-active' : ''}`}>
                  <span className="hb-kind is-work">Trabalho</span>
                  <span className="hb-setrow-values">{r.text}</span>
                  <span className="hb-setrow-effort" />
                  <span className={`hb-donebtn ${r.done ? 'is-done' : ''}`}>
                    <Icon icon={Check} />
                  </span>
                </div>
              ))}
            </div>
          </section>
        </main>
        <div className="hb-dock">
          {f >= tapAt + 2 ? (
            <div className="hb-rest" style={sheetIn(f, tapAt + 2, fps)}>
              <div>
                <div className="hb-rest-label">Descanso</div>
                <div className="hb-rest-time">
                  {Math.floor(restSec / 60)}:{String(restSec % 60).padStart(2, '0')}
                </div>
              </div>
              <div className="hb-rest-actions">
                <Button variant="outline">+15 s</Button>
                <Button variant="tint">Pular</Button>
              </div>
              <div className="hb-rest-bar">
                <span style={{ width: `${restPct}%` }} />
              </div>
            </div>
          ) : null}
          <div className="stack-sm">
            <div className="row" style={{ gap: 'var(--space-2)' }}>
              <span className="hb-kind is-work">Trabalho</span>
              <p className="t-label" style={{ margin: 0, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Supino reto com barra
                <span className="t-caption" style={{ display: 'block' }}>
                  Série {done ? 2 : 1} de 3
                </span>
              </p>
              <span className="hb-btn-link">
                <Icon icon={Keyboard} size={18} />
                Digitar
              </span>
            </div>
            <div className="field-grid">
              <VStepper label="Carga (kg)" value={landed ? '20' : ''} pop={landed ? pop : 1} />
              <VStepper label="Repetições" value={landed ? '8' : ''} pop={landed ? pop : 1} />
            </div>
            <Button variant="primary" block icon={Check} style={pressed(p)}>
              Concluir série
            </Button>
          </div>
        </div>
      </div>
    </Screen>
  );
}

/* ------------------------------------------------------------------ Modo foco */

export function FocusScreen({ f, fps, tapAt }: { f: number; fps: number; tapAt: number }) {
  const p = press(f, tapAt);
  const resting = f >= tapAt + 3;
  const swap = harborSpring(f, tapAt + 3, fps, 360);
  const clockSec = 18 * 60 + 40 + Math.floor(f / fps);
  const restLeft = Math.max(0, 120 - Math.floor((f - tapAt - 3) / fps));
  return (
    <Screen>
      <div className="focus-mode" style={{ inset: 0 }}>
        <header className="focus-top">
          <div className="focus-top-text">
            <strong>Ficha A: Peito e tríceps</strong>
            <span className="focus-clock">
              {Math.floor(clockSec / 60)}:{String(clockSec % 60).padStart(2, '0')}
            </span>
          </div>
          <span className="focus-icon">
            <Icon icon={Minimize2} />
          </span>
        </header>
        <main className="focus-main" style={{ opacity: resting ? swap : 1, transform: resting ? `translateY(${(1 - swap) * 12}px)` : undefined }}>
          {resting ? (
            <>
              <span className="focus-label">Descanso</span>
              <span className="focus-big">
                {Math.floor(restLeft / 60)}:{String(restLeft % 60).padStart(2, '0')}
              </span>
              <span className="focus-sub">Próxima: Supino inclinado com halteres, 16 kg × 10</span>
            </>
          ) : (
            <>
              <span className="focus-label">Supino reto com barra</span>
              <span className="focus-big is-set">22,5 kg × 8</span>
              <span className="focus-sub">Série 3 de 3 · 2 séries feitas</span>
            </>
          )}
        </main>
        <footer className="focus-bottom">
          <div className="focus-side" />
          {resting ? (
            <span className="focus-go">
              <Icon icon={Check} size={40} />
              <span>Pular descanso</span>
            </span>
          ) : (
            <span className="focus-go" style={{ transform: `scale(${1 - (1 - HARBOR.stepperPress) * p})` }}>
              <Icon icon={Check} size={40} />
              <span>Série feita</span>
            </span>
          )}
          <div className="focus-side">
            <span className="focus-small">
              <Icon icon={Pencil} size={22} />
              Ajustar
            </span>
          </div>
        </footer>
      </div>
    </Screen>
  );
}

/* ------------------------------------------------------------------ Recorde e constância */

function Recog({ title, value, detail, pastel, style }: { title: string; value: string; detail: string; pastel: string; style?: CSSProperties }) {
  return (
    <section className={`hb-recog p-${pastel}`} style={style}>
      <h2 className="hb-recog-title">{title}</h2>
      <p className="hb-recog-value">{value}</p>
      <p className="hb-recog-detail">{detail}</p>
    </section>
  );
}

const WEEK = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];

/** "Sua semana" do Hoje, com o treino de segunda feito a partir de `doneAt`. */
function WeekWidget({ f, doneAt }: { f: number; doneAt: number }) {
  const done = f >= doneAt;
  return (
    <Widget title="Sua semana" sub="19/10 a 25/10" icon={Dumbbell} pastel="butter">
      <div className="stack">
        <div className="hb-week">
          {WEEK.map((l, i) => {
            const gym = i === 0 || i === 2 || i === 4;
            const isDone = i === 0 && done;
            return (
              <div key={i} className={`hb-day ${i === 0 ? 'is-today' : ''}`}>
                <span>{l}</span>
                <span className={`hb-day-dot ${isDone ? 'is-done' : ''}`} style={isDone ? { background: 'var(--pastel-peach)' } : undefined}>
                  <Icon icon={gym ? Dumbbell : Moon} size={16} />
                </span>
                <span className="t-num">{19 + i}</span>
              </div>
            );
          })}
        </div>
        <p className="t-regular" style={{ margin: 0 }}>
          Academia{' '}
          <strong className="t-strong t-num">{done ? '1 de 3' : '0 de 3'}</strong>
        </p>
      </div>
    </Widget>
  );
}

export function RecordeScreen({ f, fps, riseAt }: { f: number; fps: number; riseAt: number }) {
  return (
    <Screen>
      <main className="app-main">
        <StatusRow />
        <PageHead title="Bom dia, Ana" sub={DAY} streak={<StreakPill days={29} pending={false} />} />
        {f >= riseAt ? (
          <Recog
            title="Recorde: supino reto com barra"
            value="22,5 kg"
            detail="Em 19/10."
            pastel="peach"
            style={rise(f, riseAt, fps)}
          />
        ) : (
          <div style={{ height: 150 }} />
        )}
        <WeekWidget f={f} doneAt={0} />
      </main>
      <TabBar active={2} />
    </Screen>
  );
}

export function ConstanciaScreen({ f, fps, litAt }: { f: number; fps: number; litAt: number }) {
  const lit = f >= litAt;
  const pop = harborSpring(f, litAt, fps, 420);
  return (
    <Screen>
      <main className="app-main">
        <StatusRow />
        <PageHead
          title="Bom dia, Ana"
          sub={DAY}
          streak={<StreakPill days={lit ? 29 : 28} pending={!lit} pop={lit ? pop : 1} />}
        />
        <Recog
          title="Semana cumprida"
          value="3 de 3"
          detail="4 dias de descanso, como planejado."
          pastel="butter"
          style={rise(f, litAt + 8, fps)}
        />
        <Recog
          title="Semanas seguidas no plano"
          value="4"
          detail="Constância sem passar do plano."
          pastel="butter"
          style={rise(f, litAt + 16, fps)}
        />
      </main>
      <TabBar active={2} />
    </Screen>
  );
}

/* ------------------------------------------------------------------ Amigos */

export function AmigosScreen({ f, fps, tapAt }: { f: number; fps: number; tapAt: number }) {
  const reacted = f >= tapAt + 1;
  const p = press(f, tapAt);
  // Segunda-feira: Bruno fez 1 dos 4 treinos do plano dele.
  const meter = interpolate(f, [6, 6 + fps * 0.6], [0, 0.25], { ...CLAMP, easing: HARBOR.springEase });
  const pct = Math.round(meter * 100);
  return (
    <Screen>
      <main className="app-main">
        <header className="page-head">
          <div>
            <h1 className="page-title">Amigos</h1>
            <p className="page-sub">Constância junto. Ninguém vê suas cargas sem você liberar.</p>
          </div>
        </header>
        <div className="actions">
          <Button variant="primary" icon={UserPlus}>
            Convidar amigo
          </Button>
          <Button variant="tint" icon={KeyRound}>
            Usar código
          </Button>
        </div>
        <h2 className="section-title">Amigos</h2>
        <section className="hb-widget">
          <div className="hb-widget-head">
            <Avatar name="Bruno" large />
            <div style={{ minWidth: 0, flex: 1 }}>
              <h2 className="hb-widget-title" style={{ margin: 0 }}>
                Bruno
              </h2>
            </div>
            <Icon icon={ChevronRight} />
          </div>
          <div className="hb-widget-body stack-sm">
            <div className="stack-sm">
              <span className="t-regular">Academia 1 de 3 · Corrida 0 de 1</span>
              <div className="row" style={{ gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <Meter value={meter} label="Plano da semana" />
                </div>
                <span className="t-caption t-num">{pct}%</span>
              </div>
            </div>
            {[
              { t: 'Peito e tríceps', d: 'Seg, 19/10', me: true },
              { t: 'Corrida longa', d: 'Dom, 18/10', me: false },
            ].map((a) => (
              <div key={a.t} className="row" style={{ minHeight: 48 }}>
                <span className="t-regular" style={{ flex: 1, minWidth: 0 }}>
                  {a.t}
                  <span className="t-caption" style={{ display: 'block' }}>
                    {a.d}
                  </span>
                </span>
                <button
                  type="button"
                  className="hb-choice"
                  aria-pressed={a.me ? reacted : true}
                  style={a.me ? { transform: `scale(${1 - 0.04 * p})` } : undefined}
                >
                  <Icon icon={ThumbsUp} size={18} />
                  {a.me ? (reacted ? 'Boa 1' : 'Boa') : 'Boa 2'}
                </button>
              </div>
            ))}
          </div>
        </section>
        <h2 className="section-title">Grupos</h2>
        <Widget icon={Users} pastel="butter" title="Turma das 6h" sub="Desafio da semana · 3 pessoas">
          <div className="stack-sm">
            {[
              ['1', 'Ana (você)', '33%'],
              ['2', 'Bruno', `${pct}%`],
              ['3', 'Lia', '0%'],
            ].map(([pos, name, v]) => (
              <div key={name} className="row t-regular">
                <span className="t-caption" style={{ width: 20 }}>
                  {pos}
                </span>
                <span style={{ flex: 1 }}>{name}</span>
                <strong className="t-strong t-num">{v}</strong>
              </div>
            ))}
          </div>
        </Widget>
      </main>
      <TabBar active={3} />
    </Screen>
  );
}
