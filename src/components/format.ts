import { istDateString, istTimeString } from "@/lib/domain/time";

export const fmtTime = (d: Date | null) => (d ? istTimeString(d) : "–");
export const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
export const fmtHours = (min: number) => (min ? `${Math.floor(min / 60)}h ${min % 60}m` : "–");
export const thisMonth = () => istDateString(new Date()).slice(0, 7);
export const isMonth = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}$/.test(s);
