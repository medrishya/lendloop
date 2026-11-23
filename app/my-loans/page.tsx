// app/my-loans/page.tsx
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Show, SignInButton } from '@clerk/nextjs';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Navbar } from '@/components/Navbar';
import { StatusBadge, type LoanStatus } from '@/components/StatusBadge';
import { useProvisionCurrentUser } from '@/components/UserSyncBanner';
import { getFriendlyErrorMessage } from '@/lib/errors';

interface BorrowerLoan {
  _id: Id<'loans'>;
  _creationTime?: number;
  toolId: Id<'tools'>;
  toolName: string;
  ownerName?: string;
  startDate: string;
  endDate: string;
  status: LoanStatus;
  reminderCount?: number;
  returnedAt?: number;
  createdAt?: number;
}

interface LoanAutomationEvent {
  _id: string;
  eventType: string;
  idempotencyKey?: string;
  occurredAt?: number;
  status?: string;
  errorMessage?: string;
}

const STATUS_FILTERS: Array<{ label: string; value: 'all' | LoanStatus }> = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Returned', value: 'returned' },
  { label: 'Declined', value: 'declined' },
];

const PAGE_SIZE_OPTIONS = [5, 10, 20];

function sortNewestFirst(items: BorrowerLoan[]): BorrowerLoan[] {
  return [...items]
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const timeA =
        a.item.createdAt ?? a.item.returnedAt ?? a.item._creationTime;
      const timeB =
        b.item.createdAt ?? b.item.returnedAt ?? b.item._creationTime;

      if (typeof timeA === 'number' && typeof timeB === 'number') {
        if (timeB !== timeA) return timeB - timeA;
      }

      if (a.item.startDate !== b.item.startDate) {
        return b.item.startDate.localeCompare(a.item.startDate);
      }

      return b.index - a.index;
    })
    .map(({ item }) => item);
}

