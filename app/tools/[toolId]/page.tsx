// app/tools/[toolId]/page.tsx
import { Suspense } from 'react';
import type { Id } from '@/convex/_generated/dataModel';
import { Navbar } from '@/components/Navbar';
import { ToolDetailClient } from '@/components/ToolDetailClient';

interface ToolPageProps {
  params: Promise<{ toolId: string }>;
}

async function ResolvedToolDetail({
  params,
}: {
  params: Promise<{ toolId: string }>;
}) {
  const { toolId } = await params;
  return <ToolDetailClient toolId={toolId as Id<'tools'>} />;
}

export default function ToolDetailPage({ params }: ToolPageProps) {
  return (
    <div className="min-h-screen bg-slate-50">
      <Suspense
        fallback={
          <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
            <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white p-6" />
          </main>
        }
      >
        <Navbar />
        <ResolvedToolDetail params={params} />
      </Suspense>
    </div>
  );
}
