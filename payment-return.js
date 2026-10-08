"use strict";

const {
  frontendBase,
  flatFromQuery,
  isValidHmac,
  isPaid,
} = require("./_paymob");

// GET /api/payment-return
// Paymob يحوّل العميل إلى هنا بعد الدفع (Transaction Response Callback)
module.exports = function handler(req, res) {
  const frontend = frontendBase();
  if (!frontend || !process.env.PAYMOB_HMAC_SECRET) {
    console.error("FRONTEND_URL or PAYMOB_HMAC_SECRET is missing");
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.end("Server configuration error");
  }

  const query = req.query || {};
  const flat = flatFromQuery(query);
  const valid = isValidHmac(flat, query.hmac);
  const paid = valid && isPaid(flat);

  const rawUrl = req.url || "";
  const qs = rawUrl.includes("?") ? rawUrl.slice(rawUrl.indexOf("?")) : "";

  let target;
  if (!valid) {
    target = `${frontend}/failed.html?reason=invalid`;
  } else if (paid) {
    target = `${frontend}/success.html${qs}`;
  } else {
    target = `${frontend}/failed.html${qs}`;
  }

  res.statusCode = 302;
  res.setHeader("Location", target);
  res.setHeader("Cache-Control", "no-store");
  return res.end();
};
