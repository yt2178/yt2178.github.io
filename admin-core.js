/**
 * admin-core.js - Shared constants, state, and Google API logic
 * Centralizes core functionality to avoid circular dependencies.
 */

// ============================================================
// 1. Constants
// ============================================================
export const REPO_OWNER = 'yt2178';
export const REPO_NAME = (typeof window !== 'undefined' && window.location.hostname === 'yt2178.github.io' && !window.location.pathname.startsWith('/Beit-Halevi'))
    ? 'yt2178.github.io'
    : 'Beit-Halevi';
export const JSON_FILE_PATH = 'data/news.json';
export const HISTORY_JSON_PATH = 'data/history.json';
export const SITE_CONFIG_PATH = 'data/site-config.json';
export const GALLERY_JSON_PATH = 'data/gallery.json';
export const TASKS_JSON_PATH = 'data/admin-tasks.json';
export const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwVs5qCMlfPJOMikCwzzMdjygVl80byjxLSevub_sSeWQPnBakL-ioOQlgfYo2IDz1SHw/exec";
export const APPS_SCRIPT_SECRET = "beit_halevi_secret_2026";
export const MESSAGES_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRpxzvw-KY5zHaayaA6eaDMJ4OG8DxvrPHfBpC7_yI0TBlnMyGZm378VJiv3vJOmdSqtjon7SaPWVno/pub?output=csv";

// Google API Config
export const GOOGLE_CLIENT_ID = "1038052523883-b3r3k21kc6pvu3t3vken0f963q6cl0q1.apps.googleusercontent.com";
export const GOOGLE_SCOPES = atob("aHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vYXV0aC9kcml2ZS5maWxl") + " email profile openid";
export const GOOGLE_FOLDER_ID = "1viRoR0PVmGrYNtuTSxRBTn5v4lSPvxow";

// Storage Keys
export const GITHUB_TOKEN_KEY = 'admin_github_token';
export const GITHUB_USERNAME_KEY = 'admin_github_username';

// ============================================================
// 2. Global State
// ============================================================
export let GITHUB_TOKEN = sessionStorage.getItem(GITHUB_TOKEN_KEY);
export let GITHUB_USERNAME = sessionStorage.getItem(GITHUB_USERNAME_KEY);

// Security cleanup: remove vulnerable tokens from local storage
localStorage.removeItem(GITHUB_TOKEN_KEY);
localStorage.removeItem(GITHUB_USERNAME_KEY);
localStorage.removeItem('onesignal_rest_key');

window.tokenClient = null;

let cachedGoogleToken = null;
let tokenExpiry = 0;

export function updateGithubAuth(token, username) {
    GITHUB_TOKEN = token;
    GITHUB_USERNAME = username;
}

// ============================================================
// 3. Status & UI Helpers
// ============================================================
export function showStatus(text, progress = null, isError = false) {
    const overlay = document.getElementById('status-overlay');
    const statusText = document.getElementById('status-text');
    const statusProgress = document.getElementById('status-progress');
    const closeBtn = document.getElementById('close-status-btn');

    if (!overlay || !statusText) return;

    overlay.style.display = 'flex';
    statusText.textContent = text;
    statusText.style.color = isError ? '#e74c3c' : '#2c3e50';
    if (closeBtn) closeBtn.style.display = isError ? 'inline-block' : 'none';

    if (progress !== null && statusProgress) {
        statusProgress.parentElement.style.display = 'block';
        statusProgress.style.width = progress + '%';
    } else if (statusProgress) {
        statusProgress.parentElement.style.display = 'none';
    }
}

export function hideStatus() {
    const overlay = document.getElementById('status-overlay');
    if (overlay) overlay.style.display = 'none';
}

// ============================================================
// 4. Utility Functions
// ============================================================
export function encodeToBase64(str) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    let binary = '';
    bytes.forEach((b) => binary += String.fromCharCode(b));
    return btoa(binary);
}

export function decodeBase64ToUtf8(base64Str) {
    try {
        const binary = atob(base64Str);
        const bytes = Uint8Array.from(binary.split('').map(char => char.charCodeAt(0)));
        const decoder = new TextDecoder();
        return decoder.decode(bytes);
    } catch (e) {
        console.error("Base64 decode error:", e);
        return "";
    }
}

// ============================================================
// 5. Google API Logic
// ============================================================
export function initGoogleLogin() {
    if (typeof google === 'undefined' || !google.accounts) {
        console.warn("Google Identity Services not loaded yet.");
        return;
    }

    if (window.tokenClient) {
        return;
    }

    const scopeStr = atob("aHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vYXV0aC9kcml2ZS5maWxl") + " email profile openid";

    try {
        window.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: scopeStr,
            callback: () => {
                // This will be overridden in googleLogin
            },
        });
    } catch (err) {
        console.error("GIS Init Failed:", err);
    }
}
window.initGoogleLogin = initGoogleLogin; // Export to window for global access

