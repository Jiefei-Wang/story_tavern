import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { defaultLibrary, createStorySave } from '../src/engine/library/Library';

await mkdir('.tmp',{recursive:true});
const directory = await mkdtemp(path.resolve('.tmp/shared-host-'));
const processes: ReturnType<typeof spawn>[]=[];
async function start() {
  const token=randomUUID();
  const child=spawn(path.resolve('src-tauri/target/debug/storage_server.exe'),['--data-dir',directory],{env:{...process.env,STORY_TAVERN_BRIDGE_TOKEN:token},windowsHide:true,stdio:['pipe','pipe','pipe']});
  processes.push(child);
  const port=await new Promise<number>((resolve,reject)=>{
    let output=''; child.stdout!.on('data',part=>{output+=part; if(output.includes('\n')) {try{resolve(JSON.parse(output.split('\n')[0]).port);}catch{reject(new Error('Invalid readiness'));}}});
    child.once('error',reject); child.once('exit',code=>reject(new Error(`Server exited ${code}`)));
  });
  const call=async (command:string,args:Record<string,unknown>={},onChunk?:(bytes:number[])=>void)=>{
    const response=await fetch(`http://127.0.0.1:${port}/rpc`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({command,args})});
    assert.equal(response.status,200);
    const reader=response.body!.getReader();let buffer='',result:unknown,finished=false;
    for (;;) {const {done,value}=await reader.read();if(done)break;buffer+=new TextDecoder().decode(value);let at;while((at=buffer.indexOf('\n'))>=0){const envelope=JSON.parse(buffer.slice(0,at));buffer=buffer.slice(at+1);if(envelope.error)throw new Error(envelope.error);if(envelope.chunk)onChunk?.(envelope.chunk);if('result' in envelope){finished=true;result=envelope.result;}}}
    assert(finished);return result as any;
  };
  return {child,port,token,call};
}
let mockServer:http.Server|undefined;
try {
  const a=await start(),b=await start();
  console.log(JSON.stringify({directory,pids:processes.map(p=>p.pid),ports:[a.port,b.port]}));
  assert.equal(await a.call('db_get_path'),path.join(directory,'story_tavern.db'));
  for (const headers of [{}, {Authorization:`Bearer ${a.token}`,Origin:'https://untrusted.example'}]) {
    assert.equal((await fetch(`http://127.0.0.1:${a.port}/rpc`,{method:'POST',headers,body:'{}'})).status,403);
  }
  await assert.rejects(a.call('secret_get',{secretRef:'anything'}),/Unsupported/);
  await assert.rejects(a.call('db_kv_list',{table:'secrets'}),/Invalid table/);
  const library=defaultLibrary();library.characters.erin.future={retained:true};
  await a.call('library_commit',{value:JSON.stringify({revision:0,data:library}),expectedRevision:-1});
  assert.equal(JSON.parse(await b.call('db_kv_get',{table:'settings',key:'story_library_v2'})).data.characters.erin.future.retained,true);
  const candidates=[a,b].map((server,i)=>server.call('library_commit',{value:JSON.stringify({revision:1,data:{...library,future:i}}),expectedRevision:0}));
  assert.equal((await Promise.allSettled(candidates)).filter(r=>r.status==='fulfilled').length,1);
  const save=createStorySave(library,'harbor_story','group_fast');
  await a.call('text_save_commit',{value:JSON.stringify(save),expectedRevision:null});
  let hydrated=JSON.parse((await b.call('text_save_list'))[0].value);
  assert.equal(hydrated.textWorld.documents['world/description.md'].text,library.worlds.harbor.description);
  const stored=JSON.parse(await a.call('db_kv_get',{table:'saves',key:save.id}));
  assert.equal(stored.textWorld.documents['world/description.md'].text,undefined);
  assert.equal(await readFile(path.join(directory,'text-saves',save.id,stored.textSnapshot,'world/description.md'),'utf8'),library.worlds.harbor.description);
  const commits=[a,b].map((server,i)=>server.call('text_save_commit',{value:JSON.stringify({...save,name:`client${i}`,textWorld:{...save.textWorld,revision:1}}),expectedRevision:0}));
  assert.equal((await Promise.allSettled(commits)).filter(r=>r.status==='fulfilled').length,1);
  let authHeader:unknown,requests=0;
  mockServer=http.createServer((req,res)=>{ requests++; authHeader=req.headers.authorization;res.writeHead(200,{'Content-Type':'text/event-stream'});res.write('data: {"choices":[{"delta":{"content":"测试"}}]}\n\n');setTimeout(()=>res.end('data: [DONE]\n\n'),100); });
  await new Promise<void>(r=>mockServer!.listen(0,'127.0.0.1',r));
  const baseUrl=`http://127.0.0.1:${(mockServer.address() as any).port}`;
  const streamed:number[][]=[];
  assert.equal(await a.call('backend_chat_completion',{baseUrl,authType:'none',request:{stream:true}},bytes=>streamed.push(bytes)),null);
  assert(new TextDecoder().decode(Uint8Array.from(streamed.flat())).includes('测试'));assert.equal(authHeader,undefined);
  await assert.rejects(a.call('backend_chat_completion',{baseUrl,authType:'bearer',secretRef:`nonexistent_${randomUUID()}`,request:{stream:false}}),/Missing Bearer/);
  assert.equal(requests,1);
  a.child.stdin!.end();b.child.stdin!.end();
  const restart=await start();hydrated=JSON.parse((await restart.call('text_save_list'))[0].value);
  assert.equal(hydrated.textWorld.revision,1);
  console.log('PASS: shared SQLite, cross-process CAS, Markdown durability, restart, streamed proxy, strict credentials, private RPC');
} finally {
  mockServer?.close();
  for(const child of processes){child.stdin?.end();child.kill();}
}
