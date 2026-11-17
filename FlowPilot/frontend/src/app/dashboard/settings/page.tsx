'use client';

import React, { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { User, Lock, Bell, Shield, CheckCircle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

type SettingsTab = 'profile' | 'security' | 'notifications';

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const [tab, setTab] = useState<SettingsTab>('profile');

  // Profile
  const [name, setName]   = useState(user?.name || '');
  const [bio, setBio]     = useState(user?.bio || '');
  const [saving, setSaving] = useState(false);

  // Password
  const [currPwd, setCurrPwd]   = useState('');
  const [newPwd, setNewPwd]     = useState('');
  const [confPwd, setConfPwd]   = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);

  const saveProfile = async () => {
    setSaving(true);
    try {
      const { data } = await api.put('/auth/profile', { name, bio });
      if (data.success) { await refreshUser(); toast.success('Profile updated'); }
    } catch { toast.error('Failed to update profile'); }
    finally { setSaving(false); }
  };

  const changePassword = async () => {
    if (newPwd !== confPwd) return toast.error('New passwords do not match');
    if (newPwd.length < 8) return toast.error('Password must be at least 8 characters');
    setPwdLoading(true);
    try {
      const { data } = await api.post('/auth/change-password', { currentPassword: currPwd, newPassword: newPwd });
      if (data.success) {
        toast.success('Password changed successfully');
        setCurrPwd(''); setNewPwd(''); setConfPwd('');
      }
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Failed to change password'); }
    finally { setPwdLoading(false); }
  };

  const TABS = [
    { id: 'profile' as SettingsTab,       label: 'Profile',       icon: User   },
    { id: 'security' as SettingsTab,      label: 'Security',      icon: Lock   },
    { id: 'notifications' as SettingsTab, label: 'Notifications', icon: Bell   },
  ];

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-3xl space-y-6 animate-fade-in">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Settings</h1>
          <p className="text-sm text-slate-400 mt-0.5">Manage your account and preferences</p>
        </div>

        {/* Tab nav */}
        <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1.5">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition flex-1 justify-center ${
                tab === id
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {/* ── Profile ── */}
        {tab === 'profile' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
            <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <User className="w-4 h-4 text-indigo-400" /> Profile Information
            </h2>

            {/* Avatar */}
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-indigo-600/20 border-2 border-indigo-500/30 flex items-center justify-center text-2xl font-bold text-indigo-400">
                {user?.name?.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium text-slate-200">{user?.name}</p>
                <p className="text-xs text-slate-500">{user?.email}</p>
                <span className="text-[10px] text-indigo-400 mt-0.5 inline-block">{user?.role?.replace('_', ' ')}</span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Full Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Bio</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  placeholder="Tell your team about yourself…"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
                <input
                  value={user?.email}
                  disabled
                  className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-500 cursor-not-allowed"
                />
              </div>
            </div>

            <button
              onClick={saveProfile}
              disabled={saving}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Save Changes
            </button>
          </div>
        )}

        {/* ── Security ── */}
        {tab === 'security' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
            <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <Lock className="w-4 h-4 text-indigo-400" /> Change Password
            </h2>
            <div className="space-y-3">
              {[
                { label: 'Current Password', value: currPwd, onChange: setCurrPwd },
                { label: 'New Password',     value: newPwd,  onChange: setNewPwd  },
                { label: 'Confirm Password', value: confPwd, onChange: setConfPwd },
              ].map(({ label, value, onChange }) => (
                <div key={label}>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label>
                  <input
                    type="password"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition"
                    placeholder="••••••••"
                  />
                </div>
              ))}
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3 space-y-1">
              <p className="text-xs font-medium text-slate-400">Password requirements:</p>
              <ul className="text-xs text-slate-500 space-y-0.5">
                <li className={newPwd.length >= 8 ? 'text-emerald-400' : ''}>• At least 8 characters</li>
                <li className={/[A-Z]/.test(newPwd) ? 'text-emerald-400' : ''}>• At least one uppercase letter</li>
                <li className={/[0-9]/.test(newPwd) ? 'text-emerald-400' : ''}>• At least one number</li>
              </ul>
            </div>
            <button
              onClick={changePassword}
              disabled={pwdLoading || !currPwd || !newPwd || !confPwd}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition"
            >
              {pwdLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
              Update Password
            </button>
          </div>
        )}

        {/* ── Notifications ── */}
        {tab === 'notifications' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
            <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <Bell className="w-4 h-4 text-indigo-400" /> Notification Preferences
            </h2>
            <div className="space-y-3">
              {[
                { label: 'Task Assignments',       desc: 'When a task is assigned to you'                },
                { label: 'Sprint Events',           desc: 'Sprint start, completion notifications'        },
                { label: 'Bug Reports',             desc: 'When a bug is assigned or resolved'            },
                { label: 'Comment Mentions',        desc: 'When someone mentions you in a comment'        },
                { label: 'Weekly Digest',           desc: 'Weekly summary of project activity via email'  },
              ].map((pref) => (
                <div key={pref.label} className="flex items-center justify-between py-3 border-b border-slate-800 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-slate-300">{pref.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{pref.desc}</p>
                  </div>
                  <div className="relative">
                    <input type="checkbox" defaultChecked className="sr-only peer" id={pref.label} />
                    <label htmlFor={pref.label} className="flex w-11 h-6 bg-slate-700 peer-checked:bg-indigo-600 rounded-full cursor-pointer transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:w-5 after:h-5 after:bg-white after:rounded-full after:shadow after:transition-all peer-checked:after:translate-x-5" />
                  </div>
                </div>
              ))}
            </div>
            <button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition">
              <CheckCircle className="w-4 h-4" /> Save Preferences
            </button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
