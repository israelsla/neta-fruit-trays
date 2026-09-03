/* =====================================================================
   מגשי פירות נטע סילמן — סקריפט עמוד ניהול ההזמנות
   מבקש סיסמה, שולף הזמנות מהשרת (GET /api/orders) ומציג אותן בטבלה.
   הסיסמה נשמרת בדפדפן הזה (localStorage) כדי שלא יהיה צורך להקליד אותה
   מחדש בכל כניסה - נוח למשל בטלפון שנטע נכנסת ממנו. היא לא נשלחת לשום
   מקום חוץ מהשרת עצמו. לחיצה על "יציאה" מוחקת אותה מהדפדפן.
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

  // ---------- ניסיון כניסה אוטומטי אם כבר יש סיסמה שמורה בטאב הזה ----------
  const savedPassword = localStorage.getItem('ns-admin-password');
  if (savedPassword) {
    tryLoadOrders(savedPassword);
  }

  loginForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const password = passwordInput.value;
    tryLoadOrders(password);
  });

  refreshBtn.addEventListener('click', () => {
    const password = localStorage.getItem('ns-admin-password');
    if (password) tryLoadOrders(password);
  });

  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('ns-admin-password');
    ordersScreen.hidden = true;
    loginScreen.hidden = false;
    passwordInput.value = '';
    passwordInput.focus();
  });

  async function tryLoadOrders(password) {
    try {
      const response = await fetch('/api/orders', {
        headers: { 'x-admin-password': password },
      });

      if (response.status === 401) {
        loginError.hidden = false;
        localStorage.removeItem('ns-admin-password');
        return;
      }

      if (!response.ok) {
        throw new Error('שגיאת שרת');
      }

      const orders = await response.json();

      localStorage.setItem('ns-admin-password', password);
      loginError.hidden = true;
      loginScreen.hidden = true;
      ordersScreen.hidden = false;

      renderOrders(orders);
    } catch (err) {
      loginError.textContent = 'שגיאה בהתחברות לשרת. ודאו שהשרת פועל ונסו שוב.';
      loginError.hidden = false;
    }
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
