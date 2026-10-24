import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/worker.js';
import { createFixture, webhook, sid1 } from '../tests/helpers/inbox-fixture.mjs';
const contentTypes={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.webp':'image/webp','.woff':'font/woff','.txt':'text/plain'};
async function createInboxPreview({port=0}={}) {
  const database=new DatabaseSync(':memory:');
  const fixture=await createFixture(database,worker);
  const originalFetch=globalThis.fetch;
  globalThis.fetch=fixture.meta.fetch;
  await fixture.initialize();
  async function seed() {
    await fixture.reset();
    await fixture.receive(webhook('أريد أحچي ويا صاحب البيج','preview-human','90001','80001'));
    await fixture.receive(webhook('عدكم توصيل للمنصور؟','preview-delivery','90001','80002'));
    await fixture.receive(webhook('شكراً، وصلني الطلب','preview-thanks','90001','80003'));
    const old=webhook('ممكن المسؤول يرد علي؟','preview-window','90001','80004');old.entry[0].messaging[0].timestamp=Date.now()-2*86400000;
    await fixture.receive(old);
    for(const [customer,name] of [['80001','زبون اختبار · علي'],['80002','زبونة اختبار · نور'],['80003','زبون اختبار · عمر'],['80004','زبونة اختبار · مريم']]) database.prepare('UPDATE inbox_conversations SET customer_name=? WHERE customer_id=? AND store_id=1').run(name,customer);
    database.prepare('UPDATE stores SET ai_enabled=1 WHERE id=1').run();
  }
  await seed();
  const publicRoot=resolve(fileURLToPath(new URL('../public/',import.meta.url)));
  fixture.env.ASSETS={fetch:async req=>{
    try {
      const pathname=decodeURIComponent(new URL(req.url).pathname);
      const file=resolve(publicRoot,'.'+(pathname==='/'?'/index.html':pathname));
      if(file!==publicRoot&&!file.startsWith(publicRoot+'/'))return new Response('Not found',{status:404});
      let body=await readFile(file);
      if(file.endsWith('/index.html')){
        const banner='<aside style="position:fixed;z-index:99999;inset:0 0 auto;background:#ead7a3;color:#30250b;text-align:center;font:11px/1.8 system-ui;padding:2px 8px;pointer-events:none" role="note">معاينة محلية — أسماء ورسائل اختبارية. لا اتصال بإنستغرام الحقيقي.</aside>';
        body=Buffer.from(body.toString().replace('<body>','<body>'+banner));
      }
      return new Response(body,{headers:{'content-type':contentTypes[extname(file)]||'application/octet-stream','cache-control':'no-store'}});
    }catch{return new Response('Not found',{status:404});}
  }};
  let origin='';
  const server=http.createServer(async(req,res)=>{
    try {
      let raw='';for await(const part of req){raw+=part;if(Buffer.byteLength(raw)>600000){res.writeHead(413);res.end();return;}}
      const url=new URL(req.url,origin);
      if(url.pathname.startsWith('/__local/')){
        if(req.headers.origin&&req.headers.origin!==origin){res.writeHead(403);res.end();return;}
        if(url.pathname==='/__local/start'){
          res.writeHead(302,{'set-cookie':'sid='+sid1+'; HttpOnly; SameSite=Lax; Path=/','location':'/#/inbox','cache-control':'no-store'});res.end();return;
        }
        const json=raw?JSON.parse(raw):{};
        let result;
        if(url.pathname==='/__local/reset'&&req.method==='POST'){await seed();result={ok:true};}
        else if(url.pathname==='/__local/message'&&req.method==='POST'){
          const payload=webhook(String(json.text || 'رسالة اختبار جديدة'),String(json.mid || crypto.randomUUID()),'90001',String(json.customer || '80001'));
          if(json.timestamp)payload.entry[0].messaging[0].timestamp=json.timestamp;
          const r=await fixture.receive(payload);result={ok:r.ok,status:r.status};
        }else if(url.pathname==='/__local/provider'&&req.method==='POST'){
          if(['ok','network','expired','permissions','rate','server','malformed'].includes(json.mode))fixture.meta.state.mode=json.mode;
          if(typeof json.ai_reply==='string')fixture.meta.state.aiReply=json.ai_reply;
          if(json.ai_enabled!==undefined)database.prepare('UPDATE stores SET ai_enabled=? WHERE id=1').run(json.ai_enabled?1:0);
          if(json.human_agent!==undefined)fixture.env.IG_HUMAN_AGENT_APPROVED=json.human_agent?'true':'false';
          result={ok:true};
        }else if(url.pathname==='/__local/stats'){
          result={sends:fixture.meta.state.sends,unsupported:fixture.meta.state.unsupported,ai_calls:fixture.meta.state.aiCalls};
        }else{res.writeHead(404);res.end();return;}
        res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(result));return;
      }
      const headers=new Headers();
      for(const [key,value]of Object.entries(req.headers)){if(value)headers.set(key,Array.isArray(value)?value.join(','):value);}
      const request=new Request(origin+req.url,{method:req.method,headers,body:!['GET','HEAD'].includes(req.method)?raw:undefined});
      const response=await worker.fetch(request,fixture.env,fixture.ctx);
      res.writeHead(response.status,Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    }catch{res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:'Local preview request failed'}));}
  });
  await new Promise((ok,fail)=>{server.once('error',fail);server.listen(port,'127.0.0.1',ok);});
  origin='http://127.0.0.1:'+server.address().port;fixture.env.PUBLIC_URL=origin;
  const close=async()=>{await new Promise(r=>server.close(r));await fixture.settle();globalThis.fetch=originalFetch;database.close();};
  return {origin,url:origin+'/__local/start',close,fixture};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const preview=await createInboxPreview({port:Number(process.env.INBOX_PREVIEW_PORT || 3100)});
  if(process.env.INBOX_PREVIEW_INFO)await writeFile(process.env.INBOX_PREVIEW_INFO,JSON.stringify({origin:preview.origin,url:preview.url}));
  process.stdout.write('Local Smart Inbox preview: '+preview.url+'\nTest data only. Real Meta and production D1 are never used.\n');
  const finish=async()=>{await preview.close();process.exit(0);};
  process.on('SIGTERM',finish);process.on('SIGINT',finish);
}
export { createInboxPreview };
