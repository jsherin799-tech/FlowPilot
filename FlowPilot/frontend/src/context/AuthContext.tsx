'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { isAxiosError } from 'axios';
import { api, getApiErrorMessage } from '@/lib/api';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'PROJECT_MANAGER' | 'DEVELOPER' | 'QA_ENGINEER';
  bio?: string;
  avatarUrl?: string;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<User>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readCachedUser(): User | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem('flowpilot_user') ?? 'null');
    if (typeof value !== 'object' || value === null) return null;

    const candidate = value as Record<string, unknown>;
    const role = candidate.role;
    if (
      typeof candidate.id !== 'string'
      || typeof candidate.name !== 'string'
      || typeof candidate.email !== 'string'
      || (role !== 'ADMIN' && role !== 'PROJECT_MANAGER' && role !== 'DEVELOPER' && role !== 'QA_ENGINEER')
    ) {
      return null;
    }

    return {
      id: candidate.id,
      name: candidate.name,
      email: candidate.email,
      role,
      bio: typeof candidate.bio === 'string' ? candidate.bio : undefined,
      avatarUrl: typeof candidate.avatarUrl === 'string' ? candidate.avatarUrl : undefined,
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      if (data.success) {
        setUser(data.data.user);
        localStorage.setItem('flowpilot_user', JSON.stringify(data.data.user));
      }
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 401) {
        localStorage.removeItem('flowpilot_token');
        localStorage.removeItem('flowpilot_user');
        setUser(null);
        return;
      }

      console.error(`[FlowPilot Auth] Could not refresh the current session: ${getApiErrorMessage(error, 'refresh your session')}`);
      setUser(readCachedUser());
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('flowpilot_token');
    if (token) {
      // Auth state updates occur after the profile request settles.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      refreshUser().finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [refreshUser]);

  const login = async (email: string, password: string): Promise<User> => {
    const { data } = await api.post('/auth/login', { email, password });
    if (data.success) {
      localStorage.setItem('flowpilot_token', data.data.token);
      localStorage.setItem('flowpilot_user', JSON.stringify(data.data.user));
      setUser(data.data.user);
      return data.data.user;
    } else {
      throw new Error(data.message || 'Login failed');
    }
  };

  const register = async (name: string, email: string, password: string): Promise<User> => {
    const { data } = await api.post('/auth/register', { name, email, password });
    if (data.success) {
      localStorage.setItem('flowpilot_token', data.data.token);
      localStorage.setItem('flowpilot_user', JSON.stringify(data.data.user));
      setUser(data.data.user);
      return data.data.user;
    } else {
      throw new Error(data.message || 'Registration failed');
    }
  };

  const logout = () => {
    localStorage.removeItem('flowpilot_token');
    localStorage.removeItem('flowpilot_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
