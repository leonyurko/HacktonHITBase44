import { apiDelete, apiGet, apiPatch, apiPost } from './api';
import type { Task, TaskSize, TaskState } from './types';

export interface TaskCreateInput {
  title: string;
  description?: string | null;
  size?: TaskSize | null;
  soft_when?: string | null;
  deferred_to?: string | null;  // ISO date 'YYYY-MM-DD'
}

export interface TaskPatchInput {
  title?: string;
  state?: TaskState;
  size?: TaskSize | null;
  soft_when?: string | null;
  deferred_to?: string | null;
}

export async function listTasks(state?: TaskState): Promise<Task[]> {
  const qs = state ? `?state=${state}` : '';
  const r = await apiGet<{ ok: boolean; tasks: Task[] }>(`/tasks${qs}`);
  return r.tasks ?? [];
}

export async function listAllTasks(): Promise<Task[]> {
  // Fetch all states client-side. There's no "?all" — we explicitly union.
  const states: TaskState[] = ['open', 'done', 'deferred', 'dropped'];
  const lists = await Promise.all(states.map((s) => listTasks(s)));
  return lists.flat();
}

export async function getTask(id: string): Promise<{ task: Task; events: unknown[] }> {
  const r = await apiGet<{ ok: boolean; task: Task; events: unknown[] }>(`/tasks/${id}`);
  return { task: r.task, events: r.events };
}

export async function createTask(input: TaskCreateInput): Promise<Task> {
  const r = await apiPost<{ ok: boolean; task: Task }>('/tasks', input);
  return r.task;
}

export async function patchTask(id: string, input: TaskPatchInput): Promise<Task> {
  const r = await apiPatch<{ ok: boolean; task: Task }>(`/tasks/${id}`, input);
  return r.task;
}

export async function dropTask(id: string): Promise<void> {
  await apiDelete<{ ok: boolean }>(`/tasks/${id}`);
}

export async function completeTask(id: string): Promise<Task> {
  return patchTask(id, { state: 'done' });
}

export async function deferTask(id: string, deferred_to: string): Promise<Task> {
  return patchTask(id, { state: 'deferred', deferred_to });
}
