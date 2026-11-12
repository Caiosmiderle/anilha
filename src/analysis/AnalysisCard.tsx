import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAccount } from '../app/account';
import { EXERCISES } from '../engine/exercises';
import { Button, Widget } from '../ui/primitives';
import { currentStore } from '../data/store';
import { analysisProposal } from './proposal';
import {
  requestAnalysis,
  saveAnalysisAdjustment,
  undoAnalysisAdjustment,
  updateAnalysis,
  type SavedAnalysis,
} from './local';
import type { AnalysisAdjustment } from './contract';

export function AnalysisCard({ sessionID }: { sessionID: string }) {
  const { db } = useAccount();
  const saved = useLiveQuery(
    async () => (await db.meta.get(`analysis:${sessionID}`))?.value as SavedAnalysis | undefined,
    [db, sessionID],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<AnalysisAdjustment | null>(null);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    const owner = currentStore();
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      if (currentStore() === owner)
        setError(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      if (currentStore() === owner) setBusy(false);
    }
  }
  const proposal = useMemo(
    () => (saved ? analysisProposal(saved.reply.adjustment, saved.binding) : null),
    [saved],
  );
  const changed =
    proposal?.kind === 'ficha'
      ? proposal.after.items.findIndex(
          (i, n) => JSON.stringify(i) !== JSON.stringify(proposal.before.items[n]),
        )
      : -1;
  const line = (which: 'before' | 'after') => {
    if (proposal?.kind !== 'ficha') return '';
    const i = proposal[which].items[changed];
    return i
      ? `${EXERCISES.find((e) => e.id === i.exercise_id)?.name ?? 'Exercício'}: ${i.sets} séries de ${i.target_min} a ${i.target_max}`
      : '';
  };
  return (
    <Widget title="Análise do Waltér" sub="Conta no limite diário do Waltér.">
      <div className="stack-sm" data-testid="analysis-card" aria-busy={busy}>
        {saved ? (
          <>
            <p className="t-regular">{saved.reply.summary}</p>
            {saved.reply.points.length ? (
              <ul>
                {saved.reply.points.map((p, n) => (
                  <li key={n}>{p}</li>
                ))}
              </ul>
            ) : null}
            {proposal && changed >= 0 ? (
              <div className="hb-advice hb-advice-brand">
                <div>
                  <p>
                    <strong>Antes:</strong> {line('before')}
                  </p>
                  <p>
                    <strong>Depois:</strong> {line('after')}
                  </p>
                  {proposal.kind === 'ficha'
                    ? proposal.risks.map((r) => (
                        <p key={r.text}>
                          {r.text} Fonte: {r.source}
                        </p>
                      ))
                    : null}
                </div>
              </div>
            ) : saved.reply.adjustment ? (
              <p>O ajuste não pode ser aplicado à ficha atual. A análise foi preservada.</p>
            ) : null}
            {saved.status === 'proposed' && proposal ? (
              <>
                {editing && draft ? (
                  <form
                    className="stack-sm"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(async () => {
                        const next = { ...saved, reply: { ...saved.reply, adjustment: draft } };
                        if (!analysisProposal(draft, saved.binding))
                          throw new Error('Parâmetros fora da faixa permitida.');
                        await updateAnalysis(sessionID, next);
                        setEditing(false);
                      });
                    }}
                  >
                    {draft.operation === 'series' ? (
                      <label>
                        Séries
                        <input
                          aria-label="Séries do ajuste"
                          type="number"
                          min={1}
                          max={12}
                          required
                          value={draft.sets ?? ''}
                          onChange={(e) =>
                            setDraft({ ...draft, sets: e.currentTarget.valueAsNumber })
                          }
                        />
                      </label>
                    ) : null}
                    {draft.operation === 'repeticoes' ? (
                      <>
                        <label>
                          Mínimo
                          <input
                            aria-label="Mínimo do ajuste"
                            type="number"
                            min={1}
                            max={3600}
                            required
                            value={draft.min ?? ''}
                            onChange={(e) =>
                              setDraft({ ...draft, min: e.currentTarget.valueAsNumber })
                            }
                          />
                        </label>
                        <label>
                          Máximo
                          <input
                            aria-label="Máximo do ajuste"
                            type="number"
                            min={draft.min ?? 1}
                            max={3600}
                            required
                            value={draft.max ?? ''}
                            onChange={(e) =>
                              setDraft({ ...draft, max: e.currentTarget.valueAsNumber })
                            }
                          />
                        </label>
                      </>
                    ) : null}
                    {draft.operation === 'trocar' ? (
                      <label>
                        Exercício
                        <select
                          aria-label="Exercício do ajuste"
                          value={draft.replacement ?? ''}
                          onChange={(e) =>
                            setDraft({ ...draft, replacement: e.currentTarget.value })
                          }
                        >
                          {EXERCISES.map((ex) => (
                            <option key={ex.id} value={ex.id}>
                              {ex.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <Button type="submit" disabled={busy}>
                      Revisar ajuste
                    </Button>
                    <Button disabled={busy} onClick={() => setEditing(false)}>
                      Cancelar
                    </Button>
                  </form>
                ) : (
                  <div className="row-wrap" style={{ gap: 8 }}>
                    <Button
                      variant="primary"
                      disabled={busy}
                      onClick={() => void run(() => saveAnalysisAdjustment(sessionID, saved))}
                    >
                      Salvar
                    </Button>
                    <Button
                      disabled={busy}
                      onClick={() => {
                        setDraft(saved.reply.adjustment);
                        setEditing(true);
                      }}
                    >
                      Ajustar
                    </Button>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void run(() => updateAnalysis(sessionID, { ...saved, status: 'refused' }))
                      }
                    >
                      Recusar
                    </Button>
                  </div>
                )}
              </>
            ) : null}
            {saved.status === 'saved' ? (
              <>
                <p>Salvo. O ajuste será usado na próxima vez.</p>
                {saved.undo ? (
                  <Button
                    disabled={busy}
                    onClick={() => void run(() => undoAnalysisAdjustment(sessionID, saved))}
                  >
                    Voltar ao anterior
                  </Button>
                ) : null}
              </>
            ) : null}
            {saved.status === 'refused' ? <p>Ajuste recusado. A ficha foi preservada.</p> : null}
            {saved.status === 'undone' ? <p>Desfeito: voltou como estava.</p> : null}
          </>
        ) : (
          <>
            <p>
              Vão só os números do treino e os nomes dos exercícios, sem notas ou dados de saúde.
            </p>
            {!online ? <p>Sem internet. Conecte para analisar.</p> : null}
            <Button
              disabled={busy || !online}
              onClick={() => void run(() => requestAnalysis(sessionID))}
            >
              {busy ? 'Analisando...' : 'Analisar este treino'}
            </Button>
          </>
        )}
        {error ? <p role="alert">{error}</p> : null}
      </div>
    </Widget>
  );
}
