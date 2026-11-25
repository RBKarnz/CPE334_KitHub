// Due-date rule D-21 (contract F-03 3.4 v1.3, SDS 4.5; change request #71). D-16 sets the loan length.
// Works on the ICT calendar (UTC + 7 h, no daylight saving time), so the result does not depend on
// the server's time zone. Holidays are not considered: a business day is Monday to Friday.

const DAY_MS = 86_400_000;
const ICT_OFFSET_MS = 7 * 3_600_000;
/** Checkouts at or after 16:00 ICT count from the next business day. */
const CUTOFF_HOUR_ICT = 16;
/** Every loan is due at 17:00 ICT. */
const DUE_HOUR_ICT = 17;

const isWeekend = (ictDay: Date) => ictDay.getUTCDay() === 0 || ictDay.getUTCDay() === 6;

/** Moves an ICT calendar day forward to Monday if it is a Saturday or Sunday. */
function toBusinessDay(ictDay: Date): Date {
  const day = new Date(ictDay);
  while (isWeekend(day)) day.setUTCDate(day.getUTCDate() + 1);
  return day;
}

/**
 * Start day = the ICT checkout date if it is a business day and the time is before 16:00, else the
 * next business day. Due day = start day + maxLoanDays calendar days, moved to Monday if it is a
 * Saturday or Sunday. Due time = 17:00 ICT. Returns a new Date; the input is not modified.
 */
export function computeDueAt(checkedOutAt: Date, maxLoanDays: number): Date {
  if (!Number.isInteger(maxLoanDays) || maxLoanDays < 1)
    throw new RangeError(`maxLoanDays must be an integer of at least 1, got ${maxLoanDays}`);

  // The UTC fields of `ict` are the ICT wall-clock fields of the checkout.
  const ict = new Date(checkedOutAt.getTime() + ICT_OFFSET_MS);
  let startDay = new Date(Date.UTC(ict.getUTCFullYear(), ict.getUTCMonth(), ict.getUTCDate()));
  if (isWeekend(startDay) || ict.getUTCHours() >= CUTOFF_HOUR_ICT) {
    startDay = toBusinessDay(new Date(startDay.getTime() + DAY_MS));
  }

  const dueDay = new Date(startDay);
  dueDay.setUTCDate(dueDay.getUTCDate() + maxLoanDays);
  const dueDayBusiness = toBusinessDay(dueDay);

  return new Date(dueDayBusiness.getTime() + DUE_HOUR_ICT * 3_600_000 - ICT_OFFSET_MS);
}
