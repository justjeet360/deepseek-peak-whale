export type HolidayRange = readonly [start: string, end: string];

export interface PricingOptions {
  /** Inclusive ISO date ranges replacing the default Chinese holiday calendar. */
  readonly holidays?: readonly HolidayRange[];
}

export interface BeijingParts {
  /** Beijing weekday, 0 = Sunday. */
  readonly day: number;
  /** Minutes after Beijing midnight. */
  readonly minutes: number;
  /** ISO date in Beijing. */
  readonly date: string;
  /** Instant shifted by the fixed UTC+8 offset. */
  readonly shifted: Date;
}

export interface NextTransition {
  readonly at: Date;
  readonly nextPeak: boolean;
}

export interface RateSnapshot {
  readonly peak: boolean;
  readonly at: Date;
  readonly remainingMs: number;
}

export interface Wallet {
  readonly currency: string;
  readonly balance: string;
}

export declare const BEIJING_OFFSET_MS: number;
export declare const PEAK_WINDOWS: readonly (readonly [number, number])[];
export declare const RATE_COLORS: Readonly<{ peak: string; offPeak: string }>;
export declare const DEFAULT_CHINA_HOLIDAYS: readonly HolidayRange[];

export declare function beijingParts(now?: Date): BeijingParts;
export declare function isPublicHoliday(date: string, holidays?: readonly HolidayRange[]): boolean;
export declare function isPeak(now?: Date, options?: PricingOptions): boolean;
export declare function nextTransition(now?: Date, options?: PricingOptions): NextTransition;
export declare function currentRate(now?: Date, options?: PricingOptions): RateSnapshot;
export declare function formatRemaining(milliseconds: number): string;
export declare function formatWallet(wallet: Wallet, locale?: string): string;
