// admin-site-editor.js - עורך אתר עם תצוגה מקדימה חישנית

import {
    REPO_OWNER, REPO_NAME, SITE_CONFIG_PATH,
    GITHUB_TOKEN,
    showStatus, hideStatus, encodeToBase64, decodeBase64ToUtf8,
    logEvent
} from './admin-core.js';
import { putWithShaRetry } from './admin-core.js';

let currentSiteConfig = {
    texts: {},
    theme: 'light',
    primaryColor: '#1a4b84',
    oneSignalAppId: ''
};
let siteConfigSHA = null;

// רשימת הטקסטים שניתן לערוך
const EDITABLE_TEXTS = [
    { key: 'about_title', label: '📄 כותרת אודות' },
    { key: 'about_body', label: '📝 תוכן אודות' },
    { key: 'donation_title', label: '💝 כותרת תרומות' },
    { key: 'donation_body', label: '💰 תוכן תרומות' },
    { key: 'contact_title', label: '📞 כותרת צור קשר' },
    { key: 'contact_intro', label: '💬 טקסט הקדמה צור קשר' },
];

const ALLOWED_TEXT_KEYS = new Set([
    'about_title', 'about_body', 'donation_title', 'donation_body', 'contact_title', 'contact_intro', 'donation_link'
]);

function safeGet(obj, key) {
    if (!obj || typeof key !== 'string' || !ALLOWED_TEXT_KEYS.has(key)) {
        return undefined;
    }
    return Reflect.get(obj, key);
}

function safeSet(obj, key, val) {
    if (obj && typeof key === 'string' && ALLOWED_TEXT_KEYS.has(key)) {
        return Reflect.set(obj, key, val);
    }
    return false;
}

export async function loadSiteConfig() {
    try {
        const API_URL = "https://api.github.com/repos/" + REPO_OWNER + "/" + REPO_NAME + "/contents/" + SITE_CONFIG_PATH;
        const res = await window.fetch(API_URL, {
            headers: { 'Authorization': "token " + GITHUB_TOKEN }
        });

        if (res.ok) {
            const data = await res.json();
            const config = JSON.parse(decodeBase64ToUtf8(data.content.replace(/\n/g, '')));
            currentSiteConfig = {
                texts: config.texts || {},
                theme: config.theme || 'light',
                primaryColor: config.primaryColor || '#1a4b84'
            };
            if (config.texts && config.texts.donation_link) {
                const linkEl = document.getElementById('site-donation-link');
                if (linkEl) linkEl.value = config.texts.donation_link;
            }
            siteConfigSHA = data.sha;

            // עדכון ה-UI
            document.getElementById('site-theme-select').value = currentSiteConfig.theme;
            document.getElementById('site-primary-color').value = currentSiteConfig.primaryColor;
            if (document.getElementById('site-onesignal-id')) {
                document.getElementById('site-onesignal-id').value = currentSiteConfig.oneSignalAppId || '';
            }
            if (document.getElementById('site-onesignal-rest')) {
                document.getElementById('site-onesignal-rest').value = sessionStorage.getItem('onesignal_rest_key') || localStorage.getItem('onesignal_rest_key') || '';
            }

            const onesignalBtn = document.getElementById('save-onesignal-btn');
            if(onesignalBtn) onesignalBtn.onclick = async (e) => {
                e.preventDefault();
                const appId = document.getElementById('site-onesignal-id').value.trim();
                const restKey = document.getElementById('site-onesignal-rest').value.trim();

                if (restKey) {
                    sessionStorage.setItem('onesignal_rest_key', restKey);
                    localStorage.removeItem('onesignal_rest_key');
                } else {
                    sessionStorage.removeItem('onesignal_rest_key');
                    localStorage.removeItem('onesignal_rest_key');
                }

                currentSiteConfig.oneSignalAppId = appId;

                showStatus('שומר הגדרות OneSignal באופן גלובלי...', 50);
                await saveAllSiteSettings();
            };

            renderEditableTextsList(currentSiteConfig.texts);
            renderSitePreview(currentSiteConfig);
            return config;
        }
    } catch (error) {
        console.error('Error loading site config:', error);
    }

    // ערכי ברירת מחדל
    currentSiteConfig = {
        texts: {},
        theme: 'light',
        primaryColor: '#1a4b84'
    };
    renderEditableTextsList({});
    renderSitePreview(currentSiteConfig);
    return currentSiteConfig;
}

