"use client";

import React, { useState } from 'react';
import { Sparkles, Copy, Check, Cpu } from 'lucide-react';
import { api } from '@/lib/api';

interface Scenario {
  testId: string;
  scenario: string;
  type: string;
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
      const response = await api.post('/ai/qa-scenarios', { requirement });
      if (response.data.success) {
        setScenarios(response.data.data.scenarios);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(JSON.stringify(scenarios, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
      </div>

      <div className="space-y-2">
        <textarea
          value={requirement}
          onChange={(e) => setRequirement(e.target.value)}
          placeholder="e.g. User should be able to reset their password using their registered email address."
          rows={3}
          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
        />
        <button
          onClick={handleGenerate}
          disabled={loading || !requirement.trim()}
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
                <th className="p-3">Scenario</th>
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