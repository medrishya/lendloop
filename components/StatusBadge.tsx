// components/StatusBadge.tsx
'use client';

export type ToolStatus = 'available' | 'on_loan' | 'unavailable';
export type LoanStatus =
  | 'pending'
  | 'approved'
  | 'declined'
  | 'returned'
  | 'cancelled';

const badgeStyles: Record<string, string> = {
  available: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  approved: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  returned: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  pending: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  on_loan: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  unavailable: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  declined: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  cancelled: 'bg-slate-100 text-slate-600 ring-slate-500/20',
};

const badgeLabels: Record<string, string> = {
  available: 'Available',
  on_loan: 'On Loan',
  unavailable: 'Unavailable',
  pending: 'Pending Approval',
  approved: 'Approved',
  declined: 'Declined',
  returned: 'Returned',
  cancelled: 'Cancelled',
};

export function StatusBadge({
  status,
}: {
  status: ToolStatus | LoanStatus | string;
}) {
  const style =
    badgeStyles[status] ?? 'bg-slate-100 text-slate-700 ring-slate-500/20';
  const label = badgeLabels[status] ?? status.replaceAll('_', ' ');

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${style}`}
    >
      {label}
    </span>
  );
}
