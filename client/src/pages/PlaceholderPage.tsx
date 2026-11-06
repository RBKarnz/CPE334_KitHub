// Stands in for the Catalog, My requests and Pending requests pages until F-02 and F-03
// build them (contract F-01 section 5).
export function PlaceholderPage({ title }: { title: string }) {
  return (
    <main className="container">
      <h1 className="h3">{title}</h1>
      <p className="text-body-secondary">This page is not built yet.</p>
    </main>
  );
}
