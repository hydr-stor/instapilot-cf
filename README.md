# InstaPilot AI — نسخة Cloudflare (Workers + D1)

- `src/worker.js` : الخلفية كاملة
- `public/` : الواجهة (نفس واجهة نسخة Render)
- `wrangler.jsonc` : الإعدادات (لازم تضع معرف قاعدة D1)

## المتغيرات (Settings → Variables and Secrets بالـ Worker)
Secrets: ENC_KEY, IG_APP_SECRET, GEMINI_API_KEY, BREVO_API_KEY, IG_VERIFY_TOKEN, (META_APP_SECRET اختياري)
Text:    ADMIN_EMAIL, LIVE, PUBLIC_URL, IG_APP_ID, AI_MODEL, MAIL_FROM, PBKDF2_ITER (اختياري، الافتراضي 100000)

## Smart Inbox

أضيف صندوق وارد موحّد للردود البشرية وAI، مع حفظ حالات الإرسال والتحويل وعزل المتاجر.
الواجهة تستخدم Backend حقيقياً؛ لا تحتوي نسخة الإنتاج بيانات محاكاة.

- دليل التفعيل والمهاجرة وحدود Meta والتراجع: [SMART_INBOX_AR.md](docs/SMART_INBOX_AR.md).
- اختبارات محلية (Node.js 24+): `npm test`.
- معاينة محلية ببيانات مصطنعة: `npm run preview:inbox`، ثم `http://127.0.0.1:3100/__local/start` على جهاز التشغيل.
- الميزة متوقفة افتراضياً؛ تتطلب مراجعة مهاجرة D1 أولاً، ثم `SMART_INBOX_ENABLED=true`.
- `IG_HUMAN_AGENT_APPROVED` متوقف افتراضياً ولا يُفعّل إلا بعد موافقة Meta؛ لا يُستخدم للردود الآلية.
- `wrangler.jsonc` وربط قاعدة الإنتاج لم يتغيرا. لا توجد مهاجرة أو عملية نشر تلقائية ضمن أوامر الاختبار.
