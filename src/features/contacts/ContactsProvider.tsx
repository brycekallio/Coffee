import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/utils";
import type { Contact } from "@/types";
import * as api from "./api";
import EditContactModal from "./EditContactModal";
import { ContactsContext } from "./contactsContext";

export function ContactsProvider({ children }: { children: ReactNode }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Contact | null>(null);

  // setState only after the await, so the mount effect can call this directly.
  const fetchAll = useCallback(async () => {
    try {
      setContacts(await api.listContacts());
    } catch (e) {
      toast.error(errorMessage(e, "Failed to load contacts."));
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

  const deleteContact = useCallback(
    async (id: string) => {
      if (!window.confirm("Delete this person from your Network? This cannot be undone.")) return false;
      try {
        await api.deleteContact(id);
      } catch (e) {
        toast.error(errorMessage(e, "Failed to delete contact."));
        return false;
      }
      await reload();
      return true;
    },
    [reload],
  );

  const value = useMemo(
    () => ({ contacts, loading, reload, deleteContact, editContact: setEditing }),
    [contacts, loading, reload, deleteContact],
  );

  return (
    <ContactsContext.Provider value={value}>
      {children}
      {editing ? (
        <EditContactModal
          key={editing.id}
          contact={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
        />
      ) : null}
    </ContactsContext.Provider>
  );
}
