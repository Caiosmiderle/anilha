import { ArrowLeft, Mail } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAccountApi } from '../app/account';
import { classifyCodeError } from '../lib/authCodeError';
import { finishAuthLink, takeAuthLink } from '../lib/authLink';
import { env } from '../lib/env';
import { readPendingInvite } from '../lib/pendingInvite';
import { LogoMark } from '../ui/brand';
import { Button, ErrorText, Icon, TextField } from '../ui/primitives';

type Step = 'email' | 'code';

/**
 * Login with a 6-digit code by email. The code is typed inside the app, so it works
 * in the iOS home-screen app, whose storage is separate from Safari (a magic link
 * would open Safari and the login would never reach the installed app). The link in
 * the same e-mail also works, for the browser and for Android.
 */
export default function Auth() {
  const { signIn } = useAccountApi();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [invite] = useState(readPendingInvite);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const link = takeAuthLink();
    if (!link) return;
    if (link.kind === 'error') {
      finishAuthLink();
      setLinkError(
        link.code === 'otp_expired'
          ? 'O link expirou ou já foi usado. Peça um código novo'
          : 'Não deu para entrar pelo link. Peça um código novo',
      );
      return;
    }
    setLinking(true);
    void (async () => {
      try {
        const { getClient } = await import('../sync/client');
        const client = await getClient();
        const { data, error: err } = await client.auth.setSession({
          access_token: link.accessToken,
          refresh_token: link.refreshToken,
        });
        if (err || !data.user) throw err ?? new Error('sem usuário');
        // The session is saved now; signIn stores the account before any await.
        finishAuthLink();
        await signIn({ id: data.user.id, email: data.user.email ?? '' });
      } catch {
        finishAuthLink();
        setLinking(false);
        setLinkError(
          navigator.onLine
            ? 'Não deu para entrar pelo link. Peça um código novo'
            : 'Sem conexão agora. Abra o link de novo quando tiver sinal',
        );
      }
    })();
  }, [signIn]);

  useEffect(() => {
    if (step === 'code') inputs.current[0]?.focus();
  }, [step]);

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      setError('E-mail inválido');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { getClient } = await import('../sync/client');
      const client = await getClient();
      const { error: err } = await client.auth.signInWithOtp({
        email: clean,
        options: { shouldCreateUser: true },
      });
      if (err) throw err;
      setEmail(clean);
      setDigits(Array(6).fill(''));
      setStep('code');
      if (env.showDevCode) {
        const r = await fetch(`${env.supabaseUrl}/dev/otp?email=${encodeURIComponent(clean)}`);
        setDevCode(((await r.json()) as { code: string | null }).code);
      }
    } catch (err) {
      const status = (err as { status?: number }).status;
      setError(
        status === 429
          ? 'Muitos pedidos. Espere um pouco'
          : navigator.onLine
            ? 'Não deu para enviar'
            : 'Sem conexão agora',
      );
    } finally {
      setBusy(false);
    }
  }

  async function verify(code: string) {
    setBusy(true);
    setError(null);
    try {
      const { getClient } = await import('../sync/client');
      const client = await getClient();
      const { data, error: err } = await client.auth.verifyOtp({
        email,
        token: code,
        type: 'email',
      });
      if (err || !data.user) throw err ?? new Error('sem usuário');
      // The login route redirects once the account is open.
      await signIn({ id: data.user.id, email: data.user.email ?? email });
    } catch (err) {
      const failure = classifyCodeError(err, navigator.onLine);
      setError(failure.message);
      if (failure.clearCode) {
        setDigits(Array(6).fill(''));
        inputs.current[0]?.focus();
      }
    } finally {
      setBusy(false);
    }
  }

  function setDigit(i: number, raw: string) {
    const only = raw.replace(/\D/g, '');
    if (only.length > 1) {
      // Paste or SMS/email autofill of the full code.
      const next = only.slice(0, 6).split('');
      const filled = Array.from({ length: 6 }, (_, k) => next[k] ?? '');
      setDigits(filled);
      if (next.length === 6) void verify(next.join(''));
      else inputs.current[Math.min(next.length, 5)]?.focus();
      return;
    }
    const next = [...digits];
    next[i] = only;
    setDigits(next);
    if (only && i < 5) inputs.current[i + 1]?.focus();
    if (next.every((d) => d !== '')) void verify(next.join(''));
  }

  return (
    <main className="auth-wrap">
      <div className="hb-auth">
        <div className="hb-auth-panel p-sky">
          <div className="auth-panel-inner">
            <LogoMark size={48} />
            <p className="t-body" style={{ margin: 0, maxWidth: 360 }}>
              Seu plano da semana, o treino de hoje e o registro de cada série. Sem excesso.
            </p>
          </div>
        </div>
        {linking ? (
          <div className="hb-auth-form" aria-busy="true">
            <h1 className="hb-auth-title">Entrando</h1>
            <p className="t-regular t-muted" style={{ margin: 0, textAlign: 'center' }}>
              Conferindo o link do seu e-mail.
            </p>
          </div>
        ) : step === 'email' ? (
          <form className="hb-auth-form" onSubmit={sendCode} noValidate>
            <h1 className="hb-auth-title">Entrar no Anilha</h1>
            <p className="t-regular t-muted" style={{ margin: 0, textAlign: 'center' }}>
              Mandamos um código de 6 dígitos para o seu e-mail. Sem senha.
            </p>
            {invite ? (
              <p className="t-caption" style={{ margin: 0, textAlign: 'center' }}>
                Seu convite está guardado. Depois de entrar, é só aceitar.
              </p>
            ) : null}
            {linkError ? <ErrorText>{linkError}</ErrorText> : null}
            <TextField
              label="E-mail"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="voce@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={error}
              required
            />
            <Button variant="primary" block type="submit" disabled={busy} icon={Mail}>
              {busy ? 'Enviando' : 'Enviar código'}
            </Button>
            <p className="hb-legal">
              Seus dados são seus: dá para exportar ou apagar tudo quando quiser. Veja a{' '}
              <a href="/privacidade/" target="_blank" rel="noopener">
                Política de privacidade
              </a>{' '}
              e os{' '}
              <a href="/termos/" target="_blank" rel="noopener">
                Termos de uso
              </a>
              .
            </p>
            {/* A plain link: the guide is a static page outside the app. */}
            <a className="hb-btn-link" href="/conheca/" style={{ alignSelf: 'center' }}>
              Como funciona, como instalar e dúvidas
            </a>
          </form>
        ) : (
          <form
            className="hb-auth-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (digits.every((d) => d)) void verify(digits.join(''));
            }}
          >
            <h1 className="hb-auth-title">Digite o código</h1>
            <p className="t-regular t-muted" style={{ margin: 0, textAlign: 'center' }}>
              Enviado para <strong className="t-strong">{email}</strong>. Se não chegar, olhe o
              spam.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div className="hb-otp" role="group" aria-label="Código de 6 dígitos">
                {digits.map((d, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      inputs.current[i] = el;
                    }}
                    value={d}
                    inputMode="numeric"
                    autoComplete={i === 0 ? 'one-time-code' : 'off'}
                    aria-label={`Dígito ${i + 1}`}
                    maxLength={i === 0 ? 6 : 1}
                    disabled={busy}
                    onChange={(e) => setDigit(i, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Backspace' && !digits[i] && i > 0)
                        inputs.current[i - 1]?.focus();
                    }}
                  />
                ))}
              </div>
            </div>
            {error ? <ErrorText>{error}</ErrorText> : null}
            {devCode ? (
              <p className="t-caption" data-testid="dev-code" style={{ textAlign: 'center' }}>
                Servidor local: código {devCode}
              </p>
            ) : null}
            <Button variant="primary" block type="submit" disabled={busy || digits.some((d) => !d)}>
              {busy ? 'Entrando' : 'Entrar'}
            </Button>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <button type="button" className="hb-btn-link" onClick={() => setStep('email')}>
                <Icon icon={ArrowLeft} size={18} />
                Trocar e-mail
              </button>
              <button
                type="button"
                className="hb-btn-link"
                onClick={() => void sendCode()}
                disabled={busy}
              >
                Reenviar código
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
