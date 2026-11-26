// The state's text for every RequestStatus value, never color alone (SDS 5.3).
import type { RequestStatus } from "../api/requests";
import type { UnitStatus } from "../api/units";

const STATUS: Record<RequestStatus, { label: string; className: string; icon: string }> = {
  PENDING: { label: "Pending", className: "kh-status-pending", icon: "hourglass-split" },
  APPROVED: { label: "Approved", className: "kh-status-approved", icon: "check2" },
  REJECTED: { label: "Rejected", className: "kh-status-rejected", icon: "x-circle" },
  CANCELLED: { label: "Cancelled", className: "kh-status-cancelled", icon: "slash-circle" },
  CHECKED_OUT: { label: "Checked out", className: "kh-status-checked-out", icon: "box-arrow-up-right" },
  RETURNED: { label: "Returned", className: "kh-status-returned", icon: "check2-circle" },
  EXPIRED: { label: "Expired", className: "kh-status-expired", icon: "clock-history" },
};

// Unit states (SRS 8.1), for the units page of Manage catalog (contract F-09 4.4).
const UNIT_STATUS: Record<UnitStatus, { label: string; className: string; icon: string }> = {
  AVAILABLE: { label: "Available", className: "kh-status-approved", icon: "check2" },
  ON_LOAN: { label: "On loan", className: "kh-status-checked-out", icon: "box-arrow-up-right" },
  MAINTENANCE: { label: "Maintenance", className: "kh-status-pending", icon: "tools" },
  RETIRED: { label: "Retired", className: "kh-status-cancelled", icon: "slash-circle" },
};

export function UnitStatusBadge({ status }: { status: UnitStatus }) {
  const { label, className, icon } = UNIT_STATUS[status];
  return (
    <span className={`kh-status ${className}`}>
      <i className={`bi bi-${icon}`} aria-hidden="true" />
      {label}
    </span>
  );
}

export function StatusBadge({ status }: { status: RequestStatus }) {
  const { label, className, icon } = STATUS[status];
  return (
    <span className={`kh-status ${className}`}>
      <i className={`bi bi-${icon}`} aria-hidden="true" />
      {label}
    </span>
  );
}
