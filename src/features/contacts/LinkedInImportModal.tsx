import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import Modal from "@/components/ui/Modal";
import { useSession } from "@/app/session";
import Checkbox from "@/features/bulk/Checkbox";
import { useSelection } from "@/features/bulk/useSelection";
import { errorMessage } from "@/lib/utils";
import * as api from "./api";
import { useContacts } from "./contactsContext";
import {
  buildConnectionInserts,
  ConnectionsFileError,
  DUPLICATE_LABEL,
  markDuplicates,
  MAX_FILE_BYTES,
  MAX_ROWS,
  parseConnectionsCsv,
  type ParsedConnections,
} from "./linkedinConnections";

const PAGE = 100;

const btnNeutral =
  "whitespace-nowrap rounded-button bg-white/[0.08] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/[0.12] disabled:opacity-50 cursor-pointer";

/**
 * Import LinkedIn's Connections.csv: pick the file, see who is new and who is already in
 * the Network, tick the people to bring in, import. Reads only the file the user chooses.
 */
export default function LinkedInImportModal({ onClose }: { onClose: () => void }) {
  const user = useSession();
  const { reload } = useContacts();
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedConnections | null>(null);
  // The whole Network's matching fields, fetched per file (the shared list stops at 1,000).
  const [existing, setExisting] = useState<Awaited<ReturnType<typeof api.listContactMatchKeys>>>([]);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [shown, setShown] = useState(PAGE);

  const checked = useMemo(() => (parsed ? markDuplicates(parsed.people, existing) : []), [parsed, existing]);
  const fresh = useMemo(() => checked.filter((p) => !p.duplicate), [checked]);
  const order = useMemo(() => fresh.map((p) => p.id), [fresh]);
  const sel = useSelection(order);

  async function pickFile(file: File) {
    setError("");
    setParsed(null);
    setShown(PAGE);
    if (/\.zip$/i.test(file.name)) {
      setError("That's the zip LinkedIn emailed you. Unzip it and choose the Connections.csv inside.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("That file is bigger than 5 MB, so it isn't a LinkedIn connections export.");
      return;
    }
    let result: ParsedConnections;
    try {
      result = parseConnectionsCsv(await file.text());
    } catch (e) {
      setError(e instanceof ConnectionsFileError ? e.message : "Couldn't read that file.");
      return;
    }
    try {
      setExisting(await api.listContactMatchKeys());
    } catch (e) {
      setError(errorMessage(e, "Couldn't check who is already in your Network. Try again."));
      return;
    }
    setParsed(result);
    setFileName(file.name);
  }

  async function runImport() {
    const rows = buildConnectionInserts(checked, sel.selected, user.id);
    if (rows.length === 0) return;
    setImporting(true);
    try {
      await api.createContacts(rows);
      toast.success(`Imported ${rows.length} ${rows.length === 1 ? "person" : "people"} from LinkedIn.`);
      await reload();
      onClose();
    } catch (e) {
      // Chunks before the failing one are saved; they now show as "already in your Network".
      await reload();
      toast.error(errorMessage(e, "Import stopped."), {
        description: "If some people were saved, they'll show as already in your Network when you choose the file again.",
      });
      setParsed(null);
      setFileName("");
    } finally {
      setImporting(false);
    }
  }

  const dupCount = checked.length - fresh.length;

  // Portalled to <body>: the page column has an animated ancestor, which would make this
  // modal's `position: fixed` relative to that column instead of the window.
  return createPortal(
    <Modal title="Import LinkedIn connections" open onClose={() => (importing ? undefined : onClose())}>
      <div className="grid grid-cols-1 gap-4">
        {!parsed ? (
          <>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-white/80">
              <li>On LinkedIn: Settings &amp; Privacy → Data privacy → Get a copy of your data.</li>
              <li>Tick <span className="text-white">Connections</span> and request the archive. LinkedIn emails a zip within minutes.</li>
              <li>Unzip it and choose <span className="font-data text-white">Connections.csv</span> below.</li>
            </ol>
            <input
              type="file"
              accept=".csv,text/csv"
              aria-label="Choose Connections.csv"
              className="block w-full text-sm text-white/60 file:mr-4 file:cursor-pointer file:rounded-button file:border-0 file:bg-white/[0.08] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-white/[0.12]"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void pickFile(f);
              }}
            />
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
            <p className="text-xs text-white/60">The file is read in your browser. Nothing is sent to LinkedIn or anywhere else until you press Import.</p>
          </>
        ) : (
          <>
            <div>
              <p className="text-sm text-white">
                <span className="font-data">{fresh.length.toLocaleString("en-US")}</span> new {fresh.length === 1 ? "person" : "people"} in{" "}
                <span className="font-data">{fileName}</span>
                {dupCount > 0 ? (
                  <>
                    {" "}· <span className="font-data">{dupCount.toLocaleString("en-US")}</span> already here
                  </>
                ) : null}
                {parsed.skippedNoName > 0 ? (
                  <>
                    {" "}· <span className="font-data">{parsed.skippedNoName}</span> without a name skipped
                  </>
                ) : null}
              </p>
              {parsed.truncated ? (
                <p className="mt-1 text-xs text-white/80">
                  This file has more than {MAX_ROWS.toLocaleString("en-US")} rows; only the first {MAX_ROWS.toLocaleString("en-US")} are shown.
                </p>
              ) : null}
            </div>

            <div className="min-w-0 rounded-section bg-depth-0/40">
              <div className="flex min-h-[3.25rem] items-center gap-3 px-4 py-2">
                <Checkbox state={sel.all} label="Select all new people" onToggle={() => sel.onToggleAll()} />
                <span className="text-sm text-white/80">
                  {sel.count > 0 ? `${sel.count.toLocaleString("en-US")} selected` : "Select all new people"}
                </span>
              </div>
              <div className="h-px w-full bg-white/[0.06]" />
              <div className="max-h-[38vh] overflow-y-auto">
                {checked.slice(0, shown).map((p) => {
                  const name = [p.first_name, p.last_name].filter(Boolean).join(" ");
                  const detail = [p.title, p.company].filter(Boolean).join(" · ");
                  const picked = sel.selected.has(p.id);
                  return (
                    <div key={p.id} className={`flex items-center gap-3 px-4 py-2.5 ${picked ? "bg-white/[0.05]" : ""}`}>
                      {p.duplicate ? (
                        <input type="checkbox" className="bulk-check opacity-30" disabled aria-label={`${name} is already imported`} />
                      ) : (
                        <Checkbox state={picked ? "all" : "none"} label={`Select ${name}`} onToggle={(shift) => sel.onToggle(p.id, shift)} />
                      )}
                      <div className={`min-w-0 flex-1 ${p.duplicate ? "opacity-60" : ""}`}>
                        <div className="truncate text-sm font-medium text-white">{name}</div>
                        <div className="truncate text-sm text-white/60">{detail || "—"}</div>
                      </div>
                      <div className="shrink-0 text-right text-xs text-white/60">
                        {p.duplicate ? DUPLICATE_LABEL[p.duplicate] : p.connected_on ? <span className="font-data">{p.connected_on}</span> : null}
                      </div>
                    </div>
                  );
                })}
                {shown < checked.length ? (
                  <div className="px-4 py-3 text-center">
                    <button type="button" onClick={() => setShown((n) => n + PAGE)} className="text-sm text-white/80 hover:text-white hover:underline cursor-pointer">
                      Show {Math.min(PAGE, checked.length - shown)} more ({(checked.length - shown).toLocaleString("en-US")} left)
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-3">
              <button type="button" disabled={importing} onClick={() => { setParsed(null); setFileName(""); }} className="text-sm text-white/60 hover:text-white hover:underline cursor-pointer disabled:opacity-50">
                Choose a different file
              </button>
              <div className="flex gap-2">
                <button type="button" disabled={importing} onClick={onClose} className="whitespace-nowrap rounded-button border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/[0.06] cursor-pointer disabled:opacity-50">
                  Cancel
                </button>
                <button type="button" disabled={importing || sel.count === 0} onClick={() => void runImport()} className={btnNeutral}>
                  {importing ? "Importing…" : sel.count === 0 ? "Import" : `Import ${sel.count.toLocaleString("en-US")} ${sel.count === 1 ? "person" : "people"}`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>,
    document.body,
  );
}
