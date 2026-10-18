import ContentEditor from './ContentEditor';
import React, { useState } from 'react';
import { createShow } from '../api/client';
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
          <label>Repetir hasta (vacío = indefinidamente)</label>
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
  const [current, setCurrent] = useState(show);
  return <div><h3>{show.title}</h3>
    <ContentEditor kind="shows" value={current} onChanged={setCurrent} />
    <div className="modal-footer"><button className="btn btn-primary" onClick={onDone}>Listo ✓</button></div>
  </div>;
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
    window.dispatchEvent(new Event('show-scheduled'));
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
    width: '100%', maxWidth: 1080,
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