function renderEditableTextsList(texts) {
    const container = document.getElementById('editable-texts-list');
    if (!container) return;

    container.innerHTML = '';

    EDITABLE_TEXTS.forEach(item => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'premium-btn small secondary';
        btn.textContent = item.label;
        btn.dataset.key = item.key;
        btn.onclick = (e) => {
            e.preventDefault();
            openTextEditor(item.key, item.label, safeGet(texts, item.key) || '');
        };
        container.appendChild(btn);
    });
}

function openTextEditor(key, label, currentValue) {
    const editArea = document.getElementById('text-edit-area');
    if (!editArea) return;

    editArea.style.display = 'block';
    document.getElementById('editing-label').textContent = `עורך: ${label}`;

    const editor = document.getElementById('site-text-editor');
    editor.value = currentValue;
    editor.focus();

    const saveBtn = document.getElementById('save-site-text');
    saveBtn.onclick = () => {
        const newValue = editor.value;
        safeSet(currentSiteConfig.texts, key, newValue);
        updateSitePreview(key, newValue);
        showStatus(`😊 הטקסט עודכן בתצוגה המקדימה`, 100);
        setTimeout(hideStatus, 2000);
    };
}

function renderSitePreview(config) {
    const previewContainer = document.getElementById('site-preview-container');
    if (!previewContainer) return;

    const isDark = config.theme === 'dark';
    const bgColor = isDark ? '#1a1a1a' : '#ffffff';
    const textColor = isDark ? '#e0e0e0' : '#2c3e50';

    previewContainer.innerHTML = ''; // Clear container

    const containerDiv = document.createElement('div');
    containerDiv.style.cssText = `font-family: 'Assistant', sans-serif; direction: rtl; color: ${textColor}; background: ${bgColor}; padding: 15px; border-radius: 5px;`;

    // Helper to create sections
    const createSection = (title, keyTitle, defaultTitle, keyBody, defaultBody, bodyId, titleId) => {
        const section = document.createElement('section');
        section.style.marginBottom = '25px';

        const h3 = document.createElement('h3');
        h3.style.cssText = `color: ${config.primaryColor}; border-bottom: 2px solid ${config.primaryColor}; padding-bottom: 8px;`;
        h3.textContent = title;

        const h4 = document.createElement('h4');
        h4.id = titleId;
        h4.style.cssText = 'margin-top: 10px; margin-bottom: 5px; font-size: 1.1rem;';
        h4.textContent = safeGet(config.texts, keyTitle) || defaultTitle;

        const p = document.createElement('p');
        p.id = bodyId;
        p.style.cssText = 'line-height: 1.6; margin: 0;';
        p.textContent = safeGet(config.texts, keyBody) || defaultBody;

        section.appendChild(h3);
        section.appendChild(h4);
        section.appendChild(p);
        return section;
    };

    containerDiv.appendChild(createSection('ℹ️ אודות', 'about_title', "אודות הישיבה", 'about_body', "ישיבת בית הלוי בראש העין עומדת בראשותו של האדמו\"ר הגאון הרב אבנר עפג'ין שליט\"א.", 'preview-about-body', 'preview-about-title'));
    containerDiv.appendChild(createSection('💝 תרומות', 'donation_title', "היו שותפים בהחזקת התורה", 'donation_body', "כל תרומה מסייעת לנו להמשיך להגדיל תורה ולהאדירה.", 'preview-donation-body', 'preview-donation-title'));
    containerDiv.appendChild(createSection('📞 צור קשר', 'contact_title', "צור קשר", 'contact_intro', "ניתן ליצור קשר עם משרדי הישיבה באמצעות הטופס או המרכז.", 'preview-contact-intro', 'preview-contact-title'));

    previewContainer.appendChild(containerDiv);
}

function updateSitePreview(key, value) {
    const previewMap = new Map([
        ['about_title', '#preview-about-title'],
        ['about_body', '#preview-about-body'],
        ['donation_title', '#preview-donation-title'],
        ['donation_body', '#preview-donation-body'],
        ['contact_title', '#preview-contact-title'],
        ['contact_intro', '#preview-contact-intro']
    ]);

    const selector = previewMap.get(key);
    if (selector) {
        const element = document.querySelector(selector);
        if (element) element.textContent = value || '...';
    }
}

