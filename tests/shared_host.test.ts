import test from 'node:test';
import assert from 'node:assert/strict';
import { browserInvoke, clearBrowserDatabase } from '../src/db/host';

test('local transport streams split NDJSON frames without sending callbacks or bearer credentials', async t => {
  const chunks: number[][] = [];
  t.mock.method(globalThis,'fetch',async (url: any, options: any) => {
    assert.equal(url,'/__story_local/rpc');
    assert.equal(options.headers['X-Story-Local'],'1');
    assert.equal(options.headers.Authorization,undefined);
    const body=JSON.parse(options.body);
    assert.equal(body.args.onChunk,undefined);
    assert.equal(body.args.secretRef,'backend_test');
    return new Response(new ReadableStream({start(controller) {
      for (const text of ['{}\n{"chu','nk":[65,66]}\n{"result":','null}\n']) controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    }}));
  });
  assert.equal(await browserInvoke('backend_chat_completion',{secretRef:'backend_test',onChunk:{onmessage:(bytes:number[])=>chunks.push(bytes)}}),null);
  assert.deepEqual(chunks,[[65,66]]);
});
test('service failures and truncated responses fail closed, with cancellation passed through', async t => {
  const controller=new AbortController();
  t.mock.method(globalThis,'fetch',async (_url: any,options: any)=>{assert.equal(options.signal,controller.signal);return new Response('{}\n');});
  await assert.rejects(browserInvoke('db_get_path',{},controller.signal),/未确认操作完成/);
  t.mock.method(globalThis,'fetch',async ()=>new Response('{"error":"数据库写入失败"}\n'));
  await assert.rejects(browserInvoke('db_kv_set'),/数据库写入失败/);
  t.mock.method(globalThis,'fetch',async ()=>new Response('',{status:503}));
  await assert.rejects(browserInvoke('db_kv_get'),/本地存储服务不可用/);
});
test('retired browser game data and credential cache are discarded without importing unrelated site data', () => {
  const values=new Map(['story_tavern_library_v2','story_tavern_saves','story_tavern_agent_groups','secret_backend_test','openrouter_key','model_assistant_model','unrelated'].map(k=>[k,'old data']));
  const storage={get length(){return values.size;},key:(i:number)=>[...values.keys()][i]??null,removeItem:(k:string)=>values.delete(k)} as unknown as Storage;
  clearBrowserDatabase(storage);
  assert.deepEqual([...values.keys()],['unrelated']);
});
