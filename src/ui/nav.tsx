import {
  Bell,
  CalendarDays,
  ChevronsUpDown,
  CircleUser,
  Globe,
  History,
  House,
  LayoutDashboard,
  LogOut,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAccount, useAccountApi } from '../app/account';
import { useProfile } from '../data/hooks';
import { lazyScreen } from '../lib/lazyScreen';
import { useIsAdmin } from '../sync/admin';
import { useConsent } from '../sync/consent';
import { useSyncStatus } from '../sync/sync';
import { useInbox } from '../sync/inbox';
import { Wordmark } from './brand';
import { Icon } from './primitives';

/**
 * Today in the middle, where the thumb reaches best: the past and the plan to its left,
 * friends and the person to its right.
 */
export const TABS: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/historico', label: 'Histórico', icon: History },
  { to: '/plano', label: 'Plano', icon: CalendarDays },
  { to: '/', label: 'Hoje', icon: House, end: true },
  { to: '/amigos', label: 'Amigos', icon: Users },
  { to: '/voce', label: 'Você', icon: CircleUser },
];

/** Something waits for the person in Você (the health data choice): a red dot on the tab. */
function PendingDot({ to }: { to: string }) {
  const { healthPending } = useConsent();
  if (to !== '/voce' || !healthPending) return null;
  return (
    <>
      <span className="pending-dot" aria-hidden="true" />
      <span className="hb-sr">(1 pendência)</span>
    </>
  );
}

/** The tab a screen belongs to: screens inside a tab keep it lit; -1 for none. */
export function tabIndexOf(path: string): number {
  if (path === '/') return 2;
  if (/^\/(plano|exercicios)(\/|$)/.test(path)) return 1;
  if (/^\/historico(\/|$)/.test(path)) return 0;
  if (/^\/amigos(\/|$)/.test(path)) return 3;
  if (/^\/(voce|ajustes|mensagens|admin)(\/|$)/.test(path)) return 4;
  return -1;
}

/**
 * Phone: a floating glass bar. The pill of the current tab slides to the next one and, on
 * the way, grows into a lens that settles on the new tab (as in iOS 26).
 */
/** Inner padding of the bar, where the pill rides. */
const BAR_PAD = 4;
/** Sideways movement before a press on the bar becomes a drag of the pill. */
const DRAG_START = 8;

export function TabBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const index = tabIndexOf(location.pathname);
  const [moving, setMoving] = useState(false);
  const last = useRef(index);
  const bar = useRef<HTMLElement>(null);
  // Dragging the pill: where it is (px from the first slot) and the tab under the finger.
  const [dragX, setDragX] = useState<number | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const press = useRef<{ x: number; dragging: boolean; rect: DOMRect; target: number } | null>(
    null,
  );
  const swallowClick = useRef(false);

  useEffect(() => {
    if (last.current === index) return;
    const from = last.current;
    last.current = index;
    if (from < 0 || index < 0) return;
    setMoving(true);
    const t = window.setTimeout(() => setMoving(false), 260);
    return () => window.clearTimeout(t);
  }, [index]);

  function down(e: ReactPointerEvent<HTMLElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!bar.current) return;
    press.current = {
      x: e.clientX,
      dragging: false,
      rect: bar.current.getBoundingClientRect(),
      target: index,
    };
  }

  function move(e: ReactPointerEvent<HTMLElement>) {
    const p = press.current;
    if (!p) return;
    if (!p.dragging) {
      if (Math.abs(e.clientX - p.x) < DRAG_START) return;
      p.dragging = true;
      bar.current?.setPointerCapture?.(e.pointerId);
    }
    const slot = (p.rect.width - BAR_PAD * 2) / TABS.length;
    const x = Math.max(
      0,
      Math.min(slot * (TABS.length - 1), e.clientX - p.rect.left - BAR_PAD - slot / 2),
    );
    setDragX(x);
    const under = Math.round(x / slot);
    if (under !== p.target) {
      p.target = under;
      setTarget(under);
      navigator.vibrate?.(5);
    }
  }

  function up() {
    const p = press.current;
    press.current = null;
    if (!p?.dragging) return;
    // A mouse drag ends in a click right away, on the tab under the start: it is
    // swallowed. A finger drag fires none, so the next tap must not be eaten.
    swallowClick.current = true;
    window.setTimeout(() => (swallowClick.current = false), 0);
    setDragX(null);
    setTarget(null);
    const tab = TABS[p.target];
    if (tab && p.target !== index) navigate(tab.to);
  }

  return (
    <nav
      ref={bar}
      className="hb-tabbar"
      aria-label="Navegação principal"
      style={{ '--tab-index': Math.max(0, index) } as CSSProperties}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onClickCapture={(e) => {
        if (!swallowClick.current) return;
        swallowClick.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <span
        className={`tab-pill${moving ? ' is-moving' : ''}${dragX != null ? ' is-dragging' : ''}${
          index < 0 && dragX == null ? ' is-hidden' : ''
        }`}
        style={
          dragX != null ? { transform: `translateX(${dragX}px) scale(1.14, 1.32)` } : undefined
        }
        aria-hidden="true"
      />
      {TABS.map((t, i) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          draggable={false}
          className={({ isActive }) =>
            `hb-tab ${(target == null ? isActive : target === i) ? 'is-active' : ''}`
          }
        >
          <Icon icon={t.icon} size={26} stroke={2} />
          <span>{t.label}</span>
          <PendingDot to={t.to} />
        </NavLink>
      ))}
    </nav>
  );
}

