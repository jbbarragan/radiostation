import React, { useState, useEffect } from 'react';
import { getSettings, saveSettings } from '../api/client';

const STREAM_URL = process.env.REACT_APP_STREAM_URL || 'https://stream.xhcdmx.org';

export default function SettingsPage() {
  const [form, setForm] = useState({
    station_name: '',
    slot_minutes: 30,
    timezone: 'America/Mexico_City',
  });
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSettings().then((res) => {
      setForm((f) => ({ ...f, ...res.data }));
    }).finally(() => setLoading(false));
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    await saveSettings(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  if (loading) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading…</div>;

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Settings</h1>
        <p style={styles.subtitle}>Station configuration</p>
      </div>

      <div style={styles.body}>
        <form onSubmit={handleSave} style={styles.form}>

          <div style={styles.card}>
            <div style={styles.cardTitle}>Station</div>

            <div className="form-group">
              <label>Station Name</label>
              <input value={form.station_name} onChange={set('station_name')} placeholder="My Radio Station" />
            </div>

            <div className="form-group">
              <label>Timezone</label>
              <select value={form.timezone} onChange={set('timezone')}>
                {Intl.supportedValuesOf('timeZone').map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={styles.card}>
            <div style={styles.cardTitle}>Calendar</div>

            <div className="form-group">
              <label>Default time slot size</label>
              <select value={form.slot_minutes} onChange={(e) => setForm((f) => ({ ...f, slot_minutes: Number(e.target.value) }))}>
                <option value={15}>15 minutes</option>
                <option value={20}>20 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={60}>60 minutes</option>
              </select>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Each day will be divided into {Math.floor(1440 / form.slot_minutes)} slots of {form.slot_minutes} min
              </div>
            </div>
          </div>

          <div style={styles.card}>
            <div style={styles.cardTitle}>Streaming</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.6 }}>
              El stream de audio está disponible públicamente a través de Cloudflare:
            </div>

            <div style={styles.infoBox}>
              <strong>Stream URL (pública)</strong>
              <code style={styles.code}>{STREAM_URL}</code>
              <p style={{ margin: 0, fontSize: 11 }}>
                Usa esta URL en reproductores de audio, apps o para compartir con oyentes.
              </p>
              <button
                type="button"
                className="btn btn-sm"
                style={{ alignSelf: 'flex-start', marginTop: 4 }}
                onClick={() => window.open(STREAM_URL, '_blank')}
              >
                ▶ Probar stream
              </button>
            </div>

            <div style={{ ...styles.infoBox, marginTop: 12 }}>
              <strong>Arquitectura</strong>
              <div style={{ fontSize: 11, lineHeight: 1.7 }}>
                <code style={{ ...styles.code, display: 'inline', padding: '2px 6px' }}>Liquidsoap</code>
                {' → '}
                <code style={{ ...styles.code, display: 'inline', padding: '2px 6px' }}>Icecast :8000</code>
                {' → '}
                <code style={{ ...styles.code, display: 'inline', padding: '2px 6px' }}>Cloudflare tunnel</code>
                {' → '}
                <code style={{ ...styles.code, display: 'inline', padding: '2px 6px' }}>stream.xhcdmx.org</code>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button type="submit" className="btn btn-primary">Save Settings</button>
            {saved && <span style={{ fontSize: 12, color: 'var(--green)' }}>✓ Saved!</span>}
          </div>
        </form>
      </div>
    </div>
  );
}

const styles = {
  page: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  header: {
    padding: '20px 24px 16px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    flexShrink: 0,
  },
  title: { fontSize: 18, fontWeight: 600, marginBottom: 2 },
  subtitle: { fontSize: 12, color: 'var(--text-muted)' },
  body: { flex: 1, overflowY: 'auto', padding: '24px' },
  form: { maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 20 },
  card: {
    background: 'var(--bg-panel)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '20px',
  },
  cardTitle: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border)' },
  infoBox: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '12px 14px',
    fontSize: 12,
    lineHeight: 1.6,
    color: 'var(--text-secondary)',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  code: {
    fontFamily: 'var(--font-mono)',
    background: 'var(--bg-primary)',
    padding: '6px 10px',
    borderRadius: 4,
    fontSize: 12,
    color: 'var(--green)',
    border: '1px solid var(--border)',
  },
};
