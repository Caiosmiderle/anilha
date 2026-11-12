import { LogOut, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccountApi } from '../app/account';
import { acceptTerms, useConsent } from '../sync/consent';
import { LogoMark } from '../ui/brand';
import { Button, CheckRow, ErrorText, Icon } from '../ui/primitives';
import { DeleteAccountSheet } from './parts/DeleteAccountSheet';

/**
 * Shown once per version of the terms, before anything else: terms and age. Health data
 * is not asked here; it waits in Você as a pending item.
 */
export default function Consent() {
  const { signOut } = useAccountApi();
  const navigate = useNavigate();
  const { state } = useConsent();
  const updated = !!state?.termos;
  const [terms, setTerms] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!terms || busy) return;
    setError(null);
    setBusy(true);
    try {
      await acceptTerms();
    } catch (err) {
      setError(
        navigator.onLine
          ? (err as Error).message || 'Não deu para salvar agora. Tente de novo.'
          : 'Sem conexão. Conecte uma vez para continuar.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-wrap" data-consent="">
      <div className="hb-auth">
        <div className="hb-auth-panel p-sky">
          <div className="auth-panel-inner">
            <LogoMark size={48} />
            <p className="t-body" style={{ margin: 0, maxWidth: 360 }}>
              Seus treinos são seus. Ficam no seu aparelho e em servidores no Brasil.
            </p>
          </div>
        </div>
        <form
          className="hb-auth-form consent-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          noValidate
        >
          <h1 className="hb-auth-title">Seus dados no Anilha</h1>
          <p className="t-regular t-muted" style={{ margin: 0 }}>
            {updated
              ? 'Atualizamos os termos de uso e a política de privacidade. Leia o resumo e confirme para continuar.'
              : 'Antes de começar, veja o que o app guarda e por quê.'}
          </p>
          <ul className="consent-list">
            <li>Seu e-mail, para você entrar com um código, sem senha.</li>
            <li>Treinos, corridas e plano, para montar e ajustar a sua semana.</li>
            <li>
              Dados de saúde, como peso e dores, só se você permitir depois, em Você. Até lá, essas
              funções ficam desligadas.
            </li>
            <li>Nada é vendido nem usado para publicidade. O app não usa cookies.</li>
            <li>Você baixa ou apaga tudo quando quiser, em Você.</li>
          </ul>
          <p className="t-regular" style={{ margin: 0 }}>
            Detalhes na{' '}
            <a href="/privacidade/" target="_blank" rel="noopener">
              Política de privacidade
            </a>{' '}
            e nos{' '}
            <a href="/termos/" target="_blank" rel="noopener">
              Termos de uso
            </a>
            .
          </p>
          <CheckRow
            label="Tenho 18 anos ou mais e aceito os Termos de uso e a Política de privacidade"
            checked={terms}
            onChange={setTerms}
          />
          {error ? <ErrorText>{error}</ErrorText> : null}
          <Button variant="primary" block type="submit" disabled={!terms || busy}>
            {busy ? 'Salvando' : 'Continuar'}
          </Button>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <button
              type="button"
              className="hb-btn-link"
              onClick={async () => {
                await signOut();
                navigate('/entrar', { replace: true });
              }}
            >
              <Icon icon={LogOut} size={18} />
              Sair
            </button>
            <button type="button" className="hb-btn-link" onClick={() => setDeleting(true)}>
              <Icon icon={Trash2} size={18} />
              Apagar conta
            </button>
          </div>
        </form>
      </div>
      <DeleteAccountSheet open={deleting} onClose={() => setDeleting(false)} />
    </main>
  );
}
