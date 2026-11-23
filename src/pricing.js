/**
 * Framework-free DeepSeek rate schedule.
 *
 * DeepSeek bills peak rates Monday-Friday, 09:00-12:00 and 14:00-18:00
 * Beijing time (01:00-04:00 and 06:00-10:00 UTC), excluding Chinese public
 * holidays. Every other hour is off-peak. This module has no network, DSH,
 * React, or credential dependencies, so it can be used on its own.
 */

/** Milliseconds in China Standard Time (UTC+8). China has no daylight saving. */
export const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Peak windows as minutes after midnight in Beijing. */
export const PEAK_WINDOWS = Object.freeze([
  Object.freeze([9 * 60, 12 * 60]),
  Object.freeze([14 * 60, 18 * 60]),
]);

/** Default colors used by the Harness adapter. */
export const RATE_COLORS = Object.freeze({
  peak: '#E5484D',
  offPeak: '#4D6BFE',
});

/**
 * Chinese public-holiday dates used by DeepSeek's billing calendar, inclusive.
 * Keep this current when a new State Council calendar is published.
 */
export const DEFAULT_CHINA_HOLIDAYS = Object.freeze([
  Object.freeze(['2026-01-01', '2026-01-03']),
  Object.freeze(['2026-02-15', '2026-02-23']),
  Object.freeze(['2026-04-04', '2026-04-06']),
  Object.freeze(['2026-05-01', '2026-05-05']),
  Object.freeze(['2026-06-19', '2026-06-21']),
  Object.freeze(['2026-09-25', '2026-09-27']),
  Object.freeze(['2026-10-01', '2026-10-07']),
  Object.freeze(['2027-01-01', '2027-01-03']),
  Object.freeze(['2027-02-05', '2027-02-13']),
  Object.freeze(['2027-04-03', '2027-04-05']),
  Object.freeze(['2027-05-01', '2027-05-05']),
  Object.freeze(['2027-06-09', '2027-06-09']),
  Object.freeze(['2027-09-15', '2027-09-15']),
  Object.freeze(['2027-10-01', '2027-10-07']),
]);

/**
 * Reject invalid dates early instead of producing NaN durations.
 * @param {Date} now - Instant to validate.
 */
function assertDate(now) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError('Expected a valid Date');
  }
}

/**
 * Read Beijing calendar fields for an instant.
 * @param {Date} [now] - Current instant.
 * @returns {{day: number, minutes: number, date: string, shifted: Date}} Weekday, minute of day, and ISO date in Beijing.
 */
export function beijingParts(now = new Date()) {
  assertDate(now);
  const shifted = new Date(now.getTime() + BEIJING_OFFSET_MS);
  return {
    day: shifted.getUTCDay(),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    date: shifted.toISOString().slice(0, 10),
    shifted,
  };
}

/**
 * Test whether a Beijing date is inside a holiday range.
 * @param {string} date - ISO date in Beijing.
 * @param {readonly (readonly [string, string])[]} [holidays] - Inclusive ISO date ranges.
 * @returns {boolean} Whether the date is a public holiday.
 */
export function isPublicHoliday(date, holidays = DEFAULT_CHINA_HOLIDAYS) {
  return holidays.some(([start, end]) => date >= start && date <= end);
}

/**
 * Decide whether DeepSeek is charging its peak rate.
 * @param {Date} [now] - Current instant.
 * @param {{holidays?: readonly (readonly [string, string])[]}} [options] - Calendar override.
 * @returns {boolean} True during a weekday peak window outside holidays.
 */
export function isPeak(now = new Date(), options = {}) {
  const holidays = options.holidays ?? DEFAULT_CHINA_HOLIDAYS;
  const { day, minutes, date } = beijingParts(now);
  if (day === 0 || day === 6 || isPublicHoliday(date, holidays)) return false;
  return PEAK_WINDOWS.some(([start, end]) => minutes >= start && minutes < end);
}

/**
 * Find the next instant when the billed rate changes.
 * @param {Date} [now] - Current instant.
 * @param {{holidays?: readonly (readonly [string, string])[]}} [options] - Calendar override.
 * @returns {{at: Date, nextPeak: boolean}} The next boundary and the state it starts.
 */
export function nextTransition(now = new Date(), options = {}) {
  const peak = isPeak(now, options);
  const holidays = options.holidays ?? DEFAULT_CHINA_HOLIDAYS;
  const { shifted } = beijingParts(now);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const day = shifted.getUTCDate();
  for (let offset = 0; offset < 21; offset += 1) {
    const date = new Date(Date.UTC(year, month, day + offset));
    const dateKey = date.toISOString().slice(0, 10);
    if (date.getUTCDay() === 0 || date.getUTCDay() === 6) continue;
    if (isPublicHoliday(dateKey, holidays)) continue;
    const candidates = peak ? [12, 18] : [9, 14];
    for (const hour of candidates) {
      const at = Date.UTC(
        date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour, 0,
      ) - BEIJING_OFFSET_MS;
      if (at > now.getTime() + 500) return { at: new Date(at), nextPeak: !peak };
    }
  }
  // A 21-day scan always finds a weekday; keep callers well-formed if the
  // calendar input is pathological.
  return { at: new Date(now.getTime() + 60 * 60 * 1000), nextPeak: !peak };
}

/**
 * Describe the current rate and the time until it changes.
 * @param {Date} [now] - Current instant.
 * @param {{holidays?: readonly (readonly [string, string])[]}} [options] - Calendar override.
 * @returns {{peak: boolean, at: Date, remainingMs: number}} Rate snapshot.
 */
export function currentRate(now = new Date(), options = {}) {
  const peak = isPeak(now, options);
  const next = nextTransition(now, options);
  return { peak, at: next.at, remainingMs: Math.max(0, next.at.getTime() - now.getTime()) };
}

/**
 * Format a remaining duration with only the two most useful units.
 * @param {number} milliseconds - Remaining duration.
 * @returns {string} Compact duration such as "2d 4h" or "18m 03s".
 */
export function formatRemaining(milliseconds) {
  const total = Math.max(0, Math.ceil(milliseconds / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}

/**
 * Format one wallet using its currency symbol.
 * @param {{currency: string, balance: string}} wallet - Wallet amount.
 * @param {string} [locale] - Number-formatting locale.
 * @returns {string} Display amount.
 */
export function formatWallet(wallet, locale = 'en-US') {
  const symbol = wallet.currency === 'CNY' ? '¥' : '$';
  const amount = Number(wallet.balance);
  if (!Number.isFinite(amount)) return `${symbol}${wallet.balance}`;
  if (amount === 0) return `${symbol}0.00`;
  if (amount < 0) return `-${symbol}${Math.abs(amount) < 0.01 ? '0.01' : Math.abs(amount).toFixed(2)}`;
  if (amount < 0.01) return `<${symbol}0.01`;
  return `${symbol}${amount.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
