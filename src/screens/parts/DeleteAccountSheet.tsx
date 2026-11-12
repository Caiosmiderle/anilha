import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccountApi } from '../../app/account';
import { rpc } from '../../sync/client';
import { Sheet } from '../../ui/overlays';
import { Button, ErrorText, TextField } from '../../ui/primitives';

/** Deletes the account and every row of it, on the server and on this phone. */
export function DeleteAccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { signOut } = useAccountApi();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Apagar conta e todos os dados?"
      actions={
        <>
          <Button
            variant="danger"
            block
            disabled={text.trim().toUpperCase() !== 'APAGAR' || busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await rpc('delete_account');
                await signOut({ wipe: true });
                navigate('/entrar', { replace: true });
              } catch {
                setError(navigator.onLine ? 'Não deu para apagar agora' : 'Precisa de conexão');
              } finally {
                setBusy(false);
              }
            }}
          >
            Apagar para sempre
          </Button>
          <Button variant="tint" block onClick={onClose}>
            Manter conta
          </Button>
        </>
      }
    >
      <div className="stack">
        <p className="t-regular" style={{ margin: 0 }}>
          Treinos, corridas, plano, amizades e grupos somem do servidor e deste aparelho. Não dá
          para desfazer. Se quiser, exporte antes.
        </p>
        <TextField
          label='Digite "APAGAR" para confirmar'
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoComplete="off"
        />
        {error ? <ErrorText>{error}</ErrorText> : null}
      </div>
    </Sheet>
  );
}
