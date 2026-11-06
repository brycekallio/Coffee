import { useState } from "react";
import { toast } from "sonner";
import Modal from "@/components/ui/Modal";
import { inputCls } from "@/components/ui/styles";
import { errorMessage } from "@/lib/utils";
import type { Contact } from "@/types";
import * as api from "./api";

interface Props {
  contact: Contact;
  onClose: () => void;
  onSaved: () => void;
}

/** Rendered with key={contact.id}, so the draft is seeded fresh for each contact. */
export default function EditContactModal({ contact, onClose, onSaved }: Props) {
  const [first, setFirst] = useState(contact.first_name ?? "");
  const [last, setLast] = useState(contact.last_name ?? "");
  const [company, setCompany] = useState(contact.company ?? "");
  const [title, setTitle] = useState(contact.title ?? "");
  const [email, setEmail] = useState(contact.email ?? "");
  const [phone, setPhone] = useState(contact.phone ?? "");
  const [linkedIn, setLinkedIn] = useState(contact.linkedin_url ?? "");

  async function save() {
    try {
      await api.updateContact(contact.id, {
        first_name: first || null,
        last_name: last || null,
        company: company || null,
        title: title || null,
        email: email || null,
        phone: phone || null,
        linkedin_url: linkedIn || null,
      });
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e, "Failed to save contact."));
    }
  }

  const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ");

  return (
    <Modal title={`Edit Contact${name ? `: ${name}` : ""}`} open onClose={onClose}>
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <input className={inputCls} placeholder="First name" value={first} onChange={(e) => setFirst(e.target.value)} />
          <input className={inputCls} placeholder="Last name" value={last} onChange={(e) => setLast(e.target.value)} />
        </div>

        <input className={inputCls} placeholder="Company" value={company} onChange={(e) => setCompany(e.target.value)} />
        <input className={inputCls} placeholder="Job title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className={inputCls} placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className={inputCls} placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <input
          className={inputCls}
          placeholder="LinkedIn URL (paste full URL text)"
          value={linkedIn}
          onChange={(e) => setLinkedIn(e.target.value)}
        />

        <div className="mt-2 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-button border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/[0.06] cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={save}
            className="rounded-button bg-glow/90 px-4 py-2.5 text-sm font-semibold text-depth-0 transition hover:bg-glow cursor-pointer"
          >
            Save changes
          </button>
        </div>
      </div>
    </Modal>
  );
}
