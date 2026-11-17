// ─── Enums ────────────────────────────────────────────────────────────────────

export type Role = 'ADMIN' | 'PROJECT_MANAGER' | 'DEVELOPER' | 'QA_ENGINEER';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type TaskStatus = 'BACKLOG' | 'TO_DO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
export type BugStatus = 'OPEN' | 'IN_PROGRESS' | 'FIXED' | 'RETEST' | 'REOPENED' | 'RESOLVED' | 'CLOSED' | 'WONT_FIX';
export type BugSeverity = 'BLOCKER' | 'CRITICAL' | 'MAJOR' | 'MINOR';
export type SprintStatus = 'PLANNED' | 'ACTIVE' | 'COMPLETED';
export type ProjectStatus = 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED';

// ─── Core Entities ────────────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  bio?: string;
  avatarUrl?: string;
  createdAt?: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
}

export interface Project {
  id: string;
  name: string;
  key?: string | null;
  description?: string;
  status: ProjectStatus;
  startDate?: string | null;
  endDate?: string | null;
  organizationId?: string;
  createdAt: string;
  updatedAt: string;
  members?: ProjectMember[];
  sprints?: Sprint[];
  _count?: { tasks: number; bugs: number; sprints: number };
}

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  role: Role;
  joinedAt: string;
  user: User;
}

export interface Sprint {
  id: string;
  name: string;
  goal?: string;
  status: SprintStatus;
  startDate?: string;
  endDate?: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  tasks?: Task[];
  _count?: { tasks: number };
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  storyPoints?: number;
  estimatedHours?: number | null;
  actualHours?: number;
  pullRequestUrl?: string | null;
  sortOrder?: number;
  tags?: string[];
  dueDate?: string;
  projectId: string;
  milestoneId?: string | null;
  sprintId?: string;
  assigneeId?: string;
  qaAssigneeId?: string | null;
  createdAt: string;
  updatedAt: string;
  assignee?: User;
  qaAssignee?: User | null;
  project?: { id: string; name: string };
  sprint?: { id: string; name: string; status: SprintStatus };
  comments?: Comment[];
  checklistItems?: TaskChecklistItem[];
  effortLogs?: TaskEffortLog[];
  _count?: { comments: number };
}

export interface TaskChecklistItem {
  id: string;
  title: string;
  isComplete: boolean;
  sortOrder: number;
  taskId: string;
}

export interface TaskEffortLog {
  id: string;
  hours: number;
  note?: string | null;
  taskId: string;
  userId: string;
  createdAt: string;
}

export interface Bug {
  id: string;
  title: string;
  description: string;
  severity: BugSeverity;
  priority: Priority;
  status: BugStatus;
  reproductionSteps?: string;
  expectedResult?: string | null;
  actualResult?: string | null;
  attachments?: string[];
  environment?: string;
  browser?: string;
  os?: string;
  resolutionNotes?: string | null;
  pullRequestUrl?: string | null;
  commitHash?: string | null;
  projectId: string;
  taskId?: string | null;
  reporterId?: string;
  assigneeId?: string;
  createdAt: string;
  updatedAt: string;
  reporter?: User;
  assignee?: User;
  project?: { id: string; name: string };
  task?: { id: string; title: string } | null;
  comments?: Comment[];
  _count?: { comments: number };
}

export interface Comment {
  id: string;
  content: string;
  taskId?: string;
  bugId?: string;
  parentId?: string | null;
  authorId: string;
  createdAt: string;
  updatedAt: string;
  author: User;
  replies?: Comment[];
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  userId: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  entityName?: string;
  details?: Record<string, unknown>;
  userId: string;
  projectId?: string;
  createdAt: string;
  user?: User;
  project?: { id: string; name: string };
}

export interface AIConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  projectId?: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

// ─── API Response Wrappers ────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: string[];
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ─── Analytics Types ──────────────────────────────────────────────────────────

export interface ProjectAnalytics {
  tasksByStatus: { status: TaskStatus; _count: number }[];
  tasksByPriority: { priority: Priority; _count: number }[];
  bugsBySeverity: { severity: BugSeverity; _count: number }[];
  bugsByStatus: { status: BugStatus; _count: number }[];
  workload: { user: User; activeTasks: number }[];
  recentActivity: ActivityLog[];
}

// ─── Search Results ───────────────────────────────────────────────────────────

export interface GlobalSearchResults {
  projects: Pick<Project, 'id' | 'name' | 'description' | 'status'>[];
  tasks: (Pick<Task, 'id' | 'title' | 'status' | 'priority' | 'projectId'> & { project: { name: string } })[];
  bugs: (Pick<Bug, 'id' | 'title' | 'severity' | 'status' | 'projectId'> & { project: { name: string } })[];
  users: Pick<User, 'id' | 'name' | 'email' | 'role'>[];
}
