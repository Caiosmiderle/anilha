import { Copy, CloudOff, LogIn, Smartphone, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { clearPendingInvite, savePendingInvite } from '../lib/pendingInvite';
import { acceptInvite, ERROR_TEXT, inviteInfo } from '../sync/social';
import { LogoMark } from '../ui/brand';
import { useToast } from '../ui/overlays';
import { Avatar, Button, Empty, ErrorText, Icon, LoadingCard, Widget } from '../ui/primitives';

/** Opened from an invite link. Accepting is one tap; nothing happens without it. */
export default function Invite() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [info, setInfo] = useState<{ inviter_name: string; already_friends: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const offline = !navigator.onLine;

  // The invite is on screen now; it no longer needs to wait for the login.
  useEffect(() => clearPendingInvite(), []);

  useEffect(() => {
    if (offline) return;
    inviteInfo(code)
      .then((r) => (r.error ? setError(ERROR_TEXT[r.error] ?? 'Convite inválido') : setInfo(r)))
      .catch(() => setError('Sem conexão agora'));
  }, [code, offline]);

  if (offline)
    return <Empty icon={CloudOff}>Sem conexão. Abra o convite de novo quando tiver sinal.</Empty>;
  if (error) {
    return (
      <Widget title="Convite">
        <div className="stack">
          <ErrorText>{error}</ErrorText>
          <Button variant="tint" onClick={() => navigate('/amigos')}>
            Ir para amigos
          </Button>
        </div>
      </Widget>
    );
  }
  if (!info) return <LoadingCard lines={2} />;

  return (
    <Widget
      title={
        <span className="row" style={{ gap: 10 }}>
          <Avatar name={info.inviter_name} large />
          {info.already_friends
            ? `Você e ${info.inviter_name} já são amigos`
            : `${info.inviter_name} te chamou para treinar junto`}
        </span>
      }
      foot={
        info.already_friends ? (
          <Button variant="tint" onClick={() => navigate('/amigos')}>
            Ver amigos
          </Button>
        ) : (
          <>
            <Button
              variant="primary"
              block
              icon={UserPlus}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await acceptInvite(code);
                  if (r.error) {
                    setError(ERROR_TEXT[r.error] ?? 'Convite inválido');
                    return;
                  }
                  toast.show(`Agora você e ${r.name} são amigos`);
                  navigate('/amigos', { replace: true });
                } catch {
                  setError('Sem conexão agora');
                } finally {
                  setBusy(false);
                }
              }}
            >
              Aceitar convite
            </Button>
            <Button variant="ghost" onClick={() => navigate('/')}>
              Agora não
            </Button>
          </>
        )
      }
    >
      <p className="t-regular" style={{ margin: 0 }}>
        Amigos veem a aderência da semana, os treinos (tipo e data) e os recordes. Cargas,
        repetições e notas só se cada um liberar.
      </p>
    </Widget>
  );
}

/**
 * The invite link opened without an account, usually in Safari from a chat. The
 * invite waits until the login and the onboarding are done, and the code stays on
 * screen for the installed app, whose storage is separate from Safari.
 */
export function InviteLanding({ code }: { code: string }) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  useEffect(() => savePendingInvite(code), [code]);
  const pretty = code.length === 8 ? `${code.slice(0, 4)} ${code.slice(4)}` : code;

  return (
    <main className="auth-wrap">
      <div className="hb-auth">
        <div className="hb-auth-panel p-butter">
          <div className="auth-panel-inner">
            <LogoMark size={48} />
            <p className="t-body" style={{ margin: 0, maxWidth: 360 }}>
              Amigos no Anilha veem a constância um do outro. Cargas, repetições e notas só se cada
              um liberar.
            </p>
          </div>
        </div>
        <div className="hb-auth-form">
          <h1 className="hb-auth-title">Você recebeu um convite para treinar junto</h1>
          <div className="invite-code" data-testid="landing-code">
            <span className="t-caption">Código do convite</span>
            <strong>{pretty}</strong>
            <button
              type="button"
              className="hb-btn-link"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(code);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              <Icon icon={Copy} size={18} />
              {copied ? 'Copiado' : 'Copiar código'}
            </button>
          </div>
          <Button variant="primary" block icon={LogIn} onClick={() => navigate('/entrar')}>
            Entrar e aceitar
          </Button>
          <p className="t-caption" style={{ margin: 0, textAlign: 'center' }}>
            O convite fica guardado neste navegador até você entrar. Conta nova também serve.
          </p>
          <div className="hb-advice">
            <Icon icon={Smartphone} />
            <span>
              Usa o Anilha instalado na tela de início? Abra o app, vá em Amigos, toque em Usar
              código e digite o código acima.
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
