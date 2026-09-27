// [חדש] המרת מספר לאותיות בגימטריה לתאריך עברי אותנטי (למשל: כ"ב בתשרי תשפ"ו)
function toHebrewNumeral(num) {
    const letters = [
        [400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק'],
        [90, 'צ'], [80, 'פ'], [70, 'ע'], [60, 'ס'], [50, 'נ'], [40, 'מ'], [30, 'ל'], [20, 'כ'], [10, 'י'],
        [9, 'ט'], [8, 'ח'], [7, 'ז'], [6, 'ו'], [5, 'ה'], [4, 'ד'], [3, 'ג'], [2, 'ב'], [1, 'א']
    ];
    let n = num % 1000;
    let result = '';
    for (const [val, letter] of letters) {
        while (n >= val) {
            if (n === 15) { result += 'טו'; n -= 15; break; }
            if (n === 16) { result += 'טז'; n -= 16; break; }
            result += letter;
            n -= val;
        }
    }
    if (result.length === 1) return result + "'";
    if (result.length > 1) return result.slice(0, -1) + '"' + result.slice(-1);
    return result;
}

function formatHebrewDateString(d) {
    try {
        const parts = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric' }).formatToParts(d);
        let day = '', month = '', year = '';
        for (const part of parts) {
            if (part.type === 'day') day = toHebrewNumeral(parseInt(part.value, 10));
            if (part.type === 'month') month = part.value;
            if (part.type === 'year') year = toHebrewNumeral(parseInt(part.value, 10));
        }
        return `${day} ב${month} ${year}`;
    } catch {
        return new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
    }
}

import { allLoadedAlbums, BASE_URL } from './data-loader.js';
import { cleanPath, focusLock, normalizeImageUrl } from './utils.js';
import {
    gridOverlay, lightbox, downloadBtn, lightboxCloseBtn,
    nextBtn, prevBtn, gridCloseBtn, thumbnailGrid,
    gridAlbumTitle, lightboxImg, shareBtn, albumShareBtn,
    albumDownloadBtn, updateDynamicMetadata // משתנים שמוגדרים ב-main.js
} from './main.js';
export let currentAlbumData = null;
export let currentIndex = 0;
export let currentAlbumImages = [];

// ---- פונקציות גלריה ----
export function openGridOverlay(albumData) {
    currentAlbumData = albumData; // [חדש] שמירת נתוני האלבום

    thumbnailGrid.textContent = '';
    gridAlbumTitle.textContent = albumData.title;

    // [חדש] הצגת תאריך עברי ולועזי ליד שם האלבום
    const dateContainer = document.getElementById('grid-album-date');
    if (dateContainer) {
        if (albumData.date) {
            try {
                const d = new Date(albumData.date + 'T00:00:00');
                const gregDate = d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' });
                const hebDate = formatHebrewDateString(d);
                dateContainer.textContent = `${hebDate} | ${gregDate}`;
                dateContainer.style.display = 'block';
            } catch (e) {
                dateContainer.textContent = albumData.date;
                dateContainer.style.display = 'block';
            }
        } else {
            dateContainer.style.display = 'none';
        }
    }

    updateDynamicMetadata(`גלריה: ${albumData.title}`);
    currentAlbumImages = (albumData.images || []).map((imgSrc, index) => {
        const cleaned = cleanPath(imgSrc);
        const fullSrc = cleaned.startsWith('http') ? normalizeImageUrl(cleaned) : (BASE_URL ? `${BASE_URL}/${cleaned}` : cleaned);
        return {
            src: fullSrc,
            alt: `${albumData.title} - תמונה ${index + 1}`,
            albumSlug: albumData.slug
        };
    });
    setupAlbumControls(albumData);

    if (currentAlbumImages.length === 0) {
        thumbnailGrid.textContent = 'לא נמצאו תמונות באלבום זה.';
        thumbnailGrid.style.color = 'white';
        thumbnailGrid.style.textAlign = 'center';
    } else {
        // [שינוי] הצג Skeleton Loader מיידית
        const loaderTemplate = document.createElement('div');
        loaderTemplate.className = 'loading-thumbnail';
        for (let i = 0; i < 12; i++) { // הצג 12 מקומות ריקים
            thumbnailGrid.appendChild(loaderTemplate.cloneNode(false));
        }
        setTimeout(() => {
            thumbnailGrid.textContent = ''; // נקה את ה-Skeleton
            currentAlbumImages.forEach((imgData, index) => {
                const thumb = document.createElement('img');
                thumb.className = 'lazy-load';
                thumb.loading = 'lazy';
                thumb.width = 150;
                thumb.height = 120;
                thumb.src = imgData.src;
                thumb.alt = imgData.alt;
                thumb.dataset.index = index;

                // [חדש - עמידות לסינון אתרוג/אינטרנט כשר]: מנגנון גיבוי אוטומטי אם תמונה נחסמת
                thumb.onerror = () => {
                    if (thumb.dataset.retried) return;
                    thumb.dataset.retried = '1';
                    if (thumb.src.includes('googleusercontent.com/d/')) {
                        const m = thumb.src.match(/\/d\/([^=]+)/);
                        if (m) thumb.src = `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1000`;
                    } else if (thumb.src.includes('drive.google.com')) {
                        const m = thumb.src.match(/[?&]id=([^&]+)/);
                        if (m) thumb.src = `https://lh3.googleusercontent.com/d/${m[1]}=w1000`;
                    } else {
                        const orig = cleanPath(imgData.src);
                        if (thumb.src.includes('/Beit-Halevi/')) {
                            thumb.src = orig;
                        } else {
                            thumb.src = `${window.location.origin}/Beit-Halevi/${orig}`;
                        }
                    }
                };

                thumb.addEventListener('click', () => {
                    currentIndex = parseInt(thumb.dataset.index);
                    // [שינוי] פותח תמונה ומעדכן את ה-URL
                    showLightboxImage(true);
                    lightbox.classList.add('active');
                    lightbox.setAttribute('aria-modal', 'true');
                    focusLock(lightbox, lightboxCloseBtn);
                });
                thumbnailGrid.appendChild(thumb);

                setTimeout(() => {
                    thumb.classList.add('visible');
                }, index * 50);
            });
        }, 300); // 300ms השהייה קטנה
    }
    gridOverlay.classList.add('active');
    document.body.classList.add('no-scroll');
}

// [חדש] פונקציה להצגת דיאלוג בחירת העדפת הורדה
// פונקציית עזר להצגת הודעת סטטוס מעוצבת צפה
function showNotificationToast(message, duration = 4500) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); z-index: 10005; display: flex; flex-direction: column; gap: 10px; pointer-events: none; width: 90%; max-width: 420px;';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.style.cssText = 'background: rgba(44, 62, 80, 0.95); color: white; padding: 14px 24px; border-radius: 50px; font-size: 0.95rem; font-weight: 500; box-shadow: 0 10px 30px rgba(0,0,0,0.25); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); animation: toastSlideUp 0.3s ease-out; direction: rtl; text-align: center; border: 1px solid rgba(255,255,255,0.1); line-height: 1.4;';
    toast.textContent = message;
    container.appendChild(toast);

    if (!document.getElementById('toast-animation-style')) {
        const style = document.createElement('style');
        style.id = 'toast-animation-style';
        style.innerHTML = `
            @keyframes toastSlideUp {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .toast-fade-out {
                opacity: 0 !important;
                transform: translateY(-20px) !important;
                transition: all 0.4s ease-out !important;
            }
        `;
        document.head.appendChild(style);
    }

    setTimeout(() => {
        toast.classList.add('toast-fade-out');
        setTimeout(() => {
            toast.remove();
            if (container.children.length === 0) container.remove();
        }, 400);
    }, duration);
}

