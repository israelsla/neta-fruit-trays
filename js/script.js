/* =====================================================================
   מגשי פירות נטע — סקריפט האתר
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

  /* ---------- 3. תאריך מינימלי לבחירת תאריך אירוע (מהיום והלאה) + חסימת שבת ---------- */
  const eventDateInput = document.getElementById('event-date');
  if (eventDateInput) {
    const today = new Date().toISOString().split('T')[0];
    eventDateInput.setAttribute('min', today);

    eventDateInput.addEventListener('change', () => {
      if (isSaturday(eventDateInput.value)) {
        eventDateInput.setCustomValidity('לא ניתן להזמין ליום שבת - אנא בחרו תאריך אחר');
        eventDateInput.reportValidity();
      } else {
        eventDateInput.setCustomValidity('');
      }
    });
  }

  function isSaturday(dateString) {
    if (!dateString) return false;
    const date = new Date(`${dateString}T00:00:00`);
    return date.getDay() === 6;
  }

  function isEventDateSoon(dateString) {
    if (!dateString) return false;
    const eventDate = new Date(`${dateString}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysUntil = Math.round((eventDate - today) / (1000 * 60 * 60 * 24));
    return daysUntil < AUTO_APPROVE_DAYS;
  }

  /* ---------- 3.5 טעינת קטלוג דינמית מ-Google Sheets ---------- */
  // תמונות ברירת מחדל - משמשות כל עוד נטע לא העלתה תמונה משלה דרך הדשבורד
  const DEFAULT_CATALOG_IMAGES = {
    'tray-30': 'img/tray-30.jpg',
    'tray-35': 'img/tray-35.jpg',
    'tray-40': 'img/tray-40.jpg',
    'tray-heart': 'img/tray-heart.jpg',
    'custom': 'img/tray-custom.jpg',
  };

  const catalogGrid = document.getElementById('catalog-grid');
  const trayTypeSelect = document.getElementById('tray-type');

  async function loadCatalog() {
    try {
      const response = await fetch(GOOGLE_SHEETS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'getCatalog', secret: GOOGLE_SHEETS_SECRET }),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'שגיאה בטעינת הקטלוג');
      renderCatalog(data.items);
      renderTrayTypeOptions(data.items);
    } catch (err) {
      if (catalogGrid) {
        catalogGrid.innerHTML = '<p class="catalog-loading">שגיאה בטעינת הקטלוג. נסו לרענן את הדף.</p>';
      }
    }
  }

  function renderCatalog(items) {
    if (!catalogGrid) return;
    catalogGrid.innerHTML = '';

    items.forEach((item) => {
      const article = document.createElement('article');
      article.className = item.id === 'custom' ? 'card card-custom' : 'card';

      const imageUrl = item.imageUrl || DEFAULT_CATALOG_IMAGES[item.id];
      const photoHtml = imageUrl
        ? `<img class="card-photo" src="${escapeHtmlAttr(imageUrl)}" alt="${escapeHtmlAttr(item.name)}" loading="lazy" />`
        : `<div class="card-photo card-photo-placeholder" aria-hidden="true">🍫🍷</div>`;

      const priceText = /^\d+$/.test(String(item.price).trim())
        ? `₪${item.price}`
        : item.price;

      article.innerHTML = `
        ${photoHtml}
        <h3>${escapeHtmlText(item.name)}</h3>
        <p>${escapeHtmlText(item.description)}</p>
        <p class="price">${escapeHtmlText(priceText)}</p>
      `;
      catalogGrid.appendChild(article);
    });
  }

  function renderTrayTypeOptions(items) {
    if (!trayTypeSelect) return;
    // משאירים רק את אפשרות ברירת המחדל הראשונה, מוחקים אפשרויות ישנות
    trayTypeSelect.innerHTML = '<option value="" disabled selected>בחרו סוג מגש</option>';

    items
      .filter((item) => item.id !== 'special-addon')
      .forEach((item) => {
        const option = document.createElement('option');
        option.value = item.name;
        const priceText = /^\d+$/.test(String(item.price).trim()) ? `₪${item.price}` : item.price;
        option.textContent = `${item.name} - ${priceText}`;
        trayTypeSelect.appendChild(option);
      });
  }

  function escapeHtmlText(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function escapeHtmlAttr(str) {
    return String(str ?? '').replace(/"/g, '&quot;');
  }

  loadCatalog();

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

  /* ---------- 4.5 כיתוב על התפוח - הצגת בחירת סגנון רק אם נבחר נוסח ---------- */
  const appleMessageSelect = document.getElementById('apple-message');
  const appleStyleRow = document.getElementById('apple-style-row');

  function updateAppleStyleUI() {
    appleStyleRow.hidden = !appleMessageSelect.value;
  }

  if (appleMessageSelect) {
    appleMessageSelect.addEventListener('change', updateAppleStyleUI);
    updateAppleStyleUI();
  }

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

      const appleMessage = formData.get('apple-message') || '';
      const appleStyle = appleMessage ? formData.get('apple-style') : '';

      // הזמנה לתאריך קרוב (פחות מ-AUTO_APPROVE_DAYS מהיום) דורשת אישור ידני
      // של נטע; הזמנה רחוקה יותר מאושרת אוטומטית עם השליחה.
      const status = isEventDateSoon(formData.get('event-date'))
        ? 'ממתין לאישור'
        : 'מאושר';

      const orderPayload = {
        orderRef,
        submittedAt: new Date().toISOString(),
        fullName: formData.get('full-name').trim(),
        phone: formatPhoneForStorage(formData.get('phone').trim()),
        trayType: formData.get('tray-type'),
        quantity: formData.get('quantity'),
        eventDate: formData.get('event-date'),
        deliveryMethod,
        deliveryArea: isDelivery ? formData.get('delivery-area') : null,
        deliveryFee: isDelivery ? deliveryFee : 0,
        address: isDelivery ? formData.get('address').trim() : '',
        appleMessage,
        appleStyle,
        specialRequests: formData.get('special-requests').trim(),
        status,
      };

      // נעילת כפתור השליחה כדי למנוע שליחה כפולה בזמן שהבקשה בתהליך
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'בודק זמינות...';
      }

      try {
        // בדיקת מכסה יומית - כמה מגשים כבר הוזמנו לאותו תאריך אירוע
        const alreadyOrdered = await getOrderedQuantityForDate(orderPayload.eventDate);
        const requestedQty = Number(orderPayload.quantity) || 1;

        if (alreadyOrdered + requestedQty > MAX_TRAYS_PER_DAY) {
          const remaining = Math.max(MAX_TRAYS_PER_DAY - alreadyOrdered, 0);
          alert(`מצטערים, ליום ${formatDateHebrew(orderPayload.eventDate)} ניתן להזמין עד ${MAX_TRAYS_PER_DAY} מגשים בסה"כ (נותרו ${remaining} מגשים פנויים ליום זה). אנא הקטינו את הכמות, בחרו תאריך אחר, או צרו קשר טלפוני לבדיקת אפשרות מיוחדת.`);
          return;
        }

        if (submitBtn) {
          submitBtn.textContent = 'שולח...';
        }

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

  // מוסיפים מקף למספר הטלפון (למשל 050-1234567) כדי ש-Google Sheets
  // לעולם לא יזהה אותו כמספר טהור וימחק את האפס המוביל
  function formatPhoneForStorage(phone) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
      return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    }
    return phone;
  }

  // סופר כמה מגשים כבר הוזמנו לתאריך נתון, כדי לא לחרוג מהמכסה היומית
  async function getOrderedQuantityForDate(dateString) {
    const response = await fetch(GOOGLE_SHEETS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'list', secret: GOOGLE_SHEETS_SECRET }),
    });
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'שגיאה בבדיקת זמינות');
    }
    return data.orders
      .filter((order) => order.eventDate === dateString)
      .reduce((sum, order) => sum + (Number(order.quantity) || 0), 0);
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

    const pendingBanner = document.getElementById('conf-pending-banner');
    pendingBanner.hidden = order.status !== 'ממתין לאישור';

    const isDelivery = order.deliveryMethod === 'delivery';
    const deliveryText = isDelivery
      ? `משלוח - ${order.deliveryArea}${order.deliveryFee ? ` (₪${order.deliveryFee})` : ' (ללא עלות נוספת)'}`
      : 'איסוף עצמי';
    document.getElementById('conf-delivery-method').textContent = deliveryText;

    const addressRowConf = document.getElementById('conf-address-row');
    if (isDelivery) {
      document.getElementById('conf-address').textContent = order.address;
      addressRowConf.hidden = false;
    } else {
      addressRowConf.hidden = true;
    }

    const appleRow = document.getElementById('conf-apple-row');
    if (order.appleMessage) {
      const styleText = order.appleStyle === 'רק כיתוב' ? 'רק כיתוב, בלי ציור' : 'עם ציור';
      document.getElementById('conf-apple').textContent = `${order.appleMessage} (${styleText})`;
      appleRow.hidden = false;
    } else {
      appleRow.hidden = true;
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
      updateAppleStyleUI();
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
