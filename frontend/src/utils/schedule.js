export function movedShowTimes(show, start) {
  const duration = new Date(show.end_time).getTime() - new Date(show.start_time).getTime();
  const end = new Date(start.getTime() + duration);
  return { start_time: start.toISOString(), end_time: end.toISOString() };
}
