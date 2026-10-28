/**
 * admin-analytics.js - מודול אנליטיקס וסטטיסטיקות לוח בקרה
 * כולל אינטגרציה עם:
 * 1. OneSignal REST API (דרך שרת Apps Script - מאובטח)
 * 2. Google Search Console API (באמצעות Google OAuth Access Token)
 * 3. Bing Webmaster Tools API (באמצעות Apps Script / מפתח API מקומי)
 */

import { APPS_SCRIPT_URL, APPS_SCRIPT_SECRET, googleLogin, showStatus, hideStatus } from './admin-core.js';

// Cache נתונים
let oneSignalDataCache = null;
let gscDataCache = null;
let bingDataCache = null;

/**
 * טעינת נתוני OneSignal
 */
export async function loadOneSignalStats(forceRefresh = false) {
    const subscribersCountEl = document.getElementById('os-subscribers-count');
    const messagableCountEl = document.getElementById('os-messagable-count');
    const lastSentListEl = document.getElementById('os-notifications-list');
    const statusNoteEl = document.getElementById('os-status-note');

    if (!subscribersCountEl || !messagableCountEl) return;

    if (!forceRefresh && oneSignalDataCache) {
        renderOneSignalData(oneSignalDataCache);
        return;
    }

    subscribersCountEl.textContent = 'טוען...';
    messagableCountEl.textContent = 'טוען...';
    if (lastSentListEl) lastSentListEl.innerHTML = '<li class="analytics-loading-item">טוען נתונים מ-OneSignal...</li>';

    try {
        const res = await window.fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'getOneSignalStats',
                secret: APPS_SCRIPT_SECRET
            })
        });

        if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
        const data = await res.json();

        if (data.success) {
            oneSignalDataCache = data;
            renderOneSignalData(data);
            if (statusNoteEl) statusNoteEl.textContent = 'עודכן זה עתה ✓';
        } else {
            throw new Error(data.error || 'שגיאה בקבלת נתונים מ-Apps Script');
        }
    } catch (err) {
        console.warn('OneSignal stats fetch failed:', err);
        subscribersCountEl.textContent = '-';
        messagableCountEl.textContent = '-';
        if (lastSentListEl) {
            lastSentListEl.innerHTML = `
                <li style="color:#e74c3c; padding:8px 0;">
                    <i class="fas fa-exclamation-circle"></i> טרם הוגדר מפתח OneSignal REST API ב-Apps Script.
                    <br><small style="color:#777;">הנתונים יוצגו אוטומטית ברגע שהמפתח יוגדר.</small>
                </li>`;
        }
        if (statusNoteEl) statusNoteEl.textContent = 'לא מחובר';
    }
}

function renderOneSignalData(data) {
    const subscribersCountEl = document.getElementById('os-subscribers-count');
    const messagableCountEl = document.getElementById('os-messagable-count');
    const lastSentListEl = document.getElementById('os-notifications-list');

    const app = data.app || {};
    const notifications = data.notifications || [];

    const total = app.players ?? app.player_count ?? '-';
    const messagable = app.messagable_players ?? '-';

    if (subscribersCountEl) subscribersCountEl.textContent = typeof total === 'number' ? total.toLocaleString() : total;
    if (messagableCountEl) messagableCountEl.textContent = typeof messagable === 'number' ? messagable.toLocaleString() : messagable;

    if (lastSentListEl) {
        lastSentListEl.innerHTML = '';
        if (notifications.length === 0) {
            lastSentListEl.innerHTML = '<li style="color:#777; padding:8px 0;">לא נשלחו התראות לאחרונה</li>';
            return;
        }

        notifications.slice(0, 5).forEach(notif => {
            const li = document.createElement('li');
            li.className = 'analytics-list-item';

            const title = (notif.headings && (notif.headings.he || notif.headings.en)) || 'התראה ללא כותרת';
            const sentAt = notif.queued_at ? new Date(notif.queued_at * 1000).toLocaleDateString('he-IL', {
                month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
            }) : '-';
            const successful = notif.successful ?? 0;
            const converted = notif.converted ?? 0;

            li.innerHTML = `
                <div style="flex:1;">
                    <strong style="display:block; color:#2c3e50; font-size:0.95rem;">${escapeHtml(title)}</strong>
                    <span style="font-size:0.8rem; color:#7f8c8d;">${sentAt}</span>
                </div>
                <div style="text-align:left; font-size:0.85rem; display:flex; gap:12px;">
                    <span title="נמסר בהצלחה"><i class="fas fa-check-circle" style="color:#27ae60;"></i> ${successful}</span>
                    <span title="הקלקות"><i class="fas fa-mouse-pointer" style="color:#2980b9;"></i> ${converted}</span>
                </div>
            `;
            lastSentListEl.appendChild(li);
        });
    }
}

