import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  format, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  addDays, addWeeks, addMonths, subDays, subWeeks, subMonths,
  isSameDay, isToday, parseISO, differenceInMinutes, startOfDay,
} from 'date-fns';
import { getShows, getSettings } from '../api/client';
import ShowDetailModal from '../components/ShowDetailModal';
import ScheduleShowModal from '../components/ScheduleShowModal';

const VIEW_MODES = ['Day', 'Week', 'Month'];

function fmtTime(date) {
  return format(date, 'HH:mm');
}

export default function CalendarPage() {
  const [viewMode, setViewMode] = useState('Week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedShow, setSelectedShow] = useState(null);
  const [scheduleModal, setScheduleModal] = useState(null); // default start for new show
  const [slotMinutes, setSlotMinutes] = useState(30);
  const qc = useQueryClient();
  const scrollRef = useRef(null);

  // Load settings for slot size
  useEffect(() => {
    getSettings().then((res) => {
      if (res.data?.slot_minutes) setSlotMinutes(Number(res.data.slot_minutes));
    }).catch(() => {});
  }, []);

  // Listen for schedule event from sidebar
  useEffect(() => {
    const handler = () => qc.invalidateQueries(['shows']);
    window.addEventListener('show-scheduled', handler);
    return () => window.removeEventListener('show-scheduled', handler);
  }, [qc]);

  // Compute date range for query
  const { rangeStart, rangeEnd, days } = useRange(viewMode, currentDate);

  const { data, isLoading } = useQuery({
    queryKey: ['shows', rangeStart.toISOString(), rangeEnd.toISOString()],
    queryFn: () => getShows({ start: rangeStart.toISOString(), end: rangeEnd.toISOString() }),
    refetchInterval: 30000,
  });

  const shows = data?.data?.results || data?.data || [];

  // Scroll to current time on mount
  useEffect(() => {
    if (scrollRef.current && (viewMode === 'Day' || viewMode === 'Week')) {
      const now = new Date();
      const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes();
      const slotHeight = 40;
      const slotsPerHour = 60 / slotMinutes;
      const scrollTop = (minutesSinceMidnight / slotMinutes) * slotHeight - 200;
      scrollRef.current.scrollTop = Math.max(0, scrollTop);
    }
  }, [viewMode, slotMinutes]);

  const navigate = (dir) => {
    if (viewMode === 'Day') setCurrentDate((d) => dir > 0 ? addDays(d, 1) : subDays(d, 1));
    if (viewMode === 'Week') setCurrentDate((d) => dir > 0 ? addWeeks(d, 1) : subWeeks(d, 1));
    if (viewMode === 'Month') setCurrentDate((d) => dir > 0 ? addMonths(d, 1) : subMonths(d, 1));
  };

  const handleShowClick = (show) => setSelectedShow(show);

  const handleShowChanged = async () => {
    await qc.invalidateQueries(['shows']);
    const updated = shows.find((s) => s.id === selectedShow?.id);
    if (updated) setSelectedShow(updated);
    else {
      const res = await getShows({ start: rangeStart.toISOString(), end: rangeEnd.toISOString() });
      const fresh = (res.data?.results || res.data || []).find((s) => s.id === selectedShow?.id);
      setSelectedShow(fresh || null);
    }
  };

  const slotsPerDay = (24 * 60) / slotMinutes;
  const slotHeight = 40;

  return (
    <div style={styles.page}>
      {/* Toolbar */}
      <div style={styles.toolbar}>
        <div style={styles.toolbarLeft}>
          <button className="btn btn-secondary btn-sm" onClick={() => setCurrentDate(new Date())}>Today</button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(-1)}>‹</button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(1)}>›</button>
          <span style={styles.dateLabel}>{getDateLabel(viewMode, currentDate)}</span>
        </div>
        <div style={styles.toolbarRight}>
          <div style={styles.slotControl}>
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Slot:</span>
            <select
              value={slotMinutes}
              onChange={(e) => setSlotMinutes(Number(e.target.value))}
              style={{ width: 80, padding: '4px 6px', fontSize: 11 }}
            >
              {[15, 20, 30, 60].map((m) => (
                <option key={m} value={m}>{m} min</option>
              ))}
            </select>
          </div>
          <div style={styles.viewToggle}>
            {VIEW_MODES.map((m) => (
              <button
                key={m}
                className="btn btn-sm"
                style={{
                  background: viewMode === m ? 'var(--accent)' : 'var(--bg-active)',
                  color: viewMode === m ? '#fff' : 'var(--text-secondary)',
                  borderRadius: 0,
                  borderRight: m !== 'Month' ? '1px solid var(--border)' : 'none',
                }}
                onClick={() => setViewMode(m)}
              >
                {m}
              </button>
            ))}
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setScheduleModal(new Date())}
          >
            + New Show
          </button>
        </div>
      </div>

      {/* Calendar body */}
      {isLoading ? (
        <div style={styles.loading}>Loading schedule…</div>
      ) : viewMode === 'Month' ? (
        <MonthView days={days} shows={shows} currentDate={currentDate} onShowClick={handleShowClick} onDayClick={(d) => { setCurrentDate(d); setViewMode('Day'); }} />
      ) : (
        <TimeGrid
          ref={scrollRef}
          days={days}
          shows={shows}
          slotMinutes={slotMinutes}
          slotsPerDay={slotsPerDay}
          slotHeight={slotHeight}
          onShowClick={handleShowClick}
          onSlotClick={(d) => setScheduleModal(d)}
        />
      )}

      {selectedShow && (
        <ShowDetailModal
          show={selectedShow}
          onClose={() => setSelectedShow(null)}
          onChanged={handleShowChanged}
        />
      )}

      {scheduleModal && (
        <ScheduleShowModal
          defaultStart={scheduleModal}
          onClose={() => setScheduleModal(null)}
          onSaved={() => {
            setScheduleModal(null);
            qc.invalidateQueries(['shows']);
          }}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Time Grid (Day / Week)
// ────────────────────────────────────────────────────────────
const TimeGrid = React.forwardRef(function TimeGrid(
  { days, shows, slotMinutes, slotsPerDay, slotHeight, onShowClick, onSlotClick },
  ref
) {
  const [nowLine, setNowLine] = useState(getNowOffset(slotMinutes, slotHeight));
  useEffect(() => {
    const t = setInterval(() => setNowLine(getNowOffset(slotMinutes, slotHeight)), 60000);
    return () => clearInterval(t);
  }, [slotMinutes, slotHeight]);

  const totalHeight = slotsPerDay * slotHeight;

  return (
    <div style={styles.gridWrapper}>
      {/* Day headers */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', position: 'sticky', top: 0, zIndex: 5 }}>
        <div style={styles.timeGutter} />
        {days.map((day) => (
          <div
            key={day.toISOString()}
            style={{
              ...styles.dayHeader,
              background: isToday(day) ? 'var(--accent-glow)' : 'transparent',
              color: isToday(day) ? 'var(--accent)' : 'var(--text-secondary)',
              flex: 1,
            }}
          >
            <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {format(day, 'EEE')}
            </span>
            <span style={{ fontSize: 18, fontWeight: isToday(day) ? 700 : 400, lineHeight: 1.1 }}>
              {format(day, 'd')}
            </span>
          </div>
        ))}
      </div>

      {/* Scrollable time body */}
      <div ref={ref} style={styles.scrollBody}>
        <div style={{ display: 'flex', position: 'relative', height: totalHeight }}>
          {/* Time gutter */}
          <div style={{ ...styles.timeGutter, position: 'relative' }}>
            {Array.from({ length: 24 }, (_, h) => (
              <div
                key={h}
                style={{
                  position: 'absolute',
                  top: (h * 60 / slotMinutes) * slotHeight,
                  right: 8,
                  fontSize: 10,
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                  lineHeight: 1,
                  transform: 'translateY(-50%)',
                }}
              >
                {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day) => (
            <DayColumn
              key={day.toISOString()}
              day={day}
              shows={shows.filter((s) => {
                const showStart = parseISO(s.start_time);
                const showEnd = parseISO(s.end_time);
                const dayStart = startOfDay(day);
                const dayEnd = addDays(dayStart, 1);
                // Show overlaps this day if it starts before end of day AND ends after start of day
                return showStart < dayEnd && showEnd > dayStart;
              })}
              slotMinutes={slotMinutes}
              slotHeight={slotHeight}
              slotsPerDay={slotsPerDay}
              totalHeight={totalHeight}
              nowLine={isToday(day) ? nowLine : null}
              onShowClick={onShowClick}
              onSlotClick={onSlotClick}
            />
          ))}
        </div>
      </div>
    </div>
  );
});

function DayColumn({ day, shows, slotMinutes, slotHeight, slotsPerDay, totalHeight, nowLine, onShowClick, onSlotClick }) {
  const slots = Array.from({ length: slotsPerDay }, (_, i) => i);

  const showsForDay = shows.map((show) => {
    const start = parseISO(show.start_time);
    const end = parseISO(show.end_time);
    const dayStart = startOfDay(day);
    const clampedStart = start < dayStart ? dayStart : start;
    const clampedEnd = end > addDays(dayStart, 1) ? addDays(dayStart, 1) : end;
    const topMins = differenceInMinutes(clampedStart, dayStart);
    const durMins = differenceInMinutes(clampedEnd, clampedStart);
    const top = (topMins / slotMinutes) * slotHeight;
    const height = Math.max((durMins / slotMinutes) * slotHeight, slotHeight * 0.5);
    return { ...show, top, height };
  });

  return (
    <div style={{ flex: 1, position: 'relative', borderRight: '1px solid var(--border)' }}>
      {/* Slot grid lines */}
      {slots.map((i) => {
        const h = Math.floor((i * slotMinutes) / 60);
        const m = (i * slotMinutes) % 60;
        const isHour = m === 0;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: i * slotHeight,
              left: 0, right: 0,
              height: slotHeight,
              borderTop: `1px solid ${isHour ? 'var(--border-bright)' : 'var(--border)'}`,
              cursor: 'pointer',
            }}
            onClick={() => {
              const slotDate = new Date(day);
              slotDate.setHours(h, m, 0, 0);
              onSlotClick(slotDate);
            }}
          />
        );
      })}

      {/* Empty slot fill */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'repeating-linear-gradient(to bottom, transparent 0px, transparent calc(var(--slot-h) - 1px), var(--border) calc(var(--slot-h) - 1px), var(--border) var(--slot-h))',
      }} />

      {/* Show blocks */}
      {showsForDay.map((show) => (
        <ShowBlock key={show.id} show={show} onShowClick={onShowClick} />
      ))}

      {/* Now line */}
      {nowLine !== null && (
        <div style={{
          position: 'absolute', left: 0, right: 0, top: nowLine,
          height: 2, background: 'var(--red)', zIndex: 4,
          boxShadow: '0 0 6px var(--red)',
        }}>
          <div style={{
            position: 'absolute', left: -4, top: -4,
            width: 10, height: 10, borderRadius: '50%',
            background: 'var(--red)',
          }} />
        </div>
      )}
    </div>
  );
}

