"""Local browser integration against scripts/preview-smart-inbox.mjs.
No API fixtures are injected into the page. The real Worker and SQLite serve it.
The preview's provider double is explicitly local and is never bundled in src/.
Run with INBOX_PREVIEW_INFO=/path/preview.json or INBOX_PREVIEW_ORIGIN=http://127...
"""
import asyncio,json,os,time,tempfile,shutil
from pathlib import Path
from playwright.async_api import async_playwright,expect

OUT=Path(os.environ.get('INBOX_QA_OUTPUT',str(Path(tempfile.gettempdir())/'instapilot-smart-inbox-qa')))
OUT.mkdir(parents=True,exist_ok=True)
INFO=Path(os.environ.get('INBOX_PREVIEW_INFO',str(OUT/'preview.json')))
BASE=os.environ.get('INBOX_PREVIEW_ORIGIN') or json.loads(INFO.read_text())['origin']
REPORT={'groups':[],'page_errors':[],'console_errors':[],'external_requests':[],'environment':'Chromium + real local Worker/SQLite + local Meta double. Not physical Safari or real Meta.'}

async def main():
    async with async_playwright() as p:
        browser=await p.chromium.launch(executable_path=os.environ.get('INBOX_CHROMIUM') or shutil.which('chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking'])
        ctx=await browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,locale='ar-IQ',service_workers='block',user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')
        async def network(route):
            if not route.request.url.startswith(BASE+'/'):
                REPORT['external_requests'].append(route.request.url.split('?')[0]);await route.abort()
            else:await route.continue_()
        await ctx.route('**/*',network)
        page=await ctx.new_page()
        page.on('pageerror',lambda e:REPORT['page_errors'].append(str(e)))
        page.on('console',lambda m:REPORT['console_errors'].append(m.text) if m.type=='error' else None)
        page.on('response',lambda r:REPORT.setdefault('http_errors',[]).append({'path':r.url.split('?')[0],'status':r.status}) if r.status>=400 else None)
        async def local(path,body=None):
            r=await ctx.request.post(BASE+'/__local/'+path,data=body or {})
            assert r.ok,(path,r.status)
            return await r.json()
        async def stats():return await (await ctx.request.get(BASE+'/__local/stats')).json()
        async def group(name,fn):
            start=time.monotonic()
            try:await fn();result={'name':name,'status':'passed'}
            except Exception as e:
                result={'name':name,'status':'failed','error':str(e)}
                await page.screenshot(path=str(OUT/('FAILED-'+name+'.png')),full_page=True)
            result['seconds']=round(time.monotonic()-start,2);REPORT['groups'].append(result)
            (OUT/'ui-report.json').write_text(json.dumps(REPORT,ensure_ascii=False,indent=2))
            print(json.dumps(result,ensure_ascii=False),flush=True)

        async def loaded():
            await page.goto(BASE+'/__local/start',wait_until='domcontentloaded')
            await expect(page.locator('#pg')).to_have_attribute('data-page','inbox')
            await expect(page.locator('[data-conversation]')).to_have_count(4)
            await expect(page.locator('#si-live')).to_have_text('محدّث الآن')
            assert await page.evaluate("document.cookie.includes('sid=')")==False
            await page.screenshot(path=str(OUT/'iPhone-inbox-list.png'),full_page=True)
        await group('iphone_real_backend_load',loaded)

        async def search():
            await page.locator('[data-filter=waiting]').click()
            await expect(page.locator('[data-conversation]')).to_have_count(2)
            await page.locator('[data-filter=all]').click()
            await page.locator('#si-search').fill('نور')
            await expect(page.locator('[data-conversation]')).to_have_count(1)
            await expect(page.locator('[data-conversation]')).to_contain_text('نور')
        await group('filters_and_search',search)

        async def send():
            await page.locator('[data-conversation]').click()
            await expect(page.locator('#si-takeover')).to_be_visible()
            await page.locator('#si-takeover').click()
            await expect(page.locator('#si-reply')).to_be_enabled()
            await page.locator('#si-reply').fill('رد اختبار بشري من صندوق الوارد')
            await page.locator('#si-send').click()
            await expect(page.locator('#si-reply')).to_have_value('')
            await expect(page.locator('.si-message').filter(has_text='رد اختبار بشري من صندوق الوارد')).to_have_count(1)
            await expect(page.locator('.si-message').filter(has_text='رد اختبار بشري من صندوق الوارد')).to_contain_text('أُرسلت إلى إنستغرام')
            s=await stats();assert len([x for x in s['sends'] if x['text']=='رد اختبار بشري من صندوق الوارد'])==1
            await page.screenshot(path=str(OUT/'iPhone-inbox-thread.png'),full_page=True)
        await group('human_takeover_and_confirmed_send',send)

        async def polling():
            s=await stats();before=len(s['sends'])
            await local('message',{'customer':'80002','text':'هذه رسالة وصلت أثناء فتح الصندوق','mid':'ui-live-message'})
            await expect(page.locator('.si-message').filter(has_text='هذه رسالة وصلت أثناء فتح الصندوق')).to_have_count(1,timeout=10000)
            assert len((await stats())['sends'])==before
        await group('live_polling_and_ai_stopped',polling)

        async def resume():
            before=(await stats())['ai_calls']
            await page.locator('#si-resume').click()
            await expect(page.locator('#si-takeover')).to_be_visible()
            await local('message',{'customer':'80002','text':'ممكن تكمل وياي؟','mid':'ui-ai-resumed'})
            await expect(page.locator('.si-message').filter(has_text='ممكن تكمل وياي؟')).to_have_count(1,timeout=10000)
            assert (await stats())['ai_calls']==before+1
            await page.locator('#si-back').click()
            await page.locator('#si-search').fill('')
            await page.locator('[data-filter=all]').click()
        await group('resume_ai_uses_backend',resume)

        async def notification():
            await local('message',{'customer':'80009','text':'أريد أحچي ويا صاحب البيج','mid':'ui-handoff-new'})
            await expect(page.locator('#si-total')).to_have_text('5',timeout=10000)
            await expect(page.locator('.si-notification-link [data-smart-waiting]')).to_have_text('3',timeout=20000)
            await page.locator('[data-filter=waiting]').click()
            await expect(page.locator('[data-conversation]')).to_have_count(3)
            r=await ctx.request.get(BASE+'/api/inbox/conversations')
            c=next(x for x in (await r.json())['conversations'] if x['customer_id']=='80009')
            await page.locator(f'[data-conversation="{c["id"]}"]').click()
        await group('new_handoff_notification_and_counter',notification)

        async def close_reopen():
            await page.locator('#si-close').click()
            await expect(page.locator('#si-close')).to_have_text('إعادة فتح المحادثة')
            await expect(page.locator('#si-reply')).to_be_disabled()
            await page.locator('#si-close').click()
            await expect(page.locator('#si-close')).to_have_text('إغلاق المحادثة')
            await expect(page.locator('#si-reply')).to_be_enabled()
        await group('close_and_reopen',close_reopen)

        async def expired():
            await local('provider',{'mode':'expired'})
            await page.locator('#si-reply').fill('اختبار رمز منتهي')
            await page.locator('#si-send').click()
            row=page.locator('.si-message').filter(has_text='اختبار رمز منتهي')
            await expect(row).to_contain_text('فشل الإرسال')
            await expect(row).to_contain_text('انتهت صلاحية')
            assert await row.locator('[data-retry]').count()==0
            await local('provider',{'mode':'ok'})
        await group('expired_token_honest_failure',expired)

        async def unknown():
            await local('provider',{'mode':'network'})
            await page.locator('#si-reply').fill('اختبار إرسال غير محسوم')
            await page.locator('#si-send').click()
            row=page.locator('.si-message').filter(has_text='اختبار إرسال غير محسوم')
            await expect(row).to_contain_text('الإرسال غير محسوم')
            await expect(page.locator('#si-reply')).to_be_disabled()
            await expect(page.locator('#si-resume')).to_be_disabled()
            await page.wait_for_timeout(4500)
            assert len([x for x in (await stats())['sends'] if x['text']=='اختبار إرسال غير محسوم'])==1
            assert await row.locator('[data-retry]').count()==0
        await group('unknown_delivery_is_never_auto_retried',unknown)

        async def desktop():
            await local('reset')
            await page.set_viewport_size({'width':1440,'height':1000})
            await page.goto(BASE+'/#/inbox')
            await page.reload(wait_until='domcontentloaded')
            await expect(page.locator('[data-conversation]')).to_have_count(4)
            await page.locator('[data-conversation]').first.click()
            await expect(page.locator('#si-person')).to_contain_text('زبون')
            await page.screenshot(path=str(OUT/'Desktop-inbox.png'),full_page=True)
        await group('desktop_split_inbox',desktop)

        async def responsive():
            for width,height in [(320,740),(390,844),(844,390),(1440,1000)]:
                await page.set_viewport_size({'width':width,'height':height})
                await page.wait_for_timeout(150)
                dims=await page.evaluate("()=>({width:innerWidth,doc:document.documentElement.scrollWidth,rtl:getComputedStyle(document.documentElement).direction})")
                assert dims['doc']<=dims['width']+2,dims
                assert dims['rtl']=='rtl',dims
            await page.emulate_media(reduced_motion='reduce')
            await expect(page.locator('#si')).to_be_visible()
        await group('rtl_responsive_reduced_motion',responsive)

        async def pagination():
            await page.set_viewport_size({'width':1440,'height':1000})
            for n in range(60):await local('message',{'customer':'80001','text':'رسالة ترقيم اختبار '+str(n),'mid':'ui-page-'+str(n)})
            r=await ctx.request.get(BASE+'/api/inbox/conversations')
            target=next(c for c in (await r.json())['conversations'] if c['customer_id']=='80001')
            await page.locator('[data-conversation="'+str(target['id'])+'"]').click()
            await expect(page.locator('#si-older')).to_be_visible(timeout=10000)
            await page.locator('#si-older').click()
            await expect(page.locator('.si-message').filter(has_text='رسالة ترقيم اختبار')).to_have_count(60)
            await expect(page.locator('#si-older')).to_have_count(0)
            await page.wait_for_timeout(4500)
            await expect(page.locator('#si-older')).to_have_count(0)
            assert await page.locator('[data-message]').count()==len(set(await page.locator('[data-message]').evaluate_all('(els)=>els.map(e=>e.dataset.message)')))
        await group('complete_pagination_dedup_and_poll',pagination)

        REPORT['passed']=sum(g['status']=='passed' for g in REPORT['groups'])
        REPORT['failed']=len(REPORT['groups'])-REPORT['passed']
        REPORT['failed']+=bool(REPORT['page_errors'] or REPORT['console_errors'] or REPORT['external_requests'])
        (OUT/'ui-report.json').write_text(json.dumps(REPORT,ensure_ascii=False,indent=2))
        print(json.dumps({k:REPORT[k] for k in ['passed','failed','page_errors','console_errors','external_requests']},ensure_ascii=False),flush=True)
        await browser.close()
        return REPORT['failed']
if __name__=='__main__':raise SystemExit(asyncio.run(main()))
