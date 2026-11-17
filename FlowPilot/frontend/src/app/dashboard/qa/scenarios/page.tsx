import DashboardLayout from '@/components/layout/DashboardLayout';
import QAScenarioGenerator from '@/components/ai-assistant/QAScenarioGenerator';

export default function QAScenariosPage() {
  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-6 p-5 sm:p-7 lg:p-8">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-400">Quality engineering</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-100">Test Scenario Generator</h1>
          <p className="mt-1 text-sm text-slate-400">Turn product requirements into structured, reviewable QA coverage.</p>
        </header>
        <QAScenarioGenerator />
      </div>
    </DashboardLayout>
  );
}
