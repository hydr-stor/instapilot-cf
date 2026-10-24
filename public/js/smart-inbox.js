/* Smart Inbox UI. Production data comes only from authenticated same-origin APIs. */
(()=>{

  'use strict';
  let cleanupPage=null,notifier=null;
  const uuid=()=>crypto.randomUUID ? crypto.randomUUID() : [...crypto.getRandomValues(new Uint8Array(18))].map(x=>x.toString(16).padStart(2,'0')).join('');
  const labels={AI_ACTIVE:'الذكاء الاصطناعي',HUMAN_ACTIVE:'متابعة بشرية',CLOSED:'مغلقة'};
  const delivery={QUEUED:'بانتظار الإرسال',SENDING:'جارٍ الإرسال',SENT:'أُرسلت إلى إنستغرام',FAILED:'فشل الإرسال',UNKNOWN:'الإرسال غير محسوم',CANCELLED:'أُلغي قبل الإرسال',RECEIVED:'واردة'};
  const textBytes=t=>new TextEncoder().encode(t).length;
  const date=t=>t?new Intl.DateTimeFormat('ar-IQ',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(t)):'';
  async function request(path,method='GET',body,owner) {
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    owner?.controllers?.add(controller);
    try {
      const response=await fetch('/api/inbox/'+path,{method,credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw Object.assign(new Error(data.error || 'تعذّر تحميل صندوق الوارد.'),{status:response.status,code:data.code});
      return data;
    } catch(error) {
      if(error.status)throw error;
      throw Object.assign(new Error('تعذّر الاتصال. سنحاول تحديث الرسائل عند عودة الشبكة.'),{code:'NETWORK'});
    } finally {clearTimeout(timer);owner?.controllers?.delete(controller);}
  }
  function stopPage(){cleanupPage?.();cleanupPage=null;}
  function stopNotifications(){
    if(!notifier)return;
    notifier.closed=true;clearTimeout(notifier.timer);for(const c of notifier.controllers)c.abort();
    document.removeEventListener('visibilitychange',notifier.visibility);notifier=null;
  }
  function startNotifications(){
    if(!me.features?.smart_inbox){stopNotifications();return;}
    if(notifier?.store===me.store.id)return;
    stopNotifications();
    const owner={store:me.store.id,closed:false,controllers:new Set(),timer:0,lastNotice:null};
    notifier=owner;
    const tick=async()=>{
      if(owner.closed||owner.running)return;
      owner.running=true;
      if(!document.hidden)try{
        const data=await request('summary','GET',undefined,owner);
        if(owner.closed)return;
        document.querySelectorAll('[data-smart-waiting]').forEach(el=>{el.textContent=data.waiting;el.hidden=!data.waiting;el.setAttribute('aria-label',data.waiting+' محادثة بانتظار التاجر');});
        const latest=data.notifications?.[0]?.id || 0;
        if(owner.lastNotice!==null&&latest>owner.lastNotice)toast('محادثة جديدة بانتظار متابعتك في صندوق الوارد الذكي.');
        owner.lastNotice=latest;
      }catch(error){if(error.status===401){stopNotifications();return;}}
      owner.running=false;
      if(!owner.closed)owner.timer=setTimeout(tick,15000);
    };
    owner.visibility=()=>{if(!document.hidden){clearTimeout(owner.timer);tick();}};
    document.addEventListener('visibilitychange',owner.visibility);tick();
  }
  function avatar(c){
    const title=c.customer_name || c.customer_username || 'زبون إنستغرام';
    return `<span class="si-avatar" aria-hidden="true">${c.customer_avatar?`<img src="${esc(c.customer_avatar)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:`<span>${esc(Array.from(title)[0])}</span>`}</span>`;
  }
  function name(c){return c.customer_name || (c.customer_username?'@'+c.customer_username:'زبون إنستغرام · '+String(c.customer_id).slice(-4));}
  function page(){
    if(!me.features?.smart_inbox)return{h:'<section class="si-setup"><h1>صندوق الوارد الذكي قيد التجهيز</h1><p>سجل الرسائل الحالي متاح؛ سيظهر الصندوق بعد اكتمال التفعيل.</p><a class="secondary-action" href="#/chats">فتح سجل المحادثات</a></section>'};
    const h=`<section class="si-heading"><div><span class="screen-kicker">SMART INBOX</span><h1>صندوق الوارد الذكي</h1><p>مساعدك يبدأ الحوار. وأنت حاضر متى احتاجك زبونك.</p></div><a class="si-history" href="#/chats">${uiIcon('clock',16)}سجل الرسائل السابق</a></section>
      <section class="si-shell" id="si" aria-label="صندوق الوارد الذكي">
        <aside class="si-list-panel" aria-label="المحادثات"><div class="si-list-top"><div><b>محادثات متجرك</b><span class="si-live" id="si-live" role="status">جارٍ الاتصال…</span></div><span id="si-total" class="si-total">—</span></div>
          <div class="si-search">${screenSearch('si-search','ابحث بالاسم أو آخر رسالة','')}</div>
          <div class="si-filters" role="group" aria-label="تصفية صندوق الوارد">${[['all','الكل'],['waiting','بانتظارك'],['unread','غير مقروءة'],['ai','AI'],['human','بشري'],['closed','مغلقة']].map(([k,t])=>`<button type="button" data-filter="${k}" aria-pressed="${k==='all'}" class="${k==='all'?'on':''}">${t}${k==='waiting'?'<span id="si-waiting">0</span>':''}</button>`).join('')}</div>
          <label class="si-sort" for="si-sort">ترتيب المحادثات<select id="si-sort"><option value="newest">الأحدث أولاً</option><option value="oldest">الأقدم أولاً</option><option value="unread">الأكثر غير مقروءة</option></select></label>
          <div id="si-connection" class="si-thread-notice" hidden><p>يلزم التحقق من تفعيل استقبال رسائل إنستغرام.</p><button type="button" id="si-subscribe" class="si-takeover">تفعيل استقبال الرسائل</button><a href="#/ig">إعدادات الربط</a></div>
          <div id="si-list" class="si-list"><div class="si-skeleton" role="status" aria-label="جارٍ تحميل المحادثات">${'<div class="sk"></div>'.repeat(4)}</div></div>
          <button type="button" id="si-more" class="si-more" hidden>محادثات أقدم</button>
        </aside>
        <section class="si-thread-panel" aria-label="المحادثة المحددة"><div class="si-choose" id="si-choose">${ic('inbox',38)}<h2>كل محادثة تستحق اهتمامك.</h2><p>اختر زبوناً لقراءة الحوار واستلامه من المساعد عند الحاجة.</p></div>
          <div id="si-thread" class="si-thread" hidden><header class="si-thread-head"><button type="button" class="si-back icon-button" id="si-back" aria-label="العودة إلى قائمة المحادثات">${uiIcon('chevron',20)}</button><div id="si-person" class="si-person"></div><button type="button" id="si-close" class="si-close">إغلاق المحادثة</button></header>
            <div class="si-control"><span id="si-mode"></span><button type="button" id="si-takeover" class="si-takeover">استلام المحادثة</button><button type="button" id="si-resume" class="si-resume" hidden>إرجاع إلى AI</button></div>
            <div class="si-thread-notice" id="si-notice" role="status" hidden></div>
            <div id="si-messages" class="si-messages" role="log" aria-label="رسائل المحادثة" aria-live="polite" aria-relevant="additions text"></div>
            <form class="si-composer" id="si-compose"><p id="si-policy" class="si-policy"></p><label id="si-human-agent" class="si-human-agent" hidden><input id="si-human-agent-check" type="checkbox">هذا رد بشري للدعم باستخدام صلاحية Human Agent المعتمدة.</label><label class="sr-only" for="si-reply">اكتب ردك للزبون</label><textarea id="si-reply" rows="2" placeholder="اكتب ردّك بصوت متجرك…" enterkeyhint="enter" aria-describedby="si-policy si-bytes" disabled></textarea><div class="si-compose-foot"><span id="si-bytes">0 / 1000 بايت</span><button id="si-send" class="si-send" type="submit" disabled><span>إرسال الرد</span>${uiIcon('arrow',18)}</button></div><p id="si-send-error" class="si-send-error" role="alert" hidden></p></form>
          </div>
        </section>
      </section>`;
    return {h,i:mount};
  }
  function mount(){
    stopPage();
    const root=document.querySelector('#si');
    const state={closed:false,controllers:new Set(),timer:0,queryTimer:0,filter:'all',sort:'newest',q:'',items:[],next:null,selected:null,conversation:null,
      messages:new Map(),cursor:null,initialized:false,refreshing:false,readThrough:0,listSeq:0,threadSeq:0,action:false,sending:false,pending:null,drafts:new Map(),rendered:'',noPoll:false};
    const $s=selector=>root.querySelector(selector);
    const live=(message,error=false)=>{const el=$s('#si-live');if(el){el.textContent=message;el.classList.toggle('is-offline',error);}};
    function notice(message){const el=$s('#si-notice');el.hidden=!message;el.textContent=message || '';}
    function controls(){
      const c=state.conversation;if(!c)return;
      const closed=c.state==='CLOSED',human=c.state==='HUMAN_ACTIVE',policy=c.policy;
      $s('#si-mode').innerHTML=`<i class="${human?'human':''}"></i>${esc(labels[c.state])}${human&&c.assigned_user_id===me.store.user_id?' · استلمتها أنت':''}`;
      $s('#si-takeover').hidden=human||closed;$s('#si-resume').hidden=!human||closed;
      $s('#si-takeover').disabled=state.action||c.active_send;$s('#si-resume').disabled=state.action||c.active_send;
      $s('#si-close').textContent=closed?'إعادة فتح المحادثة':'إغلاق المحادثة';$s('#si-close').disabled=state.action||c.active_send;
      $s('#si-human-agent').hidden=!policy.requires_human_agent||!human;
      $s('#si-reply').disabled=closed||!human||!policy.allowed||c.active_send||state.action;
      $s('#si-reply').readOnly=state.sending||!!state.pending;
      $s('#si-policy').textContent=closed?'المحادثة مغلقة. أعد فتحها للمتابعة.':!human?'المساعد يتابع هذه المحادثة. استلمها لكتابة رد بشري.':c.active_send?'هناك إرسال جارٍ أو غير محسوم. ننتظر تأكيد نتيجته.':!policy.allowed?policy.reason:policy.requires_human_agent?'نافذة الدعم البشري متاحة حتى '+date(policy.human_agent_until):'يمكنك الرد حتى '+date(policy.standard_until);
      const length=textBytes($s('#si-reply').value);$s('#si-bytes').textContent=length+' / 1000 بايت';$s('#si-bytes').classList.toggle('over',length>1000);
      const recovery=!!state.pending&&!state.sending;
      $s('#si-send').disabled=state.sending||state.action||!recovery&&(!human||closed||!policy.allowed||c.active_send||!length||length>1000||policy.requires_human_agent&&!$s('#si-human-agent-check').checked);
      $s('#si-send span').textContent=state.sending?'جارٍ الإرسال…':recovery?'التحقق من نتيجة الإرسال':'إرسال الرد';
    }
    function listHTML(){
      const target=$s('#si-list');
      if(!state.items.length){target.innerHTML=`<div class="si-empty">${ic('inbox',30)}<h2>${state.q||state.filter!=='all'?'لا توجد محادثات مطابقة':'أهلاً بأول محادثة.'}</h2><p>${state.q||state.filter!=='all'?'جرّب تغيير البحث أو التصفية.':'ستصل رسائل Instagram هنا عند استقبالها.'}</p>${!me.store.ig_connected?'<a class="secondary-action" href="#/ig">ربط إنستغرام</a>':''}</div>`;return;}
      const top=target.scrollTop;
      target.innerHTML=state.items.map(c=>`<button class="si-conversation ${c.id===state.selected?'selected':''} ${c.unread_count?'unread':''}" type="button" data-conversation="${c.id}" aria-pressed="${c.id===state.selected}">${avatar(c)}<span class="si-conversation-main"><span class="si-row"><b>${esc(name(c))}</b><time>${esc(date(c.last_activity_at))}</time></span><span class="si-preview">${esc(c.last_preview||'محادثة متجرك')}</span><span class="si-row si-row-meta"><span class="si-state ${c.state==='HUMAN_ACTIVE'?'human':''}">${esc(labels[c.state])}</span>${c.needs_attention?'<span class="si-attention">بانتظارك</span>':''}${c.unread_count?`<span class="si-unread" aria-label="${c.unread_count} رسالة غير مقروءة">${c.unread_count}</span>`:''}</span></span></button>`).join('');
      target.scrollTop=top;$s('#si-more').hidden=state.next===null;
    }
    async function loadList(append=false){
      const seq=++state.listSeq;
      const params=new URLSearchParams({filter:state.filter,sort:state.sort,q:state.q,offset:String(append?state.next||0:0)});
      const data=await request('conversations?'+params,'GET',undefined,state);
      if(state.closed||seq!==state.listSeq)return;
      state.items=append?[...state.items,...data.conversations.filter(c=>!state.items.some(x=>x.id===c.id))]:data.conversations;
      state.next=data.next_offset;$s('#si-total').textContent=data.total;$s('#si-waiting').textContent=data.waiting;
      $s('#si-connection').hidden=!me.store.ig_connected||data.subscription?.ok===true||data.total>0&&data.subscription?.ok!==false;
      listHTML();live('محدّث الآن');
    }
    function messageHTML(m){
      const outbound=m.direction==='OUTBOUND',author=m.author_type==='HUMAN'?'أنت':m.author_type==='AI'?'مساعد المتجر':m.author_type==='SYSTEM'?'تحديث المتابعة':m.author_type==='EXTERNAL'?'رد من إنستغرام':'الزبون';
      return `<article class="si-message ${outbound?'out':'in'} ${m.status.toLowerCase()}" data-message="${esc(m.id)}"><span class="si-message-author">${esc(author)}</span><div class="si-bubble">${m.text?`<p dir="auto">${esc(m.text)}</p>`:''}${(m.attachments||[]).map(a=>a.url?`<a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer" class="si-attachment">${ic('clip',16)}عرض ${esc({image:'الصورة',video:'الفيديو',audio:'الصوت',file:'المرفق',share:'المشاركة',story_mention:'الإشارة'}[a.type]||'المرفق')}</a>`:'<span class="si-attachment">مرفق من إنستغرام · الرابط غير متاح حالياً</span>').join('')}</div><div class="si-message-meta"><time>${esc(date(m.created_at))}</time>${outbound?`<span>${esc(delivery[m.status]||m.status)}</span>`:''}</div>${m.error?`<p class="si-message-error">${esc(m.error.message)}</p>`:''}${m.status==='FAILED'&&m.error?.retriable&&m.author_type==='HUMAN'?`<button type="button" class="si-retry" data-retry="${esc(m.id)}">إعادة المحاولة</button>`:''}</article>`;
    }
    function messagesHTML(older=false){
      const box=$s('#si-messages'),bottom=box.scrollHeight-box.scrollTop-box.clientHeight<100,oldHeight=box.scrollHeight,oldTop=box.scrollTop;
      const messages=[...state.messages.values()].sort((a,b)=>a.created_at-b.created_at||a.id.localeCompare(b.id));
      const html=`${state.cursor?'<button type="button" class="si-older" id="si-older">عرض الرسائل الأقدم</button>':''}${messages.map(messageHTML).join('')||'<div class="si-empty"><p>لا توجد رسائل محفوظة في هذه المحادثة.</p></div>'}`;
      if(html===state.rendered)return;state.rendered=html;box.innerHTML=html;
      if(older)box.scrollTop=oldTop+box.scrollHeight-oldHeight;else if(bottom||oldHeight<box.clientHeight+50)box.scrollTop=box.scrollHeight;
    }
    async function loadThread(older=false){
      if(!state.selected)return;
      const selected=state.selected,seq=++state.threadSeq;
      const data=await request('thread?'+new URLSearchParams({conversation_id:String(selected),...(older&&state.cursor?{before:state.cursor}:{})}),'GET',undefined,state);
      if(state.closed||selected!==state.selected||seq!==state.threadSeq)return;
      state.conversation=data.conversation;
      for(const m of data.messages)state.messages.set(m.id,m);
      if(older||!state.initialized){state.cursor=data.next_cursor;state.initialized=true;}
      const person=$s('#si-person');
      person.innerHTML=`${avatar(data.conversation)}<div><h2>${esc(name(data.conversation))}</h2><span dir="ltr">${esc(data.conversation.customer_username?'@'+data.conversation.customer_username:'Instagram')}</span></div>`;
      if(state.pending){
        const confirmed=data.messages.find(m=>m.idempotency_key===state.pending.key);
        if(confirmed){if(confirmed.status!=='FAILED'&&$s('#si-reply').value===state.pending.text)$s('#si-reply').value='';state.pending=null;}
      }
      controls();messagesHTML(older);
      if(!older&&data.read_through_id>state.readThrough&&!document.hidden){
        state.readThrough=data.read_through_id;
        await request('read','POST',{conversation_id:selected,through_id:data.read_through_id},state);
      }
    }
    async function selectConversation(cid){
      if(state.sending||state.pending){notice('تحقّق من نتيجة الإرسال الحالي قبل تغيير المحادثة.');return;}
      if(state.selected)state.drafts.set(state.selected,$s('#si-reply').value);
      state.selected=cid;state.messages.clear();state.cursor=null;state.initialized=false;state.rendered='';state.readThrough=0;
      root.dataset.selected='true';$s('#si-choose').hidden=true;$s('#si-thread').hidden=false;
      $s('#si-reply').value=state.drafts.get(cid)||'';$s('#si-human-agent-check').checked=false;
      $s('#si-messages').innerHTML='<div class="si-skeleton" role="status" aria-label="جارٍ تحميل الرسائل"><div class="sk"></div><div class="sk"></div></div>';
      notice('');listHTML();
      try{await loadThread();if(!state.closed)$s('#si-back').focus({preventScroll:true});}
      catch(error){if(!state.closed)notice(error.message);}
    }
    async function action(kind){
      if(state.action||!state.conversation)return;
      state.action=true;controls();notice('');
      try{
        const result=await request(kind,'POST',{conversation_id:state.selected,version:state.conversation.version,request_key:uuid()},state);
        if(state.closed)return;state.conversation=result.conversation;
        await Promise.all([loadThread(),loadList()]);toast(kind==='takeover'?'استلمت المحادثة. ردود AI متوقفة عليها.':kind==='resume'?'عاد المساعد لمتابعة الرسائل القادمة.':kind==='close'?'أُغلقت المحادثة.':'أُعيد فتح المحادثة.');
      }catch(error){if(!state.closed){notice(error.message);await loadThread().catch(()=>{});}}
      finally{state.action=false;if(!state.closed)controls();}
    }
    async function submit(retryMessage=null){
      if(state.sending||!state.conversation)return;
      const text=retryMessage?.text||state.pending?.text||$s('#si-reply').value.trim();
      if(!text||textBytes(text)>1000)return;
      const key=state.pending?.key||uuid(),retryOf=state.pending?.retryOf||retryMessage?.id.replace(/^out:/,'');state.pending={key,text,retryOf};state.sending=true;controls();
      $s('#si-send-error').hidden=true;
      try{
        const row=await request('send','POST',{conversation_id:state.selected,text,idempotency_key:key,use_human_agent:$s('#si-human-agent-check').checked,...(retryOf?{retry_of:retryOf}: {})},state);
        if(state.closed)return;
        state.messages.set(row.id,row);state.pending=null;
        if(row.status!=='FAILED'){if($s('#si-reply').value.trim()===text){$s('#si-reply').value='';state.drafts.delete(state.selected);}}
        else{$s('#si-send-error').textContent=row.error?.message||'فشل إرسال الرسالة.';$s('#si-send-error').hidden=false;}
        messagesHTML();await Promise.all([loadThread(),loadList()]);
      }catch(error){
        if(state.closed)return;
        if(error.status)state.pending=null;
        $s('#si-send-error').textContent=error.code==='NETWORK'?'لم نتأكد من النتيجة. اضغط «التحقق من نتيجة الإرسال»؛ سنستخدم المعرّف نفسه لمنع التكرار.':error.message;
        $s('#si-send-error').hidden=false;
        await loadThread().catch(()=>{});
      }finally{state.sending=false;if(!state.closed)controls();}
    }
    const clicked=event=>{
      const c=event.target.closest('[data-conversation]');if(c){selectConversation(Number(c.dataset.conversation));return;}
      const f=event.target.closest('[data-filter]');if(f){state.filter=f.dataset.filter;root.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('on',b===f);b.setAttribute('aria-pressed',String(b===f));});loadList().catch(e=>live(e.message,true));return;}
      const retry=event.target.closest('[data-retry]');if(retry){const m=state.messages.get(retry.dataset.retry);if(m)submit(m);return;}
      if(event.target.closest('#si-older'))loadThread(true).catch(e=>notice(e.message));
    };
    root.addEventListener('click',clicked);
    root.addEventListener('error',e=>{if(e.target.tagName==='IMG')e.target.hidden=true;},true);
    $s('#si-search').oninput=e=>{state.q=e.target.value;clearTimeout(state.queryTimer);state.queryTimer=setTimeout(()=>loadList().catch(x=>live(x.message,true)),250);};
    $s('#si-sort').onchange=e=>{state.sort=e.target.value;loadList().catch(x=>live(x.message,true));};
    $s('#si-more').onclick=()=>loadList(true).catch(e=>live(e.message,true));
    $s('#si-subscribe').onclick=async()=>{const b=$s('#si-subscribe');b.disabled=true;try{await request('subscribe','POST',{},state);toast('فعّلت Meta استقبال الرسائل.');await loadList();}catch(error){live(error.message,true);}finally{if(!state.closed)b.disabled=false;}};
    $s('#si-back').onclick=()=>{if(state.sending||state.pending)return;state.drafts.set(state.selected,$s('#si-reply').value);state.selected=null;state.threadSeq++;root.dataset.selected='false';$s('#si-list [data-conversation]')?.focus({preventScroll:true});};
    $s('#si-takeover').onclick=()=>action('takeover');$s('#si-resume').onclick=()=>action('resume');$s('#si-close').onclick=()=>action(state.conversation.state==='CLOSED'?'reopen':'close');
    $s('#si-compose').onsubmit=e=>{e.preventDefault();submit();};
    $s('#si-reply').oninput=controls;$s('#si-human-agent-check').onchange=controls;
    const size=()=>{if(state.closed)return;const viewport=window.visualViewport?.height||innerHeight;root.style.setProperty('--si-height',Math.max(340,viewport-Math.max(0,root.getBoundingClientRect().top)-(innerWidth<900?95:30))+'px');};
    window.visualViewport?.addEventListener('resize',size);addEventListener('resize',size);size();
    async function refresh(){
      if(state.closed||state.noPoll||state.refreshing)return;
      state.refreshing=true;
      if(!document.hidden&&navigator.onLine)try{await Promise.all([loadList(),loadThread()]);}
      catch(error){if(!state.closed)live(error.message,true);}
      state.refreshing=false;
      if(!state.closed)state.timer=setTimeout(refresh,4000);
    }
    const visibility=()=>{if(!document.hidden){clearTimeout(state.timer);refresh();size();}};
    document.addEventListener('visibilitychange',visibility);addEventListener('online',visibility);
    cleanupPage=()=>{state.closed=true;clearTimeout(state.timer);clearTimeout(state.queryTimer);for(const c of state.controllers)c.abort();document.removeEventListener('visibilitychange',visibility);removeEventListener('online',visibility);removeEventListener('resize',size);window.visualViewport?.removeEventListener('resize',size);};
    loadList().then(()=>{if(!state.closed)state.timer=setTimeout(refresh,4000);}).catch(error=>{
      if(state.closed)return;state.noPoll=true;
      root.innerHTML=`<div class="si-setup" role="alert">${ic('inbox',38)}<h2>${error.code==='INBOX_DISABLED'||error.code==='INBOX_MIGRATION_REQUIRED'?'صندوقك الذكي قيد التجهيز':'تعذّر الاتصال بصندوق الوارد'}</h2><p>${esc(error.message)}</p><button type="button" class="secondary-action" onclick="refreshWorkspace(this)">إعادة المحاولة</button><a href="#/chats">فتح سجل الرسائل الحالي</a></div>`;
    });
  }
  window.SmartInboxUI={page,stopPage,startNotifications,stopNotifications};

})();
