import { Dumbbell } from 'lucide-react';
import { Suspense, useEffect, type ReactNode } from 'react';
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  RouterProvider,
  useLocation,
  useNavigate,
  useRouteError,
} from 'react-router-dom';
import {
  useActiveSession,
  useCurrentPlan,
  useInitialPullDone,
  useProfile,
  useToday,
} from '../data/hooks';
import { backendConfigured } from '../lib/env';
import { hasAuthLink } from '../lib/authLink';
import { reportError } from '../lib/errors';
import { lazyScreen } from '../lib/lazyScreen';
import { isStandalone } from '../lib/push';
import { readPendingInvite } from '../lib/pendingInvite';
import { useConsent } from '../sync/consent';
import { syncNow, useSyncStatus } from '../sync/sync';
import { defaultProfile } from '../data/ops';
import { save } from '../data/store';
import { LogoMark } from '../ui/brand';
import { SideNav, TabBar } from '../ui/nav';
import { BackBar } from '../ui/back';
import { ToastProvider } from '../ui/overlays';
import { Button, LoadingCard, Widget } from '../ui/primitives';
import { AccountProvider, useAccountApi } from './account';
import Today from '../screens/Today';
import { AgentEntry } from '../screens/parts/AgentEntry';

const Auth = lazyScreen(
  () => import('../screens/Auth'),
  (m) => m.default,
);
const Onboarding = lazyScreen(
  () => import('../screens/Onboarding'),
  (m) => m.default,
);
const Session = lazyScreen(
  () => import('../screens/Session'),
  (m) => m.default,
);
const History = lazyScreen(
  () => import('../screens/History'),
  (m) => m.default,
);
const DuplicateRuns = lazyScreen(
  () => import('../screens/DuplicateRuns'),
  (m) => m.default,
);
const Calendar = lazyScreen(
  () => import('../screens/Calendar'),
  (m) => m.default,
);
const SessionDetail = lazyScreen(
  () => import('../screens/SessionDetail'),
  (m) => m.default,
);
const Plan = lazyScreen(
  () => import('../screens/Plan'),
  (m) => m.default,
);
const RoutineEdit = lazyScreen(
  () => import('../screens/RoutineEdit'),
  (m) => m.default,
);
const Library = lazyScreen(
  () => import('../screens/Library'),
  (m) => m.default,
);
const ExerciseDetail = lazyScreen(
  () => import('../screens/ExerciseDetail'),
  (m) => m.default,
);
const Friends = lazyScreen(
  () => import('../screens/Friends'),
  (m) => m.default,
);
const FriendDetail = lazyScreen(
  () => import('../screens/FriendDetail'),
  (m) => m.default,
);
const FichaThread = lazyScreen(
  () => import('../screens/FichaThread'),
  (m) => m.default,
);
const AgentChat = lazyScreen(
  () => import('../screens/AgentChat'),
  (m) => m.default,
);
const Group = lazyScreen(
  () => import('../screens/Group'),
  (m) => m.default,
);
const Invite = lazyScreen(
  () => import('../screens/Invite'),
  (m) => m.default,
);
const InviteLanding = lazyScreen(
  () => import('../screens/Invite'),
  (m) => m.InviteLanding,
);
const Profile = lazyScreen(
  () => import('../screens/Profile'),
  (m) => m.default,
);
const Connections = lazyScreen(
  () => import('../screens/Connections'),
  (m) => m.default,
);
const CrunningConnection = lazyScreen(
  () => import('../screens/CrunningConnection'),
  (m) => m.default,
);
const TrainingProfile = lazyScreen(
  () => import('../screens/TrainingProfile'),
  (m) => m.default,
);
const CompleteName = lazyScreen(
  () => import('../screens/CompleteName'),
  (m) => m.default,
);
const Privacy = lazyScreen(
  () => import('../screens/Privacy'),
  (m) => m.default,
);
const Credits = lazyScreen(
  () => import('../screens/Credits'),
  (m) => m.default,
);
const YourData = lazyScreen(
  () => import('../screens/YourData'),
  (m) => m.default,
);
const Inbox = lazyScreen(
  () => import('../screens/Inbox'),
  (m) => m.default,
);
const Settings = lazyScreen(
  () => import('../screens/Settings'),
  (m) => m.default,
);
const Consent = lazyScreen(
  () => import('../screens/Consent'),
  (m) => m.default,
);
const Messages = lazyScreen(
  () => import('../screens/Messages'),
  (m) => m.default,
);
const Admin = lazyScreen(
  () => import('../screens/Admin'),
  (m) => m.default,
);
const Welcome = lazyScreen(
  () => import('../screens/Welcome'),
  (m) => m.default,
);
const ReadyRoutines = lazyScreen(
  () => import('../screens/ReadyRoutines'),
  (m) => m.default,
);

