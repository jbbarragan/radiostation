import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { getCurrentLive, goLive } from '../api/client';
import ScheduleShowModal from './ScheduleShowModal';

const NAV_ITEMS = [
  { path: 'calendar', label: 'Calendar', icon: CalIcon },
  { path: 'tracks', label: 'Tracks', icon: TrackIcon },
  { path: 'playlists', label: 'Playlists', icon: ListIcon },
  { path: 'settings', label: 'Settings', icon: GearIcon },
  { path: 'analytics', label: 'Analytics', icon: ChartIcon },
];

// URL del stream: usa la variable de entorno o el dominio de producción
const STREAM_URL = process.env.REACT_APP_STREAM_URL || 'https://stream.xhcdmx.org';

export default function Layout() {
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const location = useLocation();
  const [liveShow, setLiveShow] = useState(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const fetchLive = async () => {
      try {
        const res = await getCurrentLive();
        setLiveShow(res.data);
      } catch { setLiveShow(null); }
    };
    fetchLive();
    const interval = setInterval(fetchLive, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isCalendar = location.pathname.startsWith('/calendar');

  return (
    <div style={styles.root}>
      {/* Top bar */}
      <header style={styles.topbar}>
        <div style={styles.topLeft}>
          <svg width="22" height="22" viewBox="0 0 32 32" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="16" cy="16" r="15" stroke="#4f8ef7" strokeWidth="2"/>
            <circle cx="16" cy="16" r="6" fill="#4f8ef7"/>
            <path d="M16 4 L16 10" stroke="#4f8ef7" strokeWidth="2" strokeLinecap="round"/>
            <path d="M16 22 L16 28" stroke="#4f8ef7" strokeWidth="2" strokeLinecap="round"/>
            <path d="M4 16 L10 16" stroke="#4f8ef7" strokeWidth="2" strokeLinecap="round"/>
            <path d="M22 16 L28 16" stroke="#4f8ef7" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <span style={styles.brandName}>RadioStation</span>
        </div>

        <div style={styles.topCenter}>
          {liveShow ? (
            <div style={styles.onAirBadge}>
              <span style={styles.onAirDot}></span>
              ON AIR: <strong>{liveShow.title}</strong>
              <button
                className="btn btn-sm"
                style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', marginLeft: 8 }}
                onClick={() => {
                  // Usa stream.xhcdmx.org vía Cloudflare, no localhost
                  window.open(STREAM_URL, '_blank');
                }}
              >
                ▶ Listen
              </button>
            </div>
          ) : (
            <div style={styles.offAir}>● OFF AIR</div>
          )}
        </div>

        <div style={styles.topRight}>
          <span style={styles.clock}>{now.toLocaleTimeString()}</span>
          <span style={styles.userChip}>{user?.username || 'admin'}</span>
          <button className="btn btn-secondary btn-sm" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <div style={styles.body}>
        {/* Sidebar */}
        <aside style={styles.sidebar}>
          <nav style={styles.nav}>
            {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
              <div key={path}>
                <NavLink
                  to={`/${path}`}
                  style={({ isActive }) => ({
                    ...styles.navItem,
                    ...(isActive ? styles.navActive : {}),
                  })}
                  onClick={() => {
                    if (path === 'calendar') setCalendarOpen((o) => !o);
                  }}
                >
                  <Icon />
                  <span>{label}</span>
                  {path === 'calendar' && (
                    <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 10 }}>
                      {calendarOpen ? '▲' : '▼'}
                    </span>
                  )}
                </NavLink>

                {/* Calendar submenu */}
                {path === 'calendar' && (isCalendar || calendarOpen) && (
                  <div style={styles.submenu}>
                    <button
                      style={styles.submenuItem}
                      onClick={() => setScheduleOpen(true)}
                    >
                      <span style={{ fontSize: 10 }}>＋</span> Schedule Show
                    </button>
                  </div>
                )}
              </div>
            ))}
          </nav>

          <div style={styles.sidebarBottom}>
            <div style={styles.sidebarInfo}>
              <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                {now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </div>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main style={styles.main}>
          <Outlet />
        </main>
      </div>

      {scheduleOpen && (
        <ScheduleShowModal
          onClose={() => setScheduleOpen(false)}
          onSaved={() => {
            setScheduleOpen(false);
            window.dispatchEvent(new CustomEvent('show-scheduled'));
          }}
        />
      )}
    </div>
  );
}

// Icons
function CalIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
}
function TrackIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="18" r="3"/><circle cx="18" cy="15" r="3"/><polyline points="12 18 12 2 21 5 21 15"/></svg>;
}
function ListIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>;
}
function GearIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
}
function ChartIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
}

const styles = {
  root: { display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' },
  topbar: {
    height: 48,
    background: 'var(--bg-secondary)',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px',
    gap: 16,
    flexShrink: 0,
    zIndex: 10,
  },
  topLeft: { display: 'flex', alignItems: 'center', gap: 10, width: 220 },
  brandName: { fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' },
  topCenter: { flex: 1, display: 'flex', justifyContent: 'center' },
  onAirBadge: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: 'rgba(240,81,81,0.15)',
    border: '1px solid var(--red)',
    borderRadius: 4, padding: '4px 12px',
    color: '#fff', fontSize: 12, fontWeight: 500,
  },
  onAirDot: {
    width: 8, height: 8, borderRadius: '50%', background: 'var(--red)',
    boxShadow: '0 0 6px var(--red)',
    animation: 'pulse-red 1.5s infinite',
    display: 'inline-block',
  },
  offAir: { color: 'var(--text-muted)', fontSize: 12 },
  topRight: { display: 'flex', alignItems: 'center', gap: 10, width: 220, justifyContent: 'flex-end' },
  clock: { fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-secondary)' },
  userChip: {
    background: 'var(--bg-active)', borderRadius: 3,
    padding: '3px 8px', fontSize: 11, color: 'var(--text-secondary)',
    fontFamily: 'var(--font-mono)',
  },
  body: { display: 'flex', flex: 1, overflow: 'hidden' },
  sidebar: {
    width: 220, background: 'var(--bg-secondary)',
    borderRight: '1px solid var(--border)',
    display: 'flex', flexDirection: 'column',
    flexShrink: 0, overflow: 'hidden',
  },
  nav: { padding: '10px 0', flex: 1 },
  navItem: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 16px',
    color: 'var(--text-secondary)', textDecoration: 'none',
    fontSize: 13, transition: 'all 0.12s',
    borderLeft: '2px solid transparent',
  },
  navActive: {
    color: 'var(--text-primary)',
    background: 'var(--bg-active)',
    borderLeft: '2px solid var(--accent)',
  },
  submenu: { background: 'var(--bg-primary)', padding: '4px 0' },
  submenuItem: {
    display: 'flex', alignItems: 'center', gap: 8,
    width: '100%', padding: '7px 24px',
    background: 'none', color: 'var(--accent)',
    fontSize: 12, cursor: 'pointer',
    transition: 'background 0.12s',
    border: 'none',
  },
  sidebarBottom: {
    borderTop: '1px solid var(--border)',
    padding: '12px 16px',
  },
  sidebarInfo: {},
  main: { flex: 1, overflow: 'auto', background: 'var(--bg-primary)' },
};
