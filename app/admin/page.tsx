// app/admin/page.tsx
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Show, SignInButton } from '@clerk/nextjs';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Navbar } from '@/components/Navbar';
import {
  StatusBadge,
  type LoanStatus,
  type ToolStatus,
} from '@/components/StatusBadge';
import { useProvisionCurrentUser } from '@/components/UserSyncBanner';
import { getFriendlyErrorMessage } from '@/lib/errors';

interface AdminUser {
  _id: Id<'users'>;
  _creationTime?: number;
  clerkId: string;
  name?: string;
  email?: string;
  role: 'user' | 'admin';
  trustedLender: boolean;
  createdAt?: number;
}

interface AdminTool {
  _id: Id<'tools'>;
  _creationTime?: number;
  ownerId: Id<'users'>;
  name: string;
  category: string;
  condition: string;
  status: ToolStatus;
  ownerName: string;
  ownerTrustedLender: boolean;
  createdAt?: number;
}

interface AdminLoan {
  _id: Id<'loans'>;
  _creationTime?: number;
  createdAt?: number;
  toolId: Id<'tools'>;
  toolName: string;
  ownerName: string;
  borrowerName: string;
  startDate: string;
  endDate: string;
  status: LoanStatus;
  reminderCount?: number;
}

type AdminTab = 'tools' | 'loans' | 'users';

const PAGE_SIZE_OPTIONS = [5, 10, 20];

function sortNewestFirst<
  T extends { createdAt?: number; _creationTime?: number; startDate?: string },
>(items: T[]): T[] {
  return [...items]
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const timeA = a.item.createdAt ?? a.item._creationTime;
      const timeB = b.item.createdAt ?? b.item._creationTime;

      if (typeof timeA === 'number' && typeof timeB === 'number') {
        if (timeB !== timeA) return timeB - timeA;
      }

      if (
        a.item.startDate &&
        b.item.startDate &&
        a.item.startDate !== b.item.startDate
      ) {
        return b.item.startDate.localeCompare(a.item.startDate);
      }

      return b.index - a.index;
    })
    .map(({ item }) => item);
}

interface PaginationFooterProps {
  currentPage: number;
  totalPages: number;
  startIndex: number;
  endIndex: number;
  totalItems: number;
  singularLabel: string;
  pluralLabel: string;
  onPageChange: (page: number) => void;
}

