// main.js
import { applySiteConfig, loadNews, loadGallery, allLoadedNews, allLoadedAlbums } from './data-loader.js';
import { checkUrlHash, initGalleryEvents } from './gallery.js';
import { checkNewsHash, initNewsEvents } from './news.js';
import { getHebrewYear } from './utils.js';
import { initZmanim } from './zmanim.js';

// ---- משתנים ואלמנטים כלליים ---- 
export const dateTimeDisplay = document.getElementById('date-time-display');
export const hebrewYearDisplay = document.getElementById('hebrew-year-display');
export const themeToggle = document.getElementById('theme-toggle');
export const contactForm = document.getElementById('contact-form');
export const menuToggle = document.querySelector('.menu-toggle');
export const navLinks = document.querySelector('.nav-links');
export const backToTopButton = document.getElementById("back-to-top-btn");

// ---- משתנים ואלמנטים לגלריה ----
export const gridOverlay = document.getElementById('grid-overlay');
export const lightbox = document.getElementById('lightbox');
export const downloadBtn = document.getElementById('download-btn');
export const lightboxCloseBtn = lightbox.querySelector('.lightbox-close');
export const nextBtn = lightbox.querySelector('.lightbox-next');
export const prevBtn = lightbox.querySelector('.lightbox-prev');
export const gridCloseBtn = document.querySelector('.grid-close');
export const thumbnailGrid = document.getElementById('thumbnail-grid');
export const gridAlbumTitle = document.getElementById('grid-album-title');
export const lightboxImg = document.getElementById('lightbox-img');
export const shareBtn = document.getElementById('share-btn');
export const albumShareBtn = document.getElementById('album-share-btn');
export const albumDownloadBtn = document.getElementById('album-download-btn');

// ---- משתנים ואלמנטים לחדשות ----
export const newsModal = document.getElementById('news-modal');
export const modalTitle = document.getElementById('modal-title');
export const modalDate = document.getElementById('modal-date');
export const modalBody = document.getElementById('modal-body');
export const newsShareBtn = document.getElementById('news-share-btn');
export const newsWhatsappBtn = document.getElementById('news-whatsapp-btn');
export const newsPrevBtn = document.getElementById('news-prev-btn');
export const newsNextBtn = document.getElementById('news-next-btn');

// ---- פונקציות כלליות ----
// [חדש] פונקציה לעדכון תאריך ושעה בזמן אמת
function updateDateTime() {
    const now = new Date();
    const gregorianDate = now.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    // [מתוקן] הסרנו את התאריך העברי
    dateTimeDisplay.textContent = `${gregorianDate} | ${time}`;
}

// [חדש] עדכון כותרת הדף ומטא-תגים בצורה דינמית
export function updateDynamicMetadata(title, description) {
    if (title) {
        document.title = `${title} | ישיבת בית הלוי`;
        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle) ogTitle.setAttribute('content', `${title} | ישיבת בית הלוי`);
        const twitterTitle = document.querySelector('meta[name="twitter:title"]');
        if (twitterTitle) twitterTitle.setAttribute('content', `${title} | ישיבת בית הלוי`);
    }
    if (description) {
        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc) metaDesc.setAttribute('content', description);
        const ogDesc = document.querySelector('meta[property="og:description"]');
        if (ogDesc) ogDesc.setAttribute('content', description);
        const twitterDesc = document.querySelector('meta[name="twitter:description"]');
        if (twitterDesc) twitterDesc.setAttribute('content', description);
    }
}