/**
 * טעינת נתוני Google Search Console
 */
export async function loadSearchConsoleStats(forceRefresh = false) {
    const clicksEl = document.getElementById('gsc-clicks-count');
    const impressionsEl = document.getElementById('gsc-impressions-count');
    const ctrEl = document.getElementById('gsc-ctr-val');
    const positionEl = document.getElementById('gsc-pos-val');
    const pagesListEl = document.getElementById('gsc-pages-list');
    const statusNoteEl = document.getElementById('gsc-status-note');

    if (!clicksEl || !impressionsEl) return;

    if (!forceRefresh && gscDataCache) {
        renderGscData(gscDataCache);
        return;
    }

    clicksEl.textContent = 'טוען...';
    impressionsEl.textContent = 'טוען...';
    if (ctrEl) ctrEl.textContent = '...';
    if (positionEl) positionEl.textContent = '...';
    if (pagesListEl) pagesListEl.innerHTML = '<li class="analytics-loading-item">טוען נתונים מ-Search Console...</li>';

    try {
        const token = await googleLogin();
        if (!token) throw new Error('נדרשת התחברות לחשבון גוגל');

        // תאריכים: 28 ימים אחרונים
        const today = new Date();
        const end = new Date(today);
        end.setDate(today.getDate() - 2); // נתוני GSC מתעכבים ביומיים
        const start = new Date(end);
        start.setDate(end.getDate() - 28);

        const formatDate = d => d.toISOString().split('T')[0];
        // הנכס המאומת המדויק מ-Google Search Console
        const exactSite = "https://yt2178.github.io/";
        const queryUrl = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(exactSite)}/searchAnalytics/query`;
        
        console.log("Querying GSC API for site:", exactSite);
        const response = await window.fetch(queryUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                startDate: formatDate(start),
                endDate: formatDate(end),
                dimensions: ['page'],
                rowLimit: 5
            })
        });

        if (!response.ok) {
            const errBody = await response.json().catch(() => ({}));
            console.error("GSC API Error response:", response.status, errBody);
            if (response.status === 403) {
                throw new Error('שגיאת הרשאה (403): יש לבצע התנתקות והתחברות מחדש עם גוגל באתר הניהול כדי לאשר את הרשאת ה-Search Console');
            }
            throw new Error(`שגיאת Search Console (${response.status}): ${errBody.error?.message || 'נכשל'}`);
        }

        const data = await response.json();
        gscDataCache = data;
        renderGscData(data);
        if (statusNoteEl) statusNoteEl.textContent = '28 ימים אחרונים ✓';
    } catch (err) {
        console.warn('GSC stats fetch failed:', err);
        clicksEl.textContent = '-';
        impressionsEl.textContent = '-';
        if (ctrEl) ctrEl.textContent = '-';
        if (positionEl) positionEl.textContent = '-';
        if (pagesListEl) {
            pagesListEl.innerHTML = `
                <li style="color:#e67e22; padding:8px 0; font-size:0.88rem;">
                    <i class="fas fa-info-circle"></i> ${escapeHtml(err.message || 'התחבר עם חשבון גוגל המנהל את Search Console כדי לצפות בנתונים')}.
                </li>`;
        }
        if (statusNoteEl) statusNoteEl.textContent = 'דורש התחברות/הרשאה';
    }
}

function renderGscData(data) {
    const clicksEl = document.getElementById('gsc-clicks-count');
    const impressionsEl = document.getElementById('gsc-impressions-count');
    const ctrEl = document.getElementById('gsc-ctr-val');
    const positionEl = document.getElementById('gsc-pos-val');
    const pagesListEl = document.getElementById('gsc-pages-list');

    const rows = data.rows || [];
    let totalClicks = 0;
    let totalImpressions = 0;
    let totalCtrSum = 0;
    let totalPosSum = 0;

    rows.forEach(r => {
        totalClicks += r.clicks || 0;
        totalImpressions += r.impressions || 0;
        totalCtrSum += (r.ctr || 0) * (r.impressions || 1);
        totalPosSum += (r.position || 0) * (r.impressions || 1);
    });

    const avgCtr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(1) + '%' : '0%';
    const avgPos = totalImpressions > 0 ? (totalPosSum / totalImpressions).toFixed(1) : '-';

    if (clicksEl) clicksEl.textContent = totalClicks.toLocaleString();
    if (impressionsEl) impressionsEl.textContent = totalImpressions.toLocaleString();
    if (ctrEl) ctrEl.textContent = avgCtr;
    if (positionEl) positionEl.textContent = avgPos;

    if (pagesListEl) {
        pagesListEl.innerHTML = '';
        if (rows.length === 0) {
            pagesListEl.innerHTML = '<li style="color:#777; padding:8px 0;">אין עדיין נתוני חשיפות לתקופה זו</li>';
            return;
        }

        rows.forEach(row => {
            const li = document.createElement('li');
            li.className = 'analytics-list-item';
            const pagePath = row.keys ? row.keys[0].replace('https://yt2178.github.io', '') || '/' : '/';

            li.innerHTML = `
                <div style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; direction:ltr; text-align:right;">
                    <strong style="color:#1a4b84; font-size:0.9rem;" title="${escapeHtml(row.keys[0])}">${escapeHtml(pagePath)}</strong>
                </div>
                <div style="text-align:left; font-size:0.85rem; display:flex; gap:12px; margin-right:10px;">
                    <span title="קליקים"><i class="fas fa-mouse-pointer" style="color:#27ae60;"></i> ${row.clicks || 0}</span>
                    <span title="חשיפות"><i class="fas fa-eye" style="color:#2980b9;"></i> ${row.impressions || 0}</span>
                    <span title="מיקום ממוצע"><i class="fas fa-chart-line" style="color:#8e44ad;"></i> ${(row.position || 0).toFixed(1)}</span>
                </div>
            `;
            pagesListEl.appendChild(li);
        });
    }
}

/**
 * טעינת נתוני Bing Webmaster Tools
 */
export async function loadBingStats(forceRefresh = false) {
    const clicksEl = document.getElementById('bing-clicks-count');
    const impressionsEl = document.getElementById('bing-impressions-count');
    const queriesListEl = document.getElementById('bing-queries-list');
    const statusNoteEl = document.getElementById('bing-status-note');

    if (!clicksEl || !impressionsEl) return;

    if (!forceRefresh && bingDataCache) {
        renderBingData(bingDataCache);
        return;
    }

    clicksEl.textContent = 'טוען...';
    impressionsEl.textContent = 'טוען...';
    if (queriesListEl) queriesListEl.innerHTML = '<li class="analytics-loading-item">טוען נתונים מ-Bing...</li>';

    const localApiKey = sessionStorage.getItem('bing_webmaster_api_key') || '';

    try {
        const res = await window.fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'getBingStats',
                secret: APPS_SCRIPT_SECRET,
                bingApiKey: localApiKey
            })
        });

        if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
        const data = await res.json();

        if (data.success && data.d) {
            bingDataCache = data.d;
            renderBingData(data.d);
            if (statusNoteEl) statusNoteEl.textContent = 'עודכן זה עתה ✓';
        } else {
            throw new Error(data.error || 'לא התקבלו נתונים מ-Bing');
        }
    } catch (err) {
        console.warn('Bing stats fetch failed:', err);
        clicksEl.textContent = '-';
        impressionsEl.textContent = '-';
        if (queriesListEl) {
            queriesListEl.innerHTML = `
                <li style="padding:10px 0; font-size:0.85rem; color:#555;">
                    <div style="margin-bottom:8px;">
                        <i class="fas fa-key" style="color:#f39c12;"></i> <strong>חיבור מפתח Bing Webmaster API:</strong>
                    </div>
                    <div style="display:flex; gap:6px;">
                        <input type="password" id="bing-api-key-input" placeholder="הזן מפתח API של Bing" class="premium-input" style="flex:1; font-size:0.8rem; padding:6px 10px;">
                        <button id="save-bing-key-btn" class="premium-btn small" style="background-color:#2980b9;">שמור</button>
                    </div>
                    <small style="color:#888; display:block; margin-top:6px;">ניתן להפיק מפתח ב-Bing Webmasters > Settings > API Access</small>
                </li>`;
            
            document.getElementById('save-bing-key-btn')?.addEventListener('click', () => {
                const key = document.getElementById('bing-api-key-input')?.value?.trim();
                if (key) {
                    sessionStorage.setItem('bing_webmaster_api_key', key);
                    loadBingStats(true);
                }
            });
        }
        if (statusNoteEl) statusNoteEl.textContent = 'דרוש מפתח';
    }
}

function renderBingData(rows) {
    const clicksEl = document.getElementById('bing-clicks-count');
    const impressionsEl = document.getElementById('bing-impressions-count');
    const queriesListEl = document.getElementById('bing-queries-list');

    let totalClicks = 0;
    let totalImpressions = 0;

    if (Array.isArray(rows)) {
        rows.forEach(r => {
            totalClicks += r.Clicks || 0;
            totalImpressions += r.Impressions || 0;
        });
    }

    if (clicksEl) clicksEl.textContent = totalClicks.toLocaleString();
    if (impressionsEl) impressionsEl.textContent = totalImpressions.toLocaleString();

    if (queriesListEl) {
        queriesListEl.innerHTML = '';
        if (!Array.isArray(rows) || rows.length === 0) {
            queriesListEl.innerHTML = '<li style="color:#777; padding:8px 0;">אין עדיין נתוני חיפוש מ-Bing</li>';
            return;
        }

        rows.slice(0, 5).forEach(row => {
            const li = document.createElement('li');
            li.className = 'analytics-list-item';
            const pos = row.AvgClickPosition ? (row.AvgClickPosition / 10).toFixed(1) : '-';

            li.innerHTML = `
                <div style="flex:1;">
                    <strong style="color:#2c3e50; font-size:0.9rem;">${escapeHtml(row.Query || 'כללי')}</strong>
                </div>
                <div style="text-align:left; font-size:0.85rem; display:flex; gap:12px;">
                    <span title="קליקים"><i class="fas fa-mouse-pointer" style="color:#27ae60;"></i> ${row.Clicks || 0}</span>
                    <span title="חשיפות"><i class="fas fa-eye" style="color:#2980b9;"></i> ${row.Impressions || 0}</span>
                    <span title="מיקום"><i class="fas fa-chart-line" style="color:#8e44ad;"></i> ${pos}</span>
                </div>
            `;
            queriesListEl.appendChild(li);
        });
    }
}

/**
 * רענון כל הנתונים
 */
export async function refreshAllAnalytics() {
    showStatus('מרענן נתוני אנליטיקס...', 40);
    try {
        await Promise.allSettled([
            loadOneSignalStats(true),
            loadSearchConsoleStats(true),
            loadBingStats(true)
        ]);
        showStatus('הנתונים עודכנו בהצלחה!', 100);
        setTimeout(hideStatus, 1200);
    } catch (e) {
        hideStatus();
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
