import { invoke as nativeInvoke, Channel } from '@tauri-apps/api/core';

export const isNative = () => typeof window !== 'undefined' && Boolean((window as any).__TAURI_INTERNALS__);
export const hasLocalHost = () => isNative() || (typeof window !== 'undefined' && (import.meta as any).env?.VITE_SHARED_STORAGE === 'true');
export function createChannel<T>(): { onmessage: (message: T) => void } {
  return isNative() ? new Channel<T>() : { onmessage: () => {} };
}
export async function invoke<T>(command: string, args: Record<string, any> = {}, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted();
  if (isNative()) return nativeInvoke<T>(command, args);
  return browserInvoke<T>(command, args, signal);
}
export async function browserInvoke<T>(command: string, args: Record<string, any> = {}, signal?: AbortSignal): Promise<T> {
  const { onChunk, ...payload } = args;
  const response = await fetch('/__story_local/rpc', { method:'POST', headers:{'Content-Type':'application/json','X-Story-Local':'1'}, body:JSON.stringify({command,args:payload}), signal });
  if (!response.ok || !response.body) throw new Error(`本地存储服务不可用（HTTP ${response.status}），请通过 npm run dev 或 npm run preview 启动`);
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '', completed = false, result: T | undefined;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const envelope = JSON.parse(line);
    if ('error' in envelope) throw new Error(envelope.error);
    if ('chunk' in envelope) onChunk?.onmessage(envelope.chunk);
    if ('result' in envelope) { completed = true; result = envelope.result; }
  };
  try {
    for (;;) {
      signal?.throwIfAborted();
      const {done,value} = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, {stream:true});
      let end: number;
      while ((end = buffer.indexOf('\n')) >= 0) { consume(buffer.slice(0,end)); buffer = buffer.slice(end+1); }
    }
    buffer += decoder.decode(); consume(buffer);
    if (!completed) throw new Error('本地服务响应中断，未确认操作完成');
    return result as T;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

/** Deliberately discard the retired browser database; never import it into shared storage. */
export function clearBrowserDatabase(storage: Storage = localStorage) {
  const keys = Array.from({length:storage.length}, (_, i) => storage.key(i)).filter((k): k is string => !!k);
  for (const key of keys) if (key.startsWith('story_tavern_') || key.startsWith('secret_') || key.startsWith('model_assistant_') || key === 'openrouter_key') storage.removeItem(key);
}