export async function googleLogin() {
    return new Promise((resolve, reject) => {
        if (cachedGoogleToken && Date.now() < tokenExpiry) {
            return resolve(cachedGoogleToken);
        }

        if (!window.tokenClient) {
            initGoogleLogin();
        }

        if (!window.tokenClient) {
            return reject(new Error("גוגל לא נטען כראוי, נא לרענן או לבדוק חיבור אינטרנט."));
        }

        window.tokenClient.callback = (tokenResponse) => {
            if (tokenResponse.error) {
                console.error("Google Auth Error:", tokenResponse);

                // [חדש] טיפול בשגיאות ספציפיות
                if (tokenResponse.error === 'popup_closed_by_user') {
                    reject(new Error("סגרת את חלון ההתחברות. נסה שוב."));
                } else if (tokenResponse.error === 'access_denied') {
                    reject(new Error("הגבלת תגישות לאתר. בדוק את הגדרות חשבון גוגל שלך."));
                } else {
                    const errorMsg = tokenResponse.error_description || tokenResponse.error;
                    reject(new Error(`שגיאת אימות גוגל: ${errorMsg}`));
                }
            } else if (tokenResponse.access_token) {
                cachedGoogleToken = tokenResponse.access_token;
                tokenExpiry = Date.now() + ((tokenResponse.expires_in || 3599) * 1000) - 60000;
                resolve(tokenResponse.access_token);
            } else {
                reject(new Error("לא התקבל Access Token מגוגל."));
            }
        };

        const scopeStr = atob("aHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vYXV0aC9kcml2ZS5maWxl") + " email profile openid";
        console.log("Requesting access token with explicit scope:", scopeStr);

        // REQUEST TOKEN
        try {
            window.tokenClient.requestAccessToken({
                prompt: '',
                scope: scopeStr
            });
            console.log("requestAccessToken called.");
        } catch (requestErr) {
            console.error("Error calling requestAccessToken:", requestErr);
            reject(requestErr);
        }
    });
}

