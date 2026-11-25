// Times are shown in the hardware room's time zone, for example "6 Nov 2026, 13:10" (contract F-02 5).
const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Bangkok",
});

export const formatDateTime = (iso: string) => DATE_TIME.format(new Date(iso));

// With the weekday, for the due-date preview: "Fri 20 Nov 2026, 17:00" (contract F-03 4.3, #71).
const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "Asia/Bangkok" });

export const formatWeekdayDateTime = (iso: string) => `${WEEKDAY.format(new Date(iso))} ${formatDateTime(iso)}`;
