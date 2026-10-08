"use strict";

const {
  flatFromProcessedObj,
  isValidHmac,
  isPaid,
} = require("./_paymob");

// POST /api/paymob-webhook
// Paymob يستدعي هذا الرابط من سيرفره (Transaction Processed Callback).
// هذا هو المصدر الموثوق الوحيد لتأكيد الدفع، وليس رجوع العميل إلى success.html.
module.exports = function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.PAYMOB_HMAC_SECRET) {
    console.error("PAYMOB_HMAC_SECRET is missing");
    return res.status(500).json({ error: "Server configuration error" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = null;
    }
  }

  // نتجاهل أنواع الإشعارات الأخرى (مثل التوكن) بدون خطأ
  if (!body || body.type !== "TRANSACTION" || !body.obj) {
    return res.status(200).json({ received: true, ignored: true });
  }

  const flat = flatFromProcessedObj(body.obj);

  if (!isValidHmac(flat, req.query && req.query.hmac)) {
    console.warn("Webhook rejected: invalid HMAC for transaction", flat.id);
    return res.status(401).json({ error: "Invalid signature" });
  }

  if (isPaid(flat)) {
    // ✅ دفع مؤكد وموثّق. هنا مكان تنفيذ الطلب (إرسال بريد، تسجيل في قاعدة بيانات...).
    // حاليًا نسجّل العملية في Vercel Logs لتراها في لوحة التحكم.
    console.log(
      "PAID",
      JSON.stringify({
        transactionId: flat.id,
        paymobOrderId: flat.order,
        amount: Number(flat.amount_cents) / 100,
        currency: flat.currency,
        reference: body.obj.order && body.obj.order.merchant_order_id,
        email: body.obj.payment_key_claims &&
          body.obj.payment_key_claims.billing_data &&
          body.obj.payment_key_claims.billing_data.email,
      })
    );
  } else {
    console.log(
      "NOT_PAID",
      JSON.stringify({
        transactionId: flat.id,
        success: flat.success,
        pending: flat.pending,
        refunded: flat.is_refunded,
        voided: flat.is_voided,
      })
    );
  }

  // لازم نرد 200 بسرعة حتى لا يعيد Paymob المحاولة
  return res.status(200).json({ received: true });
};
