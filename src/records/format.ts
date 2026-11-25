export const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "1805-12-23" → "Dec 23, 1805"; partial dates render at their precision ("1805", "Dec 1805"). */
export const formatIsoDate = (iso: string): string => {
  const [year, month, day] = iso.split("-");
  if (!month) return year;
  const monthName = MONTHS[Number(month) - 1];
  return day ? `${monthName} ${Number(day)}, ${year}` : `${monthName} ${year}`;
};
