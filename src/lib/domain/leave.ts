// Leave day counting: weekly offs and holidays inside the range are not charged
// (no sandwich rule in version 1).
import { addDays, weekday } from "./time";

export function chargeableLeaveDays(
  from: string,
  to: string,
  weeklyOffs: number[],
  holidays: Set<string>,
): number {
  if (to < from) return 0;
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (weeklyOffs.includes(weekday(d)) || holidays.has(d)) continue;
    n++;
  }
  return n;
}