// [חדש] לוגיקה לכפתורי שיתוף והורדה של כל האלבום
export function setupAlbumControls(albumData) {
    const albumSlug = albumData.slug;

    // 1. כפתור שיתוף
    // [חדש] שיתוף אלבום ישיר לוואטסאפ
    const albumWhatsappBtn = document.getElementById('album-whatsapp-btn');
    if (albumWhatsappBtn) {
        albumWhatsappBtn.style.display = 'flex';
        albumWhatsappBtn.onclick = () => {
            const shareUrl = `${window.location.origin}${window.location.pathname}#gallery/${albumSlug}`;
            const text = `*ישיבת בית הלוי - ראש העין*\n\nגלריית תמונות: ${albumData.title}\n\nלצפייה באלבום המלא:\n${shareUrl}`;
            window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
        };
    }

    if (albumShareBtn) {
        albumShareBtn.style.display = 'flex';
        albumShareBtn.onclick = async () => {
            const shareUrl = `${window.location.origin}${window.location.pathname}#gallery/${albumSlug}`;
            const shareData = {
                title: `גלריית תמונות: ${albumData.title}`,
                text: `צפו בגלריית התמונות המלאה של ישיבת בית הלוי - ${albumData.title}`,
                url: shareUrl
            };

            if (navigator.share) {
                try {
                    await navigator.share(shareData);
                } catch (err) {
                    console.error("Error sharing:", err);
                }
            } else {
                // גיבוי: העתקה ללוח
                try {
                    await navigator.clipboard.writeText(shareUrl);
                    alert('הקישור הועתק ללוח!');
                } catch (err) {
                    console.error("Error copying to clipboard:", err);
                }
            }
        };
    }

    // 2. כפתור הורדת הכל (הודעה צפה ללא אישור מציק)
    if (albumDownloadBtn) {
        albumDownloadBtn.onclick = async () => {
            // [תיקון קריטי] שמירת עותק מקומי של רשימת התמונות בתחילת התהליך
            // מונע קריסה או הורדה של קובץ ZIP חלקי במקרה שהמשתמש סוגר את הגלריה תוך כדי ההכנה.
            const imagesToDownload = [...currentAlbumImages];
            
            showNotificationToast("🚀 <strong>ההורדה החלה!</strong> אנו מכינים את קובץ הארכיון עבורך, הקבצים יירדו למכשירך בעוד מספר שניות...");

            albumDownloadBtn.disabled = true;
            albumDownloadBtn.textContent = 'מכין הורדה...';

            try {
                // 1. טעינת ספריית JSZip באופן דינמי
                if (typeof JSZip === 'undefined') {
                    albumDownloadBtn.textContent = 'טוען מנהל כיווץ...';
                    await new Promise((resolve, reject) => {
                        const script = document.createElement('script');
                        script.src = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";
                        script.onload = resolve;
                        script.onerror = () => reject(new Error("שגיאה בטעינת ספריית הכיווץ (JSZip)"));
                        document.head.appendChild(script);
                    });
                }

                // 2. הורדת התמונות ברקע ויצירת קובץ ה-ZIP
                const zip = new JSZip();
                const folder = zip.folder(albumSlug);
                let successCount = 0;
                let completedCount = 0;

                albumDownloadBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> מוריד (0/${imagesToDownload.length})`;

                const fetchPromises = imagesToDownload.map(async (img, i) => {
                    try {
                        let downloadUrl = img.src;
                        
                        // המרת כתובות גוגל דרייב לקישורי CDN התומכים ב-CORS
                        const match = img.src.match(/[?&]id=([^&]+)/);
                        if (match) {
                            const fileId = match[1];
                            downloadUrl = `https://lh3.googleusercontent.com/d/${fileId}`;
                        }

                        const res = await fetch(downloadUrl);
                        if (!res.ok) throw new Error("CORS or HTTP Error");
                        const blob = await res.blob();
                        
                        // גילוי סיומת התמונה
                        let extension = 'jpg';
                        if (img.src.includes('png')) extension = 'png';
                        else if (img.src.includes('gif')) extension = 'gif';
                        else if (img.src.includes('webp')) extension = 'webp';

                        const filename = `${albumSlug}-${i + 1}.${extension}`;
                        folder.file(filename, blob);
                        successCount++;
                    } catch (err) {
                        console.warn(`Failed to fetch image for ZIP: ${img.src}`, err);
                    } finally {
                        completedCount++;
                        albumDownloadBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> מוריד (${completedCount}/${imagesToDownload.length})`;
                    }
                });

                await Promise.all(fetchPromises);

                // 3. יצירת והורדת קובץ ה-ZIP
                if (successCount > 0) {
                    albumDownloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> מייצר קובץ ZIP...';
                    const content = await zip.generateAsync({ type: "blob" });
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(content);
                    link.download = `${albumSlug}.zip`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(link.href);
                } else {
                    throw new Error("CORS_BLOCK");
                }
            } catch (err) {
                console.warn("Dynamic ZIP creation failed or blocked by CORS, using fallback sequential download", err);
                showNotificationToast("⚠️ <strong>הורדה ישירה:</strong> עקב הגדרות הדפדפן, התמונות יורדו כעת כקבצים נפרדים בזה אחר זה. אנא אשר הורדה של קבצים מרובים אם תתבקש על ידי הדפדפן.", 6000);

                for (let i = 0; i < imagesToDownload.length; i++) {
                    const img = imagesToDownload[i];
                    const link = document.createElement('a');
                    link.href = img.src;
                    link.target = "_blank"; // מניעת החלפת הלשונית הנוכחית
                    link.download = `${albumSlug}-${i + 1}.jpg`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);

                    if (i < imagesToDownload.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 250));
                    }
                }
            } finally {
                albumDownloadBtn.disabled = false;
                albumDownloadBtn.innerHTML = '<i class="fas fa-file-archive"></i> הורד הכל';
            }
        };
    }
}

// [שינוי] פונקציה להצגת תמונה ב-Lightbox ועדכון ה-URL
export function showLightboxImage(isFirstLoad = false) {
    if (!currentAlbumImages[currentIndex]) return;
    const currentImage = currentAlbumImages[currentIndex];

    lightboxImg.src = currentImage.src;
    lightboxImg.alt = currentImage.alt;

    // [עמידות לסינון]: גיבוי אוטומטי במקרה של חסימה ב-Lightbox
    lightboxImg.onerror = () => {
        if (lightboxImg.dataset.retried) return;
        lightboxImg.dataset.retried = '1';
        if (lightboxImg.src.includes('googleusercontent.com/d/')) {
            const m = lightboxImg.src.match(/\/d\/([^=]+)/);
            if (m) lightboxImg.src = `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1200`;
        } else if (lightboxImg.src.includes('drive.google.com')) {
            const m = lightboxImg.src.match(/[?&]id=([^&]+)/);
            if (m) lightboxImg.src = `https://lh3.googleusercontent.com/d/${m[1]}=s0`;
        } else {
            const orig = cleanPath(currentImage.src);
            if (lightboxImg.src.includes('/Beit-Halevi/')) {
                lightboxImg.src = orig;
            } else {
                lightboxImg.src = `${window.location.origin}/Beit-Halevi/${orig}`;
            }
        }
    };

    updateDynamicMetadata(`${currentImage.alt} (תמונה ${currentIndex + 1})`);

    // [חדש] עדכון ה-URL עם הקישור לתמונה הספציפית
    const newHash = `#gallery/${currentImage.albumSlug}/${currentIndex + 1}`;
    // משתמש ב-replaceState כדי לא למלא את היסטוריית הדפדפן בצעדי ניווט מיותרים
    if (!isFirstLoad) {
        window.history.replaceState(null, null, newHash);
    } else {
        // בטעינה הראשונה (מלחיצה על תמונה קטנה), עושים pushState
        window.history.pushState(null, null, newHash);
    }

    // הגדרת כפתורי ניווט
    prevBtn.style.display = (currentIndex > 0) ? 'block' : 'none';
    nextBtn.style.display = (currentIndex < currentAlbumImages.length - 1) ? 'block' : 'none';

    // הגדרת כפתור הורדה
    if (downloadBtn) {
        downloadBtn.onclick = () => {
            const match = currentImage.src.match(/(?:[?&]id=|\/d\/)([^&=]+)/);
            const dlUrl = match ? `https://lh3.googleusercontent.com/d/${match[1]}=s0` : currentImage.src;

            const link = document.createElement('a');
            link.href = dlUrl;
            link.target = "_blank"; // מניעת החלפת הלשונית הנוכחית
            link.download = `${currentImage.albumSlug}-${currentIndex + 1}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };
    }

    // הגדרת כפתור שיתוף (משתף את הקישור לעמוד)
    if (shareBtn) {
        shareBtn.style.display = 'block';
        shareBtn.onclick = async () => {
            const shareUrl = `${window.location.origin}${window.location.pathname}#gallery/${currentImage.albumSlug}/${currentIndex + 1}`;
            const shareData = {
                title: `תמונה: ${currentImage.alt} (מס' ${currentIndex + 1})`,
                text: `צפו בתמונה זו מאלבום ${currentImage.alt} של ישיבת בית הלוי.`,
                url: shareUrl
            };

            if (navigator.share) {
                try {
                    await navigator.share(shareData);
                } catch (err) {
                    console.error("Error sharing:", err);
                }
            } else {
                // גיבוי: העתקה ללוח
                try {
                    await navigator.clipboard.writeText(shareUrl);
                    alert('הקישור הועתק ללוח!');
                } catch (err) {
                    console.error("Error copying to clipboard:", err);
                }
            }
        };
    }
}

