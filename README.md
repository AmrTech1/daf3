# ⚠️ تعديل مهم: مستودعان (Repositories) بدل واحد

- **مستودع الواجهة** (مثل `my-store`): فيه ملفات مجلد `frontend` فقط، كلها في الجذر بدون فولدرات. هذا هو الذي تنشره على **GitHub Pages**.
- **مستودع الـBackend** (مثل `my-store-api`): فيه محتويات مجلد `backend` (فولدر `api` + `package.json` + `vercel.json`). هذا هو الذي تستورده في **Vercel**.
- فولدر `api` إجباري لأن Vercel لا يتعرف على الدوال إلا بداخله. والملف `_paymob.js` بداخله (الشرطة السفلية تمنع Vercel من اعتباره Endpoint).
- في الشرح أدناه: كلمة "الـRepository" عند GitHub Pages تعني مستودع الواجهة، وعند Vercel تعني مستودع الـBackend.
- ملفات الواجهة صارت: `style.css` و`app.js` في الجذر. وعدّل `API_BASE_URL` داخل `app.js`.

---

# متجر بسيط: GitHub Pages + Vercel + Paymob

مشروع كامل لبيع منتج واحد: الواجهة (HTML/CSS/JS) على **GitHub Pages**، والجزء السري (Backend) على **Vercel Functions** مجانًا، والدفع عبر **Paymob**.

> تم بناء الكود حسب توثيق Paymob الرسمي الحالي (developers.paymob.com): **Intention API** + **Unified Checkout**. لا نستخدم الطريقة القديمة (auth/tokens + iframe).

---

## 1) فكرة المشروع

```
العميل → موقع GitHub Pages → Vercel Function (/api/create-payment)
       → Paymob (إنشاء Intention) → صفحة الدفع الآمنة لدى Paymob
       → بعد الدفع: Paymob يرسل Webhook إلى Vercel (/api/paymob-webhook)
       → ويعيد العميل إلى Vercel (/api/payment-return) → success.html أو failed.html
```

**كيف نمنع الغش؟**

| الخطر | الحل في المشروع |
|---|---|
| تعديل السعر من Developer Tools | المتصفح يرسل `productId` فقط، والسعر مكتوب في `lib/paymob.js` على الخادم |
| تسريب المفاتيح | المفاتيح كلها في Vercel Environment Variables، لا شيء منها في الكود |
| تزوير صفحة النجاح | `success.html` تسأل `/api/verify-payment` الذي يتحقق من توقيع **HMAC-SHA512** الصادر من Paymob |
| بيانات البطاقة | لا تمر بموقعنا أبدًا، يدخلها العميل في صفحة Paymob فقط |
| استدعاء الـAPI من مواقع أخرى | CORS يسمح لموقعك فقط (`FRONTEND_URL`) |

---

## 2) هيكل الملفات

```
/
├── index.html            صفحة المنتج + نموذج الدفع
├── success.html          صفحة نجاح الدفع
├── failed.html           صفحة فشل الدفع
├── css/style.css         التصميم
├── js/app.js             كود الواجهة (فيه API_BASE_URL)
├── api/
│   ├── create-payment.js    إنشاء عملية الدفع
│   ├── payment-return.js    استقبال عودة العميل والتحقق من HMAC
│   ├── verify-payment.js    تأكيد النجاح لصفحة success.html
│   └── paymob-webhook.js    Webhook من سيرفر Paymob
├── lib/paymob.js         الأسعار + التحقق + حساب HMAC (مشترك)
├── package.json
├── vercel.json
├── .env.example          مثال على المتغيرات (placeholders)
└── .gitignore
```

> أضفتُ مجلد `lib/` وملفَّي `payment-return.js` و`verify-payment.js` لأن التحقق الآمن يحتاجهم.

---

## 3) تشغيل الموقع محليًا (اختياري)

- **الواجهة فقط:** افتح مجلد المشروع في الطرفية ونفّذ `npx serve .` ثم افتح الرابط الذي يظهر.
- **الـBackend:** نفّذ `npx vercel dev` (يطلب منك تسجيل الدخول لمرة واحدة). تحتاج ملف `.env` محلي (انسخ `.env.example` وضع قيمك، والملف مستثنى من GitHub تلقائيًا).
- Webhook لا يعمل محليًا لأن Paymob يحتاج رابطًا عامًا، لذلك اختبر الدفع الكامل بعد النشر على Vercel.

---

## 4) إنشاء حساب Paymob

1. ادخل إلى موقع Paymob (paymob.com) واضغط **Sign up** وأنشئ حساب Merchant (Egypt).
2. أدخل رقم هاتفك وأكّد كود OTP.
3. الحساب الجديد يكون في وضع **Test** تلقائيًا: يمكنك التجربة بدون أموال حقيقية.
4. لاحقًا، للانتقال إلى **Live** ستحتاج إكمال بيانات النشاط التجاري ومستنداته من لوحة Paymob.

