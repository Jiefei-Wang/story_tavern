import { hasLocalHost, invoke } from './host';

const keys = ['story_tavern_active_group', 'model_assistant_backend', 'model_assistant_model'] as const;
type PreferenceKey = typeof keys[number];
const cache = new Map<string,string>();
const queues = new Map<string,Promise<void>>();
export async function loadPreferences() {
  if (!hasLocalHost()) return;
  await Promise.all(keys.map(async key => { const value = await invoke<string|null>('db_kv_get',{table:'settings',key}); cache.set(key,value || ''); }));
}
export function readPreference(key: PreferenceKey): string {
  return hasLocalHost() ? cache.get(key) || '' : typeof localStorage !== 'undefined' ? localStorage.getItem(key) || '' : '';
}
export async function writePreference(key: PreferenceKey, value: string): Promise<void> {
  if (!hasLocalHost()) { localStorage.setItem(key,value); return; }
  const write = (queues.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
    await invoke('db_kv_set',{table:'settings',key,value}); cache.set(key,value);
  });
  queues.set(key,write);
  try { await write; } finally { if (queues.get(key) === write) queues.delete(key); }
}
