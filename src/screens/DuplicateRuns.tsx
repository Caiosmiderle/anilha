import { useLiveQuery } from 'dexie-react-hooks';
import { CopyCheck, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from '../app/account';
import {
  DISMISSED_KEY,
  MERGES_KEY,
  dismissDuplicate,
  mergeDuplicate,
  pendingDuplicates,
  undoMerge,
  type MergeRecord,
  type PendingDuplicate,
} from '../data/duplicates';
import { useRuns } from '../data/hooks';
import { fmtDuration, fmtNum } from '../engine/format';
import type { RunRow } from '../engine/types';
import { Button, Empty, ErrorText, LoadingCard, Widget } from '../ui/primitives';

const REASON = {
  strava: 'Mesmo registro do Strava',
  time_distance: 'Começaram com até 5 minutos de diferença e a distância bate',
} as const;

function useMeta<T>(key: string, fallback: T): T {
  const { db } = useAccount();
  return useLiveQuery(async () => ((await db.meta.get(key))?.value as T | undefined) ?? fallback, [db, key]) ?? fallback;
}

/** Corridas que chegaram duas vezes: pelo CRUNNING e por importação de arquivo. */
export function useDuplicateRuns(): PendingDuplicate[] | undefined {
  const runs = useRuns();
  const dismissed = useMeta<string[]>(DISMISSED_KEY, []);
  return useMemo(() => (runs ? pendingDuplicates(runs, dismissed) : undefined), [runs, dismissed]);
}

const day = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });

function RunLine({ run, label }: { run: RunRow; label: string }) {
  return (
    <div className="dup-run">
      <span className="dup-run-label">{label}</span>
      <strong>
        {run.distance_km != null ? `${fmtNum(run.distance_km, 2)} km` : 'Sem distância'} · {fmtDuration(run.duration_sec)}
      </strong>
      <span className="dup-run-meta">
        {day(run.local_date)}
        {run.rpe != null ? ` · esforço ${run.rpe}` : ''}
        {run.note ? ' · com nota' : ''}
      </span>
    </div>
  );
}

export default function DuplicateRuns() {
  const pairs = useDuplicateRuns();
  const merges = useMeta<MergeRecord[]>(MERGES_KEY, []);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [lastMerged, setLastMerged] = useState<MergeRecord | null>(null);

  async function act(id: string, fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(id);
    setError('');
    try {
      await fn();
    } catch {
      setError('Não foi possível concluir. Nada foi perdido: tente de novo.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Corridas repetidas</h1>
          <p className="page-sub">
            A mesma corrida chegou pelo CRUNNING e por um arquivo importado. Juntar mantém a do CRUNNING;
            a importada guarda uma cópia e pode voltar com Desfazer.
          </p>
          <Link to="/historico" className="hb-btn-link">
            Voltar ao histórico
          </Link>
        </div>
      </header>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {lastMerged ? (
        <Widget headless className="dup-toast">
          <div className="dup-toast-row" role="status">
            <span>Juntadas. A importada ficou guardada.</span>
            <Button
              variant="ghost"
              icon={Undo2}
              disabled={busy !== null}
              onClick={() =>
                act(lastMerged.id, async () => {
                  await undoMerge(lastMerged.id);
                  setLastMerged(null);
                })
              }
            >
              Desfazer
            </Button>
          </div>
        </Widget>
      ) : null}
      {!pairs ? (
        <LoadingCard lines={3} />
      ) : pairs.length === 0 ? (
        <Empty icon={CopyCheck}>Nenhuma corrida repetida.</Empty>
      ) : (
        pairs.map((p) => (
          <Widget key={p.key} title={day(p.canonical.local_date)} sub={REASON[p.reason]}>
            <div className="dup-pair">
              <RunLine run={p.canonical} label="Fica (CRUNNING)" />
              <RunLine run={p.imported} label="Sai (importada)" />
            </div>
            {!p.canonical.note && p.imported.note ? (
              <p className="dup-note">A nota da importada passa para a do CRUNNING.</p>
            ) : null}
            <div className="dup-actions">
              <Button
                variant="primary"
                disabled={busy !== null}
                onClick={() =>
                  act(p.key, async () => {
                    const record = await mergeDuplicate(p);
                    setLastMerged(record);
                  })
                }
              >
                Juntar
              </Button>
              <Button variant="outline" disabled={busy !== null} onClick={() => act(p.key, () => dismissDuplicate(p.key))}>
                Não é repetida
              </Button>
            </div>
          </Widget>
        ))
      )}
      {merges.length > 0 ? (
        <Widget title="Juntadas neste aparelho" sub="Cada uma guarda a cópia da importada e pode voltar">
          <ul className="dup-merged">
            {merges.map((m) => (
              <li key={m.id}>
                <span>
                  {day(m.imported.local_date)} ·{' '}
                  {m.imported.distance_km != null ? `${fmtNum(m.imported.distance_km, 2)} km` : 'sem distância'}
                </span>
                <Button
                  variant="ghost"
                  icon={Undo2}
                  disabled={busy !== null}
                  onClick={() =>
                    act(m.id, async () => {
                      await undoMerge(m.id);
                      if (lastMerged?.id === m.id) setLastMerged(null);
                    })
                  }
                >
                  Desfazer
                </Button>
              </li>
            ))}
          </ul>
        </Widget>
      ) : null}
    </>
  );
}
