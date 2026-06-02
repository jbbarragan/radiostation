import React, { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { getRadioStatus, getBroadcastToken } from '../api/client';
import ScheduleShowModal from './ScheduleShowModal';

const NAV_ITEMS = [
  { path: 'calendar', label: 'Calendar', icon: CalIcon },
  { path: 'tracks', label: 'Tracks', icon: TrackIcon },
  { path: 'playlists', label: 'Playlists', icon: ListIcon },
  { path: 'settings', label: 'Settings', icon: GearIcon },
  { path: 'analytics', label: 'Analytics', icon: ChartIcon },
];

const STREAM_URL = process.env.REACT_APP_STREAM_URL || 'https://stream.xhcdmx.org';

function BroadcastModal({ onClose }) {
  const [creds, setCreds] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('idle');
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [gainValue, setGainValue] = useState(1.0);
  const [meter, setMeter] = useState(0);
  const streamRef = useRef(null);
  const analyserRef = useRef(null);
  const animRef = useRef(null);
  const mediaRecorderRef = useRef(null);

  useEffect(() => {
    getBroadcastToken()
      .then(r => setCreds(r.data))
      .catch(() => setError('No se pudieron obtener las credenciales de transmisión.'));
    navigator.mediaDevices.enumerateDevices().then(devs => {
      const mics = devs.filter(d => d.kind === 'audioinput');
      setDevices(mics);
      if (mics.length > 0) setSelectedDevice(mics[0].deviceId);
    });
    return () => { stopBroadcast(); };
  }, []);

  const startMeter = (stream, gain) => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = ctx.createMediaStreamSource(stream);
    const gainNode = ctx.createGain();
    gainNode.gain.value = gain;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(gainNode);
    gainNode.connect(analyser);
    analyserRef.current = { analyser, gainNode, ctx };
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      setMeter(Math.min(100, (avg / 128) * 100));
      animRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  const stopBroadcast = () => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    if (mediaRecorderRef.current) { try { mediaRecorderRef.current.stop(); } catch (_) {} }
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (analyserRef.current) { try { analyserRef.current.ctx.close(); } catch (_) {} }
    setStatus('stopped');
    setMeter(0);
  };

  const startBroadcast = async () => {
    if (!creds) return;
    setStatus('connecting');
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: selectedDevice ? { exact: selectedDevice } : undefined }
      });
      streamRef.current = stream;
      startMeter(stream, gainValue);
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128000 });
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = async (e) => {
        if (e.data && e.data.size > 0) {
          try {
            await fetch(
              `http://localhost:8001/api/radio/broadcast-chunk/`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/octet-stream',
                  'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
                },
                body: e.data,
              }
            );
          } catch (_) {}
        }
      };
      recorder.start(500);
      setStatus('live');
    } catch (err) {
      setError(`Error al acceder al micrófono: ${err.message}`);
      setStatus('error');
    }
  };

  const handleGainChange = (v) => {
    setGainValue(v);
    if (analyserRef.current) analyserRef.current.gainNode.gain.value = v;
  };

  return (
    <div style={modalStyles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={modalStyles.box}>
        <div style={modalStyles.header}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>📡 Transmitir en Vivo</span>
          <button onClick={onClose} style={modalStyles.closeBtn}>✕</button>
        </div>
        {error && <div style={modalStyles.error}>{error}</div>}
        <div style={modalStyles.body}>
          <label style={modalStyles.label}>Micrófono</label>
          <select style={modalStyles.select} value={selectedDevice}
            onChange={e => setSelectedDevice(e.target.value)} disabled={status === 'live'}>
            {devices.map(d => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Micrófono (${d.deviceId.slice(0, 8)}...)`}
              </option>
            ))}
            {devices.length === 0 && <option value="">Sin micrófonos detectados</option>}
          </select>
          <label style={modalStyles.label}>Ganancia: <strong>{Math.round(gainValue * 100)}%</strong></label>
          <input type="range" min="0" max="3" step="0.05" value={gainValue}
            onChange={e => handleGainChange(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#4f8ef7' }} />
          <div style={modalStyles.meterContainer}>
            <div style={{ ...modalStyles.meterBar, width: `${meter}%`,
              background: meter > 80 ? '#e74c3c' : meter > 60 ? '#f39c12' : '#2ecc71' }} />
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>Nivel de entrada</div>
          <div style={modalStyles.statusRow}>
            <div style={{ ...modalStyles.statusDot,
              background: status === 'live' ? '#2ecc71' : status === 'connecting' ? '#f39c12' : '#888' }} />
            <span style={{ fontSize: 12 }}>
              {status === 'idle' && 'Listo para transmitir'}
              {status === 'connecting' && 'Conectando...'}
              {status === 'live' && '🔴 EN VIVO – Transmitiendo al aire'}
              {status === 'stopped' && 'Transmisión detenida'}
              {status === 'error' && 'Error de conexión'}
            </span>
          </div>
          {creds && (
            <div style={modalStyles.credBox}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                Relay: harbor:{creds.harbor_port}{creds.mount}
              </span>
            </div>
          )}
        </div>
        <div style={modalStyles.footer}>
          {status !== 'live' ? (
            <button style={{ ...modalStyles.btn, background: '#2ecc71' }} onClick={startBroadcast}
              disabled={!creds || status === 'connecting' || devices.length === 0}>
              ▶ Iniciar Transmisión
            </button>
          ) : (
            <button style={{ ...modalStyles.btn, background: '#e74c3c' }} onClick={stopBroadcast}>
              ■ Detener Transmisión
            </button>
          )}
          <button style={{ ...modalStyles.btn, background: 'var(--bg-active)', color: 'var(--text-secondary)' }} onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

const modalStyles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  box: { background: 'var(--bg-secondary)', border: '1px solid var(--border)',
    borderRadius: 8, width: 420, maxWidth: '95vw', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 18px', borderBottom: '1px solid var(--border)' },
  closeBtn: { background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16 },
  body: { padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 },
  footer: { padding: '12px 18px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 },
  label: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 },
  select: { background: 'var(--bg-primary)', border: '1px solid var(--border)',
    color: 'var(--text-primary)', borderRadius: 4, padding: '6px 10px', fontSize: 13, width: '100%' },
  meterContainer: { height: 8, background: 'var(--bg-primary)', borderRadius: 4, overflow: 'hidden', marginTop: 4 },
  meterBar: { height: '100%', transition: 'width 0.1s ease, background 0.3s ease', borderRadius: 4 },
  statusRow: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 },
  statusDot: { width: 10, height: 10, borderRadius: '50%' },
  credBox: { background: 'var(--bg-primary)', borderRadius: 4, padding: '6px 10px', fontSize: 11 },
  error: { background: 'rgba(231,76,60,0.15)', border: '1px solid var(--red)',
    color: '#e74c3c', borderRadius: 4, padding: '8px 14px', margin: '8px 18px 0', fontSize: 12 },
  btn: { flex: 1, padding: '8px 0', borderRadius: 4, border: 'none',
    color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 },
};

export default function Layout() {
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const location = useLocation();
  const [radioStatus, setRadioStatus] = useState({ state: 'off', show: null });
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await getRadioStatus();
        setRadioStatus(res.data);
      } catch { setRadioStatus({ state: 'off', show: null }); }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => { logout(); navigate('/login'); };
  const isCalendar = location.pathname.startsWith('/calendar');
  const { state, show } = radioStatus;

  const renderStatusBadge = () => {
    if (state === 'show' && show) {
      return (
        <div style={styles.onAirBadge}>
          <span style={styles.onAirDot}></span>
          ON AIR: <strong style={{ marginLeft: 4 }}>{show.title}</strong>
          <button className="btn btn-sm"
            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', marginLeft: 8 }}
            onClick={() => window.open(`${STREAM_URL}/stream`, '_blank')}>
            ▶ Listen
          </button>
        </div>
      );
    }
    if (state === 'backup') {
      return (
        <div style={styles.backupBadge}>
          <span style={styles.backupSymbol}>⚠</span>
          <span style={{ fontWeight: 600 }}>BACKUP</span>
        </div>
      );
    }
    return <div style={styles.offAir}>● OFF AIR</div>;
  };

  return (
    <div style={styles.root}>
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
        <div style={styles.topCenter}>{renderStatusBadge()}</div>
        <div style={styles.topRight}>
          <span style={styles.clock}>{now.toLocaleTimeString()}</span>
          <span style={styles.userChip}>{user?.username || 'admin'}</span>
          <button className="btn btn-secondary btn-sm" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <div style={styles.body}>
        <aside style={styles.sidebar}>
          <nav style={styles.nav}>
            {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
              <div key={path}>
                <NavLink to={`/${path}`}
                  style={({ isActive }) => ({ ...styles.navItem, ...(isActive ? styles.navActive : {}) })}
                  onClick={() => { if (path === 'calendar') setCalendarOpen((o) => !o); }}>
                  <Icon />
                  <span>{label}</span>
                  {path === 'calendar' && (
                    <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 10 }}>
                      {calendarOpen ? '▲' : '▼'}
                    </span>
                  )}
                </NavLink>
                {path === 'calendar' && (isCalendar || calendarOpen) && (
                  <div style={styles.submenu}>
                    <button style={styles.submenuItem} onClick={() => setScheduleOpen(true)}>
                      <span style={{ fontSize: 10 }}>＋</span> Schedule Show
                    </button>
                    <button style={{ ...styles.submenuItem, color: '#f39c12' }}
                      onClick={() => setBroadcastOpen(true)}>
                      <span style={{ fontSize: 10 }}>📡</span> Transmitir
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
        <main style={styles.main}><Outlet /></main>
      </div>

      {scheduleOpen && (
        <ScheduleShowModal onClose={() => setScheduleOpen(false)}
          onSaved={() => { setScheduleOpen(false); window.dispatchEvent(new CustomEvent('show-scheduled')); }} />
      )}
      {broadcastOpen && <BroadcastModal onClose={() => setBroadcastOpen(false)} />}
    </div>
  );
}

function CalIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>; }
function TrackIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="18" r="3"/><circle cx="18" cy="15" r="3"/><polyline points="12 18 12 2 21 5 21 15"/></svg>; }
function ListIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>; }
function GearIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>; }
function ChartIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>; }

const styles = {
  root: { display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' },
  topbar: { height: 48, background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)',
    display: 'flex', alignItems: 'center', padding: '0 16px', gap: 16, flexShrink: 0, zIndex: 10 },
  topLeft: { display: 'flex', alignItems: 'center', gap: 10, width: 220 },
  brandName: { fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' },
  topCenter: { flex: 1, display: 'flex', justifyContent: 'center' },
  onAirBadge: { display: 'flex', alignItems: 'center', gap: 8,
    background: 'rgba(240,81,81,0.15)', border: '1px solid var(--red)',
    borderRadius: 4, padding: '4px 12px', color: '#fff', fontSize: 12, fontWeight: 500 },
  onAirDot: { width: 8, height: 8, borderRadius: '50%', background: 'var(--red)',
    boxShadow: '0 0 6px var(--red)', animation: 'pulse-red 1.5s infinite', display: 'inline-block' },
  backupBadge: { display: 'flex', alignItems: 'center', gap: 8,
    background: 'rgba(243,156,18,0.15)', border: '1px solid #f39c12',
    borderRadius: 4, padding: '4px 12px', color: '#f39c12', fontSize: 12, fontWeight: 500 },
  backupSymbol: { fontSize: 14, color: '#f39c12' },
  offAir: { color: 'var(--text-muted)', fontSize: 12 },
  topRight: { display: 'flex', alignItems: 'center', gap: 10, width: 220, justifyContent: 'flex-end' },
  clock: { fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-secondary)' },
  userChip: { background: 'var(--bg-active)', borderRadius: 3,
    padding: '3px 8px', fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' },
  body: { display: 'flex', flex: 1, overflow: 'hidden' },
  sidebar: { width: 220, background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)',
    display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' },
  nav: { padding: '10px 0', flex: 1 },
  navItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px',
    color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 13,
    transition: 'all 0.12s', borderLeft: '2px solid transparent' },
  navActive: { color: 'var(--text-primary)', background: 'var(--bg-active)', borderLeft: '2px solid var(--accent)' },
  submenu: { background: 'var(--bg-primary)', padding: '4px 0' },
  submenuItem: { display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 24px',
    background: 'none', color: 'var(--accent)', fontSize: 12, cursor: 'pointer',
    transition: 'background 0.12s', border: 'none' },
  sidebarBottom: { borderTop: '1px solid var(--border)', padding: '12px 16px' },
  sidebarInfo: {},
  main: { flex: 1, overflow: 'auto', background: 'var(--bg-primary)' },
};
