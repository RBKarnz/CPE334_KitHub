// The page's one h1, with optional content beside it, for example a request's status badge.
import type { ReactNode } from "react";

export function PageHeader({ children }: { children: ReactNode }) {
  return <h1 className="kh-page-title kh-page-title-row">{children}</h1>;
}
