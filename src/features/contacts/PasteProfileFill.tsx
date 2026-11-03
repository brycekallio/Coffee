import { useState } from "react";
import type { ContactFields } from "../../../supabase/functions/_shared/contactFields.ts";
import { inputCls } from "@/components/ui/styles";
import { fillFromProfileText, PASTE_CHAR_LIMIT } from "./fillFromProfile";

interface Props {
  /** Receives only the fields that were found; the caller merges them into its form. */
  onFill: (found: Partial<ContactFields>) => void;
}

const FIELD_NAMES: Record<keyof ContactFields, string> = {
  first_name: "first name",
  last_name: "last name",
  company: "company",
  title: "job title",
  email: "email",
  phone: "phone",
  linkedin_url: "LinkedIn link",
};

function list(keys: string[]) {
  return keys.length <= 1 ? keys.join("") : `${keys.slice(0, -1).join(", ")} and ${keys[keys.length - 1]}`;
}

/**
 * "Paste a LinkedIn profile" → the Add form fills in. The user copies the page text
 * themselves; nothing is fetched from LinkedIn. The result lands in the form for review;
 * it is never saved from here.
 */
export default function PasteProfileFill({ onFill }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);

  async function run() {
    setBusy(true);
    setNotice(null);
    const out = await fillFromProfileText(text);
    setBusy(false);
    const found = Object.keys(out.fields) as (keyof ContactFields)[];
    if (found.length > 0) onFill(out.fields);

    if (out.kind === "ai") {
      setText("");
      setNotice({ tone: "ok", text: `Filled ${list(found.map((k) => FIELD_NAMES[k]))}. Check each field, then press Add person.` });
      return;
    }
    const got = found.length > 0 ? ` I still filled in the ${list(found.map((k) => FIELD_NAMES[k]))} that were written in the text.` : "";
    setNotice({
      tone: "warn",
      text:
        (out.reason === "limit" ? out.message : `The AI couldn't fill this in (${out.message.replace(/[.\s]+$/, "")}).`) +
        got +
        " You can type the rest below.",
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-4 w-full rounded-button bg-white/[0.06] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10 cursor-pointer"
      >
        Fill from a LinkedIn profile
      </button>
    );
  }

  return (
    <div className="mb-4 rounded-input bg-depth-0/40 p-3">
      <label htmlFor="paste-profile" className="block text-sm font-medium text-white">
        Paste the profile text
      </label>
      <p className="mt-1 text-xs text-white/60">
        On their LinkedIn page, select all and copy, then paste here. Coffee only reads what you paste; it never opens LinkedIn.
      </p>
      <textarea
        id="paste-profile"
        className={`${inputCls} mt-2 h-32 resize-y`}
        placeholder="Priya Raman&#10;Senior Consultant at FTI Consulting&#10;…"
        maxLength={PASTE_CHAR_LIMIT}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="mt-1 text-right text-xs text-white/60 font-data">
        {text.length.toLocaleString("en-US")} / {PASTE_CHAR_LIMIT.toLocaleString("en-US")}
      </div>

      {notice ? (
        <p role="status" className={`mt-2 text-sm ${notice.tone === "ok" ? "text-white" : "text-white/80"}`}>
          {notice.text}
        </p>
      ) : null}

      <p className="mt-2 text-xs text-white/60">Uses 1 of your 5 free AI requests today.</p>
      <div className="mt-3 flex items-center justify-end">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="whitespace-nowrap rounded-button px-3 py-2 text-sm font-medium text-white/60 transition-colors hover:text-white cursor-pointer"
          >
            Close
          </button>
          <button
            type="button"
            disabled={busy || text.trim().length < 20}
            onClick={() => void run()}
            className="whitespace-nowrap rounded-button bg-white/[0.08] px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.12] disabled:opacity-50 cursor-pointer"
          >
            {busy ? "Reading…" : "Fill the form"}
          </button>
        </div>
      </div>
    </div>
  );
}
