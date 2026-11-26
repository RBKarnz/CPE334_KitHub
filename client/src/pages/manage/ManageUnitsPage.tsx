// Units of an item type (/manage/item-types/:id, Custodian): add a unit, Mark repaired on
// MAINTENANCE and Retire on AVAILABLE and MAINTENANCE with a confirmation (contract F-09 4.4).
// The header comes from GET /api/categories; F-04's GET /api/item-types/:id can replace it.
import { useCallback, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchCategories } from "../../api/catalog";
import { ApiError } from "../../api/client";
import { addUnit, repairUnit, retireUnit } from "../../api/manage";
import { fetchUnits, type UnitSummary } from "../../api/units";
import { useLoad } from "../../api/useLoad";
import { AsyncState } from "../../components/AsyncState";
import { PageHeader } from "../../components/PageHeader";
import { UnitStatusBadge } from "../../components/StatusBadge";
import { days, Field, ManageDialog } from "./ManageDialog";

const asApiError = (err: unknown) => (err instanceof ApiError ? err : new ApiError(0, "INTERNAL_ERROR", "Something went wrong."));

export function ManageUnitsPage() {
  const { id: rawId } = useParams();
  const id = /^[1-9]\d*$/.test(rawId ?? "") ? Number(rawId) : null;

  const catalog = useLoad(fetchCategories);
  const loadUnits = useCallback(
    () => (id === null ? Promise.reject(new ApiError(404, "NOT_FOUND", "Item type not found.")) : fetchUnits(id)),
    [id],
  );
  const units = useLoad(loadUnits);

  const [notice, setNotice] = useState<{ kind: "success" | "danger"; text: string } | null>(null);
  const [assetTag, setAssetTag] = useState("");
  const [tagError, setTagError] = useState<string | undefined>();
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState<UnitSummary | null>(null);
  const [working, setWorking] = useState(false);
  // One call per click, also on a double click (4.3).
  const busy = useRef(false);

  const reloadAll = () => {
    units.reload();
    catalog.reload();
  };

  const category = catalog.data?.find((c) => c.itemTypes.some((t) => t.id === id));
  const itemType = category?.itemTypes.find((t) => t.id === id);
  const notFound = units.error?.status === 404 || (catalog.data !== undefined && !itemType);

  if (notFound)
    return (
      <main className="container kh-main">
        <div className="kh-panel kh-message">
          <i className="bi bi-search" aria-hidden="true" />
          <h1 className="h3 mt-2">Item type not found.</h1>
          <Link to="/manage">Back to Manage catalog</Link>
        </div>
      </main>
    );

  const add = async () => {
    if (busy.current || id === null) return;
    if (assetTag.trim() === "") return setTagError("Enter an asset tag, for example KH-ARD-0006.");
    busy.current = true;
    setAdding(true);
    setTagError(undefined);
    try {
      const unit = await addUnit(id, assetTag);
      setAssetTag("");
      setNotice({ kind: "success", text: `${unit.assetTag} added.` });
      reloadAll();
    } catch (err) {
      const apiError = asApiError(err);
      const detail = apiError.details.find((d) => d.field === "assetTag");
      if (apiError.code === "ASSET_TAG_TAKEN" || detail) setTagError(apiError.code === "ASSET_TAG_TAKEN" ? apiError.message : detail!.issue);
      else setNotice({ kind: "danger", text: apiError.message });
    } finally {
      busy.current = false;
      setAdding(false);
    }
  };

  /** Repair or retire; a 409 shows the API message and loads the units again (another change won). */
  const change = async (unit: UnitSummary, action: "repair" | "retire") => {
    if (busy.current) return;
    busy.current = true;
    setWorking(true);
    try {
      const saved = action === "repair" ? await repairUnit(unit.id) : await retireUnit(unit.id);
      setNotice({
        kind: "success",
        text: action === "repair" ? `${saved.assetTag} is available again.` : `${saved.assetTag} retired.`,
      });
    } catch (err) {
      setNotice({ kind: "danger", text: asApiError(err).message });
    } finally {
      busy.current = false;
      setWorking(false);
      setConfirm(null);
      reloadAll();
    }
  };

  const list = units.data ?? [];
  const firstLoad = (units.loading && units.data === undefined) || (catalog.loading && catalog.data === undefined);

  return (
    <main className="container kh-main">
      <AsyncState
        loading={firstLoad}
        error={units.error ?? catalog.error}
        onRetry={reloadAll}
        isEmpty={false}
        empty={null}
      >
        {itemType && category && (
          <>
            <PageHeader>{itemType.name}</PageHeader>
            <p className="kh-meta mb-3">
              {category.name} · {days(itemType.maxLoanDays)} · {itemType.maxQuantityPerRequest} per request ·{" "}
              {itemType.availableCount} available
            </p>
          </>
        )}
        {notice && (
          <div className={`alert alert-${notice.kind}`} role={notice.kind === "success" ? "status" : "alert"}>
            {notice.text}
          </div>
        )}

        <form
          className="kh-panel kh-panel-body mb-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <Field label="Asset tag" error={tagError}>
            {(p) => (
              <div className="d-flex gap-2" style={{ maxWidth: "28rem" }}>
                <input
                  {...p}
                  className={`form-control${tagError ? " is-invalid" : ""}`}
                  placeholder="KH-ARD-0006"
                  value={assetTag}
                  disabled={adding}
                  onChange={(e) => setAssetTag(e.target.value)}
                />
                <button type="submit" className="btn btn-primary text-nowrap" disabled={adding}>
                  {adding && <span className="spinner-border spinner-border-sm me-1" aria-hidden="true" />}
                  Add unit
                </button>
              </div>
            )}
          </Field>
        </form>

        {list.length === 0 ? (
          <div className="kh-panel kh-empty d-flex align-items-center gap-3">
            <i className="bi bi-inbox" aria-hidden="true" />
            <div>No units yet.</div>
          </div>
        ) : (
          <div className="kh-panel table-responsive">
            <table className="table align-middle kh-table">
              <thead>
                <tr>
                  <th scope="col">Asset tag</th>
                  <th scope="col">State</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.map((u) => (
                  <tr key={u.id}>
                    <td className="kh-tag">{u.assetTag}</td>
                    <td>
                      <UnitStatusBadge status={u.status} />
                    </td>
                    <td className="text-end kh-nowrap">
                      {u.status === "MAINTENANCE" && (
                        <button
                          type="button"
                          className="btn btn-outline-primary btn-sm me-2"
                          aria-label={`Mark ${u.assetTag} repaired`}
                          disabled={working}
                          onClick={() => void change(u, "repair")}
                        >
                          Mark repaired
                        </button>
                      )}
                      {(u.status === "AVAILABLE" || u.status === "MAINTENANCE") && (
                        <button
                          type="button"
                          className="btn btn-outline-danger btn-sm"
                          aria-label={`Retire ${u.assetTag}`}
                          disabled={working}
                          onClick={() => setConfirm(u)}
                        >
                          Retire
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AsyncState>

      {confirm && (
        <ManageDialog
          title={`Retire ${confirm.assetTag}? A retired unit can never be lent again.`}
          submitting={working}
          onClose={() => setConfirm(null)}
          onSubmit={() => void change(confirm, "retire")}
          footer={
            <>
              <button type="button" className="btn btn-outline-secondary" onClick={() => setConfirm(null)} disabled={working}>
                Keep unit
              </button>
              <button type="submit" className="btn btn-danger" disabled={working}>
                {working && <span className="spinner-border spinner-border-sm me-1" aria-hidden="true" />}
                Retire unit
              </button>
            </>
          }
        />
      )}
    </main>
  );
}
