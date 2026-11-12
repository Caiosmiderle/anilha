import { useProfile } from '../data/hooks';
import { updateProfile } from '../data/ops';
import { useRemote } from '../sync/remote';
import { unblockUser } from '../sync/social';
import { Button, LoadingCard, Switch, Widget } from '../ui/primitives';
import { HealthSwitch } from './parts/HealthConsent';

/**
 * Privacidade: the health permission, what friends see and who is blocked. Nothing is public;
 * the person chooses the rest.
 */
export default function Privacy() {
  const profile = useProfile();
  const blocked = useRemote<{ id: string; name: string }[]>('list_blocked', {});
  if (!profile) return <LoadingCard lines={5} />;

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Privacidade</h1>
          <p className="page-sub">Nada é público. Você escolhe o resto.</p>
        </div>
      </header>

      <div className="grid-2">
        <div className="stack">
          <Widget title="Dados de saúde" sub="Permissão separada, que você muda quando quiser">
            <HealthSwitch />
          </Widget>

          <Widget title="O que amigos veem" sub="Só quem você aceitou como amigo">
            <div className="stack-sm">
              <Switch
                label="Aderência da semana"
                checked={profile.share_adherence}
                onChange={(v) => void updateProfile({ share_adherence: v })}
              />
              <Switch
                label="Treinos feitos (tipo e data)"
                checked={profile.share_workouts}
                onChange={(v) => void updateProfile({ share_workouts: v })}
              />
              <Switch
                label="Recordes"
                checked={profile.share_records}
                onChange={(v) => void updateProfile({ share_records: v })}
              />
              <Switch
                label="Cargas, repetições e notas"
                hint="Desligado por padrão. Protegido no banco, não só na tela."
                checked={profile.share_details}
                onChange={(v) => void updateProfile({ share_details: v })}
              />
            </div>
          </Widget>
        </div>

        <div className="stack">
          {blocked.data?.length ? (
            <Widget title="Bloqueados">
              <ul className="stack-sm" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {blocked.data.map((b) => (
                  <li key={b.id} className="row">
                    <span className="t-regular" style={{ flex: 1 }}>
                      {b.name}
                    </span>
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        await unblockUser(b.id);
                        void blocked.refresh();
                      }}
                    >
                      Desbloquear
                    </Button>
                  </li>
                ))}
              </ul>
            </Widget>
          ) : null}
          {/* Static pages outside the app: a new tab keeps the app where it was. */}
          <div className="row privacy-links">
            <a className="hb-btn-link" href="/privacidade/" target="_blank" rel="noopener">
              Política de privacidade
            </a>
            <a className="hb-btn-link" href="/termos/" target="_blank" rel="noopener">
              Termos de uso
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
