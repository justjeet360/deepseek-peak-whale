import test from 'node:test';
import assert from 'node:assert/strict';
import {
  currentRate,
  formatRemaining,
  formatWallet,
  isPeak,
  nextTransition,
} from '../src/pricing.js';

const at = (iso) => new Date(iso);

test('peak windows follow Beijing weekdays', () => {
  assert.equal(isPeak(at('2026-11-19T00:59:00Z')), false, '08:59 Beijing');
  assert.equal(isPeak(at('2026-11-19T01:00:00Z')), true, '09:00 Beijing');
  assert.equal(isPeak(at('2026-11-19T03:59:00Z')), true, '11:59 Beijing');
  assert.equal(isPeak(at('2026-11-19T04:00:00Z')), false, '12:00 Beijing');
  assert.equal(isPeak(at('2026-11-19T06:00:00Z')), true, '14:00 Beijing');
  assert.equal(isPeak(at('2026-11-19T10:00:00Z')), false, '18:00 Beijing');
});

test('weekends and public holidays are off-peak', () => {
  assert.equal(isPeak(at('2026-11-21T02:00:00Z')), false, 'Saturday');
  assert.equal(isPeak(at('2026-10-01T02:00:00Z')), false, 'National Day');
  assert.equal(isPeak(at('2026-10-08T02:00:00Z')), true, 'day after National Day');
});

test('next transition skips the weekend', () => {
  const next = nextTransition(at('2026-11-20T10:30:00Z'));
  assert.equal(next.nextPeak, true);
  assert.equal(next.at.toISOString(), '2026-11-23T01:00:00.000Z');
  assert.equal(formatRemaining(next.at.getTime() - at('2026-11-20T10:30:00Z').getTime()), '2d 14h');
});

test('next transition ends a peak window', () => {
  const next = nextTransition(at('2026-11-19T03:00:00Z'));
  assert.equal(next.nextPeak, false);
  assert.equal(next.at.toISOString(), '2026-11-19T04:00:00.000Z');
});

test('a custom holiday calendar overrides the default', () => {
  const holidays = [['2026-11-19', '2026-11-19']];
  assert.equal(isPeak(at('2026-11-19T02:00:00Z'), { holidays }), false);
  const next = nextTransition(at('2026-11-19T02:00:00Z'), { holidays });
  assert.equal(next.at.toISOString(), '2026-11-20T01:00:00.000Z');
});

test('currentRate reports the countdown and next state', () => {
  const snapshot = currentRate(at('2026-11-19T03:00:00Z'));
  assert.equal(snapshot.peak, true);
  assert.equal(snapshot.remainingMs, 60 * 60 * 1000);
  assert.equal(snapshot.at.toISOString(), '2026-11-19T04:00:00.000Z');
});

test('durations are compact and deterministic', () => {
  assert.equal(formatRemaining(0), '0s');
  assert.equal(formatRemaining(1_000), '1s');
  assert.equal(formatRemaining(65_000), '1m 05s');
  assert.equal(formatRemaining(3_600_000), '1h 0m');
  assert.equal(formatRemaining(90_000_000), '1d 1h');
});

test('wallets use the Platform display rules', () => {
  assert.equal(formatWallet({ currency: 'USD', balance: '1.95' }), '$1.95');
  assert.equal(formatWallet({ currency: 'CNY', balance: '0' }), '¥0.00');
  assert.equal(formatWallet({ currency: 'CNY', balance: '0.005' }), '<¥0.01');
  assert.equal(formatWallet({ currency: 'USD', balance: '-0.005' }), '-$0.01');
  assert.equal(formatWallet({ currency: 'USD', balance: '1234.5' }), '$1,234.50');
});

test('invalid dates fail loudly', () => {
  assert.throws(() => isPeak(new Date('nope')), TypeError);
});