export default function MyLoansPage() {
  const { isProvisioned } = useProvisionCurrentUser();

  const loans = useQuery(
    api.loans.listMyBorrowRequests,
    isProvisioned ? {} : 'skip',
  ) as BorrowerLoan[] | undefined;

  const markLoanReturned = useMutation(api.loans.markLoanReturned);

  const [statusFilter, setStatusFilter] = useState<'all' | LoanStatus>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [selectedLoanId, setSelectedLoanId] = useState<Id<'loans'> | null>(
    null,
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'error' | 'success';
    text: string;
  } | null>(null);

  const events = useQuery(
    api.loans.getLoanAutomationEvents,
    isProvisioned && selectedLoanId ? { loanId: selectedLoanId } : 'skip',
  ) as LoanAutomationEvent[] | undefined;

  const sortedLoans = useMemo(
    () => (loans ? sortNewestFirst(loans) : []),
    [loans],
  );

  const filteredLoans = useMemo(
    () =>
      sortedLoans.filter((loan) =>
        statusFilter === 'all' ? true : loan.status === statusFilter,
      ),
    [sortedLoans, statusFilter],
  );

  const totalItems = filteredLoans.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedLoans = filteredLoans.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedLoanId(null);
  }, [statusFilter, pageSize]);

  async function handleReturn(loanId: Id<'loans'>, toolName: string) {
    setFeedback(null);
    setBusyId(loanId);
    try {
      await markLoanReturned({ loanId });
      setFeedback({
        type: 'success',
        text: `Marked "${toolName}" as returned.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: getFriendlyErrorMessage(err, 'Could not mark loan as returned.'),
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              My Borrowed Tools
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Track pending borrow requests, active loans, return status, and
              notification history.
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Browse Catalog
          </Link>
        </div>

        <Show when="signed-out">
          <div className="mt-8 rounded-xl border border-slate-200 bg-white p-10 text-center">
            <h2 className="text-base font-semibold text-slate-900">
              Sign in to view your loans
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              See your pending requests, active borrowed tools, and return
              history.
            </p>
            <div className="mt-4">
              <SignInButton mode="modal">
                <button
                  type="button"
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Sign in
                </button>
              </SignInButton>
            </div>
          </div>
        </Show>

        <Show when="signed-in">
          {feedback && (
            <div
              role="status"
              className={`mt-6 rounded-lg border px-4 py-3 text-sm ${
                feedback.type === 'error'
                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
              }`}
            >
              {feedback.text}
            </div>
          )}

          {/* Filter Pills */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map((tab) => {
                const active = statusFilter === tab.value;
                const count =
                  tab.value === 'all'
                    ? sortedLoans.length
                    : sortedLoans.filter((l) => l.status === tab.value).length;

                return (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setStatusFilter(tab.value)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                      active
                        ? 'bg-slate-900 text-white'
                        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[11px] ${
                        active
                          ? 'bg-slate-700 text-slate-100'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {isProvisioned && loans !== undefined && totalItems > 0 && (
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <label htmlFor="page-size" className="font-medium">
                  Per page:
                </label>
                <select
                  id="page-size"
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {(!isProvisioned || loans === undefined) && (
            <div className="mt-6 space-y-3">
              <div className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white p-5" />
              <div className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white p-5" />
            </div>
          )}

          {isProvisioned && loans !== undefined && totalItems === 0 && (
            <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <h2 className="text-base font-semibold text-slate-900">
                {statusFilter === 'all'
                  ? 'No borrow requests yet'
                  : `No ${statusFilter} loans`}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {statusFilter === 'all'
                  ? 'Find a tool in the neighborhood catalog and request dates that fit your project.'
                  : 'Switch status tabs or check all your loan history.'}
              </p>
              {statusFilter === 'all' && (
                <div className="mt-4">
                  <Link
                    href="/"
                    className="inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                  >
                    Explore Tools
                  </Link>
                </div>
              )}
            </div>
          )}

          {isProvisioned && loans && paginatedLoans.length > 0 && (
            <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
              <ul className="divide-y divide-slate-100">
                {paginatedLoans.map((loan) => {
                  const isSelected = selectedLoanId === loan._id;
                  return (
                    <li key={loan._id} className="p-5">
                      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                        <div>
                          <div className="flex flex-wrap items-center gap-2.5">
                            <Link
                              href={`/tools/${loan.toolId}`}
                              className="font-semibold text-slate-900 hover:text-indigo-600"
                            >
                              {loan.toolName}
                            </Link>
                            <StatusBadge status={loan.status} />
                            {typeof loan.reminderCount === 'number' &&
                              loan.reminderCount > 0 && (
                                <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                                  {loan.reminderCount} reminder
                                  {loan.reminderCount === 1 ? '' : 's'}
                                </span>
                              )}
                          </div>

                          <p className="mt-1 text-xs text-slate-600">
                            Lender:{' '}
                            <strong>{loan.ownerName ?? 'Neighbor'}</strong> ·{' '}
                            <span className="font-medium text-slate-800">
                              {loan.startDate} → {loan.endDate}
                            </span>
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedLoanId(isSelected ? null : loan._id)
                            }
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            {isSelected ? 'Hide Activity' : 'Activity'}
                          </button>

                          {loan.status === 'approved' && (
                            <button
                              type="button"
                              disabled={busyId === loan._id}
                              onClick={() =>
                                handleReturn(loan._id, loan.toolName)
                              }
                              className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
                            >
                              {busyId === loan._id
                                ? 'Returning...'
                                : 'Mark Returned'}
                            </button>
                          )}
                        </div>
                      </div>

                      {isSelected && (
                        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                          <p className="text-xs font-semibold text-slate-800">
                            Workflow &amp; Notification Events
                          </p>
                          {events === undefined && (
                            <p className="mt-1.5 text-xs text-slate-500">
                              Loading events...
                            </p>
                          )}
                          {events !== undefined && events.length === 0 && (
                            <p className="mt-1.5 text-xs text-slate-500">
                              No automation events recorded for this loan yet.
                            </p>
                          )}
                          {events && events.length > 0 && (
                            <ul className="mt-2 space-y-1.5">
                              {events.map((ev) => (
                                <li
                                  key={ev._id}
                                  className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700"
                                >
                                  <span className="font-medium">
                                    {ev.eventType.replaceAll('_', ' ')}
                                  </span>
                                  <span className="text-[11px] text-slate-500">
                                    {ev.occurredAt
                                      ? new Date(ev.occurredAt).toLocaleString()
                                      : ''}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>

              {/* Pagination Footer */}
              <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3.5 text-xs text-slate-600 sm:flex-row">
                <p>
                  Showing <strong>{startIndex + 1}</strong>–
                  <strong>{endIndex}</strong> of <strong>{totalItems}</strong>{' '}
                  {totalItems === 1 ? 'loan' : 'loans'}
                </p>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Previous
                  </button>

                  {Array.from({ length: totalPages }, (_, idx) => idx + 1).map(
                    (pageNum) => (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => setCurrentPage(pageNum)}
                        aria-current={safePage === pageNum ? 'page' : undefined}
                        className={`h-8 min-w-8 rounded-lg px-2.5 font-medium transition ${
                          safePage === pageNum
                            ? 'bg-slate-900 text-white'
                            : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {pageNum}
                      </button>
                    ),
                  )}

                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </Show>
      </main>
    </div>
  );
}
