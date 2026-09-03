/* =====================================================================
   מגשי פירות נטע סילמן — שרת הזמנות
   שרת Node.js/Express קטן שמטרתו:
   1. להגיש את קבצי האתר הסטטיים (index.html, css, js, img)
   2. לקבל הזמנות מהטופס (POST /api/orders) ולשמור אותן
   3. להציג לנטע בלבד (מאחורי סיסמה) רשימת הזמנות (GET /api/orders)
      דרך עמוד הניהול admin.html

   אחסון ההזמנות:
   - אם הוגדרו משתני הסביבה GOOGLE_SHEETS_URL ו-GOOGLE_SHEETS_SECRET,
     ההזמנות נשמרות ונקראות מתוך גיליון Google Sheets (אחסון קבוע,
     לא נמחק בכל הפעלה מחדש של השרת - מומלץ לשרת ציבורי).
   - אחרת (לפיתוח מקומי בלבד) נשמר קובץ data/orders.json על הדיסק.
   ===================================================================== */

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;
const ORDERS_FILE = path.join(__dirname, 'data', 'orders.json');

// הסיסמה נלקחת ממשתנה סביבה (ADMIN_PASSWORD) ולעולם לא נשמרת בקוד עצמו,
// כדי שאפשר יהיה להעלות את הפרויקט הזה ל-GitHub בבטחה.
// בפיתוח מקומי בלבד (כשלא הוגדר משתנה סביבה) נשתמש בסיסמת ברירת מחדל.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'neta2026';
if (!process.env.ADMIN_PASSWORD) {
  console.warn('אזהרה: לא הוגדר משתנה סביבה ADMIN_PASSWORD - משתמשים בסיסמת ברירת מחדל לפיתוח בלבד ("neta2026"). בכל שרת ציבורי יש להגדיר ADMIN_PASSWORD משלכם.');
}

const SHEETS_URL = process.env.GOOGLE_SHEETS_URL;
const SHEETS_SECRET = process.env.GOOGLE_SHEETS_SECRET;
const USE_SHEETS = Boolean(SHEETS_URL && SHEETS_SECRET);

if (USE_SHEETS) {
  console.log('אחסון הזמנות: Google Sheets (קבוע)');
} else {
  console.warn('אחסון הזמנות: קובץ מקומי (data/orders.json) - מתאים לפיתוח בלבד! בשרת ציבורי ההזמנות עלולות להימחק. הגדירו GOOGLE_SHEETS_URL ו-GOOGLE_SHEETS_SECRET כדי לעבור לאחסון קבוע.');
}

app.use(express.json());
app.use(express.static(__dirname));

/* ---------- אחסון מקומי (קובץ JSON) - לפיתוח בלבד ---------- */

function readOrdersLocal() {
  try {
    const raw = fs.readFileSync(ORDERS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    return [];
  }
}

function appendOrderLocal(order) {
  const orders = readOrdersLocal();
  orders.push(order);
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf-8');
}

/* ---------- אחסון קבוע ב-Google Sheets ---------- */

async function callSheetsWebApp(payload) {
  const response = await fetch(SHEETS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, secret: SHEETS_SECRET }),
  });

  if (!response.ok) {
    throw new Error(`Google Sheets השיב בשגיאה: ${response.status}`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'שגיאה לא ידועה מול Google Sheets');
  }

  return data;
}

async function readOrdersSheets() {
  const data = await callSheetsWebApp({ action: 'list' });
  return data.orders.map(normalizeEventDate);
}

// Google Sheets מזהה תאריכים כמו "2026-10-15" ומאחסן אותם כתאריך אמיתי,
// שחוזר אלינו כחותמת זמן מלאה ב-UTC (למשל "2026-10-09T21:00:00.000Z" עבור
// חצות ה-10 באוקטובר בישראל). כאן ממירים בחזרה לתאריך מקומי בישראל בפורמט
// YYYY-MM-DD, כדי שהתאריך המוצג לא "יזוז" יום אחורה.
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

async function appendOrderSheets(order) {
  await callSheetsWebApp({ action: 'add', order });
}

/* ---------- ממשק אחיד: משתמש ב-Sheets אם מוגדר, אחרת בקובץ המקומי ---------- */

async function readOrders() {
  return USE_SHEETS ? readOrdersSheets() : readOrdersLocal();
}

async function appendOrder(order) {
  return USE_SHEETS ? appendOrderSheets(order) : appendOrderLocal(order);
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

/* ---------- קבלת הזמנה חדשה מהטופס באתר ---------- */

app.post('/api/orders', async (req, res) => {
  const body = req.body || {};

  // ולידציה בסיסית בצד השרת - לא סומכים רק על הדפדפן
  const requiredFields = ['fullName', 'phone', 'trayType', 'quantity', 'eventDate', 'deliveryMethod'];
  for (const field of requiredFields) {
    if (!body[field]) {
      return res.status(400).json({ error: `שדה חסר: ${field}` });
    }
  }

  const newOrder = {
    orderRef: generateOrderReference(),
    submittedAt: new Date().toISOString(),
    fullName: String(body.fullName).trim(),
    phone: String(body.phone).trim(),
    trayType: String(body.trayType).trim(),
    quantity: Number(body.quantity) || 1,
    eventDate: body.eventDate,
    deliveryMethod: body.deliveryMethod, // 'pickup' | 'delivery'
    deliveryArea: body.deliveryArea || null,
    deliveryFee: Number(body.deliveryFee) || 0,
    address: String(body.address || '').trim(),
    specialRequests: String(body.specialRequests || '').trim(),
  };

  try {
    await appendOrder(newOrder);
    res.status(201).json({ orderRef: newOrder.orderRef, submittedAt: newOrder.submittedAt });
  } catch (err) {
    console.error('שגיאה בשמירת הזמנה:', err.message);
    res.status(500).json({ error: 'שגיאה בשמירת ההזמנה, נסו שוב' });
  }
});

/* ---------- שליפת כל ההזמנות - מוגן בסיסמה, עבור עמוד הניהול בלבד ---------- */

app.get('/api/orders', async (req, res) => {
  const password = req.header('x-admin-password');

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'סיסמה שגויה' });
  }

  try {
    const orders = await readOrders();
    // החדשות ביותר קודם
    const sorted = [...orders].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    res.json(sorted);
  } catch (err) {
    console.error('שגיאה בקריאת הזמנות:', err.message);
    res.status(500).json({ error: 'שגיאה בטעינת ההזמנות, נסו שוב' });
  }
});

app.listen(PORT, () => {
  console.log(`השרת פועל: http://localhost:${PORT}`);
  console.log(`עמוד ניהול הזמנות: http://localhost:${PORT}/admin.html`);
});