function PaginationFooter({
  currentPage,
  totalPages,
  startIndex,
  endIndex,
  totalItems,
  singularLabel,
  pluralLabel,
  onPageChange,
}: PaginationFooterProps) {
  if (totalItems === 0) return null;

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3.5 text-xs text-slate-600 sm:flex-row">
      <p>
        Showing <strong>{startIndex + 1}</strong>–<strong>{endIndex}</strong> of{' '}
        <strong>{totalItems}</strong>{' '}
        {totalItems === 1 ? singularLabel : pluralLabel}
      </p>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>

        {Array.from({ length: totalPages }, (_, idx) => idx + 1).map(
          (pageNum) => (
            <button
              key={pageNum}
              type="button"
              onClick={() => onPageChange(pageNum)}
              aria-current={currentPage === pageNum ? 'page' : undefined}
              className={`h-8 min-w-8 rounded-lg px-2.5 font-medium transition ${
                currentPage === pageNum
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
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { isProvisioned } = useProvisionCurrentUser();

  const currentProfile = useQuery(
    api.users.currentProfile,
    isProvisioned ? {} : 'skip',
  ) as AdminUser | null | undefined;

  const isAdmin = currentProfile?.role === 'admin';

  const tools = useQuery(
    api.tools.listAllToolsForAdmin,
    isProvisioned && isAdmin ? {} : 'skip',
  ) as AdminTool[] | undefined;

  const loans = useQuery(
    api.loans.listAllLoansForAdmin,
    isProvisioned && isAdmin ? {} : 'skip',
  ) as AdminLoan[] | undefined;

  const users = useQuery(
    api.users.listAllUsersForAdmin,
    isProvisioned && isAdmin ? {} : 'skip',
  ) as AdminUser[] | undefined;

  const adminRemoveTool = useMutation(api.tools.adminRemoveTool);
  const setTrustedLender = useMutation(api.users.setTrustedLender);

  const [activeTab, setActiveTab] = useState<AdminTab>('tools');
  const [pageSize, setPageSize] = useState(5);

  const [toolsPage, setToolsPage] = useState(1);
  const [loansPage, setLoansPage] = useState(1);
  const [usersPage, setUsersPage] = useState(1);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<Id<'tools'> | null>(
    null,
  );
  const [feedback, setFeedback] = useState<{
    type: 'error' | 'success';
    text: string;
  } | null>(null);

  useEffect(() => {
    setToolsPage(1);
    setLoansPage(1);
    setUsersPage(1);
    setConfirmDeleteId(null);
  }, [activeTab, pageSize]);

  const sortedTools = useMemo(
    () => (tools ? sortNewestFirst(tools) : []),
    [tools],
  );
  const sortedLoans = useMemo(
    () => (loans ? sortNewestFirst(loans) : []),
    [loans],
  );
  const sortedUsers = useMemo(
    () => (users ? sortNewestFirst(users) : []),
    [users],
  );

  // Tools pagination
  const totalTools = sortedTools.length;
  const totalToolsPages = Math.max(1, Math.ceil(totalTools / pageSize));
  const safeToolsPage = Math.min(toolsPage, totalToolsPages);
  const toolsStartIndex = (safeToolsPage - 1) * pageSize;
  const toolsEndIndex = Math.min(toolsStartIndex + pageSize, totalTools);
  const paginatedTools = sortedTools.slice(toolsStartIndex, toolsEndIndex);

  // Loans pagination
  const totalLoans = sortedLoans.length;
  const totalLoansPages = Math.max(1, Math.ceil(totalLoans / pageSize));
  const safeLoansPage = Math.min(loansPage, totalLoansPages);
  const loansStartIndex = (safeLoansPage - 1) * pageSize;
  const loansEndIndex = Math.min(loansStartIndex + pageSize, totalLoans);
  const paginatedLoans = sortedLoans.slice(loansStartIndex, loansEndIndex);

  // Users pagination
  const totalUsers = sortedUsers.length;
  const totalUsersPages = Math.max(1, Math.ceil(totalUsers / pageSize));
  const safeUsersPage = Math.min(usersPage, totalUsersPages);
  const usersStartIndex = (safeUsersPage - 1) * pageSize;
  const usersEndIndex = Math.min(usersStartIndex + pageSize, totalUsers);
  const paginatedUsers = sortedUsers.slice(usersStartIndex, usersEndIndex);

  async function handleRemoveTool(toolId: Id<'tools'>, toolName: string) {
    setFeedback(null);
    setBusyId(toolId);
    try {
      await adminRemoveTool({ toolId });
      setConfirmDeleteId(null);
      setFeedback({
        type: 'success',
        text: `Removed listing "${toolName}".`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: getFriendlyErrorMessage(err, 'Failed to remove listing.'),
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleTrusted(user: AdminUser) {
    setFeedback(null);
    setBusyId(user._id);
    const nextValue = !user.trustedLender;
    try {
      await setTrustedLender({
        targetUserId: user._id,
        trustedLender: nextValue,
      });
      setFeedback({
        type: 'success',
        text: nextValue
          ? `${user.name ?? 'Member'} marked as Trusted Lender.`
          : `Removed Trusted Lender badge from ${user.name ?? 'Member'}.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: getFriendlyErrorMessage(
          err,
          'Could not update Trusted Lender status.',
        ),
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Community Moderation &amp; Admin
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Review neighborhood listings, monitor all loans, and verify Trusted
            Lenders.
          </p>
        </div>

        <Show when="signed-out">
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
            <h2 className="text-base font-semibold text-slate-900">
              Admin sign-in required
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Sign in with an administrator account to access moderation tools.
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
          {(!isProvisioned || currentProfile === undefined) && (
            <div className="h-40 animate-pulse rounded-xl border border-slate-200 bg-white p-6" />
          )}

          {isProvisioned && currentProfile !== undefined && !isAdmin && (
            <div className="rounded-xl border border-rose-200 bg-white p-10 text-center">
              <h2 className="text-base font-semibold text-slate-900">
                Access Denied
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Your account does not have administrator privileges.
              </p>
              <div className="mt-4">
                <Link
                  href="/"
                  className="inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Return to Catalog
                </Link>
              </div>
            </div>
          )}

          {isProvisioned && isAdmin && (
            <>
              {feedback && (
                <div
                  role="status"
                  className={`mb-6 rounded-lg border px-4 py-3 text-sm ${
                    feedback.type === 'error'
                      ? 'border-rose-200 bg-rose-50 text-rose-700'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {feedback.text}
                </div>
              )}

              {/* Summary Metrics */}
              <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                  <p className="text-xs font-medium text-slate-500">
                    Total Tool Listings
                  </p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">
                    {tools?.length ?? '—'}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                  <p className="text-xs font-medium text-slate-500">
                    Total Loans Recorded
                  </p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">
                    {loans?.length ?? '—'}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                  <p className="text-xs font-medium text-slate-500">
                    Trusted Lenders
                  </p>
                  <p className="mt-1 text-2xl font-bold text-emerald-700">
                    {users ? users.filter((u) => u.trustedLender).length : '—'}
                  </p>
                </div>
              </div>

              {/* Navigation Tabs + Page Size */}
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('tools')}
                    className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
                      activeTab === 'tools'
                        ? 'bg-slate-900 text-white'
                        : 'bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Listings ({tools?.length ?? 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('loans')}
                    className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
                      activeTab === 'loans'
                        ? 'bg-slate-900 text-white'
                        : 'bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    All Loans ({loans?.length ?? 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('users')}
                    className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
                      activeTab === 'users'
                        ? 'bg-slate-900 text-white'
                        : 'bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Lenders &amp; Members ({users?.length ?? 0})
                  </button>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <label htmlFor="admin-page-size" className="font-medium">
                    Per page:
                  </label>
                  <select
                    id="admin-page-size"
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
              </div>

              {/* TAB 1: Listings Moderation */}
              {activeTab === 'tools' && (
                <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
                  {tools === undefined && (
                    <p className="p-6 text-sm text-slate-500">
                      Loading listings...
                    </p>
                  )}

                  {tools && totalTools === 0 && (
                    <p className="p-6 text-sm text-slate-500">
                      No tools listed in the catalog yet.
                    </p>
                  )}

                  {tools && paginatedTools.length > 0 && (
                    <>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                          <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                            <tr>
                              <th className="px-5 py-3.5">Tool</th>
                              <th className="px-5 py-3.5">Category</th>
                              <th className="px-5 py-3.5">Owner</th>
                              <th className="px-5 py-3.5">Status</th>
                              <th className="px-5 py-3.5 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {paginatedTools.map((tool) => {
                              const isConfirming = confirmDeleteId === tool._id;
                              const isBusy = busyId === tool._id;

                              return (
                                <tr
                                  key={tool._id}
                                  className="hover:bg-slate-50/60"
                                >
                                  <td className="px-5 py-4">
                                    <Link
                                      href={`/tools/${tool._id}`}
                                      className="font-medium text-slate-900 hover:text-indigo-600"
                                    >
                                      {tool.name}
                                    </Link>
                                    <p className="text-xs text-slate-500">
                                      {tool.condition}
                                    </p>
                                  </td>
                                  <td className="px-5 py-4 text-xs text-slate-700">
                                    {tool.category}
                                  </td>
                                  <td className="px-5 py-4 text-xs text-slate-700">
                                    <span>{tool.ownerName}</span>
                                    {tool.ownerTrustedLender && (
                                      <span className="ml-2 inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                                        Trusted
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-5 py-4">
                                    <StatusBadge status={tool.status} />
                                  </td>
                                  <td className="px-5 py-4 text-right">
                                    {isConfirming ? (
                                      <div className="inline-flex items-center gap-2">
                                        <button
                                          type="button"
                                          disabled={isBusy}
                                          onClick={() =>
                                            handleRemoveTool(
                                              tool._id,
                                              tool.name,
                                            )
                                          }
                                          className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                                        >
                                          {isBusy
                                            ? 'Removing...'
                                            : 'Confirm Remove'}
                                        </button>
                                        <button
                                          type="button"
                                          disabled={isBusy}
                                          onClick={() =>
                                            setConfirmDeleteId(null)
                                          }
                                          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setConfirmDeleteId(tool._id)
                                        }
                                        className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100"
                                      >
                                        Remove Listing
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      <PaginationFooter
                        currentPage={safeToolsPage}
                        totalPages={totalToolsPages}
                        startIndex={toolsStartIndex}
                        endIndex={toolsEndIndex}
                        totalItems={totalTools}
                        singularLabel="listing"
                        pluralLabel="listings"
                        onPageChange={setToolsPage}
                      />
                    </>
                  )}
                </section>
              )}

              {/* TAB 2: All Loans */}
              {activeTab === 'loans' && (
                <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
                  {loans === undefined && (
                    <p className="p-6 text-sm text-slate-500">
                      Loading loans...
                    </p>
                  )}

                  {loans && totalLoans === 0 && (
                    <p className="p-6 text-sm text-slate-500">
                      No borrow requests or loans recorded yet.
                    </p>
                  )}

                  {loans && paginatedLoans.length > 0 && (
                    <>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                          <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                            <tr>
                              <th className="px-5 py-3.5">Tool</th>
                              <th className="px-5 py-3.5">Lender</th>
                              <th className="px-5 py-3.5">Borrower</th>
                              <th className="px-5 py-3.5">Dates</th>
                              <th className="px-5 py-3.5">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {paginatedLoans.map((loan) => (
                              <tr
                                key={loan._id}
                                className="hover:bg-slate-50/60"
                              >
                                <td className="px-5 py-4 font-medium text-slate-900">
                                  {loan.toolName}
                                </td>
                                <td className="px-5 py-4 text-xs text-slate-700">
                                  {loan.ownerName}
                                </td>
                                <td className="px-5 py-4 text-xs text-slate-700">
                                  {loan.borrowerName}
                                </td>
                                <td className="px-5 py-4 text-xs text-slate-600">
                                  {loan.startDate} → {loan.endDate}
                                </td>
                                <td className="px-5 py-4">
                                  <div className="flex items-center gap-2">
                                    <StatusBadge status={loan.status} />
                                    {typeof loan.reminderCount === 'number' &&
                                      loan.reminderCount > 0 && (
                                        <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                                          {loan.reminderCount} reminder
                                          {loan.reminderCount === 1 ? '' : 's'}
                                        </span>
                                      )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <PaginationFooter
                        currentPage={safeLoansPage}
                        totalPages={totalLoansPages}
                        startIndex={loansStartIndex}
                        endIndex={loansEndIndex}
                        totalItems={totalLoans}
                        singularLabel="loan"
                        pluralLabel="loans"
                        onPageChange={setLoansPage}
                      />
                    </>
                  )}
                </section>
              )}

              {/* TAB 3: Trusted Lender Management */}
              {activeTab === 'users' && (
                <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
                  {users === undefined && (
                    <p className="p-6 text-sm text-slate-500">
                      Loading members...
                    </p>
                  )}

                  {users && totalUsers === 0 && (
                    <p className="p-6 text-sm text-slate-500">
                      No registered members found.
                    </p>
                  )}

                  {users && paginatedUsers.length > 0 && (
                    <>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                          <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                            <tr>
                              <th className="px-5 py-3.5">Member</th>
                              <th className="px-5 py-3.5">Role</th>
                              <th className="px-5 py-3.5">Badge</th>
                              <th className="px-5 py-3.5 text-right">
                                Verification
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {paginatedUsers.map((member) => {
                              const isBusy = busyId === member._id;
                              return (
                                <tr
                                  key={member._id}
                                  className="hover:bg-slate-50/60"
                                >
                                  <td className="px-5 py-4">
                                    <p className="font-medium text-slate-900">
                                      {member.name ?? 'Neighbor'}
                                    </p>
                                    {member.email && (
                                      <p className="text-xs text-slate-500">
                                        {member.email}
                                      </p>
                                    )}
                                  </td>
                                  <td className="px-5 py-4 text-xs">
                                    <span
                                      className={`rounded-md px-2 py-0.5 font-medium ${
                                        member.role === 'admin'
                                          ? 'bg-indigo-50 text-indigo-700'
                                          : 'bg-slate-100 text-slate-700'
                                      }`}
                                    >
                                      {member.role}
                                    </span>
                                  </td>
                                  <td className="px-5 py-4 text-xs">
                                    {member.trustedLender ? (
                                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 font-medium text-emerald-700">
                                        ✓ Trusted Lender
                                      </span>
                                    ) : (
                                      <span className="text-slate-400">
                                        Standard Member
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-5 py-4 text-right">
                                    <button
                                      type="button"
                                      disabled={isBusy}
                                      onClick={() =>
                                        handleToggleTrusted(member)
                                      }
                                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                                        member.trustedLender
                                          ? 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                                          : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                      }`}
                                    >
                                      {isBusy
                                        ? 'Saving...'
                                        : member.trustedLender
                                          ? 'Revoke Trusted'
                                          : 'Mark Trusted Lender'}
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      <PaginationFooter
                        currentPage={safeUsersPage}
                        totalPages={totalUsersPages}
                        startIndex={usersStartIndex}
                        endIndex={usersEndIndex}
                        totalItems={totalUsers}
                        singularLabel="member"
                        pluralLabel="members"
                        onPageChange={setUsersPage}
                      />
                    </>
                  )}
                </section>
              )}
            </>
          )}
        </Show>
      </main>
    </div>
  );
}
