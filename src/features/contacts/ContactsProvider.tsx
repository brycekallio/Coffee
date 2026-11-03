import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useSession } from "@/app/session";
import { moveContactsToWatchlist } from "@/features/bulk/moveApi";
import { useBulkList } from "@/features/bulk/useBulkList";
import { errorMessage } from "@/lib/utils";
import type { Contact } from "@/types";
import * as api from "./api";
import EditContactModal from "./EditContactModal";
import { ContactsContext } from "./contactsContext";

export function ContactsProvider({ children }: { children: ReactNode }) {
  const user = useSession();
  const [rawContacts, setContacts] = useState<Contact[]>([]);
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

  const bulkList = useBulkList({
    rows: rawContacts,
    setRows: setContacts,
    reload: fetchAll,
    noun: { one: "person", many: "people" },
    api: {
      remove: (ids) => api.deleteContacts(user.id, ids),
      setStarred: (ids, starred) => api.setContactsStarred(user.id, ids, starred),
      setTags: (group) => api.setContactsTags(user.id, group),
    },
  });
  const { remove, star, tag } = bulkList;
  const contacts = bulkList.rows;

  const moveToWatchlist = useCallback(
    async (ids: string[]) => {
      try {
        return await moveContactsToWatchlist(user.id, ids);
      } finally {
        await fetchAll(); // whatever happened, show the lists as they now are
      }
    },
    [user.id, fetchAll],
  );

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
    () => ({
      contacts,
      loading,
      reload,
      deleteContact,
      editContact: setEditing,
      bulk: { remove, star, tag, moveToWatchlist },
    }),
    [contacts, loading, reload, deleteContact, remove, star, tag, moveToWatchlist],
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