### أين أجد البيانات؟

| القيمة | المكان في لوحة Paymob |
|---|---|
| **Secret Key** و **Public Key** | Settings ← API Keys (بدّل بين Test/Live من الزر أعلى اليمين، وكل وضع له مفاتيحه) |
| **HMAC Secret** | Settings ← Account Info (أو API Keys حسب شكل اللوحة) |
| **Integration ID** (للكروت) | Settings ← Payment Integrations (اختر نفس وضع Test/Live) |
| API Key | غير مطلوب في هذا المشروع (يُستخدم في الطريقة القديمة فقط) |

> ⚠️ الـIntegration ID والمفاتيح لازم تكون **من نفس الوضع**. مفاتيح Test مع Integration ID من Test.

---

## 5) نشر الواجهة على GitHub Pages

### أ) إنشاء Repository
1. ادخل إلى github.com وسجّل دخولك (أو أنشئ حسابًا مجانيًا).
2. اضغط **+** ثم **New repository**.
3. الاسم مثل `my-store`، اختر **Public**، ثم **Create repository**.

### ب) رفع الملفات
1. فك ضغط المشروع على جهازك.
2. داخل الـRepository اضغط **uploading an existing file**.
3. اسحب **كل الملفات والمجلدات** (`index.html`, `css`, `js`, `api`, `lib`, ...). لا ترفع ملف `.env` الحقيقي.
4. اضغط **Commit changes**.

### ج) تفعيل GitHub Pages
1. من الـRepository: **Settings ← Pages**.
2. في **Source** اختر **Deploy from a branch**.
3. Branch: `main` والمجلد `/ (root)` ثم **Save**.
4. بعد دقيقة يظهر رابط موقعك: `https://USERNAME.github.io/my-store`

### د) الحصول على رابط الموقع
انسخه (بدون `/` في النهاية)، ستحتاجه في Vercel كقيمة `FRONTEND_URL`.

---

## 6) نشر الـBackend على Vercel

1. ادخل إلى vercel.com ← **Sign Up** ← **Continue with GitHub** (الخطة المجانية Hobby).
2. اضغط **Add New… ← Project**.
3. اختر الـRepository `my-store` واضغط **Import** (إن لم يظهر: **Adjust GitHub App Permissions**).
4. اترك **Framework Preset = Other** وبقية الإعدادات كما هي.
5. **قبل** الضغط على Deploy افتح **Environment Variables** وأضف المتغيرات من القسم التالي.
6. اضغط **Deploy**، وبعد دقيقة ستحصل على رابط مثل `https://my-store.vercel.app`.

### المتغيرات المطلوبة (Environment Variables)

| الاسم | القيمة | مثال (placeholder) |
|---|---|---|
| `PAYMOB_SECRET_KEY` | Secret Key من Paymob | `egy_sk_test_XXXX` |
| `PAYMOB_PUBLIC_KEY` | Public Key من Paymob | `egy_pk_test_XXXX` |
| `PAYMOB_HMAC_SECRET` | HMAC Secret من Paymob | `XXXXXXXX` |
| `PAYMOB_INTEGRATION_ID` | رقم الـIntegration (أرقام فقط) | `1234567` |
| `FRONTEND_URL` | رابط GitHub Pages بدون `/` أخيرة | `https://USERNAME.github.io/my-store` |
| `BACKEND_URL` (اختياري) | رابط Vercel | `https://my-store.vercel.app` |

> إذا أضفت أو غيّرت متغيرًا بعد النشر: **Deployments ← ⋯ ← Redeploy** حتى يُطبَّق.

### ربط الواجهة بالـBackend
1. على GitHub افتح الملف `js/app.js` واضغط أيقونة القلم ✏️.
2. غيّر السطر:
   ```js
   API_BASE_URL: "https://YOUR-PROJECT.vercel.app",
   ```
   إلى رابط Vercel الحقيقي (بدون `/` أخيرة)، ثم **Commit changes**. سيتحدث GitHub Pages خلال دقيقة.

### اختبار الـAPI
افتح في المتصفح: `https://my-store.vercel.app/api/verify-payment`
إذا ظهر `{"verified":false,"paid":false}` فالـBackend يعمل ✅.

---

## 7) إعداد Webhook / Callback

المشروع يرسل مع كل عملية دفع رابطين تلقائيًا (لا تحتاج ضبطهما يدويًا):

- `notification_url` → `/api/paymob-webhook` (إشعار من سيرفر Paymob، **هو المرجع الموثوق**).
- `redirection_url` → `/api/payment-return` (عودة العميل).

