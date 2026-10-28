import { createContext, useContext } from "react";
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
}

export const ContactsContext = createContext<ContactsValue | null>(null);

export function useContacts(): ContactsValue {
  const value = useContext(ContactsContext);
  if (!value) throw new Error("useContacts() called outside <ContactsProvider>");
  return value;
}
