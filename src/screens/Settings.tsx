import { Bell, Dumbbell, Palette } from 'lucide-react';
import { useState } from 'react';
import { useProfile } from '../data/hooks';
import { DEFAULT_REMINDERS, updateProfile } from '../data/ops';
import type { ProfileRow, Unit } from '../engine/types';
import { setPrefs, usePrefs, type RestAlertPref, type ThemePref } from '../lib/prefs';
import { enablePush, isIos, isStandalone, unsubscribePush } from '../lib/push';
import { rpc } from '../sync/client';
import { useToast } from '../ui/overlays';
import { LoadingCard, Segmented, Switch, TextField, Widget } from '../ui/primitives';

/**
 * Ajustes: how the app looks and behaves. Theme, rest alert and screen are of this
 * device; unit, default rest and notifications go with the account.
 */
export default function Settings() {
  const profile = useProfile();
  if (!profile) return <LoadingCard lines={6} />;
  return <SettingsForm profile={profile} />;
}

function SettingsForm({ profile }: { profile: ProfileRow }) {
  const prefs = usePrefs();
  const toast = useToast();
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  const reminders = profile.reminders ?? DEFAULT_REMINDERS;
  const pushGranted = typeof Notification !== 'undefined' && Notification.permission === 'granted';
  const ios = isIos();

  /** Permission and subscription for this phone. True when notifications can arrive. */
  async function ensurePush(): Promise<boolean> {
    const r = await enablePush();
    setPushMsg(r.message);
    return r.ok;
  }

  async function setPref(key: 'enabled' | 'rest' | 'social' | 'weekly', on: boolean) {
    setPushMsg(null);
    if (on && !(await ensurePush())) return;
    const next = { ...reminders, [key]: on, offered: true };
    await updateProfile({ reminders: next });
    // Everything off: this phone stops receiving.
    if (
      !on &&
      !next.enabled &&
      next.rest === false &&
      next.social === false &&
      !(next.weekly ?? next.enabled)
    ) {
      const endpoint = await unsubscribePush();
      if (endpoint)
        await rpc('delete_push_subscription', { p_endpoint: endpoint }).catch(() => undefined);
    }
    if (on) toast.show('Notificação ligada');
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Ajustes</h1>
          <p className="page-sub">Aparência, treino e notificações.</p>
        </div>
      </header>

      <div className="grid-2">
        <div className="stack">
          <Widget icon={Palette} pastel="neutral" title="Aparência">
            <div className="stack-sm">
              <span className="hb-label">Tema</span>
              <Segmented<ThemePref>
                label="Tema"
                value={prefs.theme}
                options={[
                  { value: 'auto', label: 'Automático' },
                  { value: 'light', label: 'Claro' },
                  { value: 'dark', label: 'Escuro' },
                ]}
                onChange={(theme) => setPrefs({ theme })}
              />
              <span className="t-caption">Automático segue o celular. Vale neste aparelho.</span>
            </div>
          </Widget>

          <Widget icon={Dumbbell} pastel="neutral" title="Treino">
            <div className="stack">
              <div className="stack-sm">
                <span className="hb-label">Aviso do fim do descanso</span>
                <Segmented<RestAlertPref>
                  label="Aviso do fim do descanso"
                  value={prefs.restAlert}
                  options={[
                    { value: 'sound', label: 'Som e vibração' },
                    { value: 'vibrate', label: 'Só vibrar' },
                    { value: 'silent', label: 'Só na tela' },
                  ]}
                  onChange={(restAlert) => setPrefs({ restAlert })}
                />
                <span className="t-caption">
                  {ios
                    ? 'No iPhone o app aberto não consegue vibrar: "Só vibrar" fica sem som. Com o celular bloqueado, a notificação segue o modo silencioso do iPhone.'
                    : 'Com o app aberto. Com o celular bloqueado, quem avisa é a notificação.'}
                </span>
              </div>
              <Switch
                label="Tela acesa durante o treino"
                hint="Não apaga entre as séries. Gasta um pouco mais de bateria."
                checked={prefs.keepAwake}
                onChange={(keepAwake) => setPrefs({ keepAwake })}
              />
              <div className="stack-sm">
                <span className="hb-label">Unidade de carga</span>
                <Segmented<Unit>
                  label="Unidade de carga"
                  value={profile.unit}
                  options={[
                    { value: 'kg', label: 'kg' },
                    { value: 'lb', label: 'lb' },
                  ]}
                  onChange={(unit) => void updateProfile({ unit })}
                />
              </div>
              <div className="stack-sm">
                <span className="hb-label">Descanso padrão</span>
                <Segmented
                  label="Descanso padrão em segundos"
                  value={profile.rest_sec}
                  options={[60, 75, 90, 120].map((s) => ({ value: s, label: `${s} s` }))}
                  onChange={(rest_sec) => void updateProfile({ rest_sec })}
                />
                <span className="t-caption">
                  Vale quando o treino não define o descanso do exercício.
                </span>
              </div>
            </div>
          </Widget>
        </div>

        <div className="stack">
          <Widget
            icon={Bell}
            pastel="neutral"
            title="Notificações"
            sub="Só o que você ligar. Lembrete de treino no máximo um por dia."
          >
            <div className="stack">
              <Switch
                label="Fim do descanso"
                hint="Com o celular bloqueado, avisa a próxima série."
                checked={pushGranted && reminders.rest !== false}
                onChange={(v) => void setPref('rest', v)}
              />
              <Switch
                label="Amigos e grupos"
                hint="Convites, reações e quem entrou no seu grupo."
                checked={pushGranted && reminders.social !== false}
                onChange={(v) => void setPref('social', v)}
              />
              <Switch
                label="Lembrete do treino"
                checked={reminders.enabled}
                onChange={(v) => void setPref('enabled', v)}
              />
              <Switch
                label="Resumo da semana"
                hint="Domingo às 20:00: o que você fez contra o plano."
                checked={pushGranted && (reminders.weekly ?? reminders.enabled)}
                onChange={(v) => void setPref('weekly', v)}
              />
              {ios && !isStandalone() ? (
                <p className="t-caption" style={{ margin: 0 }}>
                  No iPhone, notificação só chega com o app na tela de início (iOS 16.4 ou mais
                  novo).
                </p>
              ) : null}
              {pushMsg ? (
                <p className="t-regular" style={{ margin: 0 }} role="status">
                  {pushMsg}
                </p>
              ) : null}
              {reminders.enabled ? (
                <div className="field-grid">
                  <TextField
                    label="No dia do treino"
                    type="time"
                    value={reminders.gym_time}
                    onChange={(e) =>
                      void updateProfile({
                        reminders: { ...reminders, gym_time: e.target.value || '05:30' },
                      })
                    }
                  />
                  <TextField
                    label="Véspera de corrida"
                    type="time"
                    value={reminders.run_eve_time}
                    onChange={(e) =>
                      void updateProfile({
                        reminders: { ...reminders, run_eve_time: e.target.value || '21:00' },
                      })
                    }
                  />
                </div>
              ) : null}
            </div>
          </Widget>
        </div>
      </div>
    </>
  );
}