window.updateThemePreview = function () {
    currentSiteConfig.theme = document.getElementById('site-theme-select').value;
    currentSiteConfig.primaryColor = document.getElementById('site-primary-color').value;
    renderSitePreview(currentSiteConfig);
}

export async function saveAllSiteSettings() {
    showStatus('💾 שומר הגדרות אתר ב-GitHub...', 50);

    currentSiteConfig.theme = document.getElementById('site-theme-select').value;
    currentSiteConfig.primaryColor = document.getElementById('site-primary-color').value;
    const appIdInput = document.getElementById('site-onesignal-id')?.value.trim();
    if (appIdInput) {
        currentSiteConfig.oneSignalAppId = appIdInput;
    }

    // [חדש] שמירת קישור תרומה
    const donationLinkEl = document.getElementById('site-donation-link');
    if (donationLinkEl) {
        currentSiteConfig.texts.donation_link = donationLinkEl.value.trim();
    }

    // שמירה מקומית בלבד של ה-REST API KEY
    const restKey = document.getElementById('site-onesignal-rest')?.value.trim();
    if (restKey) {
        localStorage.setItem('onesignal_rest_key', restKey);
    } else {
        localStorage.removeItem('onesignal_rest_key');
    }

    const API_URL = "https://api.github.com/repos/" + REPO_OWNER + "/" + REPO_NAME + "/contents/" + SITE_CONFIG_PATH;

    try {
        const transformFn = (latestConfig) => {
            // Merge our changes into latest
            latestConfig.theme = currentSiteConfig.theme;
            latestConfig.primaryColor = currentSiteConfig.primaryColor;
            latestConfig.oneSignalAppId = currentSiteConfig.oneSignalAppId;
            delete latestConfig.oneSignalRestKey_enc;
            latestConfig.texts = Object.assign({}, latestConfig.texts, currentSiteConfig.texts);
            return encodeToBase64(JSON.stringify(latestConfig, null, 2));
        };

        const updateResponse = await putWithShaRetry(API_URL, {
            message: `Update site configuration and text`,
            branch: 'main'
        }, GITHUB_TOKEN, siteConfigSHA, 3, transformFn);

        if (updateResponse && updateResponse.ok) {
            showStatus('✅ הגדרות האתר נשמרו בהצלחה! 🎉', 100);
            setTimeout(hideStatus, 1500);
            logEvent(`עדכן הגדרות אתר וטקסטים`, 'general');
            const data = await updateResponse.json();
            siteConfigSHA = data.content.sha;
        } else {
            throw new Error('Save failed on GitHub');
        }
    } catch (err) {
        showStatus(`❌ שגיאה: ${err.message}`, null, true);
    }
}

export async function pingIndexNow() {
    const statusEl = document.getElementById('indexnow-status');
    const btn = document.getElementById('ping-indexnow-btn');
    if (statusEl) {
        statusEl.textContent = 'שולח עדכון למנועי חיפוש...';
        statusEl.style.color = '#e67e22';
    }
    if (btn) btn.disabled = true;

    try {
        const key = '24896f10ac3d42c5a84385b89040c587';
        const keyLocation = 'https://yt2178.github.io/24896f10ac3d42c5a84385b89040c587.txt';
        const url = 'https://yt2178.github.io/Beit-Halevi/';
        const endpoint = `https://api.indexnow.org/indexnow?url=${encodeURIComponent(url)}&key=${key}&keyLocation=${encodeURIComponent(keyLocation)}`;
        
        await fetch(endpoint, { mode: 'no-cors' });
        if (statusEl) {
            statusEl.textContent = '✅ נשלח בהצלחה ל-Bing, Copilot ו-ChatGPT!';
            statusEl.style.color = '#27ae60';
        }
    } catch (err) {
        console.error('IndexNow ping failed:', err);
        if (statusEl) {
            statusEl.textContent = '❌ שגיאה בשליחה: ' + err.message;
            statusEl.style.color = '#e74c3c';
        }
    } finally {
        if (btn) btn.disabled = false;
    }
}

