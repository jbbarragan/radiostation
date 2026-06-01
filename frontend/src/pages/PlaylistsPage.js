import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getPlaylists, createPlaylist, deletePlaylist,
  getTracks, addTrackToPlaylist, removeTrackFromPlaylist,
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
  const [trackSearch, setTrackSearch] = useState('');
  const qc = useQueryClient();

  const { data: plData } = useQuery({ queryKey: ['playlists'], queryFn: getPlaylists });
  const { data: trData } = useQuery({ queryKey: ['tracks', trackSearch], queryFn: () => getTracks({ search: trackSearch }) });

  const playlists = plData?.data?.results || plData?.data || [];
  const tracks = trData?.data?.results || trData?.data || [];
  const selectedPl = playlists.find((p) => p.id === selected);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await createPlaylist({ name: newName.trim(), description: '' });
      qc.invalidateQueries(['playlists']);
      setSelected(res.data.id);
      setNewName('');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (pl) => {
    if (!window.confirm(`Delete playlist "${pl.name}"?`)) return;
    await deletePlaylist(pl.id);
    qc.invalidateQueries(['playlists']);
    if (selected === pl.id) setSelected(null);
  };

  const handleAddTrack = async (trackId) => {
    if (!selected) return;
    await addTrackToPlaylist(selected, trackId);
    qc.invalidateQueries(['playlists']);
  };

  const handleRemoveItem = async (itemId) => {
    if (!selected) return;
    await removeTrackFromPlaylist(selected, itemId);
    qc.invalidateQueries(['playlists']);
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
                {/* Current tracks in playlist */}
                <div style={styles.section}>
                  <div style={styles.sectionLabel}>Playlist Tracks</div>
                  {selectedPl.playlist_tracks?.length === 0 ? (
                    <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>Empty playlist</div>
                  ) : (
                    <div style={styles.trackListInner}>
                      {selectedPl.playlist_tracks?.map((item, i) => (
                        <div key={item.id} style={styles.trackRow}>
                          <span style={{ color: 'var(--text-muted)', fontSize: 11, width: 20, flexShrink: 0 }}>{i + 1}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.track.title}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.track.artist || '—'}</div>
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{fmtDur(item.track.duration)}</span>
                          <button
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}
                            onClick={() => handleRemoveItem(item.id)}
                          >×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Add tracks */}
                <div style={styles.section}>
                  <div style={styles.sectionLabel}>Add Tracks</div>
                  <input
                    placeholder="Search tracks…"
                    value={trackSearch}
                    onChange={(e) => setTrackSearch(e.target.value)}
                    style={{ width: '100%', marginBottom: 8 }}
                  />
                  <div style={styles.trackListInner}>
                    {tracks.map((track, i) => {
                      const alreadyIn = selectedPl.playlist_tracks?.some((pt) => pt.track.id === track.id);
                      return (
                        <div key={track.id} style={{ ...styles.trackRow, opacity: alreadyIn ? 0.5 : 1 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.title}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{track.artist || '—'}</div>
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{fmtDur(track.duration)}</span>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleAddTrack(track.id)}
                            disabled={alreadyIn}
                          >+</button>
                        </div>
                      );
                    })}
                    {tracks.length === 0 && (
                      <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>No tracks found</div>
                    )}
                  </div>
                </div>
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
  detailBody: { flex: 1, overflow: 'auto', display: 'flex', gap: 0 },
  section: { flex: 1, padding: '16px 20px', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', minWidth: 0 },
  sectionLabel: { fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 },
  trackListInner: { flex: 1, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 },
  trackRow: { display: 'flex', alignItems: 'center', padding: '7px 10px', borderBottom: '1px solid var(--border)', gap: 8 },
};
