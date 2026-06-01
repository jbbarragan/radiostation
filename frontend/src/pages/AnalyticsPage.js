import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAnalytics } from '../api/client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: 'var(--bg-panel)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '18px 20px',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || 'var(--text-primary)', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload?.length) {
    return (
      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', fontSize: 12 }}>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 2 }}>{label}</p>
        <p style={{ color: 'var(--accent)', fontWeight: 600 }}>{payload[0].value} shows</p>
      </div>
    );
  }
  return null;
};

export default function AnalyticsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['analytics'],
    queryFn: getAnalytics,
    refetchInterval: 60000,
  });

  const stats = data?.data;

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Analytics</h1>
        <p style={styles.subtitle}>Station performance overview</p>
      </div>

      {isLoading ? (
        <div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading analytics…</div>
      ) : (
        <div style={styles.body}>
          {/* Stat cards */}
          <div style={styles.statGrid}>
            <StatCard label="Total Tracks" value={stats?.total_tracks ?? 0} color="var(--accent)" />
            <StatCard label="Playlists" value={stats?.total_playlists ?? 0} />
            <StatCard label="Total Shows" value={stats?.total_shows ?? 0} />
            <StatCard label="Shows This Week" value={stats?.shows_this_week ?? 0} sub="Last 7 days" color="var(--green)" />
            <StatCard label="Shows This Month" value={stats?.shows_this_month ?? 0} sub="Last 30 days" />
          </div>

          {/* Shows per day chart */}
          <div style={styles.chartCard}>
            <div style={styles.cardTitle}>Shows per Day (Last 7 Days)</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={stats?.shows_by_day || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  tickFormatter={(v) => {
                    const d = new Date(v);
                    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                  }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--bg-hover)' }} />
                <Bar dataKey="count" fill="var(--accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Top tracks */}
          {stats?.top_tracks?.length > 0 && (
            <div style={styles.chartCard}>
              <div style={styles.cardTitle}>Most Played Tracks</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={styles.th}>#</th>
                    <th style={styles.th}>Title</th>
                    <th style={styles.th}>Artist</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Uses</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.top_tracks.map((t, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ ...styles.td, color: 'var(--text-muted)', width: 36 }}>{i + 1}</td>
                      <td style={styles.td}>{t.track__title || '—'}</td>
                      <td style={{ ...styles.td, color: 'var(--text-secondary)' }}>{t.track__artist || '—'}</td>
                      <td style={{ ...styles.td, textAlign: 'right', color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{t.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
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
  body: { flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 },
  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 },
  chartCard: {
    background: 'var(--bg-panel)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '20px',
  },
  cardTitle: { fontSize: 13, fontWeight: 600, marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border)', color: 'var(--text-primary)' },
  th: { padding: '7px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border)' },
  td: { padding: '8px 12px', fontSize: 13 },
};
