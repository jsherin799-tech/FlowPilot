import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Code2 } from 'lucide-react';

export default function CodeReviewPage() {
  return (
    <DashboardLayout>
      <div className="mx-auto flex min-h-full max-w-3xl items-center justify-center p-6">
        <section className="w-full rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
          <Code2 className="mx-auto h-9 w-9 text-indigo-400" />
          <h1 className="mt-4 text-xl font-semibold text-slate-100">Code Review Workspace</h1>
          <p className="mt-2 text-sm text-slate-400">
            Pull requests will appear here after a source control integration is connected.
          </p>
          <Link href="/dashboard/settings" className="mt-5 inline-flex rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-indigo-500/40 hover:text-white">
            Review workspace settings
          </Link>
        </section>
      </div>
    </DashboardLayout>
  );
}
