import { useState } from "react";
import { toast } from "sonner";
import { useSession } from "@/app/session";
import { inferFieldMap, parseCsv } from "@/lib/csvHelper";
import { errorMessage } from "@/lib/utils";
import type { FieldMap } from "@/types";
import * as api from "./api";
import { buildContactInserts } from "./csvImport";
import { useContacts } from "./contactsContext";

/** CSV → contacts, as used by Settings: pick a file, preview the inferred mapping, import. */
export function useCsvImport({ onImported }: { onImported?: () => void } = {}) {
  const user = useSession();
  const { reload } = useContacts();
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [map, setMap] = useState<FieldMap>({});
  const [importing, setImporting] = useState(false);

  async function pickFile(file: File) {
    const parsed = parseCsv(await file.text());
    setFileName(file.name);
    setRows(parsed.rows);
    setMap(inferFieldMap(parsed.headers, parsed.rows));
  }

  async function importAll() {
    if (rows.length === 0) return;
    const inserts = buildContactInserts(rows, map, user.id);
    if (inserts.length === 0) {
      toast.error("No valid rows found to import.");
      return;
    }

    setImporting(true);
    try {
      await api.createContacts(inserts);
      setFileName("");
      setRows([]);
      setMap({});
      await reload();
      toast.success(`Imported ${inserts.length} contact(s).`);
      onImported?.();
    } catch (e) {
      toast.error(errorMessage(e, "Import failed."));
    } finally {
      setImporting(false);
    }
  }

  return { fileName, rows, map, importing, pickFile, importAll };
}
