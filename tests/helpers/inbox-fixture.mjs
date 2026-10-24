import { readFileSync } from 'node:fs';
import { LocalD1 } from './local-d1.mjs';
const LOCAL_SECRET='LOCAL_META_APP_SECRET_NOT_REAL';
const LOCAL_KEY='LOCAL_ENCRYPTION_KEY_NOT_REAL';
const LOCAL_TOKEN='LOCAL_IG_TOKEN_NOT_REAL_';
const BASE='https://instapilot.test';
const sid1='a1'.repeat(32),sid2='b2'.repeat(32);
const encoder=new TextEncoder();
async function encrypt(text) {
  const key=await crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',encoder.encode(LOCAL_KEY)),'AES-GCM',false,['encrypt']);
  const iv=crypto.getRandomValues(new Uint8Array(12)),data=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,encoder.encode(text)));
  return Buffer.concat([Buffer.from(iv),Buffer.from(data)]).toString('base64');
}
async function decrypt(value) {
  const raw=Buffer.from(value,'base64'),key=await crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',encoder.encode(LOCAL_KEY)),'AES-GCM',false,['decrypt']);
  return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:raw.subarray(0,12)},key,raw.subarray(12)));
}
async function signature(raw) {
  const key=await crypto.subtle.importKey('raw',encoder.encode(LOCAL_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return 'sha256='+Buffer.from(await crypto.subtle.sign('HMAC',key,encoder.encode(raw))).toString('hex');
}
function webhook(text='مرحبا',mid='incoming-1',account='90001',customer='80001',extra={}) {
  return {object:'instagram',entry:[{id:account,messaging:[{sender:{id:customer},recipient:{id:account},timestamp:Date.now(),message:{mid,text,...extra}}]}]};
}
function makeMetaDouble() {
  const state={sends:[],profiles:0,unsupported:[],mode:'ok',aiReply:'أهلاً بيك. شلون أساعدك؟',aiCalls:0,holdAI:null,holdSend:null,confirmed:new Map()};
  async function fakeFetch(input,options={}) {
    const u=new URL(typeof input==='string'?input:input.url);
    if(u.origin==='https://api.instagram.com'&&u.pathname==='/oauth/access_token')return Response.json({access_token:'LOCAL_SHORT_TOKEN_NOT_REAL',user_id:state.oauthAccount||'90001'});
    if (u.origin==='https://api.groq.com' && u.pathname==='/openai/v1/chat/completions') {
      state.aiCalls++;
      if (state.holdAI) await state.holdAI;
      return Response.json({choices:[{message:{content:state.aiReply}}]});
    }
    if (u.origin==='https://graph.instagram.com') {
      if(u.pathname==='/access_token')return Response.json({access_token:LOCAL_TOKEN+(state.oauthAccount||'90001')});
      if(u.pathname==='/v21.0/me'&&u.searchParams.get('fields')==='user_id,username')return Response.json({user_id:state.oauthAccount||'90001',username:'local_oauth_account'});
      if(options.method==='POST'&&/\/subscribed_apps$/.test(u.pathname))return state.mode==='permissions'?Response.json({error:{code:10}},{status:403}):Response.json({success:true});
      if (options.method==='POST' && /^\/v21\.0\/\d+\/messages$/.test(u.pathname)) {
        const payload=JSON.parse(options.body),account=u.pathname.split('/')[2];
        const call={account,recipient:payload.recipient.id,text:payload.message.text,tag:payload.tag,messaging_type:payload.messaging_type};
        if (options.headers.authorization!=='Bearer '+LOCAL_TOKEN+account) throw new Error('Local token/store mismatch');
        state.sends.push(call);
        if (state.holdSend) await state.holdSend;
        if (state.mode==='network') throw new TypeError('Local simulated transport interruption');
        if (state.mode==='expired') return Response.json({error:{code:190,message:'Local expired token'}},{status:400});
        if (state.mode==='permissions') return Response.json({error:{code:10,message:'Local missing permission'}},{status:403});
        if (state.mode==='rate') return Response.json({error:{code:4,message:'Local rate limit'}},{status:429});
        if (state.mode==='server') return Response.json({error:{code:2}},{status:503});
        if (state.mode==='malformed') return Response.json({success:true});
        const mid='meta-local-'+state.sends.length;
        state.confirmed.set(mid,{id:mid,message:call.text,from:{id:account},to:{data:[{id:call.recipient}]},created_time:new Date().toISOString()});
        return Response.json({recipient_id:call.recipient,message_id:mid});
      }
      if (u.searchParams.get('fields')==='name,username,profile_pic') {
        state.profiles++;
        return Response.json({name:'زبون اختبار محلي',username:'local_test_customer'});
      }
      if (u.searchParams.get('fields')==='id,message,from,to,created_time') return Response.json(state.confirmed.get(decodeURIComponent(u.pathname.split('/').at(-1))) || {error:{code:100}});
    }
    state.unsupported.push({host:u.hostname,path:u.pathname});
    throw new Error('Blocked non-local provider request');
  }
  return {state,fetch:fakeFetch};
}
async function createFixture(database,worker,options={}) {
  const db=new LocalD1(database),meta=makeMetaDouble(),tasks=[];
  const env={DB:db,ENC_KEY:LOCAL_KEY,IG_APP_ID:'123456789',IG_APP_SECRET:LOCAL_SECRET,IG_VERIFY_TOKEN:'LOCAL_VERIFY',PUBLIC_URL:BASE,
    LIVE:'true',GROQ_API_KEY:'LOCAL_AI_KEY_NOT_REAL',AI_CHAIN:'groq',SMART_INBOX_ENABLED:options.enabled===false?'false':'true',
    ASSETS:{fetch:()=>new Response('Local asset adapter not configured',{status:404})}};
  const ctx={waitUntil(p){tasks.push(Promise.resolve(p));}};
  async function request(path,{method='GET',body,sid=sid1,headers={}}={}) {
    return worker.fetch(new Request(BASE+path,{method,headers:{...(sid?{cookie:'sid='+sid}:{}),...(body!==undefined?{'content-type':'application/json'}:{}),...headers},body:body!==undefined?JSON.stringify(body):undefined}),env,ctx);
  }
  async function settle() {
    while(tasks.length) await Promise.all(tasks.splice(0));
  }
  async function initialize() {
    env.SMART_INBOX_ENABLED='false';
    await request('/api/me',{sid:null});
    database.exec(readFileSync(new URL('../../migrations/0001_smart_inbox.sql',import.meta.url),'utf8'));
    env.SMART_INBOX_ENABLED=options.enabled===false?'false':'true';
    await reset();
  }
  async function reset() {
    await settle();
    for (const table of ['inbox_outbox','inbox_transfers','messages','inbox_conversations','notifs','notif_seen','events','drafts','blocked','bookings','sessions','items','stores','users','rl']) database.exec('DELETE FROM '+table);
    database.exec("DELETE FROM meta WHERE k LIKE 'inbox-subscription:%'");
    database.exec("INSERT INTO users(id,email,hash,salt,role,plan) VALUES(1,'one@local.invalid','','','owner','basic'),(2,'two@local.invalid','','','owner','basic')");
    const token1=await encrypt(LOCAL_TOKEN+'90001'),token2=await encrypt(LOCAL_TOKEN+'90002');
    database.prepare("INSERT INTO stores(id,user_id,name,ig_user_id,ig_token,ai_enabled) VALUES(1,1,'متجر اختبار أول','90001',?,0),(2,2,'متجر اختبار ثان','90002',?,0)").run(token1,token2);
    database.prepare('INSERT INTO sessions(token,user_id,created) VALUES(?,1,?),(?,2,?)').run(sid1,Date.now(),sid2,Date.now());
    Object.assign(meta.state,{sends:[],profiles:0,unsupported:[],mode:'ok',aiReply:'أهلاً بيك. شلون أساعدك؟',aiCalls:0,holdAI:null,holdSend:null,confirmed:new Map()});
    delete meta.state.oauthAccount;
    delete env.IG_HUMAN_AGENT_APPROVED;
    env.SMART_INBOX_ENABLED=options.enabled===false?'false':'true';env.LIVE='true';
  }
  async function receive(payload,{settle:wait=true,headers={}}={}) {
    const raw=JSON.stringify(payload),sig=await signature(raw);
    const response=await worker.fetch(new Request(BASE+'/webhook/instagram',{method:'POST',headers:{'x-hub-signature-256':sig,...headers},body:raw}),env,ctx);
    if (wait) await settle();
    return response;
  }
  const fixture={db,database,meta,env,ctx,tasks,request,initialize,reset,settle,receive,signature,webhook,sid1,sid2,BASE};
  return fixture;
}
export { createFixture, webhook, signature, encrypt, decrypt, makeMetaDouble, BASE, sid1, sid2, LOCAL_TOKEN, LOCAL_SECRET };
