import React, { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getTracks, deleteTrack, batchUploadTracks,
  getFolders, createFolder, deleteFolder, moveTrack,
} from '../api/client';

function fmtDur(sec) {
  if (!sec || sec === 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Íconos inline
const FolderIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </svg>
);
const BackIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
);
const MusicIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="9" cy="18" r="3"/><circle cx="18" cy="15" r="3"/>
    <polyline points="12 18 12 2 21 5 21 15"/>
  </svg>
);

export default function TracksPage() {
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState([]);
  const [currentFolder, setCurrentFolder] = useState(null); // { id, name } | null = raíz
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [movingTrack, setMovingTrack] = useState(null); // track id being moved

  const fileRef = useRef(null);
  const folderInputRef = useRef(null);
  const qc = useQueryClient();

  // Query parámetros según la vista actual
  const trackParams = {
    search: search || undefined,
    folder_id: currentFolder ? currentFolder.id : undefined,
    no_folder: !currentFolder && !search ? '1' : undefined,
  };
  // Si hay búsqueda, mostrar todos sin filtro de carpeta
  const effectiveParams = search ? { search } : trackParams;

  const { data: tracksData, isLoading: tracksLoading } = useQuery({
    queryKey: ['tracks', effectiveParams],
    queryFn: () => getTracks(effectiveParams),
  });
  const { data: foldersData, isLoading: foldersLoading } = useQuery({
    queryKey: ['folders'],
    queryFn: getFolders,
  });

  const tracks = tracksData?.data?.results || tracksData?.data || [];
  const folders = foldersData?.data?.results || foldersData?.data || [];

  // ── Batch upload (archivos sueltos) ─────────────────────────────
  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    await runUpload(files);
    e.target.value = '';
  };

  // ── Batch upload (carpeta completa) ─────────────────────────────
  const handleFolderPick = async (e) => {
    const files = Array.from(e.target.files).filter(
      (f) => f.type.startsWith('audio/') || /\.(mp3|wav|ogg|flac|aac|m4a)$/i.test(f.name)
    );
    if (!files.length) {
      alert('No se encontraron archivos de audio en la carpeta seleccionada.');
      return;
    }
    // Preguntar si crear carpeta con el nombre de la carpeta subida
    const folderName = files[0].webkitRelativePath?.split('/')[0] || '';
    let targetFolderId = currentFolder?.id || null;
    if (folderName && !currentFolder) {
      const createNew = window.confirm(
        `¿Crear una carpeta llamada "${folderName}" para estos ${files.length} archivos?`
      );
      if (createNew) {
        try {
          const res = await createFolder(folderName);
          const newFolder = res.data;
          targetFolderId = newFolder.id;
          qc.invalidateQueries(['folders']);
        } catch {}
      }
    }
    await runUpload(files, targetFolderId);
    e.target.value = '';
  };

  const runUpload = async (files, overrideFolderId) => {
    setUploading(true);
    const progress = files.map((f) => ({ name: f.name, status: 'pending' }));
    setUploadProgress(progress);

    // Subir en lotes de 10
    const BATCH = 10;
    for (let start = 0; start < files.length; start += BATCH) {
      const chunk = files.slice(start, start + BATCH);
      // Marcar como uploading
      setUploadProgress((p) =>
        p.map((x, j) =>
          j >= start && j < start + BATCH ? { ...x, status: 'uploading' } : x
        )
      );
      try {
        const fd = new FormData();
        chunk.forEach((f) => fd.append('files', f));
        const folderId = overrideFolderId !== undefined ? overrideFolderId : currentFolder?.id;
        if (folderId) fd.append('folder_id', folderId);
        const res = await batchUploadTracks(fd);
        const { uploaded, errors } = res.data;
        // Marcar resultados individuales
        setUploadProgress((p) =>
          p.map((x, j) => {
            if (j < start || j >= start + BATCH) return x;
            const localIdx = j - start;
            const err = errors?.find((e) => e.file === chunk[localIdx]?.name);
            return { ...x, status: err ? 'error' : 'done' };
          })
        );
      } catch {
        setUploadProgress((p) =>
          p.map((x, j) =>
            j >= start && j < start + BATCH ? { ...x, status: 'error' } : x
          )
        );
      }
    }

    qc.invalidateQueries(['tracks']);
    qc.invalidateQueries(['folders']);
    setUploading(false);
    setTimeout(() => setUploadProgress([]), 4000);
  };

  // ── Crear carpeta ───────────────────────────────────────────────
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await createFolder(newFolderName.trim());
      qc.invalidateQueries(['folders']);
      setNewFolderName('');
      setShowNewFolder(false);
    } catch {}
  };

  // ── Borrar carpeta ──────────────────────────────────────────────
  const handleDeleteFolder = async (folder) => {
    if (!window.confirm(`¿Eliminar la carpeta "${folder.name}"?\nLos tracks quedarán sin carpeta.`)) return;
    await deleteFolder(folder.id);
    qc.invalidateQueries(['folders']);
    qc.invalidateQueries(['tracks']);
  };

  // ── Borrar track ────────────────────────────────────────────────
  const handleDelete = async (id, title) => {
    if (!window.confirm(`¿Eliminar "${title}"?`)) return;
    await deleteTrack(id);
    qc.invalidateQueries(['tracks']);
    qc.invalidateQueries(['folders']);
  };

  // ── Mover track a carpeta ───────────────────────────────────────
  const handleMove = async (trackId, folderId) => {
    setMovingTrack(trackId);
    try {
      await moveTrack(trackId, folderId);
      qc.invalidateQueries(['tracks']);
      qc.invalidateQueries(['folders']);
    } finally {
      setMovingTrack(null);
    }
  };

  const isLoading = tracksLoading || foldersLoading;

  return (
    <div style={styles.page}>
      {/* ── Header ── */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Tracks</h1>
          <p style={styles.subtitle}>
            {search
              ? `${tracks.length} resultado(s) para "${search}"`
              : currentFolder
              ? `📁 ${currentFolder.name} · ${tracks.length} track(s)`
              : `Biblioteca · ${tracks.length} track(s) sin carpeta`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <input
            placeholder="Buscar tracks…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 200 }}
          />
          <button
            className="btn btn-secondary"
            onClick={() => setShowNewFolder((v) => !v)}
            title="Nueva carpeta"
          >
            📁+
          </button>
          {/* Subir archivos sueltos */}
          <button className="btn btn-secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
            ↑ Archivos
          </button>
          <input ref={fileRef} type="file" accept="audio/*" multiple style={{ display: 'none' }} onChange={handleFileChange} />
          {/* Subir carpeta completa */}
          <button className="btn btn-primary" onClick={() => folderInputRef.current?.click()} disabled={uploading}>
            📂 Carpeta
          </button>
          <input
            ref={folderInputRef}
            type="file"
            accept="audio/*"
            multiple
            webkitdirectory=""
            style={{ display: 'none' }}
            onChange={handleFolderPick}
          />
        </div>
      </div>

      {/* ── Nueva carpeta inline ── */}
      {showNewFolder && (
        <div style={styles.newFolderBar}>
          <input
            placeholder="Nombre de la carpeta…"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
            autoFocus
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary btn-sm" onClick={handleCreateFolder}>Crear</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowNewFolder(false)}>Cancelar</button>
        </div>
      )}

      {/* ── Upload progress ── */}
      {uploadProgress.length > 0 && (
        <div style={styles.uploadProgress}>
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
            Subiendo {uploadProgress.filter((x) => x.status === 'done').length}/{uploadProgress.length}…
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {uploadProgress.map((f, i) => (
              <span key={i} style={{
                fontSize: 10, padding: '2px 6px', borderRadius: 4,
                background: f.status === 'done' ? 'var(--green-dim)' : f.status === 'error' ? 'var(--red-dim)' : 'var(--bg-primary)',
                color: f.status === 'done' ? 'var(--green)' : f.status === 'error' ? 'var(--red)' : 'var(--text-muted)',
                maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {f.status === 'done' ? '✓' : f.status === 'error' ? '✗' : '↑'} {f.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Breadcrumb ── */}
      {!search && (
        <div style={styles.breadcrumb}>
          <button
            style={{ ...styles.breadItem, fontWeight: currentFolder ? 400 : 600 }}
            onClick={() => setCurrentFolder(null)}
          >
            🏠 Raíz
          </button>
          {currentFolder && (
            <>
              <span style={styles.breadSep}>/</span>
              <span style={{ ...styles.breadItem, fontWeight: 600 }}>{currentFolder.name}</span>
            </>
          )}
        </div>
      )}

      {/* ── Contenido principal ── */}
      <div style={styles.body}>
        {/* Panel izquierdo: carpetas */}
        {!search && (
          <div style={styles.sidebar}>
            <div style={styles.sidebarTitle}>Carpetas</div>
            <button
              style={{
                ...styles.folderItem,
                background: !currentFolder ? 'var(--bg-active)' : 'transparent',
                color: !currentFolder ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
              onClick={() => setCurrentFolder(null)}
            >
              <MusicIcon />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>Sin carpeta</span>
            </button>
            {folders.map((folder) => (
              <div key={folder.id} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <button
                  style={{
                    ...styles.folderItem,
                    flex: 1,
                    background: currentFolder?.id === folder.id ? 'var(--bg-active)' : 'transparent',
                    color: currentFolder?.id === folder.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                  }}
                  onClick={() => setCurrentFolder(folder)}
                >
                  <FolderIcon />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}>
                    {folder.name}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                    {folder.track_count}
                  </span>
                </button>
                <button
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, padding: '2px 4px', flexShrink: 0 }}
                  title="Eliminar carpeta"
                  onClick={() => handleDeleteFolder(folder)}
                >×</button>
              </div>
            ))}
            {folders.length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 4px' }}>
                No hay carpetas aún.
              </div>
            )}
          </div>
        )}

        {/* Panel derecho: tabla de tracks */}
        <div style={styles.tableWrapper}>
          {isLoading ? (
            <div className="empty-state"><p>Cargando…</p></div>
          ) : tracks.length === 0 ? (
            <div className="empty-state">
              <MusicIcon />
              <p style={{ marginTop: 8 }}>
                {currentFolder
                  ? 'Esta carpeta está vacía. Sube archivos o mueve tracks aquí.'
                  : 'No hay tracks. Sube archivos de audio para comenzar.'}
              </p>
            </div>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr style={styles.thead}>
                  <th style={{ ...styles.th, width: 36 }}>#</th>
                  <th style={styles.th}>Título</th>
                  <th style={styles.th}>Artista</th>
                  <th style={styles.th}>Álbum</th>
                  {!currentFolder && !search && <th style={styles.th}>Carpeta</th>}
                  {search && <th style={styles.th}>Carpeta</th>}
                  <th style={{ ...styles.th, textAlign: 'right' }}>Duración</th>
                  <th style={{ ...styles.th, width: 80 }}>Mover a</th>
                  <th style={{ ...styles.th, width: 36 }}></th>
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
                    {(!currentFolder || search) && (
                      <td style={{ ...styles.td, color: 'var(--text-secondary)', fontSize: 11 }}>
                        {track.folder_name
                          ? <span style={styles.folderBadge}><FolderIcon />{track.folder_name}</span>
                          : <span style={{ color: 'var(--text-muted)' }}>—</span>
                        }
                      </td>
                    )}
                    <td style={{ ...styles.td, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      {fmtDur(track.duration)}
                    </td>
                    <td style={styles.td}>
                      <select
                        style={styles.moveSelect}
                        value={track.folder_id || ''}
                        disabled={movingTrack === track.id}
                        onChange={(e) => handleMove(track.id, e.target.value || null)}
                      >
                        <option value="">Sin carpeta</option>
                        {folders.map((f) => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                      </select>
                    </td>
                    <td style={styles.td}>
                      <button
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, padding: '2px 6px' }}
                        onClick={() => handleDelete(track.id, track.title)}
                        title="Eliminar"
                      >×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
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
  newFolderBar: {
    display: 'flex', gap: 8, alignItems: 'center',
    padding: '8px 24px',
    background: 'var(--bg-panel)',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  uploadProgress: {
    padding: '8px 24px',
    background: 'var(--bg-panel)',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  breadcrumb: {
    display: 'flex', alignItems: 'center', gap: 4,
    padding: '6px 24px',
    background: 'var(--bg-secondary)',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
    fontSize: 12,
  },
  breadItem: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)', padding: '2px 4px' },
  breadSep: { color: 'var(--text-muted)' },
  body: { display: 'flex', flex: 1, overflow: 'hidden' },
  sidebar: {
    width: 200,
    flexShrink: 0,
    borderRight: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    overflowY: 'auto',
    padding: '12px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  sidebarTitle: {
    fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.08em',
    padding: '0 6px 6px',
  },
  folderItem: {
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '6px 8px', borderRadius: 6,
    border: 'none', cursor: 'pointer', fontSize: 12,
    width: '100%', textAlign: 'left',
    transition: 'background 0.1s',
  },
  folderBadge: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    fontSize: 11, color: 'var(--text-secondary)',
  },
  tableWrapper: { flex: 1, overflowY: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse' },
  thead: { background: 'var(--bg-secondary)', position: 'sticky', top: 0, zIndex: 1 },
  th: {
    padding: '9px 14px', textAlign: 'left',
    fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.06em',
    borderBottom: '1px solid var(--border)',
  },
  tr: { borderBottom: '1px solid var(--border)', transition: 'background 0.1s' },
  td: { padding: '8px 14px', fontSize: 13 },
  moveSelect: {
    fontSize: 11, padding: '2px 4px',
    background: 'var(--bg-primary)', color: 'var(--text-secondary)',
    border: '1px solid var(--border)', borderRadius: 4,
    cursor: 'pointer', maxWidth: 120,
  },
};
