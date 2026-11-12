import { CloudOff, MessageSquare, Send } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fmtAgo } from '../engine/format';
import {
  createTicket,
  PRIVACY_KINDS,
  TICKET_LABEL,
  useMyTickets,
  type Ticket,
  type TicketKind,
} from '../sync/tickets';
import { useToast } from '../ui/overlays';
import {
  Button,
  Chip,
  Empty,
  ErrorText,
  LoadingCard,
  Select,
  TextArea,
  Widget,
} from '../ui/primitives';

type Topic = 'problema' | 'sugestao' | 'dados' | 'outro';

const TOPICS: { value: Topic; label: string }[] = [
  { value: 'sugestao', label: 'Sugestão para melhorar o app' },
  { value: 'problema', label: 'Problema no app' },
  { value: 'dados', label: 'Meus dados e privacidade' },
  { value: 'outro', label: 'Outro assunto' },
];

const REQUESTS: { value: TicketKind; label: string }[] = [
  { value: 'acesso', label: 'Saber quais dados vocês têm e receber uma cópia' },
  { value: 'correcao', label: 'Corrigir dados' },
  { value: 'exclusao', label: 'Apagar dados' },
  { value: 'portabilidade', label: 'Levar meus dados para outro serviço' },
  { value: 'compartilhamento', label: 'Saber com quem meus dados são compartilhados' },
  { value: 'revogacao', label: 'Retirar um consentimento' },
  { value: 'privacidade', label: 'Outra dúvida sobre privacidade' },
];

/** What the person can already do alone, so a request is not the only way. */
function SelfService({ kind }: { kind: TicketKind }) {
  const text: Partial<Record<TicketKind, string>> = {
    acesso: 'Uma cópia de tudo sai na hora em Você, Seus dados, Exportar tudo (JSON).',
    portabilidade:
      'O JSON de Você, Seus dados, tem tudo; séries e corridas também saem em CSV, que abre em planilha.',
    exclusao:
      'Para apagar tudo de uma vez: Você, Conta, Apagar conta e dados. Para apagar só uma parte, escreva abaixo.',
    correcao: 'Nome e preferências você corrige em Você e em Ajustes; treinos, no Histórico.',
    revogacao:
      'Dados de saúde se desligam em Você, Privacidade. Para encerrar tudo, apague a conta.',
    compartilhamento: 'A lista de empresas que tratam dados para o app está na política.',
  };
  if (!text[kind]) return null;
  return (
    <p className="t-caption" style={{ margin: 0 }}>
      {text[kind]}{' '}
      {kind === 'compartilhamento' ? (
        <a href="/privacidade/#compartilhamento" target="_blank" rel="noopener">
          Ver a política
        </a>
      ) : null}
    </p>
  );
}

function day(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function TicketRow({ t }: { t: Ticket }) {
  const privacy = PRIVACY_KINDS.includes(t.kind);
  const due = new Date(new Date(t.created_at).getTime() + 15 * 86400000).toISOString();
  return (
    <li className="ticket" data-testid="ticket">
      <div className="row" style={{ justifyContent: 'space-between', gap: 'var(--space-2)' }}>
        <span className="t-strong">{TICKET_LABEL[t.kind]}</span>
        <Chip pastel={t.status === 'respondido' ? 'mint' : 'neutral'}>
          {t.status === 'respondido' ? 'Respondida' : 'Aberta'}
        </Chip>
      </div>
      <span className="t-caption">
        Enviada {fmtAgo(t.created_at)}
        {t.status === 'aberto' && privacy ? ` · resposta até ${day(due)}` : ''}
      </span>
      <p className="t-regular ticket-text">{t.message}</p>
      {t.answer ? (
        <div className="ticket-answer">
          <span className="t-caption">
            Resposta{t.answered_at ? ` · ${fmtAgo(t.answered_at)}` : ''}
          </span>
          <p className="t-regular ticket-text">{t.answer}</p>
        </div>
      ) : null}
    </li>
  );
}

export default function Messages() {
  const toast = useToast();
  const tickets = useMyTickets();
  const [params] = useSearchParams();
  const asked = params.get('assunto') as Topic | null;
  const [topic, setTopic] = useState<Topic>(
    asked && TOPICS.some((t) => t.value === asked) ? asked : 'sugestao',
  );
  const [request, setRequest] = useState<TicketKind>('acesso');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kind: TicketKind = topic === 'dados' ? request : topic;

  async function send() {
    if (!message.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await createTicket(kind, message.trim());
      setMessage('');
      toast.show('Mensagem enviada');
      await tickets.refresh();
    } catch (err) {
      setError(
        navigator.onLine
          ? (err as Error).message || 'Não deu para enviar agora'
          : 'Sem conexão. A mensagem não foi enviada.',
      );
    } finally {
      setBusy(false);
    }
  }

  const list = tickets.data ?? [];
  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Fale com o Anilha</h1>
          <p className="page-sub">Problemas, ideias e pedidos sobre seus dados</p>
        </div>
      </header>

      <div className="grid-2">
        <Widget title="Nova mensagem">
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <Select<Topic> label="Assunto" value={topic} options={TOPICS} onChange={setTopic} />
            {topic === 'dados' ? (
              <>
                <Select<TicketKind>
                  label="Pedido"
                  value={request}
                  options={REQUESTS}
                  onChange={setRequest}
                />
                <SelfService kind={request} />
              </>
            ) : null}
            <TextArea
              label="Mensagem"
              value={message}
              onChange={setMessage}
              maxLength={2000}
              placeholder={
                topic === 'sugestao'
                  ? 'O que faria o Anilha melhor para você?'
                  : topic === 'problema'
                    ? 'O que aconteceu e em qual tela?'
                    : topic === 'dados'
                      ? 'Conte o que você precisa'
                      : 'Escreva aqui'
              }
            />
            {error ? <ErrorText>{error}</ErrorText> : null}
            <Button variant="primary" type="submit" icon={Send} disabled={busy || !message.trim()}>
              {busy ? 'Enviando' : 'Enviar'}
            </Button>
            <p className="t-caption" style={{ margin: 0 }}>
              A resposta chega aqui e no sino de avisos. Pedidos sobre dados pessoais são
              respondidos em até 15 dias. Com problemas no app vão junto a versão e o navegador,
              para achar o erro.
            </p>
          </form>
        </Widget>

        <Widget title="Suas mensagens">
          {tickets.offline && !tickets.data ? (
            <Empty icon={CloudOff}>Sem conexão. As mensagens aparecem quando voltar.</Empty>
          ) : !tickets.data ? (
            <LoadingCard lines={2} />
          ) : list.length === 0 ? (
            <Empty icon={MessageSquare}>Nenhuma mensagem ainda.</Empty>
          ) : (
            <ul className="ticket-list">
              {list.map((t) => (
                <TicketRow key={t.id} t={t} />
              ))}
            </ul>
          )}
        </Widget>
      </div>
    </>
  );
}
