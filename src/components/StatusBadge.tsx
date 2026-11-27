const LABELS: Record<string, string> = {
  PRESENT: "Present", HALF_DAY: "Half day", ABSENT: "Absent", MISSED_PUNCH: "Missed punch",
  WEEKLY_OFF: "Weekly off", HOLIDAY: "Holiday", LEAVE: "Leave",
  PENDING: "Pending", APPROVED: "Approved", REJECTED: "Rejected", CANCELLED: "Cancelled",
};

export function StatusBadge({ status, extra }: { status: string; extra?: string | null }) {
  return (
    <span className={`badge s-${status}`}>
      {LABELS[status] ?? status}
      {extra ? ` (${extra})` : ""}
    </span>
  );
}
