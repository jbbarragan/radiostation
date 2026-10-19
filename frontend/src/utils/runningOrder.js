// Accumulate milliseconds once; do not round each track before summing.
export function runningOrder(items, start) {
  let offset = 0;
  const anchor = start ? new Date(start).getTime() : NaN;
  return items.map(item => {
    const duration = Math.max(0, Number(item.track.duration) || 0);
    const row = { offset, duration, start: anchor + offset * 1000, end: anchor + (offset + duration) * 1000 };
    offset += duration;
    return row;
  });
}
export const STATION_TIME_ZONE = process.env.REACT_APP_STATION_TIME_ZONE || 'America/Mexico_City';
export function clockTime(ms) {
  if (!Number.isFinite(ms)) return '—';
  return new Date(ms).toLocaleTimeString('en-US', { timeZone: STATION_TIME_ZONE, hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
