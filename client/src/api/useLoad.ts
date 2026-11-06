// Loads data for a list or detail view and keeps the loading and error state (SDS 5.3).
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./client";

export interface LoadState<T> {
  data: T | undefined;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
}

export function useLoad<T>(load: () => Promise<T>): LoadState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(load);
  loadRef.current = load;
  // Only the latest call may update the view, so an older reply never overwrites a newer one.
  const callId = useRef(0);

  const reload = useCallback(() => {
    const id = ++callId.current;
    setLoading(true);
    setError(null);
    loadRef
      .current()
      .then((value) => id === callId.current && setData(value))
      .catch((err) => {
        if (id !== callId.current) return;
        setError(err instanceof ApiError ? err : new ApiError(0, "INTERNAL_ERROR", "Something went wrong."));
      })
      .finally(() => id === callId.current && setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, error, loading, reload };
}
