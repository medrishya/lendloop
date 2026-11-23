// app/requests/page.tsx
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Show, SignInButton } from '@clerk/nextjs';
import { ConvexError } from 'convex/values';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Navbar } from '@/components/Navbar';
import { StatusBadge, type LoanStatus } from '@/components/StatusBadge';
import { useProvisionCurrentUser } from '@/components/UserSyncBanner';
import { getFriendlyErrorMessage } from '@/lib/errors';

interface LoanItem {
  _id: Id<'loans'>;
  _creationTime?: number;
  createdAt?: number;
  toolId: Id<'tools'>;
  toolName: string;
  ownerName?: string;
  borrowerName?: string;
  startDate: string;
  endDate: string;
  notes?: string;
  status: LoanStatus;
  reminderCount?: number;
}

interface LoanAutomationEvent {
  _id: string;
  eventType: string;
  idempotencyKey?: string;
  occurredAt?: number;
  status?: string;
  errorMessage?: string;
}

type RequestTab = 'my-requests' | 'incoming';
type StatusFilter = 'all' | LoanStatus;

const STATUS_FILTERS: Array<{ label: string; value: StatusFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Returned', value: 'returned' },
  { label: 'Declined', value: 'declined' },
];

const PAGE_SIZE_OPTIONS = [5, 10, 20];

function extractLoanErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ConvexError) {
    const data = err.data;
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data) as { message?: string };
        if (parsed?.message) return parsed.message;
      } catch {
        if (data.trim()) return data;
      }
    } else if (data && typeof data === 'object' && 'message' in data) {
      const msg = (data as { message?: unknown }).message;
      if (typeof msg === 'string' && msg.trim()) return msg;
    }
  }

  return getFriendlyErrorMessage(err, fallback);
}

function sortNewestFirst(items: LoanItem[]): LoanItem[] {
  return [...items]
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const timeA = a.item.createdAt ?? a.item._creationTime;
      const timeB = b.item.createdAt ?? b.item._creationTime;

      if (typeof timeA === 'number' && typeof timeB === 'number') {
        if (timeB !== timeA) return timeB - timeA;
      }

      if (a.item.startDate !== b.item.startDate) {
        return b.item.startDate.localeCompare(a.item.startDate);
      }

      // If items arrived oldest-first without timestamps, later index is newer
      return b.index - a.index;
    })
    .map(({ item }) => item);
}

