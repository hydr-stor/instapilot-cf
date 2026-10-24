const UNKNOWN_REPLY = 'مافهمت عليك اعد صياغ الجملة وخليني افهمك زين';
const HANDOFF_ACK = 'تم تحويل طلبك للمتابعة ويا صاحب المتجر. راح يرد عليك من هنا.';
const HANDOFF_OFFER = 'إذا تحب تحچي ويا صاحب المتجر، كلي وأحوّل طلبك للمتابعة.';
const DAY = 86400000;
const id = () => crypto.randomUUID();
const bytes = text => new TextEncoder().encode(text).length;
const norm = text => String(text || '').normalize('NFKC').replace(/[\u064B-\u065F\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/چ/g, 'ج').replace(/[ىی]/g, 'ي').replace(/ة/g, 'ه').replace(/[گک]/g, 'ك').replace(/\s+/g, ' ').trim().toLowerCase();
function wantsHuman(text, offered = false) {
  const s = norm(text);
  if (/(?:لا|ما)\s*(?:اريد\s*)?(?:تحولني|اتحول|احجي\s*(?:ويا|مع)\s*(?:صاحب|المسؤول)|اكلم\s*(?:صاحب|المسؤول))/.test(s)) return false;
  if (/(?:ما|مو|لا)\s*اريد\s*(?:الرد من\s*)?(?:بوت|روبوت|ذكاء|رد الي)/.test(s)) return true;
  const person = '(?:صاحب\\s*(?:البيج|المحل|المتجر|الصفحه)|المس[ؤو]ول|موظف\\s*(?:حقيقي|بشري)?|انسان\\s*حقيقي|بشري|الادمن)';
  if (new RegExp('(?:حولني|خليني|اتواصل|تواصل|احجي|اكلم|اتكلم|كلمني|يحجي|كلم).{0,65}' + person).test(s)) return true;
  if (new RegExp('^(?:اريد|ممكن)\\s+'+person+'[.!؟?]*$').test(s)) return true;
  if (new RegExp(person + '.{0,35}(?:يرد|يحجي|يكلمني|يتواصل)').test(s)) return true;
  return offered && /^(اي|ايوه|نعم|ايوا|تمام|موافق|حولني|اريد)(?:\s|[.!؟?]|$)/.test(s) && s.length <= 30;
}
function safeMediaURL(value) {
  try {
    const u = new URL(value);
    const host = u.hostname;
    if (u.protocol !== 'https:' || u.username || u.password || u.port || [...u.searchParams.keys()].some(k => /^(access_token|client_secret|code|state)$/i.test(k))) return null;
    return host.endsWith('.cdninstagram.com') || host.endsWith('.fbcdn.net') || host === 'lookaside.fbsbx.com' ? u.href : null;
  } catch { return null; }
}
function attachmentsOf(message) {
  return (Array.isArray(message?.attachments) ? message.attachments : []).slice(0,10).map(a => ({
    type: ['image','video','audio','file','share','story_mention'].includes(a?.type) ? a.type : 'file',
    url: safeMediaURL(a?.payload?.url)
  }));
}
class InboxError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
class SmartInbox {
  constructor(env, options = {}) {
    this.env = env; this.db = env.DB.withSession?.('first-primary') || env.DB;
    this.decrypt = options.decrypt;
    this.clock = options.clock || Date.now;
    this.fetch = options.fetch || ((...args) => fetch(...args));
  }
  now() { return this.clock(); }
  stmt(sql, ...args) { return this.db.prepare(sql).bind(...args); }
  one(sql, ...args) { return this.stmt(sql,...args).first(); }
  rows(sql, ...args) { return this.stmt(sql,...args).all().then(r => r.results); }
  run(sql, ...args) { return this.stmt(sql,...args).run(); }
  batch(statements) { return this.db.batch(statements.map(([sql,...args]) => this.stmt(sql,...args))); }
  async ready() {
    if (this.env.SMART_INBOX_ENABLED !== 'true') throw new InboxError(503,'INBOX_DISABLED','صندوق الوارد الذكي غير مفعّل بعد. سجل المحادثات الحالي ما زال متاحاً.');
    try { await this.one('SELECT id FROM inbox_conversations LIMIT 1'); }
    catch { throw new InboxError(503,'INBOX_MIGRATION_REQUIRED','يلزم تجهيز قاعدة البيانات قبل تفعيل صندوق الوارد الذكي.'); }
  }
  async conversation(storeId, conversationId) {
    const n = Number(conversationId);
    if (!Number.isSafeInteger(n) || n < 1) throw new InboxError(404,'NOT_FOUND','المحادثة غير موجودة.');
    const c = await this.one('SELECT * FROM inbox_conversations WHERE id=? AND store_id=?',n,storeId);
    if (!c) throw new InboxError(404,'NOT_FOUND','المحادثة غير موجودة.');
    return c;
  }
  async store(storeId) {
    const s = await this.one('SELECT * FROM stores WHERE id=?',storeId);
    if (!s) throw new InboxError(404,'NOT_FOUND','المتجر غير موجود.');
    return s;
  }
  policy(c, store, humanAgent = false, automated = false) {
    const now = this.now(), t = c.last_customer_message_at;
    const base = { standard_until: t ? t + DAY : null, human_agent_until: t ? t + 7*DAY : null, human_agent_approved: this.env.IG_HUMAN_AGENT_APPROVED === 'true' };
    const fail = (code,reason) => ({...base,allowed:false,code,reason});
    if (this.env.LIVE !== 'true') return fail('LIVE_DISABLED','الإرسال الحقيقي متوقف في إعدادات المنصة.');
    if (!store.ig_token || !store.ig_user_id) return fail('INSTAGRAM_NOT_CONNECTED','اربط حساب إنستغرام أولاً.');
    if (store.ig_user_id !== c.instagram_account_id) return fail('ACCOUNT_CHANGED','هذه المحادثة تخص حساب إنستغرام سابقاً. لا يمكن إرسالها من الحساب الحالي.');
    if (!t || t > now || now-t >= 7*DAY) return fail('WINDOW_CLOSED','انتهت نافذة المراسلة أو لا توجد رسالة واردة موثّقة. يلزم أن يرسل الزبون رسالة جديدة.');
    if (now-t < DAY) return {...base,allowed:true,use_human_agent:false};
    if (automated) return fail('WINDOW_CLOSED','الردود الآلية مسموحة خلال 24 ساعة من آخر رسالة واردة فقط.');
    if (!base.human_agent_approved) return fail('WINDOW_CLOSED','انتهت نافذة 24 ساعة ولم تُفعّل صلاحية Human Agent المعتمدة.');
    if (!humanAgent) return fail('HUMAN_AGENT_REQUIRED','هذا الرد خارج 24 ساعة. أكّد أنه رد بشري للدعم باستخدام Human Agent.');
    return {...base,allowed:true,use_human_agent:true};
  }
  publicConversation(c, store) {
    const policy = this.policy(c,store,true);
    return {
      id:c.id,customer_id:c.customer_id,customer_name:c.customer_name,customer_username:c.customer_username,
      customer_avatar:safeMediaURL(c.customer_avatar),instagram_account_id:c.instagram_account_id,
      state:c.state,assigned_user_id:c.assigned_user_id,needs_attention:!!c.needs_attention,unread_count:c.unread_count,
      last_customer_message_at:c.last_customer_message_at,last_activity_at:c.last_activity_at,last_preview:c.last_preview,
      version:c.version,active_send:!!c.active_send_id,unrecognized_count:c.unrecognized_count,
      policy:{...policy,requires_human_agent:policy.allowed && policy.use_human_agent,can_send:policy.allowed && c.state==='HUMAN_ACTIVE' && !c.active_send_id}
    };
  }
  publicMessage(m) {
    return {id:/^(in|out|legacy):/.test(m.id)?m.id:'out:'+m.id,meta_message_id:m.meta_message_id || null,source_mid:m.source_mid || null,
      direction:m.direction || 'OUTBOUND',author_type:m.author_type,text:m.text || '',
      attachments:JSON.parse(m.attachments_json || '[]'),status:m.status,created_at:m.created_at,
      sent_at:m.sent_at || null,idempotency_key:m.idempotency_key || null,
      error:m.error_code ? {code:m.error_code,message:m.error_text,retriable:!!m.error_retriable} : null,
      inbound_id:m.inbound_id || null,retry_of:m.retry_of || null};
  }
  async summary(storeId) {
    const counts = await this.one(`SELECT count(*) total,
      coalesce(sum(state='HUMAN_ACTIVE' AND needs_attention=1),0) waiting,
      coalesce(sum(unread_count),0) unread FROM inbox_conversations WHERE store_id=?`,storeId);
    const events = await this.rows('SELECT id,title,body,url,created FROM notifs WHERE store_id=? AND inbox_event_id IS NOT NULL ORDER BY id DESC LIMIT 10',storeId);
    const subscription=await this.one('SELECT v FROM meta WHERE k=?','inbox-subscription:'+storeId);
    return {...counts,notifications:events,subscription:subscription?JSON.parse(subscription.v):null,enabled:true,server_time:this.now()};
  }
  async list(store, q) {
    const filter = q.get('filter') || 'all';
    const sorts = {newest:'last_activity_at DESC,id DESC',oldest:'last_activity_at ASC,id ASC',unread:'unread_count DESC,last_activity_at DESC,id DESC'};
    const sort = sorts[q.get('sort') || 'newest'];
    const filters = {all:'1=1',waiting:"state='HUMAN_ACTIVE' AND needs_attention=1",ai:"state='AI_ACTIVE'",human:"state='HUMAN_ACTIVE'",closed:"state='CLOSED'",unread:'unread_count>0'};
    if (!filters[filter] || !sort) throw new InboxError(400,'INVALID_FILTER','التصفية غير صالحة.');
    const search = String(q.get('q') || '').slice(0,100).replace(/[\\%_]/g,'\\$&');
    const offset = Number(q.get('offset') || 0);
    if (!Number.isSafeInteger(offset) || offset<0 || offset>100000) throw new InboxError(400,'INVALID_CURSOR','موضع القائمة غير صالح.');
    const rows = await this.rows(`SELECT * FROM inbox_conversations WHERE store_id=? AND (${filters[filter]})
      AND (coalesce(customer_name,'') LIKE ? ESCAPE '\\' OR coalesce(customer_username,'') LIKE ? ESCAPE '\\' OR customer_id LIKE ? ESCAPE '\\' OR last_preview LIKE ? ESCAPE '\\')
      ORDER BY ${sort} LIMIT 41 OFFSET ?`,store.id,...Array(4).fill('%'+search+'%'),offset);
    return {conversations:rows.slice(0,40).map(c=>this.publicConversation(c,store)),next_offset:rows.length>40 ? offset+40:null,...await this.summary(store.id)};
  }
  async thread(store, conversationId, cursor) {
    const c = await this.conversation(store.id,conversationId);
    let at = Number.MAX_SAFE_INTEGER, key = '\uffff';
    if (cursor) {
      const m = String(cursor).match(/^(\d{1,16})~((?:in|out|legacy):[\da-f-]{1,64})$/);
      if (!m || !Number.isSafeInteger(Number(m[1]))) throw new InboxError(400,'INVALID_CURSOR','موضع الرسائل غير صالح.');
      at=Number(m[1]);key=m[2];
    }
    const data = await this.rows(`SELECT * FROM (
      SELECT 'in:'||printf('%020d',m.id) id,m.id inbound_id,m.mid meta_message_id,NULL source_mid,'INBOUND' direction,'CUSTOMER' author_type,m.text,m.attachments_json,
        'RECEIVED' status,coalesce(m.received_at,unixepoch(m.created)*1000,0) created_at,NULL sent_at,NULL idempotency_key,NULL error_code,NULL error_text,0 error_retriable,NULL retry_of
        FROM messages m WHERE m.store_id=? AND m.conversation_id=? AND (coalesce(m.text,'')<>'' OR m.attachments_json IS NOT NULL)
      UNION ALL
      SELECT 'out:'||o.id,NULL,o.meta_message_id,o.source_mid,'OUTBOUND',o.author_type,o.text,o.attachments_json,o.status,o.created_at,o.sent_at,o.idempotency_key,o.error_code,o.error_text,o.error_retriable,o.retry_of
        FROM inbox_outbox o WHERE o.store_id=? AND o.conversation_id=?
      UNION ALL
      SELECT 'legacy:'||printf('%020d',m.id),NULL,NULL,m.mid,'OUTBOUND',CASE WHEN m.status='owner' THEN 'EXTERNAL' ELSE 'AI' END,m.reply,NULL,
        CASE WHEN m.status IN ('sent','owner','escalated') THEN 'SENT' ELSE 'FAILED' END,coalesce(m.received_at,unixepoch(m.created)*1000,0)+1,NULL,NULL,NULL,NULL,0,NULL
        FROM messages m WHERE m.store_id=? AND m.conversation_id=? AND coalesce(m.reply,'')<>''
        AND NOT EXISTS(SELECT 1 FROM inbox_outbox o WHERE o.store_id=m.store_id AND o.source_mid=m.mid)
      ) WHERE created_at<? OR (created_at=? AND id<?) ORDER BY created_at DESC,id DESC LIMIT 51`,
    store.id,c.id,store.id,c.id,store.id,c.id,at,at,key);
    const page=data.slice(0,50),last=page[page.length-1];
    const transfers=await this.rows('SELECT from_state,to_state,actor_user_id,reason,created_at FROM inbox_transfers WHERE store_id=? AND conversation_id=? ORDER BY created_at DESC LIMIT 20',store.id,c.id);
    return {conversation:this.publicConversation(c,store),messages:page.reverse().map(m=>this.publicMessage(m)),
      read_through_id:Math.max(0,...page.map(m=>m.inbound_id || 0)),next_cursor:data.length>50 ? last.created_at+'~'+last.id:null,transfers,server_time:this.now()};
  }
  async markRead(storeId, conversationId, through) {
    const c=await this.conversation(storeId,conversationId),n=Number(through);
    if (!Number.isSafeInteger(n) || n<0) throw new InboxError(400,'INVALID_READ','حد القراءة غير صالح.');
    if (n && !await this.one('SELECT id FROM messages WHERE id=? AND store_id=? AND conversation_id=?',n,storeId,c.id)) throw new InboxError(400,'INVALID_READ','الرسالة لا تنتمي إلى هذه المحادثة.');
    await this.run(`UPDATE inbox_conversations SET last_read_id=max(last_read_id,?),unread_count=(SELECT count(*) FROM messages m
      WHERE m.conversation_id=inbox_conversations.id AND m.id>max(inbox_conversations.last_read_id,?) AND (coalesce(m.text,'')<>'' OR m.attachments_json IS NOT NULL))
      WHERE id=? AND store_id=?`,n,n,c.id,storeId);
    return {ok:true};
  }
  async transition(store, user, body, action) {
    const c=await this.conversation(store.id,body.conversation_id);
    const requestKey=String(body.request_key || '');
    if (!/^[\w:-]{8,180}$/.test(requestKey)) throw new InboxError(400,'IDEMPOTENCY_KEY_REQUIRED','يلزم معرّف فريد للعملية.');
    const previous=await this.one('SELECT id,conversation_id FROM inbox_transfers WHERE store_id=? AND request_key=?',store.id,requestKey);
    if (previous) {
      if (previous.conversation_id!==c.id) throw new InboxError(409,'KEY_REUSED','معرّف العملية مستخدم.');
      return {conversation:this.publicConversation(c,store)};
    }
    if (Number(body.version)!==c.version) throw new InboxError(409,'STALE_CONVERSATION','تغيرت المحادثة. حدّثها وأعد المحاولة.');
    const to=action==='takeover'?'HUMAN_ACTIVE':action==='resume'?'AI_ACTIVE':action==='close'?'CLOSED':c.reopen_state;
    if (action==='reopen' && c.state!=='CLOSED' || action==='resume' && c.state==='CLOSED') throw new InboxError(409,'INVALID_STATE','أعد فتح المحادثة أولاً.');
    if (to===c.state) return {conversation:this.publicConversation(c,store)};
    const eventId=id(),now=this.now(),owner=to==='HUMAN_ACTIVE'?user.id:null;
    const statements=[
      [`INSERT INTO inbox_transfers(id,store_id,conversation_id,request_key,from_state,to_state,actor_user_id,reason,created_at)
        SELECT ?,?,?,?,?,?,?,?,? FROM inbox_conversations c WHERE c.id=? AND c.store_id=? AND c.version=? AND c.active_send_id IS NULL
        AND NOT EXISTS(SELECT 1 FROM inbox_outbox o WHERE o.conversation_id=c.id AND o.status IN ('QUEUED','SENDING','UNKNOWN'))`,
      eventId,store.id,c.id,requestKey,c.state,to,user.id,action,now,c.id,store.id,c.version],
      [`UPDATE inbox_conversations SET state=?,reopen_state=CASE WHEN ?='CLOSED' THEN state ELSE ? END,assigned_user_id=?,
        needs_attention=CASE WHEN ?='HUMAN_ACTIVE' THEN 1 ELSE 0 END,version=version+1,ai_job_mid=NULL,ai_job_token=NULL,ai_job_started=NULL,updated_at=?
        WHERE id=? AND store_id=? AND EXISTS(SELECT 1 FROM inbox_transfers t WHERE t.id=?)`,
      to,to,to==='CLOSED'?c.reopen_state:to,owner,to,now,c.id,store.id,eventId]
    ];
    const result=await this.batch(statements);
    if (!result[0].meta.changes) throw new InboxError(409,'SEND_IN_PROGRESS','هناك إرسال جارٍ أو غير محسوم. انتظر تأكيده قبل تغيير وضع المحادثة.');
    if (to==='HUMAN_ACTIVE' || to==='CLOSED') await this.run("UPDATE messages SET status='human_waiting' WHERE conversation_id=? AND status='pending'",c.id);
    return {conversation:this.publicConversation(await this.conversation(store.id,c.id),store)};
  }
  async ingest(body) {
    const jobs=new Map();
    if (body?.object!=='instagram') return [];
    for (const entry of (Array.isArray(body.entry)?body.entry:[]).slice(0,100)) {
      const account=String(entry?.id || '');
      const matches=await this.rows('SELECT * FROM stores WHERE ig_user_id=? LIMIT 2',account);
      if(matches.length>1)throw new InboxError(503,'ACCOUNT_AMBIGUOUS','حساب إنستغرام مربوط بأكثر من متجر؛ يلزم مراجعة الربط قبل معالجة الرسائل.');
      const store=matches[0];
      if (!store) continue;
      for (const event of (Array.isArray(entry.messaging)?entry.messaging:[]).slice(0,100)) {
        const msg=event?.message;
        if (!msg?.mid || typeof msg.mid!=='string' || msg.mid.length>512) continue;
        const sender=String(event.sender?.id || ''),recipient=String(event.recipient?.id || '');
        if (msg.is_echo) {
          if (sender===account && /^\d{1,64}$/.test(recipient)) await this.echo(store,recipient,msg,event.timestamp);
          continue;
        }
        if (sender===account || recipient!==account || !/^\d{1,64}$/.test(sender)) continue;
        const text=typeof msg.text==='string'?msg.text.slice(0,20000):'';
        const attachments=attachmentsOf(msg);
        if (!text && !attachments.length) continue;
        const now=this.now(),ts=Number(event.timestamp),valid=Number.isFinite(ts) && ts>0 && ts<=now+300000;
        const when=valid?Math.min(now,Math.floor(ts)):now;
        const windowTime=valid?when:null;
        const explicit=wantsHuman(text)?1:0,affirmative=wantsHuman(text,true)?1:0;
        const eventId=id(),requestKey='inbound:'+msg.mid;
        const sub='SELECT c.id FROM inbox_conversations c WHERE c.store_id=? AND c.instagram_account_id=? AND c.customer_id=?';
        const pending=`EXISTS(SELECT 1 FROM messages m WHERE m.mid=? AND m.store_id=inbox_conversations.store_id AND m.conversation_id=inbox_conversations.id AND m.inbox_counted=0)`;
        const result=await this.batch([
          [`INSERT OR IGNORE INTO inbox_conversations(store_id,instagram_account_id,customer_id,last_activity_at,created_at,updated_at) VALUES(?,?,?,?,?,?)`,store.id,account,sender,when,now,now],
          [`INSERT OR IGNORE INTO messages(store_id,mid,sender,text,status,conversation_id,received_at,attachments_json)
            VALUES(?,?,?,?,'pending',(${sub}),?,?)`,store.id,msg.mid,sender,text,store.id,account,sender,when,attachments.length?JSON.stringify(attachments):null],
          [`INSERT OR IGNORE INTO inbox_transfers(id,store_id,conversation_id,request_key,from_state,to_state,reason,source_mid,created_at)
            SELECT ?,c.store_id,c.id,?,c.state,'HUMAN_ACTIVE','customer_request',?,? FROM inbox_conversations c
            JOIN messages m ON m.conversation_id=c.id AND m.mid=? AND m.store_id=c.store_id
            WHERE c.store_id=? AND c.instagram_account_id=? AND c.customer_id=? AND c.state<>'HUMAN_ACTIVE' AND m.inbox_counted=0
            AND (?=1 OR (c.handoff_offered=1 AND ?=1))`,eventId,requestKey,msg.mid,now,msg.mid,store.id,account,sender,explicit,affirmative],
          [`INSERT OR IGNORE INTO notifs(store_id,title,body,url,inbox_event_id)
            SELECT store_id,'محادثة بانتظارك','طلب زبون التواصل مع صاحب المتجر.','/#/inbox',id FROM inbox_transfers WHERE id=?`,eventId],
          [`UPDATE inbox_conversations SET
            unread_count=unread_count+CASE WHEN (SELECT id FROM messages WHERE mid=?)>last_read_id THEN 1 ELSE 0 END,
            needs_attention=CASE WHEN state='HUMAN_ACTIVE' OR (state='CLOSED' AND reopen_state='HUMAN_ACTIVE') OR ?=1 OR (handoff_offered=1 AND ?=1) THEN 1 ELSE needs_attention END,
            version=version+CASE WHEN state='CLOSED' OR (?=1 OR (handoff_offered=1 AND ?=1)) AND state<>'HUMAN_ACTIVE' THEN 1 ELSE 0 END,
            state=CASE WHEN ?=1 OR (handoff_offered=1 AND ?=1) THEN 'HUMAN_ACTIVE' WHEN state='CLOSED' THEN reopen_state ELSE state END,
            last_customer_message_at=CASE WHEN ? IS NULL THEN last_customer_message_at ELSE max(coalesce(last_customer_message_at,0),?) END,
            last_preview=CASE WHEN ?>=last_activity_at THEN ? ELSE last_preview END,last_activity_at=max(last_activity_at,?),updated_at=?
            WHERE store_id=? AND instagram_account_id=? AND customer_id=? AND ${pending}`,
          msg.mid,explicit,affirmative,explicit,affirmative,explicit,affirmative,windowTime,windowTime,when,text || '[مرفق]',when,now,store.id,account,sender,msg.mid],
          [`UPDATE messages SET inbox_counted=1,status=CASE WHEN (SELECT state FROM inbox_conversations WHERE id=messages.conversation_id)='HUMAN_ACTIVE' THEN 'human_waiting' ELSE status END
            WHERE store_id=? AND mid=? AND conversation_id=(${sub}) AND inbox_counted=0`,store.id,msg.mid,store.id,account,sender]
        ]);
        const conversation=await this.one('SELECT * FROM inbox_conversations WHERE store_id=? AND instagram_account_id=? AND customer_id=?',store.id,account,sender);
        jobs.set(conversation.id,{store,conversationId:conversation.id});
        // Also repair a missing queued acknowledgement on a webhook retry if
        // ingestion committed but the subsequent outbox insertion failed.
        if (await this.one("SELECT id FROM inbox_transfers WHERE store_id=? AND request_key=? AND reason='customer_request'",store.id,requestKey)) await this.queueSystem(store,conversation,HANDOFF_ACK,'handoff:'+msg.mid,msg.mid);
      }
    }
    return [...jobs.values()];
  }
  async history(c,mid) {
    const current=await this.one('SELECT id FROM messages WHERE mid=? AND store_id=? AND conversation_id=?',mid,c.store_id,c.id);
    const rows=await this.rows(`SELECT role,content,at FROM (
      SELECT 'user' role,m.text content,coalesce(m.received_at,unixepoch(m.created)*1000,0) at FROM messages m
        WHERE m.store_id=? AND m.conversation_id=? AND m.id<? AND coalesce(m.text,'')<>''
      UNION ALL
      SELECT 'assistant',o.text,o.created_at FROM inbox_outbox o WHERE o.store_id=? AND o.conversation_id=? AND o.status='SENT'
      UNION ALL
      SELECT 'assistant',m.reply,coalesce(m.received_at,unixepoch(m.created)*1000,0)+1 FROM messages m
        WHERE m.store_id=? AND m.conversation_id=? AND m.id<? AND coalesce(m.reply,'')<>''
        AND NOT EXISTS(SELECT 1 FROM inbox_outbox o WHERE o.store_id=m.store_id AND o.source_mid=m.mid)
      ) ORDER BY at DESC LIMIT 20`,c.store_id,c.id,current.id,c.store_id,c.id,c.store_id,c.id,current.id);
    return rows.reverse().map(r=>({role:r.role,content:String(r.content).slice(0,1500)}));
  }
  async sendSystem(store,customer,text,key) {
    await this.ready();
    if (!key) throw new InboxError(400,'IDEMPOTENCY_KEY_REQUIRED','يلزم معرّف للإشعار.');
    const c=await this.one('SELECT * FROM inbox_conversations WHERE store_id=? AND instagram_account_id=? AND customer_id=?',store.id,store.ig_user_id,customer);
    if (!c) throw new InboxError(409,'WINDOW_CLOSED','يلزم وصول رسالة موثّقة من الزبون أولاً.');
    await this.queueSystem(store,c,text,key,null);
    const row=await this.one('SELECT * FROM inbox_outbox WHERE store_id=? AND idempotency_key=?',store.id,key);
    const result=await this.dispatch(row.id);
    if (result.status!=='SENT') throw new InboxError(409,result.error_code || 'SEND_PENDING',result.error_text || 'لم يتأكد الإرسال بعد.');
    return result;
  }
  async queueSystem(store,c,text,key,sourceMid) {
    await this.run(`INSERT OR IGNORE INTO inbox_outbox(id,store_id,conversation_id,idempotency_key,source_mid,author_type,text,created_at,responding_to_id)
      VALUES(?,?,?,?,?,'SYSTEM',?,?,coalesce((SELECT max(id) FROM messages WHERE conversation_id=?),0))`,id(),store.id,c.id,key,sourceMid,text,this.now(),c.id);
  }
  async subscribe(store) {
    const current=await this.store(store.id);
    if(this.env.LIVE!=='true')throw new InboxError(409,'LIVE_DISABLED','تكامل إنستغرام الحقيقي متوقف.');
    if(!current.ig_token||!current.ig_user_id)throw new InboxError(409,'INSTAGRAM_NOT_CONNECTED','اربط حساب إنستغرام أولاً.');
    let ok=false;
    try{
      const response=await this.fetch('https://graph.instagram.com/'+this.version()+'/'+encodeURIComponent(current.ig_user_id)+'/subscribed_apps?subscribed_fields=messages',{
        method:'POST',headers:{authorization:'Bearer '+await this.decrypt(current.ig_token)},signal:AbortSignal.timeout(8000),redirect:'error'});
      const body=await response.json();ok=response.ok&&body.success===true;
    }catch{}
    await this.run('INSERT OR REPLACE INTO meta(k,v) VALUES(?,?)','inbox-subscription:'+store.id,JSON.stringify({ok,checked_at:this.now()}));
    if(!ok)throw new InboxError(502,'SUBSCRIPTION_FAILED','تعذّر تفعيل استقبال الرسائل. راجع صلاحيات التطبيق وإعدادات Webhook في Meta أو أعد ربط إنستغرام.');
    return {ok:true};
  }
  async profile(store, conversationId) {
    const c=await this.conversation(store.id,conversationId),now=this.now();
    if (c.profile_checked_at && now-c.profile_checked_at<DAY || !store.ig_token || store.ig_user_id!==c.instagram_account_id || this.env.LIVE!=='true') return;
    const claim=await this.run('UPDATE inbox_conversations SET profile_checked_at=? WHERE id=? AND store_id=? AND (profile_checked_at IS NULL OR profile_checked_at<?)',now,c.id,store.id,now-DAY);
    if (!claim.meta.changes) return;
    try {
      const token=await this.decrypt(store.ig_token);
      const r=await this.fetch('https://graph.instagram.com/'+this.version()+'/'+encodeURIComponent(c.customer_id)+'?fields=name,username,profile_pic',{
        headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(6000),redirect:'error'
      });
      const j=await r.json();
      if (!r.ok || j.error) return;
      await this.run('UPDATE inbox_conversations SET customer_name=?,customer_username=?,customer_avatar=? WHERE id=? AND store_id=?',
        typeof j.name==='string'?j.name.slice(0,120):null,typeof j.username==='string'?j.username.slice(0,80):null,safeMediaURL(j.profile_pic),c.id,store.id);
    } catch { /* Profiles are optional; never log provider responses or tokens. */ }
  }
  version() {
    const v=this.env.IG_API_VERSION || 'v21.0';
    return /^v\d{1,2}\.\d+$/.test(v)?v:'v21.0';
  }
  async enqueueHuman(store,user,body) {
    const c=await this.conversation(store.id,body.conversation_id);
    const text=typeof body.text==='string'?body.text.trim():'',key=String(body.idempotency_key || '');
    if (!text || bytes(text)>1000) throw new InboxError(400,'INVALID_MESSAGE','اكتب رسالة لا تتجاوز 1000 بايت.');
    if (!/^[\w:-]{8,180}$/.test(key)) throw new InboxError(400,'IDEMPOTENCY_KEY_REQUIRED','يلزم معرّف فريد للإرسال.');
    const existing=await this.one('SELECT * FROM inbox_outbox WHERE store_id=? AND idempotency_key=?',store.id,key);
    if (existing) {
      if (existing.conversation_id!==c.id || existing.text!==text || existing.author_type!=='HUMAN') throw new InboxError(409,'KEY_REUSED','معرّف الإرسال مستخدم لرسالة أخرى.');
      return this.publicMessage(existing);
    }
    if (c.state!=='HUMAN_ACTIVE') throw new InboxError(409,'TAKEOVER_REQUIRED','استلم المحادثة من الذكاء الاصطناعي أولاً.');
    const p=this.policy(c,store,body.use_human_agent===true);
    if (!p.allowed) throw new InboxError(409,p.code,p.reason);
    if (await this.one('SELECT 1 x FROM blocked WHERE store_id=? AND sender=?',store.id,c.customer_id)) throw new InboxError(403,'CUSTOMER_BLOCKED','الزبون محظور في إعدادات متجرك.');
    if (c.active_send_id) throw new InboxError(409,'SEND_IN_PROGRESS','هناك إرسال جارٍ أو غير محسوم. انتظر تأكيده.');
    let retry=null;
    if (body.retry_of) {
      retry=await this.one("SELECT * FROM inbox_outbox WHERE id=? AND store_id=? AND conversation_id=? AND author_type='HUMAN' AND status='FAILED' AND error_retriable=1",String(body.retry_of),store.id,c.id);
      if (!retry || retry.text!==text) throw new InboxError(409,'UNSAFE_RETRY','هذه الرسالة غير مؤهلة لإعادة الإرسال.');
      const child=await this.one('SELECT * FROM inbox_outbox WHERE retry_of=? AND store_id=?',retry.id,store.id);
      if (child) return this.publicMessage(child);
    }
    const outId=id();
    await this.run(`INSERT OR IGNORE INTO inbox_outbox(id,store_id,conversation_id,idempotency_key,author_type,author_user_id,text,use_human_agent,created_at,retry_of,responding_to_id)
      SELECT ?,c.store_id,c.id,?,'HUMAN',?,?,?,?,?,coalesce((SELECT max(m.id) FROM messages m WHERE m.conversation_id=c.id),0)
      FROM inbox_conversations c WHERE c.id=? AND c.store_id=? AND c.state='HUMAN_ACTIVE' AND c.active_send_id IS NULL`,
    outId,key,user.id,text,p.use_human_agent?1:0,this.now(),retry?.id || null,c.id,store.id);
    const row=await this.one('SELECT * FROM inbox_outbox WHERE store_id=? AND idempotency_key=?',store.id,key);
    if (!row) {
      if (retry) {
        const child=await this.one('SELECT * FROM inbox_outbox WHERE retry_of=? AND store_id=?',retry.id,store.id);
        if (child) return this.publicMessage(child);
      }
      throw new InboxError(409,'STATE_CHANGED','تغير وضع المحادثة. حدّثها وأعد المحاولة.');
    }
    return this.publicMessage(await this.dispatch(row.id));
  }
  async finish(row, status, metaId=null, error=null) {
    const now=this.now(),unknown=status==='UNKNOWN';
    await this.batch([
      [`UPDATE inbox_outbox SET status=?,meta_message_id=coalesce(?,meta_message_id),sent_at=CASE WHEN ?='SENT' THEN ? ELSE sent_at END,
        error_code=?,error_text=?,error_retriable=? WHERE id=? AND store_id=? AND status IN ('QUEUED','SENDING','UNKNOWN')`,
      status,metaId,status,now,error?.code || null,error?.message || null,error?.retriable?1:0,row.id,row.store_id],
      [`UPDATE inbox_conversations SET active_send_id=CASE WHEN ?=1 THEN active_send_id ELSE NULL END,
        last_activity_at=CASE WHEN ?='SENT' THEN max(last_activity_at,?) ELSE last_activity_at END,
        last_preview=CASE WHEN ?='SENT' THEN ? ELSE last_preview END,
        needs_attention=CASE WHEN ?='SENT' AND ? IN ('HUMAN','EXTERNAL') AND NOT EXISTS(SELECT 1 FROM messages m WHERE m.conversation_id=inbox_conversations.id AND m.id>?) THEN 0 ELSE needs_attention END,
        updated_at=? WHERE id=? AND store_id=? AND active_send_id=?`,
      unknown?1:0,status,now,status,row.text,status,row.author_type,row.responding_to_id,now,row.conversation_id,row.store_id,row.id]
    ]);
    return this.one('SELECT * FROM inbox_outbox WHERE id=? AND store_id=?',row.id,row.store_id);
  }
  async dispatch(outId, guard=null) {
    const row=await this.one('SELECT * FROM inbox_outbox WHERE id=?',outId);
    if (!row || row.status!=='QUEUED') return row;
    const store=await this.store(row.store_id),c=await this.conversation(row.store_id,row.conversation_id);
    const automated=row.author_type!=='HUMAN',p=this.policy(c,store,!!row.use_human_agent,automated);
    const invalid= !p.allowed || c.state==='CLOSED' || (row.author_type==='HUMAN' && c.state!=='HUMAN_ACTIVE') ||
      (row.author_type==='AI' && (!guard || c.state!=='AI_ACTIVE' || c.version!==guard.version || c.ai_job_mid!==guard.mid || c.ai_job_token!==guard.token));
    if (invalid) return this.finish(row,row.author_type==='AI'?'CANCELLED':'FAILED',null,{code:p.code || 'STATE_CHANGED',message:p.reason || 'تغير وضع المحادثة قبل الإرسال.',retriable:false});
    if (await this.one('SELECT 1 x FROM blocked WHERE store_id=? AND sender=?',store.id,c.customer_id)) return this.finish(row,'FAILED',null,{code:'CUSTOMER_BLOCKED',message:'الزبون محظور.',retriable:false});
    const now=this.now(),window= p.use_human_agent?7*DAY:DAY;
    const results=await this.batch([
      [`UPDATE inbox_conversations SET active_send_id=? WHERE id=? AND store_id=? AND active_send_id IS NULL AND state=?
        AND last_customer_message_at>? AND last_customer_message_at<=? AND version=?
        AND EXISTS(SELECT 1 FROM stores s WHERE s.id=store_id AND s.ig_user_id=instagram_account_id AND s.ig_token=?)
        AND EXISTS(SELECT 1 FROM inbox_outbox o WHERE o.id=? AND o.status='QUEUED' AND o.attempted_at IS NULL)`,
      row.id,c.id,store.id,c.state,now-window,now,c.version,store.ig_token,row.id],
      [`UPDATE inbox_outbox SET status='SENDING',attempted_at=? WHERE id=? AND status='QUEUED' AND attempted_at IS NULL
        AND EXISTS(SELECT 1 FROM inbox_conversations c WHERE c.id=conversation_id AND c.active_send_id=inbox_outbox.id)`,now,row.id]
    ]);
    if (!results[1].meta.changes) return this.one('SELECT * FROM inbox_outbox WHERE id=?',row.id);
    let token;
    try { token=await this.decrypt(store.ig_token); }
    catch { return this.finish(row,'FAILED',null,{code:'TOKEN_UNAVAILABLE',message:'تعذّر قراءة ربط إنستغرام. أعد ربط الحساب.',retriable:false}); }
    const payload={recipient:{id:c.customer_id},message:{text:row.text}};
    if (p.use_human_agent) { payload.messaging_type='MESSAGE_TAG';payload.tag='HUMAN_AGENT'; }
    try {
      const response=await this.fetch('https://graph.instagram.com/'+this.version()+'/'+encodeURIComponent(c.instagram_account_id)+'/messages',{
        method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},
        body:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(10000)
      });
      const result=await response.json().catch(()=>null);
      if (response.ok && typeof result?.message_id==='string' && result.message_id.length<=512) return this.finish(row,'SENT',result.message_id);
      if (response.status>=500 || response.status===408 || response.ok) return this.finish(row,'UNKNOWN',null,{code:'DELIVERY_UNKNOWN',message:'لم يؤكد إنستغرام نتيجة الإرسال. لن نعيد إرسال الرسالة تلقائياً.',retriable:false});
      const expired=result?.error?.code===190,permission=[10,200].includes(result?.error?.code),rate=response.status===429 || [4,17,32,613].includes(result?.error?.code);
      return this.finish(row,'FAILED',null,{code:expired?'TOKEN_EXPIRED':permission?'PERMISSION_DENIED':rate?'RATE_LIMIT':'META_REJECTED',
        message:expired?'انتهت صلاحية ربط إنستغرام. أعد ربط الحساب.':permission?'رفض إنستغرام الصلاحيات أو نافذة الرد. راجع إعدادات Meta.':rate?'وصل الحساب إلى حد الإرسال. حاول لاحقاً.':'رفض إنستغرام إرسال الرسالة.',retriable:rate || !expired && !permission});
    } catch {
      return this.finish(row,'UNKNOWN',null,{code:'DELIVERY_UNKNOWN',message:'انقطع الاتصال قبل تأكيد النتيجة. انتظر تأكيد إنستغرام ولا تكرر الرسالة.',retriable:false});
    }
  }
  async assertAI(guard) {
    const row=await this.one("SELECT id FROM inbox_conversations WHERE id=? AND store_id=? AND state='AI_ACTIVE' AND version=? AND ai_job_token=?",guard.conversation.id,guard.conversation.store_id,guard.version,guard.token);
    if(!row)throw new InboxError(409,'AI_CANCELLED','توقف إجراء المساعد بعد تغيير وضع المحادثة.');
  }
  async sendAI(store,c,text,mid,guard) {
    const p=this.policy(c,store,false,true);
    if (!p.allowed) throw new InboxError(409,p.code,p.reason);
    if (!text || bytes(text)>1000) throw new InboxError(400,'INVALID_MESSAGE','الرد الآلي أطول من الحد المسموح.');
    const outId=id(),key='ai:'+mid+':'+guard.part;
    await this.run(`INSERT OR IGNORE INTO inbox_outbox(id,store_id,conversation_id,idempotency_key,source_mid,author_type,text,created_at,responding_to_id)
      SELECT ?,store_id,id,?,?,'AI',?,?,coalesce((SELECT max(m.id) FROM messages m WHERE m.conversation_id=inbox_conversations.id),0)
      FROM inbox_conversations WHERE id=? AND store_id=? AND state='AI_ACTIVE' AND version=? AND ai_job_mid=? AND ai_job_token=?`,
    outId,key,mid,text,this.now(),c.id,store.id,guard.version,mid,guard.token);
    const row=await this.one('SELECT * FROM inbox_outbox WHERE store_id=? AND idempotency_key=?',store.id,key);
    if (!row) throw new InboxError(409,'AI_CANCELLED','توقف الرد الآلي بعد تغيير وضع المحادثة.');
    const result=await this.dispatch(row.id,guard);
    if (result.status!=='SENT') throw new InboxError(409,result.status==='CANCELLED'?'AI_CANCELLED':result.error_code || 'SEND_PENDING',result.error_text || 'لم يتأكد إرسال الرد الآلي.');
    return result;
  }
  async fallback(c, kind) {
    if (kind==='unclear') {
      const updated=await this.one('UPDATE inbox_conversations SET unrecognized_count=unrecognized_count+1 WHERE id=? RETURNING unrecognized_count,handoff_offered',c.id);
      if (updated.unrecognized_count>=2 && !updated.handoff_offered) {
        await this.run('UPDATE inbox_conversations SET handoff_offered=1 WHERE id=?',c.id);
        return [UNKNOWN_REPLY,HANDOFF_OFFER];
      }
      return [UNKNOWN_REPLY];
    }
    if (kind==='knowledge') {
      await this.run('UPDATE inbox_conversations SET handoff_offered=1 WHERE id=?',c.id);
      return ['هالمعلومة مو متوفرة عندي حالياً. '+HANDOFF_OFFER];
    }
    await this.run('UPDATE inbox_conversations SET unrecognized_count=0,handoff_offered=0 WHERE id=?',c.id);
    return null;
  }
  async drain(store,conversationId,handler) {
    for (const row of await this.rows("SELECT id FROM inbox_outbox WHERE conversation_id=? AND status='QUEUED' ORDER BY created_at,id LIMIT 5",conversationId)) await this.dispatch(row.id);
    for (let n=0;n<3;n++) {
      const token=id();
      const claimed=await this.run(`UPDATE inbox_conversations SET ai_job_mid=(SELECT mid FROM messages WHERE conversation_id=? AND status='pending' ORDER BY id LIMIT 1),ai_job_started=?,ai_job_token=?
        WHERE id=? AND store_id=? AND state='AI_ACTIVE' AND ai_job_mid IS NULL AND active_send_id IS NULL
        AND EXISTS(SELECT 1 FROM messages WHERE conversation_id=? AND status='pending')`,conversationId,this.now(),token,conversationId,store.id,conversationId);
      if (!claimed.meta.changes) return;
      const c=await this.conversation(store.id,conversationId),mid=c.ai_job_mid;
      if(c.ai_job_token!==token||!mid)return;
      const message=await this.one('SELECT * FROM messages WHERE mid=? AND store_id=? AND conversation_id=?',mid,store.id,c.id);
      const guard={mid,version:c.version,token,conversation:c,part:0};
      try { await handler(store,message,guard,this); }
      finally {
        await this.run('UPDATE inbox_conversations SET ai_job_mid=NULL,ai_job_token=NULL,ai_job_started=NULL WHERE id=? AND store_id=? AND ai_job_mid=? AND ai_job_token=? AND version=?',c.id,store.id,mid,token,c.version);
      }
    }
  }
  async echo(store,customer,message,timestamp) {
    const existing=await this.one('SELECT id FROM inbox_outbox WHERE store_id=? AND meta_message_id=?',store.id,message.mid);
    if (existing) return;
    const c=await this.one('SELECT * FROM inbox_conversations WHERE store_id=? AND instagram_account_id=? AND customer_id=?',store.id,store.ig_user_id,customer);
    if (!c) return;
    const text=typeof message.text==='string'?message.text.slice(0,20000):'[مرفق من المتجر]';
    const active=c.active_send_id && await this.one("SELECT * FROM inbox_outbox WHERE id=? AND store_id=? AND status IN ('SENDING','UNKNOWN')",c.active_send_id,store.id);
    const ts=Number(timestamp),now=this.now();
    if (active && active.text===text && Number.isFinite(ts) && Math.abs(ts-(active.attempted_at || now))<300000) {
      await this.finish(active,'SENT',message.mid);
      return;
    }
    const outId=id(),eventId=id(),when=Number.isFinite(ts) && ts>0?Math.min(ts,now):now;
    await this.batch([
      [`INSERT OR IGNORE INTO inbox_outbox(id,store_id,conversation_id,idempotency_key,source_mid,author_type,text,attachments_json,status,meta_message_id,created_at,sent_at)
        VALUES(?,?,?,?,?,'EXTERNAL',?,?,'SENT',?,?,?)`,outId,store.id,c.id,'echo:'+message.mid,message.mid,text,JSON.stringify(attachmentsOf(message)),message.mid,when,when],
      [`INSERT OR IGNORE INTO inbox_transfers(id,store_id,conversation_id,request_key,from_state,to_state,reason,source_mid,created_at)
        SELECT ?,store_id,id,?,state,'HUMAN_ACTIVE','external_human',?,? FROM inbox_conversations WHERE id=? AND state<>'HUMAN_ACTIVE'`,
      eventId,'echo:'+message.mid,message.mid,now,c.id],
      [`UPDATE inbox_conversations SET state='HUMAN_ACTIVE',reopen_state='HUMAN_ACTIVE',version=version+CASE WHEN state<>'HUMAN_ACTIVE' THEN 1 ELSE 0 END,
        last_preview=CASE WHEN ?>=last_activity_at THEN ? ELSE last_preview END,last_activity_at=max(last_activity_at,?),updated_at=? WHERE id=? AND store_id=?`,when,text,when,now,c.id,store.id],
      [`INSERT OR IGNORE INTO messages(store_id,mid,sender,text,reply,status,conversation_id,received_at,inbox_counted) VALUES(?,?,?,'',?,'owner',?,?,1)`,store.id,message.mid,customer,text,c.id,when]
    ]);
  }
  async reconcile(store,body) {
    const c=await this.conversation(store.id,body.conversation_id);
    const row=await this.one("SELECT * FROM inbox_outbox WHERE id=? AND store_id=? AND conversation_id=? AND status='UNKNOWN'",String(body.message_id),store.id,c.id);
    const metaId=String(body.meta_message_id || '');
    if (!row || !metaId || metaId.length>512) throw new InboxError(400,'INVALID_RECONCILIATION','يلزم إرسال غير محسوم ومعرّف رسالة Meta موثّق.');
    if (store.ig_user_id!==c.instagram_account_id || !store.ig_token) throw new InboxError(409,'ACCOUNT_CHANGED','حساب المحادثة غير مربوط حالياً.');
    let r,j;
    try {
      r=await this.fetch('https://graph.instagram.com/'+this.version()+'/'+encodeURIComponent(metaId)+'?fields=id,message,from,to,created_time',{
        headers:{authorization:'Bearer '+await this.decrypt(store.ig_token)},signal:AbortSignal.timeout(8000),redirect:'error'});
      j=await r.json();
    } catch { throw new InboxError(502,'META_UNAVAILABLE','تعذّر التحقق من رسالة Meta. بقيت الحالة دون تغيير.'); }
    const recipients=Array.isArray(j?.to?.data)?j.to.data:[];
    if (!r.ok || j.id!==metaId || j.message!==row.text || String(j.from?.id)!==c.instagram_account_id || !recipients.some(v=>String(v.id)===c.customer_id) || Math.abs(Date.parse(j.created_time)-row.attempted_at)>300000 || !Number.isFinite(Date.parse(j.created_time))) throw new InboxError(409,'RECONCILIATION_REJECTED','لم تثبت Meta أن الرسالة تخص هذا الإرسال. بقيت الحالة دون تغيير.');
    return this.publicMessage(await this.finish(row,'SENT',metaId));
  }
  async sweep() {
    const now=this.now();
    await this.run("UPDATE inbox_outbox SET status='UNKNOWN',error_code='DELIVERY_UNKNOWN',error_text='انتهت مهلة تأكيد الإرسال. لن نكرره تلقائياً.' WHERE status='SENDING' AND attempted_at<?",now-120000);
    const stuck=await this.rows('SELECT * FROM inbox_conversations WHERE ai_job_mid IS NOT NULL AND ai_job_started<? AND active_send_id IS NULL LIMIT 20',now-120000);
    for (const c of stuck) await this.batch([
      [`UPDATE messages SET status=CASE WHEN inbox_attempts<3 AND NOT EXISTS(SELECT 1 FROM inbox_outbox o WHERE o.store_id=messages.store_id AND o.source_mid=messages.mid) THEN 'pending' ELSE 'error' END,error='انتهت مهلة المعالجة'
        WHERE mid=? AND store_id=? AND status='processing' AND EXISTS(SELECT 1 FROM inbox_conversations x WHERE x.id=messages.conversation_id AND x.ai_job_token=?)`,c.ai_job_mid,c.store_id,c.ai_job_token],
      ['UPDATE inbox_conversations SET ai_job_mid=NULL,ai_job_token=NULL,ai_job_started=NULL,version=version+1 WHERE id=? AND ai_job_mid=? AND ai_job_token=? AND active_send_id IS NULL',c.id,c.ai_job_mid,c.ai_job_token]
    ]);
    const jobs=await this.rows(`SELECT DISTINCT c.id conversationId,c.store_id FROM inbox_conversations c
      WHERE c.active_send_id IS NULL AND (EXISTS(SELECT 1 FROM inbox_outbox o WHERE o.conversation_id=c.id AND o.status='QUEUED')
      OR c.state='AI_ACTIVE' AND c.ai_job_mid IS NULL AND EXISTS(SELECT 1 FROM messages m WHERE m.conversation_id=c.id AND m.status='pending')) LIMIT 5`);
    return Promise.all(jobs.map(async j=>({conversationId:j.conversationId,store:await this.store(j.store_id)})));
  }
}

export { SmartInbox, InboxError, UNKNOWN_REPLY, HANDOFF_ACK, HANDOFF_OFFER, wantsHuman, safeMediaURL };
