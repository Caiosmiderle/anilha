import { useState } from 'react';
import { useProfile } from '../data/hooks';
import { updateProfile } from '../data/ops';
import { fullName, splitName } from '../engine/format';
import type { ProfileRow } from '../engine/types';
import { Button, LoadingCard, TextField } from '../ui/primitives';

/**
 * Accounts made before the last name was asked: one screen, once, before the app. The app
 * keeps calling the person by the first name; the full name goes to accepted friends.
 */
export default function CompleteName() {
  const profile = useProfile();
  if (!profile?.onboarding) return <LoadingCard />;
  return <NameForm profile={profile} />;
}

function NameForm({ profile }: { profile: ProfileRow }) {
  const onboarding = profile.onboarding as NonNullable<ProfileRow['onboarding']>;
  const [first, setFirst] = useState(
    onboarding.first_name.trim() || splitName(profile.display_name).first_name,
  );
  const [last, setLast] = useState(onboarding.last_name ?? '');
  const [error, setError] = useState<'nome' | 'sobrenome' | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!first.trim()) return setError('nome');
    if (!last.trim()) return setError('sobrenome');
    setSaving(true);
    try {
      const names = { first_name: first.trim(), last_name: last.trim() };
      await updateProfile({
        display_name: fullName(names),
        onboarding: { ...onboarding, ...names },
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="stack" style={{ maxWidth: 640 }}>
      <h1 className="page-title">Como você se chama?</h1>
      <p className="t-regular t-muted" style={{ margin: 0 }}>
        Agora o Anilha pede nome e sobrenome, para saber como chamar você. No app continua o
        primeiro nome; o nome completo aparece para amigos, grupos e quem recebe um convite seu.
      </p>
      <TextField
        label="Nome"
        autoComplete="given-name"
        value={first}
        maxLength={40}
        onChange={(e) => {
          setError(null);
          setFirst(e.target.value);
        }}
        error={error === 'nome' ? 'Diga seu nome' : null}
      />
      <TextField
        label="Sobrenome"
        autoComplete="family-name"
        value={last}
        maxLength={60}
        onChange={(e) => {
          setError(null);
          setLast(e.target.value);
        }}
        error={error === 'sobrenome' ? 'Diga seu sobrenome' : null}
      />
      <div className="actions">
        <Button variant="primary" block disabled={saving} onClick={() => void save()}>
          {saving ? 'Salvando' : 'Continuar'}
        </Button>
      </div>
    </section>
  );
}
