"""Sequential offline browser regression for InstaPilot's existing merchant UI.

Usage: python tests/legacy/run_merchant.py [--only GROUP]
Reports and screenshots stay outside the repository. Every API uses fixtures.py.
No server, Worker, D1, credentials, or production request is used.
"""
import argparse
import os
import tempfile
import shutil
import asyncio
import json
import time
import traceback
from pathlib import Path
from playwright.async_api import async_playwright, expect
from fixtures import BASE, FAKE_EMAIL, FAKE_PASSWORD, Fixtures

OUT = Path(os.environ.get('INBOX_LEGACY_QA_OUTPUT', str(Path(tempfile.gettempdir())/'instapilot-legacy-qa')))
OUT.mkdir(parents=True,exist_ok=True)
SHOTS = OUT/'screenshots'
SHOTS.mkdir(exist_ok=True)
REPORT = {'started': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
          'environment': 'Chromium, offline intercepted fixtures; no Worker/database',
          'groups': [], 'screenshots': [], 'api_contracts': [], 'external_requests': [], 'unhandled_requests': [], 'page_errors': []}


def require(ok, message):
    if not ok: raise AssertionError(message)


def save_report():
    REPORT['passed'] = sum(g['status'] == 'passed' for g in REPORT['groups'])
    REPORT['failed'] = sum(g['status'] == 'failed' for g in REPORT['groups'])
    (OUT/'merchant-report.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2))


async def ready(page, route):
    await page.goto(BASE+'/#/'+route, wait_until='domcontentloaded')
    await expect(page.locator('#pg')).to_have_attribute('data-page', route)
    await expect(page.locator('#pg')).to_have_attribute('aria-busy', 'false')
    await page.locator('#sp').wait_for(state='hidden', timeout=6000)


async def settled(page):
    await expect(page.locator('#pg')).to_have_attribute('aria-busy', 'false')
    await page.wait_for_timeout(80)


async def tap_submit(page, selector):
    await page.locator(selector).evaluate('(f)=>f.requestSubmit()')


async def no_overflow(page):
    result = await page.evaluate('''() => ({
      direction: getComputedStyle(document.documentElement).direction,
      viewport: innerWidth, document: document.documentElement.scrollWidth,
      offenders: [...document.querySelectorAll('#pg *')].filter(e=>{
        const r=e.getBoundingClientRect();return r.width>0&&(r.left < -2 || r.right>innerWidth+2)
      }).slice(0,8).map(e=>({tag:e.tagName,class:e.className,text:e.textContent.slice(0,35)}))
    })''')
    require(result['direction'] == 'rtl', f'RTL lost: {result}')
    require(result['document'] <= result['viewport']+2, f'Horizontal overflow: {result}')
    return result


async def screenshot(page, name):
    path = SHOTS/(name+'.png')
    await page.screenshot(path=str(path), full_page=True, animations='disabled')
    REPORT['screenshots'].append(str(path))
    return str(path)


async def group(browser, name, fn, auth=True, admin=False, mobile=True):
    started = time.monotonic()
    fixture = Fixtures(authenticated=auth, role='admin' if admin else 'owner')
    context = await browser.new_context(viewport={'width':390 if mobile else 1440, 'height':844 if mobile else 1000},
                                      device_scale_factor=1, is_mobile=mobile, has_touch=mobile,
                                      locale='ar-IQ', service_workers='block')
    await fixture.install(context)
    page = await context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    result = {'name': name, 'status': 'passed'}
    try:
        details = await fn(page, fixture)
        if details is not None: result['details'] = details
        await page.wait_for_timeout(100)
        rejected = await page.evaluate('window.__unhandled || []')
        require(not errors and not rejected, f'JavaScript exceptions: {errors}; rejected: {rejected}')
        require(not fixture.external, f'External requests blocked: {fixture.external}')
        require(not fixture.unhandled, f'Unintercepted requests: {fixture.unhandled}')
    except Exception as error:
        result.update(status='failed', error=str(error), traceback=traceback.format_exc(limit=3))
        try: result['screenshot'] = await screenshot(page, 'FAILED-'+name)
        except Exception: pass
    finally:
        result['seconds'] = round(time.monotonic()-started, 2)
        result['api_calls'] = fixture.calls
        REPORT['external_requests'] += fixture.external
        REPORT['unhandled_requests'] += fixture.unhandled
        REPORT['page_errors'] += errors
        REPORT['groups'].append(result)
        for call in fixture.calls:
            contract = call['method']+' '+call['path']
            if contract not in REPORT['api_contracts']: REPORT['api_contracts'].append(contract)
        save_report()
        print(json.dumps({'group': name, 'status': result['status'], 'seconds': result['seconds'], 'error': result.get('error')}, ensure_ascii=False), flush=True)
        await context.close()


async def dashboard(page, f):
    await ready(page, 'dash')
    await expect(page.locator('.dashboard-intro')).to_contain_text('متجر المعاينة')
    await expect(page.locator('.assistant-banner')).to_contain_text('وضع الاختبار')
    require(await page.locator('.metric-card').count() == 4, 'Metric cards missing')
    await no_overflow(page)
    await screenshot(page, 'iPhone-dashboard')
    await page.locator('.bn [data-k="store"]').click()
    await expect(page.locator('#pg')).to_have_attribute('data-page', 'store')
    await expect(page.locator('.bn [data-k="store"]')).to_have_attribute('aria-current', 'page')
    await settled(page)
    await page.locator('#theme-toggle').click()
    await expect(page.locator('#app')).to_have_attribute('data-theme', 'light')
    await page.locator('#theme-toggle').click()
    await expect(page.locator('#app')).to_have_attribute('data-theme', 'dark')


async def store_save(page, f):
    await ready(page, 'store')
    await page.locator('#f [name="name"]').fill('متجر التجربة المحلية')
    await page.locator('#f [name="description"]').fill('نبذة محلية جديدة')
    await page.locator('#f [name="hours"]').fill('١٠ صباحاً–٥ مساءً')
    await page.locator('#f [name="delivery"]').fill('بغداد فقط 5,000')
    await tap_submit(page, '#f')
    call = await f.wait_call(page, 'PUT', 'store')
    for k,v in {'name':'متجر التجربة المحلية','description':'نبذة محلية جديدة','hours':'١٠ صباحاً–٥ مساءً','delivery':'بغداد فقط 5,000','tone':'ودود ومختصر باللهجة العراقية','ai_enabled':1}.items():
        require(call['body'].get(k)==v, f'Store payload lost {k}: {call}')
    await expect(page.locator('.toast').last).to_contain_text('الحفظ')
    await no_overflow(page)
    await screenshot(page, 'iPhone-store')


async def store_items(page, f):
    await ready(page, 'store')
    for kind,title,price,body in [('product','دفتر المعاينة','12000','وصف منتج محلي'),('faq','متى التوصيل؟','','خلال يومين')]:
        before=len(f.matching('POST','items'))
        await page.locator('#addb').click()
        dialog=page.get_by_role('dialog')
        await expect(dialog).to_be_visible()
        await dialog.locator('[name="kind"]').select_option(kind)
        await dialog.locator('[name="title"]').fill(title)
        await dialog.locator('[name="price"]').fill(price)
        await dialog.locator('[name="body"]').fill(body)
        await tap_submit(page,'#g')
        call=await f.wait_call(page,'POST','items',before)
        require(call['body']=={'kind':kind,'title':title,'price':price,'body':body}, f'Item contract changed: {call}')
        await expect(page.get_by_role('dialog')).to_have_count(0)
        await settled(page)
        await expect(page.locator('#pg')).to_contain_text(title)
    item=f.items[-1]
    await page.locator(f'[onclick*="delItem({item["id"]})"]').click()
    await page.get_by_role('dialog').locator('#n').click()
    await expect(page.get_by_role('dialog')).to_have_count(0)
    require(not f.matching('POST','items/delete'), 'Cancel triggered delete')
    await page.locator(f'[onclick*="delItem({item["id"]})"]').click()
    await page.get_by_role('dialog').locator('#y').click()
    call=await f.wait_call(page,'POST','items/delete')
    require(call['body']=={'id':item['id']}, 'Delete contract changed')
    await expect(page.get_by_role('dialog')).to_have_count(0)


async def sheet_keyboard(page,f):
    await ready(page,'store')
    await page.locator('#addb').click()
    dialog=page.get_by_role('dialog')
    await expect(dialog).to_be_visible()
    await expect(dialog).to_have_attribute('aria-modal','true')
    require(await page.evaluate('document.documentElement.style.overflow')=='hidden','Sheet failed scroll lock')
    inputs=dialog.locator('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')
    await inputs.last.focus()
    await page.keyboard.press('Tab')
    require(await dialog.evaluate('(e)=>e.contains(document.activeElement)'), 'Focus escaped dialog')
    await page.keyboard.press('Escape')
    await expect(dialog).to_have_count(0)
    await expect(page.locator('#addb')).to_be_focused()
    require(await page.evaluate('document.documentElement.style.overflow')!='hidden','Sheet left scroll locked')


async def chat_filters(page,f):
    await ready(page,'chats')
    require(await page.locator('#ls>.card').count()==4,'Missing messages')
    for status,needle in [('sent','حقيبة الكتان'),('escalated','قياس خاص'),('error','الطلب وصل')]:
        await page.locator(f'.chip[data-k="{status}"]').click()
        require(await page.locator('#ls>.card').count()==1, f'{status} filter failed')
        await expect(page.locator('#ls')).to_contain_text(needle)
    await page.locator('.chip[data-k="all"]').click()
    await page.locator('#q').fill('سعر')
    require(await page.locator('#ls>.card').count()==1,'Message search failed')
    await page.locator('#q').fill('لا-توجد-هذه-العبارة')
    require(await page.locator('#ls>.card').count()==0,'No-results failed')
    await page.locator('#q').fill('')
    await no_overflow(page)
    await screenshot(page,'iPhone-conversations')


async def booking_filters(page,f):
    await ready(page,'bookings')
    require(await page.locator('#ls>.card').count()==4,'Missing bookings')
    for status in ('new','confirmed','delivered','cancelled'):
        await page.locator(f'.chip[data-k="{status}"]').click()
        require(await page.locator('#ls>.card').count()==1,f'{status} booking filter failed')
    await page.locator('.chip[data-k="all"]').click()
    for query in ('٠٧٧٠١٢٣٤٥٦٧','حقيبه الكرادة','اربيل'):
        await page.locator('#bq').fill(query)
        require(await page.locator('#ls>.card').count()==1,f'Arabic booking search failed: {query}')
    await page.locator('#bq').fill('')
    await expect(page.locator('a[href="tel:07701234567"]')).to_have_attribute('dir','ltr')
    await no_overflow(page)
    await screenshot(page,'iPhone-bookings')


async def booking_actions(page,f):
    await ready(page,'bookings')
    await page.locator('[onchange*="bkSet(501,"]').select_option('confirmed')
    call=await f.wait_call(page,'POST','bookings/status')
    require(call['body']=={'id':501,'status':'confirmed'}, 'Status payload changed')
    await settled(page)
    await expect(page.locator('.toast').last).to_contain_text('أُرسلت')
    await page.locator('[onclick*="bkBlock(501)"]').click()
    await page.get_by_role('dialog').locator('#y').click()
    call=await f.wait_call(page,'POST','blocked/add')
    require(call['body']=={'booking_id':501}, 'Block payload changed')
    await expect(page.get_by_role('dialog')).to_have_count(0)
    await ready(page,'blocked')
    await page.locator('button[data-sender="local-a"]').click()
    call=await f.wait_call(page,'POST','blocked/remove')
    require(call['body']=={'sender':'local-a'}, 'Unblock payload changed')
    await ready(page,'bookings')
    await page.locator('[onclick*="bkDel(503)"]').click()
    await page.get_by_role('dialog').locator('#y').click()
    call=await f.wait_call(page,'POST','bookings/delete')
    require(call['body']=={'id':503}, 'Booking delete payload changed')
    await expect(page.get_by_role('dialog')).to_have_count(0)


async def booking_notify(page,f):
    details=[]
    for notify,needle in [('failed','تعذّر'),('no_ig','غير مربوط')]:
        f.notify=notify
        f.bookings[0].update(status='new',notified=0)
        await ready(page,'bookings')
        count=len(f.matching('POST','bookings/status'))
        await page.locator('[onchange*="bkSet(501,"]').select_option('confirmed')
        await f.wait_call(page,'POST','bookings/status',count)
        await expect(page.locator('.toast').last).to_contain_text(needle)
        details.append(notify)
    return details


async def ai_settings(page,f):
    await ready(page,'ai')
    await page.locator('#tone').fill('مختصر ومهذب للاختبار')
    await page.locator('#sv').click()
    call=await f.wait_call(page,'PUT','store')
    require(call['body']['tone']=='مختصر ومهذب للاختبار' and call['body']['name']=='متجر المعاينة' and call['body']['ai_enabled']==1,'Tone save lost store fields')
    await expect(page.locator('.toast').last).to_contain_text('الحفظ')
    toggle=page.locator('#pg button.sw').first
    before=len(f.matching('PUT','store'))
    await toggle.click()
    call=await f.wait_call(page,'PUT','store',before)
    require(call['body']['ai_enabled'] in (False,0),'AI toggle failed')
    await settled(page)
    await no_overflow(page)
    await screenshot(page,'iPhone-ai')


async def settings_plan_ig(page,f):
    await ready(page,'more')
    await expect(page.locator('#pg')).to_contain_text(FAKE_EMAIL)
    await expect(page.locator('#pg')).to_contain_text('iOS')
    await screenshot(page,'iPhone-settings')
    for route in ('plan','ig','blocked'):
        await ready(page,'more')
        await page.locator(f'#pg a[href="#/{route}"]').click()
        await expect(page.locator('#pg')).to_have_attribute('data-page',route)
        await settled(page)
        await no_overflow(page)
    await expect(page.locator('#pg')).to_contain_text('حظر يدوي')
    f.me['plan']['monthly_limit']=0;f.me['used']=0
    await page.reload(wait_until='domcontentloaded')
    await ready(page,'plan')
    require(not await page.locator('#pg').evaluate('(e)=>/NaN|Infinity/.test(e.innerHTML)'), 'Zero-limit renders invalid usage')
    require(await page.locator('#pg a[href*="checkout"],#pg button[onclick*="checkout"]').count()==0, 'Invented checkout control')
    await screenshot(page,'iPhone-plan-zero-limit')
    await ready(page,'ig')
    await expect(page.locator('#pg')).to_contain_text('غير مفعّل في الاختبار المحلي')
    f.configured=True
    await page.reload(wait_until='domcontentloaded')
    await ready(page,'ig')
    await expect(page.locator('#pg a[href="/instagram-connect.html"]')).to_be_visible()


async def admin(page,f):
    await ready(page,'admin')
    await expect(page.locator('#pg')).to_contain_text(FAKE_EMAIL)
    await page.locator('#lstarter').fill('650')
    await page.locator('#pstarter').fill('17,000 د.ع')
    await page.locator('[data-plan-save]').first.click()
    call=await f.wait_call(page,'POST','admin/plan')
    require(call['body']=={'id':'starter','monthly_limit':'650','price':'17,000 د.ع'}, f'Admin plan contract changed: {call}')
    select=page.locator('.admin-user select[data-user-id]')
    await select.select_option('pro')
    call=await f.wait_call(page,'POST','admin/user-plan')
    require(call['body']=={'id':1,'plan':'pro'},'Admin user-plan contract changed')
    await no_overflow(page)
    await screenshot(page,'desktop-admin')


async def admin_errors(page,f):
    await ready(page,'admin')
    f.failures[('POST','admin/plan')]=(500,{'error':'تعذّر حفظ الباقة التجريبي'})
    await page.locator('[data-plan-save]').first.click()
    await f.wait_call(page,'POST','admin/plan')
    await expect(page.locator('.toast').last).to_contain_text('تعذّر حفظ الباقة')
    require(not await page.locator('[data-plan-save]').first.is_disabled(),'Admin save remains disabled after error')
    f.failures[('POST','admin/user-plan')]=(500,{'error':'تعذّر تغيير الباقة التجريبي'})
    select=page.locator('.admin-user select[data-user-id]')
    await select.select_option('pro')
    await f.wait_call(page,'POST','admin/user-plan')
    await expect(page.locator('.toast').last).to_contain_text('تعذّر تغيير الباقة')
    await expect(select).to_have_value('starter')
    require(not await select.is_disabled(),'Admin select remains disabled after error')


async def form_busy_errors(page,f):
    f.delays[('PUT','store')]=.4
    f.failures[('PUT','store')]=(500,{'error':'تعذّر الحفظ التجريبي'})
    await ready(page,'store')
    await page.locator('#f [name="description"]').fill('قيمة يجب أن تبقى بعد الخطأ')
    await page.locator('#f').evaluate('(f)=>{f.requestSubmit();f.requestSubmit()}')
    await expect(page.locator('#f button')).to_be_disabled()
    await expect(page.locator('.toast').last).to_contain_text('تعذّر الحفظ التجريبي')
    require(len(f.matching('PUT','store'))==1,'Duplicate store save request')
    await expect(page.locator('#f button')).to_be_enabled()
    await expect(page.locator('#f [name="description"]')).to_have_value('قيمة يجب أن تبقى بعد الخطأ')
    f.delays[('POST','items')]=.4
    f.failures[('POST','items')]=(500,{'error':'تعذّر إضافة المحتوى التجريبي'})
    await page.locator('#addb').click()
    await page.locator('#g [name="title"]').fill('منتج محفوظ في النموذج')
    await page.locator('#g').evaluate('(f)=>{f.requestSubmit();f.requestSubmit()}')
    await expect(page.locator('#g button')).to_be_disabled()
    await expect(page.locator('.toast').last).to_contain_text('تعذّر إضافة المحتوى')
    require(len(f.matching('POST','items'))==1,'Duplicate item add request')
    await expect(page.locator('#g [name="title"]')).to_have_value('منتج محفوظ في النموذج')
    await expect(page.locator('#g button')).to_be_enabled()
    await screenshot(page,'iPhone-sheet-error-preserved')


async def error_retry_loading(page,f):
    f.failures[('GET','items')]=(500,{'error':'تعذّر تجريبي في تحميل المحتوى'})
    await ready(page,'store')
    await expect(page.locator('.workspace-error')).to_contain_text('تعذّر تجريبي')
    await screenshot(page,'iPhone-error-state')
    del f.failures[('GET','items')]
    f.delays[('GET','items')]=.6
    await page.locator('.workspace-error button').click()
    await expect(page.locator('#pg')).to_have_attribute('aria-busy','true')
    require(await page.locator('.workspace-loading').count()==1,'Loading skeleton missing')
    await settled(page)
    await expect(page.locator('#f')).to_be_visible()


async def empty_pages(page,f):
    f.items=[];f.messages=[];f.bookings=[];f.blocked=[]
    for route in ('dash','chats','store','bookings','blocked'):
        await ready(page,route)
        require(await page.locator('#pg .emp,#pg .dashboard-empty,#pg .screen-empty').count()>0,f'No empty state on {route}')
        await no_overflow(page)
    await screenshot(page,'iPhone-empty-blocked')


async def responsive(page,f):
    checks=[]
    for width,height in [(320,740),(375,812),(390,844),(844,390),(1440,1000)]:
        await page.set_viewport_size({'width':width,'height':height})
        for route in ('dash','store','chats','bookings','ai','more','plan','ig','blocked'):
            await ready(page,route)
            result=await no_overflow(page)
            checks.append(f'{width}x{height}:{route}')
        if width==390:
            await page.locator('#theme-toggle').click()
            await expect(page.locator('#app')).to_have_attribute('data-theme','light')
            for route in ('store','chats','bookings','ai','more','plan'):
                await ready(page,route)
                await no_overflow(page)
                checks.append(f'{width}x{height}:{route}:light')
            await screenshot(page,'iPhone-plan-light')
            await page.locator('#theme-toggle').click()
            await expect(page.locator('#app')).to_have_attribute('data-theme','dark')
        if width==1440:
            for route in ('store','chats','bookings','ai'):
                await ready(page,route)
                await screenshot(page,'desktop-'+route)
    return checks


async def login(page,f):
    await page.goto(BASE+'/#/login',wait_until='domcontentloaded')
    await expect(page.locator('#af')).to_be_visible()
    await tap_submit(page,'#af')
    require(not f.matching('POST','login'),'Empty login sent to API')
    await page.locator('[name="email"]').fill(FAKE_EMAIL)
    await page.locator('[name="password"]').fill('wrong-fixture-password')
    await tap_submit(page,'#af')
    await f.wait_call(page,'POST','login')
    await expect(page.locator('#er')).to_contain_text('غير صحيحة')
    require(not await page.locator('#af button.pb').is_disabled(),'Login button stuck after error')
    await page.locator('[name="password"]').fill(FAKE_PASSWORD)
    await page.locator('.eye').click()
    await expect(page.locator('[name="password"]')).to_have_attribute('type','text')
    await page.locator('.eye').click()
    await page.locator('[name="remember"]').evaluate('(e)=>{e.checked=false;e.dispatchEvent(new Event("change",{bubbles:true}))}')
    count=len(f.matching('POST','login'))
    await tap_submit(page,'#af')
    call=await f.wait_call(page,'POST','login',count)
    require(call['body']=={'email':FAKE_EMAIL,'password':FAKE_PASSWORD,'remember':False},'Login payload changed')
    await expect(page.locator('#pg')).to_have_attribute('data-page','dash')
    await settled(page)


async def register(page,f):
    await page.goto(BASE+'/#/register',wait_until='domcontentloaded')
    await expect(page.locator('#af [name="store_name"]')).to_be_visible()
    data={'store_name':'متجر تسجيل تجريبي','email':FAKE_EMAIL,'password':FAKE_PASSWORD}
    for key,value in data.items(): await page.locator(f'#af [name="{key}"]').fill(value)
    await tap_submit(page,'#af')
    call=await f.wait_call(page,'POST','register/start')
    require(call['body']==data,'Register-start payload changed')
    await expect(page.locator('[name="code"]')).to_be_visible()
    await page.locator('#rs').click()
    call=await f.wait_call(page,'POST','register/start',1)
    require(call['body']==data,'Resend payload changed')
    await page.locator('[name="code"]').fill('000000')
    await tap_submit(page,'#af')
    await f.wait_call(page,'POST','register/verify')
    await expect(page.locator('#er')).to_contain_text('الرمز غير صحيح')
    await page.locator('[name="code"]').fill('123456')
    await tap_submit(page,'#af')
    call=await f.wait_call(page,'POST','register/verify',1)
    require(call['body']=={'email':FAKE_EMAIL,'code':'123456'},'Register verify contract changed')
    await expect(page.locator('#pg')).to_have_attribute('data-page','dash')
    await settled(page)


async def reset(page,f):
    await page.goto(BASE+'/#/login',wait_until='domcontentloaded')
    await page.locator('#fgl').click()
    await page.locator('[name="email"]').fill(FAKE_EMAIL)
    await tap_submit(page,'#af')
    call=await f.wait_call(page,'POST','reset/start')
    require(call['body']=={'email':FAKE_EMAIL},'Reset-start contract changed')
    await expect(page.locator('.toast').last).to_contain_text('إن كان البريد مسجلاً')
    await expect(page.locator('[name="code"]')).to_be_visible()
    await page.locator('[name="code"]').fill('123456')
    await page.locator('[name="password"]').fill(FAKE_PASSWORD)
    await tap_submit(page,'#af')
    call=await f.wait_call(page,'POST','reset/verify')
    require(call['body']=={'email':FAKE_EMAIL,'code':'123456','password':FAKE_PASSWORD},'Reset verify contract changed')
    await expect(page.locator('[name="email"]')).to_be_visible()
    require(not f.authenticated,'Reset incorrectly logged user in')


async def auth_responsive(page,f):
    for width,height in [(320,740),(390,844),(1440,1000)]:
        await page.set_viewport_size({'width':width,'height':height})
        for route in ('login','register'):
            await page.goto(BASE+'/#/'+route,wait_until='domcontentloaded')
            await expect(page.locator('#af')).to_be_visible()
            await no_overflow(page)
            await screenshot(page,('iPhone' if width==390 else str(width))+'-'+route)
    # Verify hash-only navigation changes the actual form as well as global mode.
    await page.evaluate("location.hash='#/login'")
    await expect(page.locator('#af [name="password"]')).to_be_visible()
    await expect(page.locator('#af [name="store_name"]')).to_have_count(0)
    await page.evaluate("location.hash='#/register'")
    await expect(page.locator('#af [name="store_name"]')).to_be_visible()


async def push_local_contracts(page,f):
    # Browser facilities below are deliberately mocked. No OS permission prompt,
    # push subscription, service worker, or third-party push service is invoked.
    await page.add_init_script('''
      window.__fixturePush = {enabled:false, requests:0, permission:'default'};
      window.PushManager = class {};
      window.Notification = class {
        static get permission(){return __fixturePush.permission}
        static async requestPermission(){__fixturePush.requests++;return (__fixturePush.permission='granted')}
      };
      const subscription={
        endpoint:'http://127.0.0.1:8871/fixture-push-only',
        toJSON(){return {endpoint:this.endpoint,expirationTime:null,keys:{p256dh:'FAKE_LOCAL_KEY',auth:'FAKE_LOCAL_AUTH'}}},
        async unsubscribe(){__fixturePush.enabled=false;return true}
      };
      const registration={pushManager:{
        async getSubscription(){return __fixturePush.enabled?subscription:null},
        async subscribe(){__fixturePush.enabled=true;return subscription}
      }};
      Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{
        async getRegistration(){return registration},async register(){return registration},ready:Promise.resolve(registration)
      }});
    ''')
    await ready(page,'more')
    require(await page.evaluate('__fixturePush.requests')==0,'Push permission requested without click')
    await page.locator('button[onclick*="pushTgl"]').click()
    call=await f.wait_call(page,'POST','push/subscribe')
    require(set(call['body'])=={'endpoint','expirationTime','keys'},'Push subscribe fields changed')
    require(await page.evaluate('__fixturePush.requests')==1,'Push request not initiated by user click')
    await settled(page)
    await expect(page.locator('button[onclick*="pushTgl"]')).to_have_attribute('aria-checked','true')
    await page.locator('button[onclick*="pushTest"]').click()
    await f.wait_call(page,'POST','push/test')
    await expect(page.locator('.toast').last).to_contain_text('أُرسل')
    await page.locator('button[onclick*="pushTgl"]').click()
    call=await f.wait_call(page,'POST','push/unsubscribe')
    require(call['body']=={'endpoint':BASE+'/fixture-push-only'},'Push unsubscribe contract changed')
    await settled(page)
    await expect(page.locator('button[onclick*="pushTgl"]')).to_have_attribute('aria-checked','false')
    return 'Browser push facilities mocked; real iOS delivery requires separate device test.'


GROUPS=[
 ('dashboard_navigation_theme',dashboard,{}),('store_save_contract',store_save,{}),
 ('items_create_faq_product_delete',store_items,{}),('sheet_keyboard_focus',sheet_keyboard,{}),
 ('messages_filters_search',chat_filters,{}),('bookings_filters_arabic_search',booking_filters,{}),
 ('bookings_status_block_delete',booking_actions,{}),('bookings_notification_outcomes',booking_notify,{}),
 ('ai_tone_toggle',ai_settings,{}),('settings_plan_ig_navigation',settings_plan_ig,{}),
 ('admin_plan_user_contracts',admin,{'admin':True,'mobile':False}),
 ('admin_error_recovery',admin_errors,{'admin':True,'mobile':False}),
 ('form_busy_error_recovery',form_busy_errors,{}),
 ('loading_error_retry',error_retry_loading,{}),('empty_states',empty_pages,{}),
 ('responsive_rtl_all_pages',responsive,{}),('login_validation_error_success',login,{'auth':False}),
 ('registration_verify_resend',register,{'auth':False}),('password_reset_contracts',reset,{'auth':False}),
 ('auth_responsive_hash_navigation',auth_responsive,{'auth':False}),
 ('push_mocked_subscribe_test_unsubscribe',push_local_contracts,{}),
]


async def run(args):
    async with async_playwright() as pw:
        browser=await pw.chromium.launch(executable_path=os.environ.get('INBOX_CHROMIUM') or shutil.which('chromium'),headless=True,
           args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking'])
        for name,fn,options in GROUPS:
            if args.only and not any(part in name for part in args.only.split(',')): continue
            await group(browser,name,fn,**options)
        await browser.close()
    save_report()
    print(json.dumps({'passed':REPORT['passed'],'failed':REPORT['failed'],'report':str(OUT/'merchant-report.json')},ensure_ascii=False),flush=True)
    return REPORT['failed']


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--only',default='')
    raise SystemExit(asyncio.run(run(parser.parse_args())))