export default function RequestsPage() {
  const { isProvisioned } = useProvisionCurrentUser();

  const myRequests = useQuery(
    api.loans.listMyBorrowRequests,
    isProvisioned ? {} : 'skip',
  ) as LoanItem[] | undefined;

  const incomingRequests = useQuery(
    api.loans.listIncomingRequests,
    isProvisioned ? {} : 'skip',
  ) as LoanItem[] | undefined;

  const decideBorrowRequest = useMutation(api.loans.decideBorrowRequest);
  const markLoanReturned = useMutation(api.loans.markLoanReturned);

  const [activeTab, setActiveTab] = useState<RequestTab>('my-requests');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
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

  useEffect(() => {
    setCurrentPage(1);
    setSelectedLoanId(null);
  }, [activeTab, statusFilter, pageSize]);

  const sortedSourceList = useMemo(() => {
    const raw =
      activeTab === 'my-requests'
        ? (myRequests ?? [])
        : (incomingRequests ?? []);
    return sortNewestFirst(raw);
  }, [activeTab, myRequests, incomingRequests]);

  const isLoadingList =
    !isProvisioned ||
    (activeTab === 'my-requests'
      ? myRequests === undefined
      : incomingRequests === undefined);

  const filteredItems = useMemo(
    () =>
      sortedSourceList.filter((item) =>
        statusFilter === 'all' ? true : item.status === statusFilter,
      ),
    [sortedSourceList, statusFilter],
  );

  const totalItems = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedItems = filteredItems.slice(startIndex, endIndex);

  async function handleDecision(
    loanId: Id<'loans'>,
    decision: 'approved' | 'declined',
  ) {
    setFeedback(null);
    setBusyId(loanId);
    try {
      await decideBorrowRequest({ loanId, decision });
      setFeedback({
        type: 'success',
        text:
          decision === 'approved'
            ? 'Borrow request approved.'
            : 'Borrow request declined.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: extractLoanErrorMessage(err, 'Could not update borrow request.'),
      });
    } finally {
      setBusyId(null);
    }
  }

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
        text: extractLoanErrorMessage(err, 'Could not mark loan as returned.'),
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
              Borrow Requests
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Manage requests you’ve sent to neighbors and respond to requests
              on your tools.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/my-tools"
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              My Tools
            </Link>
            <Link
              href="/my-loans"
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              My Loans
            </Link>
          </div>
        </div>

        <Show when="signed-out">
          <div className="mt-8 rounded-xl border border-slate-200 bg-white p-10 text-center">
            <h2 className="text-base font-semibold text-slate-900">
              Sign in to view your requests
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Track outgoing borrow requests and review incoming requests for
              your shared tools.
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

          {/* Primary View Switcher: My Requests vs Incoming Requests */}
          <div className="mt-6 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
            <button
              type="button"
              onClick={() => setActiveTab('my-requests')}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${
                activeTab === 'my-requests'
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span>My Requests</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[11px] ${
                  activeTab === 'my-requests'
                    ? 'bg-slate-700 text-slate-100'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {myRequests?.length ?? 0}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('incoming')}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${
                activeTab === 'incoming'
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span>Incoming Requests</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[11px] ${
                  activeTab === 'incoming'
                    ? 'bg-slate-700 text-slate-100'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {incomingRequests?.length ?? 0}
              </span>
            </button>
          </div>

          {/* Status Filter Pills & Page Size */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map((tab) => {
                const active = statusFilter === tab.value;
                const count =
                  tab.value === 'all'
                    ? sortedSourceList.length
                    : sortedSourceList.filter(
                        (item) => item.status === tab.value,
                      ).length;

                return (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setStatusFilter(tab.value)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                      active
                        ? 'bg-indigo-600 text-white'
                        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[11px] ${
                        active
                          ? 'bg-indigo-500 text-white'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {!isLoadingList && totalItems > 0 && (
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <label htmlFor="requests-page-size" className="font-medium">
                  Per page:
                </label>
                <select
                  id="requests-page-size"
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

          {/* Loading State */}
          {isLoadingList && (
            <div className="mt-6 space-y-3">
              <div className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white p-5" />
              <div className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white p-5" />
            </div>
          )}

          {/* Empty State */}
          {!isLoadingList && totalItems === 0 && (
            <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <h2 className="text-base font-semibold text-slate-900">
                {activeTab === 'my-requests'
                  ? statusFilter === 'all'
                    ? 'You haven’t sent any borrow requests yet'
                    : `No ${statusFilter} requests in My Requests`
                  : statusFilter === 'all'
                    ? 'No incoming requests for your tools yet'
                    : `No ${statusFilter} incoming requests`}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {activeTab === 'my-requests'
                  ? 'Browse the catalog to request tools from your neighbors.'
                  : 'Share tools in My Tools so neighbors can request to borrow them.'}
              </p>
              <div className="mt-4">
                <Link
                  href={activeTab === 'my-requests' ? '/' : '/my-tools'}
                  className="inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  {activeTab === 'my-requests'
                    ? 'Browse Catalog'
                    : 'Go to My Tools'}
                </Link>
              </div>
            </div>
          )}

          {/* Requests List */}
          {!isLoadingList && paginatedItems.length > 0 && (
            <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
              <ul className="divide-y divide-slate-100">
                {paginatedItems.map((item) => {
                  const isSelected = selectedLoanId === item._id;
                  const isBusy = busyId === item._id;

                  return (
                    <li key={item._id} className="p-5">
                      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                        <div>
                          <div className="flex flex-wrap items-center gap-2.5">
                            <Link
                              href={`/tools/${item.toolId}`}
                              className="font-semibold text-slate-900 hover:text-indigo-600"
                            >
                              {item.toolName}
                            </Link>
                            <StatusBadge status={item.status} />
                            {typeof item.reminderCount === 'number' &&
                              item.reminderCount > 0 && (
                                <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                                  {item.reminderCount} reminder
                                  {item.reminderCount === 1 ? '' : 's'}
                                </span>
                              )}
                          </div>

                          <p className="mt-1 text-xs text-slate-600">
                            {activeTab === 'my-requests' ? (
                              <>
                                Lender:{' '}
                                <strong>{item.ownerName ?? 'Neighbor'}</strong>
                              </>
                            ) : (
                              <>
                                Borrower:{' '}
                                <strong>
                                  {item.borrowerName ?? 'Neighbor'}
                                </strong>
                              </>
                            )}{' '}
                            ·{' '}
                            <span className="font-medium text-slate-800">
                              {item.startDate} → {item.endDate}
                            </span>
                          </p>

                          {item.notes && (
                            <p className="mt-1 text-xs italic text-slate-500">
                              &ldquo;{item.notes}&rdquo;
                            </p>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedLoanId(isSelected ? null : item._id)
                            }
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            {isSelected ? 'Hide Activity' : 'Activity'}
                          </button>

                          {activeTab === 'incoming' &&
                            item.status === 'pending' && (
                              <>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() =>
                                    handleDecision(item._id, 'approved')
                                  }
                                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() =>
                                    handleDecision(item._id, 'declined')
                                  }
                                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                >
                                  Decline
                                </button>
                              </>
                            )}

                          {activeTab === 'my-requests' &&
                            item.status === 'approved' && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() =>
                                  handleReturn(item._id, item.toolName)
                                }
                                className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
                              >
                                {isBusy ? 'Returning...' : 'Mark Returned'}
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
                              No automation events recorded for this request
                              yet.
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
                  {totalItems === 1 ? 'request' : 'requests'}
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
