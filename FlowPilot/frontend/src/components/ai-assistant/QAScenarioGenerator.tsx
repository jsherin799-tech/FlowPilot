"use client";

import React, { useState } from 'react';
import { Sparkles, Copy, Check, Cpu } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';

type ScenarioType = 'Positive' | 'Negative' | 'Validation' | 'Boundary' | 'Security';

interface Scenario {
  testId: string;
  scenario: string;
  type: ScenarioType;
  expectedResult: string;
}

export default function QAScenarioGenerator() {
  const [requirement, setRequirement] = useState('');
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!requirement.trim()) return;
    setLoading(true);

    try {
      const response = await api.post<{ success: boolean; data: { scenarios: Scenario[] } }>('/ai/generate-test-scenarios', {
        requirement: requirement.trim(),
      });
      if (response.data.success) {
        setScenarios(response.data.data.scenarios);
      } else {
        toast.error('The AI service could not generate scenarios');
      }
    } catch {
      toast.error('Failed to generate test scenarios');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      const rows = [
        ['Test ID', 'Scenario Description', 'Type', 'Expected Result'],
        ...scenarios.map(({ testId, scenario, type, expectedResult }) => [testId, scenario, type, expectedResult]),
      ];
      await navigator.clipboard.writeText(rows.map((row) => row.join('\t')).join('\n'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy scenarios to clipboard');
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Cpu className="w-5 h-5 text-indigo-400" />
          <h2 className="text-lg font-semibold text-slate-100">AI Test Scenario Generator</h2>
        </div>
        {scenarios.length > 0 && (
          <button
            onClick={copyToClipboard}
            className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg transition border border-slate-700"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy Scenarios'}
          </button>
        )}
        {!loading && scenarios.length === 0 && (
          <p className="text-xs text-slate-600">Generated positive, negative, boundary, and security cases will appear here.</p>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="qa-requirement" className="block text-xs font-medium text-slate-400">
          Requirement or feature description
        </label>
        <textarea
          id="qa-requirement"
          value={requirement}
          onChange={(e) => setRequirement(e.target.value)}
          placeholder="e.g. User should be able to reset their password using their registered email address."
          rows={3}
          minLength={5}
          maxLength={5000}
          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
        />
        <button
          onClick={handleGenerate}
          disabled={loading || requirement.trim().length < 5}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition disabled:opacity-50"
        >
          <Sparkles className="w-4 h-4" /> {loading ? 'Analyzing Requirement...' : 'Generate Scenarios'}
        </button>
      </div>

      {scenarios.length > 0 && (
        <div className="overflow-x-auto border border-slate-800 rounded-lg">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 font-mono border-b border-slate-800 uppercase">
              <tr>
                <th className="p-3">Test ID</th>
                <th className="p-3">Scenario Description</th>
                <th className="p-3">Type</th>
                <th className="p-3">Expected Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-900/50">
              {scenarios.map((row) => (
                <tr key={row.testId} className="hover:bg-slate-800/40">
                  <td className="p-3 font-mono text-indigo-400">{row.testId}</td>
                  <td className="p-3 font-medium text-slate-200">{row.scenario}</td>
                  <td className="p-3">
                    <span className="bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded font-mono text-[10px]">
                      {row.type}
                    </span>
                  </td>
                  <td className="p-3 text-slate-400">{row.expectedResult}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}