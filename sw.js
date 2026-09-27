const CACHE_NAME = 'beit-halevi-cache-v59';

const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './admin.html',
    './style.css',
    './base.css',
    './header.css',
    './footer.css',
    './layout.css',
    './gallery.css',
    './news.css',
    './zmanim.css',
    './notifications.css',
    './contact.css',
    './components.css',
    './animations.css',
    './responsive.css',
    './admin.css',
    './main.js',
    './admin.js',
    './admin-core.js',
    './admin-gallery.js',
    './admin-site-editor.js',
    './admin-tasks.js',
    './data-loader.js',
    './gallery.js',
    './news.js',
    './utils.js',
    './zmanim.js',
    './manifest.json',
    './favicon.ico',
    './assets/icons/icon-192x192.png',
    './assets/icons/icon-512x512.png',
    './assets/icons/icon-maskable-192x192.png',
    './assets/icons/icon-maskable-512x512.png',
    './assets/icons/apple-touch-icon.png'
];

const EXTERNAL_ASSETS = [
    'https://fonts.googleapis.com/css2?family=Assistant:wght@300;400;600;700;800&family=Heebo:wght@300;400;700;900&family=Amiri:wght@400;700&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            const internalPromise = Promise.all(
                ASSETS_TO_CACHE.map(url => cache.add(url).catch(err => console.warn("Failed to cache internal asset:", url, err)))
            );
            const externalPromise = Promise.all(
                EXTERNAL_ASSETS.map(url => cache.add(url).catch(err => console.warn("Failed to cache external asset:", url, err)))
            );
            return Promise.all([internalPromise, externalPromise]);
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
        return;
    }

    const url = new URL(event.request.url);

    // Network-First עבור קובצי JSON דינמיים מתיקיית /data/ כדי להבטיח עדכניות מיידית
    if (url.pathname.includes('/data/')) {
        event.respondWith(
            fetch(event.request).then((response) => {
                if (response && response.status === 200) {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return response;
            }).catch(() => caches.match(event.request))
        );
        return;
    }

    // Network-First עבור פאנל הניהול וקבצי הניהול כדי למנוע טעינת סקריפטים ישנים
    if (url.pathname.includes('admin')) {
        event.respondWith(
            fetch(event.request).then((response) => {
                if (response && response.status === 200) {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return response;
            }).catch(() => caches.match(event.request))
        );
        return;
    }

    // קריאה לגיטהאב, גוגל-דרייב וAPIות חיצוניות
    if (url.hostname.includes('github') || url.hostname.includes('googleusercontent') || url.hostname.includes('googleapis')) {
        event.respondWith(
            fetch(event.request).then((response) => {
                if (response && (response.status === 200 || response.status === 0)) {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return response;
            }).catch(() => caches.match(event.request))
        );
        return;
    }

    // Stale-While-Revalidate אסטרטגיה לנכסים מקומיים
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                if (networkResponse && (networkResponse.status === 200 || networkResponse.status === 0)) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(() => { /* offline */ });

            return cachedResponse || fetchPromise;
        })
    );
});

// [תיקון] -핸들ר להתראות (Push Notifications)
self.addEventListener('push', (event) => {
    if (!event.data) {
        console.log('Received push notification with no data');
        return;
    }

    try {
        const data = event.data.json();
        const options = {
            body: data.body || 'עדכון חדש בישיבת בית הלוי',
            icon: './assets/icons/icon-192x192.png',
            badge: './assets/icons/icon-192x192.png',
            tag: data.tag || 'beit-halevi-notification',
            requireInteraction: false,
            actions: [
                { action: 'open', title: 'פתח' },
                { action: 'close', title: 'סגור' }
            ],
            data: {
                url: data.url || './',
                id: data.notificationId || Date.now()
            }
        };

        event.waitUntil(
            self.registration.showNotification(data.title || 'ישיבת בית הלוי', options)
        );
    } catch (err) {
        console.error('Error handling push notification:', err);
        // fallback - הצג התראה פשוטה
        event.waitUntil(
            self.registration.showNotification('ישיבת בית הלוי', {
                body: 'יש עדכון חדש בישיבה!',
                icon: './assets/icons/icon-192x192.png'
            })
        );
    }
});

// [תיקון] - הנדלר לכשהמשתמש לוחץ על התראה
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const urlToOpen = event.notification.data?.url || './';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // בדוק אם כבר יש חלון פתוח לאתר
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i];
                if (client.url === urlToOpen && 'focus' in client) {
                    return client.focus();
                }
            }
            // אם אין חלון פתוח, פתח חדש
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});

// [תיקון] - הנדלר לכשהמשתמש סוגר התראה (שלח ביטול)
self.addEventListener('notificationclose', (event) => {
    console.log('Notification closed:', event.notification.data?.id);
    // אפשר לשלוח אנליטיקה כאן
});
