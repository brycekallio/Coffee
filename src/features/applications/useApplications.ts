import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/utils";
import type { Application } from "@/types";
import * as api from "./api";

/** The signed-in user's applications, loaded on mount. Used by Applications and Analytics. */
export function useApplications() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

  // setState only after the await, so the mount effect can call this directly.
  const fetchAll = useCallback(async () => {
    try {
      setApplications(await api.listApplications());
    } catch (e) {
      toast.error(errorMessage(e, "Failed to load applications."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const reload = useCallback(async () => {
    setLoading(true);
    await fetchAll();
  }, [fetchAll]);

  return { applications, loading, reload };
}
