// app/page.tsx
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Navbar } from '@/components/Navbar';
import { StatusBadge, type ToolStatus } from '@/components/StatusBadge';

interface CatalogTool {
  _id: string;
  name: string;
  category: string;
  description?: string;
  condition?: string;
  status: ToolStatus;
  ownerTrustedLender?: boolean;
  neighborhood?: string;
}

const PAGE_SIZE_OPTIONS = [6, 9, 12, 24];

function VerifiedLenderBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
      <svg
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
        className="h-3.5 w-3.5 text-sky-600"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
          clipRule="evenodd"
        />
      </svg>
      <span>Verified</span>
    </span>
  );
}

export default function HomePage() {
  const tools = useQuery(api.tools.listPublic) as CatalogTool[] | undefined;

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | ToolStatus>(
    'all',
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);

  const categories = useMemo(() => {
    if (!tools) return [];
    const set = new Set<string>();
    for (const tool of tools) {
      if (tool.category) set.add(tool.category);
    }
    return Array.from(set).sort();
  }, [tools]);

  const filteredTools = useMemo(() => {
    if (!tools) return [];
    const q = search.trim().toLowerCase();

    return tools.filter((tool) => {
      if (selectedCategory !== 'all' && tool.category !== selectedCategory) {
        return false;
      }
      if (selectedStatus !== 'all' && tool.status !== selectedStatus) {
        return false;
      }
      if (!q) return true;

      const haystack = [
        tool.name,
        tool.category,
        tool.description ?? '',
        tool.neighborhood ?? '',
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [tools, search, selectedCategory, selectedStatus]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedCategory, selectedStatus, pageSize]);

  const totalItems = filteredTools.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedTools = filteredTools.slice(startIndex, endIndex);

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
              Neighborhood Tool Library
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Borrow tools from nearby neighbors
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Browse shared drills, saws, garden gear, and ladders—request only
              the dates you need.
            </p>
          </div>

          <Link
            href="/my-tools"
            className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Share a Tool
          </Link>
        </div>

        <section
          aria-label="Filter tools"
          className="mb-6 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:grid-cols-4"
        >
          <div className="sm:col-span-2">
            <label
              htmlFor="tool-search"
              className="block text-xs font-medium text-slate-700"
            >
              Search tools
            </label>
            <input
              id="tool-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="e.g., cordless drill, miter saw, hedge trimmer..."
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div>
            <label
              htmlFor="tool-category"
              className="block text-xs font-medium text-slate-700"
            >
              Category
            </label>
            <select
              id="tool-category"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="all">All categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="tool-status"
              className="block text-xs font-medium text-slate-700"
            >
              Availability
            </label>
            <select
              id="tool-status"
              value={selectedStatus}
              onChange={(e) =>
                setSelectedStatus(e.target.value as 'all' | ToolStatus)
              }
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="all">All statuses</option>
              <option value="available">Available</option>
              <option value="borrowed">Borrowed</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </section>

        {tools !== undefined && totalItems > 0 && (
          <div className="mb-4 flex flex-col items-start justify-between gap-2 text-xs text-slate-600 sm:flex-row sm:items-center">
            <p>
              Showing <strong>{startIndex + 1}</strong>–
              <strong>{endIndex}</strong> of <strong>{totalItems}</strong>{' '}
              {totalItems === 1 ? 'tool' : 'tools'}
            </p>

            <div className="flex items-center gap-2">
              <label htmlFor="catalog-page-size" className="font-medium">
                Per page:
              </label>
              <select
                id="catalog-page-size"
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
        )}

        {tools === undefined && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="h-48 animate-pulse rounded-xl border border-slate-200 bg-white p-5"
              />
            ))}
          </div>
        )}

        {tools !== undefined && totalItems === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <h2 className="text-base font-semibold text-slate-900">
              No matching tools found
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Try clearing your filters or check back as neighbors list new
              equipment.
            </p>
            {(search ||
              selectedCategory !== 'all' ||
              selectedStatus !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setSelectedCategory('all');
                  setSelectedStatus('all');
                }}
                className="mt-4 rounded-lg border border-slate-300 px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Reset filters
              </button>
            )}
          </div>
        )}

        {tools !== undefined && paginatedTools.length > 0 && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {paginatedTools.map((tool) => (
                <Link
                  key={tool._id}
                  href={`/tools/${tool._id}`}
                  className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-indigo-300 hover:shadow-md"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                        {tool.category}
                      </span>
                      <StatusBadge status={tool.status} />
                    </div>

                    <h2 className="mt-3 text-lg font-semibold text-slate-900 group-hover:text-indigo-600">
                      {tool.name}
                    </h2>

                    {tool.description && (
                      <p className="mt-1.5 line-clamp-2 text-sm text-slate-600">
                        {tool.description}
                      </p>
                    )}
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
                    <div>
                      {tool.ownerTrustedLender ? <VerifiedLenderBadge /> : null}
                    </div>
                    <span className="font-medium text-indigo-600 group-hover:underline">
                      View &amp; borrow →
                    </span>
                  </div>
                </Link>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="mt-8 flex flex-col items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3.5 text-xs text-slate-600 shadow-xs sm:flex-row">
                <p>
                  Page <strong>{safePage}</strong> of{' '}
                  <strong>{totalPages}</strong>
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
            )}
          </>
        )}
      </main>
    </div>
  );
}