/** Sections of the computer menu, in the order of a day: today first. */
const SECTIONS: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: 'Hoje', icon: House, end: true },
  { to: '/plano', label: 'Plano', icon: CalendarDays },
  { to: '/historico', label: 'Histórico', icon: History },
  { to: '/amigos', label: 'Amigos', icon: Users },
];

/**
 * Computer: a menu at the side, with room for what comes (the personal trainer's area, the
 * panel of who runs the app). The brand and the bell on top, the person at the bottom.
 */
export function SideNav() {
  const admin = useIsAdmin();
  return (
    <aside className="app-sidenav" aria-label="Menu">
      <div className="sidenav-top">
        <NavLink to="/" aria-label="Anilha, início" className="sidenav-brand">
          <Wordmark />
        </NavLink>
        <InboxBell panel />
      </div>
      <nav className="sidenav-list" aria-label="Navegação principal">
        {SECTIONS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) => `sidenav-item${isActive ? ' is-active' : ''}`}
          >
            <Icon icon={t.icon} />
            {t.label}
          </NavLink>
        ))}
        {admin ? (
          <>
            <span className="sidenav-group">Gestão</span>
            <NavLink
              to="/admin"
              className={({ isActive }) => `sidenav-item${isActive ? ' is-active' : ''}`}
            >
              <Icon icon={LayoutDashboard} />
              Painel
            </NavLink>
          </>
        ) : null}
      </nav>
      <div className="sidenav-bottom">
        <SyncBadge />
        <ProfileMenu />
      </div>
    </aside>
  );
}

/** Leaves the account on this device: the data stays here and comes back on the next login. */
export function useSignOut() {
  const { signOut } = useAccountApi();
  const navigate = useNavigate();
  return useCallback(async () => {
    await signOut();
    navigate('/entrar', { replace: true });
  }, [signOut, navigate]);
}

/** The person at the bottom of the computer menu: profile, settings, the site and sign out. */
function ProfileMenu() {
  const profile = useProfile();
  const { email } = useAccount();
  const { healthPending } = useConsent();
  const signOut = useSignOut();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const name = profile?.display_name?.trim() || profile?.onboarding?.first_name || 'Você';

  useEffect(() => setOpen(false), [location.key]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div className="profile-menu" ref={ref}>
      {open ? (
        <div className="profile-menu-list" role="menu" aria-label="Sua conta">
          <NavLink to="/voce" role="menuitem" className="profile-menu-item">
            <Icon icon={CircleUser} />
            Ver perfil
            <PendingDot to="/voce" />
          </NavLink>
          <NavLink to="/ajustes" role="menuitem" className="profile-menu-item">
            <Icon icon={Settings} />
            Ajustes
          </NavLink>
          <a href="/conheca/" role="menuitem" className="profile-menu-item">
            <Icon icon={Globe} />
            Página do Anilha
          </a>
          <button
            type="button"
            role="menuitem"
            className="profile-menu-item"
            onClick={() => void signOut()}
          >
            <Icon icon={LogOut} />
            Sair
          </button>
        </div>
      ) : null}
      <button
        type="button"
        className="profile-menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Sua conta: ${name}${healthPending ? ', 1 pendência' : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="profile-avatar" aria-hidden="true">
          {name.charAt(0).toUpperCase()}
          {healthPending ? <span className="pending-dot" /> : null}
        </span>
        <span className="profile-menu-text">
          <span className="profile-menu-name">{name}</span>
          <span className="profile-menu-email">{email}</span>
        </span>
        <Icon icon={ChevronsUpDown} size={16} />
      </button>
    </div>
  );
}

export function SyncBadge() {
  const s = useSyncStatus();
  const map = {
    idle: { text: s.pending ? 'Salvo no aparelho' : 'Sincronizado', color: 'var(--accent-teal)' },
    syncing: { text: 'Sincronizando', color: 'var(--brand-500)' },
    offline: { text: 'Sem sinal, salvo no aparelho', color: 'var(--ink-subtle)' },
    error: { text: 'Sincroniza depois', color: 'var(--accent-orange)' },
    signed_out: { text: 'Entre de novo para sincronizar', color: 'var(--accent-orange)' },
  } as const;
  const m = map[s.state];
  return (
    <span
      className="hb-status"
      role="status"
      aria-live="polite"
      data-testid="sync-status"
      data-state={s.state}
    >
      <i style={{ background: m.color }} aria-hidden="true" />
      {m.text}
    </span>
  );
}

const InboxPanel = lazyScreen(
  () => import('../screens/parts/InboxList'),
  (m) => m.InboxPanel,
);

/**
 * Bell to the inbox, with the count of what is new. On the phone it opens the page of
 * notices; on the computer (`panel`), a panel under it, without leaving the screen.
 */
export function InboxBell({ panel = false }: { panel?: boolean }) {
  const { unread } = useInbox();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const label = unread ? `Avisos, ${unread} ${unread === 1 ? 'novo' : 'novos'}` : 'Avisos';
  const content = (
    <>
      <Icon icon={Bell} />
      {unread ? (
        <span className="inbox-badge" aria-hidden="true">
          {unread > 9 ? '9+' : unread}
        </span>
      ) : null}
    </>
  );
  if (!panel)
    return (
      <NavLink
        to="/avisos"
        className="hb-iconbtn inbox-bell"
        aria-label={label}
        data-testid="inbox-bell"
      >
        {content}
      </NavLink>
    );
  return (
    <span className="inbox-bell-wrap">
      <button
        type="button"
        className="hb-iconbtn inbox-bell"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="inbox-bell"
        onClick={() => setOpen((o) => !o)}
      >
        {content}
      </button>
      {open ? (
        <Suspense fallback={null}>
          <InboxPanel onClose={close} />
        </Suspense>
      ) : null}
    </span>
  );
}
