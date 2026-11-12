import { Pencil, Trash2, Watch } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { deleteRun, saveRun } from '../../data/ops';
import { newId } from '../../data/store';
import { activityOf, CARDIO, CARDIO_KINDS, cardioTitle, paceText } from '../../engine/cardio';
import { capitalize, formatDDMM, isValidDay } from '../../engine/dates';
import { parseTrack } from '../../engine/trackImport';
import { fmtNum } from '../../engine/format';
import { RUN_TYPE_LABEL } from '../../engine/taxonomy';
import type { CardioKind, RunRow, RunType } from '../../engine/types';
import { CARDIO_ICON } from '../../ui/cardioIcons';
import { ActionList, Sheet, useToast } from '../../ui/overlays';
import { Button, ErrorText, Icon, Segmented, TextArea, TextField } from '../../ui/primitives';

function parseDuration(text: string): number | null {
  const t = text.trim().replace(/h/i, ':').replace(/min/i, '');
  if (!t) return null;
  const parts = t.split(':').map((x) => Number(x));
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  if (parts.length === 1) return Math.round((parts[0] as number) * 60);
  if (parts.length === 2) return (parts[0] as number) * 60 + (parts[1] as number);
  if (parts.length === 3)
    return (parts[0] as number) * 3600 + (parts[1] as number) * 60 + (parts[2] as number);
  return null;
}