// [שינוי] פונקציה לסגירת ה-Lightbox ועדכון ה-URL
export function closeLightbox() {
    lightbox.classList.remove('active');
    // אם יש אלבום פתוח ברקע, מחזירים לגריד האלבום והגלילה נשארת נעולה
    if (currentAlbumData) {
        gridOverlay.classList.add('active');
        document.body.classList.add('no-scroll');
        if (gridCloseBtn) focusLock(gridOverlay, gridCloseBtn);
    } else {
        document.body.classList.remove('no-scroll');
    }
    // [שינוי] במקום hash '#', נחזיר ל-hash של האלבום אם הוא פתוח ברקע
    const albumSlug = currentAlbumData ? currentAlbumData.slug : '';
    window.history.pushState(null, null, albumSlug ? `#gallery/${albumSlug}` : '#');
    if (currentAlbumData) {
        updateDynamicMetadata(`גלריה: ${currentAlbumData.title}`);
    } else {
        updateDynamicMetadata('ישיבת בית הלוי - ראש העין');
    }
}

export function showNextImage() {
    if (currentIndex < currentAlbumImages.length - 1) {
        currentIndex++;
        showLightboxImage(false);
    }
}

export function showPrevImage() {
    if (currentIndex > 0) {
        currentIndex--;
        showLightboxImage(false);
    }
}

