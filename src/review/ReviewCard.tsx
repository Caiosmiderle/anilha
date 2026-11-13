import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAccount } from '../app/account';
import { currentStore } from '../data/store';
import { useToday } from '../data/hooks';
import { Button, Widget } from '../ui/primitives';
import { VOLUME_GROUP_LABEL } from '../engine/taxonomy';
import { EXERCISES } from '../engine/exercises';
import { estimatedCost } from '../analysis/contract';
import {
  requestReview,
  reviewKey,
  reviewInput,
  reviewVersion,
  reviewProposal,
  decideReview,
  type SavedReview,
} from './local';

export function ReviewCard({ routineID }: { routineID: string }) {
  const { db } = useAccount();
  const today = useToday();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  const state = useLiveQuery(async () => {
    const input = await reviewInput(db, today);
    const saved = (await db.meta.get(reviewKey(routineID)))?.value as SavedReview | undefined;
    return { input, saved: saved?.reply && saved.version === reviewVersion(input, routineID) ? saved : undefined };
  }, [db, routineID, today]);
  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    const owner = currentStore();
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (e) {
      if (currentStore() === owner)
        setError(e instanceof Error ? e.message : 'Não foi possível revisar.');
    } finally {
      if (currentStore() === owner) setBusy(false);
    }
  }
  const saved = state?.saved;
  return (
    <Widget title="Revisão da ficha" className="analysis-widget">
      <div className="stack-sm" data-testid="review-card" aria-busy={busy}>
        <p className="muted">
          A IA revisa o motor. Cada ajuste só vale com sua confirmação. Usa o limite diário do
          Waltér. Envia a ficha, o plano, o volume e corridas agregadas, sem dados pessoais ou de
          saúde.
        </p>
        {!saved ? (
          <Button
            disabled={busy || !online || !state}
            onClick={() => void run(() => requestReview(routineID, today))}
          >
            {busy ? 'Revisando...' : 'Revisar com IA'}
          </Button>
        ) : (
          <>
            <strong>
              {
                { boa: 'Boa ficha', ajustavel: 'Ficha ajustável', revisar: 'Vale revisar' }[
                  saved.reply.avaliacao
                ]
              }
            </strong>
            <p>{saved.reply.resumo}</p>
            {saved.reply.pontos.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            {saved.reply.ajustes.map((a, i) => {
              const decision = saved.decisions[i]!;
              const proposal =
                decision.proposal ?? reviewProposal(saved, i, state!.input, routineID);
              const changed =
                proposal?.kind === 'ficha'
                  ? proposal.after.items.findIndex(
                      (item, n) =>
                        JSON.stringify(item) !== JSON.stringify(proposal.before.items[n]),
                    )
                  : -1;
              const line = (which: 'before' | 'after') => {
                if (proposal?.kind !== 'ficha') return '';
                const item = proposal[which].items[changed];
                return item
                  ? `${EXERCISES.find((e) => e.id === item.exercise_id)?.name ?? 'Exercício personalizado'}: ${item.sets} séries de ${item.target_min} a ${item.target_max}`
                  : '';
              };
              return (
                <div className="hb-advice hb-advice-brand" key={i} data-testid="review-adjustment">
                  <div className="stack-sm">
                    <h3>Ajuste {i + 1}</h3>
                    <p>{a.motivo}</p>
                    {changed >= 0 ? (
                      <>
                        <p>Antes: {line('before')}</p>
                        <p>Depois: {line('after')}</p>
                      </>
                    ) : (
                      <p>Este ajuste não pode ser aplicado à ficha atual.</p>
                    )}
                    {proposal?.kind === 'ficha' &&
                      (proposal.volume.length > 0 || proposal.risks.length > 0) && (
                        <details>
                          <summary>Volume semanal e avisos do motor</summary>
                          {proposal.volume.map((v) => (
                            <p key={v.group}>
                              {VOLUME_GROUP_LABEL[v.group]}: {v.before} para {v.after} séries por
                              semana
                            </p>
                          ))}
                          {proposal.risks.map((r) => (
                            <p key={r.text}>
                              {r.text} Fonte: {r.source}
                            </p>
                          ))}
                        </details>
                      )}
                    {decision.status === 'proposed' ? (
                      <div className="row">
                        <Button
                          disabled={busy || changed < 0}
                          onClick={() => void run(() => decideReview(routineID, i, 'apply', today))}
                        >
                          Aplicar
                        </Button>
                        <Button
                          disabled={busy}
                          onClick={() =>
                            void run(() => decideReview(routineID, i, 'refuse', today))
                          }
                        >
                          Recusar
                        </Button>
                      </div>
                    ) : (
                      <p>
                        {decision.status === 'saved'
                          ? 'Aplicado.'
                          : decision.status === 'refused'
                            ? 'Recusado.'
                            : 'Desfeito: voltou como estava.'}
                      </p>
                    )}
                    {decision.status === 'saved' && (
                      <Button
                        disabled={busy}
                        onClick={() => void run(() => decideReview(routineID, i, 'undo', today))}
                      >
                        Voltar ao anterior
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
            {saved.usage && (
              <p className="muted" data-testid="review-usage">
                {saved.usage.model} · {saved.usage.input_tokens}/{saved.usage.output_tokens} tokens
                · custo estimado US${' '}
                {estimatedCost(saved.usage)?.toLocaleString('pt-BR', {
                  minimumFractionDigits: 7,
                  maximumFractionDigits: 7,
                }) ?? 'indisponível'}
              </p>
            )}
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    </Widget>
  );
}
