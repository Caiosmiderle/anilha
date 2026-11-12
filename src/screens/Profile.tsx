import {
  ChevronRight,
  Dumbbell,
  Globe,
  Info,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Settings,
  Database,
  Lock,
  Smartphone,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from '../app/account';
import { useProfile } from '../data/hooks';
import { updateProfile } from '../data/ops';
import { fullName, splitName } from '../engine/format';
import type { ProfileRow } from '../engine/types';
import { installPrompt } from '../lib/install';
import { isIos, isStandalone } from '../lib/push';
import { useIsAdmin } from '../sync/admin';
import { useSignOut } from '../ui/nav';
import { Button, Disc, Icon, LoadingCard, TextField, Widget } from '../ui/primitives';
import { Sheet } from '../ui/overlays';
import { HealthPendingCard } from './parts/HealthConsent';

/**
 * Você: who is signed in and the way out on top, the name, then everything else in a few
 * groups of rows (one card each): the training, the account, help. Each row opens a page.
 */
export default function Profile() {
  const profile = useProfile();
  const { email } = useAccount();
  if (!profile) return <LoadingCard lines={6} />;
  return <ProfileForm profile={profile} email={email} />;
}

function MenuGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="hb-widget menu-group" aria-label={title}>
      <h2 className="menu-group-title">{title}</h2>
      <div className="hb-list">{children}</div>
    </section>
  );
}

function MenuRow({
  to,
  href,
  icon,
  pastel,
  title,
  sub,
}: {
  to?: string;
  href?: string;
  icon: LucideIcon;
  pastel: Parameters<typeof Disc>[0]['pastel'];
  title: string;
  sub: string;
}) {
  const body = (
    <>
      <Disc small icon={icon} pastel={pastel} />
      <span className="hb-list-main">
        <span className="hb-list-title" style={{ display: 'block' }}>
          {title}
        </span>
        <span className="hb-list-sub">{sub}</span>
      </span>
      <Icon icon={ChevronRight} className="t-muted" />
    </>
  );
  // The landing is a page apart from the app: a full page load, not a route.
  return href ? (
    <a href={href} className="hb-list-row">
      {body}
    </a>
  ) : (
    <Link to={to as string} className="hb-list-row">
      {body}
    </Link>
  );
}