export async function getFolderId(token) {
    const FOLDER_NAME = "ישיבת בית הלוי - גלריה";
    try {
        const query = encodeURIComponent("name='" + FOLDER_NAME + "' and mimeType='application/vnd.google-apps.folder' and trashed=false");
        
        // [הגנה מתקדמת] שימוש ב-Base64 כדי למנוע מתוספי דפדפן (AdBlock) למחוק את כתובת גוגל מהקוד
        const targetUrl = atob("aHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vZHJpdmUvdjMvZmlsZXM=") + "?q=" + query;
        
        if (targetUrl.indexOf("http") !== 0) {
            alert("שגיאת אבטחה מקומית: הכתובת שובשה על ידי הדפדפן.\nערך נוכחי: " + targetUrl);
        }

        const searchRes = await window.fetch(targetUrl, { headers: { "Authorization": "Bearer " + token } });
        const searchData = await searchRes.json();
        if (searchData.files && searchData.files.length > 0) return searchData.files[0].id;

        const createUrl = atob("aHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vZHJpdmUvdjMvZmlsZXM=");
        const createRes = await window.fetch(createUrl, {
            method: "POST",
            headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
            body: JSON.stringify({ name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" })
        });
        const createData = await createRes.json();
        await makeFilePublic(createData.id, token);
        return createData.id;
    } catch (err) {
        console.error("DEBUG: getFolderId error:", err);
        return "root";
    }
}

export async function uploadFileToDrive(file, token = null) {
    // 1. נסה תחילה להעלות ישירות דרך שרת ה-Apps Script (ללא חלונות קופצים או פקיעת טוקן)
    if (APPS_SCRIPT_URL) {
        try {
            const base64Data = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const res = reader.result;
                    resolve(typeof res === 'string' ? res.split(',')[1] : '');
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            const payload = {
                action: "uploadImage",
                secret: APPS_SCRIPT_SECRET,
                filename: file.name,
                mimeType: file.type || 'image/jpeg',
                base64: base64Data
            };

            const res = await window.fetch(APPS_SCRIPT_URL, {
                method: "POST",
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const data = await res.json();
                if (data.success && data.fileId) {
                    return data.fileId;
                }
            }
        } catch (scriptErr) {
            console.warn("Apps Script direct upload failed, checking token fallback:", scriptErr);
            if (!token) throw scriptErr;
        }
    }

    if (!token) {
        throw new Error("לא ניתן להעלות תמונה: שרת Google אינו זמין ואין טוקן התחברות.");
    }

    const folderId = await getFolderId(token);
    const metadata = { name: file.name, parents: [folderId] };
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    form.append("file", file);

    const uploadUrlStr = atob("aHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vdXBsb2FkL2RyaXZlL3YzL2ZpbGVzP3VwbG9hZFR5cGU9bXVsdGlwYXJ0");
    
    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
        try {
            console.log("DEBUG: Final Google Upload URL:", uploadUrlStr);
            const res = await window.fetch(uploadUrlStr, {
                method: "POST",
                headers: { "Authorization": "Bearer " + token },
                body: form,
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                // Fail fast on non-retriable client errors (400-404, etc.) to save execution time
                if (res.status >= 400 && res.status < 500 && res.status !== 429) {
                    throw new Error("Drive upload failed (non-retriable): " + res.status + " " + text);
                }
                if (attempt === maxAttempts) throw new Error("Drive upload failed: " + res.status + " " + text);

                // Need a backoff delay for retriable HTTP errors as well to prevent hammering
                await new Promise(r => setTimeout(r, 800));
                continue;
            }
            const data = await res.json();
            return data.id;
        } catch (err) {
            clearTimeout(timeoutId);
            if (attempt === maxAttempts) throw err;
            if (!err.message || !err.message.includes("non-retriable")) {
                await new Promise(r => setTimeout(r, 800));
            } else {
                throw err;
            }
        }
    }
}

// Helper: perform a GitHub PUT with SHA retry on conflict (409/422/500)
// Now supports a transformFn to merge/re-apply changes on conflict!
export async function putWithShaRetry(API_URL, payloadObj, token, initialSha = null, maxRetries = 3, transformFn = null) {
    let sha = initialSha;
    let lastErr = null;
    let currentPayload = Object.assign({}, payloadObj);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const bodyObj = Object.assign({}, currentPayload);
        if (sha) bodyObj.sha = sha;

        try {
            const res = await window.fetch(API_URL, {
                method: 'PUT',
                headers: {
                    'Authorization': "token " + token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(bodyObj),
                keepalive: true
            });

            if (res.ok) return res;

            // If conflict or validation error, refetch latest content and retry
            if (res.status === 409 || res.status === 422 || (res.status === 500 && attempt < maxRetries)) {
                console.warn(`Conflict/Error (${res.status}) on attempt ${attempt}. Refetching latest...`);
                try {
                    const latest = await window.fetch(API_URL, {
                        headers: { 'Authorization': "token " + token },
                        cache: 'no-store'
                    });
                    if (latest.ok) {
                        const fileData = await latest.json();
                        sha = fileData.sha;

                        // CRITICAL: If a transform function is provided, re-calculate the content!
                        if (transformFn && typeof transformFn === 'function') {
                            const latestContent = JSON.parse(decodeBase64ToUtf8(fileData.content.replace(/\n/g, '')));
                            const newBase64 = transformFn(latestContent);
                            currentPayload.content = newBase64;
                            console.log("Transformation re-applied to latest content.");
                        }

                        continue;
                    }
                } catch (e) {
                    console.error("Refetch during retry failed:", e);
                    lastErr = e;
                }
            }

            // other errors: attach message and throw
            const txt = await res.text().catch(() => '');
            throw new Error(`GitHub PUT failed: ${res.status} ${txt}`);
        } catch (err) {
            lastErr = err;
            if (attempt === maxRetries) throw lastErr;
            await new Promise(r => setTimeout(r, 800 * attempt));
        }
    }
    throw lastErr;
}

export async function makeFilePublic(fileId, token = null) {
    if (token) {
        try {
            const permUrl = atob("aHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vZHJpdmUvdjMvZmlsZXMv") + fileId + "/permissions";
            await window.fetch(permUrl, {
                method: "POST",
                headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
                body: JSON.stringify({ role: "reader", type: "anyone" })
            });
        } catch (e) {
            console.error("DEBUG: makeFilePublic error:", e);
        }
    }
    return `https://lh3.googleusercontent.com/d/${fileId}=w1000`;
}

export async function getFileWebViewLink(fileId, token) {
    try {
        const url = atob("aHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vZHJpdmUvdjMvZmlsZXMv") + fileId + "?fields=webViewLink";
        const res = await window.fetch(url, {
            headers: { 'Authorization': "Bearer " + token }
        });
        if (res.ok) {
            const data = await res.json();
            return data.webViewLink;
        }
    } catch (e) {
        console.error("DEBUG: getFileWebViewLink error:", e);
    }
    return null;
}

// [חדש] פונקציה לאימות הטוקן מול GitHub
export async function verifyGitHubToken(token) {
    try {
        const userRes = await window.fetch('https://api.github.com/user', {
            headers: {
                'Authorization': "token " + token
            }
        });

        if (!userRes.ok) {
            return null;
        }

        const userData = await userRes.json();

        // בדיקה ישירה של הרשאות גישה לקובצי המאגר (Contents)
        try {
            const contentsRes = await window.fetch("https://api.github.com/repos/" + REPO_OWNER + "/" + REPO_NAME + "/contents/" + SITE_CONFIG_PATH, {
                headers: {
                    'Authorization': "token " + token
                }
            });

            if (!contentsRes.ok) {
                // אם גיטהאב מחזיר 403 או 401 - לטוקן אין הרשאה לקובצי המאגר
                return null;
            }

            // בדיקת Scopes עבור Classic Token
            const scopes = contentsRes.headers.get('x-oauth-scopes') || userRes.headers.get('x-oauth-scopes');
            if (scopes !== null) {
                const scopeList = scopes.split(',').map(s => s.trim());
                if (!scopeList.includes('repo') && !scopeList.includes('public_repo')) {
                    return null;
                }
            }
        } catch (e) {
            return null;
        }

        return userData.name || userData.login; // מחזיר את שם המשתמש האמיתי
    } catch (error) {
        return null;
    }
}

// Logging helper
export async function logEvent(action, type = 'general') {
    if (!GITHUB_TOKEN || !GITHUB_USERNAME) return;
    try {
        const API_URL = "https://api.github.com/repos/" + REPO_OWNER + "/" + REPO_NAME + "/contents/" + HISTORY_JSON_PATH;
        let historyArray = [];
        let sha = null;

        const response = await window.fetch(API_URL, { headers: { 'Authorization': "token " + GITHUB_TOKEN } });
        if (response.ok) {
            const fileData = await response.json();
            sha = fileData.sha;
            historyArray = JSON.parse(decodeBase64ToUtf8(fileData.content.replace(/\n/g, '')));
        }

        historyArray.unshift({
            timestamp: new Date().toLocaleString('he-IL'),
            user: GITHUB_USERNAME,
            action: action,
            type: type
        });
        if (historyArray.length > 100) historyArray = historyArray.slice(0, 100);

        const payload = {
            message: `Log action: ${action}`,
            content: encodeToBase64(JSON.stringify(historyArray, null, 2)),
            branch: 'main'
        };
        await putWithShaRetry(API_URL, payload, GITHUB_TOKEN, sha, 3);
    } catch (err) {
        console.error('Failed to log event:', err);
    }
}

// ============================================================
// 6. Push Notifications
// ============================================================
export async function sendPushNotification(title, message, isUpdate = false) {
    let restKey = sessionStorage.getItem('onesignal_rest_key') || localStorage.getItem('onesignal_rest_key');
    let appIdStr = null;
    
    try {
        const configElement = document.getElementById('site-onesignal-id');
        const configRestElement = document.getElementById('site-onesignal-rest');
        
        if (configElement && configElement.value) {
            appIdStr = configElement.value.trim();
        }
        
        // [שיפור] אם אין מפתח מקומי, נסה לקחת מהשדה (שעשוי להכיל מפתח גלובלי)
        if (!restKey && configRestElement && configRestElement.value) {
            restKey = configRestElement.value.trim();
        }

        if (!appIdStr) {
            // גיבוי לטעינה מהקובץ אם השדה לא נמצא או חסר מפתח
            const resUrl = "https://api.github.com/repos/" + REPO_OWNER + "/" + REPO_NAME + "/contents/" + SITE_CONFIG_PATH;
            const res = await window.fetch(resUrl);
            if (res.ok) {
                const data = await res.json();
                const config = JSON.parse(decodeBase64ToUtf8(data.content.replace(/\n/g, '')));
                if (!appIdStr) appIdStr = config.oneSignalAppId;
            }
        }
    } catch (e) {
        console.error("Could not fetch OneSignal App ID", e);
    }

    if (!restKey || !appIdStr) {
        console.warn("OneSignal REST Key or App ID differs/missing. Push notification skipped.");
        return;
    }

    try {
        const payload = {
            app_id: appIdStr,
            headings: { "en": title, "he": title },
            contents: { "en": message, "he": message },
            url: "https://yt2178.github.io/Beit-Halevi/"
        };

        if (isUpdate) {
            // Target users who subscribed to updates (subscribe_updates == "true")
            payload.filters = [
                { "field": "tag", "key": "subscribe_updates", "relation": "=", "value": "true" }
            ];
        } else {
            // Target all subscribed users
            payload.included_segments = ["Subscribed Users"];
        }

        const response = await window.fetch("https://onesignal.com/api/v1/notifications", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Basic " + restKey
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            console.error("Failed to send push notification:", await response.text());
        } else {
            console.log("Push notification sent successfully!");
        }
    } catch (err) {
        console.error("Error sending push notification:", err);
    }
}
