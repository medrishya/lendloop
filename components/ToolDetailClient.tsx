// components/ToolDetailClient.tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Show, SignInButton } from '@clerk/nextjs';
import { ConvexError } from 'convex/values';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { StatusBadge, type ToolStatus } from '@/components/StatusBadge';
import { useProvisionCurrentUser } from '@/components/UserSyncBanner';
import { getFriendlyErrorMessage } from '@/lib/errors';

interface ToolDetail {
  _id: Id<'tools'>;
  ownerId: Id<'users'>;
  name: string;
  category: string;
  description?: string;
  condition?: string;
  status: ToolStatus;
  ownerName?: string;
  neighborhood?: string;
}

interface CurrentUserDoc {
  _id: Id<'users'>;
}

function extractBorrowErrorMessage(err: unknown): string {
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

  return getFriendlyErrorMessage(err, 'Could not submit borrow request.');
}

export function ToolDetailClient({ toolId }: { toolId: Id<'tools'> }) {
  const router = useRouter();

  const { isProvisioned } = useProvisionCurrentUser();
  const currentUser = useQuery(
    api.users.currentProfile,
    isProvisioned ? {} : 'skip',
  ) as CurrentUserDoc | null | undefined;

  const tool = useQuery(api.tools.getById, { toolId }) as
    | ToolDetail
    | null
    | undefined;
  const requestBorrow = useMutation(api.loans.requestBorrow);

  const todayStr = new Date().toISOString().slice(0, 10);
  const tomorrowStr = new Date(Date.now() + 86_400_000)
    .toISOString()
    .slice(0, 10);

  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(tomorrowStr);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const isSelfListed = Boolean(
    currentUser?._id && tool?.ownerId && currentUser._id === tool.ownerId,
  );
  const isInactive = tool?.status === 'inactive';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (isSelfListed) {
      setErrorMsg('You cannot borrow a tool that you listed yourself.');
      return;
    }

    if (!startDate || !endDate) {
      setErrorMsg('Please select both a start date and an end date.');
      return;
    }
    if (endDate < startDate) {
      setErrorMsg('End date must be on or after the start date.');
      return;
    }

    setSubmitting(true);
    try {
      await requestBorrow({
        toolId,
        startDate,
        endDate,
        notes: notes.trim() || undefined,
      });
      setSuccessMsg(
        'Borrow request sent! The tool owner will review and respond.',
      );
      setNotes('');
      router.push('/my-loans');
    } catch (err) {
      setErrorMsg(extractBorrowErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link
        href="/"
        className="inline-flex items-center text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        ← Back to catalog
      </Link>

      {tool === undefined && (
        <div className="mt-6 h-64 animate-pulse rounded-xl border border-slate-200 bg-white p-6" />
      )}

      {tool === null && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-8 text-center">
          <h1 className="text-lg font-semibold text-slate-900">
            Tool not found
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            This listing may have been removed or is no longer available.
          </p>
        </div>
      )}

      {tool && (
        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* Tool Details */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs md:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                {tool.category}
              </span>
              <StatusBadge status={tool.status} />
            </div>

            <h1 className="mt-4 text-2xl font-bold text-slate-900">
              {tool.name}
            </h1>

            <dl className="mt-4 grid grid-cols-2 gap-4 border-y border-slate-100 py-4 text-sm">
              <div>
                <dt className="text-slate-500">Shared by</dt>
                <dd className="mt-0.5 font-medium text-slate-900">
                  {isSelfListed
                    ? `${tool.ownerName ?? 'You'} (You)`
                    : (tool.ownerName ?? 'Neighbor')}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Condition</dt>
                <dd className="mt-0.5 font-medium text-slate-900">
                  {tool.condition || 'Good Working Order'}
                </dd>
              </div>
              {tool.neighborhood && (
                <div className="col-span-2">
                  <dt className="text-slate-500">Area</dt>
                  <dd className="mt-0.5 font-medium text-slate-900">
                    {tool.neighborhood}
                  </dd>
                </div>
              )}
            </dl>

            <div className="mt-4">
              <h2 className="text-sm font-semibold text-slate-900">
                Description &amp; Usage Notes
              </h2>
              <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-600">
                {tool.description ||
                  'No extra description provided by the owner.'}
              </p>
            </div>
          </div>

          {/* Borrow Request Sidebar */}
          <aside className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
            <h2 className="text-base font-semibold text-slate-900">
              Request to Borrow
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Pick your start and return dates. Overlapping approved dates are
              checked automatically.
            </p>

            <Show when="signed-out">
              <div className="mt-5 rounded-lg bg-slate-50 p-4 text-center">
                <p className="text-sm text-slate-700">
                  Sign in to request this tool from your neighbor.
                </p>
                <div className="mt-3">
                  <SignInButton mode="modal">
                    <button
                      type="button"
                      className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                    >
                      Sign in to request
                    </button>
                  </SignInButton>
                </div>
              </div>
            </Show>

            <Show when="signed-in">
              {isSelfListed ? (
                <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  <p className="font-medium text-slate-900">
                    This is your own listing
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    You cannot submit a borrow request for your own tool.
                  </p>
                  <Link
                    href="/my-tools"
                    className="mt-3 inline-block text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                  >
                    Manage in My Tools →
                  </Link>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                  <div>
                    <label
                      htmlFor="start-date"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Start date
                    </label>
                    <input
                      id="start-date"
                      type="date"
                      min={todayStr}
                      value={startDate}
                      disabled={submitting || isInactive || !isProvisioned}
                      onChange={(e) => {
                        const nextStart = e.target.value;
                        setStartDate(nextStart);
                        if (endDate < nextStart) {
                          setEndDate(nextStart);
                        }
                      }}
                      required
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-100"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="end-date"
                      className="block text-xs font-medium text-slate-700"
                    >
                      End date
                    </label>
                    <input
                      id="end-date"
                      type="date"
                      min={startDate || todayStr}
                      value={endDate}
                      disabled={submitting || isInactive || !isProvisioned}
                      onChange={(e) => setEndDate(e.target.value)}
                      required
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-100"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="loan-notes"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Pickup note for owner (optional)
                    </label>
                    <textarea
                      id="loan-notes"
                      rows={3}
                      value={notes}
                      disabled={submitting || isInactive || !isProvisioned}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Share your project or preferred pickup time..."
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-100"
                    />
                  </div>

                  {errorMsg && (
                    <div
                      role="alert"
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
                    >
                      {errorMsg}
                    </div>
                  )}

                  {successMsg && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                      {successMsg}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting || isInactive || !isProvisioned}
                    className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {!isProvisioned
                      ? 'Preparing Profile...'
                      : submitting
                        ? 'Sending request...'
                        : isInactive
                          ? 'Currently Inactive'
                          : 'Submit Borrow Request'}
                  </button>
                </form>
              )}
            </Show>
          </aside>
        </div>
      )}
    </main>
  );
}