**اختياري كنسخة احتياطية:** في لوحة Paymob افتح Payment Integrations ← اختر الـIntegration ← ضع في خانتي Transaction processed callback و Transaction response callback:

```
Processed:  https://my-store.vercel.app/api/paymob-webhook
Response:   https://my-store.vercel.app/api/payment-return
```

### كيف أعرف أن الدفع نجح فعلًا؟
1. من **Vercel ← Project ← Logs**: ابحث عن سطر يبدأ بـ `PAID` فيه رقم المعاملة والمبلغ (وصل من Webhook موقَّع).
2. من **لوحة Paymob ← Transactions**: تظهر العملية بحالة Successful.
3. الدليل الرسمي هو التوقيع (HMAC) وليس ظهور صفحة النجاح.

> **ملاحظة مهمة:** Vercel Functions لا تحفظ بيانات بين الطلبات، لذلك الـWebhook هنا يسجّل العمليات في Logs فقط. إن أردت تنفيذ الطلب تلقائيًا (بريد، قاعدة بيانات)، أضف الكود داخل الشرط `if (isPaid(flat))` في `api/paymob-webhook.js`.

---

## 8) اختبار الدفع (Test Mode)

1. تأكد أن المفاتيح والـIntegration ID من وضع **Test**.
2. افتح موقعك ← **اشترِ الآن** ← املأ البيانات ← **الدفع الآن**.
3. في صفحة Paymob استخدم **كرت الاختبار الرسمي** (لا أموال حقيقية):
   - رقم الكرت: `5123456789012346`
   - تاريخ الانتهاء و CVV: خذهم من صفحة **Test Credentials** في توثيق Paymob لأنها قد تتغير.
4. النتيجة المتوقعة: العودة إلى `success.html` بعبارة **تم الدفع بنجاح** ورقم الطلب والمبلغ.
5. لتجربة الفشل: استخدم كرت الرفض المذكور في نفس صفحة Test Credentials، فتصل إلى `failed.html`.

> إذا لم يُقبل كرت الاختبار، راسل support@paymob.com لتفعيل بيئة الاختبار على حسابك.

---

## 9) حل المشاكل الشائعة

| المشكلة | السبب والحل |
|---|---|
| "إعدادات الخادم غير مكتملة" | متغير ناقص في Vercel. راجع الجدول وأعد **Redeploy** |
| `Integration ID/Name does not exist` (404 في Logs) | الـIntegration ID من وضع مختلف عن المفاتيح، أو غير مفعّل للكروت |
| "تعذر الاتصال بالخادم" في الموقع | `API_BASE_URL` خطأ، أو `FRONTEND_URL` في Vercel لا يطابق رابط GitHub Pages تمامًا (CORS) |
| خطأ 400 من Paymob (billing_data) | راجع Vercel ← Logs لتعرف الحقل المطلوب |
| بعد الدفع أرى failed.html مع "invalid" | `PAYMOB_HMAC_SECRET` خطأ، أو من وضع مختلف |
| لا يصل Webhook | تأكد من الرابط في Logs، ومن أن Vercel Deployment Protection لا تحجب رابط الإنتاج |
| الصفحة لا تتحدث بعد تعديل | انتظر دقيقة ثم أعد التحميل (Ctrl+Shift+R) |
| الدفع ناجح في Paymob لكن صفحة النجاح لم تظهر | العميل أغلق الصفحة قبل العودة. اعتمد على Webhook / Logs وليس على الصفحة |

---

## 10) الانتقال إلى الدفع الحقيقي (Live)

1. أكمل توثيق حسابك في Paymob وفعّل Live.
2. بدّل المتغيرات في Vercel إلى مفاتيح **Live** و Integration ID من **Live**.
3. اعمل **Redeploy** وجرّب بمبلغ صغير.

---

## ✅ Checklist النهائية

- ☐ GitHub جاهز (Repository فيه كل الملفات)
- ☐ GitHub Pages يعمل (الرابط يفتح الموقع)
- ☐ Vercel متصل (المشروع منشور)
- ☐ Environment Variables مضافة (6 متغيرات) مع Redeploy
- ☐ `API_BASE_URL` في `js/app.js` يشير إلى Vercel
- ☐ Paymob متصل (مفاتيح + Integration ID من نفس الوضع)
- ☐ Webhook مضبوط (يظهر سطر `PAID` في Vercel Logs بعد تجربة ناجحة)
- ☐ Test Payment ناجح (success.html) وتجربة فشل (failed.html)
- ☐ تأكدتَ أنه لا توجد مفاتيح حقيقية في GitHub
- ☐ الموقع جاهز للإطلاق (بعد التحويل إلى Live وتجربة مبلغ صغير)
