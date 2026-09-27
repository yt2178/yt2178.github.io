// news.js
import { allLoadedNews } from './data-loader.js';
import { focusLock } from './utils.js';
import {
    newsModal, modalTitle, modalDate, modalBody,
    newsShareBtn, newsWhatsappBtn, newsPrevBtn, newsNextBtn,
    updateDynamicMetadata
} from './main.js';
export let currentNewsIndex = 0;
export function closeNewsModal() {
    newsModal.classList.remove('active');
    document.body.classList.remove('no-scroll');
    newsModal.removeAttribute('aria-modal');
    // ניקוי ה-hash לכתובת הבסיס של #news
    window.history.pushState(null, null, '#');
    updateDynamicMetadata('ישיבת בית הלוי - ראש העין');
}
// [חדש] פתיחת חלון קופץ עבור ידיעה אחת
export function openNewsModal(newsItem) {
    if (!newsModal) return;

    // [שינוי] מצא את האינדקס של הידיעה הנוכחית
    currentNewsIndex = allLoadedNews.findIndex(item => item.slug === newsItem.slug);

    const date = new Date(newsItem.date);
    const formattedDate = date.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });

    modalTitle.textContent = newsItem.title;
    modalDate.textContent = `פורסם בתאריך: ${formattedDate}`;
    
    // [תיקון אבטחה] ניקוי HTML שיוצר מ-Markdown למניעת XSS
    const dirtyHTML = marked.parse(newsItem.body);
    modalBody.innerHTML = '';
    const fragment = document.createRange().createContextualFragment(DOMPurify.sanitize(dirtyHTML));
    modalBody.appendChild(fragment);

    // [חדש] עדכון כותרת הדף
    updateDynamicMetadata(newsItem.title);

    // לוגיקת שיתוף (עם גיבוי)
    if (newsWhatsappBtn) {
        newsWhatsappBtn.style.display = 'flex';
        newsWhatsappBtn.onclick = () => {
            const shareUrl = `${window.location.origin}${window.location.pathname}#news/${newsItem.slug}`;
            const text = `ידיעה חדשה מישיבת בית הלוי: ${newsItem.title}\n\n${shareUrl}`;
            window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
        };
    }

    if (newsShareBtn) {
        newsShareBtn.style.display = 'flex';
        newsShareBtn.onclick = async () => {
            const shareUrl = `${window.location.origin}${window.location.pathname}#news/${newsItem.slug}`;
            const shareData = {
                title: newsItem.title,
                text: `ידיעה חדשה מישיבת בית הלוי: ${newsItem.title}`,
                url: shareUrl
            };

            if (navigator.share) {
                try {
                    await navigator.share(shareData);
                } catch (error) {
                    console.log('Error sharing news:', error);
                }
            } else {
                // גיבוי: העתקה ללוח
                try {
                    await navigator.clipboard.writeText(shareUrl);
                    alert('הקישור הועתק ללוח!');
                } catch (error) {
                    console.log('Error copying to clipboard:', error);
                }
            }
        };
    }

    // [חדש] לוגיקת ניווט: הצגת כפתורי הבא/קודם
    newsPrevBtn.style.display = (currentNewsIndex < allLoadedNews.length - 1) ? 'flex' : 'none';
    newsNextBtn.style.display = (currentNewsIndex > 0) ? 'flex' : 'none';

    newsModal.classList.add('active');
    document.body.classList.add('no-scroll');
    newsModal.setAttribute('aria-modal', 'true');
    const modalCloseBtn = newsModal.querySelector('.modal-close');
    focusLock(newsModal, modalCloseBtn);
}
// [חדש] פונקציה לבדיקת ה-URL Hash עבור חדשות
export function checkNewsHash() {
    const hash = window.location.hash;
    const match = hash.match(/^#news\/([^\/]+)$/); // בודק #news/slug

    if (match) {
        let newsSlug = match[1];
        // פענוח ה-URL
        try {
            newsSlug = decodeURIComponent(newsSlug);
        } catch (e) {
            console.error("Failed to decode news slug", e);
        }
        // חפש את הפריט המלא
        const targetNews = allLoadedNews.find(item => item.slug === newsSlug);
        if (targetNews) {
            openNewsModal(targetNews);
            // גלילה אוטומטית לראש העמוד
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }
}
// [חדש] פונקציה לניווט בין ידיעות חדשות
export function navigateNews(direction) {
    let newIndex = currentNewsIndex + direction;
    if (newIndex >= 0 && newIndex < allLoadedNews.length) {
        const nextItem = allLoadedNews[newIndex];
        openNewsModal(nextItem);
        // עדכון ה-URL
        window.history.pushState(null, null, `#news/${nextItem.slug}`);
    }
}
// [חדש] פונקציה לאתחול אירועי DOM (מיוצאת ל-main.js)
export function initNewsEvents() {
    if (newsPrevBtn) newsPrevBtn.addEventListener('click', () => navigateNews(1));
    if (newsNextBtn) newsNextBtn.addEventListener('click', () => navigateNews(-1));
    if (newsModal) {
        const modalCloseBtn = newsModal.querySelector('.modal-close');
        modalCloseBtn.addEventListener('click', closeNewsModal);
        modalCloseBtn.addEventListener('click', closeNewsModal);
        newsModal.addEventListener('click', (e) => {
            if (e.target === newsModal) closeNewsModal();
        });
    }
}