function ShowBlock({ show, onShowClick }) {
  const hasContent = show.content_duration > 0;
  const fillPct = show.fill_percentage || 0;
  return (
    <div
      style={{
        position: 'absolute',
        top: show.top + 1,
        left: 2, right: 2,
        height: Math.max(show.height - 2, 12),
        background: show.color,
        opacity: 0.92,
        borderRadius: 4,
        padding: '3px 6px',
        cursor: 'pointer',
        overflow: 'hidden',
        zIndex: 2,
        boxShadow: show.is_live ? `0 0 8px ${show.color}` : `0 1px 3px rgba(0,0,0,0.4)`,
        border: show.is_live ? '2px solid #fff' : 'none',
        transition: 'opacity 0.1s',
      }}
      onClick={() => onShowClick(show)}
      title={show.title}
    >
      <div style={{ fontSize: 10, fontWeight: 600, color: '#fff', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {show.is_live && <span style={{ marginRight: 3 }}>●</span>}
        {show.title}
      </div>
      {show.height > 28 && (
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.8)', marginTop: 1 }}>
          {format(parseISO(show.start_time), 'HH:mm')}–{format(parseISO(show.end_time), 'HH:mm')}
        </div>
      )}
      {show.height > 40 && fillPct > 0 && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, height: 3, width: `${fillPct}%`, background: 'rgba(255,255,255,0.6)', borderRadius: '0 0 4px 4px' }} />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Month View
// ────────────────────────────────────────────────────────────
function MonthView({ days, shows, currentDate, onShowClick, onDayClick }) {
  // days = all days in the month grid (may include prev/next month padding)
  return (
    <div style={styles.monthWrapper}>
      {/* Weekday headers */}
      <div style={styles.monthHeader}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} style={styles.monthHeaderCell}>{d}</div>
        ))}
      </div>
      {/* Weeks */}
      <div style={styles.monthGrid}>
        {days.map((day) => {
          const dayShows = shows.filter((s) => {
            const showStart = parseISO(s.start_time);
            const showEnd = parseISO(s.end_time);
            const dayStart = startOfDay(day);
            const dayEnd = addDays(dayStart, 1);
            return showStart < dayEnd && showEnd > dayStart;
          });
          const isCurrentMonth = day.getMonth() === currentDate.getMonth();
          return (
            <div
              key={day.toISOString()}
              style={{
                ...styles.monthCell,
                background: isToday(day) ? 'var(--accent-glow)' : isCurrentMonth ? 'var(--bg-panel)' : 'var(--bg-secondary)',
                cursor: 'pointer',
              }}
              onClick={() => onDayClick(day)}
            >
              <div style={{
                fontSize: 12,
                fontWeight: isToday(day) ? 700 : 400,
                color: isToday(day) ? 'var(--accent)' : isCurrentMonth ? 'var(--text-primary)' : 'var(--text-muted)',
                marginBottom: 4,
              }}>
                {format(day, 'd')}
              </div>
              {dayShows.slice(0, 3).map((show) => (
                <div
                  key={show.id}
                  style={{
                    background: show.color,
                    borderRadius: 3,
                    padding: '2px 5px',
                    fontSize: 10,
                    color: '#fff',
                    marginBottom: 2,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    cursor: 'pointer',
                  }}
                  onClick={(e) => { e.stopPropagation(); onShowClick(show); }}
                >
                  {show.title}
                </div>
              ))}
              {dayShows.length > 3 && (
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>+{dayShows.length - 3} more</div>
              )}
              {dayShows.length === 0 && (
                <div style={{ flex: 1, background: 'var(--bg-secondary)', borderRadius: 3, minHeight: 20, opacity: 0.4 }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────
function useRange(viewMode, currentDate) {
  if (viewMode === 'Day') {
    return { rangeStart: startOfDay(currentDate), rangeEnd: addDays(startOfDay(currentDate), 1), days: [currentDate] };
  }
  if (viewMode === 'Week') {
    const start = startOfWeek(currentDate, { weekStartsOn: 0 });
    const end = endOfWeek(currentDate, { weekStartsOn: 0 });
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    return { rangeStart: start, rangeEnd: end, days };
  }
  // Month
  const start = startOfMonth(currentDate);
  const end = endOfMonth(currentDate);
  // Pad to full weeks
  const gridStart = startOfWeek(start, { weekStartsOn: 0 });
  const gridEnd = addDays(endOfWeek(end, { weekStartsOn: 0 }), 1);
  const days = [];
  let d = gridStart;
  while (d < gridEnd) { days.push(d); d = addDays(d, 1); }
  return { rangeStart: gridStart, rangeEnd: gridEnd, days };
}

function getDateLabel(viewMode, date) {
  if (viewMode === 'Day') return format(date, 'EEEE, MMMM d, yyyy');
  if (viewMode === 'Week') {
    const s = startOfWeek(date, { weekStartsOn: 0 });
    const e = endOfWeek(date, { weekStartsOn: 0 });
    return `${format(s, 'MMM d')} – ${format(e, 'MMM d, yyyy')}`;
  }
  return format(date, 'MMMM yyyy');
}

function getNowOffset(slotMinutes, slotHeight) {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  return (mins / slotMinutes) * slotHeight;
}

const styles = {
  page: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  toolbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 16px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    flexShrink: 0,
    gap: 12,
  },
  toolbarLeft: { display: 'flex', alignItems: 'center', gap: 6 },
  toolbarRight: { display: 'flex', alignItems: 'center', gap: 8 },
  dateLabel: { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginLeft: 6 },
  slotControl: { display: 'flex', alignItems: 'center', gap: 6 },
  viewToggle: { display: 'flex', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' },
  loading: { display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-muted)' },
  gridWrapper: { display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' },
  timeGutter: { width: 50, flexShrink: 0, borderRight: '1px solid var(--border)', position: 'relative' },
  dayHeader: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '6px 0', borderRight: '1px solid var(--border)', gap: 1,
  },
  scrollBody: { flex: 1, overflowY: 'auto', overflowX: 'hidden' },
  monthWrapper: { flex: 1, overflow: 'auto', padding: 0 },
  monthHeader: {
    display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
    background: 'var(--bg-secondary)',
    borderBottom: '1px solid var(--border)',
    position: 'sticky', top: 0, zIndex: 2,
  },
  monthHeaderCell: {
    padding: '8px', textAlign: 'center',
    fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.06em',
    borderRight: '1px solid var(--border)',
  },
  monthGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' },
  monthCell: {
    minHeight: 110, padding: '6px 8px',
    borderRight: '1px solid var(--border)',
    borderBottom: '1px solid var(--border)',
    display: 'flex', flexDirection: 'column',
    transition: 'background 0.1s',
  },
};
