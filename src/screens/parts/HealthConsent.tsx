import { Download, HeartPulse } from 'lucide-react';
import { useState } from 'react';
import { useAccount } from '../../app/account';
import { exportJson } from '../../data/exportImport';
import { saveFile } from '../../lib/files';
import { countHealthLocal, setHealthConsent, useConsent } from '../../sync/consent';
import { Sheet, useToast } from '../../ui/overlays';
import { Button, ErrorText, Switch, Widget } from '../../ui/primitives';

/** What health consent covers, in the same words everywhere it is asked. */
export function HealthText() {
  return (
    <p className="t-regular" style={{ margin: 0 }}>
      Peso, cintura, dores e articulações que você quer poupar são dados de saúde. Com a sua
      permissão, o Anilha guarda esses dados para ajustar os treinos e mostrar a sua evolução. Sem
      ela, essas funções ficam desligadas e o resto funciona igual. Dá para mudar quando quiser em
      Você, Privacidade.
    </p>
  );
}

function failure(err: unknown): string {
  if (!navigator.onLine) return 'Sem conexão. A escolha fica no servidor: conecte e tente de novo.';
  return (err as Error).message || 'Não deu para salvar agora. Tente de novo.';
}

/**
 * The health choice and its sheets. Allowing from a short label explains first; refusing
 * warns first only when there is something on the phone to delete.
 */
function useHealthChoice() {
  const { db, email } = useAccount();
  const toast = useToast();
  const [sheet, setSheet] = useState<'on' | 'off' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(granted: boolean) {
    setBusy(true);
    setError(null);
    try {
      await setHealthConsent(granted);
      setSheet(null);
      toast.show(granted ? 'Dados de saúde ligados' : 'Dados de saúde desligados');
    } catch (err) {
      setError(failure(err));
    } finally {
      setBusy(false);
    }
  }

  async function ask(granted: boolean, explained = false) {
    setError(null);
    if (granted) {
      if (explained) await choose(true);
      else setSheet('on');
      return;
    }
    if ((await countHealthLocal(db)) === 0) await choose(false);
    else setSheet('off');
  }

  const sheets = (
    <>
      <Sheet
        open={sheet === 'on'}
        onClose={() => setSheet(null)}
        title="Permitir dados de saúde?"
        actions={
          <>
            <Button variant="primary" block disabled={busy} onClick={() => void choose(true)}>
              Permitir
            </Button>
            <Button variant="tint" block onClick={() => setSheet(null)}>
              Agora não
            </Button>
          </>
        }
      >
        <div className="stack">
          <HealthText />
          {error ? <ErrorText>{error}</ErrorText> : null}
        </div>
      </Sheet>
      <Sheet
        open={sheet === 'off'}
        onClose={() => setSheet(null)}
        title="Desligar e apagar dados de saúde?"
        actions={
          <>
            <Button variant="danger" block disabled={busy} onClick={() => void choose(false)}>
              Desligar e apagar
            </Button>
            <Button variant="tint" block onClick={() => setSheet(null)}>
              Manter ligado
            </Button>
          </>
        }
      >
        <div className="stack">
          <p className="t-regular" style={{ margin: 0 }}>
            Registros de peso e medidas, dores marcadas e articulações a poupar saem deste aparelho,
            dos seus outros aparelhos e do servidor. Treinos e corridas ficam. Para guardar uma
            cópia, exporte antes.
          </p>
          <Button
            variant="outline"
            icon={Download}
            onClick={async () => saveFile(await exportJson(email), 'anilha-dados.json')}
          >
            Exportar antes (JSON)
          </Button>
          {error ? <ErrorText>{error}</ErrorText> : null}
        </div>
      </Sheet>
    </>
  );

  return { ask, busy, error, sheets };
}

/** In place of a health feature while consent is off or not answered yet. */
export function HealthOffCard({ title }: { title?: string }) {
  const { healthPending } = useConsent();
  const choice = useHealthChoice();
  return (
    <Widget
      icon={HeartPulse}
      pastel="neutral"
      title={
        title ??
        (healthPending ? 'Dados de saúde: falta sua resposta' : 'Dados de saúde desligados')
      }
    >
      <div className="stack-sm">
        <HealthText />
        {choice.error ? <ErrorText>{choice.error}</ErrorText> : null}
        <Button variant="tint" disabled={choice.busy} onClick={() => void choice.ask(true, true)}>
          Permitir dados de saúde
        </Button>
      </div>
    </Widget>
  );
}

/** Você: the pending choice, at the top, until the person answers. */
export function HealthPendingCard() {
  const { healthPending } = useConsent();
  const choice = useHealthChoice();
  if (!healthPending) return null;
  return (
    <Widget icon={HeartPulse} pastel="peach" title="Pendente: dados de saúde">
      <div className="stack-sm" data-testid="health-pending">
        <HealthText />
        {choice.error ? <ErrorText>{choice.error}</ErrorText> : null}
        <div className="row health-choice">
          <Button
            variant="primary"
            disabled={choice.busy}
            onClick={() => void choice.ask(true, true)}
          >
            Permitir
          </Button>
          <Button variant="tint" disabled={choice.busy} onClick={() => void choice.ask(false)}>
            Não permitir
          </Button>
        </div>
      </div>
      {choice.sheets}
    </Widget>
  );
}

/** Privacy settings: health data on or off. Off asks first when it deletes something. */
export function HealthSwitch() {
  const { health, healthPending } = useConsent();
  const choice = useHealthChoice();
  return (
    <>
      <Switch
        label="Dados de saúde"
        hint={
          healthPending
            ? 'Pendente: escolha se o Anilha pode guardar peso, medidas, dores e articulações.'
            : 'Peso, medidas, dores e articulações. Só com a sua permissão.'
        }
        checked={health}
        onChange={(v) => void choice.ask(v)}
      />
      {choice.error ? <ErrorText>{choice.error}</ErrorText> : null}
      {choice.sheets}
    </>
  );
}
