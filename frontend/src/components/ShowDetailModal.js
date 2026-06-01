import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getTracks, getPlaylists, addItemToShow, removeItemFromShow, goLive, deleteShow } from '../api/client';
import { format } from 'date-fns';

function fmtDur(sec) {
  if (!sec) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function ShowDetailModal({ show, onClose, onChanged }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState('tracks'); // 'tracks' | 'playlists'
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(null);
  const [toggling, setToggling] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: tracksData } = useQuery({
    queryKey: ['tracks', search],
    queryFn: () => getTracks({ search }),
  });
  const { data: playlistsData } = useQuery({
    queryKey: ['playlists'],
    queryFn: getPlaylists,
  });

  const tracks = tracksData?.data?.results || tracksData?.data || [];
  const playlists = playlistsData?.data?.results || playlistsData?.data || [];

  const totalDur = show.duration_seconds || 0;
  const usedDur = show.content_duration || 0;
  const fillPct = totalDur > 0 ? Math.min(100, (usedDur / totalDur) * 100) : 0;
  const remaining = totalDur - usedDur;

  const handleAddTrack = async (trackId) => {
    setAdding(trackId);
    try {
      await addItemToShow(show.id, { track_id: trackId });
      onChanged();
    } catch (err) {
      alert(err.response?.data?.error || 'Cannot add track');
    } finally {
      setAdding(null);
    }
  };

  const handleAddPlaylist = async (playlistId) => {
    setAdding(playlistId);
    try {
      await addItemToShow(show.id, { playlist_id: playlistId });
      onChanged();
    } catch (err) {
      alert(err.response?.data?.error || 'Cannot add playlist');
    } finally {
      setAdding(null);
    }
  };

  const handleRemoveItem = async (itemId) => {
    try {
      await removeItemFromShow(show.id, itemId);
      onChanged();
    } catch {}
  };

  const handleGoLive = async () => {
    setToggling(true);
    try {
      await goLive(show.id);
      onChanged();
    } finally {
      setToggling(false);
    }
  };

  const handleDelete = async () => {
    try {
      const { deleteShow: del } = await import('../api/client');
      await del(show.id);
      onClose();
      qc.invalidateQueries(['shows']);
    } catch {}
  };

  const fillColor = fillPct >= 100 ? 'var(--red)' : fillPct > 60 ? 'var(--yellow)' : 'var(--green)';

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 680, width: '95vw' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
          <div style={{ width: 14, height: 14, borderRadius: 3, background: show.color, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{show.title}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {format(new Date(show.start_time), 'MMM d, yyyy HH:mm')} → {format(new Date(show.end_time), 'HH:mm')}
              {' · '}{fmtDur(totalDur)} total
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className={`btn btn-sm ${show.is_live ? 'btn-live' : 'btn-secondary'}`}
              onClick={handleGoLive}
              disabled={toggling}
            >
              {show.is_live ? '⏹ Stop Live' : '▶ Go Live'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setConfirmDelete(true)}>🗑</button>
          </div>
        </div>

        {/* Fill meter */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 5 }}>
            <span>Content: {fmtDur(usedDur)} / {fmtDur(totalDur)}</span>
            <span style={{ color: fillColor }}>{fillPct.toFixed(0)}% filled · {remaining > 0 ? fmtDur(remaining) + ' remaining' : 'Full'}</span>
          </div>
          <div style={{ height: 6, background: 'var(--bg-primary)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${fillPct}%`, background: fillColor, borderRadius: 3, transition: 'width 0.3s' }} />
          </div>
        </div>

        {/* Current show items */}
        {show.show_items?.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Show Content ({show.show_items.length} tracks)
            </div>
            <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
              {show.show_items.map((item, i) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', padding: '6px 10px', borderBottom: i < show.show_items.length - 1 ? '1px solid var(--border)' : 'none', gap: 8 }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11, width: 18, flexShrink: 0 }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.track.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.track.artist}</div>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{fmtDur(item.track.duration)}</span>
                  <button
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}
                    onClick={() => handleRemoveItem(item.id)}
                  >×</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add content tabs */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            Add Content
          </div>
          <div style={{ display: 'flex', gap: 0, marginBottom: 12, border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
            {['tracks', 'playlists'].map((t) => (
              <button
                key={t}
                className="btn"
                style={{
                  flex: 1, justifyContent: 'center', borderRadius: 0, padding: '7px',
                  background: tab === t ? 'var(--bg-active)' : 'var(--bg-panel)',
                  color: tab === t ? 'var(--text-primary)' : 'var(--text-muted)',
                  borderRight: t === 'tracks' ? '1px solid var(--border)' : 'none',
                  fontSize: 12,
                }}
                onClick={() => setTab(t)}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {tab === 'tracks' && (
            <>
              <input
                placeholder="Search tracks…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: '100%', marginBottom: 8 }}
              />
              <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
                {tracks.length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>No tracks found</div>
                ) : tracks.map((track, i) => (
                  <div key={track.id} style={{ display: 'flex', alignItems: 'center', padding: '7px 10px', borderBottom: i < tracks.length - 1 ? '1px solid var(--border)' : 'none', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{track.artist || '—'}</div>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{fmtDur(track.duration)}</span>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleAddTrack(track.id)}
                      disabled={adding === track.id || fillPct >= 100}
                    >
                      {adding === track.id ? '…' : '+'}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === 'playlists' && (
            <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
              {playlists.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>No playlists</div>
              ) : playlists.map((pl, i) => (
                <div key={pl.id} style={{ display: 'flex', alignItems: 'center', padding: '8px 10px', borderBottom: i < playlists.length - 1 ? '1px solid var(--border)' : 'none', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{pl.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{pl.track_count} tracks · {fmtDur(pl.total_duration)}</div>
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleAddPlaylist(pl.id)}
                    disabled={adding === pl.id || fillPct >= 100}
                  >
                    {adding === pl.id ? '…' : '+ Add All'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>

        {confirmDelete && (
          <div className="modal-overlay" style={{ zIndex: 1100 }}>
            <div className="modal" style={{ maxWidth: 360 }}>
              <div className="modal-title">Delete Show</div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                Delete <strong>{show.title}</strong>? This cannot be undone.
              </p>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setConfirmDelete(false)}>Cancel</button>
                <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
