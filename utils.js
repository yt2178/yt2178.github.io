// utils.js
// ---- פונקציית עזר לניקוי נתיבים ----
export function cleanPath(path) {
    if (!path) return '';
    let p = String(path).trim();
    if (p.startsWith('- ')) p = p.slice(2).trim();
    p = p.replace(/^['"]|['"]$/g, '').trim();
    p = p.replace(/^(?:\.\/|\/)+/, '');
    try { p = decodeURIComponent(p); } catch (e) { /* silent */ }
    return p;
}
// ---- פונקציה פשוטה לפירוק Front Matter ----
export function parseFrontMatter(content) {
    const match = /^---\s*([\s\S]+?)\s*---/.exec(content);
    if (!match) return { data: {}, content };

    const yamlText = match[1];
    const body = content.slice(match[0].length).trim();

    const data = {};
    let currentListKey = null;

    const lines = yamlText.trim().split('\n');
    for (const line of lines) {
        const keyValueMatch = line.match(/^([^:]+):(.*)/);

        if (keyValueMatch) {
            const key = keyValueMatch[1].trim();
            const value = keyValueMatch[2].trim();

            if (value) {
                data[key] = value.replace(/^['"]|['"]$/g, '');
                currentListKey = null;
            } else {
                data[key] = [];
                currentListKey = key;
            }
            continue;
        }

        if (currentListKey && line.trim().startsWith('- ')) {
            const listItemMatch = line.match(/-\s*['"]?([^'"]+)['"]?$/);
            if (listItemMatch && listItemMatch[1]) {
                data[currentListKey].push(listItemMatch[1].trim());
            }
        }
    }
    return { data, content: body };
}
// ---- פונקציה לטעינת JSON סטטי ----
export async function fetchStaticJson(path) {
    const cleanName = path.split('?')[0];
    const query = path.includes('?') ? '?' + path.split('?')[1] : '';
    const url = `./data/${cleanName}.json${query}`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Network response error for ${url}`);
        return await response.json();
    } catch (error) {
        console.error(`Error fetching static JSON ${path}:`, error);
        return { error: true, message: 'אירעה שגיאה בטעינת הנתונים (JSON). נא לנסות שוב מאוחר יותר.' };
    }
}
// פונקציות עזר לנעילת הפוקוס
export function focusLock(modalElement, focusTarget) {
    const focusable = Array.from(modalElement.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'));
    const first = focusable.at(0);
    const last = focusable.at(-1);

    if (focusTarget) {
        focusTarget.focus();
    } else if (first) {
        first.focus();
    }

    modalElement.addEventListener('keydown', (e) => {
        const isTab = (e.key === 'Tab' || e.keyCode === 9);
        if (!isTab) return;

        if (e.shiftKey) { // Shift + Tab
            if (document.activeElement === first) {
                last.focus();
                e.preventDefault();
            }
        } else { // Tab
            if (document.activeElement === last) {
                first.focus();
                e.preventDefault();
            }
        }
    });
}
export function getHebrewYear() {
    const now = new Date();
    // יצירת פורמט עברי (מספרים עבריים)
    const hebrewDate = now.toLocaleDateString('he-IL-u-ca-hebrew', { year: 'numeric' });
    // לצרכי פשטות, נשתמש בפורמט המספרי העברי:
    return hebrewDate;
}

// ---- פונקציה לנרמול קישורי תמונות (מעבר ל-Google CDN ישיר ללא חסימות סינון) ----
export function normalizeImageUrl(url) {
    if (!url || typeof url !== 'string') return url;
    const driveMatch = url.match(/[?&]id=([^&]+)/);
    if (driveMatch && url.includes('drive.google.com')) {
        return `https://lh3.googleusercontent.com/d/${driveMatch[1]}=w1000`;
    }
    return url;
}