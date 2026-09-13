import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const endpoint=`http://127.0.0.1:${process.env.STORY_TAVERN_TEST_PORT||4176}/command`;
const token=process.env.STORY_TAVERN_TEST_TOKEN;
if(!token)throw new Error('Need test-control token');
const command=async(action,input)=>{
 const response=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({action,input}),signal:AbortSignal.timeout(600000)});
 if(!response.ok)throw new Error(`Control HTTP ${response.status}`);const data=await response.json();if(data.error)throw new Error(data.error);return data.result;
};
const report={mode:process.env.STORY_TAVERN_CONTROLLED==='1'?'native controlled HTTP transport; not a live-model result':'native real model; isolated database',steps:[]};
const persist=()=>fs.writeFile(process.env.STORY_TAVERN_TEST_REPORT||'artifacts/text-first/native-smoke.json',JSON.stringify(report,null,2));
try{
 await command('play');const initial=await command('state');assert(initial.activeSave.textWorld);report.saveId=initial.activeSave.id;
 for(const input of ['我把一枚蓝色玻璃珠放在桌上，说：“这是我的东西。”','[admin]\n只修改场景记录，把天气改为细雨。保持人物位置与记忆。\n[/admin]']){
   const before=await command('state');console.log('Native input started');assert.equal(await command('send',input),true);const after=await command('state');assert.equal(after.activeSave.textWorld.revision,before.activeSave.textWorld.revision+1);assert.equal(after.activeSave.turns.at(-1).textTurn.commit,'saved');report.steps.push({input,status:'saved',revision:after.activeSave.textWorld.revision,narration:after.activeSave.turns.at(-1).narratorOutput,scene:after.activeSave.textWorld.documents[after.activeSave.textWorld.scene].text});await persist();
 }
 const beforeCancel=await command('state');await command('sendAsync','我问每个人：“接下来你准备做什么？”');await new Promise(r=>setTimeout(r,500));await command('cancel');
 for(let attempt=0;attempt<30;attempt++){if(!(await command('state')).isExecuting)break;await new Promise(r=>setTimeout(r,500));}
 const cancelled=await command('state');assert.deepEqual(cancelled.activeSave,beforeCancel.activeSave);report.steps.push({status:'cancelled; previous save preserved'});await persist();
 await command('reload');const reloaded=await command('state');assert.deepEqual(reloaded.activeSave.textWorld,beforeCancel.activeSave.textWorld);report.steps.push({status:'native reload verified'});await persist();
 assert.equal(await command('send','我看向刚才放下玻璃珠的桌子。'),true);const continued=await command('state');assert.equal(continued.activeSave.textWorld.revision,reloaded.activeSave.textWorld.revision+1);report.steps.push({status:'continued after reload',revision:continued.activeSave.textWorld.revision,scene:continued.activeSave.textWorld.documents[continued.activeSave.textWorld.scene].text});report.status='passed';await persist();console.log('Native send/admin/cancel/reload/continue passed');
}catch(error){report.status='failed';report.error=String(error);await persist();console.error(report.error);process.exitCode=1;}
