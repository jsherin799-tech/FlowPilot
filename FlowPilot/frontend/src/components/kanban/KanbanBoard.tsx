'use client';

import React, { useState, useCallback } from 'react';
import { Task, TaskStatus } from '@/types';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { User, AlertCircle, Calendar, Plus, Wifi, WifiOff } from 'lucide-react';
import { useProjectSocket, TaskUpdatedEvent } from '@/hooks/useProjectSocket';
import { useAuth } from '@/context/AuthContext';

// ─── Column config aligned to TaskStatus enum ─────────────────────────────────
const COLUMNS: { id: TaskStatus; label: string; accentColor: string; textColor: string }[] = [
  { id: 'BACKLOG',     label: 'Backlog',     accentColor: 'border-t-slate-600',   textColor: 'text-slate-400'  },
  { id: 'TO_DO',       label: 'To Do',       accentColor: 'border-t-blue-500',    textColor: 'text-blue-400'   },
  { id: 'IN_PROGRESS', label: 'In Progress', accentColor: 'border-t-amber-500',   textColor: 'text-amber-400'  },
  { id: 'IN_REVIEW',   label: 'In Review',   accentColor: 'border-t-violet-500',  textColor: 'text-violet-400' },
  { id: 'DONE',        label: 'Done',        accentColor: 'border-t-emerald-500', textColor: 'text-emerald-400'},
];

const PRIORITY_STYLES: Record<string, string> = {
  CRITICAL: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  HIGH:     'bg-amber-500/10 text-amber-400 border-amber-500/20',
  MEDIUM:   'bg-blue-500/10 text-blue-400 border-blue-500/20',
  LOW:      'bg-slate-800 text-slate-400 border-slate-700',
};

interface KanbanBoardProps {
  initialTasks: Task[];
  projectId:    string;
  onTaskClick?: (task: Task) => void;
  onAddTask?:   (status: TaskStatus) => void;
  onTaskUpdated: (task: Task) => void;
}

