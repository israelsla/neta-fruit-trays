/* =====================================================================
   מגשי פירות נטע סילמן — סקריפט עמוד ניהול ההזמנות
   האתר סטטי לגמרי (GitHub Pages, ללא שרת) - עמוד זה קורא את ההזמנות
   ישירות מתוך Google Sheets (ראו js/config.js לכתובת ולסיסמה).

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

  const DELIVERY_LABELS = {
    pickup: 'איסוף עצמי',
    delivery: 'משלוח',
  };

  // ---------- ניסיון כניסה אוטומטי אם כבר יש סיסמה שמורה בדפדפן הזה ----------
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
      orders.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
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

      row.innerHTML = `
        <td>${escapeHtml(order.orderRef)}</td>
        <td>${formatDateTime(order.submittedAt)}</td>
        <td>${escapeHtml(order.fullName)}</td>
        <td dir="ltr">${escapeHtml(order.phone)}</td>
        <td>${escapeHtml(order.trayType)}</td>
        <td>${escapeHtml(String(order.quantity))}</td>
        <td>${formatDate(order.eventDate)}</td>
        <td>${deliveryCell}</td>
        <td class="wrap-cell">${escapeHtml(order.address || '-')}</td>
        <td class="wrap-cell">${escapeHtml(order.specialRequests || '-')}</td>
      `;

      ordersTbody.appendChild(row);
    });
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

  // מניעת הזרקת HTML זדוני - כל טקסט שמגיע מהזמנה עובר בריחה לפני הצגה
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

});
