import ContentEditor from '../components/ContentEditor';
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getPlaylists, createPlaylist, deletePlaylist,
} from '../api/client';

function fmtDur(sec) {
  if (!sec) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function PlaylistsPage() {
  const [selected, setSelected] = useState(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const qc = useQueryClient();

  const { data: plData } = useQuery({ queryKey: ['playlists'], queryFn: getPlaylists });

  const playlists = plData?.data?.results || plData?.data || [];
  const selectedPl = playlists.find((p) => p.id === selected);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await createPlaylist({ name: newName.trim(), description: '' });
      qc.invalidateQueries({ queryKey: ['playlists'] });
      setSelected(res.data.id);
      setNewName('');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (pl) => {
    if (!window.confirm(`Delete playlist "${pl.name}"?`)) return;
    await deletePlaylist(pl.id);
    qc.invalidateQueries({ queryKey: ['playlists'] });
    if (selected === pl.id) setSelected(null);
  };

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Playlists</h1>
          <p style={styles.subtitle}>{playlists.length} playlist{playlists.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div style={styles.body}>
        {/* Left: list of playlists */}
        <div style={styles.leftPanel}>
          <form onSubmit={handleCreate} style={styles.createForm}>
            <input
              placeholder="New playlist name…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={{ flex: 1 }}
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={creating || !newName.trim()}>+</button>
          </form>

          <div style={styles.plList}>
            {playlists.length === 0 ? (
              <div style={{ padding: '20px 12px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>No playlists yet</div>
            ) : playlists.map((pl) => (
              <div
                key={pl.id}
                style={{
                  ...styles.plItem,
                  background: selected === pl.id ? 'var(--bg-active)' : 'transparent',
                  borderLeft: selected === pl.id ? '2px solid var(--accent)' : '2px solid transparent',
                }}
                onClick={() => setSelected(pl.id)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pl.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{pl.track_count} tracks · {fmtDur(pl.total_duration)}</div>
                </div>
                <button
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, padding: '0 4px', flexShrink: 0 }}
                  onClick={(e) => { e.stopPropagation(); handleDelete(pl); }}
                >×</button>
              </div>
            ))}
          </div>
        </div>

        {/* Right: playlist detail + tracks */}
        <div style={styles.rightPanel}>
          {!selectedPl ? (
            <div className="empty-state">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              <p>Select a playlist to manage its tracks</p>
            </div>
          ) : (
            <div style={styles.detail}>
              <div style={styles.detailHeader}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{selectedPl.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {selectedPl.track_count} tracks · {fmtDur(selectedPl.total_duration)}
                  </div>
                </div>
              </div>

              <div style={styles.detailBody}>
                <ContentEditor key={selectedPl.id} kind="playlists" value={selectedPl}
                  onChanged={async () => { await qc.invalidateQueries({ queryKey: ['playlists'] }); }} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '20px 24px 16px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    flexShrink: 0,
  },
  title: { fontSize: 18, fontWeight: 600, marginBottom: 2 },
  subtitle: { fontSize: 12, color: 'var(--text-muted)' },
  body: { display: 'flex', flex: 1, overflow: 'hidden' },
  leftPanel: { width: 240, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' },
  createForm: { display: 'flex', gap: 6, padding: '10px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 },
  plList: { flex: 1, overflowY: 'auto' },
  plItem: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', cursor: 'pointer', transition: 'background 0.1s' },
  rightPanel: { flex: 1, overflow: 'hidden', display: 'flex' },
  detail: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  detailHeader: { padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  detailBody: { flex: 1, overflow: 'auto', padding: '12px 16px' },
  section: { flex: 1, padding: '16px 20px', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', minWidth: 0 },
  sectionLabel: { fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 },
  trackListInner: { flex: 1, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 },
  trackRow: { display: 'flex', alignItems: 'center', padding: '7px 10px', borderBottom: '1px solid var(--border)', gap: 8 },
};
