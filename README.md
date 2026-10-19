# InstaPilot AI — نسخة Cloudflare (Workers + D1)

- `src/worker.js` : الخلفية كاملة
- `public/` : الواجهة (نفس واجهة نسخة Render)
- `wrangler.jsonc` : الإعدادات (لازم تضع معرف قاعدة D1)

## المتغيرات (Settings → Variables and Secrets بالـ Worker)
Secrets: ENC_KEY, IG_APP_SECRET, GEMINI_API_KEY, BREVO_API_KEY, IG_VERIFY_TOKEN, (META_APP_SECRET اختياري)
Text:    ADMIN_EMAIL, LIVE, PUBLIC_URL, IG_APP_ID, AI_MODEL, MAIL_FROM, PBKDF2_ITER (اختياري، الافتراضي 100000)
