import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { Toaster } from 'react-hot-toast';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'FlowPilot – AI-Powered Team Productivity & Project Management',
  description:
    'FlowPilot is a production-grade SaaS platform for managing projects, tasks, sprints, and bugs with AI-powered assistance, real-time collaboration, and deep analytics.',
  keywords: ['project management', 'AI assistant', 'kanban', 'sprint planning', 'bug tracking', 'SaaS'],
  authors: [{ name: 'FlowPilot Team' }],
  openGraph: {
    title: 'FlowPilot – AI-Powered Project Management',
    description: 'Manage your team like a pro with AI-powered sprint planning, Kanban boards, and bug tracking.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${inter.variable} h-full`}>
      <body className="min-h-full bg-slate-950 text-slate-100 antialiased">
        <AuthProvider>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: '#1e293b',
                color: '#f1f5f9',
                border: '1px solid #334155',
                fontSize: '13px',
                fontFamily: 'var(--font-inter)',
              },
              success: {
                iconTheme: { primary: '#10b981', secondary: '#f1f5f9' },
              },
              error: {
                iconTheme: { primary: '#f43f5e', secondary: '#f1f5f9' },
              },
            }}
          />
        </AuthProvider>
      </body>
    </html>
  );
}
