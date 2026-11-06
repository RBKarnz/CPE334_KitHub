// The state's text for every RequestStatus value, never color alone (SDS 5.3).
import type { RequestStatus } from "../api/requests";

const STATUS: Record<RequestStatus, { label: string; className: string; icon: string }> = {
  PENDING: { label: "Pending", className: "kh-status-pending", icon: "hourglass-split" },
  APPROVED: { label: "Approved", className: "kh-status-approved", icon: "check2" },
  REJECTED: { label: "Rejected", className: "kh-status-rejected", icon: "x-circle" },
  CANCELLED: { label: "Cancelled", className: "kh-status-cancelled", icon: "slash-circle" },
  CHECKED_OUT: { label: "Checked out", className: "kh-status-checked-out", icon: "box-arrow-up-right" },
  RETURNED: { label: "Returned", className: "kh-status-returned", icon: "check2-circle" },
  EXPIRED: { label: "Expired", className: "kh-status-expired", icon: "clock-history" },
};

export function StatusBadge({ status }: { status: RequestStatus }) {
  const { label, className, icon } = STATUS[status];
  return (
    <span className={`kh-status ${className}`}>
      <i className={`bi bi-${icon}`} aria-hidden="true" />
      {label}
    </span>
  );
}
