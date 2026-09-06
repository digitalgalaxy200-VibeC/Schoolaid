"use client";

// Payment success modal — replaces toast-only confirmation after recording a
// payment. Shows the immutable facts of the transaction that was just created:
// amount, receipt number, student, and the derived Expected / Paid / Balance.
// Everything is display-only; the numbers come straight from the API response.

import { Button, Modal } from "@/components/ui";
import { money } from "@/components/finance/helpers";

export type PaymentReceiptRef = { id: string; receipt_number: string };
export type PaymentSuccessData = {
  student_name: string;
  amount: number;
  receipt: PaymentReceiptRef | null;
  credit: { amount: number; reason?: string } | null;
  balance: {
    net_amount?: number;
    paid?: number;
    outstanding?: number;
    credit?: number;
    status?: string;
  } | null;
};

export function PaymentSuccessModal({
  data,
  onClose,
  onDone,
}: {
  data: PaymentSuccessData | null;
  onClose: () => void;
  onDone?: () => void;
}) {
  if (!data) return null;
  const b = data.balance;

  return (
    <Modal isOpen onClose={onClose} title="Payment recorded" size="sm">
      <div className="text-center space-y-4">
        <div className="mx-auto w-14 h-14 rounded-full bg-success/15 flex items-center justify-center text-2xl">
          ✅
        </div>

        <div>
          <p className="text-display font-extrabold text-success">{money(data.amount)}</p>
          <p className="text-caption text-text-secondary mt-1">
            {data.receipt ? (
              <>
                Receipt <b className="text-text-primary">{data.receipt.receipt_number}</b> issued
              </>
            ) : (
              "Payment recorded"
            )}
          </p>
          <p className="text-caption text-text-secondary">{data.student_name}</p>
        </div>

        {b && (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-clay py-2">
              <p className="text-body font-extrabold text-text-primary">{money(b.net_amount ?? 0)}</p>
              <p className="text-caption text-text-secondary">Expected</p>
            </div>
            <div className="rounded-lg bg-clay py-2">
              <p className="text-body font-extrabold text-success">{money(b.paid ?? 0)}</p>
              <p className="text-caption text-text-secondary">Paid</p>
            </div>
            <div className="rounded-lg bg-clay py-2">
              <p className={`text-body font-extrabold ${(b.outstanding ?? 0) > 0 ? "text-warning" : "text-success"}`}>
                {money(b.outstanding ?? 0)}
              </p>
              <p className="text-caption text-text-secondary">Balance</p>
            </div>
          </div>
        )}

        {data.credit && data.credit.amount > 0 && (
          <p className="text-caption text-primary font-semibold rounded-lg bg-primary-light px-3 py-2">
            Excess of {money(data.credit.amount)} credited to this student&apos;s account.
          </p>
        )}

        <div className="flex justify-center gap-2 pt-1">
          {data.receipt && (
            <a href={`/api/school-admin/finance/receipts/${data.receipt.id}/pdf`} target="_blank">
              <Button variant="secondary">View receipt</Button>
            </a>
          )}
          <Button
            onClick={() => {
              onClose();
              onDone?.();
            }}
          >
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}
