import { movedShowTimes } from './schedule';
it('moves a show across midnight while preserving its exact duration',()=>{
  expect(movedShowTimes({start_time:'2026-09-28T23:30:00-06:00',end_time:'2026-09-29T01:00:00-06:00'},new Date('2026-10-02T23:45:00-06:00')))
    .toEqual({start_time:'2026-10-03T05:45:00.000Z',end_time:'2026-10-03T07:15:00.000Z'});
});
