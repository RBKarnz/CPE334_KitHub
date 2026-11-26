// New request (/requests/new, Borrower; contract F-04 4.3). With ?itemTypeId=3 the form starts with
// that item type, quantity 1 and its maximum loan length (F04-D5).
import { useNavigate, useSearchParams } from "react-router-dom";
import { fetchCategories } from "../../api/catalog";
import { createRequest } from "../../api/requests";
import { useLoad } from "../../api/useLoad";
import { AsyncState } from "../../components/AsyncState";
import { PageHeader } from "../../components/PageHeader";
import { RequestForm } from "./RequestForm";

export function NewRequestPage() {
  const catalog = useLoad(fetchCategories);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const categories = catalog.data ?? [];

  const startId = Number(params.get("itemTypeId"));
  const start = categories.flatMap((c) => c.itemTypes).find((t) => t.id === startId);

  return (
    <main className="container kh-main">
      <PageHeader>New request</PageHeader>
      {/* A reload after a 409 keeps the form and what the Borrower entered (4.3). */}
      <AsyncState
        loading={catalog.loading && !catalog.data}
        error={catalog.data ? null : catalog.error}
        onRetry={catalog.reload}
        isEmpty={categories.every((c) => c.itemTypes.length === 0)}
        empty="The catalog is empty."
      >
        <RequestForm
          categories={categories}
          initialLines={[{ itemTypeId: start?.id ?? null, quantity: 1 }]}
          initialLoanDays={start?.maxLoanDays ?? null}
          submitLabel="Submit request"
          onConflict={catalog.reload}
          onSubmit={async (body) => {
            const created = await createRequest(body);
            navigate(`/requests/${created.id}`, { state: { notice: `Request #${created.id} submitted.` } });
          }}
        />
      </AsyncState>
    </main>
  );
}
