async (page) => {
  const calls=[];
  let pauseRelease;
  const pauseGate=new Promise(resolve=>{pauseRelease=resolve});
  await page.route('**/test/v1/chat/completions',async route=>{
    const body=route.request().postDataJSON(), current=body.messages.at(-1).content;
    const task=current.split('本次任务：')[1].split('\n\n材料：')[0];
    const material=JSON.parse(current.split('\n\n材料：\n')[1].split('\n\n唯一一次格式重试：')[0]);
    const input=current.split('用户原始输入：\n')[1].split('\n\n')[0];
    calls.push({body,task,material,input});
    if(input==='暂停测试')await pauseGate;
    let output;
    if(task.startsWith('选择')){
      const create=input==='我向另一位女孩打招呼。';
      const empty=input==='不是一个扫帚。'||input==='只描写海风。';
      output={characters:create||empty?[]:['erin'],new_characters:create?[{request_id:'new_1',description:'另一位女孩'}]:[],instructions:empty?'这是呈现或纠正要求，不作为角色对白，不推进人物动作。':'按玩家输入设计反应。'};
    }else if(task.startsWith('创建'))output={cards:[{request_id:'new_1',name:'路过的女孩',public:'站在路边的女孩。',profile:'说话爽朗。',initial_state:{summary:'刚来到路边。'}}]};
    else if(task.startsWith('一次设计'))output={characters:material.cards.map(c=>({character_id:c.character_id,expression:input==='格式错误测试'?[]:input==='大家安静。'?null:'你好，有什么事吗？',action:input==='大家安静。'?null:'停下脚步。',end_state:{summary:input==='大家安静。'?'安静观察。':'已听见招呼，停下脚步。'}}))};
    else output=input==='不是一个扫帚。'?'这里并没有扫帚。':input==='大家安静。'?'大家安静地待着。':input==='只描写海风。'?'清晨的海风吹过门前。':'女孩停下脚步，说：“你好，有什么事吗？”';
    await route.fulfill({contentType:'application/json',body:JSON.stringify({choices:[{message:{content:typeof output==='string'?output:JSON.stringify(output)}}],usage:{prompt_tokens:20,completion_tokens:10,total_tokens:30}})});
  });
  const field=page.getByRole('textbox',{name:'你的言行'});
  const send=async(text,revision)=>{await field.fill(text);await page.getByRole('button',{name:'发送',exact:true}).click();await page.getByText(`已保存版本 ${revision}`,{exact:true}).waitFor();if((await page.locator('body').innerText()).includes('【时间点'))throw Error('Anchor leaked into story UI');};
  await send('我向另一位女孩打招呼。',1);
  if(calls.length!==4)throw Error('New NPC must take four calls');
  await send('不是一个扫帚。',2);
  await send('大家安静。',3);
  if(calls.at(-1).material.performances.length!==0)throw Error('Silent NPC entered narration');
  await page.reload();await page.getByText('已保存版本 3',{exact:true}).waitFor();
  await field.fill('格式错误测试');await page.getByRole('button',{name:'发送',exact:true}).click();
  await page.getByText(/本轮处理未完成/).waitFor();
  if(!await page.getByText('已保存版本 3',{exact:true}).count())throw Error('Failed turn committed');
  await field.fill('暂停测试');await page.getByRole('button',{name:'发送',exact:true}).click();await page.getByRole('button',{name:'暂停生成',exact:true}).last().click();pauseRelease();
  await page.waitForFunction(()=>!document.querySelector('textarea[aria-label="你的言行"]')?.disabled);
  if(await field.inputValue()!=='暂停测试')throw Error('Cancel lost input');
  await send('只描写海风。',4);
  const historicalAssistant=calls.at(-1).body.messages.filter(m=>m.role==='assistant');
  if(!historicalAssistant.some(m=>m.content.endsWith('【时间点 4】')))throw Error('History anchors absent in request');
  if(historicalAssistant.some(m=>m.content.endsWith('【时间点 5】')))throw Error('Failure consumed anchor');
  await page.getByRole('link',{name:'查看人物：艾琳'}).click();await page.getByText('当前人物状态',{exact:true}).waitFor();await page.getByText(/安静观察/).waitFor();
  if((await page.locator('body').innerText()).includes('【时间点'))throw Error('Anchor leaked into character UI');
  const roles=Array.from(new Set(calls.map(c=>c.task.split('。')[0])));
  return {passed:true,calls:calls.length,roles,hasAnchorsInRequests:calls.every(c=>c.body.messages.some(m=>m.content.includes('【时间点 1】'))),text:(await page.locator('body').innerText()).slice(-950)};
}
