"use strict";

const {
  setCors,
  flatFromQuery,
  isValidHmac,
  isPaid,
} = require("./_paymob");

// GET /api/verify-payment?<نفس معاملات Paymob التي وصلت إلى success.html>
// الصفحة لا تعتمد على نفسها: هذا الـEndpoint يتحقق من توقيع Paymob (HMAC)
module.exports = function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    return res.status(405).json({ verified: false, error: "الطريقة غير مسموحة" });
  }

  if (!process.env.PAYMOB_HMAC_SECRET) {
    console.error("PAYMOB_HMAC_SECRET is missing");
    return res.status(500).json({ verified: false, error: "إعدادات الخادم غير مكتملة" });
  }

  const query = req.query || {};
  const flat = flatFromQuery(query);

  if (!query.hmac || !isValidHmac(flat, query.hmac)) {
    return res.status(400).json({ verified: false, paid: false });
  }

  if (!isPaid(flat)) {
    return res.status(200).json({ verified: true, paid: false });
  }

  const merchantOrderId = Array.isArray(query.merchant_order_id)
    ? query.merchant_order_id[0]
    : query.merchant_order_id;

  return res.status(200).json({
    verified: true,
    paid: true,
    orderId: flat.order,
    transactionId: flat.id,
    reference: merchantOrderId && merchantOrderId !== "null" ? String(merchantOrderId) : "",
    amount: Number(flat.amount_cents) / 100,
    currency: flat.currency,
  });
};
