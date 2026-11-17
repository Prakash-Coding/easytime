export type Mode = "normal" | "overtime";
export type Entry = { start: string; end: string; breakMinutes: string; manualOT: string };
export const DAYS = 15;
export const emptyEntries = (): Entry[] => Array.from({ length: DAYS }, () => ({ start: "", end: "", breakMinutes: "", manualOT: "" }));
function timeMinutes(value: string): number | null {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}
export function calculateSheet(entries: Entry[], mode: Mode, rate: string) {
  let weeklyMinutes = 0;
  const rows = entries.map((entry, index) => {
    if (index % 7 === 0) weeklyMinutes = 0;
    const errors: string[] = [];
    const hasInput = !!(entry.start || entry.end || entry.breakMinutes || (mode === "overtime" && entry.manualOT));
    const start = timeMinutes(entry.start), end = timeMinutes(entry.end);
    if (hasInput && (start === null || end === null)) errors.push("Enter both start and end times.");
    const duration = start !== null && end !== null ? (end < start ? end + 1440 : end) - start : 0;
    if (start !== null && end !== null && duration === 0) errors.push("Start and end must be different.");
    const breakMinutes = entry.breakMinutes === "" ? 0 : Number(entry.breakMinutes);
    if (!Number.isFinite(breakMinutes) || breakMinutes < 0 || !Number.isInteger(breakMinutes)) errors.push("Break must be a whole number of minutes, 0 or more.");
    else if (start !== null && end !== null && breakMinutes > duration) errors.push("Break cannot be longer than the shift.");
    let net = Math.max(0, duration - breakMinutes);
    const manualMinutes = entry.manualOT === "" ? 0 : Number(entry.manualOT) * 60;
    if (mode === "overtime") {
      if (!Number.isFinite(manualMinutes) || manualMinutes < 0) errors.push("Manual OT must be 0 hours or more.");
      else if (start !== null && end !== null && manualMinutes > net + 0.000001) errors.push("Manual OT cannot exceed worked hours.");
    }
    const complete = start !== null && end !== null && errors.length === 0;
    if (!complete) net = 0;
    const automaticOT = Math.min(net, Math.max(0, weeklyMinutes + net - 2400));
    const overtime = complete && mode === "overtime" ? (entry.manualOT === "" ? automaticOT : manualMinutes) : 0;
    weeklyMinutes += net;
    return { minutes: net, regular: net - overtime, overtime, complete, overnight: complete && end! < start!, errors };
  });
  const regular = rows.reduce((sum, row) => sum + row.regular, 0) / 60;
  const overtime = rows.reduce((sum, row) => sum + row.overtime, 0) / 60;
  const hourlyRate = Number(rate);
  const rateValid = rate.trim() !== "" && Number.isFinite(hourlyRate) && hourlyRate >= 0;
  const regularPay = rateValid ? regular * hourlyRate : 0, overtimePay = rateValid ? overtime * hourlyRate * 1.5 : 0;
  return { rows, regular, overtime, total: regular + overtime, regularPay, overtimePay, pay: regularPay + overtimePay, rateValid, completed: rows.filter(row => row.complete).length, invalidDays: rows.filter(row => row.errors.length).length };
}
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "0001-01-01" || value > "9999-12-17") return false;
  const date = new Date(value + "T12:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function dayDate(start: string, index: number): Date | null {
  if (!validDate(start)) return null;
  const date = new Date(start + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + index);
  return date;
}