function Splash() {
  return (
    <div
      style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}
      aria-busy="true"
      aria-label="Abrindo"
    >
      <LogoMark size={48} />
    </div>
  );
}

function PageFallback() {
  return (
    <div className="stack">
      <LoadingCard lines={3} />
      <LoadingCard lines={2} />
    </div>
  );
}

/** The browser without an account: the address of the app opens the landing. */
function ToLanding() {
  useEffect(() => {
    window.location.replace('/conheca/');
  }, []);
  return <Splash />;
}

/**
 * Sends visitors to the way in, and new accounts to the short onboarding. The root without
 * an account opens the landing in the browser, and a welcome screen in the installed app
 * or offline; any other screen (a notification, a saved link) goes straight to login.
 */
function RequireAccount({ children }: { children: ReactNode }) {
  const { account, ready } = useAccountApi();
  const location = useLocation();
  if (!ready) return <Splash />;
  if (!account) {
    const invite = /^\/convite\/([^/]+)/.exec(location.pathname)?.[1];
    if (invite) {
      return (
        <Suspense fallback={<Splash />}>
          <InviteLanding code={invite} />
        </Suspense>
      );
    }
    if (location.pathname === '/' && !hasAuthLink()) {
      if (!isStandalone() && navigator.onLine) return <ToLanding />;
      return (
        <Suspense fallback={<Splash />}>
          <Welcome />
        </Suspense>
      );
    }
    sessionStorage.setItem('anilha:after-login', location.pathname + location.search);
    return <Navigate to="/entrar" replace />;
  }
  return <ConsentGate>{children}</ConsentGate>;
}

/** Terms and privacy accepted for this version (and health asked) before anything else. */
function ConsentGate({ children }: { children: ReactNode }) {
  const consent = useConsent();
  if (consent.status === 'loading') return <Splash />;
  if (consent.status === 'ask')
    return (
      <Suspense fallback={<Splash />}>
        <Consent />
      </Suspense>
    );
  return <>{children}</>;
}

function EnsureProfile() {
  const profile = useProfile();
  const pulled = useInitialPullDone();
  const { account } = useAccountApi();
  useEffect(() => {
    // Only after the first pull: on a new phone, the profile already exists in the cloud
    // and a blank local one would overwrite it.
    const noBackend = !backendConfigured();
    if (profile === null && account && (pulled || noBackend))
      void save('profiles', defaultProfile(account.userId));
  }, [profile, account, pulled]);
  return null;
}

function WaitFirstSync() {
  const sync = useSyncStatus();
  return (
    <div className="stack">
      <p className="t-regular t-muted" style={{ margin: 0 }} role="status">
        {sync.state === 'offline'
          ? 'Sem conexão. Conecte uma vez para baixar seus dados.'
          : 'Baixando seus dados.'}
      </p>
      <LoadingCard lines={3} />
      {sync.state === 'offline' || sync.state === 'error' ? (
        <Button variant="tint" onClick={() => void syncNow()}>
          Tentar de novo
        </Button>
      ) : null}
    </div>
  );
}

function NeedsOnboarding({ children }: { children: ReactNode }) {
  const today = useToday();
  const profile = useProfile();
  const pulled = useInitialPullDone();
  const { plan, loaded } = useCurrentPlan(today);
  const location = useLocation();
  if (profile === undefined || !loaded || pulled === undefined) return <PageFallback />;
  if (!pulled && !profile && backendConfigured()) return <WaitFirstSync />;
  const onboarded = !!profile?.onboarding || !!plan;
  if (!onboarded && !location.pathname.startsWith('/convite'))
    return <Navigate to="/comecar" replace />;
  // Accounts from before the last name was asked: once, before the app.
  if (profile?.onboarding && !profile.onboarding.last_name?.trim())
    return (
      <Suspense fallback={<PageFallback />}>
        <CompleteName />
      </Suspense>
    );
  return <>{children}</>;
}

