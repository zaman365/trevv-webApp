export type CalendarView = "month" | "week" | "day";

export function calendarRange(anchor: Date, view: CalendarView) {
  if (view === "month") {
    const from = startOfWeek(
      new Date(anchor.getFullYear(), anchor.getMonth(), 1),
    );
    const to = addDays(from, 42);
    return { from, to };
  }
  const from = view === "week" ? startOfWeek(anchor) : startOfLocalDay(anchor);
  return { from, to: addDays(from, view === "week" ? 7 : 1) };
}

export function calendarDays(anchor: Date, view: CalendarView) {
  const { from, to } = calendarRange(anchor, view);
  const days: Date[] = [];
  for (let day = new Date(from); day < to; day = addDays(day, 1))
    days.push(day);
  return days;
}

export function startOfWeek(value: Date) {
  const day = startOfLocalDay(value);
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return day;
}

export function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}
export function addDays(value: Date, amount: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + amount);
  return next;
}
export function dateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
export function localDateKey(value: string) {
  return dateKey(new Date(value));
}
