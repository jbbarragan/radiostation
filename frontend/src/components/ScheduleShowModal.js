import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createShow, getTracks, getPlaylists, addItemToShow, removeItemFromShow } from '../api/client';
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
      // res.data es el show recién creado con su id
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
          <input type="datetime-local" value={startDate}
            onChange={(e) => setStartDate(e.target.value)} style={{ marginTop: 8 }} />
        )}
      </div>

      <div className="form-group">
        <label>Duración (minutos)</label>
        <input type="number" min="1" max="1440" value={duration}
          onChange={(e) => setDuration(Number(e.target.value))} />
      </div>

      <div className="form-group">
        <label>Repetición</label>
        <select value={repeat} onChange={(e) => setRepeat(e.target.value)}>
          <option value="none">Sin repetición</option>
          <option value="daily">Cada día</option>
          <option value="weekly">Semanal</option>
          <option value="monthly">Mensual</option>
          <option value="custom_days">Días específicos de la semana</option>
        </select>
      </div>

      {repeat === 'custom_days' && (
        <div className="form-group">
          <label>Días de la semana</label>
          <div style={s.daysRow}>
            {DAYS.map((d, i) => (
              <button key={d} type="button"
                style={{ ...s.dayBtn, ...(repeatDays.includes(i) ? s.dayBtnActive : {}) }}
                onClick={() => toggleDay(i)}>{d}</button>
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
  const [tab, setTab]     = useState('tracks');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(null);
  // show_items local (se actualiza sin recargar todo)
  const [items, setItems] = useState(show.show_items || []);

  const { data: tracksData } = useQuery({
    queryKey: ['tracks', search],
    queryFn: () => getTracks({ search }),
  });
  const { data: playlistsData } = useQuery({
    queryKey: ['playlists'],
    queryFn: getPlaylists,
  });

  const tracks    = tracksData?.data?.results || tracksData?.data || [];
  const playlists = playlistsData?.data?.results || playlistsData?.data || [];

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
      // El backend puede devolver un array de items o un solo item
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
      {/* Encabezado del show recién creado */}
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

      {/* Tabs agregar contenido */}
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
            <input placeholder="Buscar pistas…" value={search}
              onChange={(e) => setSearch(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
            <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
              {tracks.length === 0
                ? <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>No se encontraron pistas</div>
                : tracks.map((track, i) => (
                  <div key={track.id} style={{ display: 'flex', alignItems: 'center', padding: '7px 10px',
                    borderBottom: i < tracks.length - 1 ? '1px solid var(--border)' : 'none', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap',
                        overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{track.artist || '—'}</div>
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
              }
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
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{pl.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {pl.track_count} pistas · {fmtDur(pl.total_duration)}
                    </div>
                  </div>
                  <button className="btn btn-primary btn-sm"
                    onClick={() => handleAddPlaylist(pl)}
                    disabled={adding === pl.id || fillPct >= 100}>
                    {adding === pl.id ? '…' : '+ Agregar todo'}
                  </button>
                </div>
              ))
            }
          </div>
        )}
      </div>

      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onDone}>
          Omitir y cerrar
        </button>
        <button className="btn btn-primary" onClick={onDone}>
          ✓ Listo
        </button>
      </div>
    </div>
  );
}

// ─── Modal principal ─────────────────────────────────────────────────────────
export default function ScheduleShowModal({ onClose, onSaved, defaultStart }) {
  const [step, setStep] = useState(1);   // 1 = básico, 2 = contenido
  const [createdShow, setCreatedShow] = useState(null);

  const handleCreated = (show) => {
    setCreatedShow(show);
    setStep(2);
  };

  const handleDone = () => {
    onSaved();
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={step === 2 ? { maxWidth: 680, width: '95vw' } : {}}>
        {/* Indicador de paso */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
            {step === 1 ? 'Programar Show' : 'Agregar Contenido'}
          </div>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Paso {step} de 2</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1, 2].map((n) => (
              <div key={n} style={{
                width: 20, height: 4, borderRadius: 2,
                background: n <= step ? 'var(--accent)' : 'var(--border)',
              }} />
            ))}
          </div>
        </div>

        {step === 1 && (
          <StepBasic
            defaultStart={defaultStart}
            onClose={onClose}
            onCreated={handleCreated}
          />
        )}

        {step === 2 && createdShow && (
          <StepContent
            show={createdShow}
            onDone={handleDone}
          />
        )}
      </div>
    </div>
  );
}

// ─── Estilos ─────────────────────────────────────────────────────────────────
const s = {
  error: {
    background: 'var(--red-dim)', color: 'var(--red)',
    border: '1px solid var(--red-dim)', borderRadius: 4,
    padding: '8px 12px', marginBottom: 14, fontSize: 12,
  },
  colorGrid: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  colorSwatch: { width: 24, height: 24, borderRadius: 4, cursor: 'pointer' },
  daysRow: { display: 'flex', gap: 4 },
  dayBtn: {
    padding: '4px 8px', borderRadius: 4, background: 'var(--bg-primary)',
    color: 'var(--text-secondary)', border: '1px solid var(--border-bright)',
    fontSize: 11, cursor: 'pointer',
  },
  dayBtnActive: {
    background: 'var(--accent-dim)', color: 'var(--accent)',
    borderColor: 'var(--accent)',
  },
  sectionLabel: {
    fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8,
  },
};
