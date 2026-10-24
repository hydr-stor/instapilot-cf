"""Offline-only frontend fixtures. Never starts the Worker or accesses any database.

All browser requests are intercepted: static files come from public/, /api/* is
served here, and any foreign origin or unhandled API fails closed.
"""
import asyncio
import copy
import json
import mimetypes
from pathlib import Path
from urllib.parse import unquote, urlparse

PUBLIC = (Path(__file__).resolve().parents[2]/'public').resolve()
BASE = 'http://127.0.0.1:8871'
FAKE_EMAIL = 'merchant@fixture.invalid'
FAKE_PASSWORD = 'Only-A-Local-Fixture-2026'


class Fixtures:
    def __init__(self, authenticated=True, role='owner'):
        self.authenticated = authenticated
        self.calls = []
        self.assets = []
        self.external = []
        self.unhandled = []
        self.failures = {}
        self.delays = {}
        self.notify = 'sent'
        self.configured = False
        self.me = {
            'email': FAKE_EMAIL, 'role': role, 'used': 37, 'live': False,
            'plan': {'id': 'starter', 'name': 'البداية', 'monthly_limit': 500, 'price': '15,000 د.ع'},
            'store': {'id': 1, 'user_id': 1, 'name': 'متجر المعاينة',
                      'description': 'بيانات اختبار محلية فقط — مستلزمات المنزل',
                      'hours': 'السبت إلى الخميس ٩–٦', 'delivery': 'بغداد 5,000 د.ع',
                      'tone': 'ودود ومختصر باللهجة العراقية', 'ai_enabled': 1,
                      'ig_connected': False, 'ig_user_id': None},
        }
        self.items = [
            {'id': 101, 'store_id': 1, 'kind': 'product', 'title': 'حقيبة الكتان', 'price': '25000', 'body': 'حقيبة قماش بيج للاختبار'},
            {'id': 102, 'store_id': 1, 'kind': 'faq', 'title': 'هل يوجد توصيل؟', 'price': '', 'body': 'التوصيل إلى بغداد خلال يومين'},
        ]
        self.messages = [
            {'id': 204, 'store_id': 1, 'mid': 'fixture-204', 'sender': 'local-a', 'text': 'شكد سعر حقيبة الكتان؟', 'reply': 'سعرها 25,000 دينار', 'status': 'sent', 'error': None, 'created': '2026-10-22 12:30:00'},
            {'id': 203, 'store_id': 1, 'mid': 'fixture-203', 'sender': 'local-b', 'text': 'أريد قياس خاص', 'reply': None, 'status': 'escalated', 'error': None, 'created': '2026-10-22 12:25:00'},
            {'id': 202, 'store_id': 1, 'mid': 'fixture-202', 'sender': 'local-c', 'text': 'هل الطلب وصل؟', 'reply': None, 'status': 'error', 'error': 'خطأ تجريبي في الإرسال', 'created': '2026-10-22 12:20:00'},
            {'id': 201, 'store_id': 1, 'mid': 'fixture-201', 'sender': 'local-d', 'text': 'مرحبا بمتجر المعاينة', 'reply': 'أهلاً بك', 'status': 'simulated', 'error': None, 'created': '2026-10-22 12:15:00'},
        ]
        self.bookings = [
            self.booking(501, 'new', 'local-a', '07701234567', 'بغداد الكرادة', 'حقيبة الكتان'),
            self.booking(502, 'confirmed', 'local-b', '07809876543', 'أربيل عينكاوة', 'مصباح الطاولة', notified=1),
            self.booking(503, 'delivered', 'local-c', '07501234567', 'الموصل', 'وسادة القطن'),
            self.booking(504, 'cancelled', 'local-d', '07900001111', 'البصرة', 'سلة القش', by_customer=1),
        ]
        self.blocked = [{'sender': 'local-d', 'reason': 'حظر يدوي', 'created': '2026-10-22 13:00:00', 'phone': '07900001111'}]
        self.plans = [copy.deepcopy(self.me['plan']), {'id': 'free', 'name': 'المجانية', 'monthly_limit': 50, 'price': '0'}, {'id': 'pro', 'name': 'النمو', 'monthly_limit': 3000, 'price': '40,000 د.ع'}]
        self.users = [{'id': 1, 'email': FAKE_EMAIL, 'plan': 'starter', 'created': '2026-10-01', 'store': 'متجر المعاينة', 'msgs': 4}]

    @staticmethod
    def booking(id, status, sender, phone, address, name, **extra):
        return dict(id=id, store_id=1, mid=f'fixture-{id}', sender=sender,
                    address=address, phone=phone,
                    items=json.dumps([{'id': 101, 'name': name, 'qty': 2, 'price': 25000}], ensure_ascii=False),
                    subtotal=50000, delivery=5000, total=55000, status=status,
                    notified=extra.get('notified', 0), by_customer=extra.get('by_customer', 0),
                    created='2026-10-22 10:15:00')

    def matching(self, method, path):
        return [c for c in self.calls if c['method'] == method and c['path'] == path]

    async def wait_call(self, page, method, path, after=0):
        for _ in range(160):
            found = self.matching(method, path)
            if len(found) > after:
                return found[-1]
            await page.wait_for_timeout(25)
        raise AssertionError(f'No intercepted {method} {path} after call {after}')

    async def install(self, context, calm=True, no_webgl=True):
        await context.route('**/*', self.handle)
        await context.add_init_script('''
          window.__fixtureOnly = true;
          window.__unhandled = [];
          addEventListener('unhandledrejection', e => window.__unhandled.push(String(e.reason)));
          try { delete window.PushManager; } catch {}
        ''' + ("localStorage.setItem('calm','1');" if calm else '') + ('''
          const original = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function(kind, ...args) {
            if (/webgl/i.test(kind)) return null;
            return original.call(this, kind, ...args);
          };
        ''' if no_webgl else ''))

    async def handle(self, route):
        req = route.request
        url = urlparse(req.url)
        if f'{url.scheme}://{url.netloc}' != BASE:
            self.external.append(req.url)
            await route.abort('blockedbyclient')
            return
        path = unquote(url.path)
        self.assets.append(path)
        if path.startswith('/api/'):
            payload = None
            if req.post_data:
                try: payload = json.loads(req.post_data)
                except Exception: payload = {'_invalid_json': req.post_data}
            call = {'method': req.method, 'path': path[5:], 'body': payload}
            self.calls.append(call)
            key = (req.method, path[5:])
            if self.delays.get(key): await asyncio.sleep(self.delays[key])
            if self.failures.get(key):
                status, value = self.failures[key]
            else:
                status, value = self.respond(req.method, path[5:], payload or {})
            await route.fulfill(status=status, content_type='application/json', body=json.dumps(value, ensure_ascii=False))
            return
        local = (PUBLIC / (path.lstrip('/') or 'index.html')).resolve()
        if not local.is_relative_to(PUBLIC):
            self.unhandled.append(f'Unsafe static path: {path}')
            await route.fulfill(status=403, body='Forbidden')
            return
        if not local.is_file():
            self.unhandled.append(f'Missing static asset: {path}')
            await route.fulfill(status=404, body='Not found')
            return
        await route.fulfill(status=200, content_type=mimetypes.guess_type(str(local))[0] or 'application/octet-stream', body=local.read_bytes())

    def respond(self, method, path, body):
        key = (method, path)
        if key == ('GET', 'me'):
            return (200, copy.deepcopy(self.me)) if self.authenticated else (401, {'error': 'Fixture: unauthenticated'})
        if key == ('POST', 'login'):
            if body.get('email') != FAKE_EMAIL or body.get('password') != FAKE_PASSWORD:
                return 401, {'error': 'البريد أو كلمة المرور غير صحيحة'}
            self.authenticated = True
            return 200, {'ok': 1, 'token': 'LOCAL_FIXTURE_NOT_A_CREDENTIAL'}
        if key == ('POST', 'logout'):
            self.authenticated = False
            return 200, {'ok': 1}
        if key in [('POST', 'register/start'), ('POST', 'reset/start'), ('POST', 'reset/verify')]:
            if path.endswith('/verify') and body.get('code') != '123456': return 400, {'error': 'الرمز غير صحيح'}
            return 200, {'ok': 1}
        if key == ('POST', 'register/verify'):
            if body.get('code') != '123456': return 400, {'error': 'الرمز غير صحيح'}
            self.authenticated = True
            return 200, {'ok': 1, 'token': 'LOCAL_FIXTURE_NOT_A_CREDENTIAL'}
        if not self.authenticated:
            return 401, {'error': 'Fixture: unauthenticated'}
        if key == ('PUT', 'store'):
            self.me['store'].update(body)
            return 200, {'ok': 1}
        if key == ('GET', 'items'): return 200, copy.deepcopy(self.items)
        if key == ('POST', 'items'):
            if body.get('kind') not in ('product', 'faq') or not body.get('title'):
                return 400, {'error': 'بيانات غير صحيحة'}
            self.items.append(dict(id=max([x['id'] for x in self.items] + [100])+1, store_id=1, **body))
            return 200, {'ok': 1}
        if key == ('POST', 'items/delete'):
            self.items[:] = [i for i in self.items if i['id'] != int(body['id'])]
            return 200, {'ok': 1}
        if key == ('GET', 'messages'): return 200, copy.deepcopy(self.messages)
        if key == ('GET', 'bookings'):
            return 200, [dict(b, blocked=int(any(x['sender'] == b['sender'] for x in self.blocked))) for b in self.bookings]
        if key == ('GET', 'blocked'): return 200, copy.deepcopy(self.blocked)
        if key == ('POST', 'bookings/status'):
            assert body['status'] in ('new', 'confirmed', 'delivered', 'cancelled')
            b = next(b for b in self.bookings if b['id'] == int(body['id']))
            b.update(status=body['status'], by_customer=0)
            if self.notify == 'sent' and body['status'] == 'confirmed': b['notified'] = 1
            return 200, {'ok': 1, **({'notify': self.notify} if body['status'] == 'confirmed' else {})}
        if key == ('POST', 'bookings/delete'):
            self.bookings[:] = [b for b in self.bookings if b['id'] != int(body['id'])]
            return 200, {'ok': 1}
        if key == ('POST', 'blocked/add'):
            b = next(b for b in self.bookings if b['id'] == int(body['booking_id']))
            self.blocked.append({'sender': b['sender'], 'reason': 'حظر يدوي', 'created': '2026-10-22 13:30:00', 'phone': b['phone']})
            return 200, {'ok': 1}
        if key == ('POST', 'blocked/remove'):
            self.blocked[:] = [b for b in self.blocked if b['sender'] != body['sender']]
            return 200, {'ok': 1}
        if key == ('GET', 'instagram/connect'):
            return (200, {'configured': True, 'url': BASE+'/fixture-oauth-disabled'}) if self.configured else (200, {'configured': False, 'msg': 'ربط Meta غير مفعّل في الاختبار المحلي'})
        if key == ('GET', 'admin/overview'):
            if self.me['role'] != 'admin': return 403, {'error': 'غير مسموح'}
            return 200, {'users': copy.deepcopy(self.users), 'plans': copy.deepcopy(self.plans), 'errors': 1}
        if key == ('POST', 'admin/plan'):
            next(p for p in self.plans if p['id'] == body['id']).update(monthly_limit=int(body['monthly_limit']), price=body['price'])
            return 200, {'ok': 1}
        if key == ('POST', 'admin/user-plan'):
            next(u for u in self.users if u['id'] == int(body['id']))['plan'] = body['plan']
            return 200, {'ok': 1}
        if key == ('POST', 'push/test'): return 200, {'ok': 1, 'sent': 1, 'failed': 0}
        if key == ('GET', 'push/key'): return 200, {'key': 'B'+'A'*86}
        if key in [('POST', 'push/subscribe'), ('POST', 'push/unsubscribe')]: return 200, {'ok': 1}
        self.unhandled.append(f'Unhandled API: {method} {path}')
        return 418, {'error': f'Unimplemented local fixture: {method} {path}'}