// [חדש] פונקציה לטעינת גלריה ספציפית
export function openAlbumFromSlug(albumSlug, imageIndex) {
    const targetAlbum = allLoadedAlbums.find(album => album.slug === albumSlug);
    if (!targetAlbum) {
        console.error("Album not found for deep link:", albumSlug);
        return;
    }

    // פתיחת רשת התמונות הקטנות
    openGridOverlay(targetAlbum);

    // אם יש אינדקס תמונה חוקי, פותחים את ה-Lightbox
    if (imageIndex !== undefined && imageIndex >= 1 && imageIndex <= currentAlbumImages.length) {
        currentIndex = imageIndex - 1; // אינדקס הוא 0-based
        // setTimeout כדי לתת זמן למערכת להגיב
        setTimeout(() => {
            lightbox.classList.add('active');
            document.body.classList.add('no-scroll');
            showLightboxImage(true); // true = pushState (כניסה חדשה)
        }, 50);
    }
}

// [חדש] פונקציה לבדיקת ה-URL Hash
export function checkUrlHash() {
    const hash = window.location.hash;
    const match = hash.match(/^#gallery\/([^\/]+)(?:\/(\d+))?$/);

    if (match) {
        let albumSlug = match[1];
        // [תיקון קריטי] פענוח ה-URL כדי להתאים ל-slug שנוצר
        try {
            albumSlug = decodeURIComponent(albumSlug);
        } catch (e) {
            console.error("Failed to decode album slug", e);
        }

        const imageIndex = match[2] ? parseInt(match[2]) : undefined;
        openAlbumFromSlug(albumSlug, imageIndex);
    }
}
// [חדש] פונקציה לאתחול אירועי DOM (מיוצאת ל-main.js)
export function initGalleryEvents() {
    // ---- חיבור אירועי Lightbox ו-Grid (מקומי) ----
    if (lightboxCloseBtn) lightboxCloseBtn.addEventListener('click', closeLightbox);
    if (nextBtn) nextBtn.addEventListener('click', showNextImage);
    if (prevBtn) prevBtn.addEventListener('click', showPrevImage);
    if (lightbox) lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
    if (gridCloseBtn) gridCloseBtn.addEventListener('click', () => {
        gridOverlay.classList.remove('active');
        document.body.classList.remove('no-scroll');
        currentAlbumImages = [];
        gridOverlay.removeAttribute('aria-modal');
        window.history.pushState(null, null, '#');
        currentAlbumData = null;
        updateDynamicMetadata('ישיבת בית הלוי - ראש העין');
    });

    // [חדש] טיפול בכפתורי המקלדת
    document.addEventListener('keydown', (e) => {
        if (lightbox && lightbox.classList.contains('active')) {
            if (e.key === 'ArrowRight') showPrevImage(); // [שינוי] הפוך ל-RTL
            else if (e.key === 'ArrowLeft') showNextImage(); // [שינוי] הפוך ל-RTL
            else if (e.key === 'Escape') closeLightbox();
        }
    });

    // [חדש] תמיכה בהחלקה (Swipe) למכשירי מגע בלייטבוקס
    if (lightbox) {
        let touchStartX = 0;
        let touchStartY = 0;
        const SWIPE_THRESHOLD = 50;  // פיקסלים מינימלי לזיהוי החלקה
        const VERTICAL_LIMIT = 80;   // מניעת טריגר על גלילה אנכית

        lightbox.addEventListener('touchstart', (e) => {
            // לא מפעילים אם יש יותר מאצבע אחת (pinch-to-zoom)
            if (e.touches.length > 1) return;
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        }, { passive: true });

        lightbox.addEventListener('touchend', (e) => {
            if (e.changedTouches.length === 0) return;
            const dx = e.changedTouches[0].clientX - touchStartX;
            const dy = e.changedTouches[0].clientY - touchStartY;

            // מתעלמים אם ההחלקה הייתה אנכית יותר מאופקית
            if (Math.abs(dy) > VERTICAL_LIMIT) return;
            if (Math.abs(dx) < SWIPE_THRESHOLD) return;

            // ב-RTL: החלקה שמאלה = תמונה הבאה, ימינה = קודמת
            if (dx < 0) {
                showNextImage(); // החלקה שמאלה → הבא
            } else {
                showPrevImage(); // החלקה ימינה → קודם
            }
        }, { passive: true });
    }
}
