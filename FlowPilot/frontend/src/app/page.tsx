'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, ArrowRight, ShieldCheck, Lock, Mail, Zap, BarChart3, Cpu } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';
import { getRoleHomePath } from '@/lib/rbac';
import { getApiErrorMessage } from '@/lib/api';

const DEMO_USERS = [
  { label: 'Admin', email: 'admin@flowpilot.io', role: 'ADMIN', color: 'from-violet-600 to-purple-600' },
  { label: 'Project Manager', email: 'pm@flowpilot.io', role: 'PM', color: 'from-blue-600 to-cyan-600' },
  { label: 'Developer', email: 'dev@flowpilot.io', role: 'DEV', color: 'from-emerald-600 to-teal-600' },
  { label: 'QA Engineer', email: 'qa@flowpilot.io', role: 'QA', color: 'from-orange-600 to-amber-600' },
];

const FEATURES = [
  { icon: Zap, label: 'AI-Powered Sprint Planning' },
  { icon: BarChart3, label: 'Real-time Analytics' },
  { icon: Cpu, label: 'QA Test Generator' },
];

export default function LoginPage() {
  const router = useRouter();
  const { user, isLoading, login, register } = useAuth();
  const [isRegistering, setIsRegistering] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && user) {
      router.replace(getRoleHomePath(user.role));
    }
  }, [user, isLoading, router]);

  const authenticate = async (loginEmail: string, loginPassword: string, registering: boolean) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const authenticatedUser = registering
        ? await register(name, loginEmail, loginPassword)
        : await login(loginEmail, loginPassword);
      toast.success(registering ? 'Account created successfully!' : 'Welcome back!');
      router.replace(getRoleHomePath(authenticatedUser.role));
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, registering ? 'register' : 'sign in'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    await authenticate(email, password, isRegistering);
  };

  const handleDemoLogin = async (demoEmail: string) => {
    await authenticate(demoEmail, 'Password123!', false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex">
      {/* ── Left Panel (Branding) ── */}
      <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-slate-900 via-indigo-950/40 to-slate-900 flex-col justify-between p-12 relative overflow-hidden border-r border-slate-800">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-violet-600/10 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-2.5 mb-12">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-950/40">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight gradient-text">FlowPilot</span>
          </div>

          <h1 className="text-4xl font-bold leading-tight mb-4">
            Ship faster with{' '}
            <span className="gradient-text">AI-powered</span>{' '}
            project management
          </h1>
          <p className="text-slate-400 text-lg leading-relaxed max-w-sm">
            From sprint planning to bug triage — FlowPilot brings your entire team workflow into one intelligent platform.
          </p>

          <div className="mt-10 space-y-4">
            {FEATURES.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3 text-slate-300">
                <div className="w-8 h-8 bg-indigo-500/10 border border-indigo-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-indigo-400" />
                </div>
                <span className="text-sm font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 mt-auto">
          {/* Simulated project stats */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 space-y-4 backdrop-blur-sm">
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Live Platform Stats</p>
            <div className="grid grid-cols-3 gap-4">
              {[
                { val: '2,847', label: 'Active Tasks' },
                { val: '98.6%', label: 'Uptime SLA' },
                { val: '312', label: 'Teams' },
              ].map((stat) => (
                <div key={stat.label}>
                  <p className="text-xl font-bold text-slate-100">{stat.val}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Right Panel (Login Form) ── */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md space-y-8 animate-fade-in">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2">
            <div className="w-7 h-7 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold gradient-text">FlowPilot</span>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-slate-100">{isRegistering ? 'Create your account' : 'Welcome back'}</h2>
            <p className="mt-1 text-sm text-slate-400">
              {isRegistering ? 'Join your team workspace' : 'Sign in to your workspace'}
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {isRegistering && (
              <div>
                <label htmlFor="name" className="mb-1.5 block text-xs font-medium text-slate-400">
                  Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  minLength={2}
                  maxLength={100}
                  required
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>
            )}
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-slate-400 mb-1.5">
                Email address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@flowpilot.io"
                  required
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/50 transition"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-medium text-slate-400 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  minLength={isRegistering ? 8 : undefined}
                  required
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/50 transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-60 disabled:cursor-not-allowed text-white py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-200 hover:shadow-lg hover:shadow-indigo-500/25"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {isRegistering ? 'Creating account...' : 'Signing in...'}
                </>
              ) : (
                <>
                  {isRegistering ? 'Create account' : 'Sign In'}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {!isRegistering && (
            <div className="pt-5 border-t border-slate-800">
              <p className="text-xs text-slate-400 flex items-center gap-1.5 mb-3">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                Quick demo access — select a role to sign in
              </p>
              <div className="grid grid-cols-2 gap-2">
                {DEMO_USERS.map((demo) => (
                  <button
                    key={demo.email}
                    type="button"
                    aria-label={demo.label}
                    disabled={submitting}
                    onClick={() => void handleDemoLogin(demo.email)}
                    className="relative overflow-hidden group bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 hover:border-indigo-500/40 rounded-xl px-3 py-2.5 text-left transition-all duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br ${demo.color} opacity-0 group-hover:opacity-10 transition-opacity`} />
                    <p className="text-xs font-semibold text-slate-100">{demo.label}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5 truncate">{demo.email}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="text-center text-sm text-slate-400">
            {isRegistering ? 'Already have an account?' : 'New to FlowPilot?'}{' '}
            <button
              type="button"
              onClick={() => setIsRegistering((current) => !current)}
              className="font-semibold text-indigo-400 hover:text-indigo-300"
            >
              {isRegistering ? 'Sign in' : 'Create an account'}
            </button>
          </p>

          <p className="text-center text-xs text-slate-600">
            FlowPilot Platform v2.0 &copy; 2026
          </p>
        </div>
      </div>
    </div>
  );
}