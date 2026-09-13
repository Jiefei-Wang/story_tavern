// Controlled HTTP transport for native UI reliability tests, never a live-model result.
import http from 'node:http';
http.createServer(async(req,res)=>{
  if(req.url!=='/v1/chat/completions'){res.writeHead(404);res.end();return;}
  try{
    let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);
    const content=body.messages[1].content,split=content.indexOf('\n\n'),task=content.slice(0,split),material=JSON.parse(content.slice(split+2));let output;
    if(material.input?.includes('接下来你准备'))await new Promise(r=>setTimeout(r,2000));
    if(task.startsWith('为玩家'))output={background:'清晨酒馆。',actions:material.input,speech:''};
    else if(task.startsWith('输入整理'))output={before:material.instructions.filter(i=>i.kind==='admin').map(i=>i.id),after:[],interpretation:'前置',scope:Object.fromEntries(material.instructions.filter(i=>i.kind==='admin').map(i=>[i.id,['scenes/current.md']]))};
    else if(task.startsWith('感知'))output={deliveries:[]};
    else if(task.startsWith('仅描述'))output={text:null};
    else if(body.tools){const path=material.paths.find(p=>p.startsWith('scenes/'))||material.paths[0];if(body.messages.length===2)output={op:'read',path};else if(body.messages.length===4){const doc=JSON.parse(body.messages.at(-1).content);output={op:'replace',path,expected_revision:doc.revision,old_text:doc.text,new_text:doc.text+'\n'+(task.startsWith('记录玩家')?material.material.player:'天气：细雨。')};}else output={op:'done'};}
    else output='你把蓝色玻璃珠放在桌上。';
    const message=body.tools?{content:null,tool_calls:[{id:'controlled_call',type:'function',function:{name:'document_command',arguments:JSON.stringify(output)}}]}:{content:typeof output==='string'?output:JSON.stringify(output)};
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message}],usage:{prompt_tokens:20,completion_tokens:10,total_tokens:30}}));
  }catch{res.writeHead(500);res.end(JSON.stringify({error:'controlled test request failed'}));}
}).listen(4180,'127.0.0.1',()=>console.log('Controlled native test transport on 127.0.0.1:4180'));
