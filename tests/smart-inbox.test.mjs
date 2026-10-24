import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { LocalD1 } from './helpers/local-d1.mjs';
import worker from '../src/worker.js';
import { SmartInbox, UNKNOWN_REPLY, HANDOFF_ACK, HANDOFF_OFFER, wantsHuman, transportFailure } from '../src/smart-inbox.js';
import { createFixture, webhook, decrypt, BASE, sid2 } from './helpers/inbox-fixture.mjs';
const sqlite=new DatabaseSync(':memory:');
const fixture=await createFixture(sqlite,worker);
const originalFetch=globalThis.fetch;
globalThis.fetch=fixture.meta.fetch;
await fixture.initialize();
const api=async(path,body,session)=>{const r=await fixture.request('/api/inbox/'+path,{method:body===undefined?'GET':'POST',body,sid:session});return {status:r.status,body:await r.json()};};
const conv=()=>sqlite.prepare('SELECT * FROM inbox_conversations WHERE store_id=1 ORDER BY id LIMIT 1').get();
const takeover=async()=>{const c=conv();return api('takeover',{conversation_id:c.id,version:c.version,request_key:crypto.randomUUID()});};
const send=async(text='رد من صاحب المتجر',extra={})=>api('send',{conversation_id:conv().id,text,idempotency_key:crypto.randomUUID(),...extra});
const until=async fn=>{for(let n=0;n<200;n++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw Error('Local asynchronous condition timed out');};
const service=()=>new SmartInbox(fixture.env,{decrypt});
after(()=>{globalThis.fetch=originalFetch;sqlite.close();});
await test('Smart Inbox: real Worker, SQLite transactions and local provider double',async t=>{
  t.beforeEach(()=>fixture.reset());
  t.afterEach(()=>assert.deepEqual(fixture.meta.state.unsupported,[]));
  await t.test('transport diagnostics redact exception content and retain uncertain-send protection',async()=>{
    for(const [name,message,reason] of [
      ['TimeoutError','request timeout access_token=PRIVATE_TEST_TOKEN','TIMEOUT'],
      ['TypeError','redirect https://example.invalid/?access_token=PRIVATE_TEST_TOKEN','REDIRECT'],
      ['Error','Cannot perform I/O on behalf of a different request PRIVATE_TEST_TOKEN','WORKER_CONTEXT'],
      ['AbortError','PRIVATE_TEST_TOKEN','ABORTED'],
      ['PRIVATE_TEST_TOKEN','PRIVATE_TEST_TOKEN','NETWORK_OR_RUNTIME']
    ]) {
      const info=transportFailure({name,message});
      assert.equal(info.reason,reason);assert(!JSON.stringify(info).includes('PRIVATE_TEST_TOKEN'));
    }
    await fixture.receive(webhook());await takeover();fixture.meta.state.mode='network';
    const original=console.warn,logs=[];console.warn=(...args)=>logs.push(args);
    try {
      const key=crypto.randomUUID();const r=await send('تشخيص محلي',{idempotency_key:key});
      assert.equal(r.body.status,'UNKNOWN');assert(conv().active_send_id);
      await send('تشخيص محلي',{idempotency_key:key});assert.equal(fixture.meta.state.sends.length,1);
      assert.equal(logs.length,1);assert.equal(logs[0][0],'inbox_send_transport_failure');
      const detail=JSON.parse(logs[0][1]);assert.equal(detail.reason,'NETWORK_OR_RUNTIME');assert.equal(detail.store_id,1);
      assert.deepEqual(Object.keys(detail).sort(),['name','outbox_id','reason','store_id']);
      assert(!JSON.stringify(logs).includes('تشخيص محلي'));assert(!JSON.stringify(logs).includes('LOCAL_IG_TOKEN'));
    } finally {console.warn=original;}
  });
  await t.test('signed inbound is durable and unread; duplicate deliveries count once',async()=>{
    const payload=webhook('رسالة من الزبون','original-meta-mid');
    const responses=await Promise.all(Array.from({length:12},()=>fixture.receive(payload)));
    assert(responses.every(r=>r.status===200));
    assert.equal(sqlite.prepare("SELECT count(*) n FROM messages WHERE mid='original-meta-mid'").get().n,1);
    const c=conv();assert.equal(c.unread_count,1);
    const thread=await api('thread?conversation_id='+c.id);
    assert.equal(thread.status,200);assert.equal(thread.body.messages[0].text,'رسالة من الزبون');
    assert.equal(thread.body.messages[0].meta_message_id,'original-meta-mid');
    assert.equal(fixture.meta.state.sends.length,0);
  });
  await t.test('invalid signatures and altered recipients cannot inject customer messages',async()=>{
    const raw=JSON.stringify(webhook());
    const r=await worker.fetch(new Request(BASE+'/webhook/instagram',{method:'POST',headers:{'x-hub-signature-256':'sha256='+'0'.repeat(64)},body:raw}),fixture.env,fixture.ctx);
    assert.equal(r.status,401);
    const wrong=webhook();wrong.entry[0].messaging[0].recipient.id='90002';await fixture.receive(wrong);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM messages').get().n,0);
  });
  await t.test('Iraqi requests commit human mode, one notification and one acknowledgement',async()=>{
    for(const [n,text] of ['أريد أحچي ويا صاحب البيج','ممكن المسؤول يرد علي؟','ما أريد بوت','حولني لصاحب المحل'].entries()){
      const payload=webhook(text,'request-human-'+n,'90001',String(80001+n));
      await fixture.receive(payload);await fixture.receive(payload);
    }
    assert.equal(sqlite.prepare("SELECT count(*) n FROM inbox_conversations WHERE state='HUMAN_ACTIVE' AND needs_attention=1").get().n,4);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM notifs WHERE inbox_event_id IS NOT NULL').get().n,4);
    assert.equal(fixture.meta.state.sends.length,4);
    assert(fixture.meta.state.sends.every(s=>s.text===HANDOFF_ACK&&!s.tag));
    assert.equal((await api('summary')).body.waiting,4);
    assert.equal(wantsHuman('ما اريد احچي ويا صاحب البيج'),false);
    assert.equal(wantsHuman('شنو سعر هذا المنتج؟'),false);
    assert.equal(wantsHuman('أريد أعرف اسم صاحب البيج'),false);
    assert.equal(wantsHuman('ممكن أعرف دوام المسؤول؟'),false);
    assert.equal(wantsHuman('أريد صاحب المحل'),true);
  });
  await t.test('owner takeover, real Send API contract, Meta id and attention cleared',async()=>{
    await fixture.receive(webhook());assert.equal((await takeover()).status,200);
    const r=await send();assert.equal(r.status,200);assert.equal(r.body.status,'SENT');
    assert.match(r.body.meta_message_id,/^meta-local-/);
    assert.equal(fixture.meta.state.sends[0].account,'90001');assert.equal(fixture.meta.state.sends[0].recipient,'80001');
    assert.equal(fixture.meta.state.sends[0].tag,undefined);assert.equal(conv().needs_attention,0);
    const thread=(await api('thread?conversation_id='+conv().id)).body;
    assert(thread.messages.some(m=>m.author_type==='HUMAN'&&m.meta_message_id===r.body.meta_message_id));
  });
  await t.test('concurrent retries with one idempotency key dispatch only once',async()=>{
    await fixture.receive(webhook());await takeover();
    let release;fixture.meta.state.holdSend=new Promise(r=>release=r);
    const key=crypto.randomUUID(),body={conversation_id:conv().id,text:'رد واحد فقط',idempotency_key:key};
    const first=api('send',body);await until(()=>fixture.meta.state.sends.length===1);
    const duplicate=await Promise.all(Array.from({length:15},()=>api('send',body)));
    release();const final=await first;
    assert.equal(final.body.status,'SENT');assert(duplicate.every(r=>r.status===200));
    assert.equal(fixture.meta.state.sends.length,1);
    assert.equal(sqlite.prepare("SELECT count(*) n FROM inbox_outbox WHERE author_type='HUMAN'").get().n,1);
    assert.equal((await api('send',{...body,text:'نص آخر'})).status,409);
  });
  await t.test('all thread mutations are tenant scoped even with a forged conversation id',async()=>{
    await fixture.receive(webhook());await takeover();const c=conv();
    for(const [path,body] of [
      ['thread?conversation_id='+c.id,undefined],['read',{conversation_id:c.id,through_id:0}],
      ['takeover',{conversation_id:c.id,version:c.version,request_key:crypto.randomUUID()}],
      ['resume',{conversation_id:c.id,version:c.version,request_key:crypto.randomUUID()}],
      ['close',{conversation_id:c.id,version:c.version,request_key:crypto.randomUUID()}],
      ['reopen',{conversation_id:c.id,version:c.version,request_key:crypto.randomUUID()}],
      ['send',{conversation_id:c.id,text:'هجوم',idempotency_key:crypto.randomUUID()}],
      ['reconcile',{conversation_id:c.id,message_id:'x',meta_message_id:'y'}]
    ]) assert.equal((await api(path,body,sid2)).status,404,path);
    assert.equal((await api('conversations',undefined,sid2)).body.conversations.length,0);
    await fixture.receive(webhook('متجر ثان','second-store','90002','80001'));
    assert.equal((await api('conversations',undefined,sid2)).body.conversations.length,1);
    assert.equal(fixture.meta.state.sends.length,0);
  });
  await t.test('authentication, JSON, origin checks and no-store protect APIs',async()=>{
    assert.equal((await fixture.request('/api/inbox/summary',{sid:null})).status,401);
    assert.equal((await fixture.request('/api/inbox/send',{method:'POST',body:{},headers:{origin:'https://evil.invalid'}})).status,403);
    assert.equal((await fixture.request('/api/inbox/send',{method:'POST'})).status,415);
    const good=await fixture.request('/api/inbox/summary');assert.equal(good.headers.get('cache-control'),'no-store');
  });
  await t.test('read-through cannot mark a subsequently received message read',async()=>{
    await fixture.receive(webhook('الأولى','read-1'));
    const snap=(await api('thread?conversation_id='+conv().id)).body;
    await fixture.receive(webhook('الثانية','read-2'));
    assert.equal((await api('read',{conversation_id:conv().id,through_id:snap.read_through_id})).status,200);
    assert.equal(conv().unread_count,1);
    await fixture.receive(webhook('خارج المتجر','read-other','90002'));
    const badId=sqlite.prepare("SELECT id FROM messages WHERE mid='read-other'").get().id;
    assert.equal((await api('read',{conversation_id:conv().id,through_id:badId})).status,400);
  });
  await t.test('expired token and missing permission produce honest failures without secrets',async()=>{
    for(const mode of ['expired','permissions']){
      await fixture.reset();await fixture.receive(webhook());await takeover();fixture.meta.state.mode=mode;
      const r=await send();assert.equal(r.body.status,'FAILED');assert.equal(r.body.meta_message_id,null);
      assert.equal(r.body.error.code,mode==='expired'?'TOKEN_EXPIRED':'PERMISSION_DENIED');
      assert(!JSON.stringify(r.body).includes('LOCAL_IG_TOKEN'));assert.equal(conv().active_send_id,null);
    }
  });
  await t.test('24h and 7d policy; Human Agent is approved and explicitly manual only',async()=>{
    await fixture.receive(webhook());await takeover();
    sqlite.prepare('UPDATE inbox_conversations SET last_customer_message_at=?').run(Date.now()-2*86400000);
    assert.equal((await send()).body.code,'WINDOW_CLOSED');fixture.env.IG_HUMAN_AGENT_APPROVED='true';
    assert.equal((await send()).body.code,'HUMAN_AGENT_REQUIRED');
    const r=await send('رد بشري للدعم',{use_human_agent:true});assert.equal(r.body.status,'SENT');
    assert.equal(fixture.meta.state.sends[0].tag,'HUMAN_AGENT');
    assert.equal(fixture.meta.state.sends[0].messaging_type,'MESSAGE_TAG');
    await assert.rejects(service().sendSystem(await service().store(1),'80001','إشعار آلي','outside-window-system'),e=>e.code==='WINDOW_CLOSED');
    assert.equal(fixture.meta.state.sends.length,1);
    sqlite.prepare('UPDATE inbox_conversations SET last_customer_message_at=?').run(Date.now()-8*86400000);
    assert.equal((await send('خارج سبعة أيام',{use_human_agent:true})).body.code,'WINDOW_CLOSED');
  });
  await t.test('ambiguous transport blocks resume and is not retried; signed echo reconciles',async()=>{
    await fixture.receive(webhook());await takeover();fixture.meta.state.mode='network';
    const key=crypto.randomUUID(),r=await send('رسالة غير محسومة',{idempotency_key:key});
    assert.equal(r.body.status,'UNKNOWN');assert(conv().active_send_id);
    const dup=await send('رسالة غير محسومة',{idempotency_key:key});assert.equal(dup.body.status,'UNKNOWN');
    assert.equal(fixture.meta.state.sends.length,1);
    const c=conv();assert.equal((await api('resume',{conversation_id:c.id,version:c.version,request_key:crypto.randomUUID()})).body.code,'SEND_IN_PROGRESS');
    const payload=webhook('رسالة غير محسومة','confirmed-echo'),e=payload.entry[0].messaging[0];
    e.sender.id='90001';e.recipient.id='80001';e.message.is_echo=true;await fixture.receive(payload);
    assert.equal(sqlite.prepare("SELECT status FROM inbox_outbox WHERE idempotency_key=?").get(key).status,'SENT');
    assert.equal(conv().active_send_id,null);
  });
  await t.test('AI responds, human mode stops it and resume includes human history',async()=>{
    sqlite.prepare('UPDATE stores SET ai_enabled=1 WHERE id=1').run();
    await fixture.receive(webhook('أهلا','ai-first'));assert.equal(fixture.meta.state.sends.length,1);
    await takeover();await send('هذا الرد كتبه صاحب المتجر');
    await fixture.receive(webhook('سؤال للموظف','human-mode'));
    assert.equal(fixture.meta.state.sends.length,2);assert.equal(fixture.meta.state.aiCalls,1);
    const c=conv();assert.equal((await api('resume',{conversation_id:c.id,version:c.version,request_key:crypto.randomUUID()})).status,200);
    await fixture.receive(webhook('ممكن تكمل وياي؟','after-resume'));
    assert.equal(fixture.meta.state.aiCalls,2);assert.equal(fixture.meta.state.sends.length,3);
    const h=await service().history(await service().conversation(1,c.id),'after-resume');
    assert(h.some(m=>m.role==='assistant'&&m.content==='هذا الرد كتبه صاحب المتجر'));
  });
  await t.test('takeover during AI generation cancels the pending bot send',async()=>{
    sqlite.prepare('UPDATE stores SET ai_enabled=1 WHERE id=1').run();
    let release;fixture.meta.state.holdAI=new Promise(r=>release=r);
    const received=await fixture.receive(webhook('تحية','race-generation'),{settle:false});assert.equal(received.status,200);
    await until(()=>fixture.meta.state.aiCalls===1);assert.equal((await takeover()).status,200);
    release();await fixture.settle();
    assert.equal(conv().state,'HUMAN_ACTIVE');assert.equal(fixture.meta.state.sends.length,0);
  });
  await t.test('takeover cannot claim success while a bot send is already in flight',async()=>{
    sqlite.prepare('UPDATE stores SET ai_enabled=1 WHERE id=1').run();
    let release;fixture.meta.state.holdSend=new Promise(r=>release=r);
    await fixture.receive(webhook('تحية','race-sending'),{settle:false});await until(()=>fixture.meta.state.sends.length===1);
    const blocked=await takeover();assert.equal(blocked.status,409);assert.equal(blocked.body.code,'SEND_IN_PROGRESS');
    release();await fixture.settle();assert.equal((await takeover()).status,200);
  });
  await t.test('two understanding failures use the literal fallback and offer without takeover',async()=>{
    sqlite.prepare('UPDATE stores SET ai_enabled=1 WHERE id=1').run();fixture.meta.state.aiReply='UNCLEAR';
    await fixture.receive(webhook('كلام غير مفهوم أول','unclear-1'));await fixture.receive(webhook('كلام غير مفهوم ثان','unclear-2'));
    assert.deepEqual(fixture.meta.state.sends.map(m=>m.text),[UNKNOWN_REPLY,UNKNOWN_REPLY,HANDOFF_OFFER]);
    assert.equal(conv().state,'AI_ACTIVE');assert.equal(conv().unrecognized_count,2);
    await fixture.receive(webhook('نعم','accept-handoff'));assert.equal(conv().state,'HUMAN_ACTIVE');
    assert.equal(fixture.meta.state.sends.at(-1).text,HANDOFF_ACK);
  });
  await t.test('missing store knowledge is distinct from unintelligible input',async()=>{
    sqlite.prepare('UPDATE stores SET ai_enabled=1 WHERE id=1').run();fixture.meta.state.aiReply='NO_KNOWLEDGE';
    await fixture.receive(webhook('هل يوجد مقاس خاص؟','knowledge'));
    assert.equal(conv().state,'AI_ACTIVE');assert.equal(conv().unrecognized_count,0);
    assert(fixture.meta.state.sends[0].text.includes('هالمعلومة مو متوفرة'));
  });
  await t.test('our echo cannot cause a loop; an external owner reply takes over',async()=>{
    sqlite.prepare('UPDATE stores SET ai_enabled=1 WHERE id=1').run();await fixture.receive(webhook('اهلا','echo-base'));
    const payload=webhook(fixture.meta.state.sends[0].text,'meta-local-1'),e=payload.entry[0].messaging[0];
    e.sender.id='90001';e.recipient.id='80001';e.message.is_echo=true;await fixture.receive(payload);
    assert.equal(conv().state,'AI_ACTIVE');assert.equal(fixture.meta.state.sends.length,1);
    e.message.mid='native-owner-mid';e.message.text='رد يدوي من تطبيق المتجر';await fixture.receive(payload);
    assert.equal(conv().state,'HUMAN_ACTIVE');assert.equal(fixture.meta.state.aiCalls,1);
    assert.equal(sqlite.prepare("SELECT count(*) n FROM inbox_outbox WHERE author_type='EXTERNAL'").get().n,1);
  });
  await t.test('close and inbound reopen preserve human mode; stale actions are rejected',async()=>{
    await fixture.receive(webhook());await takeover();const c=conv();
    assert.equal((await api('close',{conversation_id:c.id,version:c.version,request_key:crypto.randomUUID()})).body.conversation.state,'CLOSED');
    assert.equal((await api('reopen',{conversation_id:c.id,version:c.version,request_key:crypto.randomUUID()})).status,409);
    await fixture.receive(webhook('أحتاج مساعدة ثانية','reopen-inbound'));
    assert.equal(conv().state,'HUMAN_ACTIVE');assert.equal(conv().needs_attention,1);
  });
  await t.test('reconnecting another Instagram account cannot send old conversations',async()=>{
    await fixture.receive(webhook());await takeover();sqlite.prepare("UPDATE stores SET ig_user_id='90003' WHERE id=1").run();
    assert.equal((await send()).body.code,'ACCOUNT_CHANGED');assert.equal(fixture.meta.state.sends.length,0);
  });
  await t.test('only explicit retry of a definitively rejected send can dispatch again',async()=>{
    await fixture.receive(webhook());await takeover();fixture.meta.state.mode='rate';
    const failed=(await send('رد مرفوض مؤقتاً')).body;
    assert.equal(failed.status,'FAILED');assert.equal(failed.error.retriable,true);
    fixture.meta.state.mode='ok';
    const rowId=failed.id.replace(/^out:/,'');
    const replies=await Promise.all(Array.from({length:8},()=>send('رد مرفوض مؤقتاً',{retry_of:rowId})));
    assert(replies.every(r=>r.status===200));assert.equal(fixture.meta.state.sends.length,2);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM inbox_outbox WHERE retry_of=?').get(rowId).n,1);
  });
  await t.test('future timestamps and old imports do not manufacture a messaging window',async()=>{
    const payload=webhook('أهلا','future');payload.entry[0].messaging[0].timestamp=Date.now()+86400000;
    await fixture.receive(payload);await takeover();assert.equal(conv().last_customer_message_at,null);
    assert.equal((await send()).body.code,'WINDOW_CLOSED');assert.equal(fixture.meta.state.sends.length,0);
  });
  await t.test('malformed provider success and server errors stay unknown without retries',async()=>{
    for(const mode of ['malformed','server']){
      await fixture.reset();await fixture.receive(webhook());await takeover();fixture.meta.state.mode=mode;
      const r=await send();assert.equal(r.body.status,'UNKNOWN');assert.equal(r.body.error.retriable,false);
      await service().sweep();assert.equal(fixture.meta.state.sends.length,1);assert(conv().active_send_id);
    }
  });
  await t.test('cron recovery only retries generation with no attempted outbox',async()=>{
    await fixture.receive(webhook('انتظار','crash-before-send'));
    sqlite.prepare("UPDATE messages SET status='processing',inbox_attempts=1 WHERE mid='crash-before-send'").run();
    sqlite.prepare('UPDATE inbox_conversations SET ai_job_mid=?,ai_job_token=?,ai_job_started=?').run('crash-before-send','old-job-token',Date.now()-180000);
    await service().sweep();assert.equal(sqlite.prepare("SELECT status FROM messages WHERE mid='crash-before-send'").get().status,'pending');
    sqlite.prepare("UPDATE messages SET status='processing',inbox_attempts=2 WHERE mid='crash-before-send'").run();
    sqlite.prepare('UPDATE inbox_conversations SET ai_job_mid=?,ai_job_token=?,ai_job_started=?').run('crash-before-send','next-job-token',Date.now()-180000);
    sqlite.prepare("INSERT INTO inbox_outbox(id,store_id,conversation_id,idempotency_key,source_mid,author_type,text,status,meta_message_id,created_at) VALUES('partial',1,?,'partial-key','crash-before-send','AI','جزء أُرسل','SENT','partial-meta',?)").run(conv().id,Date.now()-180000);
    await service().sweep();assert.equal(sqlite.prepare("SELECT status FROM messages WHERE mid='crash-before-send'").get().status,'error');
    assert.equal(fixture.meta.state.sends.length,0);
  });
  await t.test('an orphaned in-flight send becomes unknown and retains its lock',async()=>{
    await fixture.receive(webhook());await takeover();const c=conv(),when=Date.now()-180000;
    sqlite.prepare("INSERT INTO inbox_outbox(id,store_id,conversation_id,idempotency_key,author_type,text,status,created_at,attempted_at) VALUES('orphan',1,?,'orphan-key','HUMAN','نتيجة غير معروفة','SENDING',?,?)").run(c.id,when,when);
    sqlite.prepare("UPDATE inbox_conversations SET active_send_id='orphan' WHERE id=?").run(c.id);
    await service().sweep();assert.equal(sqlite.prepare("SELECT status FROM inbox_outbox WHERE id='orphan'").get().status,'UNKNOWN');
    assert.equal(conv().active_send_id,'orphan');assert.equal(fixture.meta.state.sends.length,0);
  });
  await t.test('a webhook retry repairs a lost acknowledgement without a false transfer or duplicate',async()=>{
    sqlite.exec("CREATE TRIGGER fail_local_ack BEFORE INSERT ON inbox_outbox WHEN NEW.author_type='SYSTEM' BEGIN SELECT RAISE(ABORT,'local injected failure'); END");
    const payload=webhook('ما أريد بوت','ack-retry');
    const first=await fixture.receive(payload);assert.equal(first.status,500);
    assert.equal(conv().state,'HUMAN_ACTIVE');assert.equal(fixture.meta.state.sends.length,0);
    sqlite.exec('DROP TRIGGER fail_local_ack');
    assert.equal((await fixture.receive(payload)).status,200);assert.equal(fixture.meta.state.sends.length,1);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM notifs').get().n,1);
  });
  await t.test('ambiguous Instagram ownership is rejected instead of choosing another merchant',async()=>{
    sqlite.prepare("UPDATE stores SET ig_user_id='90001' WHERE id=2").run();
    assert.equal((await fixture.receive(webhook())).status,503);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM messages').get().n,0);
  });
  await t.test('Meta-id reconciliation verifies sender, recipient, time and original text',async()=>{
    await fixture.receive(webhook());await takeover();fixture.meta.state.mode='network';
    const row=(await send('رد موثّق')).body,mid='remote-proof';
    fixture.meta.state.confirmed.set(mid,{id:mid,message:'رد موثّق',from:{id:'90002'},to:{data:[{id:'80001'}]},created_time:new Date().toISOString()});
    const body={conversation_id:conv().id,message_id:row.id.replace(/^out:/,''),meta_message_id:mid};
    assert.equal((await api('reconcile',body)).status,409);
    fixture.meta.state.confirmed.get(mid).from.id='90001';
    assert.equal((await api('reconcile',body)).body.status,'SENT');assert.equal(conv().active_send_id,null);
  });
  await t.test('additive migration preserves legacy rows and never opens an unverified window',async()=>{
    const old=new DatabaseSync(':memory:');
    const code=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
    const statements=runInNewContext(code.match(/const SCHEMA=(\[[\s\S]*?\]);\nasync function init/)[1]);
    old.exec(statements.join(';')+';');
    old.exec("INSERT INTO users(id,email) VALUES(1,'legacy@local.invalid');INSERT INTO stores(id,user_id,name,ig_user_id,ig_token) VALUES(1,1,'legacy store','90001','unchanged-local-ciphertext');INSERT INTO messages(id,store_id,mid,sender,text,reply,status) VALUES(1,1,'legacy-original','80001','أصلية','رد محفوظ','sent');");
    const before={...old.prepare('SELECT * FROM messages').get()},store={...old.prepare('SELECT * FROM stores').get()};
    const migration=readFileSync(new URL('../migrations/0001_smart_inbox.sql',import.meta.url),'utf8');old.exec('BEGIN;'+migration+'COMMIT;');
    const after=old.prepare('SELECT * FROM messages').get();for(const [key,value]of Object.entries(before))assert.equal(after[key],value);
    assert.deepEqual({...old.prepare('SELECT * FROM stores').get()},store);
    assert.equal(old.prepare('SELECT last_customer_message_at FROM inbox_conversations').get().last_customer_message_at,null);
    old.close();
    const missing=new DatabaseSync(':memory:');const i=new SmartInbox({...fixture.env,DB:new LocalD1(missing)},{decrypt});
    await assert.rejects(i.ready(),e=>e.code==='INBOX_MIGRATION_REQUIRED');missing.close();
  });
  await t.test('subscription results are explicit and scoped to the authenticated store',async()=>{
    assert.equal((await api('subscribe',{})).body.ok,true);
    assert.equal((await api('summary')).body.subscription.ok,true);
    assert.equal((await api('summary',undefined,sid2)).body.subscription,null);
    fixture.meta.state.mode='permissions';assert.equal((await api('subscribe',{})).status,502);
    assert.equal((await api('summary')).body.subscription.ok,false);
  });
  await t.test('existing OAuth state, encrypted token and callback return survive inbox activation',async()=>{
    const connect=await fixture.request('/api/instagram/connect'),oauth=await connect.json(),url=new URL(oauth.url);
    const r=await fixture.request('/api/instagram/callback?code=LOCAL_AUTHORIZATION_CODE_NOT_REAL&state='+encodeURIComponent(url.searchParams.get('state')));
    assert.equal(r.status,302);assert.equal(r.headers.get('location'),'/#/ig');
    const store=await service().store(1);assert.equal(await decrypt(store.ig_token),'LOCAL_IG_TOKEN_NOT_REAL_90001');
    assert.equal((await api('summary')).body.subscription.ok,true);
    assert(!JSON.stringify((await fixture.request('/api/me')).headers).includes('LOCAL_IG_TOKEN'));
  });
  await t.test('OAuth cannot bind an account already owned by another store',async()=>{
    const before=sqlite.prepare('SELECT ig_token,ig_user_id FROM stores WHERE id=2').get();
    const r=await fixture.request('/api/instagram/callback?code=LOCAL_AUTHORIZATION_CODE_NOT_REAL&state='+sid2.slice(0,16),{sid:sid2});
    assert.equal(r.status,409);assert.deepEqual(sqlite.prepare('SELECT ig_token,ig_user_id FROM stores WHERE id=2').get(),before);
  });
  await t.test('existing booking confirmation remains atomic with the draft under Smart Inbox',async()=>{
    sqlite.prepare('UPDATE stores SET ai_enabled=1 WHERE id=1').run();
    sqlite.exec("INSERT INTO items(id,store_id,kind,title,price) VALUES(11,1,'product','قميص','25000')");
    const draft={items:[{id:11,qty:2}],address:'بغداد المنصور',phone:'07701234567',cur:11,stage:'confirm',ask:'c'};
    sqlite.prepare('INSERT INTO drafts(store_id,sender,data) VALUES(1,?,?)').run('80001',JSON.stringify(draft));
    await fixture.receive(webhook('نعم','confirm-original-booking'));
    const booking=sqlite.prepare('SELECT * FROM bookings').get();assert.equal(booking.total,55000);assert.equal(booking.sender,'80001');
    assert.equal(sqlite.prepare('SELECT count(*) n FROM drafts').get().n,0);
    assert(fixture.meta.state.sends.some(m=>m.text.includes('تم تسجيل حجزك')));
  });
  await t.test('a cancelled AI job cannot overwrite the human-owned order draft',async()=>{
    sqlite.prepare('UPDATE stores SET ai_enabled=1 WHERE id=1').run();sqlite.exec("INSERT INTO items(id,store_id,kind,title,price) VALUES(11,1,'product','قميص','25000')");
    const original=JSON.stringify({items:[],address:'',phone:'',cur:11,stage:'collect',ask:'i'});
    sqlite.prepare('INSERT INTO drafts(store_id,sender,data) VALUES(1,?,?)').run('80001',original);
    fixture.meta.state.aiReply=JSON.stringify({intent:'order',items:[{n:1,qty:2}],say:'حاضر'});
    let release;fixture.meta.state.holdAI=new Promise(r=>release=r);
    await fixture.receive(webhook('أريد قميصين والتوصيل بغداد المنصور','draft-race'),{settle:false});
    await until(()=>fixture.meta.state.aiCalls===1);
    try{assert.equal((await takeover()).status,200);}finally{release();await fixture.settle();}
    assert.equal(sqlite.prepare('SELECT data FROM drafts').get().data,original);
    assert.equal(fixture.meta.state.sends.length,0);
  });
  await t.test('takeover during cancellation classification prevents a stale booking mutation',async()=>{
    sqlite.prepare('UPDATE stores SET ai_enabled=1 WHERE id=1').run();
    sqlite.exec("INSERT INTO bookings(id,store_id,mid,sender,items,status) VALUES(1,1,'prior-booking','80001','[]','new')");
    fixture.meta.state.aiReply='YES:1';let release;fixture.meta.state.holdAI=new Promise(r=>release=r);
    await fixture.receive(webhook('ممكن تلغي حجزي؟','cancel-race'),{settle:false});await until(()=>fixture.meta.state.aiCalls===1);
    try{assert.equal((await takeover()).status,200);}finally{release();await fixture.settle();}
    assert.equal(sqlite.prepare('SELECT status FROM bookings WHERE id=1').get().status,'new');assert.equal(fixture.meta.state.sends.length,0);
  });
  await t.test('disabled feature preserves existing APIs and exposes a setup state',async()=>{
    fixture.env.SMART_INBOX_ENABLED='false';
    assert.equal((await fixture.request('/api/me')).status,200);assert.equal((await fixture.request('/api/messages')).status,200);
    assert.equal((await api('summary')).body.code,'INBOX_DISABLED');
  });
});
