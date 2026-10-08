"use strict";

const crypto = require("crypto");
const {
  PAYMOB_API_BASE,
  CHECKOUT_BASE,
  CURRENCY,
  getProduct,
  toCents,
  requireEnv,
  setCors,
  backendBase,
  cleanText,
  isValidEmail,
  normalizeEgyptPhone,
  splitName,
} = require("./_paymob");

// POST /api/create-payment
module.exports = async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "الطريقة غير مسموحة" });
  }

  const missing = requireEnv([
    "PAYMOB_SECRET_KEY",
    "PAYMOB_PUBLIC_KEY",
    "PAYMOB_INTEGRATION_ID",
    "PAYMOB_HMAC_SECRET",
    "FRONTEND_URL",
  ]);
  if (missing.length) {
    console.error("Missing environment variables:", missing.join(", "));
    return res.status(500).json({ error: "إعدادات الخادم غير مكتملة" });
  }

  const integrationId = Number(process.env.PAYMOB_INTEGRATION_ID);
  if (!Number.isInteger(integrationId) || integrationId <= 0) {
    console.error("PAYMOB_INTEGRATION_ID must be a number");
    return res.status(500).json({ error: "إعدادات الخادم غير صحيحة" });
  }

  // قراءة الطلب
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = null;
    }
  }
  if (!body || typeof body !== "object") {
    return res.status(400).json({ error: "بيانات الطلب غير صالحة" });
  }

  // 1) المنتج والسعر يأتيان من الـBackend فقط (أي سعر من المتصفح يُتجاهل)
  const product = getProduct(String(body.productId || ""));
  if (!product) {
    return res.status(400).json({ error: "المنتج غير موجود" });
  }

  // 2) التحقق من بيانات العميل
  const fullName = cleanText(body.fullName, 100);
  const email = cleanText(body.email, 254).toLowerCase();
  const phone = normalizeEgyptPhone(body.phone);

  if (fullName.length < 3) {
    return res.status(400).json({ error: "من فضلك اكتب الاسم الكامل" });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "البريد الإلكتروني غير صحيح" });
  }
  if (!phone) {
    return res
      .status(400)
      .json({ error: "رقم الهاتف غير صحيح (مثال: 01012345678)" });
  }

  const { first, last } = splitName(fullName);
  const amountCents = toCents(product.priceEgp);
  const reference = `ORD-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const backend = backendBase(req);
  const frontend = String(process.env.FRONTEND_URL).trim().replace(/\/+$/, "");

  // 3) إنشاء Intention لدى Paymob (الطريقة الرسمية الحالية)
  const payload = {
    amount: amountCents,
    currency: CURRENCY,
    payment_methods: [integrationId],
    items: [
      {
        name: product.name,
        amount: amountCents,
        description: product.description,
        quantity: 1,
      },
    ],
    billing_data: {
      first_name: first,
      last_name: last,
      email,
      phone_number: phone,
    },
    extras: { product_id: product.id },
    special_reference: reference,
    // Paymob يرسل هنا نتيجة المعاملة من سيرفره إلى سيرفرنا (Webhook)
    notification_url: `${backend}/api/paymob-webhook`,
    // بعد الدفع يعود العميل إلى هنا ونتحقق من التوقيع ثم نحوّله لصفحة النجاح أو الفشل
    redirection_url: `${backend}/api/payment-return`,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${PAYMOB_API_BASE}/v1/intention/`, {
      method: "POST",
      headers: {
        Authorization: `Token ${process.env.PAYMOB_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || !data || !data.client_secret) {
      console.error(
        "Paymob intention failed:",
        response.status,
        JSON.stringify(data)
      );
      return res
        .status(502)
        .json({ error: "تعذر بدء عملية الدفع. حاول مرة أخرى بعد قليل." });
    }

    const checkoutUrl =
      `${CHECKOUT_BASE}/?publicKey=${encodeURIComponent(
        process.env.PAYMOB_PUBLIC_KEY
      )}` + `&clientSecret=${encodeURIComponent(data.client_secret)}`;

    console.log("Intention created:", reference);
    return res.status(200).json({ checkoutUrl, reference });
  } catch (err) {
    console.error("create-payment error:", err && err.message);
    return res
      .status(502)
      .json({ error: "تعذر الاتصال ببوابة الدفع. حاول مرة أخرى." });
  } finally {
    clearTimeout(timer);
  }
};
