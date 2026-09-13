async (page) => {
  const requests=[];
  await page.route('**/test/v1/chat/completions', async route => {
    const body=route.request().postDataJSON(), content=body.messages[1].content, split=content.indexOf('\n\n');
    const task=content.slice(0,split), material=JSON.parse(content.slice(split+2));
    requests.push({task,material});
    let output;
    if(task.startsWith('为玩家')) {
      const correction=material.input==='不是这个，是另一个';
      output={background:'清晨，酒馆门外。',actions:correction?'我向路上另一位漂亮女孩打招呼，不是艾琳。':material.input,speech:'',correction:correction?'我向路上另一位漂亮女孩打招呼，不是艾琳。':null,clarification:null,new_people:(correction||task.startsWith('为玩家重演'))?[{name:'路过的女孩',public:'一位漂亮女孩，正在路上。'}]:[]};
    } else if(task.startsWith('感知')) output={deliveries:[]};
    else if(body.tools) {
      const path=material.paths[0];
      if(body.messages.length===2) output={op:'read',path};
      else if(body.messages.length===4){const doc=JSON.parse(body.messages.at(-1).content);output={op:'replace',path,expected_revision:doc.revision,old_text:doc.text,new_text:doc.text+'\n'+material.material.player};}
      else output={op:'done'};
    } else output=material.events.some(e=>e.text.includes('不是艾琳'))?'你朝路上另一位女孩打了招呼。':'艾琳以为你在向她打招呼。';
    await route.fulfill({contentType:'application/json',body:JSON.stringify({choices:[{message:body.tools?{content:null,tool_calls:[{id:'controlled',type:'function',function:{name:'document_command',arguments:JSON.stringify(output)}}]}:{content:typeof output==='string'?output:JSON.stringify(output)}}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}})});
  });
  const input=page.getByRole('textbox',{name:'你的言行'});
  await input.fill('我向路上一位漂亮女孩打招呼。');
  await page.getByRole('button',{name:'发送',exact:true}).click();
  await page.getByText('已保存版本 1',{exact:true}).waitFor();
  await input.fill('不是这个，是另一个');
  await page.getByRole('button',{name:'发送',exact:true}).click();
  await page.getByText('已保存版本 2',{exact:true}).waitFor();
  await page.getByText('纠正上一轮',{exact:true}).waitFor();
  await page.getByText('本轮已被后续纠正。以下是保留的旧记录，其剧情后果已撤回。',{exact:true}).waitFor();
  if(requests.filter(r=>r.task.startsWith('感知')).some(r=>r.material.event==='不是这个，是另一个'))throw Error('Feedback broadcast');
  await page.reload();
  await page.getByText('纠正上一轮',{exact:true}).waitFor();
  await page.getByRole('link',{name:'查看人物：路过的女孩'}).waitFor();
  return {passed:true,calls:requests.length,text:(await page.locator('body').innerText()).slice(-1600)};
}
