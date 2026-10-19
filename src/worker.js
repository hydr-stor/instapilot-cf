// InstaPilot AI — Cloudflare Workers + D1
let E,ready=false;
const T8=new TextEncoder(),D8=new TextDecoder();
const J=(o,s=200,h={})=>new Response(typeof o=='string'?o:JSON.stringify(o),{status:s,headers:{'content-type':'application/json; charset=utf-8','x-content-type-options':'nosniff',...h}});
const all=(s,...a)=>E.DB.prepare(s).bind(...a).all().then(r=>r.results);
const one=(s,...a)=>E.DB.prepare(s).bind(...a).first();
const run=(s,...a)=>E.DB.prepare(s).bind(...a).run();
const b2h=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
const h2b=h=>Uint8Array.from(h.match(/../g).map(x=>parseInt(x,16)));
const rhex=n=>b2h(crypto.getRandomValues(new Uint8Array(n)));
const rcode=()=>String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,'0');
const same=(a,b)=>{a=String(a);b=String(b);if(a.length!=b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d==0};
const sha=async s=>b2h(await crypto.subtle.digest('SHA-256',T8.encode(s)));
const hmac=async(k,raw)=>{const key=await crypto.subtle.importKey('raw',T8.encode(k),{name:'HMAC',hash:'SHA-256'},false,['sign']);return b2h(await crypto.subtle.sign('HMAC',key,raw))};
const pbk=async(pw,salt,it)=>{const k=await crypto.subtle.importKey('raw',T8.encode(pw),'PBKDF2',false,['deriveBits']);return b2h(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:h2b(salt),iterations:it},k,256))};
const hashPw=async(pw,salt)=>{const it=+E.PBKDF2_ITER||100000;return it+':'+await pbk(pw,salt,it)};
const checkPw=async(pw,salt,st)=>{const[i,h]=String(st).split(':');return same(await pbk(pw,salt,+i),h)};
const aesKey=async()=>crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',T8.encode(E.ENC_KEY)),'AES-GCM',false,['encrypt','decrypt']);
const enc=async t=>{const iv=crypto.getRandomValues(new Uint8Array(12)),c=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await aesKey(),T8.encode(t))),o=new Uint8Array(12+c.length);o.set(iv);o.set(c,12);return btoa(String.fromCharCode(...o))};
const dec=async s=>{const b=Uint8Array.from(atob(s),x=>x.charCodeAt(0));return D8.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:b.slice(0,12)},await aesKey(),b.slice(12)))};
const tf=(u,o={},ms=8000)=>fetch(u,{...o,signal:AbortSignal.timeout(ms)});
const DELIVERY=5000;
const arD=s=>String(s??'').replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
const parsePrice=s=>{const t=arD(s).replace(/[,٬،]/g,''),m=t.match(/\d+(\.\d+)?/);if(!m)return 0;let n=Math.round(+m[0]);if(n>0&&n<1000&&/[أا]لف/.test(t))n*=1000;return n};
const fmt=n=>Number(n||0).toLocaleString('en-US');
const turns=(h,t)=>{const o=[];for(const m of[...(h||[]),{role:'user',content:t}]){const c=String(m.content||'').trim();if(!c)continue;if(o.length&&o[o.length-1].role==m.role)o[o.length-1].content+='\n'+c;else o.push({role:m.role,content:c})}while(o.length&&o[0].role!='user')o.shift();return o};
const hist=async(sid,sender,mid)=>(await all(`select text,reply from messages where store_id=? and sender=? and id<(select id from messages where mid=?) and created>=datetime('now','-1 day') order by id desc limit 8`,sid,sender,mid)).reverse().flatMap(r=>[{role:'user',content:r.text},...(r.reply?[{role:'assistant',content:r.reply}]:[])]);
const bkParse=a=>{const i=a.indexOf('BOOKING:');if(i<0)return null;const s=a.indexOf('{',i);if(s<0)return{bad:1};let d=0;for(let k=s;k<a.length;k++){const c=a[k];if(c=='{')d++;else if(c=='}'&&--d==0){try{return{j:JSON.parse(a.slice(s,k+1))}}catch{return{bad:1}}}}return{bad:1}};
async function mkBooking(store,sender,mid,j){const its=await all("select * from items where store_id=? and kind='product'",store.id),M=new Map();
for(const x of Array.isArray(j.items)?j.items:[]){const it=its.find(i=>i.id==x?.id)||its.find(i=>x?.name&&i.title.includes(x.name)),q=Math.floor(+arD(x?.qty));if(!it||!(q>0)||q>999)continue;const l=M.get(it.id)||{id:it.id,name:it.title,qty:0,price:parsePrice(it.price)};l.qty+=q;M.set(it.id,l)}
const lines=[...M.values()],addr=String(j.address||'').trim().slice(0,300),phone=arD(j.phone).replace(/[^\d+]/g,'');
if(!lines.length||!addr||phone.replace(/\D/g,'').length<9)return null;
const sub=lines.reduce((t,l)=>t+l.price*l.qty,0),total=sub+DELIVERY;
await run('insert or ignore into bookings(store_id,mid,sender,address,phone,items,subtotal,delivery,total) values(?,?,?,?,?,?,?,?,?)',store.id,mid,sender,addr,phone,JSON.stringify(lines),sub,DELIVERY,total);
return{lines,addr,phone,total,noprice:lines.some(l=>!l.price)}}
const B=s=>T8.encode(s).length;
const clip=(s,n=950)=>{s=String(s);if(B(s)<=n)return s;let o='';for(const ch of s){if(B(o+ch)>n-3)break;o+=ch}return o+'...'};
const invoice=k=>{const head='تم تسجيل حجزك ✅\n',tail=`\nالتوصيل: ${fmt(DELIVERY)} د.ع\n`+(k.noprice?'المجموع الكلي: يتأكد من صاحب المتجر':`المجموع الكلي: ${fmt(k.total)} د.ع`)+`\nالعنوان: ${k.addr}\nالهاتف: ${k.phone}\nراح يتواصل وياك صاحب المتجر لتأكيد الحجز 🌷`,pr=l=>l.price?`${fmt(l.price)} د.ع`:'غير محدد',
full=head+k.lines.map(l=>`• ${l.name} × ${l.qty} (سعر القطعة ${pr(l)})`).join('\n')+tail;if(B(full)<=950)return full;
const mid=head+k.lines.map(l=>`• ${l.name} × ${l.qty} (${pr(l)})`).join('\n')+tail;if(B(mid)<=950)return mid;
return clip(head+`عدد القطع: ${k.lines.reduce((t,l)=>t+l.qty,0)}`+tail)};
async function igSend(store,to,text){const r=await tf('https://graph.instagram.com/v21.0/me/messages',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+await dec(store.ig_token)},body:JSON.stringify({recipient:{id:to},message:{text:clip(text)}})});if(!r.ok)throw new Error('Send failed: '+(await r.text()).slice(0,300))}
const SCHEMA=[
`create table if not exists users(id integer primary key,email text unique,hash text,salt text,role text default 'owner',plan text default 'free',created text default current_timestamp)`,
`create table if not exists sessions(token text primary key,user_id integer,created integer)`,
`create table if not exists stores(id integer primary key,user_id integer unique,name text,description text default '',hours text default '',delivery text default '',tone text default 'ودود ومختصر باللهجة العراقية',ai_enabled integer default 0,ig_user_id text,ig_token text)`,
`create table if not exists items(id integer primary key,store_id integer,kind text,title text,price text default '',body text default '')`,
`create table if not exists messages(id integer primary key,store_id integer,mid text unique,sender text,text text,reply text,status text,error text,created text default current_timestamp)`,
`create table if not exists plans(id text primary key,name text,monthly_limit integer,price text)`,
`create table if not exists pending(email text primary key,hash text,salt text,store_name text,code_hash text,expires integer,attempts integer,sent_at integer)`,
`create table if not exists resets(email text primary key,code_hash text,salt text,expires integer,attempts integer,sent_at integer)`,
`create table if not exists meta(k text primary key,v text)`,
`create table if not exists rl(k text,t integer)`,
`create table if not exists bookings(id integer primary key,store_id integer,mid text unique,sender text,address text,phone text,items text,subtotal integer,delivery integer,total integer,status text default 'new',notified integer default 0,created text default current_timestamp)`,
`create index if not exists idx_bk_store on bookings(store_id,id)`,
`create index if not exists idx_msg_store on messages(store_id,id)`,
`create index if not exists idx_items_store on items(store_id)`,
`create index if not exists idx_rl on rl(k,t)`,
`create index if not exists idx_msg_status on messages(status,created)`];
async function init(){if(ready)return;await E.DB.batch(SCHEMA.map(s=>E.DB.prepare(s)));
if(!(await one("select count(*) n from pragma_table_info('bookings') where name='notified'")).n)await run('alter table bookings add column notified integer default 0').catch(()=>{});
await E.DB.batch([`insert or ignore into meta values('created',datetime('now'))`,`insert or ignore into plans values('free','مجاني',50,'0')`,`insert or ignore into plans values('basic','أساسي',500,'15000 د.ع')`,`insert or ignore into plans values('pro','احترافي',3000,'40000 د.ع')`].map(s=>E.DB.prepare(s)));ready=true}
const limited=async(k,n,ms)=>{const now=Date.now();await run('delete from rl where t<?',now-3600000);await run('insert into rl values(?,?)',k,now);return(await one('select count(*) n from rl where k=? and t>?',k,now-ms)).n>n};
const used=async sid=>(await one(`select count(*) n from messages where store_id=? and reply is not null and status in('sent','simulated') and created>=date('now','start of month')`,sid)).n;
async function mail(to,subject,html){if(!E.BREVO_API_KEY||!E.MAIL_FROM)throw[503,'إرسال البريد غير مُعدّ بعد'];
const r=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'content-type':'application/json','api-key':E.BREVO_API_KEY,accept:'application/json'},body:JSON.stringify({sender:{name:'InstaPilot AI',email:E.MAIL_FROM},to:[{email:to}],subject,htmlContent:html})});
if(!r.ok){console.error('mail fail',r.status,(await r.text()).slice(0,200));throw[502,'تعذّر إرسال الرمز، حاول لاحقاً']}}
async function aiOnce(store,text,h){const items=await all('select * from items where store_id=?',store.id);
const info=`المتجر: ${store.name}\n${store.description}\nالدوام: ${store.hours}\nالتوصيل: ${store.delivery}\n`+items.map(i=>i.kind=='product'?`منتج [#${i.id}]: ${i.title} | السعر: ${i.price} | ${i.body}`:`سؤال: ${i.title} | جواب: ${i.body}`).join('\n');
const sys=`أنت مساعد ودود لمتجر على إنستغرام. افهم اللهجة العراقية وأجب بنفس الأسلوب (${store.tone}). أجب بحرية وباختصار على التحية والشكر والأسئلة العامة والمحادثة العادية. أما المعلومات الخاصة بالمتجر (الأسعار، المنتجات، التوفر، التوصيل، الخصومات، الضمان، المواعيد) فاعتمد فقط على المعلومات أدناه ولا تخترع شيئاً منها أبداً. إذا سُئلت عن شيء خاص بالمتجر وليس في المعلومات، أجب بكلمة ESCALATE فقط.\n\nالحجز: إذا طلب الزبون يحجز أو يطلب منتجات، اجمع منه 3 أشياء: المنتجات مع عدد كل منتج، والعنوان، ورقم هاتفه. ارجع لمحادثتكم السابقة لتعرف شنو ذكر، واسأله عن الناقص فقط وباختصار. لا تحسب مجاميع ولا تذكر سعر التوصيل ولا المجموع، النظام يرسل الفاتورة بنفسه. لما تكتمل الثلاثة وهو يريد الحجز بوضوح، يكون ردّك كله سطراً واحداً فقط بهذا الشكل بالضبط: BOOKING:{"items":[{"id":1,"qty":2}],"address":"العنوان","phone":"07701234567"} حيث id هو رقم المنتج من القائمة (الرقم بعد #) ولا تستخدم غير منتجات القائمة. لا تكتب كلمة BOOKING بأي حالة ثانية.\n\n${info}`;
if(E.AI_PROVIDER==='cf'){const r=await E.AI.run(E.AI_MODEL,{messages:[{role:'system',content:sys},...turns(h,text)],max_tokens:400});return String(r.response||r.choices?.[0]?.message?.content||'ESCALATE').trim()}
if(E.GEMINI_API_KEY){const r=await tf(`https://generativelanguage.googleapis.com/v1beta/models/${E.AI_MODEL||'gemini-3.8-flash'}:generateContent`,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':E.GEMINI_API_KEY},body:JSON.stringify({systemInstruction:{parts:[{text:sys}]},contents:turns(h,text).map(m=>({role:m.role=='assistant'?'model':'user',parts:[{text:m.content}]}))})});
const j=await r.json();if(!r.ok)throw new Error(j.error?.message||'AI error');return(j.candidates?.[0]?.content?.parts?.[0]?.text||'ESCALATE').trim()}
const r=await tf('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':E.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:E.AI_MODEL||'claude-sonnet-4-6',max_tokens:400,system:sys,messages:turns(h,text)})});
const j=await r.json();if(!r.ok)throw new Error(j.error?.message||'AI error');return j.content[0].text.trim()}
async function ai(store,text,h){for(let i=0;;i++){try{return await aiOnce(store,text,h)}catch(e){if(i>=2||!/demand|overload|unavailable|503|timeout|aborted/i.test(e.message))throw e;await new Promise(r=>setTimeout(r,1500*(i+1)))}}}
async function handle(store,sender,mid,text){
const upd=(s,e)=>run('update messages set status=?,error=? where mid=?',s,e??null,mid);
try{const c=await run("update messages set status='processing' where mid=? and status='pending'",mid);if(c.meta.changes!==1)return;
if(!store.ai_enabled)return await upd('ai_off');
if(E.LIVE!=='true'||!(E.AI||E.GEMINI_API_KEY||E.ANTHROPIC_API_KEY)||!store.ig_token)return await upd('not_configured');
const plan=await one('select * from plans where id=(select plan from users where id=?)',store.user_id);
if(await used(store.id)>=plan.monthly_limit)return await upd('limit_reached');
let a=await ai(store,text,await hist(store.id,sender,mid)),st='sent';if(a.includes('BOOKING:')){const b=bkParse(a),k=b?.j&&await mkBooking(store,sender,mid,b.j);a=k?invoice(k):'عفواً ما كدرت أسجل الحجز 🙏 تكدر تكتبلي المنتجات وعددها والعنوان ورقم هاتفك؟'}else if(a.includes('ESCALATE')){a='تمام 🌷 راح أحوّل سؤالك لصاحب المتجر ويرد عليك بأقرب وقت.';st='escalated'}
const r=await tf('https://graph.instagram.com/v21.0/me/messages',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+await dec(store.ig_token)},body:JSON.stringify({recipient:{id:sender},message:{text:clip(a)}})});
if(!r.ok)throw new Error('Send failed: '+(await r.text()).slice(0,300));
await run('update messages set reply=?,status=?,error=null where mid=?',a,st,mid)}catch(e){try{await upd('error',String(e?.message||e).slice(0,500))}catch(x){console.error(x)}}}
async function processWebhook(b){for(const e of b.entry||[])for(const m of e.messaging||[]){try{if(!m.message?.text||m.message.is_echo)continue;
const st=await one('select * from stores where ig_user_id=?',String(e.id));if(!st)continue;
const ins=await run('insert or ignore into messages(store_id,mid,sender,text,status) values(?,?,?,?,?)',st.id,m.message.mid,m.sender.id,m.message.text,'pending');
if(ins.meta.changes)await handle(st,m.sender.id,m.message.mid,m.message.text)}catch(err){console.error('webhook',err)}}}
async function sweep(){await run("update messages set status='error',error='تعذّرت المعالجة (انتهت المهلة)' where status='processing' and created<=datetime('now','-5 minutes')");
await run("update messages set status='error',error='انتهت مهلة المعالجة' where status='pending' and created<datetime('now','-30 minutes')");
const rows=await all("select mid,sender,text,store_id from messages where status='pending' and created<=datetime('now','-90 seconds') limit 5");
for(const r of rows){const st=await one('select * from stores where id=?',r.store_id);if(st)await handle(st,r.sender,r.mid,r.text)}}
const R={};const route=(m,p,f,o={})=>{R[m+' '+p]={f,...o}};
const login=async(c,id)=>{const t=rhex(32);await run('insert into sessions values(?,?,?)',t,id,Date.now());c.cookie=`sid=${t}; HttpOnly; SameSite=Lax; Path=/`+(c.body.remember===false?'':'; Max-Age=2592000')+(E.PUBLIC_URL?.startsWith('https')?'; Secure':'');return{ok:1,token:t}};
const okEmail=e=>/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
route('POST','/api/register/start',async c=>{const{email,password,store_name}=c.body,em=String(email||'').trim().toLowerCase();
if(!okEmail(em)||!password||String(password).length<8||!store_name)throw[400,'البيانات ناقصة (كلمة المرور 8 أحرف على الأقل)'];
if(await limited('rs'+c.ip,6,3600000))throw[429,'محاولات كثيرة، حاول بعد ساعة'];
if(await one('select 1 x from users where email=?',em))throw[400,'البريد مستخدم مسبقاً'];
const old=await one('select sent_at from pending where email=?',em);if(old&&Date.now()-old.sent_at<60000)throw[429,'انتظر دقيقة قبل طلب رمز جديد'];
const code=rcode(),salt=rhex(16);
await mail(em,'رمز التحقق - InstaPilot AI',`<div dir="rtl" style="font-family:sans-serif"><h2>رمز التحقق</h2><p style="font-size:34px;letter-spacing:8px"><b>${code}</b></p><p>صالح لمدة 10 دقائق. إذا لم تطلبه فتجاهل الرسالة.</p></div>`);
await run('insert or replace into pending(email,hash,salt,store_name,code_hash,expires,attempts,sent_at) values(?,?,?,?,?,?,0,?)',em,await hashPw(String(password),salt),salt,String(store_name).slice(0,80),await sha(salt+code),Date.now()+600000,Date.now());return{ok:1}},{pub:1});
route('POST','/api/register/verify',async c=>{const em=String(c.body.email||'').trim().toLowerCase(),p=await one('select * from pending where email=?',em);
if(!p||p.expires<Date.now())throw[400,'انتهت صلاحية الرمز، اطلب رمزاً جديداً'];
if(p.attempts>=5){await run('delete from pending where email=?',em);throw[429,'محاولات خاطئة كثيرة، اطلب رمزاً جديداً']}
if(!same(await sha(p.salt+String(c.body.code||'').trim()),p.code_hash)){await run('update pending set attempts=attempts+1 where email=?',em);throw[400,'الرمز غير صحيح']}
if(await one('select 1 x from users where email=?',em))throw[400,'البريد مستخدم مسبقاً'];
const role=E.ADMIN_EMAIL&&em==E.ADMIN_EMAIL.toLowerCase()?'admin':'owner';
const u=await run('insert into users(email,hash,salt,role) values(?,?,?,?)',em,p.hash,p.salt,role);
await run('insert into stores(user_id,name) values(?,?)',u.meta.last_row_id,p.store_name);await run('delete from pending where email=?',em);return login(c,u.meta.last_row_id)},{pub:1});
route('POST','/api/reset/start',async c=>{const em=String(c.body.email||'').trim().toLowerCase();if(await limited('rr'+c.ip,6,3600000))throw[429,'محاولات كثيرة، حاول بعد ساعة'];
const u=await one('select id from users where email=?',em),old=await one('select sent_at from resets where email=?',em);
if(u&&!(old&&Date.now()-old.sent_at<60000)){const code=rcode(),salt=rhex(16);
await mail(em,'استعادة كلمة المرور - InstaPilot AI',`<div dir="rtl" style="font-family:sans-serif"><h2>رمز استعادة كلمة المرور</h2><p style="font-size:34px;letter-spacing:8px"><b>${code}</b></p><p>صالح لمدة 10 دقائق. إذا لم تطلبه فتجاهل الرسالة.</p></div>`);
await run('insert or replace into resets(email,code_hash,salt,expires,attempts,sent_at) values(?,?,?,?,0,?)',em,await sha(salt+code),salt,Date.now()+600000,Date.now())}return{ok:1}},{pub:1});
route('POST','/api/reset/verify',async c=>{const em=String(c.body.email||'').trim().toLowerCase(),r=await one('select * from resets where email=?',em),pw=String(c.body.password||'');
if(pw.length<8)throw[400,'كلمة المرور 8 أحرف على الأقل'];if(!r||r.expires<Date.now())throw[400,'انتهت صلاحية الرمز، اطلب رمزاً جديداً'];
if(r.attempts>=5){await run('delete from resets where email=?',em);throw[429,'محاولات خاطئة كثيرة، اطلب رمزاً جديداً']}
if(!same(await sha(r.salt+String(c.body.code||'').trim()),r.code_hash)){await run('update resets set attempts=attempts+1 where email=?',em);throw[400,'الرمز غير صحيح']}
const u=await one('select id from users where email=?',em);if(!u)throw[400,'الرمز غير صحيح'];const salt=rhex(16);
await run('update users set hash=?,salt=? where id=?',await hashPw(pw,salt),salt,u.id);await run('delete from sessions where user_id=?',u.id);await run('delete from resets where email=?',em);return{ok:1}},{pub:1});
route('GET','/api/health',async()=>({users:(await one('select count(*) n from users')).n,db_created:(await one("select v from meta where k='created'")).v,runtime:'cloudflare-d1'}),{pub:1});
route('POST','/api/login',async c=>{if(await limited('lg'+c.ip,10,600000))throw[429,'محاولات كثيرة، حاول بعد 10 دقائق'];const u=await one('select * from users where email=?',String(c.body.email||'').trim().toLowerCase());
if(!u||!(await checkPw(String(c.body.password||''),u.salt,u.hash)))throw[401,'البريد أو كلمة المرور غير صحيحة'];return login(c,u.id)},{pub:1});
route('POST','/api/logout',async c=>{await run('delete from sessions where token=?',c.tok);c.cookie='sid=; Max-Age=0; Path=/';return{ok:1}});
route('GET','/api/me',async c=>({email:c.user.email,role:c.user.role,plan:await one('select * from plans where id=?',c.user.plan),used:await used(c.store.id),store:{...c.store,ig_token:undefined,ig_connected:!!c.store.ig_token},live:E.LIVE==='true'}));
route('PUT','/api/store',async c=>{const b=c.body;await run('update stores set name=?,description=?,hours=?,delivery=?,tone=?,ai_enabled=? where id=?',b.name||c.store.name,b.description??'',b.hours??'',b.delivery??'',b.tone||c.store.tone,b.ai_enabled?1:0,c.store.id);return{ok:1}});
route('GET','/api/items',c=>all('select * from items where store_id=?',c.store.id));
route('POST','/api/items',async c=>{const b=c.body;if(!['product','faq'].includes(b.kind)||!b.title)throw[400,'بيانات غير صحيحة'];await run('insert into items(store_id,kind,title,price,body) values(?,?,?,?,?)',c.store.id,b.kind,b.title,b.price||'',b.body||'');return{ok:1}});
route('POST','/api/items/delete',async c=>{await run('delete from items where id=? and store_id=?',c.body.id,c.store.id);return{ok:1}});
route('GET','/api/messages',c=>all('select * from messages where store_id=? order by id desc limit 100',c.store.id));
route('GET','/api/bookings',c=>all('select * from bookings where store_id=? order by id desc limit 200',c.store.id));
route('POST','/api/bookings/status',async c=>{const st=c.body.status;if(!['new','confirmed','delivered','cancelled'].includes(st))throw[400,'حالة غير صحيحة'];
const b=await one('select * from bookings where id=? and store_id=?',c.body.id,c.store.id);if(!b)throw[404,'الحجز غير موجود'];
await run('update bookings set status=? where id=?',st,b.id);const out={ok:1};
if(st=='confirmed'&&b.status!='confirmed'&&!b.notified){if(!c.store.ig_token)out.notify='no_ig';else try{await igSend(c.store,b.sender,'تم الحجز من صاحب المتجر ✅');await run('update bookings set notified=1 where id=?',b.id);out.notify='sent'}catch(e){console.error('notify',e);out.notify='failed'}}
return out});
route('POST','/api/bookings/delete',async c=>{await run('delete from bookings where id=? and store_id=?',c.body.id,c.store.id);return{ok:1}});
route('GET','/api/instagram/connect',c=>{if(!E.IG_APP_ID||!E.IG_APP_SECRET)return{configured:false,msg:'لم تُضبط بيانات تطبيق Meta بعد (IG_APP_ID / IG_APP_SECRET). الربط غير مفعّل.'};
return{configured:true,url:`https://www.instagram.com/oauth/authorize?client_id=${E.IG_APP_ID}&redirect_uri=${encodeURIComponent(E.PUBLIC_URL+'/api/instagram/callback')}&response_type=code&scope=instagram_business_basic,instagram_business_manage_messages&state=${c.tok.slice(0,16)}`}});
route('GET','/api/instagram/callback',async c=>{const q=c.q;if(!q.get('code')||q.get('state')!==c.tok.slice(0,16))throw[400,'طلب ربط غير صالح'];
const t=await(await fetch('https://api.instagram.com/oauth/access_token',{method:'POST',body:new URLSearchParams({client_id:E.IG_APP_ID,client_secret:E.IG_APP_SECRET,grant_type:'authorization_code',redirect_uri:E.PUBLIC_URL+'/api/instagram/callback',code:q.get('code')})})).json();
if(!t.access_token)throw[400,'فشل الربط مع إنستغرام'];
const l=await(await fetch(`https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${E.IG_APP_SECRET}&access_token=${t.access_token}`)).json();
const tok=l.access_token||t.access_token;
const me=await(await fetch('https://graph.instagram.com/v21.0/me?fields=user_id,username',{headers:{authorization:'Bearer '+tok}})).json();
await run('update stores set ig_user_id=?,ig_token=? where id=?',String(me.user_id||t.user_id),await enc(tok),c.store.id);
await fetch('https://graph.instagram.com/v21.0/me/subscribed_apps?subscribed_fields=messages',{method:'POST',headers:{authorization:'Bearer '+tok}}).catch(()=>{});
return{redirect:'/#/ig'}});
route('GET','/api/admin/overview',async c=>({users:await all('select u.id,u.email,u.plan,u.created,s.name store,(select count(*) from messages m where m.store_id=s.id) msgs from users u join stores s on s.user_id=u.id order by u.id desc'),plans:await all('select * from plans'),errors:(await one("select count(*) n from messages where status='error'")).n}),{admin:1});
route('POST','/api/admin/plan',async c=>{await run('update plans set monthly_limit=?,price=? where id=?',+c.body.monthly_limit,c.body.price,c.body.id);return{ok:1}},{admin:1});
route('POST','/api/admin/user-plan',async c=>{await run('update users set plan=? where id=?',c.body.plan,c.body.id);return{ok:1}},{admin:1});
route('GET','/api/admin/export',async c=>({exported:new Date().toISOString(),users:await all('select id,email,role,plan,created from users'),stores:await all('select id,user_id,name,description,hours,delivery,tone,ai_enabled,ig_user_id from stores'),items:await all('select * from items'),messages:await all('select * from messages'),bookings:await all('select * from bookings')}),{admin:1});
const page=(P)=>{const em=String(E.ADMIN_EMAIL||'').replace(/[<>&"]/g,'');return new Response(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui;max-width:640px;margin:20px auto;padding:0 16px;line-height:1.9"><h1>${P?'سياسة الخصوصية':'حذف البيانات'}</h1>`+(P?`<p>تستخدم InstaPilot AI صلاحيات إنستغرام الرسمية لقراءة رسائل حساب المتجر المربوط والرد عليها نيابةً عن صاحب المتجر. نحفظ نص الرسائل والردود وسجل الأخطاء لعرضها لصاحب المتجر، ونخزّن رمز الوصول مشفراً. لا نبيع البيانات ولا نطلب كلمة مرور إنستغرام. قد تُرسل نصوص الرسائل إلى مزوّد الذكاء الاصطناعي لتوليد الرد. للاستفسار: ${em}</p>`:`<p>لحذف بياناتك راسلنا على ${em} من بريد حسابك مع ذكر اسم المتجر، وسنحذف الحساب والمحادثات ورمز الوصول خلال 30 يوماً. ويمكنك أيضاً إزالة التطبيق من إعدادات إنستغرام (التطبيقات والمواقع).</p>`),{headers:{'content-type':'text/html; charset=utf-8'}})};
export default{async scheduled(ev,env,ctx){E=env;ctx.waitUntil((async()=>{try{if(E.ENC_KEY){await init();await sweep()}}catch(e){console.error('cron',e)}})())},
async fetch(req,env,ctx){E=env;const url=new URL(req.url),p=url.pathname;
try{if(!E.ENC_KEY)return J({error:'ENC_KEY غير مضبوط'},500);await init();
if(p=='/webhook/instagram'){
if(req.method=='GET'){const t=url.searchParams.get('hub.verify_token');return t&&t===E.IG_VERIFY_TOKEN?new Response(url.searchParams.get('hub.challenge')):new Response('forbidden',{status:403})}
const raw=await req.arrayBuffer(),secrets=[E.IG_APP_SECRET,E.META_APP_SECRET].filter(Boolean);if(!secrets.length)return J({error:'webhook not configured'},503);
const sig=req.headers.get('x-hub-signature-256')||'';let ok=false;for(const k of secrets)if(same(sig,'sha256='+await hmac(k,raw)))ok=true;
if(!ok)return J({error:'bad signature'},401);ctx.waitUntil(processWebhook(JSON.parse(D8.decode(raw))));return J({ok:1})}
if(p=='/privacy'||p=='/data-deletion')return page(p=='/privacy');
if(p.startsWith('/api/')){const r=R[req.method+' '+p];if(!r)return J({error:'غير موجود'},404);
let body={};if(req.method!='GET'){const t=await req.text();if(t)try{body=JSON.parse(t)}catch{throw[400,'طلب غير صالح']}}
const c={ip:(req.headers.get('cf-connecting-ip')||req.headers.get('x-forwarded-for')||'').split(',')[0].trim(),q:url.searchParams,body};
c.tok=((req.headers.get('cookie')||'').match(/sid=([a-f0-9]+)/)||[])[1]||(req.headers.get('authorization')||'').replace('Bearer ','').trim()||undefined;
if(!r.pub){const s=c.tok&&await one('select user_id from sessions where token=? and created>?',c.tok,Date.now()-2592000000);if(!s)return J({error:'سجّل الدخول أولاً'},401);
c.user=await one('select * from users where id=?',s.user_id);c.store=await one('select * from stores where user_id=?',c.user.id);if(r.admin&&c.user.role!=='admin')return J({error:'ممنوع'},403)}
const out=await r.f(c);if(out?.redirect)return new Response(null,{status:302,headers:{location:out.redirect}});return J(out,200,c.cookie?{'set-cookie':c.cookie}:{})}
return E.ASSETS.fetch(req)}
catch(e){if(Array.isArray(e))return J({error:e[1]},e[0]);console.error(e);return J({error:'خطأ في الخادم'},500)}}};
