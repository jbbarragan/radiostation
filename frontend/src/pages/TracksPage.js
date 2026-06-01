import React, { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getTracks, uploadTrack, deleteTrack } from '../api/client';

function fmtDur(sec) {
  if (!sec) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function TracksPage() {
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState([]);
  const fileRef = useRef(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['tracks', search],
    queryFn: () => getTracks({ search }),
  });

  const tracks = data?.data?.results || data?.data || [];

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    const progress = files.map((f) => ({ name: f.name, status: 'pending' }));
    setUploadProgress(progress);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadProgress((p) => p.map((x, j) => j === i ? { ...x, status: 'uploading' } : x));
      try {
        const fd = new FormData();
        fd.append('file', file);

        // Extraer título y artista del nombre de archivo
        // Formatos comunes: "Artista - Título.mp3" o "Título.mp3"
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
        const parts = nameWithoutExt.split(' - ');
        if (parts.length >= 2) {
          fd.append('artist', parts[0].trim());
          fd.append('title', parts.slice(1).join(' - ').trim());
        } else {
          fd.append('title', nameWithoutExt.trim());
          fd.append('artist', '');
        }

        await uploadTrack(fd);
        setUploadProgress((p) => p.map((x, j) => j === i ? { ...x, status: 'done' } : x));
      } catch (err) {
        console.error('Upload error:', err.response?.data || err.message);
        setUploadProgress((p) => p.map((x, j) => j === i ? { ...x, status: 'error' } : x));
      }
    }
    qc.invalidateQueries(['tracks']);
    setUploading(false);
    e.target.value = '';
    setTimeout(() => setUploadProgress([]), 3000);
  };

  const handleDelete = async (id, title) => {
    if (!window.confirm(`Delete "${title}"?`)) return;
    await deleteTrack(id);
    qc.invalidateQueries(['tracks']);
  };

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Tracks</h1>
          <p style={styles.subtitle}>{tracks.length} track{tracks.length !== 1 ? 's' : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            placeholder="Search tracks…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 220 }}
          />
          <button
            className="btn btn-primary"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            ↑ Upload
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>
      </div>

      {/* Upload progress */}
      {uploadProgress.length > 0 && (
        <div style={styles.uploadProgress}>
          {uploadProgress.map((f, i) => (
            <div key={i} style={styles.uploadItem}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>{f.name}</span>
              <span style={{
                fontSize: 11, fontWeight: 600,
                color: f.status === 'done' ? 'var(--green)' : f.status === 'error' ? 'var(--red)' : 'var(--text-muted)',
              }}>
                {f.status === 'done' ? '✓' : f.status === 'error' ? '✗ error' : f.status === 'uploading' ? '↑ uploading…' : '…'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Tracks table */}
      <div style={styles.tableWrapper}>
        {isLoading ? (
          <div className="empty-state"><p>Loading…</p></div>
        ) : tracks.length === 0 ? (
          <div className="empty-state">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="9" cy="18" r="3"/><circle cx="18" cy="15" r="3"/><polyline points="12 18 12 2 21 5 21 15"/></svg>
            <p>No tracks yet. Upload some audio files to get started.</p>
          </div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr style={styles.thead}>
                <th style={{ ...styles.th, width: 40 }}>#</th>
                <th style={styles.th}>Title</th>
                <th style={styles.th}>Artist</th>
                <th style={styles.th}>Album</th>
                <th style={styles.th}>Genre</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Duration</th>
                <th style={{ ...styles.th, width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {tracks.map((track, i) => (
                <tr key={track.id} style={styles.tr}>
                  <td style={{ ...styles.td, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{i + 1}</td>
                  <td style={styles.td}>
                    <div style={{ fontWeight: 500 }}>{track.title}</div>
                  </td>
                  <td style={{ ...styles.td, color: 'var(--text-secondary)' }}>{track.artist || '—'}</td>
                  <td style={{ ...styles.td, color: 'var(--text-secondary)' }}>{track.album || '—'}</td>
                  <td style={{ ...styles.td, color: 'var(--text-secondary)' }}>{track.genre || '—'}</td>
                  <td style={{ ...styles.td, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fmtDur(track.duration)}</td>
                  <td style={styles.td}>
                    <button
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, padding: '2px 6px' }}
                      onClick={() => handleDelete(track.id, track.title)}
                      title="Delete"
                    >×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: '20px 24px 16px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    flexShrink: 0,
  },
  title: { fontSize: 18, fontWeight: 600, marginBottom: 2 },
  subtitle: { fontSize: 12, color: 'var(--text-muted)' },
  uploadProgress: {
    padding: '10px 24px', background: 'var(--bg-panel)',
    borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4,
  },
  uploadItem: { display: 'flex', gap: 12, alignItems: 'center' },
  tableWrapper: { flex: 1, overflowY: 'auto', padding: '0 0 20px' },
  table: { width: '100%', borderCollapse: 'collapse' },
  thead: { background: 'var(--bg-secondary)', position: 'sticky', top: 0, zIndex: 1 },
  th: {
    padding: '9px 16px', textAlign: 'left',
    fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.06em',
    borderBottom: '1px solid var(--border)',
  },
  tr: { borderBottom: '1px solid var(--border)', transition: 'background 0.1s' },
  td: { padding: '9px 16px', fontSize: 13 },
};