function durationText(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

export function runTitle(run: Parameters<typeof cardioTitle>[0]): string {
  return cardioTitle(run);
}

/** "esta corrida", "este remo". */
function thisOne(run: Pick<RunRow, 'activity'>): string {
  const def = CARDIO[activityOf(run)];
  return `${def.fem ? 'esta' : 'este'} ${def.noun}`;
}

function nounOf(kind: CardioKind): string {
  return CARDIO[kind].noun;
}

const LAST_KEY = 'anilha:ultimo-cardio';

/** The cardio picked last on this phone, so a cyclist does not pick bike every time. */
function lastActivity(): CardioKind {
  try {
    const v = localStorage.getItem(LAST_KEY);
    return v && (CARDIO_KINDS as string[]).includes(v) ? (v as CardioKind) : 'corrida';
  } catch {
    return 'corrida';
  }
}

function rememberActivity(kind: CardioKind) {
  try {
    localStorage.setItem(LAST_KEY, kind);
  } catch {
    // No storage: next time starts on running.
  }
}

/** The delete question, shared by the run sheet and the history menu. */
function DeleteRunQuestion({
  run,
  onDone,
  onKeep,
}: {
  run: RunRow;
  onDone: () => void;
  onKeep: () => void;
}) {
  return (
    <Sheet
      open
      onClose={onKeep}
      title={`Apagar ${thisOne(run)}?`}
      actions={<DeleteRunButtons run={run} onDone={onDone} onKeep={onKeep} />}
    >
      <p className="t-regular" style={{ margin: 0 }}>
        {runTitle(run)} em {formatDDMM(run.local_date)}: some do histórico, da semana e dos recordes
        em todos os aparelhos.
      </p>
    </Sheet>
  );
}

function DeleteRunButtons({
  run,
  onDone,
  onKeep,
}: {
  run: RunRow;
  onDone: () => void;
  onKeep: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button
        variant="danger"
        block
        disabled={busy}
        onClick={async () => {
          if (busyRef.current) return;
          busyRef.current = true;
          setBusy(true);
          setError(null);
          try {
            await deleteRun(run.id);
            const def = CARDIO[activityOf(run)];
            toast.show(`${capitalize(def.noun)} ${def.fem ? 'apagada' : 'apagado'}`);
            onDone();
          } catch {
            setError(`Não foi possível apagar ${thisOne(run)}. Tente novamente.`);
          } finally {
            busyRef.current = false;
            setBusy(false);
          }
        }}
      >
        {busy ? 'Apagando...' : `Apagar ${nounOf(activityOf(run))}`}
      </Button>
      <Button variant="tint" block disabled={busy} onClick={onKeep}>
        Manter {nounOf(activityOf(run))}
      </Button>
    </>
  );
}

/** Menu of a run in the history, opened by holding the row: edit or delete. */
export function RunActionsSheet({
  run,
  today,
  onClose,
  initial = 'menu',
}: {
  run: RunRow;
  today: string;
  onClose: () => void;
  /** Straight to the delete question (from the slide of the row). */
  initial?: 'menu' | 'delete';
}) {
  const [mode, setMode] = useState<'menu' | 'edit' | 'delete'>(initial);
  if (mode === 'edit') return <RunSheet open onClose={onClose} today={today} run={run} />;
  if (mode === 'delete')
    return <DeleteRunQuestion run={run} onDone={onClose} onKeep={() => setMode('menu')} />;
  return (
    <Sheet open onClose={onClose} title={runTitle(run)}>
      <ActionList
        actions={[
          {
            icon: Pencil,
            label: `Editar ${nounOf(activityOf(run))}`,
            onSelect: () => setMode('edit'),
          },
          {
            icon: Trash2,
            label: `Apagar ${nounOf(activityOf(run))}`,
            onSelect: () => setMode('delete'),
          },
        ]}
      />
    </Sheet>
  );
}

/**
 * Cardio log: running by default, and walk, bike, elliptical, swim, rower, stairs or other
 * one tap away at the top. The form keeps the same shape; only what does not apply to
 * the activity goes away (no distance on the elliptical, no run type on the bike).
 */
export function RunSheet({
  open,
  onClose,
  today,
  defaultType = 'leve',
  defaultActivity,
  run,
}: {
  open: boolean;
  onClose: () => void;
  today: string;
  defaultType?: RunType;
  /** Planned run day: opens on running; otherwise on the last cardio of this phone. */
  defaultActivity?: CardioKind | undefined;
  run?: RunRow;
}) {
  const toast = useToast();
  const [activity, setActivity] = useState<CardioKind>(
    run ? activityOf(run) : (defaultActivity ?? lastActivity()),
  );
  const def = CARDIO[activity];
  const [day, setDay] = useState(run?.local_date ?? today);
  const [dist, setDist] = useState(() =>
    run?.distance_km == null
      ? ''
      : CARDIO[activityOf(run)].distance === 'm'
        ? String(Math.round(run.distance_km * 1000))
        : fmtNum(run.distance_km, 2),
  );
  const [time, setTime] = useState(run ? durationText(run.duration_sec) : '');
  const [type, setType] = useState<RunType>(run?.run_type ?? defaultType);
  const [rpe, setRpe] = useState<number | null>(run?.rpe ?? null);
  const [note, setNote] = useState(run?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const runIdRef = useRef(run?.id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [imported, setImported] = useState<{ name: string; start: string; note: string } | null>(
    null,
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLDivElement>(null);

  // The chosen chip in view, even when it is one of the last.
  useEffect(() => {
    pickRef.current
      ?.querySelector('[aria-pressed="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, []);

  /** Switching activity: a distance typed in km becomes meters and back. */
  function pick(next: CardioKind) {
    if (next === activity) return;
    const from = CARDIO[activity].distance;
    const to = CARDIO[next].distance;
    const value = Number(dist.replace(',', '.'));
    if (dist && value > 0 && from && to && from !== to)
      setDist(to === 'm' ? String(Math.round(value * 1000)) : fmtNum(value / 1000, 2));
    setActivity(next);
  }

  async function importFile(file: File) {
    setError(null);
    const r = parseTrack(await file.text(), file.name);
    if (!r.ok) {
      setImported(null);
      setError(r.error);
      return;
    }
    const t = r.track;
    const kind = t.activity ?? activity;
    setActivity(kind);
    setDist(
      CARDIO[kind].distance === 'm'
        ? String(Math.round(t.distance_km * 1000))
        : fmtNum(t.distance_km, 2),
    );
    setTime(durationText(t.duration_sec));
    setDay(t.local_date <= today ? t.local_date : today);
    setImported({
      name: file.name,
      start: t.start,
      note: t.other_sport
        ? `Esse arquivo é de ${t.other_sport.toLowerCase()}. Escolha a atividade e confira antes de salvar.`
        : `Importado de ${file.name}. Confira e salve.`,
    });
  }

  const typed = Number(dist.replace(',', '.'));
  const distanceKm =
    def.distance && dist.trim() && typed > 0 ? (def.distance === 'm' ? typed / 1000 : typed) : null;
  const seconds = parseDuration(time);
  const pace = seconds
    ? paceText({ activity, distance_km: distanceKm, duration_sec: seconds })
    : null;
  const paceLabel = def.pace === 'kmh' ? 'Velocidade' : def.pace === 'min_km' ? 'Pace' : 'Ritmo';

  async function submit() {
    if (savingRef.current) return;
    if (!isValidDay(day) || day > today) return setError('Data inválida');
    if (activity === 'corrida' && !distanceKm) return setError('Distância inválida');
    if (dist.trim() && def.distance && !(typed > 0)) return setError('Distância inválida');
    if (distanceKm != null && distanceKm > 300) return setError('Distância inválida');
    if (!seconds || seconds <= 0) return setError('Tempo inválido');
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      // Reuse the ID if saving the run succeeded but recalculating its records failed.
      runIdRef.current ??= newId();
      const { milestones } = await saveRun({
        id: runIdRef.current,
        local_date: day,
        activity,
        distance_km: distanceKm == null ? null : Math.round(distanceKm * 1000) / 1000,
        duration_sec: seconds,
        run_type: activity === 'corrida' ? type : 'leve',
        rpe,
        note: note.trim() || null,
        external_id: imported?.start ?? run?.external_id ?? null,
      });
      rememberActivity(activity);
      toast.show(
        milestones[0] && distanceKm
          ? `${milestones[0].exercise_name}: ${fmtNum(distanceKm)} km`
          : `${capitalize(def.noun)} ${def.fem ? 'registrada' : 'registrado'}`,
      );
      onClose();
    } catch {
      setError('Não foi possível salvar. Seus dados continuam aqui. Tente novamente.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (run && confirmDelete)
    return <DeleteRunQuestion run={run} onDone={onClose} onKeep={() => setConfirmDelete(false)} />;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`${run ? 'Editar' : 'Registrar'} ${def.noun}`}
      actions={
        <>
          <Button variant="primary" block disabled={saving} onClick={() => void submit()}>
            {saving ? 'Salvando...' : `Salvar ${def.noun}`}
          </Button>
          {run ? (
            <Button
              variant="ghost"
              block
              icon={Trash2}
              disabled={saving}
              onClick={() => setConfirmDelete(true)}
            >
              Apagar {def.noun}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="stack">
        <div className="cardio-pick" role="group" aria-label="Atividade" ref={pickRef}>
          {CARDIO_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              className="hb-choice cardio-chip"
              aria-pressed={activity === k}
              onClick={() => pick(k)}
            >
              <Icon icon={CARDIO_ICON[k]} size={18} />
              {CARDIO[k].label}
            </button>
          ))}
        </div>
        {!run ? (
          <div className="stack-sm">
            <button type="button" className="hb-btn-link" onClick={() => fileRef.current?.click()}>
              <Icon icon={Watch} size={18} />
              Importar do relógio (.gpx ou .tcx)
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".gpx,.tcx,application/gpx+xml"
              className="hb-sr"
              aria-label="Arquivo do relógio"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importFile(f);
                e.target.value = '';
              }}
            />
            {imported ? (
              <p className="t-caption" style={{ margin: 0 }} role="status">
                {imported.note}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="field-grid">
          {def.distance ? (
            <TextField
              label={`Distância (${def.distance})${activity === 'corrida' ? '' : ', opcional'}`}
              inputMode="decimal"
              placeholder={def.distance === 'm' ? '1000' : activity === 'bike' ? '20' : '5,0'}
              value={dist}
              onChange={(e) => setDist(e.target.value)}
            />
          ) : null}
          <TextField
            label="Tempo"
            inputMode="numeric"
            placeholder={def.distance ? '32:30' : '30:00'}
            hint="min:seg ou h:min:seg"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
        {def.pace ? (
          <p className="t-regular" style={{ margin: 0 }} aria-live="polite">
            {paceLabel}:{' '}
            <strong className="t-strong t-num">{pace ?? 'preencha distância e tempo'}</strong>
          </p>
        ) : null}
        {activity === 'corrida' ? (
          <div className="stack-sm">
            <span className="hb-label">Tipo</span>
            <Segmented<RunType>
              label="Tipo de corrida"
              value={type}
              options={(['leve', 'longo', 'intervalado'] as RunType[]).map((t) => ({
                value: t,
                label: RUN_TYPE_LABEL[t].charAt(0).toUpperCase() + RUN_TYPE_LABEL[t].slice(1),
              }))}
              onChange={setType}
            />
          </div>
        ) : null}
        <div className="stack-sm">
          <span className="hb-label">Esforço percebido, de 1 a 10</span>
          <div
            className="hb-choices"
            role="group"
            aria-label="Esforço de 1 a 10"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)' }}
          >
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                className="hb-choice"
                style={{ justifyContent: 'center' }}
                aria-pressed={rpe === n}
                onClick={() => setRpe(rpe === n ? null : n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <TextField
          label="Data"
          type="date"
          max={today}
          value={day}
          onChange={(e) => setDay(e.target.value)}
        />
        <TextArea
          label="Nota"
          value={note}
          onChange={setNote}
          placeholder="Como foi"
          maxLength={500}
        />
        {error ? <ErrorText>{error}</ErrorText> : null}
      </div>
    </Sheet>
  );
}
