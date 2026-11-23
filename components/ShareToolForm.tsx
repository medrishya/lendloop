// components/ShareToolForm.tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { getFriendlyErrorMessage } from '@/lib/errors';

const COMMON_CATEGORIES = [
  'Power Tools',
  'Hand Tools',
  'Garden & Yard',
  'Ladders & Scaffolding',
  'Cleaning & Pressure Washers',
  'Painting & Prep',
  'Measuring & Diagnostics',
];

const CONDITION_OPTIONS = [
  'Like New',
  'Good Working Order',
  'Well-Used (Reliable)',
  'Needs Care / Minor Wear',
];

interface ShareToolFormProps {
  onCreated?: () => void;
}

export function ShareToolForm({ onCreated }: ShareToolFormProps) {
  const createTool = useMutation(api.tools.create);

  const [name, setName] = useState('');
  const [category, setCategory] = useState(COMMON_CATEGORIES[0]);
  const [customCategory, setCustomCategory] = useState('');
  const [condition, setCondition] = useState(CONDITION_OPTIONS[1]);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const isCustomCategory = category === '__custom__';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const trimmedName = name.trim();
    const resolvedCategory = isCustomCategory
      ? customCategory.trim()
      : category.trim();

    if (!trimmedName) {
      setErrorMsg('Please enter a tool name.');
      return;
    }
    if (!resolvedCategory) {
      setErrorMsg('Please choose or enter a category.');
      return;
    }

    setSubmitting(true);
    try {
      await createTool({
        name: trimmedName,
        category: resolvedCategory,
        condition: condition.trim() || undefined,
        description: description.trim() || undefined,
      });

      setName('');
      setCustomCategory('');
      setDescription('');
      onCreated?.();
    } catch (err) {
      setErrorMsg(
        getFriendlyErrorMessage(err, 'Could not publish your tool listing.'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-xs"
    >
      <div>
        <h2 className="text-base font-semibold text-slate-900">
          Share a Tool with Neighbors
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Your tool starts as <strong>Available</strong> once listed. You can
          pause availability anytime.
        </p>
      </div>

      <div>
        <label
          htmlFor="share-tool-name"
          className="block text-xs font-medium text-slate-700"
        >
          Tool name <span className="text-rose-600">*</span>
        </label>
        <input
          id="share-tool-name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., 18V Cordless Drill or Step Ladder"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="share-tool-category"
            className="block text-xs font-medium text-slate-700"
          >
            Category <span className="text-rose-600">*</span>
          </label>
          <select
            id="share-tool-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            {COMMON_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
            <option value="__custom__">Other (custom category)...</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="share-tool-condition"
            className="block text-xs font-medium text-slate-700"
          >
            Condition
          </label>
          <select
            id="share-tool-condition"
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            {CONDITION_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isCustomCategory && (
        <div>
          <label
            htmlFor="share-tool-custom-category"
            className="block text-xs font-medium text-slate-700"
          >
            Custom category <span className="text-rose-600">*</span>
          </label>
          <input
            id="share-tool-custom-category"
            type="text"
            required
            value={customCategory}
            onChange={(e) => setCustomCategory(e.target.value)}
            placeholder="e.g., Plumbing or Tile Work"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
      )}

      <div>
        <label
          htmlFor="share-tool-description"
          className="block text-xs font-medium text-slate-700"
        >
          Description, accessories &amp; pickup notes (optional)
        </label>
        <textarea
          id="share-tool-description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Include battery details, drill bits, safety tips, or preferred handoff times."
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
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
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700"
        >
          {successMsg}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? 'Listing Tool...' : 'Publish Tool'}
      </button>
    </form>
  );
}
