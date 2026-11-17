'use client';

import { FormEvent, useState } from 'react';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { ProjectMember, Sprint, Task, TaskStatus } from '@/types';

interface TaskFormModalProps {
  projectId: string;
  members: ProjectMember[];
  sprints: Sprint[];
  task?: Task;
  defaultStatus?: TaskStatus;
  canManagePlanning: boolean;
  onClose: () => void;
  onSaved: (task: Task) => void;
  onDeleted: (taskId: string) => void;
}

const STATUSES: { value: TaskStatus; label: string }[] = [
  { value: 'BACKLOG', label: 'Backlog' },
  { value: 'TO_DO', label: 'To Do' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'IN_REVIEW', label: 'In Review' },
  { value: 'DONE', label: 'Done' },
];

export default function TaskFormModal({
  projectId,
  members,
  sprints,
  task,
  defaultStatus = 'TO_DO',
  canManagePlanning,
  onClose,
  onSaved,
  onDeleted,
}: TaskFormModalProps) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? defaultStatus);
  const [priority, setPriority] = useState(task?.priority ?? 'MEDIUM');
  const [assigneeId, setAssigneeId] = useState(task?.assigneeId ?? '');
  const [sprintId, setSprintId] = useState(task?.sprintId ?? '');
  const [storyPoints, setStoryPoints] = useState(task?.storyPoints?.toString() ?? '');
  const [estimatedHours, setEstimatedHours] = useState(task?.estimatedHours?.toString() ?? '');
  const [dueDate, setDueDate] = useState(task?.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) {
      toast.error('Task title is required');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        status,
        priority,
        assigneeId: assigneeId || null,
        sprintId: sprintId || null,
        storyPoints: storyPoints ? Number(storyPoints) : null,
        estimatedHours: estimatedHours ? Number(estimatedHours) : null,
        dueDate: dueDate || null,
        projectId,
      };
      const response = task
        ? await api.put(`/tasks/${task.id}`, payload)
        : await api.post('/tasks', payload);
      onSaved(response.data.data.task as Task);
      toast.success(task ? 'Task updated' : 'Task created');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save task';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!task || !window.confirm(`Delete "${task.title}"? This cannot be undone.`)) return;
    setSaving(true);
    try {
      await api.delete(`/tasks/${task.id}`);
      onDeleted(task.id);
      toast.success('Task deleted');
    } catch {
      toast.error('Unable to delete task');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-indigo-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4">
      <button aria-label="Close task form" className="absolute inset-0 cursor-default bg-slate-950/80 backdrop-blur-sm" onClick={onClose} />
      <form onSubmit={handleSubmit} className="relative my-8 w-full max-w-xl space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-100">{task ? 'Edit task' : 'Create task'}</h2>
            <p className="mt-1 text-xs text-slate-500">Manage status, ownership, and sprint details.</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200">
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="block space-y-1.5 text-xs font-medium text-slate-400">
          Title
          <input autoFocus required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} className={inputClass} placeholder="What needs to be done?" />
        </label>
        <label className="block space-y-1.5 text-xs font-medium text-slate-400">
          Description
          <textarea rows={3} maxLength={5000} value={description} onChange={(event) => setDescription(event.target.value)} className={`${inputClass} resize-y`} placeholder="Add context or acceptance criteria…" />
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="space-y-1.5 text-xs font-medium text-slate-400">
            Status
            <select value={status} onChange={(event) => setStatus(event.target.value as TaskStatus)} className={inputClass}>
              {STATUSES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-medium text-slate-400">
            Priority
            <select disabled={!canManagePlanning} value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)} className={inputClass}>
              {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-medium text-slate-400">
            Assignee
            <select disabled={!canManagePlanning} value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} className={inputClass}>
              <option value="">Unassigned</option>
              {members.map((member) => <option key={member.userId} value={member.userId}>{member.user.name}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-medium text-slate-400">
            Sprint
            <select disabled={!canManagePlanning} value={sprintId} onChange={(event) => setSprintId(event.target.value)} className={inputClass}>
              <option value="">No sprint</option>
              {sprints.filter((sprint) => sprint.status !== 'COMPLETED').map((sprint) => (
                <option key={sprint.id} value={sprint.id}>{sprint.name}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-medium text-slate-400">
            Story points
            <input disabled={!canManagePlanning} type="number" min="0" max="100" step="1" value={storyPoints} onChange={(event) => setStoryPoints(event.target.value)} className={inputClass} placeholder="—" />
          </label>
          <label className="space-y-1.5 text-xs font-medium text-slate-400">
            Estimated hours
            <input disabled={!canManagePlanning} type="number" min="0" max="10000" step="0.1" value={estimatedHours} onChange={(event) => setEstimatedHours(event.target.value)} className={inputClass} placeholder="—" />
          </label>
          <label className="space-y-1.5 text-xs font-medium text-slate-400">
            Due date
            <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className={inputClass} />
          </label>
        </div>

        <div className="flex items-center justify-between border-t border-slate-800 pt-4">
          {task ? (
            <button type="button" disabled={saving} onClick={() => void handleDelete()} className="text-xs font-medium text-rose-400 hover:text-rose-300 disabled:opacity-50">Delete task</button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-400 hover:text-slate-200">Cancel</button>
            <button type="submit" disabled={saving || !title.trim()} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50">
              {saving ? 'Saving…' : task ? 'Save changes' : 'Create task'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
