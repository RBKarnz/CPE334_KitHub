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
