import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createShow, getTracks, getPlaylists, addItemToShow, removeItemFromShow, getFolders } from '../api/client';
import { format } from 'date-fns';

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const COLORS = [
  '#E74C3C','#E67E22','#F1C40F','#2ECC71','#1ABC9C',
  '#3498DB','#9B59B6','#E91E63','#FF5722','#00BCD4',
  '#8BC34A','#FF9800','#4f8ef7','#607D8B','#F06292',
];

function fmtDur(sec) {
  if (!sec) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Paso 1: Datos básicos del show ─────────────────────────────────────────
function StepBasic({ onCreated, onClose, defaultStart }) {
  const now = new Date();
  const roundedNow = new Date(Math.ceil(now.getTime() / (30 * 60000)) * (30 * 60000));

  const [title, setTitle]       = useState('');
  const [color, setColor]       = useState('#4f8ef7');
  const [startNow, setStartNow] = useState(!defaultStart);
  const [startDate, setStartDate] = useState(
    defaultStart
      ? format(new Date(defaultStart), "yyyy-MM-dd'T'HH:mm")
      : format(roundedNow, "yyyy-MM-dd'T'HH:mm")
  );
  const [duration, setDuration]     = useState(60);
  const [repeat, setRepeat]         = useState('none');
  const [repeatDays, setRepeatDays] = useState([]);
  const [repeatUntil, setRepeatUntil] = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) { setError('El título es obligatorio'); return; }
    setError('');
    setLoading(true);
    try {
      let start = startNow ? new Date() : new Date(startDate);
      const end = new Date(start.getTime() + duration * 60000);
      const res = await createShow({
        title: title.trim(),
        color,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        repeat,
        repeat_days: repeatDays,
        repeat_until: repeatUntil || null,
      });
      onCreated(res.data);
    } catch (err) {
      setError(err.response?.data?.non_field_errors?.[0] || 'Error al crear el show');
    } finally {
      setLoading(false);
    }
  };

  const toggleDay = (d) =>
    setRepeatDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);

  return (
    <form onSubmit={handleSubmit}>
      {error && <div style={s.error}>{error}</div>}

      <div className="form-group">
        <label>Título</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="Nombre del show…" required autoFocus />
      </div>

      <div className="form-group">
        <label>Color</label>
        <div style={s.colorGrid}>
          {COLORS.map((c) => (
            <div key={c} style={{ ...s.colorSwatch, background: c,
              outline: color === c ? '2px solid white' : 'none', outlineOffset: 2 }}
              onClick={() => setColor(c)} />
          ))}
        </div>
      </div>

      <div className="form-group">
        <label>Hora de inicio</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer',
            textTransform: 'none', letterSpacing: 0 }}>
            <input type="checkbox" checked={startNow} onChange={(e) => setStartNow(e.target.checked)}
              style={{ width: 'auto' }} />
            Iniciar ahora
          </label>
        </div>
        {!startNow && (
          <input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            style={{ marginTop: 6 }} />
        )}
      </div>

      <div className="form-group">
        <label>Duración (minutos)</label>
        <input type="number" min="5" max="480" value={duration}
          onChange={(e) => setDuration(Number(e.target.value))} />
      </div>

      <div className="form-group">
        <label>Repetición</label>
        <select value={repeat} onChange={(e) => setRepeat(e.target.value)}>
          <option value="none">Sin repetición</option>
          <option value="daily">Todos los días</option>
          <option value="weekly">Semanalmente</option>
          <option value="monthly">Mensualmente</option>
          <option value="custom_days">Días específicos</option>
        </select>
      </div>

      {repeat === 'custom_days' && (
        <div className="form-group">
          <label>Días de la semana</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {DAYS.map((d, i) => (
              <button key={i} type="button" style={{
                padding: '4px 8px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                background: repeatDays.includes(i) ? 'var(--accent)' : 'var(--bg-primary)',
                color: repeatDays.includes(i) ? 'white' : 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }} onClick={() => toggleDay(i)}>{d}</button>
            ))}
          </div>
        </div>
      )}

      {repeat !== 'none' && (
        <div className="form-group">
          <label>Repetir hasta</label>
          <input type="date" value={repeatUntil} onChange={(e) => setRepeatUntil(e.target.value)} />
        </div>
      )}

      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Creando…' : 'Siguiente: Agregar contenido →'}
        </button>
      </div>
    </form>
  );
}

