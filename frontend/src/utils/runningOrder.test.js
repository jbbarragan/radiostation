import {runningOrder, clockTime} from './runningOrder';
it('accumulates fractional durations without rounding drift across midnight', () => {
  const start='2026-10-18T23:59:50-06:00';
  const rows=runningOrder([{track:{duration:10.25}},{track:{duration:30.5}}],start);
  expect(rows[1].offset).toBe(10.25);
  expect(rows[1].end-new Date(start).getTime()).toBe(40750);
});
it('does not propagate invalid durations',()=>{
  expect(runningOrder([{track:{}},{track:{duration:12}}],null)[1].offset).toBe(0);
});

it('shows literal station clock times: 3:15 PM plus two minutes is 3:17 PM',()=>{
  const rows=runningOrder([{track:{duration:120}},{track:{duration:180}}], '2026-10-18T15:15:00-06:00');
  expect(clockTime(rows[0].start)).toBe('03:15:00 PM');
  expect(clockTime(rows[1].start)).toBe('03:17:00 PM');
});
it('shows the clock after midnight, independently of the browser timezone',()=>{
  const rows=runningOrder([{track:{duration:120}},{track:{duration:60}}], '2026-10-18T23:59:00-06:00');
  expect(clockTime(rows[1].start)).toBe('12:01:00 AM');
});
