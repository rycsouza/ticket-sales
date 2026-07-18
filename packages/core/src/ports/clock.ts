/**
 * Clock port — inject instead of calling new Date() inside domain logic, so
 * time-dependent rules (batch windows, reservation expiry, payout hold days)
 * are deterministic in tests.
 */
export interface ClockPort {
  now(): Date;
}

export const systemClock: ClockPort = {
  now: () => new Date(),
};