function ActiveSessionBar() {
  const active = useActiveSession();
  const navigate = useNavigate();
  const location = useLocation();
  if (!active || location.pathname === '/' || location.pathname.startsWith('/treino')) return null;
  return (
    <div className="active-bar">
      <Widget
        icon={Dumbbell}
        pastel="sky"
        title="Treino em andamento"
        sub={active.title}
        action={
          <Button variant="tint" onClick={() => navigate(`/treino/${active.id}`)}>
            Continuar
          </Button>
        }
      />
    </div>
  );
}

function Shell() {
  return (
    <RequireAccount>
      <EnsureProfile />
      <div className="app-shell">
        <SideNav />
        <main className="app-main" id="conteudo">
          <BackBar />
          <NeedsOnboarding>
            <Suspense fallback={<PageFallback />}>
              <Outlet />
            </Suspense>
            <AgentEntry />
          </NeedsOnboarding>
        </main>
        <ActiveSessionBar />
        <TabBar />
      </div>
    </RequireAccount>
  );
}

function Bare({ guard }: { guard?: boolean }) {
  const body = (
    <Suspense fallback={<Splash />}>
      <Outlet />
    </Suspense>
  );
  return guard ? (
    <RequireAccount>
      <EnsureProfile />
      {body}
    </RequireAccount>
  ) : (
    body
  );
}

function LoginRoute() {
  const { account, ready } = useAccountApi();
  if (!ready) return <Splash />;
  if (account) {
    const invite = readPendingInvite();
    if (invite) return <Navigate to={`/convite/${invite}`} replace />;
    const pending = sessionStorage.getItem('anilha:after-login');
    const target = pending && !pending.startsWith('/entrar') ? pending : '/';
    return <Navigate to={target} replace />;
  }
  return <Auth />;
}

/** A screen broke: say so, report it, offer a reload. Data on the phone is safe. */
function RouteError() {
  const error = useRouteError();
  useEffect(() => reportError(error), [error]);
  return (
    <main className="app-main" style={{ maxWidth: 480 }}>
      <Widget title="Algo deu errado nesta tela">
        <div className="stack">
          <p className="t-regular" style={{ margin: 0 }}>
            O erro foi registrado para correção. Seus treinos continuam salvos no aparelho.
          </p>
          <Button variant="primary" block onClick={() => window.location.reload()}>
            Recarregar
          </Button>
        </div>
      </Widget>
    </main>
  );
}

function NotFound() {
  return <Navigate to="/" replace />;
}

const router = createBrowserRouter([
  {
    element: <Bare />,
    errorElement: <RouteError />,
    children: [{ path: '/entrar', element: <LoginRoute /> }],
  },
  {
    element: <Bare guard />,
    errorElement: <RouteError />,
    children: [
      { path: '/comecar', element: <Onboarding /> },
      { path: '/treino/:id', element: <Session /> },
    ],
  },
  {
    element: <Shell />,
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <Today /> },
      { path: '/plano', element: <Plan /> },
      { path: '/plano/rotina/:id', element: <RoutineEdit /> },
      { path: '/plano/fichas-prontas', element: <ReadyRoutines /> },
      { path: '/plano/pedir', element: <AgentChat /> },
      { path: '/historico', element: <History /> },
      { path: '/historico/calendario', element: <Calendar /> },
      { path: '/historico/repetidas', element: <DuplicateRuns /> },
      { path: '/historico/treino/:id', element: <SessionDetail /> },
      { path: '/exercicios', element: <Library /> },
      { path: '/exercicios/:id', element: <ExerciseDetail /> },
      { path: '/amigos', element: <Friends /> },
      { path: '/amigos/:id', element: <FriendDetail /> },
      { path: '/amigos/:id/fichas', element: <FichaThread /> },
      { path: '/amigos/grupo/:id', element: <Group /> },
      { path: '/convite/:code', element: <Invite /> },
      { path: '/voce', element: <Profile /> },
      { path: '/voce/conexoes', element: <Connections /> },
      { path: '/voce/conexoes/crunning', element: <CrunningConnection /> },
      { path: '/voce/treino', element: <TrainingProfile /> },
      { path: '/voce/dados', element: <YourData /> },
      { path: '/voce/privacidade', element: <Privacy /> },
      { path: '/voce/creditos', element: <Credits /> },
      { path: '/avisos', element: <Inbox /> },
      { path: '/ajustes', element: <Settings /> },
      { path: '/mensagens', element: <Messages /> },
      { path: '/admin', element: <Admin /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

export default function App() {
  return (
    <AccountProvider>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </AccountProvider>
  );
}
