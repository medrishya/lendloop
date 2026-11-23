// app/my-tools/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { Show, SignInButton } from '@clerk/nextjs';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Navbar } from '@/components/Navbar';
import { ShareToolForm } from '@/components/ShareToolForm';
import { StatusBadge, type ToolStatus } from '@/components/StatusBadge';
import { useProvisionCurrentUser } from '@/components/UserSyncBanner';
import { getFriendlyErrorMessage } from '@/lib/errors';

interface OwnedTool {
  _id: Id<'tools'>;
  name: string;
  category: string;
  description?: string;
  condition?: string;
  neighborhood?: string;
  status: ToolStatus;
}

const PAGE_SIZE_OPTIONS = [5, 10, 20];

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  startIndex: number;
  endIndex: number;
  totalItems: number;
  itemLabel: string;
  onPageChange: (page: number) => void;
}

function PaginationControls({
  currentPage,
  totalPages,
  startIndex,
  endIndex,
  totalItems,
  itemLabel,
  onPageChange,
}: PaginationControlsProps) {
  if (totalItems === 0) return null;

  return (
    <div className="mt-4 flex flex-col items-center justify-between gap-3 border-t border-slate-100 pt-4 text-xs text-slate-600 sm:flex-row">
      <p>
        Showing <strong>{startIndex + 1}</strong>–<strong>{endIndex}</strong> of{' '}
        <strong>{totalItems}</strong>{' '}
        {totalItems === 1 ? itemLabel : `${itemLabel}s`}
      </p>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
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
              className={`h-7 min-w-7 rounded-lg px-2 font-medium transition ${
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
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}

export default function MyToolsPage() {
  const { isProvisioned } = useProvisionCurrentUser();

  const myTools = useQuery(api.tools.listMine, isProvisioned ? {} : 'skip') as
    | OwnedTool[]
    | undefined;

  const setToolStatus = useMutation(api.tools.setStatus);

  const [toolsPage, setToolsPage] = useState(1);
  const [toolsPageSize, setToolsPageSize] = useState(5);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'error' | 'success';
    text: string;
  } | null>(null);

  useEffect(() => {
    setToolsPage(1);
  }, [toolsPageSize]);

  // Pagination calculations for Shared Tools
  const allTools = myTools ?? [];
  const totalTools = allTools.length;
  const totalToolsPages = Math.max(1, Math.ceil(totalTools / toolsPageSize));
  const safeToolsPage = Math.min(toolsPage, totalToolsPages);
  const toolsStartIndex = (safeToolsPage - 1) * toolsPageSize;
  const toolsEndIndex = Math.min(toolsStartIndex + toolsPageSize, totalTools);
  const paginatedTools = allTools.slice(toolsStartIndex, toolsEndIndex);

  async function handleStatusChange(toolId: Id<'tools'>, status: ToolStatus) {
    setFeedback(null);
    setBusyId(toolId);
    try {
      await setToolStatus({ toolId, status });
      setFeedback({
        type: 'success',
        text: 'Tool availability updated.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: getFriendlyErrorMessage(err, 'Failed to update tool status.'),
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
            Share &amp; Manage Your Tools
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Add tools to lend and control availability for your listed
            equipment.
          </p>
        </div>

        <Show when="signed-out">
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
            <h2 className="text-base font-semibold text-slate-900">
              Sign in to share and manage tools
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              You need a signed-in account so neighbors know who owns each
              listed tool.
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
              className={`mb-6 rounded-lg border px-4 py-3 text-sm ${
                feedback.type === 'error'
                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
              }`}
            >
              {feedback.text}
            </div>
          )}

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <div className="lg:col-span-1">
              <ShareToolForm
                onCreated={() => {
                  setFeedback(null);
                  setToolsPage(1);
                }}
              />
            </div>

            <div className="lg:col-span-2">
              <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-semibold text-slate-900">
                    Your Shared Tools ({totalTools})
                  </h2>

                  {isProvisioned && myTools !== undefined && totalTools > 0 && (
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <label htmlFor="tools-page-size" className="font-medium">
                        Per page:
                      </label>
                      <select
                        id="tools-page-size"
                        value={toolsPageSize}
                        onChange={(e) =>
                          setToolsPageSize(Number(e.target.value))
                        }
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none"
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

                {(!isProvisioned || myTools === undefined) && (
                  <p className="mt-4 text-sm text-slate-500">
                    Loading your tools...
                  </p>
                )}

                {isProvisioned && myTools !== undefined && totalTools === 0 && (
                  <p className="mt-3 text-sm text-slate-500">
                    You haven’t shared any tools yet. Fill out the form on the
                    left to publish your first tool.
                  </p>
                )}

                {isProvisioned && myTools && paginatedTools.length > 0 && (
                  <>
                    <div className="mt-4 divide-y divide-slate-100">
                      {paginatedTools.map((tool) => (
                        <div
                          key={tool._id}
                          className="flex flex-col justify-between gap-3 py-3.5 sm:flex-row sm:items-center"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-slate-900">
                                {tool.name}
                              </span>
                              <StatusBadge status={tool.status} />
                            </div>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {tool.category}
                              {tool.condition ? ` · ${tool.condition}` : ''}
                              {tool.neighborhood
                                ? ` · ${tool.neighborhood}`
                                : ''}
                            </p>
                            {tool.description && (
                              <p className="mt-1 line-clamp-1 text-xs text-slate-600">
                                {tool.description}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <label
                              htmlFor={`status-${tool._id}`}
                              className="sr-only"
                            >
                              Availability for {tool.name}
                            </label>
                            <select
                              id={`status-${tool._id}`}
                              disabled={
                                busyId === tool._id ||
                                tool.status === 'borrowed'
                              }
                              value={tool.status}
                              onChange={(e) =>
                                handleStatusChange(
                                  tool._id,
                                  e.target.value as ToolStatus,
                                )
                              }
                              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-50"
                            >
                              <option value="available">Available</option>
                              <option value="inactive">Unavailable</option>
                              {tool.status === 'borrowed' && (
                                <option value="borrowed">On Loan</option>
                              )}
                            </select>
                          </div>
                        </div>
                      ))}
                    </div>

                    <PaginationControls
                      currentPage={safeToolsPage}
                      totalPages={totalToolsPages}
                      startIndex={toolsStartIndex}
                      endIndex={toolsEndIndex}
                      totalItems={totalTools}
                      itemLabel="tool"
                      onPageChange={setToolsPage}
                    />
                  </>
                )}
              </section>
            </div>
          </div>
        </Show>
      </main>
    </div>
  );
}