// ─── Paso 2: Contenido del show ──────────────────────────────────────────────
function StepContent({ show, onDone }) {
  const [tab, setTab]           = useState('tracks');
  const [search, setSearch]     = useState('');
  const [adding, setAdding]     = useState(null);
  const [items, setItems]       = useState(show.show_items || []);
  // Navegación por carpetas en el picker de tracks
  const [trackView, setTrackView]         = useState('all'); // 'all' | 'folders'
  const [selectedFolder, setSelectedFolder] = useState(null); // { id, name } | null

  // Params de tracks según vista
  const trackParams = (() => {
    if (search) return { search };
    if (trackView === 'folders') {
      if (selectedFolder) return { folder_id: selectedFolder.id };
      return { no_folder: '1' };
    }
    return {};
  })();

  const { data: tracksData } = useQuery({
    queryKey: ['tracks', trackParams],
    queryFn: () => getTracks(trackParams),
  });
  const { data: playlistsData } = useQuery({
    queryKey: ['playlists'],
    queryFn: getPlaylists,
  });
  const { data: foldersData } = useQuery({
    queryKey: ['folders'],
    queryFn: getFolders,
    enabled: tab === 'tracks',
  });

  const tracks    = tracksData?.data?.results || tracksData?.data || [];
  const playlists = playlistsData?.data?.results || playlistsData?.data || [];
  const folders   = foldersData?.data?.results || foldersData?.data || [];

  const totalDur  = show.duration_seconds || ((new Date(show.end_time) - new Date(show.start_time)) / 1000);
  const usedDur   = items.reduce((acc, item) => acc + (item.track?.duration || 0), 0);
  const fillPct   = totalDur > 0 ? Math.min(100, (usedDur / totalDur) * 100) : 0;
  const remaining = totalDur - usedDur;
  const fillColor = fillPct >= 100 ? 'var(--red)' : fillPct > 60 ? 'var(--yellow)' : 'var(--green)';

  const handleAddTrack = async (track) => {
    setAdding(track.id);
    try {
      const res = await addItemToShow(show.id, { track_id: track.id });
      setItems((prev) => [...prev, res.data]);
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo agregar la pista');
    } finally {
      setAdding(null);
    }
  };

  const handleAddPlaylist = async (pl) => {
    setAdding(pl.id);
    try {
      const res = await addItemToShow(show.id, { playlist_id: pl.id });
      const newItems = Array.isArray(res.data) ? res.data : [res.data];
      setItems((prev) => [...prev, ...newItems]);
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo agregar la playlist');
    } finally {
      setAdding(null);
    }
  };

  const handleRemove = async (itemId) => {
    try {
      await removeItemFromShow(show.id, itemId);
      setItems((prev) => prev.filter((i) => i.id !== itemId));
    } catch {}
  };

  return (
    <div>
      {/* Encabezado del show */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
        paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
        <div style={{ width: 12, height: 12, borderRadius: 3, background: show.color, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{show.title}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {format(new Date(show.start_time), 'dd MMM yyyy HH:mm')} →{' '}
            {format(new Date(show.end_time), 'HH:mm')}
            {' · '}{fmtDur(totalDur)} total
          </div>
        </div>
        <span style={{ fontSize: 11, color: 'var(--green)', background: 'var(--green-dim)',
          padding: '2px 8px', borderRadius: 10 }}>✓ Programado</span>
      </div>

      {/* Barra de llenado */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11,
          color: 'var(--text-secondary)', marginBottom: 5 }}>
          <span>Contenido: {fmtDur(usedDur)} / {fmtDur(totalDur)}</span>
          <span style={{ color: fillColor }}>
            {fillPct.toFixed(0)}% lleno · {remaining > 0 ? fmtDur(remaining) + ' disponible' : 'Completo'}
          </span>
        </div>
        <div style={{ height: 6, background: 'var(--bg-primary)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${fillPct}%`, background: fillColor,
            borderRadius: 3, transition: 'width 0.3s' }} />
        </div>
      </div>

      {/* Lista de items ya agregados */}
      {items.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={s.sectionLabel}>Contenido del show ({items.length} pistas)</div>
          <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
            {items.map((item, i) => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', padding: '6px 10px',
                borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none', gap: 8 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 11, width: 18, flexShrink: 0 }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap',
                    overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.track?.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.track?.artist}</div>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{fmtDur(item.track?.duration)}</span>
                <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)',
                  cursor: 'pointer', fontSize: 14, padding: '0 4px' }}
                  onClick={() => handleRemove(item.id)}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ marginBottom: 12 }}>
        <div style={s.sectionLabel}>Agregar contenido</div>
        <div style={{ display: 'flex', gap: 0, marginBottom: 10,
          border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
          {['tracks', 'playlists'].map((t) => (
            <button key={t} className="btn" style={{
              flex: 1, justifyContent: 'center', borderRadius: 0, padding: '7px',
              background: tab === t ? 'var(--bg-active)' : 'var(--bg-panel)',
              color: tab === t ? 'var(--text-primary)' : 'var(--text-muted)',
              borderRight: t === 'tracks' ? '1px solid var(--border)' : 'none', fontSize: 12,
            }} onClick={() => setTab(t)}>
              {t === 'tracks' ? 'Pistas' : 'Playlists'}
            </button>
          ))}
        </div>

        {tab === 'tracks' && (
          <>
            {/* Controles de vista */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
              <input
                placeholder="Buscar pistas…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setTrackView('all'); setSelectedFolder(null); }}
                style={{ flex: 1 }}
              />
              {!search && (
                <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 5, overflow: 'hidden', flexShrink: 0 }}>
                  <button
                    style={{ ...s.viewToggle, background: trackView === 'all' ? 'var(--bg-active)' : 'var(--bg-panel)' }}
                    onClick={() => { setTrackView('all'); setSelectedFolder(null); }}
                    title="Ver todos"
                  >≡ Todos</button>
                  <button
                    style={{ ...s.viewToggle, background: trackView === 'folders' ? 'var(--bg-active)' : 'var(--bg-panel)', borderLeft: '1px solid var(--border)' }}
                    onClick={() => { setTrackView('folders'); setSelectedFolder(null); }}
                    title="Ver por carpetas"
                  >📁 Carpetas</button>
                </div>
              )}
            </div>

            {/* Navegación de carpetas */}
            {trackView === 'folders' && !search && (
              <div style={{ marginBottom: 6 }}>
                {selectedFolder ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
                    <button
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 11, padding: 0 }}
                      onClick={() => setSelectedFolder(null)}
                    >← Carpetas</button>
                    <span>/</span>
                    <span style={{ fontWeight: 600 }}>📁 {selectedFolder.name}</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    <button
                      style={s.folderChip}
                      onClick={() => setSelectedFolder({ id: '__none__', name: 'Sin carpeta' })}
                    >
                      🎵 Sin carpeta
                    </button>
                    {folders.map((f) => (
                      <button key={f.id} style={s.folderChip} onClick={() => setSelectedFolder(f)}>
                        📁 {f.name} <span style={{ opacity: 0.6, fontSize: 10 }}>({f.track_count})</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Lista de tracks */}
            <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
              {/* Si estamos en vista carpetas y no hay carpeta seleccionada, mostrar mensaje */}
              {trackView === 'folders' && !search && !selectedFolder ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                  Selecciona una carpeta arriba
                </div>
              ) : tracks.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                  No se encontraron pistas
                </div>
              ) : (
                tracks.map((track, i) => (
                  <div key={track.id} style={{ display: 'flex', alignItems: 'center', padding: '7px 10px',
                    borderBottom: i < tracks.length - 1 ? '1px solid var(--border)' : 'none', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap',
                        overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {track.artist || '—'}
                        {track.folder_name && trackView === 'all' && !search && (
                          <span style={{ marginLeft: 6, opacity: 0.6 }}>· 📁 {track.folder_name}</span>
                        )}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)',
                      fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{fmtDur(track.duration)}</span>
                    <button className="btn btn-primary btn-sm"
                      onClick={() => handleAddTrack(track)}
                      disabled={adding === track.id || fillPct >= 100}>
                      {adding === track.id ? '…' : '+'}
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {tab === 'playlists' && (
          <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
            {playlists.length === 0
              ? <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>No hay playlists</div>
              : playlists.map((pl, i) => (
                <div key={pl.id} style={{ display: 'flex', alignItems: 'center', padding: '8px 10px',
                  borderBottom: i < playlists.length - 1 ? '1px solid var(--border)' : 'none', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{pl.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {pl.track_count} pistas · {fmtDur(pl.total_duration)}
                    </div>
                  </div>
                  <button className="btn btn-primary btn-sm"
                    onClick={() => handleAddPlaylist(pl)}
                    disabled={adding === pl.id}>
                    {adding === pl.id ? '…' : '+ Todo'}
                  </button>
                </div>
              ))
            }
          </div>
        )}
      </div>

      <div className="modal-footer">
        <button className="btn btn-primary" onClick={onDone}>Listo ✓</button>
      </div>
    </div>
  );
}

// ─── Modal principal ─────────────────────────────────────────────────────────
export default function ScheduleShowModal({ onClose, defaultStart, onCreated: onCreatedExternal }) {
  const [step, setStep]   = useState(1);
  const [show, setShow]   = useState(null);

  const handleCreated = (newShow) => {
    setShow(newShow);
    setStep(2);
  };

  const handleDone = () => {
    if (onCreatedExternal) onCreatedExternal(show);
    onClose();
  };

  return (
    <div style={s.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={s.modal}>
        {/* Pasos */}
        <div style={s.stepBar}>
          {[1, 2].map((n) => (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 11, fontWeight: 700,
                background: step >= n ? 'var(--accent)' : 'var(--bg-primary)',
                color: step >= n ? 'white' : 'var(--text-muted)',
              }}>{n}</div>
              <span style={{ fontSize: 12, color: step >= n ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: step === n ? 600 : 400 }}>
                {n === 1 ? 'Configurar show' : 'Agregar contenido'}
              </span>
              {n < 2 && <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>→</span>}
            </div>
          ))}
        </div>

        <div style={s.body}>
          {step === 1 && <StepBasic onCreated={handleCreated} onClose={onClose} defaultStart={defaultStart} />}
          {step === 2 && show && <StepContent show={show} onDone={handleDone} />}
        </div>
      </div>
    </div>
  );
}

const s = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, padding: 16,
  },
  modal: {
    background: 'var(--bg-secondary)',
    borderRadius: 12,
    width: '100%', maxWidth: 560,
    maxHeight: '90vh',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
    overflow: 'hidden',
  },
  stepBar: {
    display: 'flex', alignItems: 'center', gap: 16,
    padding: '14px 20px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  body: { overflowY: 'auto', padding: 20, flex: 1 },
  sectionLabel: {
    fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6,
  },
  colorGrid: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  colorSwatch: { width: 22, height: 22, borderRadius: 5, cursor: 'pointer' },
  error: {
    background: 'var(--red-dim)', color: 'var(--red)',
    borderRadius: 6, padding: '8px 12px', fontSize: 12, marginBottom: 12,
  },
  viewToggle: {
    fontSize: 11, padding: '4px 8px', border: 'none', cursor: 'pointer',
    color: 'var(--text-secondary)',
  },
  folderChip: {
    fontSize: 11, padding: '3px 9px', borderRadius: 12,
    background: 'var(--bg-primary)', border: '1px solid var(--border)',
    color: 'var(--text-secondary)', cursor: 'pointer',
  },
};