function ProfileForm({ profile, email }: { profile: ProfileRow; email: string }) {
  const signOut = useSignOut();
  // Name and last name, both required; friends, groups and invites show the full name.
  const typed = splitName(profile.display_name);
  const [first, setFirst] = useState(profile.onboarding?.first_name || typed.first_name);
  const [last, setLast] = useState(profile.onboarding?.last_name ?? typed.last_name);
  const [nameError, setNameError] = useState<'nome' | 'sobrenome' | null>(null);
  const admin = useIsAdmin();
  const [editingName, setEditingName] = useState(false);
  /** Saves when both are filled; says which one is missing otherwise. */
  function saveName(): boolean {
    if (!first.trim()) {
      setNameError('nome');
      return false;
    }
    if (!last.trim()) {
      setNameError('sobrenome');
      return false;
    }
    setNameError(null);
    const names = { first_name: first.trim(), last_name: last.trim() };
    const display = fullName(names);
    if (display === profile.display_name && profile.onboarding?.last_name === names.last_name)
      return true;
    void updateProfile({
      display_name: display,
      ...(profile.onboarding ? { onboarding: { ...profile.onboarding, ...names } } : {}),
    });
    return true;
  }

  return (
    <>
      {/* Who is signed in, at a glance, and the way out without scrolling. */}
      <header className="page-head profile-head">
        <span className="profile-avatar is-large" aria-hidden="true">
          {(profile.display_name.trim() || profile.onboarding?.first_name || 'V')
            .charAt(0)
            .toUpperCase()}
        </span>
        <div className="profile-head-text">
          <h1 className="page-title">
            {profile.display_name.trim() || profile.onboarding?.first_name || 'Você'}
          </h1>
          <p className="page-sub">{email}</p>
        </div>
        <Button variant="outline" icon={LogOut} onClick={() => void signOut()}>
          Sair
        </Button>
      </header>
      <HealthPendingCard />

      <div className="grid-2">
        <div className="stack">
          <MenuGroup title="Seu treino">
            <MenuRow
              to="/voce/treino"
              icon={Dumbbell}
              pastel="butter"
              title="Perfil de treino"
              sub="Objetivo, foco, nível, dias e modo retorno"
            />
          </MenuGroup>

          <MenuGroup title="Conta">
            <MenuRow
              to="/voce/conexoes"
              icon={Globe}
              pastel="mint"
              title="Conexões"
              sub="CRUNNING"
            />
            <button type="button" className="hb-list-row" onClick={() => setEditingName(true)}>
              <Disc small icon={UserRound} pastel="sky" />
              <span className="hb-list-main">
                <span className="hb-list-title" style={{ display: 'block' }}>
                  Nome
                </span>
                <span className="hb-list-sub">{profile.display_name}</span>
              </span>
              <Icon icon={ChevronRight} className="t-muted" />
            </button>
            <MenuRow
              to="/voce/privacidade"
              icon={Lock}
              pastel="mint"
              title="Privacidade"
              sub="Dados de saúde, o que amigos veem e bloqueados"
            />
            <MenuRow
              to="/voce/dados"
              icon={Database}
              pastel="butter"
              title="Seus dados"
              sub="O que guardamos, exportar, importar e apagar a conta"
            />
            <MenuRow
              to="/ajustes"
              icon={Settings}
              pastel="neutral"
              title="Ajustes"
              sub="Tema, aviso do descanso, notificações e unidade"
            />
          </MenuGroup>
        </div>

        <div className="stack">
          <MenuGroup title="Ajuda">
            <MenuRow
              to="/mensagens"
              icon={MessageSquare}
              pastel="sky"
              title="Fale com o Anilha"
              sub="Sugestões, problemas e pedidos sobre seus dados"
            />
            <MenuRow
              href="/conheca/"
              icon={Globe}
              pastel="mint"
              title="Página do Anilha"
              sub="O que é o app, como instalar e perguntas frequentes"
            />
            <MenuRow
              to="/voce/creditos"
              icon={Info}
              pastel="neutral"
              title="Créditos e licenças"
              sub="De onde vêm as imagens, os vídeos e o software"
            />
          </MenuGroup>

          {admin ? (
            <MenuGroup title="Gestão">
              <MenuRow
                to="/admin"
                icon={LayoutDashboard}
                pastel="butter"
                title="Painel de gestão"
                sub="Pessoas, mensagens, números e erros do app"
              />
            </MenuGroup>
          ) : null}

          {!isStandalone() ? <InstallCard /> : null}
        </div>
      </div>

      <Sheet
        open={editingName}
        onClose={() => setEditingName(false)}
        title="Nome e sobrenome"
        actions={
          <Button
            variant="primary"
            block
            onClick={() => {
              if (saveName()) setEditingName(false);
            }}
          >
            Salvar
          </Button>
        }
      >
        <div className="stack">
          <TextField
            label="Nome"
            value={first}
            maxLength={40}
            autoComplete="given-name"
            onChange={(e) => {
              setNameError(null);
              setFirst(e.target.value);
            }}
            error={nameError === 'nome' ? 'Diga seu nome' : null}
          />
          <TextField
            label="Sobrenome"
            value={last}
            maxLength={60}
            autoComplete="family-name"
            onChange={(e) => {
              setNameError(null);
              setLast(e.target.value);
            }}
            error={nameError === 'sobrenome' ? 'Diga seu sobrenome' : null}
          />
          <span className="t-caption">
            O app chama você pelo primeiro nome. Amigos, grupos e convites mostram o nome completo.
          </span>
        </div>
      </Sheet>
    </>
  );
}

function InstallCard() {
  const [prompted, setPrompted] = useState(false);
  const prompt = installPrompt();
  return (
    <Widget icon={Smartphone} pastel="neutral" title="Instalar na tela de início">
      <div className="stack-sm">
        {prompt && !prompted ? (
          <Button
            variant="tint"
            onClick={async () => {
              await prompt.prompt();
              setPrompted(true);
            }}
          >
            Instalar app
          </Button>
        ) : (
          <p className="t-regular" style={{ margin: 0 }}>
            {isIos()
              ? 'No Safari: toque em Compartilhar e depois em Adicionar à Tela de Início.'
              : 'No menu do navegador, escolha Instalar app ou Adicionar à tela inicial.'}
          </p>
        )}
        <span className="t-caption">
          Instalado, abre em tela cheia e funciona sem sinal na academia.
        </span>
        <a className="hb-btn-link" href="/conheca/#manual">
          Manual e dúvidas
        </a>
      </div>
    </Widget>
  );
}
