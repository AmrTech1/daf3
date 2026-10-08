"use strict";

const crypto = require("crypto");

/* ------------------------------------------------------------------
   كتالوج المنتجات (السعر الحقيقي يُحدَّد هنا في الـBackend فقط)
   السعر بالجنيه المصري. غيّر الاسم والسعر كما تريد.
------------------------------------------------------------------- */
const PRODUCTS = {
  "headphones-pro": {
    id: "headphones-pro",
    name: "سماعات لاسلكية برو",
    description: "سماعات بلوتوث بعزل ضوضاء وبطارية تدوم 40 ساعة",
    priceEgp: 1500,
  },
};

const CURRENCY = "EGP";
const PAYMOB_API_BASE = "https://accept.paymob.com";
const CHECKOUT_BASE = "https://eg.checkout.paymob.com";

function getProduct(productId) {
  return Object.prototype.hasOwnProperty.call(PRODUCTS, productId)
    ? PRODUCTS[productId]
    : null;
}

function toCents(egp) {
  return Math.round(egp * 100);
}

function isKnownAmountCents(cents) {
  return Object.values(PRODUCTS).some((p) => toCents(p.priceEgp) === Number(cents));
}

/* ------------------------------------------------------------------
   إعدادات البيئة و CORS
------------------------------------------------------------------- */
function requireEnv(names) {
  return names.filter((n) => !process.env[n] || !String(process.env[n]).trim());
}

function frontendBase() {
  return String(process.env.FRONTEND_URL || "").trim().replace(/\/+$/, "");
}

function frontendOrigin() {
  try {
    return new URL(frontendBase()).origin;
  } catch (e) {
    return "";
  }
}

// يسمح فقط لموقع GitHub Pages الخاص بك باستدعاء الـAPI من المتصفح
function setCors(req, res) {
  const allowed = frontendOrigin();
  const origin = req.headers.origin;
  if (allowed && origin === allowed) {
    res.setHeader("Access-Control-Allow-Origin", allowed);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
}

function backendBase(req) {
  const fromEnv = String(process.env.BACKEND_URL || "").trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `https://${host}`;
}

/* ------------------------------------------------------------------
   التحقق من بيانات العميل
------------------------------------------------------------------- */
function cleanText(value, max) {
  return String(value === undefined || value === null ? "" : value)
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
}

// يقبل أرقام مصرية مثل 01012345678 أو +201012345678 ويحوّلها إلى +201012345678
function normalizeEgyptPhone(raw) {
  const digits = String(raw || "").replace(/[^\d+]/g, "");
  const m = digits.match(/^(?:\+20|0020|20|0)?(1[0125]\d{8})$/);
  return m ? `+20${m[1]}` : null;
}

function splitName(fullName) {
  const parts = fullName.split(" ").filter(Boolean);
  const first = parts[0] || "NA";
  const last = parts.slice(1).join(" ") || first;
  return { first, last };
}

/* ------------------------------------------------------------------
   HMAC (حسب توثيق Paymob الرسمي: HMAC-SHA512 على حقول مرتبة)
------------------------------------------------------------------- */
const HMAC_FIELDS = [
  "amount_cents",
  "created_at",
  "currency",
  "error_occured",
  "has_parent_transaction",
  "id",
  "integration_id",
  "is_3d_secure",
  "is_auth",
  "is_capture",
  "is_refunded",
  "is_standalone_payment",
  "is_voided",
  "order",
  "owner",
  "pending",
  "source_data.pan",
  "source_data.sub_type",
  "source_data.type",
  "success",
];

function str(v) {
  return v === null || v === undefined ? "" : String(v);
}

function first(v) {
  return Array.isArray(v) ? v[0] : v;
}

// Transaction Response Callback (GET من متصفح العميل): الحقول في الـquery
function flatFromQuery(q) {
  q = q || {};
  const flat = {};
  HMAC_FIELDS.forEach((k) => {
    flat[k] = str(first(q[k]));
  });
  flat.order = str(first(q.order_id !== undefined ? q.order_id : q.order));
  return flat;
}

// Transaction Processed Callback (POST من سيرفر Paymob): الحقول داخل obj
function flatFromProcessedObj(obj) {
  obj = obj || {};
  const sd = obj.source_data || {};
  return {
    amount_cents: str(obj.amount_cents),
    created_at: str(obj.created_at),
    currency: str(obj.currency),
    error_occured: str(obj.error_occured),
    has_parent_transaction: str(obj.has_parent_transaction),
    id: str(obj.id),
    integration_id: str(obj.integration_id),
    is_3d_secure: str(obj.is_3d_secure),
    is_auth: str(obj.is_auth),
    is_capture: str(obj.is_capture),
    is_refunded: str(obj.is_refunded),
    is_standalone_payment: str(obj.is_standalone_payment),
    is_voided: str(obj.is_voided),
    order: str(obj.order && obj.order.id),
    owner: str(obj.owner),
    pending: str(obj.pending),
    "source_data.pan": str(sd.pan),
    "source_data.sub_type": str(sd.sub_type),
    "source_data.type": str(sd.type),
    success: str(obj.success),
  };
}

function computeHmac(flat, secret) {
  const message = HMAC_FIELDS.map((k) => str(flat[k])).join("");
  return crypto.createHmac("sha512", secret).update(message).digest("hex");
}

function isValidHmac(flat, receivedHmac) {
  const secret = process.env.PAYMOB_HMAC_SECRET;
  const received = str(first(receivedHmac)).toLowerCase();
  if (!secret || !received) return false;
  const expected = computeHmac(flat, secret);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// هل المعاملة ناجحة فعلًا؟
function isPaid(flat) {
  return (
    flat.success === "true" &&
    flat.pending === "false" &&
    flat.error_occured === "false" &&
    flat.is_voided === "false" &&
    flat.is_refunded === "false" &&
    flat.currency === CURRENCY &&
    isKnownAmountCents(flat.amount_cents)
  );
}

module.exports = {
  PRODUCTS,
  CURRENCY,
  PAYMOB_API_BASE,
  CHECKOUT_BASE,
  getProduct,
  toCents,
  requireEnv,
  frontendBase,
  setCors,
  backendBase,
  cleanText,
  isValidEmail,
  normalizeEgyptPhone,
  splitName,
  flatFromQuery,
  flatFromProcessedObj,
  isValidHmac,
  isPaid,
};
