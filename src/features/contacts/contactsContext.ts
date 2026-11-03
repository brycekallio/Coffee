import { createContext, useContext } from "react";
import type { MoveResult } from "@/features/bulk/moveApi";
import type { Contact } from "@/types";

/**
 * The contact list is the one piece of data most pages share — Contacts, Details,
 * Applications, Analytics and Outreach all read it — so it lives in one provider
 * mounted for the signed-in session rather than in App or in each page. The edit
 * modal lives here too, so any page can open it with editContact(c).
 */
export interface ContactsValue {
  contacts: Contact[];
  loading: boolean;
  reload: () => Promise<void>;
  /** Asks for confirmation, deletes, reloads. Resolves true if the contact is gone. */
  deleteContact: (id: string) => Promise<boolean>;
  editContact: (contact: Contact) => void;
  /** Bulk actions for the Network list. Delete waits out an 8-second Undo window. */
  bulk: {
    remove: (ids: string[]) => void;
    star: (ids: string[]) => Promise<void>;
    tag: (ids: string[], tag: string, mode: "add" | "remove") => Promise<void>;
    /** Moves people to the Watchlist; resolves to how many moved and how many stayed (they have meetings or applications). */
    moveToWatchlist: (ids: string[]) => Promise<MoveResult>;
  };
}

export const ContactsContext = createContext<ContactsValue | null>(null);

export function useContacts(): ContactsValue {
  const value = useContext(ContactsContext);
  if (!value) throw new Error("useContacts() called outside <ContactsProvider>");
  return value;
}
