import { CloudOff, LogOut, Share2, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useToday } from '../data/hooks';
import { fmtPct } from '../engine/adherence';
import { addDays, formatDDMM, weekStart } from '../engine/dates';
import { useRemote } from '../sync/remote';
import {
  ERROR_TEXT,
  inviteToGroup,
  leaveGroup,
  shareText,
  type GroupCandidate,
  type GroupSummary,
  type RankingRow,
} from '../sync/social';
import { Sheet, useToast } from '../ui/overlays';
import { Avatar, Button, Empty, LoadingCard, Meter, Segmented, Widget } from '../ui/primitives';

/** Weekly challenge: share of each member's own plan, capped at 100%. */
export default function Group() {
  const { id } = useParams();
  const today = useToday();
  const navigate = useNavigate();
  const toast = useToast();
  const [week, setWeek] = useState<'atual' | 'passada'>('atual');
  const ws = week === 'atual' ? weekStart(today) : addDays(weekStart(today), -7);
  const groups = useRemote<GroupSummary[]>('my_groups', {});
  const ranking = useRemote<{ members?: RankingRow[]; error?: string }>('group_ranking', {
    p_group: id,
    p_week_start: ws,
  });
  const [leaving, setLeaving] = useState(false);
  const [inviting, setInviting] = useState(false);
  const group = groups.data?.find((g) => g.id === id);

  if (groups.offline && !groups.data)
    return <Empty icon={CloudOff}>Sem conexão. O ranking aparece quando o sinal voltar.</Empty>;
  if (!groups.data) return <LoadingCard lines={4} />;
  if (!group) return <Empty icon={Users}>Grupo não encontrado.</Empty>;
  const rows = ranking.data?.members ?? [];

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">{group.name}</h1>
          <p className="page-sub">
            Desafio da semana: cumprir o próprio plano. Treinar a mais não sobe no ranking.
          </p>
        </div>
      </header>
      <Segmented
        label="Semana"
        value={week}
        options={[
          { value: 'atual', label: 'Esta semana' },
          { value: 'passada', label: 'Semana passada' },
        ]}
        onChange={setWeek}
      />
      <Widget
        icon={Users}
        pastel="butter"
        title={`Ranking de ${formatDDMM(ws)} a ${formatDDMM(addDays(ws, 6))}`}
        sub="Porcentagem do plano cumprido, no máximo 100%"
      >
        {ranking.data === undefined ? (
          <LoadingCard lines={3} />
        ) : rows.length ? (
          <ol
            className="stack"
            style={{ listStyle: 'none', margin: 0, padding: 0 }}
            data-testid="ranking"
          >
            {rows.map((r) => (
              <li key={r.id} className="stack-sm" style={{ gap: 6 }} data-testid="ranking-row">
                <div className="row">
                  <span className="t-label t-num" style={{ width: 24 }}>
                    {r.position}º
                  </span>
                  <Avatar name={r.name} />
                  <span className="t-body" style={{ flex: 1 }}>
                    {r.name}
                    {r.is_me ? <span className="t-caption"> (você)</span> : null}
                  </span>
                  <strong className="t-strong t-num">{fmtPct(Number(r.pct))}</strong>
                </div>
                <Meter
                  value={Number(r.pct)}
                  label={`${r.name}: ${fmtPct(Number(r.pct))} do plano`}
                />
                <span className="t-caption">
                  Academia {r.done_gym} de {r.planned_gym}
                  {r.planned_run || r.done_run
                    ? ` · Corrida ${r.done_run} de ${r.planned_run}`
                    : ''}
                  {r.done_gym > r.planned_gym || r.done_run > r.planned_run
                    ? ' · acima do plano não conta'
                    : ''}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="empty-line">Ninguém no ranking ainda.</p>
        )}
      </Widget>
      <Widget title="Chamar mais gente" sub="Convide um amigo direto ou mande o código">
        <Button
          variant="tint"
          block
          icon={UserPlus}
          onClick={() => setInviting(true)}
          style={{ marginBottom: 'var(--space-3)' }}
        >
          Convidar amigos
        </Button>
        <div className="row">
          <span
            className="hb-recog-value t-num"
            style={{ flex: 1, fontSize: 24, margin: 0 }}
            data-testid="group-code"
          >
            {group.join_code}
          </span>
          <Button
            variant="tint"
            icon={Share2}
            onClick={async () => {
              const r = await shareText(
                'Anilha',
                `Entra no grupo ${group.name} no Anilha. Código:`,
                group.join_code,
              );
              if (r === 'copied') toast.show('Código copiado');
            }}
          >
            Compartilhar
          </Button>
        </div>
      </Widget>
      {inviting ? <InviteFriendsSheet group={group} onClose={() => setInviting(false)} /> : null}
      <Button variant="ghost" icon={LogOut} onClick={() => setLeaving(true)}>
        Sair do grupo
      </Button>
      <Sheet
        open={leaving}
        onClose={() => setLeaving(false)}
        title={`Sair de ${group.name}?`}
        actions={
          <>
            <Button
              variant="danger"
              block
              onClick={async () => {
                try {
                  await leaveGroup(group.id);
                  toast.show('Você saiu do grupo');
                  navigate('/amigos', { replace: true });
                } catch {
                  toast.show('Sem conexão agora', { error: true });
                }
              }}
            >
              Sair do grupo
            </Button>
            <Button variant="tint" block onClick={() => setLeaving(false)}>
              Ficar
            </Button>
          </>
        }
      >
        <p className="t-regular" style={{ margin: 0 }}>
          Sua aderência some do ranking deste grupo. Amizades continuam como estão.
        </p>
      </Sheet>
    </>
  );
}

/** Friends with their state in the group; inviting one sends it to their inbox. */
function InviteFriendsSheet({ group, onClose }: { group: GroupSummary; onClose: () => void }) {
  const toast = useToast();
  const list = useRemote<{ friends?: GroupCandidate[]; error?: string }>(
    'group_invite_candidates',
    { p_group: group.id },
  );
  const [busy, setBusy] = useState<string | null>(null);
  const friends = list.data?.friends;

  return (
    <Sheet open onClose={onClose} title={`Convidar para ${group.name}`}>
      {list.offline && !friends ? (
        <p className="empty-line">Sem conexão agora.</p>
      ) : !friends ? (
        <LoadingCard lines={3} />
      ) : friends.length === 0 ? (
        <p className="empty-line">
          Você ainda não tem amigos no Anilha. Chame alguém em Amigos e depois convide para o grupo.
        </p>
      ) : (
        <div className="hb-list" style={{ margin: '0 calc(-1 * var(--space-5))' }}>
          {friends.map((f) => (
            <div key={f.id} className="hb-list-row" data-testid="invite-candidate">
              <Avatar name={f.name} />
              <span className="hb-list-main">
                <span className="hb-list-title" style={{ display: 'block' }}>
                  {f.name}
                </span>
                {f.state !== 'livre' ? (
                  <span className="hb-list-sub">
                    {f.state === 'membro' ? 'Já está no grupo' : 'Convite enviado'}
                  </span>
                ) : null}
              </span>
              {f.state === 'livre' ? (
                <Button
                  variant="tint"
                  disabled={busy === f.id}
                  onClick={async () => {
                    setBusy(f.id);
                    try {
                      const r = await inviteToGroup(group.id, f.id);
                      if (r.error) toast.show(ERROR_TEXT[r.error] ?? 'Não deu', { error: true });
                      else toast.show(`Convite enviado para ${f.name}`);
                      await list.refresh();
                    } catch {
                      toast.show('Sem conexão agora', { error: true });
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  Convidar
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}
