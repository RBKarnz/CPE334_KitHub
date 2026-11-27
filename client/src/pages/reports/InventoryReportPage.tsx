// Reports, the Custodian inventory summary (contract F-14 4.2): one row per item type and a totals
// row. Below 768 px the table scrolls sideways in its .table-responsive scroller (SDS 5.3, SR-04).
import { fetchInventoryReport, type InventoryCounts } from "../../api/reports";
import { useLoad } from "../../api/useLoad";
import { AsyncState } from "../../components/AsyncState";
import { PageHeader } from "../../components/PageHeader";
import { formatDateTime } from "../../format";

const COLUMNS: { key: keyof InventoryCounts; label: string }[] = [
  // F14-D4: the unit state, not the catalog's request availability.
  { key: "available", label: "Available (unit state)" },
  { key: "onLoan", label: "On loan" },
  { key: "maintenance", label: "Maintenance" },
  { key: "retired", label: "Retired" },
  { key: "totalUnits", label: "Total units" },
  { key: "activeLoans", label: "Active loans" },
  { key: "overdueRequests", label: "Overdue requests" },
];

export function InventoryReportPage() {
  const report = useLoad(fetchInventoryReport);
  const data = report.data;

  return (
    <main className="container kh-main">
      <PageHeader>Inventory report</PageHeader>
      <div className="d-flex align-items-center gap-3 mb-3">
        {data && <span className="text-body-secondary">Generated {formatDateTime(data.generatedAt)}</span>}
        <button type="button" className="btn btn-outline-primary btn-sm" onClick={report.reload} disabled={report.loading}>
          Refresh
        </button>
      </div>
      <AsyncState
        loading={report.loading && !data}
        error={report.error}
        onRetry={report.reload}
        isEmpty={(data?.items.length ?? 0) === 0}
        empty="The catalog is empty."
      >
        {data && (
          <div className="kh-panel">
            <div className="table-responsive">
              <table className="table align-middle kh-table">
                <thead>
                  <tr>
                    <th scope="col">Category</th>
                    <th scope="col">Item type</th>
                    {COLUMNS.map((c) => (
                      <th scope="col" className="text-end" key={c.key}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => (
                    <tr key={row.itemType.id}>
                      <td>{row.category.name}</td>
                      <td className="fw-semibold">{row.itemType.name}</td>
                      {COLUMNS.map((c) => (
                        <td className="text-end" key={c.key}>
                          {row[c.key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="fw-bold">
                    <td>Total</td>
                    <td />
                    {COLUMNS.map((c) => (
                      <td className="text-end" key={c.key}>
                        {data.totals[c.key]}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </AsyncState>
    </main>
  );
}
