// Due-date rule D-16 (contract F-03 3.4, SDS 4.5): whole days added as 24-hour periods.
// Asia/Bangkok has no daylight saving time, so this is the same clock time maxLoanDays later.

const DAY_MS = 86_400_000;

/** dueAt = checkedOutAt + maxLoanDays × 24 h. Returns a new Date; the input is not modified. */
export function computeDueAt(checkedOutAt: Date, maxLoanDays: number): Date {
  if (!Number.isInteger(maxLoanDays) || maxLoanDays < 1)
    throw new RangeError(`maxLoanDays must be an integer of at least 1, got ${maxLoanDays}`);
  return new Date(checkedOutAt.getTime() + maxLoanDays * DAY_MS);
}
