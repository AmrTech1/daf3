"use strict";

/* ==================================================================
   الإعدادات: غيّر هذه القيمة فقط بعد نشر الـBackend على Vercel
   (بدون "/" في النهاية)
=================================================================== */
const CONFIG = {
  API_BASE_URL: "https://YOUR-PROJECT.vercel.app",

  // للعرض فقط! السعر الحقيقي يُحدَّد في الـBackend (lib/paymob.js)
  PRODUCT_ID: "headphones-pro",
  PRODUCT_NAME: "سماعات لاسلكية برو",
  DISPLAY_PRICE_EGP: 1500,
};

const formatMoney = (amount) =>
  new Intl.NumberFormat("ar-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 2,
  }).format(amount);

/* ==================================================================
   صفحة المنتج
=================================================================== */
function initProductPage() {
  const modal = document.getElementById("checkout-modal");
  const form = document.getElementById("checkout-form");
  const loading = document.getElementById("loading");
  const errorBox = document.getElementById("form-error");
  const payBtn = document.getElementById("pay-btn");
  const buyBtn = document.getElementById("buy-btn");

  document.getElementById("year").textContent = new Date().getFullYear();
  document.getElementById("product-price").textContent = formatMoney(CONFIG.DISPLAY_PRICE_EGP);
  document.getElementById("productField").value = CONFIG.PRODUCT_NAME;
  document.getElementById("priceField").value = formatMoney(CONFIG.DISPLAY_PRICE_EGP);

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  function clearError() {
    errorBox.hidden = true;
    errorBox.textContent = "";
    form.querySelectorAll("input").forEach((i) => i.classList.remove("invalid"));
  }

  function openModal() {
    clearError();
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    document.getElementById("fullName").focus();
  }

  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = "";
    buyBtn.focus();
  }

  buyBtn.addEventListener("click", openModal);
  modal.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", closeModal));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) closeModal();
  });

  // فتح النموذج تلقائيًا عند الضغط على "إعادة المحاولة"
  if (new URLSearchParams(location.search).get("retry") === "1") openModal();

  // تحقق مبدئي في المتصفح (التحقق الحقيقي في الـBackend)
  function validate(values) {
    if (values.fullName.length < 3) return ["fullName", "من فضلك اكتب الاسم الكامل"];
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email)) return ["email", "البريد الإلكتروني غير صحيح"];
    if (!/^(?:\+20|0020|20|0)?1[0125]\d{8}$/.test(values.phone.replace(/[\s-]/g, ""))) {
      return ["phone", "رقم الهاتف غير صحيح (مثال: 01012345678)"];
    }
    return null;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();

    const values = {
      fullName: form.fullName.value.trim(),
      email: form.email.value.trim(),
      phone: form.phone.value.trim(),
    };

    const problem = validate(values);
    if (problem) {
      form[problem[0]].classList.add("invalid");
      form[problem[0]].focus();
      showError(problem[1]);
      return;
    }

    payBtn.disabled = true;
    loading.hidden = false;

    try {
      const response = await fetch(`${CONFIG.API_BASE_URL}/api/create-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // نرسل رقم المنتج فقط، وليس السعر. السعر يحدده الـBackend.
        body: JSON.stringify({ productId: CONFIG.PRODUCT_ID, ...values }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.checkoutUrl) {
        throw new Error(data.error || "حدث خطأ غير متوقع. حاول مرة أخرى.");
      }

      // تحويل العميل إلى صفحة الدفع الآمنة لدى Paymob
      window.location.href = data.checkoutUrl;
    } catch (err) {
      loading.hidden = true;
      payBtn.disabled = false;
      const offline = err instanceof TypeError;
      showError(
        offline
          ? "تعذر الاتصال بالخادم. تأكد من اتصال الإنترنت ومن إعداد API_BASE_URL."
          : err.message
      );
    }
  });

  // عند الرجوع بزر "رجوع" في المتصفح من صفحة الدفع
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) {
      loading.hidden = true;
      payBtn.disabled = false;
    }
  });
}

/* ==================================================================
   صفحة النجاح: لا نصدّق الرابط، نسأل الـBackend ليتحقق من توقيع Paymob
=================================================================== */
async function initSuccessPage() {
  const checking = document.getElementById("state-checking");
  const success = document.getElementById("state-success");

  const fail = (reason) => {
    window.location.replace(`failed.html?reason=${reason}`);
  };

  if (!location.search || !new URLSearchParams(location.search).get("hmac")) {
    return fail("unverified");
  }

  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}/api/verify-payment${location.search}`);
    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.verified || !data.paid) {
      return fail(data && data.verified === false ? "invalid" : "unpaid");
    }

    document.getElementById("order-id").textContent = data.reference || data.orderId;
    document.getElementById("order-amount").textContent = formatMoney(data.amount);
    checking.hidden = true;
    success.hidden = false;
    document.title = "تم الدفع بنجاح | المتجر";
  } catch (err) {
    fail("network");
  }
}

/* ==================================================================
   صفحة الفشل
=================================================================== */
function initFailedPage() {
  const reason = new URLSearchParams(location.search).get("reason");
  const messages = {
    invalid: "تعذر التحقق من نتيجة الدفع. إذا تم خصم مبلغ من حسابك فتواصل معنا وسنراجع العملية.",
    unverified: "لم نستطع تأكيد عملية دفع لهذا الرابط. يمكنك المحاولة من جديد.",
    network: "تعذر الاتصال بالخادم للتحقق من الدفع. إذا تم خصم مبلغ فتواصل معنا.",
  };
  if (reason && messages[reason]) {
    document.getElementById("fail-message").textContent = messages[reason];
  }
}

/* ==================================================================
   التشغيل حسب الصفحة
=================================================================== */
document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;
  if (page === "product") initProductPage();
  else if (page === "success") initSuccessPage();
  else if (page === "failed") initFailedPage();
});
