"use client";

import React, { useState } from 'react';
import { Plus, MoreHorizontal, User, AlertCircle } from 'lucide-react';

interface Task {
  id: string;
  title: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: string;
  assignee?: string;
}

const initialTasks: Task[] = [
  { id: 'TASK-101', title: 'Implement Stripe Webhook Handler', priority: 'CRITICAL', status: 'IN_PROGRESS', assignee: 'Alex Dev' },
  { id: 'TASK-102', title: 'Design Payment Status Modal', priority: 'MEDIUM', status: 'TO_DO', assignee: 'Anu UI' },
  { id: 'TASK-103', title: 'Setup JWT Token Refresh Logic', priority: 'HIGH', status: 'IN_REVIEW', assignee: 'Rahul Tech' },
  { id: 'TASK-104', title: 'Configure Playwright Pipeline in CI', priority: 'LOW', status: 'DONE', assignee: 'Jahana QA' },
];

const COLUMNS = [
  { id: 'BACKLOG', label: 'Backlog' },
  { id: 'TO_DO', label: 'To Do' },
  { id: 'IN_PROGRESS', label: 'In Progress' },
  { id: 'IN_REVIEW', label: 'In Review' },
  { id: 'DONE', label: 'Done' },
];

export default function KanbanBoard() {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('taskId', id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, newStatus: string) => {
    const taskId = e.dataTransfer.getData('taskId');
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
    );
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'CRITICAL': return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      case 'HIGH': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      default: return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 overflow-x-auto p-2">
      {COLUMNS.map((col) => {
        const columnTasks = tasks.filter((t) => t.status === col.id);

        return (
          <div
            key={col.id}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, col.id)}
            className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 min-h-[500px] flex flex-col gap-3"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">{col.label}</span>
              <span className="bg-slate-800 text-slate-400 text-xs px-2 py-0.5 rounded-full font-mono">{columnTasks.length}</span>
            </div>

            <div className="flex-1 space-y-3">
              {columnTasks.map((task) => (
                <div
                  key={task.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, task.id)}
                  className="bg-slate-950 border border-slate-800 hover:border-indigo-500/50 p-3 rounded-lg cursor-grab active:cursor-grabbing shadow-sm space-y-2 transition"
                >
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] font-mono text-indigo-400">{task.id}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getPriorityBadge(task.priority)}`}>
                      {task.priority}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-slate-200 leading-snug">{task.title}</p>
                  <div className="flex justify-between items-center pt-2 text-[11px] text-slate-400">
                    <span className="flex items-center gap-1"><User className="w-3 h-3 text-slate-500" /> {task.assignee}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}