"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, ArrowRight, ShieldCheck, Lock, Mail } from 'lucide-react';
import axios from 'axios';
import { api } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await api.post('/auth/login', { email, password });
      if (response.data.success) {
        localStorage.setItem('flowpilot_token', response.data.token);
        localStorage.setItem('flowpilot_user', JSON.stringify(response.data.user));
        router.push('/dashboard');
      }
    } catch (err: unknown) {
      const message = axios.isAxiosError<{ message?: string }>(err)
        ? err.response?.data?.message
        : undefined;
      setError(message || 'Invalid credentials or connection error');
    } finally {
      setLoading(false);
    }
  };

  const setDemoUser = (roleEmail: string) => {
    setEmail(roleEmail);
    setPassword('Password123!');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8 bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-3 py-1 rounded-full text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" /> FlowPilot Platform 2026
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Sign in to your account</h1>
          <p className="text-xs text-slate-400">Manage tasks, sprints, bugs, and AI test scenarios.</p>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs p-3 rounded-lg text-center font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Email address</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="pm@flowpilot.io"
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'} <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="pt-4 border-t border-slate-800 text-center space-y-2">
          <p className="text-xs text-slate-400 font-medium flex items-center justify-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Quick Demo Role Login
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button onClick={() => setDemoUser('admin@flowpilot.io')} className="bg-slate-800 hover:bg-slate-700 py-1.5 px-2 rounded text-slate-300 border border-slate-700">Admin</button>
            <button onClick={() => setDemoUser('pm@flowpilot.io')} className="bg-slate-800 hover:bg-slate-700 py-1.5 px-2 rounded text-slate-300 border border-slate-700">Project Manager</button>
            <button onClick={() => setDemoUser('dev@flowpilot.io')} className="bg-slate-800 hover:bg-slate-700 py-1.5 px-2 rounded text-slate-300 border border-slate-700">Developer</button>
            <button onClick={() => setDemoUser('qa@flowpilot.io')} className="bg-slate-800 hover:bg-slate-700 py-1.5 px-2 rounded text-slate-300 border border-slate-700">QA Engineer</button>
          </div>
        </div>
      </div>
    </div>
  );
}