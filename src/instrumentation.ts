// Background schedule inside the app process (no separate cron needed for one small company):
// on start-up process the current month, then every 15 minutes
// re-process today and yesterday; on the 1st of each month credit leave.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.DISABLE_SCHEDULER === "true") return;
  const { processMonth, processRange } = await import("./lib/server/attendance-service");
  const { creditMonthlyLeave } = await import("./lib/server/leave-service");
  const { addDays, todayIst } = await import("./lib/domain/time");

  const tick = async () => {
    try {
      const today = todayIst();
      await processRange(addDays(today, -1), today);
      await creditMonthlyLeave(today.slice(0, 7)); // idempotent per month
    } catch (err) {
      console.error("[scheduler]", err);
    }
  };
  // On start-up, fill in the whole current month (catches up after downtime).
  setTimeout(() => processMonth(todayIst().slice(0, 7)).catch((e) => console.error("[scheduler]", e)).then(tick), 10_000);
  setInterval(tick, 15 * 60_000);
}