// [חדש] ניהול באדג' (Badge) באייקון האפליקציה (PWA)
export function updateAppBadge(count) {
    if ('setAppBadge' in navigator) {
        if (count > 0) {
            navigator.setAppBadge(count).catch(console.error);
        } else {
            navigator.clearAppBadge().catch(console.error);
        }
    }
}
// כפתור חזרה למעלה
if (backToTopButton) {
    window.onscroll = () => {
        if (document.body.scrollTop > 200 || document.documentElement.scrollTop > 200) {
            backToTopButton.classList.add('visible');
        } else {
            backToTopButton.classList.remove('visible');
        }
    };
    backToTopButton.addEventListener("click", () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}
// [שינוי] טיפול במצב כהה/בהיר עם שמירת העדפה ב-LocalStorage
if (themeToggle) {
    const themeIcon = themeToggle.querySelector('i');
    const savedTheme = localStorage.getItem('theme');

    // [שינוי] ברירת מחדל למצב בהיר. אם שמור כהה - מפעיל.
    const isDark = savedTheme === 'dark';
    if (isDark) {
        document.body.classList.add('dark-mode');
        if (themeIcon) themeIcon.classList.replace('fa-moon', 'fa-sun');
    } else {
        // ודא שמצב בהיר הוא ברירת המחדל (אם לא נשמר כלום, או נשמר 'light')
        document.body.classList.remove('dark-mode');
        if (themeIcon) themeIcon.classList.replace('fa-sun', 'fa-moon');
    }
    // [ חדש] טיפול בלחיצה על כפתור מצב כהה/בהיר
    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        const isCurrentlyDark = document.body.classList.contains('dark-mode');
        localStorage.setItem('theme', isCurrentlyDark ? 'dark' : 'light');
        if (themeIcon) themeIcon.classList.replace(isCurrentlyDark ? 'fa-moon' : 'fa-sun', isCurrentlyDark ? 'fa-sun' : 'fa-moon');
    });
}
// [שינוי] טיפול בשליחת טופס צור קשר (כולל הודעות UX)
if (contactForm) {
    contactForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const button = contactForm.querySelector('button[type="submit"]');
        const originalChildren = Array.from(button.childNodes);

        // 1. מצב "שולח..."
        button.disabled = true;
        button.innerHTML = '';
        const spinner = document.createElement('i');
        spinner.className = 'fas fa-spinner fa-spin';
        button.appendChild(spinner);
        button.appendChild(document.createTextNode(' שולח...'));

        // [ חדש] הסר כל הודעה קודמת
        let statusMessage = contactForm.querySelector('.form-status');
        if (statusMessage) statusMessage.remove();

        statusMessage = document.createElement('p');
        statusMessage.className = 'form-status';
        statusMessage.style.textAlign = 'center';
        statusMessage.style.marginTop = '10px';

        // הכתובת של ה-Google Apps Script Web App המרכזי
        const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwVs5qCMlfPJOMikCwzzMdjygVl80byjxLSevub_sSeWQPnBakL-ioOQlgfYo2IDz1SHw/exec";

        // בדיקת האניפוט
        if (contactForm.honeypot && contactForm.honeypot.value !== "") {
            console.warn("Spam detected via honeypot");
            statusMessage.textContent = "ההודעה נשלחה בהצלחה! תודה רבה.";
            statusMessage.style.color = "green";
            button.disabled = false;
            button.innerHTML = '';
            originalChildren.forEach(child => button.appendChild(child));
            contactForm.appendChild(statusMessage);
            return;
        }

        const payload = {
            action: "submitContact",
            name: contactForm.name.value.trim(),
            email: contactForm.email.value.trim(),
            message: contactForm.message.value.trim()
        };

        try {
            // שליחה ישירה לשרת Apps Script
            await fetch(APPS_SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors',
                body: JSON.stringify(payload)
            });

            statusMessage.textContent = "ההודעה נשלחה בהצלחה! תודה רבה.";
            statusMessage.style.color = 'green';
            contactForm.reset();
        } catch (error) {
            console.error('Submission error:', error);
            statusMessage.textContent = "אירעה שגיאה בשליחת ההודעה. נסה שוב מאוחר יותר.";
            statusMessage.style.color = 'red';
        }

        // [מתוקן] שחזור הכפתור מיד לאחר השליחה
        button.disabled = false;
        button.innerHTML = '';
        originalChildren.forEach(child => button.appendChild(child));
        contactForm.appendChild(statusMessage);

        // הסרת הודעת הסטטוס בלבד אחרי 5 שניות
        setTimeout(() => {
            if (statusMessage) statusMessage.remove();
        }, 5000);
    });
}
// [חדש] קוד לתפריט נייד
if (menuToggle && navLinks) {
    const icon = menuToggle.querySelector('i');
    const mainNav = document.getElementById('main-nav');
    const closeMenu = () => {
        navLinks.classList.remove('active');
        if (mainNav) mainNav.classList.remove('menu-open');
        if (icon) {
            icon.classList.add('fa-bars');
            icon.classList.remove('fa-times');
        }
    };
    
    // [ חדש] 2. טיפול בלחיצה על כפתור התפריט
    menuToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const isActive = navLinks.classList.contains('active');
        
        if (isActive) {
            closeMenu();
        } else {
            navLinks.classList.add('active');
            if (mainNav) mainNav.classList.add('menu-open');
            if (icon) {
                icon.classList.remove('fa-bars');
                icon.classList.add('fa-times');
            }
        }
    });
    navLinks.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
    document.addEventListener('click', (e) => {
        if (!menuToggle.contains(e.target) && !navLinks.contains(e.target)) {
            closeMenu();
        }
    });
}
// [חדש] טיפול בכפתורי Back/Forward של הדפדפן
window.addEventListener('popstate', () => {
    checkUrlHash(); // בדיקת גלריה (שכבר קיימת)
    checkNewsHash(); // [חדש] בדיקת חדשות
});