export default function KanbanBoard({ initialTasks, projectId, onTaskClick, onAddTask, onTaskUpdated }: KanbanBoardProps) {
  const { user }             = useAuth();
  const tasks = initialTasks;
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overCol, setOverCol]       = useState<TaskStatus | null>(null);

  // ── Socket.IO real-time handler ──────────────────────────────────────────
  const handleTaskUpdated = useCallback((event: TaskUpdatedEvent) => {
    // Ignore own updates (already applied optimistically)
    if (event.updatedBy.id === user?.id) return;

    onTaskUpdated(event.task);

    const col = COLUMNS.find((c) => c.id === event.newStatus);
    toast(
      `"${event.title}" moved to ${col?.label ?? event.newStatus}`,
      { icon: '🔄', style: { fontSize: '12px' } }
    );
  }, [onTaskUpdated, user?.id]);

  const { connected } = useProjectSocket({ projectId, onTaskUpdated: handleTaskUpdated });

  // ── Drag handlers ────────────────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('taskId', taskId);
    setDraggingId(taskId);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setOverCol(null);
  };

  const handleDragOver = (e: React.DragEvent, colId: TaskStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOverCol(colId);
  };

  const handleDragLeave = () => setOverCol(null);

  const handleDrop = async (e: React.DragEvent, newStatus: TaskStatus) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    const task = tasks.find((t) => t.id === taskId);
    setDraggingId(null);
    setOverCol(null);

    if (!task || task.status === newStatus) return;

    // Optimistic update
    onTaskUpdated({ ...task, status: newStatus });

    try {
      const response = await api.patch(`/tasks/${taskId}/status`, { status: newStatus });
      const updatedTask = response.data.data.task as Task;
      onTaskUpdated(updatedTask);
      // Socket.IO will notify OTHER users; this session already sees the update
    } catch {
      // Rollback
      onTaskUpdated(task);
      toast.error('Failed to update task status');
    }
  };

  return (
    <div className="space-y-3">
      {/* Real-time indicator */}
      <div className="flex items-center gap-2 text-[10px] text-slate-600">
        {connected ? <Wifi className="w-3 h-3 text-emerald-500" /> : <WifiOff className="w-3 h-3 text-amber-500" />}
        <span className={connected ? 'text-emerald-600' : 'text-amber-600'}>
          {connected ? 'Real-time sync active' : 'Connecting to live updates…'}
        </span>
        <span className="text-slate-700">— drag cards to update status</span>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4 min-h-[600px]">
        {COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.id);
          const isOver   = overCol === col.id;

          return (
            <div
              key={col.id}
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, col.id)}
              className={`flex-shrink-0 w-[272px] flex flex-col rounded-xl border border-t-2 transition-colors ${
                col.accentColor
              } ${isOver ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-900/50 border-slate-800'}`}
            >
              {/* Column header */}
              <div className="flex items-center justify-between px-3 py-3">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold uppercase tracking-wider ${col.textColor}`}>
                    {col.label}
                  </span>
                  <span className="bg-slate-800 text-slate-500 text-[10px] font-mono px-1.5 py-0.5 rounded-full">
                    {colTasks.length}
                  </span>
                </div>
                {onAddTask && (
                  <button
                    onClick={() => onAddTask(col.id)}
                    className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-slate-700 text-slate-500 hover:text-slate-300 transition"
                    title={`Add task to ${col.label}`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Cards */}
              <div className={`flex-1 px-2 pb-2 space-y-2 ${isOver ? 'ring-1 ring-inset ring-indigo-500/30 rounded-b-xl' : ''}`}>
                {colTasks.length === 0 && (
                  <div className={`h-20 flex items-center justify-center text-slate-600 text-xs border-2 border-dashed rounded-lg transition-colors ${
                    isOver ? 'border-indigo-500/40 text-indigo-500' : 'border-slate-800'
                  }`}>
                    {isOver ? '↓ Drop here' : 'No tasks'}
                  </div>
                )}
                {colTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    isDragging={draggingId === task.id}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onClick={onTaskClick}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Task Card ────────────────────────────────────────────────────────────────

interface TaskCardProps {
  task:       Task;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd:   () => void;
  onClick?:    (task: Task) => void;
}

function TaskCard({ task, isDragging, onDragStart, onDragEnd, onClick }: TaskCardProps) {
  const formatDate = (d?: string) =>
    d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;
  const isOverdue = task.dueDate && task.status !== 'DONE' && new Date(task.dueDate) < new Date();

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task.id)}
      onDragEnd={onDragEnd}
      onClick={() => onClick?.(task)}
      className={`bg-slate-950 border rounded-lg p-3 space-y-2.5 transition-all group select-none ${
        onClick ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'
      } ${isDragging
        ? 'opacity-40 rotate-1 scale-95 border-indigo-500/60 shadow-xl shadow-indigo-500/10'
        : 'border-slate-800 hover:border-indigo-500/40 hover:shadow-lg hover:shadow-black/20'
      }`}
    >
      {/* ID + Priority */}
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] font-mono text-indigo-400/60 truncate">
          #{task.id.slice(0, 8)}
        </span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium flex-shrink-0 ${
          PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.LOW
        }`}>
          {task.priority}
        </span>
      </div>

      {/* Title */}
      <p className="text-xs font-medium text-slate-200 leading-snug line-clamp-2 group-hover:text-slate-100 transition-colors">
        {task.title}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 gap-2">
        {task.assignee ? (
          <div className="flex items-center gap-1 text-[10px] text-slate-400 min-w-0">
            <div className="w-4 h-4 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-[8px] font-bold text-indigo-400 flex-shrink-0">
              {task.assignee.name.charAt(0).toUpperCase()}
            </div>
            <span className="truncate max-w-[80px]">{task.assignee.name.split(' ')[0]}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-[10px] text-slate-600">
            <User className="w-3 h-3" />
            <span>Unassigned</span>
          </div>
        )}

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {task.storyPoints != null && (
            <span className="text-[10px] bg-slate-800 text-slate-400 px-1 py-0.5 rounded font-mono">
              {task.storyPoints}sp
            </span>
          )}
          {task.dueDate && (
            <span className={`flex items-center gap-0.5 text-[10px] ${isOverdue ? 'text-rose-400' : 'text-slate-500'}`}>
              {isOverdue && <AlertCircle className="w-2.5 h-2.5" />}
              <Calendar className="w-2.5 h-2.5" />
              {formatDate(task.dueDate)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}