/* =====================================================================
   מגשי פירות נטע — סקריפט עמוד ניהול ההזמנות
   האתר סטטי לגמרי (GitHub Pages, ללא שרת) - עמוד זה קורא/כותב הזמנות
   וקטלוג ישירות מול Google Sheets (ראו js/config.js לכתובת ולסיסמה).

   הסיסמה נבדקת כאן בדפדפן בלבד (לא מול שרת) - זהו מחסום נוחות למניעת
   הצצה אקראית, לא הגנה אמיתית. היא נשמרת ב-localStorage כדי שלא יהיה
   צורך להקליד אותה מחדש בכל כניסה - נוח למשל בטלפון שנטע נכנסת ממנו.
   ===================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  const loginScreen = document.getElementById('login-screen');
  const ordersScreen = document.getElementById('orders-screen');
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const passwordInput = document.getElementById('admin-password');

  const ordersTbody = document.getElementById('orders-tbody');
  const ordersStats = document.getElementById('orders-stats');
  const noOrdersMsg = document.getElementById('no-orders-msg');
  const ordersTable = document.getElementById('orders-table');
  const refreshBtn = document.getElementById('refresh-btn');
  const logoutBtn = document.getElementById('logout-btn');

  const tabOrders = document.getElementById('tab-orders');
  const tabCatalog = document.getElementById('tab-catalog');
  const ordersPanel = document.getElementById('orders-panel');
  const catalogPanel = document.getElementById('catalog-panel');
  const catalogEditList = document.getElementById('catalog-edit-list');

  const DELIVERY_LABELS = {
    pickup: 'איסוף עצמי',
    delivery: 'משלוח',
  };

  /* ---------- מעבר בין לשונית הזמנות ללשונית עריכת קטלוג ---------- */
  tabOrders.addEventListener('click', () => switchTab('orders'));
  tabCatalog.addEventListener('click', () => switchTab('catalog'));

  function switchTab(tab) {
    const isOrders = tab === 'orders';
    tabOrders.classList.toggle('is-active', isOrders);
    tabCatalog.classList.toggle('is-active', !isOrders);
    tabOrders.setAttribute('aria-selected', String(isOrders));
    tabCatalog.setAttribute('aria-selected', String(!isOrders));
    ordersPanel.hidden = !isOrders;
    catalogPanel.hidden = isOrders;

    if (!isOrders && !catalogEditList.dataset.loaded) {
      loadCatalogForEditing();
    }
  }

  /* ---------- ניסיון כניסה אוטומטי אם כבר יש סיסמה שמורה בדפדפן הזה ---------- */
  const savedPassword = localStorage.getItem('ns-admin-password');
  if (savedPassword === ADMIN_PASSWORD) {
    loadOrders();
  }

  loginForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const password = passwordInput.value;

    if (password !== ADMIN_PASSWORD) {
      loginError.textContent = 'סיסמה שגויה, נסו שוב.';
      loginError.hidden = false;
      return;
    }

    localStorage.setItem('ns-admin-password', password);
    loginError.hidden = true;
    loadOrders();
  });

  refreshBtn.addEventListener('click', loadOrders);

  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('ns-admin-password');
    ordersScreen.hidden = true;
    loginScreen.hidden = false;
    passwordInput.value = '';
    passwordInput.focus();
  });

  /* ===================== הזמנות ===================== */

  async function loadOrders() {
    try {
      const response = await fetch(GOOGLE_SHEETS_URL, {
        method: 'POST',
        // חשוב: text/plain ולא application/json - כדי שהדפדפן לא ישלח
        // בקשת CORS preflight (OPTIONS) ש-Google Apps Script לא תומך בה
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'list', secret: GOOGLE_SHEETS_SECRET }),
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'שגיאה בטעינת ההזמנות');
      }

      loginScreen.hidden = true;
      ordersScreen.hidden = false;

      const orders = data.orders.map(normalizeEventDate);
      // החדשות ביותר קודם
      // הזמנות "ממתין לאישור" תמיד למעלה, כדי שלא יפוספסו בין כל השאר;
      // בתוך כל קבוצה - החדשות ביותר קודם
      orders.sort((a, b) => {
        const aPending = a.status === 'ממתין לאישור' ? 0 : 1;
        const bPending = b.status === 'ממתין לאישור' ? 0 : 1;
        if (aPending !== bPending) return aPending - bPending;
        return new Date(b.submittedAt) - new Date(a.submittedAt);
      });
      renderOrders(orders);
    } catch (err) {
      loginError.textContent = 'שגיאה בטעינת ההזמנות. בדקו את החיבור לאינטרנט ונסו שוב.';
      loginError.hidden = false;
    }
  }

  // Google Sheets מזהה תאריכים כמו "2026-10-15" ומאחסן אותם כתאריך אמיתי,
  // שחוזר אלינו כחותמת זמן מלאה ב-UTC. כאן ממירים בחזרה לתאריך מקומי
  // בישראל בפורמט YYYY-MM-DD, כדי שהתאריך המוצג לא "יזוז" יום אחורה.
  const dateOnlyFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  function normalizeEventDate(order) {
    if (order.eventDate && String(order.eventDate).includes('T')) {
      order.eventDate = dateOnlyFormatter.format(new Date(order.eventDate));
    }
    return order;
  }

  function renderOrders(orders) {
    ordersTbody.innerHTML = '';

    if (orders.length === 0) {
      noOrdersMsg.hidden = false;
      ordersTable.hidden = true;
      ordersStats.textContent = 'סה"כ הזמנות: 0';
      return;
    }

    noOrdersMsg.hidden = true;
    ordersTable.hidden = false;
    ordersStats.textContent = `סה"כ הזמנות: ${orders.length}`;

    orders.forEach((order) => {
      const row = document.createElement('tr');

      const deliveryLabel = DELIVERY_LABELS[order.deliveryMethod] || order.deliveryMethod;
      const deliveryBadgeClass = order.deliveryMethod === 'delivery' ? 'badge-delivery' : 'badge-pickup';
      let deliveryCell = `<span class="badge ${deliveryBadgeClass}">${escapeHtml(deliveryLabel)}</span>`;
      if (order.deliveryMethod === 'delivery') {
        const area = order.deliveryArea ? escapeHtml(order.deliveryArea) : '';
        const fee = order.deliveryFee ? `₪${order.deliveryFee}` : '';
        deliveryCell += `<br /><small>${area} ${fee}</small>`;
      }

      const appleCell = order.appleMessage
        ? `${escapeHtml(order.appleMessage)} <small>(${escapeHtml(order.appleStyle || 'עם ציור')})</small>`
        : '-';

      const isPending = order.status === 'ממתין לאישור';
      let statusCell = isPending
        ? `<span class="badge badge-pending">ממתין לאישור</span>`
        : `<span class="badge badge-confirmed">מאושר</span>`;
      if (isPending) {
        statusCell += `<button type="button" class="approve-btn" data-order-ref="${escapeHtml(order.orderRef)}">אשר הזמנה</button>`;
      }

      row.innerHTML = `
        <td>${statusCell}</td>
        <td>${escapeHtml(order.orderRef)}</td>
        <td>${formatDateTime(order.submittedAt)}</td>
        <td>${escapeHtml(order.fullName)}</td>
        <td dir="ltr">${escapeHtml(order.phone)}</td>
        <td>${escapeHtml(order.trayType)}</td>
        <td>${escapeHtml(String(order.quantity))}</td>
        <td>${formatDate(order.eventDate)}</td>
        <td>${deliveryCell}</td>
        <td class="wrap-cell">${escapeHtml(order.address || '-')}</td>
        <td class="wrap-cell">${appleCell}</td>
        <td class="wrap-cell">${escapeHtml(order.specialRequests || '-')}</td>
      `;

      ordersTbody.appendChild(row);
    });

    ordersTbody.querySelectorAll('.approve-btn').forEach((btn) => {
      btn.addEventListener('click', () => approveOrder(btn));
    });
  }

  async function approveOrder(button) {
    const orderRef = button.dataset.orderRef;
    button.disabled = true;
    button.textContent = 'מאשר...';

    try {
      const response = await fetch(GOOGLE_SHEETS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'updateOrderStatus',
          secret: GOOGLE_SHEETS_SECRET,
          orderRef,
          status: 'מאושר',
        }),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'שגיאה באישור ההזמנה');
      loadOrders();
    } catch (err) {
      alert('שגיאה באישור ההזמנה. נסו שוב.');
      button.disabled = false;
      button.textContent = 'אשר הזמנה';
    }
  }

  function formatDateTime(isoString) {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return date.toLocaleString('he-IL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function formatDate(isoDateString) {
    if (!isoDateString) return '-';
    const date = new Date(`${isoDateString}T00:00:00`);
    return date.toLocaleDateString('he-IL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }

  /* ===================== עריכת קטלוג ===================== */

  async function loadCatalogForEditing() {
    catalogEditList.innerHTML = '<p class="catalog-loading">טוען קטלוג...</p>';

    try {
      const response = await fetch(GOOGLE_SHEETS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'getCatalog', secret: GOOGLE_SHEETS_SECRET }),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'שגיאה בטעינת הקטלוג');

      catalogEditList.dataset.loaded = 'true';
      renderCatalogEditor(data.items);
    } catch (err) {
      catalogEditList.innerHTML = '<p class="catalog-loading">שגיאה בטעינת הקטלוג. נסו לרענן את הדף.</p>';
    }
  }

  function renderCatalogEditor(items) {
    catalogEditList.innerHTML = '';

    items.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'catalog-edit-card';

      const imageHtml = item.imageUrl
        ? `<img src="${escapeHtmlAttr(item.imageUrl)}" alt="${escapeHtmlAttr(item.name)}" />`
        : `<div class="card-photo-placeholder" aria-hidden="true">🍫🍷</div>`;

      card.innerHTML = `
        ${imageHtml}
        <h3>${escapeHtml(item.name)}</h3>

        <div>
          <label for="price-${escapeHtmlAttr(item.id)}">מחיר</label>
          <input type="text" id="price-${escapeHtmlAttr(item.id)}" class="edit-price" value="${escapeHtmlAttr(item.price)}" />
        </div>

        <div>
          <label for="desc-${escapeHtmlAttr(item.id)}">תיאור</label>
          <textarea id="desc-${escapeHtmlAttr(item.id)}" class="edit-description">${escapeHtml(item.description)}</textarea>
        </div>

        <div>
          <label for="photo-${escapeHtmlAttr(item.id)}">החלפת תמונה</label>
          <input type="file" id="photo-${escapeHtmlAttr(item.id)}" class="edit-photo" accept="image/*" />
        </div>

        <div class="catalog-edit-actions">
          <button type="button" class="btn btn-primary save-catalog-item-btn">שמירה</button>
          <span class="catalog-edit-status"></span>
        </div>
      `;

      card.dataset.itemId = item.id;
      catalogEditList.appendChild(card);

      card.querySelector('.save-catalog-item-btn').addEventListener('click', () => saveCatalogItem(card, item.id));
    });
  }

  async function saveCatalogItem(card, id) {
    const statusEl = card.querySelector('.catalog-edit-status');
    const saveBtn = card.querySelector('.save-catalog-item-btn');
    const price = card.querySelector('.edit-price').value.trim();
    const description = card.querySelector('.edit-description').value.trim();
    const photoInput = card.querySelector('.edit-photo');
    const photoFile = photoInput.files[0];

    saveBtn.disabled = true;
    statusEl.textContent = 'שומר...';
    statusEl.className = 'catalog-edit-status';

    try {
      // שלב 1: עדכון מחיר ותיאור
      const updateResponse = await fetch(GOOGLE_SHEETS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'updateCatalogItem',
          secret: GOOGLE_SHEETS_SECRET,
          id,
          fields: { price, description },
        }),
      });
      const updateData = await updateResponse.json();
      if (!updateData.success) throw new Error(updateData.error || 'שגיאה בעדכון הפריט');

      // שלב 2: העלאת תמונה חדשה אם נבחרה
      if (photoFile) {
        statusEl.textContent = 'מעלה תמונה...';
        const { base64, mimeType } = await resizeImageToBase64(photoFile);

        const uploadResponse = await fetch(GOOGLE_SHEETS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'uploadCatalogImage',
            secret: GOOGLE_SHEETS_SECRET,
            id,
            imageBase64: base64,
            mimeType,
          }),
        });
        const uploadData = await uploadResponse.json();
        if (!uploadData.success) throw new Error(uploadData.error || 'שגיאה בהעלאת התמונה');

        const img = card.querySelector('img, .card-photo-placeholder');
        if (img) {
          const newImg = document.createElement('img');
          newImg.src = uploadData.imageUrl;
          newImg.alt = card.querySelector('h3').textContent;
          img.replaceWith(newImg);
        }
        photoInput.value = '';
      }

      statusEl.textContent = '✓ נשמר בהצלחה';
      statusEl.className = 'catalog-edit-status is-success';
    } catch (err) {
      statusEl.textContent = 'שגיאה בשמירה, נסו שוב';
      statusEl.className = 'catalog-edit-status is-error';
    } finally {
      saveBtn.disabled = false;
    }
  }

  // מקטין ודוחס תמונה בדפדפן לפני שליחה (עד 1000px ברוחב), כדי שההעלאה
  // תהיה מהירה והתמונות בקטלוג יהיו אחידות בגודל
  function resizeImageToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('שגיאה בקריאת הקובץ'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('שגיאה בטעינת התמונה'));
        img.onload = () => {
          const maxDimension = 1000;
          const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
          const base64 = dataUrl.split(',')[1];
          resolve({ base64, mimeType: 'image/jpeg' });
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // מניעת הזרקת HTML זדוני - כל טקסט שמגיע מהזמנה/קטלוג עובר בריחה לפני הצגה
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function escapeHtmlAttr(str) {
    return String(str ?? '').replace(/"/g, '&quot;');
  }

});
