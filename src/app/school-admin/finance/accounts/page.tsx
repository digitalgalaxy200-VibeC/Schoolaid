"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Button, Input, Modal, ConfirmDialog, showToast } from "@/components/ui";
import { fetchArray } from "@/components/finance/helpers";

// Finance → Accounts — the school's payment accounts (where parents pay in).
// Any number of accounts; each payment remembers the account via a snapshot,
// so editing these later never rewrites historical receipts.

type Account = {
  id: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  is_active: boolean;
  display_order: number;
};

export default function FinanceAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [bankName, setBankName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Account | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(() => {
    fetchArray<Account>("/api/school-admin/finance/school-bank-accounts?include_inactive=1").then(setAccounts);
  }, []);
  useEffect(() => load(), [load]);

  const openAdd = () => {
    setEditing(null);
    setBankName("");
    setAccountName("");
    setAccountNumber("");
    setOpen(true);
  };
  const openEdit = (a: Account) => {
    setEditing(a);
    setBankName(a.bank_name);
    setAccountName(a.account_name);
    setAccountNumber(a.account_number);
    setOpen(true);
  };

  const save = async () => {
    if (!bankName.trim() || !accountName.trim() || !accountNumber.trim()) return;
    setSaving(true);
    const url = "/api/school-admin/finance/school-bank-accounts";
    const body = editing
      ? { id: editing.id, bank_name: bankName.trim(), account_name: accountName.trim(), account_number: accountNumber.trim() }
      : { bank_name: bankName.trim(), account_name: accountName.trim(), account_number: accountNumber.trim() };
    const res = await fetch(url, { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    setSaving(false);
    if (res.ok) {
      showToast({ type: "success", title: editing ? "Account updated" : "Account added" });
      setOpen(false);
      load();
    } else {
      showToast({ type: "error", title: d?.error || "Failed to save account" });
    }
  };

  const toggleActive = async (a: Account) => {
    const res = await fetch("/api/school-admin/finance/school-bank-accounts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: a.id, is_active: !a.is_active }),
    });
    if (res.ok) load();
    else showToast({ type: "error", title: "Failed to update account" });
  };

  const remove = async (a: Account) => {
    setDeleteBusy(true);
    const res = await fetch(`/api/school-admin/finance/school-bank-accounts?id=${a.id}`, { method: "DELETE" });
    setDeleteBusy(false);
    setDeleting(null);
    if (res.ok) {
      showToast({ type: "success", title: "Account deleted" });
      load();
    } else {
      showToast({ type: "error", title: "Failed to delete account" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-caption text-text-secondary">
          The payment accounts parents pay into. Shown on the payment form and receipts — you can add as many as you need.
        </p>
        <Button size="sm" onClick={openAdd}>+ Add account</Button>
      </div>

      <div className="space-y-2">
        {accounts.map((a) => (
          <div key={a.id} className="rounded-lg bg-surface border border-border px-4 py-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="font-semibold text-text-primary">{a.bank_name}</p>
                <p className="text-caption text-text-secondary">
                  {a.account_name} · <span className="font-mono">{a.account_number}</span>
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => toggleActive(a)} className={`text-caption font-semibold underline ${a.is_active ? "text-text-secondary" : "text-success"}`}>
                  {a.is_active ? "Active — click to pause" : "Paused — click to activate"}
                </button>
                <button onClick={() => openEdit(a)} className="text-caption font-semibold text-primary underline">Edit</button>
                <button onClick={() => setDeleting(a)} className="text-caption font-semibold text-error underline">Delete</button>
              </div>
            </div>
          </div>
        ))}
        {accounts.length === 0 && (
          <Card padding="md" className="text-center">
            <p className="text-caption text-text-secondary">
              No payment accounts yet — add your bank account (e.g. First Bank) so the finance officer can record which account a payment was paid into.
            </p>
          </Card>
        )}
      </div>

      <Modal isOpen={open} onClose={() => setOpen(false)} title={editing ? "Edit account" : "Add payment account"}>
        <div className="space-y-4">
          <div>
            <label className="text-caption text-text-secondary block mb-1">Bank name</label>
            <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. First Bank" />
          </div>
          <div>
            <label className="text-caption text-text-secondary block mb-1">Account name</label>
            <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="e.g. ABC International School" />
          </div>
          <div>
            <label className="text-caption text-text-secondary block mb-1">Account number</label>
            <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="e.g. 0123456789" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} loading={saving} disabled={!bankName.trim() || !accountName.trim() || !accountNumber.trim()}>
              {editing ? "Save changes" : "Add account"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* In-app delete confirmation (no browser dialog) */}
      <ConfirmDialog
        open={!!deleting}
        title="Delete payment account?"
        message={`${deleting ? deleting.bank_name : ""} ${deleting ? deleting.account_number : ""} will be removed from new payments. Historical payments keep their own copy of the details — nothing already recorded changes.`}
        confirmLabel="Delete account"
        cancelLabel="Cancel"
        variant="danger"
        loading={deleteBusy}
        onConfirm={() => deleting && remove(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
