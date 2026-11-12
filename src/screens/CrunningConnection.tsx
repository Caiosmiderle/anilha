import { useEffect, useState } from 'react';
import { useAccount } from '../app/account';
import { currentStore } from '../data/store';
import { accountRpc } from '../sync/client';
import { Button, LoadingCard, TextField, Widget } from '../ui/primitives';

interface TokenState {
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}
const when = (date: string) => new Date(date).toLocaleString('pt-BR');

export default function CrunningConnection() {
  const { userId } = useAccount();
  return <ConnectionForm key={userId} userId={userId} />;
}

function ConnectionForm({ userId }: { userId: string }) {
  const [state, setState] = useState<TokenState | null | undefined>();
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<'generate' | 'revoke' | null>(null);
  useEffect(() => {
    const owner = currentStore();
    let live = true;
    if (owner)
      void accountRpc<TokenState | null>(owner, 'crunning_token_state')
        .then((value) => {
          if (live) setState(value);
        })
        .catch(() => {
          if (live)
            setError('Não foi possível consultar. Confira a conexão e abra esta tela novamente.');
        });
    return () => {
      live = false;
    };
  }, [userId]);
  async function act(action: 'generate' | 'revoke') {
    const owner = currentStore();
    if (!owner || busy) return;
    setBusy(true);
    setError('');
    setSecret('');
    setCopied(false);
    setConfirm(null);
    try {
      if (action === 'generate') {
        const result = await accountRpc<{ token: string }>(owner, 'crunning_generate_token');
        setSecret(result.token);
      } else await accountRpc(owner, 'crunning_revoke_token');
      setState(await accountRpc<TokenState | null>(owner, 'crunning_token_state'));
    } catch {
      setError('Não foi possível concluir. Confira a conexão e consulte o estado novamente.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">CRUNNING</h1>
          <p className="page-sub">Conexões</p>
        </div>
      </header>
      <div className="stack">
        <Widget title="Conexão com o CRUNNING">
          <p>
            Troca resumos de corridas e treinos de força, feitos e planejados, sem rota, GPS, ritmo
            ponto a ponto, batimentos, dor, texto livre, nome da pessoa ou e-mail.
          </p>
          <p>Cole o token em Ajustes &gt; Conexões &gt; Anilha no CRUNNING.</p>
          {error ? <p role="alert">{error}</p> : null}
          {state === undefined && !error ? <LoadingCard lines={2} /> : null}
          {state ? (
            <div className="stack-sm">
              <p>
                {state.revoked_at
                  ? `Revogado em ${when(state.revoked_at)}`
                  : `Ativo desde ${when(state.created_at)}`}
              </p>
              <p>Último uso: {state.last_used_at ? when(state.last_used_at) : 'ainda não usado'}</p>
            </div>
          ) : state === null ? (
            <p>Nenhum token gerado.</p>
          ) : null}
          <div className="row">
            <Button
              variant="primary"
              disabled={busy || state === undefined}
              onClick={() =>
                state && !state.revoked_at ? setConfirm('generate') : void act('generate')
              }
            >
              {state && !state.revoked_at ? 'Gerar novo token' : 'Gerar token'}
            </Button>
            {state && !state.revoked_at ? (
              <Button disabled={busy} onClick={() => setConfirm('revoke')}>
                Revogar
              </Button>
            ) : null}
          </div>
          <p className="t-caption">
            Revogar não apaga as corridas e os planejados que já chegaram.
          </p>
          {confirm ? (
            <div className="stack-sm" role="group" aria-label="Confirmar alteração">
              <p>
                {confirm === 'generate'
                  ? 'O token anterior será revogado. Você precisará colar o novo no CRUNNING.'
                  : 'O CRUNNING perde o acesso imediatamente. Revogar não apaga o que já chegou.'}
              </p>
              <Button disabled={busy} onClick={() => void act(confirm)}>
                Confirmar {confirm === 'generate' ? 'novo token' : 'revogação'}
              </Button>
              <Button onClick={() => setConfirm(null)}>Cancelar</Button>
            </div>
          ) : null}
        </Widget>
        {secret ? (
          <Widget title="Copie agora">
            <p>
              Este token aparece uma única vez. Ao sair desta tela, ele não aparece de novo. Guarde
              apenas no CRUNNING.
            </p>
            <TextField
              label="Token do CRUNNING"
              readOnly
              value={secret}
              autoComplete="off"
              spellCheck={false}
            />
            <Button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(secret);
                  setCopied(true);
                } catch {
                  setError('Não foi possível copiar. Selecione e copie o token no campo.');
                }
              }}
            >
              {copied ? 'Copiado' : 'Copiar token'}
            </Button>
            <Button onClick={() => setSecret('')}>Já guardei</Button>
          </Widget>
        ) : null}
      </div>
    </>
  );
}
