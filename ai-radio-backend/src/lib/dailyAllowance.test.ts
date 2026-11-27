import test from 'node:test';
import assert from 'node:assert/strict';
import { ALLOWANCES, DailyAllowance, TOTAL_DAILY_CENTS, clientKey } from './dailyAllowance';

const make = (env: Record<string, string> = {}, clock = { at: new Date('2026-11-26T10:00:00Z') }) => {
  const reports: string[] = [];
  const a = new DailyAllowance(() => env, () => clock.at, (_flow, _err, c) => { reports.push(`${c?.feature}:${c?.reason}`); });
  return { a, reports, clock };
};

test('per client first, then the feature total; a new UTC day starts again', () => {
  const { a, reports, clock } = make();
  const { perClient, global } = ALLOWANCES.qa;
  for (let i = 0; i < perClient; i++) assert.equal(a.take('qa', 'ip:a').allowed, true);
  assert.deepEqual(a.take('qa', 'ip:a'), { allowed: false, reason: 'client_limit' });
  assert.deepEqual(reports, [], 'one client reaching its own limit raises no report');
  let n = perClient;
  for (let c = 0; n < global; c++) if (a.take('qa', `ip:b${c % 5}`).allowed) n++;
  assert.deepEqual(a.take('qa', 'ip:new'), { allowed: false, reason: 'feature_limit' });
  a.take('qa', 'ip:newer');
  assert.deepEqual(reports, ['qa:feature_limit'], 'reported once');
  clock.at = new Date('2026-11-27T00:00:01Z');
  assert.equal(a.take('qa', 'ip:a').allowed, true);
});

test('the combined estimate covers all features together', () => {
  const { a, reports } = make();
  let spent = 0;
  for (let i = 0; i < ALLOWANCES.deepdive.global; i++) if (a.take('deepdive', `ip:${i}`).allowed) spent += ALLOWANCES.deepdive.cents;
  assert.ok(spent <= TOTAL_DAILY_CENTS);
  assert.equal(spent, TOTAL_DAILY_CENTS);
  assert.deepEqual(a.take('station', 'ip:z'), { allowed: false, reason: 'total_limit' });
  assert.ok(reports.includes('station:total_limit'));
});

test('the busiest day on record fits inside the allowances', () => {
  assert.ok(ALLOWANCES.deepdive.perClient >= 13 && ALLOWANCES.deepdive.global >= 19);
  assert.ok(ALLOWANCES.qa.perClient >= 5 && ALLOWANCES.qa.global >= 7);
  assert.ok(ALLOWANCES.station.perClient >= 6 && ALLOWANCES.station.global >= 6);
});

test('limits can be changed by environment', () => {
  const { a } = make({ ALLOWANCE_STATION_CLIENT: '1' });
  assert.equal(a.take('station', 'ip:a').allowed, true);
  assert.equal(a.take('station', 'ip:a').allowed, false);
  assert.equal(a.take('station', 'ip:b').allowed, true);
});

test('who a count belongs to', () => {
  const key = (ip: string | undefined, user?: string) => clientKey({ ip } as never, user);
  assert.equal(key('203.0.113.7'), 'ip:203.0.113.7');
  assert.equal(key('::ffff:203.0.113.9'), 'ip:203.0.113.9');
  assert.equal(key('2001:db8:1:2::1'), key('2001:db8:1:2:ffff::9'), 'same /64');
  assert.notEqual(key('2001:db8:1:2::1'), key('2001:db8:1:3::1'));
  assert.equal(key(undefined), 'ip:unknown');
  assert.equal(key('203.0.113.7', 'user-1'), 'u:user-1');
});
