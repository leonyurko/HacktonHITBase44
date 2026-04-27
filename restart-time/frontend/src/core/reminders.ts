import { apiDelete, apiGet, apiPost } from './api';

export interface Reminder {
  id: string;
  user_id: string;
  task_id: string | null;
  scheduled_at: string;       // ISO 8601
  delivery_channel: string;
  body_override: string | null;
  status: 'pending' | 'sent' | 'cancelled' | 'failed';
  delivered_at: string | null;
  created_at: string;
}

export interface ReminderCreateInput {
  task_id: string;
  scheduled_at: string;       // ISO 8601 datetime
  body_override?: string | null;
}

export async function listReminders(taskId?: string): Promise<Reminder[]> {
  const qs = taskId ? `?task_id=${taskId}` : '';
  const r = await apiGet<{ ok: boolean; reminders: Reminder[] }>(`/reminders${qs}`);
  return r.reminders ?? [];
}

export async function createReminder(input: ReminderCreateInput): Promise<Reminder> {
  const r = await apiPost<{ ok: boolean; reminder: Reminder }>('/reminders', input);
  return r.reminder;
}

export async function cancelReminder(id: string): Promise<void> {
  await apiDelete<{ ok: boolean }>(`/reminders/${id}`);
}