// [חדש] קוד ליצירת השנה העברית הנוכחית
if (hebrewYearDisplay) {
    hebrewYearDisplay.textContent = getHebrewYear();
}

// [חדש] פונקציה ראשונית שופעת בהתחלה
(async function () {
    'use strict';
    updateDateTime();
    setInterval(updateDateTime, 1000);
    // [חדש] מפעיל את טעינת החדשות והגלריה
    loadNews();
    await loadGallery();
    initGalleryEvents(); // [חדש] רישום אירועי Gallery
    initNewsEvents(); // [חדש] רישום אירועי News
    initZmanim(); // [חדש] טעינת זמני היום
    applySiteConfig(); // [פרימיום] החלת הגדרות אתר דינמיות
    
    checkUrlHash();
    checkNewsHash();
    
    // [חדש] תצפית על תמונות לטעינה חלקה (Lazy Loading Fade-in)
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.addEventListener('load', () => img.classList.add('loaded'));
                if (img.complete) img.classList.add('loaded');
                observer.unobserve(img);
            }
        });
    }, { threshold: 0.1 });

    const observeNewImages = () => {
        document.querySelectorAll('img.lazy-load:not(.observed)').forEach(img => {
            img.classList.add('observed');
            observer.observe(img);
        });
    };
    observeNewImages();
    const mutationObserver = new MutationObserver(observeNewImages);
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    // [חדש] עדכון השנה העברית
    if (hebrewYearDisplay) hebrewYearDisplay.textContent = getHebrewYear();
    // [חדש] רישום Service Worker עבור PWA
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', async () => {
            try {
                const registration = await navigator.serviceWorker.register('./sw.js');
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
                registration.update();
            } catch (err) {
                console.log('ServiceWorker registration failed: ', err);
            }
        });
    }

    // [חדש] טעינת הגדרות אתר (ערכת נושא וטקסטים)
    try {
        const configRes = await fetch('./data/site-config.json');
        if (configRes.ok) {
            const config = await configRes.json();
            if (config.theme && config.theme !== 'light') {
                document.body.className = `theme-${config.theme}`;
            }
            if (config.primaryColor) {
                document.documentElement.style.setProperty('--primary-color', config.primaryColor);
            }
            // עדכון טקסטים
            if (config.texts) {
                if (config.texts.about_title) document.querySelector('#about h2').textContent = config.texts.about_title;
                if (config.texts.about_body) document.querySelector('#about p').textContent = config.texts.about_body;
                if (config.texts.donation_title) document.querySelector('#donations h2').textContent = config.texts.donation_title;
                if (config.texts.donation_body) document.querySelector('#donations p').textContent = config.texts.donation_body;
            }

            // [תיקון] אתחול OneSignal - טעינה של הסקריפט תחילה, אחרי כן הגדרה
            if (config.oneSignalAppId) {
                console.log('Initializing OneSignal with App ID:', config.oneSignalAppId);
                
                // טעינת הסקריפט של OneSignal QEMU
                const script = document.createElement('script');
                script.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
                script.async = true;
                script.defer = true;
                script.onload = () => {
                    console.log('OneSignal SDK loaded successfully');
                    // רק AFTER שהסקריפט נטען, אנחנו מתחילים את ה-init
                    window.OneSignalDeferred = window.OneSignalDeferred || [];
                    window.OneSignalDeferred.push(function (OneSignal) {
                        try {
                            console.log('Starting OneSignal.init...');
                            OneSignal.init({
                                appId: config.oneSignalAppId,
                                safari_web_id: "web.onesignal.auto.0d8cfe1b-addf-4fe0-8094-42e4bf6360cd",
                                notifyButton: {
                                    enable: false, // נשתמש בכפתור שלנו
                                },
                                allowLocalhostAsSecureOrigin: true,
                                serviceWorkerParam: { scope: '/Beit-Halevi/' },
                                serviceWorkerPath: '/Beit-Halevi/OneSignalSDKWorker.js',
                            }).then(() => {
                                console.log('OneSignal initialized successfully');
                                window.oneSignalInitialized = true;
                                updateSubscribeUI();
                            }).catch(e => console.error("OneSignal init error:", e));
                        } catch(e) {
                            console.error("OneSignal try-catch error:", e);
                        }
                    });
                };
                script.onerror = () => console.error('Failed to load OneSignal SDK');
                document.head.appendChild(script);

                // [תיקון] פונקציה לעדכון מצב הכפתור
                function updateSubscribeUI() {
                    try {
                        if (!window.OneSignal) {
                            console.warn('OneSignal not yet available for updateSubscribeUI');
                            return;
                        }
                        const isSubscribed = OneSignal.User.PushSubscription.optedIn;
                        const subBtn = document.getElementById('subscribe-btn');
                        const unsubBtn = document.getElementById('unsubscribe-btn');
                        const modalP = document.getElementById('subscribe-modal-desc');
                        const fabBtn = document.getElementById('fab-subscribe-btn');
                        const optNew = document.getElementById('sub-opt-new');
                        const optUpdate = document.getElementById('sub-opt-update');

                        const subscribeNewVal = localStorage.getItem('subscribe_new') !== 'false';
                        const subscribeUpdatesVal = localStorage.getItem('subscribe_updates') !== 'false';
                        
                        if (optNew) optNew.checked = subscribeNewVal;
                        if (optUpdate) optUpdate.checked = subscribeUpdatesVal;

                        if (isSubscribed) {
                            if (subBtn) {
                                subBtn.innerHTML = '<i class="fas fa-check"></i> שמירת העדפות';
                                subBtn.style.backgroundColor = '#27ae60';
                            }
                            if (unsubBtn) unsubBtn.style.display = 'block';
                            if (modalP) modalP.textContent = "הנך רשום לקבלת התראות ועדכונים מהישיבה. באפשרותך לעדכן את העדפותיך או לבטל את השירות.";
                            if (fabBtn) fabBtn.style.display = 'none';
                        } else {
                            if (subBtn) {
                                subBtn.innerHTML = '<i class="fas fa-bell"></i> הפעלת התראות';
                                subBtn.style.backgroundColor = '';
                            }
                            if (unsubBtn) unsubBtn.style.display = 'none';
                            if (modalP) modalP.textContent = "הצטרפו לקבלת עדכונים שוטפים על ידיעות, גלריות תמונות ואירועים בישיבה ישירות למכשירכם.";
                            if (fabBtn) fabBtn.style.display = 'flex';
                        }
                    } catch(err) {
                        console.error('Error in updateSubscribeUI:', err);
                    }
                }

                // מאזין לשינוי במצב ההרשמה
                if (window.OneSignal) {
                    OneSignal.User.PushSubscription.addEventListener("change", (event) => {
                        updateSubscribeUI();
                        if (event && event.current && event.current.optedIn) {
                            const optNew = localStorage.getItem('subscribe_new') !== 'false';
                            const optUpdate = localStorage.getItem('subscribe_updates') !== 'false';
                            showWelcomeNotification(optNew, optUpdate);
                        }
                    });
                }
            }
        }
    } catch (e) { console.warn("Failed to load site configuration:", e); }

    // פונקציית עזר להצגת הודעת סטטוס מעוצבת צפה
    function showToast(message) {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.style.cssText = 'position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); z-index: 10005; display: flex; flex-direction: column; gap: 10px; pointer-events: none;';
            document.body.appendChild(container);
        }
        const toast = document.createElement('div');
        toast.style.cssText = 'background: rgba(44, 62, 80, 0.95); color: white; padding: 14px 24px; border-radius: 50px; font-size: 0.95rem; font-weight: 500; box-shadow: 0 10px 30px rgba(0,0,0,0.25); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); animation: toastSlideUp 0.3s ease-out; direction: rtl; text-align: center; border: 1px solid rgba(255,255,255,0.1); line-height: 1.4;';
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-20px)';
            toast.style.transition = 'all 0.4s ease-out';
            setTimeout(() => {
                toast.remove();
                if (container.children.length === 0) container.remove();
            }, 400);
        }, 4500);
    }

    // [חדש] לוגיקת הרשמה להתראות (FAB ומודאל)
    const fabSubscribeBtn = document.getElementById('fab-subscribe-btn');
    const subscribeModal = document.getElementById('subscribe-modal');
    const subscribeCloseBtn = document.querySelector('.subscribe-close');
    const subscribeBtn = document.getElementById('subscribe-btn');

    // סגירת הכפתור הצף באופן אוטומטי אם כבר אושר בדפדפן
    if ('Notification' in window && Notification.permission === 'granted') {
        if (fabSubscribeBtn) {
            fabSubscribeBtn.style.display = 'none';
        }
    }

    // פתיחת המודאל
    if (fabSubscribeBtn && subscribeModal) {
        fabSubscribeBtn.addEventListener('click', () => {
            if ('Notification' in window && Notification.permission === 'granted') {
                const modalP = document.querySelector('#subscribe-modal p');
                if (modalP) modalP.textContent = "אתה רשום בהצלחה להתראות האתר! (ביטול מתבצע דרך הגדרות הדפדפן)";
                if (subscribeBtn) {
                    subscribeBtn.innerHTML = '<i class="fas fa-check"></i> רשום לאתר';
                    subscribeBtn.style.backgroundColor = '#2ecc71';
                }
            }
            subscribeModal.classList.add('active');
            document.body.classList.add('no-scroll');
        });
    }

    // סגירת המודאל
    if (subscribeCloseBtn && subscribeModal) {
        subscribeCloseBtn.addEventListener('click', () => {
            subscribeModal.classList.remove('active');
            document.body.classList.remove('no-scroll');
        });
    }

    // סגירה בלחיצה מחוץ למודאל
    if (subscribeModal) {
        window.addEventListener('click', (e) => {
            if (e.target === subscribeModal) {
                subscribeModal.classList.remove('active');
                document.body.classList.remove('no-scroll');
            }
        });
    }

    // [חדש] שליחת התראת תודה והודעת פתיחה מיד לאחר הרישום
    function showWelcomeNotification(subscribeNew = true, subscribeUpdates = true) {
        if (sessionStorage.getItem('welcome_notif_sent')) return;
        sessionStorage.setItem('welcome_notif_sent', 'true');

        let messageBody = "תודה על הרשמתך. מעתה תקבל עדכונים שוטפים ישירות למכשירך.";
        if (subscribeNew && subscribeUpdates) {
            messageBody = "תודה על הרשמתך. מעתה תקבל עדכונים שוטפים על פרסומים ואלבומים חדשים, וכן על שינויים ועדכונים בישיבה.";
        } else if (subscribeNew && !subscribeUpdates) {
            messageBody = "תודה על הרשמתך. מעתה תקבל עדכונים על כל פרסום או אלבום תמונות חדש שיתפרסם בישיבה.";
        } else if (!subscribeNew && subscribeUpdates) {
            messageBody = "תודה על הרשמתך. מעתה תקבל עדכונים על שינויים ועדכונים בפרסומי הישיבה.";
        }

        const title = "ישיבת בית הלוי 🔔";
        const iconUrl = "https://yt2178.github.io/Beit-Halevi/assets/icons/icon-192x192.png";

        const options = {
            body: messageBody,
            icon: iconUrl,
            badge: iconUrl,
            dir: "rtl",
            lang: "he",
            tag: "welcome-notification",
            data: { url: "https://yt2178.github.io/Beit-Halevi/" }
        };

        if ('Notification' in window && Notification.permission === 'granted') {
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                navigator.serviceWorker.ready.then(reg => {
                    reg.showNotification(title, options);
                }).catch(() => {
                    try { new Notification(title, options); } catch (e) {}
                });
            } else {
                try { new Notification(title, options); } catch (e) {}
            }
        }
    }

    // כפתור ההרשמה בתוך המודאל
    if (subscribeBtn) {
        subscribeBtn.addEventListener('click', async () => {
            const optNew = document.getElementById('sub-opt-new');
            const optUpdate = document.getElementById('sub-opt-update');
            const subscribeNew = optNew ? optNew.checked : true;
            const subscribeUpdates = optUpdate ? optUpdate.checked : true;
            
            localStorage.setItem('subscribe_new', subscribeNew ? 'true' : 'false');
            localStorage.setItem('subscribe_updates', subscribeUpdates ? 'true' : 'false');

            // [תיקון] - עדיפות ל-OneSignal, fallback ל-Native
            if (window.oneSignalInitialized && typeof OneSignal !== 'undefined') {
                try {
                    const isSubscribed = OneSignal.User.PushSubscription.optedIn;
                    if (isSubscribed) {
                        OneSignal.User.addTags({
                            subscribe_new: subscribeNew ? "true" : "false",
                            subscribe_updates: subscribeUpdates ? "true" : "false"
                        });
                        showToast("העדפות ההתראות נשמרו בהצלחה.");
                        showWelcomeNotification(subscribeNew, subscribeUpdates);
                    } else {
                        await OneSignal.User.PushSubscription.optIn();
                        OneSignal.User.addTags({
                            subscribe_new: subscribeNew ? "true" : "false",
                            subscribe_updates: subscribeUpdates ? "true" : "false"
                        });
                        showToast("ההתראות הופעלו בהצלחה. תודה על הצטרפותך!");
                        showWelcomeNotification(subscribeNew, subscribeUpdates);
                    }
                } catch (err) {
                    console.warn("OneSignal integration error, falling back to native:", err);
                    await triggerNativeNotificationFallback(subscribeNew, subscribeUpdates);
                }
            } else {
                await triggerNativeNotificationFallback(subscribeNew, subscribeUpdates);
            }

            if (subscribeModal) {
                subscribeModal.classList.remove('active');
                document.body.classList.remove('no-scroll');
            }
        });
    }

    async function triggerNativeNotificationFallback(subscribeNew = true, subscribeUpdates = true) {
        if ('Notification' in window) {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                showToast("ההתראות הופעלו בהצלחה במכשיר זה!");
                showWelcomeNotification(subscribeNew, subscribeUpdates);
            } else if (permission === 'denied') {
                showToast("קבלת ההתראות חסומה בהגדרות הדפדפן שלך.");
            } else {
                showToast("אישור קבלת ההתראות בוטל.");
            }
        } else {
            showToast("מערכת ההתראות אינה נתמכת בדפדפן זה.");
        }
    }

    const unsubscribeBtn = document.getElementById('unsubscribe-btn');
    if (unsubscribeBtn) {
        unsubscribeBtn.addEventListener('click', async () => {
            localStorage.setItem('subscribe_new', 'false');
            localStorage.setItem('subscribe_updates', 'false');

            if (window.oneSignalInitialized && typeof OneSignal !== 'undefined') {
                try {
                    await OneSignal.User.PushSubscription.optOut();
                } catch (e) {
                    console.warn("OneSignal optOut error:", e);
                }
            }
            showToast("קבלת ההתראות בוטלה בהצלחה.");
            
            if (subscribeModal) {
                subscribeModal.classList.remove('active');
                document.body.classList.remove('no-scroll');
            }
        });
    }

    // --- PWA Install Prompt Logic ---
    let deferredPrompt;
    const pwaInstallBanner = document.getElementById('pwa-install-banner');
    const pwaInstallBtn = document.getElementById('pwa-install-btn');
    const pwaCloseBtn = document.getElementById('pwa-close-btn');

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        
        const lastClosed = localStorage.getItem('pwa_banner_closed');
        if (!lastClosed || (Date.now() - parseInt(lastClosed)) > 86400000) {
            if (pwaInstallBanner) pwaInstallBanner.style.display = 'flex';
        }
    });

    if (pwaInstallBtn) {
        pwaInstallBtn.addEventListener('click', async () => {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            deferredPrompt = null;
            if (pwaInstallBanner) pwaInstallBanner.style.display = 'none';
        });
    }

    if (pwaCloseBtn) {
        pwaCloseBtn.addEventListener('click', () => {
            if (pwaInstallBanner) pwaInstallBanner.style.display = 'none';
            localStorage.setItem('pwa_banner_closed', Date.now().toString());
        });
    }

    // --- [חדש] לוגיקה לכותרת מצטמצמת בגלילה (Sticky Shrunk Header) ---
    const stickyWrapper = document.getElementById('sticky-header-wrapper');
    if (stickyWrapper) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 50) {
                stickyWrapper.classList.add('scrolled');
            } else {
                stickyWrapper.classList.remove('scrolled');
            }
        });
    }

})();
