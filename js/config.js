/* =====================================================================
   מגשי פירות נטע סילמן — הגדרות חיבור ל-Google Sheets
   האתר הזה מתארח כקבצים סטטיים (GitHub Pages) וללא שרת משלו, ולכן
   ההזמנות נשלחות ונקראות ישירות מול Google Apps Script Web App
   שמחובר לגיליון ההזמנות.

   *** שימו לב: מכיוון שאין שרת, הערכים כאן גלויים לכל מי שבודק את קוד
   האתר (View Source). זה שקול לכך שה"סיסמה" ניתנת לצפייה טכנית - זהו
   פשרה מודעת לטובת אחסון חינמי ופשוט, ולא הגנה אמיתית. ***
   ===================================================================== */

const GOOGLE_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbzv0KYNVrRPPHqlLCABLU6TxjnEojgrVLHEazbQ05xCuonJTnaz7ajIo1ah6uVDVMcIAQ/exec';
const GOOGLE_SHEETS_SECRET = '63b21bb1b6bae23b30116a7b78e378155530af37d460fb8d';

// סיסמת הכניסה למסך הניהול (admin.html) - שינוי כאן משנה את הסיסמה בפועל.
const ADMIN_PASSWORD = 'netasilman2026';
