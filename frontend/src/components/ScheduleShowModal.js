import React, { useState } from 'react';
import { createShow } from '../api/client';
import { format } from 'date-fns';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function ScheduleShowModal({ onClose, onSaved, defaultStart }) {
  const now = new Date();
  const roundedNow = new Date(Math.ceil(now.getTime() / (30 * 60000)) * (30 * 60000));

  const [title, setTitle] = useState('');
  const [color, setColor] = useState('#4f8ef7');
  const [startNow, setStartNow] = useState(!defaultStart);
  const [startDate, setStartDate] = useState(
    defaultStart
      ? format(new Date(defaultStart), "yyyy-MM-dd'T'HH:mm")
      : format(roundedNow, "yyyy-MM-dd'T'HH:mm")
  );
  const [duration, setDuration] = useState(60); // minutes
  const [repeat, setRepeat] = useState('none');
  const [repeatDays, setRepeatDays] = useState([]);
  const [repeatUntil, setRepeatUntil] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const COLORS = [
    '#E74C3C','#E67E22','#F1C40F','#2ECC71','#1ABC9C',
    '#3498DB','#9B59B6','#E91E63','#FF5722','#00BCD4',
    '#8BC34A','#FF9800','#4f8ef7','#607D8B','#F06292',
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required'); return; }
    setError('');
    setLoading(true);
    try {
      let start;
      if (startNow) {
        start = new Date();
      } else {
        start = new Date(startDate);
      }
      const end = new Date(start.getTime() + duration * 60000);

      await createShow({
        title: title.trim(),
        color,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        repeat,
        repeat_days: repeatDays,
        repeat_until: repeatUntil || null,
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.non_field_errors?.[0] || 'Failed to create show');
    } finally {
      setLoading(false);
    }
  };

  const toggleDay = (d) => {
    setRepeatDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    );
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Schedule Show</div>
        <form onSubmit={handleSubmit}>
          {error && <div style={styles.error}>{error}</div>}

          <div className="form-group">
            <label>Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Show title..."
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>Color</label>
            <div style={styles.colorGrid}>
              {COLORS.map((c) => (
                <div
                  key={c}
                  style={{
                    ...styles.colorSwatch,
                    background: c,
                    outline: color === c ? `2px solid white` : 'none',
                    outlineOffset: 2,
                  }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Start Time</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', textTransform: 'none', letterSpacing: 0 }}>
                <input
                  type="checkbox"
                  checked={startNow}
                  onChange={(e) => setStartNow(e.target.checked)}
                  style={{ width: 'auto' }}
                />
                Start now
              </label>
            </div>
            {!startNow && (
              <input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{ marginTop: 8 }}
              />
            )}
          </div>

          <div className="form-group">
            <label>Duration (minutes)</label>
            <input
              type="number"
              min="1"
              max="1440"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            />
          </div>

          <div className="form-group">
            <label>Repeat</label>
            <select value={repeat} onChange={(e) => setRepeat(e.target.value)}>
              <option value="none">No repeat</option>
              <option value="daily">Every day</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="custom_days">Specific days of week</option>
            </select>
          </div>

          {repeat === 'custom_days' && (
            <div className="form-group">
              <label>Days of week</label>
              <div style={styles.daysRow}>
                {DAYS.map((d, i) => (
                  <button
                    key={d}
                    type="button"
                    style={{
                      ...styles.dayBtn,
                      ...(repeatDays.includes(i) ? styles.dayBtnActive : {}),
                    }}
                    onClick={() => toggleDay(i)}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}

          {repeat !== 'none' && (
            <div className="form-group">
              <label>Repeat until</label>
              <input
                type="date"
                value={repeatUntil}
                onChange={(e) => setRepeatUntil(e.target.value)}
              />
            </div>
          )}

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Scheduling…' : 'Schedule Show'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const styles = {
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
};
