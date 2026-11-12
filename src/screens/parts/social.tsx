import { ThumbsUp } from 'lucide-react';
import { useState } from 'react';
import { adherencePct, fmtPct } from '../../engine/adherence';
import { formatDDMM, WEEKDAY_SHORT, weekday } from '../../engine/dates';
import { setReaction, type FriendActivity, type FriendOverview } from '../../sync/social';
import { useToast } from '../../ui/overlays';
import { Icon, Meter } from '../../ui/primitives';

export function AdherenceLine({ a }: { a: FriendOverview['adherence'] }) {
  if (!a) return <span className="t-caption">Aderência privada</span>;
  const pct = adherencePct(
    { gym: a.planned_gym, run: a.planned_run },
    { gym: a.done_gym, run: a.done_run },
  );
  return (
    <div className="stack-sm" style={{ gap: 6 }}>
      <span className="t-regular">
        Academia {a.done_gym} de {a.planned_gym}
        {a.planned_run || a.done_run ? ` · Corrida ${a.done_run} de ${a.planned_run}` : ''}
      </span>
      {a.planned_gym + a.planned_run > 0 ? (
        <div className="row" style={{ gap: 8 }}>
          <div style={{ flex: 1 }}>
            <Meter value={pct} label={`Plano da semana: ${fmtPct(pct)}`} />
          </div>
          <span className="t-caption t-num">{fmtPct(pct)}</span>
        </div>
      ) : null}
    </div>
  );
}

export function ActivityRow({
  friendId,
  a,
  onChanged,
}: {
  friendId: string;
  a: FriendActivity;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [reacted, setReacted] = useState(a.reacted);
  const count = a.reactions + (reacted === a.reacted ? 0 : reacted ? 1 : -1);
  return (
    <div className="row" style={{ minHeight: 48 }}>
      <span className="t-regular" style={{ flex: 1, minWidth: 0 }}>
        {a.title}
        <span className="t-caption" style={{ display: 'block' }}>
          {WEEKDAY_SHORT[weekday(a.local_date)]}, {formatDDMM(a.local_date)}
          {a.distance_km ? ` · ${String(a.distance_km).replace('.', ',')} km` : ''}
        </span>
      </span>
      <button
        type="button"
        className="hb-choice"
        aria-pressed={reacted}
        aria-label={`${reacted ? 'Tirar boa' : 'Mandar um boa'} em ${a.title}`}
        disabled={busy}
        onClick={async () => {
          const next = !reacted;
          setReacted(next);
          setBusy(true);
          try {
            const r = await setReaction(friendId, a.kind, a.id, next);
            if (r.error) throw new Error(r.error);
            onChanged();
          } catch {
            setReacted(!next);
            toast.show('Sem conexão agora', { error: true });
          } finally {
            setBusy(false);
          }
        }}
      >
        <Icon icon={ThumbsUp} size={18} />
        Boa{count > 0 ? ` ${count}` : ''}
      </button>
    </div>
  );
}
