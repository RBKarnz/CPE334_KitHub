// The state's text for every RequestStatus value, never color alone (SDS 5.3).
import type { RequestStatus } from "../api/requests";

const STATUS: Record<RequestStatus, { label: string; className: string }> = {
  PENDING: { label: "Pending", className: "text-bg-warning" },
  APPROVED: { label: "Approved", className: "text-bg-info" },
  REJECTED: { label: "Rejected", className: "text-bg-danger" },
  CANCELLED: { label: "Cancelled", className: "text-bg-secondary" },
  CHECKED_OUT: { label: "Checked out", className: "text-bg-primary" },
  RETURNED: { label: "Returned", className: "text-bg-success" },
  EXPIRED: { label: "Expired", className: "text-bg-dark" },
};

export function StatusBadge({ status }: { status: RequestStatus }) {
  const { label, className } = STATUS[status];
  return <span className={`badge ${className}`}>{label}</span>;
}
