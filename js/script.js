/* =====================================================================
   מגשי פירות נטע סילמן — סקריפט האתר
   כולל: תפריט מובייל, שנת זכויות יוצרים, מעבר איסוף/משלוח בטופס,
   ושליחת ההזמנה ישירות ל-Google Sheets (ראו js/config.js) עם הצגת
   מסך אישור. האתר הוא סטטי לגמרי - אין שרת משלו.
   ===================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  /* ---------- 1. תפריט ניווט למובייל ---------- */
  const navToggle = document.getElementById('nav-toggle');
  const primaryNav = document.getElementById('primary-nav');

  if (navToggle && primaryNav) {
    navToggle.addEventListener('click', () => {
      const isOpen = primaryNav.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });

    // סגירת התפריט בעת בחירת קישור (מובייל)
    primaryNav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        primaryNav.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* ---------- 2. שנת זכויות יוצרים אוטומטית ---------- */
  const yearEl = document.getElementById('current-year');
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  /* ---------- 3. תאריך מינימלי לבחירת תאריך אירוע (מהיום והלאה) ---------- */
  const eventDateInput = document.getElementById('event-date');
  if (eventDateInput) {
    const today = new Date().toISOString().split('T')[0];
    eventDateInput.setAttribute('min', today);
  }

  /* ---------- 4. מעבר בין איסוף עצמי למשלוח ---------- */
  const deliveryRadios = document.querySelectorAll('input[name="delivery-method"]');
  const deliveryAreaRow = document.getElementById('delivery-area-row');
  const deliveryAreaSelect = document.getElementById('delivery-area');
  const deliveryFeeHint = document.getElementById('delivery-fee-hint');
  const addressRow = document.getElementById('address-row');
  const addressInput = document.getElementById('address');

  function updateDeliveryUI() {
    const selected = document.querySelector('input[name="delivery-method"]:checked');
    const isDelivery = selected && selected.value === 'delivery';

    deliveryAreaRow.hidden = !isDelivery;
    addressRow.hidden = !isDelivery;

    // שדות חובה רק כשנבחר משלוח
    deliveryAreaSelect.required = isDelivery;
    addressInput.required = isDelivery;

    if (!isDelivery) {
      deliveryFeeHint.textContent = '';
    }
  }

  deliveryRadios.forEach((radio) => {
    radio.addEventListener('change', updateDeliveryUI);
  });

  if (deliveryAreaSelect) {
    deliveryAreaSelect.addEventListener('change', () => {
      const selectedOption = deliveryAreaSelect.options[deliveryAreaSelect.selectedIndex];
      const fee = Number(selectedOption?.dataset.fee || 0);
      deliveryFeeHint.textContent = fee > 0
        ? `עלות משלוח לאזור זה: ₪${fee}`
        : 'ללא עלות משלוח נוספת לאזור זה';
    });
  }

  updateDeliveryUI();

  /* ---------- 5. טיפול בטופס ההזמנה ---------- */
  const orderForm = document.getElementById('order-form');
  const confirmationSection = document.getElementById('order-confirmation');
  const submitBtn = orderForm ? orderForm.querySelector('.btn-submit') : null;

  if (orderForm && confirmationSection) {
    orderForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      // ולידציה מובנית של הדפדפן - אם משהו לא תקין, נציג הודעות ונעצור
      if (!orderForm.checkValidity()) {
        orderForm.reportValidity();
        return;
      }

      const formData = new FormData(orderForm);
      const deliveryMethod = formData.get('delivery-method');
      const isDelivery = deliveryMethod === 'delivery';

      const selectedAreaOption = isDelivery
        ? deliveryAreaSelect.options[deliveryAreaSelect.selectedIndex]
        : null;
      const deliveryFee = selectedAreaOption ? Number(selectedAreaOption.dataset.fee || 0) : 0;

      const orderRef = generateOrderReference();

      const orderPayload = {
        orderRef,
        submittedAt: new Date().toISOString(),
        fullName: formData.get('full-name').trim(),
        phone: formData.get('phone').trim(),
        trayType: formData.get('tray-type'),
        quantity: formData.get('quantity'),
        eventDate: formData.get('event-date'),
        deliveryMethod,
        deliveryArea: isDelivery ? formData.get('delivery-area') : null,
        deliveryFee: isDelivery ? deliveryFee : 0,
        address: isDelivery ? formData.get('address').trim() : '',
        specialRequests: formData.get('special-requests').trim(),
      };

      // נעילת כפתור השליחה כדי למנוע שליחה כפולה בזמן שהבקשה בתהליך
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'שולח...';
      }

      try {
        const response = await fetch(GOOGLE_SHEETS_URL, {
          method: 'POST',
          // חשוב: text/plain ולא application/json - כדי שהדפדפן לא ישלח
          // בקשת CORS preflight (OPTIONS) ש-Google Apps Script לא תומך בה
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'add', secret: GOOGLE_SHEETS_SECRET, order: orderPayload }),
        });

        const result = await response.json();
        if (!result.success) {
          throw new Error(result.error || 'שגיאה בשמירת ההזמנה');
        }

        showConfirmation(orderPayload, orderRef);
      } catch (err) {
        alert('אירעה שגיאה בשליחת ההזמנה. בדקו את החיבור לאינטרנט ונסו שוב, או צרו קשר טלפוני ישירות.');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'שליחת הזמנה';
        }
      }
    });
  }

  function generateOrderReference() {
    const now = new Date();
    const datePart = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('');
    const randomPart = Math.floor(1000 + Math.random() * 9000);
    return `NS-${datePart}-${randomPart}`;
  }

  function showConfirmation(order, orderRef) {
    document.getElementById('conf-name').textContent = order.fullName;
    document.getElementById('conf-ref').textContent = orderRef;
    document.getElementById('conf-tray').textContent = order.trayType;
    document.getElementById('conf-quantity').textContent = order.quantity;
    document.getElementById('conf-date').textContent = formatDateHebrew(order.eventDate);

    const isDelivery = order.deliveryMethod === 'delivery';
    const deliveryText = isDelivery
      ? `משלוח - ${order.deliveryArea}${order.deliveryFee ? ` (₪${order.deliveryFee})` : ' (ללא עלות נוספת)'}`
      : 'איסוף עצמי ממבוא חורון';
    document.getElementById('conf-delivery-method').textContent = deliveryText;

    const addressRowConf = document.getElementById('conf-address-row');
    if (isDelivery) {
      document.getElementById('conf-address').textContent = order.address;
      addressRowConf.hidden = false;
    } else {
      addressRowConf.hidden = true;
    }

    const requestsRow = document.getElementById('conf-requests-row');
    if (order.specialRequests) {
      document.getElementById('conf-requests').textContent = order.specialRequests;
      requestsRow.hidden = false;
    } else {
      requestsRow.hidden = true;
    }

    orderForm.hidden = true;
    confirmationSection.hidden = false;

    // העברת פוקוס למסך האישור לצורך נגישות, וגלילה חלקה אליו
    confirmationSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    confirmationSection.focus();
  }

  /* ---------- 6. כפתור "יצירת הזמנה חדשה" ---------- */
  const newOrderBtn = document.getElementById('new-order-btn');
  if (newOrderBtn) {
    newOrderBtn.addEventListener('click', () => {
      orderForm.reset();
      updateDeliveryUI();
      orderForm.hidden = false;
      confirmationSection.hidden = true;
      orderForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.getElementById('full-name').focus();
    });
  }

  /* ---------- פונקציות עזר ---------- */

  function formatDateHebrew(isoDateString) {
    if (!isoDateString) return '';
    const date = new Date(`${isoDateString}T00:00:00`);
    return date.toLocaleDateString('he-IL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

});
