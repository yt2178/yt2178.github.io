import {
    GITHUB_TOKEN, GITHUB_USERNAME, REPO_OWNER, REPO_NAME, GALLERY_JSON_PATH,
    decodeBase64ToUtf8, encodeToBase64,
    uploadFileToDrive, makeFilePublic,
    googleLogin, APPS_SCRIPT_URL,
    showStatus, hideStatus,
    logEvent, putWithShaRetry, sendPushNotification
} from './admin-core.js';

let editingAlbumIndex = null; // לאחסן אם עורכים אלבום קיים
let selectedFiles = [];       // התמונות שנבחרו להעלאה

/**
 * [חדש] פונקציה לדחיסת תמונה לפני העלאה לחיסכון במקום בדרייב
 * מורידה איכות ל-0.8 ומגבילה רוחב למקסימום 1600px
 */
async function compressImage(file, maxWidth = 1600, quality = 0.8) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = event => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = (maxWidth / width) * height;
                    width = maxWidth;
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    if (blob) {
                        // המרת הסיומת ל-webp
                        const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
                        const newName = `${baseName}.webp`;
                        const compressedFile = new File([blob], newName, {
                            type: 'image/webp',
                            lastModified: Date.now(),
                        });
                        resolve(compressedFile);
                    } else {
                        reject(new Error("Canvas toBlob failed"));
                    }
                }, 'image/webp', quality);
            };
            img.onerror = err => reject(err);
        };
        reader.onerror = err => reject(err);
    });
}

// [חדש] לוגיקה לניווט בתצוגה המקדימה
let currentPreviewIndex = 0;
let previewImagesList = [];

function updatePreviewArrows() {
    const prevBtn = document.getElementById('modal-prev-btn'); // שמאל - חץ למעבר לבא
    const nextBtn = document.getElementById('modal-next-btn'); // ימין - חץ למעבר לקודם
    
    if (prevBtn) prevBtn.style.display = (currentPreviewIndex < previewImagesList.length - 1) ? 'block' : 'none';
    if (nextBtn) nextBtn.style.display = (currentPreviewIndex > 0) ? 'block' : 'none';
}

function showLargePreview(index) {
    previewImagesList = Array.from(document.querySelectorAll('#albumPreview .album-preview-item img')).map(img => img.src);
    if (previewImagesList.length === 0) return;
    
    currentPreviewIndex = index;
    const modal = document.getElementById('image-preview-modal');
    const img = document.getElementById('preview-large-img');
    if (modal && img) {
        img.src = previewImagesList[currentPreviewIndex];
        updatePreviewArrows();
        modal.style.display = 'flex';
    }
}

function navigatePreview(direction) {
    if (previewImagesList.length === 0) return;
    const newIndex = currentPreviewIndex + direction;
    if (newIndex < 0 || newIndex >= previewImagesList.length) return; // ללא לופ בחצים
    
    currentPreviewIndex = newIndex;
    const img = document.getElementById('preview-large-img');
    if (img) img.src = previewImagesList[currentPreviewIndex];
    updatePreviewArrows();
}

export function initGalleryAdminEvents() {
    const dateInput = document.getElementById('albumDateInput');
    if (dateInput && !dateInput.value) dateInput.value = new Date().toISOString().split('T')[0];
    // מאזין לסגירת מודאל תצוגה מקדימה לתמונות
    const closeBtn = document.getElementById('close-preview-modal');
    if (closeBtn) {
        closeBtn.onclick = () => {
            const modal = document.getElementById('image-preview-modal');
            if (modal) modal.style.display = 'none';
        };
    }
    
    const modal = document.getElementById('image-preview-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            // יציאה במידה ולחצו על הרקע מחוץ לתמונה
            if (e.target === modal || e.target.classList.contains('modal-content')) {
                modal.style.display = 'none';
            }
        });
    }

    // מאזיני חיצים לתצוגה המקדימה
    const prevBtn = document.getElementById('modal-prev-btn');
    const nextBtn = document.getElementById('modal-next-btn');
    if (prevBtn) prevBtn.addEventListener('click', (e) => { e.stopPropagation(); navigatePreview(1); });
    if (nextBtn) nextBtn.addEventListener('click', (e) => { e.stopPropagation(); navigatePreview(-1); });

    document.addEventListener('keydown', (e) => {
        const modal = document.getElementById('image-preview-modal');
        if (modal && modal.style.display === 'flex') {
            if (e.key === 'ArrowRight') navigatePreview(-1);
            if (e.key === 'ArrowLeft') navigatePreview(1);
            if (e.key === 'Escape') modal.style.display = 'none';
        }
    });
}

/* ----------------- אלמנטים ----------------- */
let galleryForm, albumTitleInput, albumImagesInput, galleryStatusMessage, galleryListContainer, albumPreview;

document.addEventListener('DOMContentLoaded', () => {
    galleryForm = document.getElementById('add-album-form');
    albumTitleInput = document.getElementById('albumTitleInput');
    albumImagesInput = document.getElementById('albumImagesInput');
    galleryStatusMessage = document.getElementById('gallery-status-message');
    galleryListContainer = document.getElementById('gallery-list-container');
    albumPreview = document.getElementById('albumPreview');
    const albumThumbnailUrlInput = document.getElementById('albumThumbnailUrl');
    if (albumImagesInput) albumImagesInput.addEventListener('change', handleFileSelect); // <--- הקוד הזה נכון!


    /* ----------------- יצירת אזור תצוגה מקדימה אם לא קיים ----------------- */
    if (!albumPreview && albumImagesInput) {
        albumPreview = document.createElement('div');
        albumPreview.id = 'albumPreview';
        albumPreview.className = 'album-preview-grid';
        albumImagesInput.insertAdjacentElement('afterend', albumPreview);
    }

    /* ----------------- מאזינים לאירועים ----------------- */
    if (albumImagesInput) albumImagesInput.addEventListener('change', handleFileSelect);

    const cancelBtn = document.getElementById('cancel-album-edit');
    if (cancelBtn) cancelBtn.addEventListener('click', resetGalleryForm);

    if (galleryForm) galleryForm.addEventListener('submit', handleGallerySubmit);
});

/* ----------------- לוגיקה ראשית ----------------- */
export async function loadAndRenderGallery() {
    // שימוש במשתנים הגלובליים מ-admin.js
    if (typeof GITHUB_TOKEN === 'undefined' || !GITHUB_TOKEN) return;

    const API_URL = "https://api.github.com/repos/" + REPO_OWNER + "/" + REPO_NAME + "/contents/" + GALLERY_JSON_PATH;

    try {
        const response = await window.fetch(API_URL, {
            headers: { 'Authorization': "token " + GITHUB_TOKEN },
            cache: 'no-store'
        });

        if (!response.ok) throw new Error('Failed to fetch gallery JSON');

        const fileData = await response.json();
        // שימוש בפונקציית העזר מ-admin.js או הגדרה מקומית אם צריך
        const content = decodeBase64ToUtf8(fileData.content.replace(/\n/g, ''));
        const galleryArray = JSON.parse(content);

        renderGalleryList(galleryArray, fileData.sha);
    } catch (err) {
        showStatus('שגיאה בטעינת הגלריה', null, true);
    }
}
// חשיפת הפונקציה לחלון כדי ש-admin.js יוכל לקרוא לה
window.loadAndRenderGallery = loadAndRenderGallery;

function renderGalleryList(galleryArray, sha) {
    if (!galleryListContainer) return;
    galleryListContainer.replaceChildren();

    if (galleryArray.length === 0) {
        const emptyStateDiv = document.createElement('div');
        emptyStateDiv.className = 'empty-state';

        const icon = document.createElement('i');
        icon.className = 'fas fa-images';

        const text = document.createElement('p');
        text.textContent = 'אין אלבומים להצגה. התחל ביצירת האלבום הראשון!';

        emptyStateDiv.appendChild(icon);
        emptyStateDiv.appendChild(text);

        galleryListContainer.appendChild(emptyStateDiv);
        return;
    }

    galleryArray.forEach((album, index) => {
        const div = document.createElement('div');
        div.className = 'album-item-admin';

        // Item Details
        const detailsDiv = document.createElement('div');
        detailsDiv.className = 'item-details';

        const img = document.createElement('img');
        img.src = album.data.thumbnail;
        img.alt = album.data.title;
        img.className = 'item-thumb-admin';

        const infoDiv = document.createElement('div');
        const h3 = document.createElement('h3');
        h3.textContent = album.data.title; // Safe XSS
        const p = document.createElement('p');
        const dateText = album.data.date ? ' | תאריך: ' + album.data.date : '';
        p.textContent = (album.data.images ? album.data.images.length : 0) + ' תמונות' + dateText;

        infoDiv.appendChild(h3);
        infoDiv.appendChild(p);
        detailsDiv.appendChild(img);
        detailsDiv.appendChild(infoDiv);

        // Item Actions
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'item-actions';

        const editBtn = document.createElement('button');
        editBtn.className = 'edit-album-btn premium-btn small';
        editBtn.dataset.index = index;

        const editIcon = document.createElement('i');
        editIcon.className = 'fas fa-edit';
        editBtn.appendChild(editIcon);
        editBtn.appendChild(document.createTextNode(' ערוך'));

        editBtn.addEventListener('click', () => editAlbum(album, index));

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-album-btn premium-btn small danger';
        deleteBtn.dataset.index = index;

        const deleteIcon = document.createElement('i');
        deleteIcon.className = 'fas fa-trash-alt';
        deleteBtn.appendChild(deleteIcon);
        deleteBtn.appendChild(document.createTextNode(' מחק'));

        deleteBtn.addEventListener('click', () => deleteAlbum(index));

        actionsDiv.appendChild(editBtn);
        actionsDiv.appendChild(deleteBtn);

        div.appendChild(detailsDiv);
        div.appendChild(actionsDiv);

        galleryListContainer.appendChild(div);
    });

    galleryListContainer.dataset.sha = sha;
}
function editAlbum(album, index) {
    const albumThumbnailUrlInput = document.getElementById('albumThumbnailUrl');
    const albumDateInput = document.getElementById('albumDateInput');
    albumTitleInput.value = album.data.title || '';
    if (albumDateInput) albumDateInput.value = album.data.date || new Date().toISOString().split('T')[0];
    if (albumThumbnailUrlInput) albumThumbnailUrlInput.value = album.data.thumbnail || '';

    albumPreview.replaceChildren();
    selectedFiles = []; // איפוס בחירות חדשות

    // הצגת תמונות קיימות
    (album.data.images || []).forEach((imgPath, idx) => {
        const item = createPreviewItem(imgPath, true, idx);
        if (album.data.thumbnail === imgPath) {
            item.classList.add('is-thumbnail');
            const badge = document.createElement('div');
            badge.className = 'preview-thumb-badge';
            badge.textContent = 'שער';
            item.appendChild(badge);
        }
        albumPreview.appendChild(item);
    });

    editingAlbumIndex = index;
    albumTitleInput.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // שינוי כפתור השמירה
    const submitBtn = galleryForm.querySelector('button[type="submit"]');
    submitBtn.textContent = 'עדכן אלבום';
    const cancelBtn = document.getElementById('cancel-album-edit');
    if (cancelBtn) cancelBtn.style.display = 'inline-block';
}

export function resetGalleryForm() {
    if (galleryForm) galleryForm.reset();
    const albumDateInput = document.getElementById('albumDateInput');
    if (albumDateInput) albumDateInput.value = new Date().toISOString().split('T')[0];

    // ניקוי URL-ים מהזיכרון
    selectedFiles.forEach(f => {
        if (f.localUrl) URL.revokeObjectURL(f.localUrl);
    });

    // ניקוי תצוגה מקדימה
    if (albumPreview) albumPreview.replaceChildren();
    selectedFiles = [];
    selectedFiles = [];
    editingAlbumIndex = null;
    const albumThumbnailUrlInput = document.getElementById('albumThumbnailUrl');
    if (albumThumbnailUrlInput) albumThumbnailUrlInput.value = '';

    const submitBtn = galleryForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = 'שמור אלבום';

    const cancelBtn = document.getElementById('cancel-album-edit');
    if (cancelBtn) cancelBtn.style.display = 'none';
}
async function deleteAlbum(indexToDelete) {
    if (!confirm('האם אתה בטוח שברצונך למחוק את האלבום?')) return;

    try {
        const API_URL = "https://api.github.com/repos/" + REPO_OWNER + "/" + REPO_NAME + "/contents/" + GALLERY_JSON_PATH;
        const fileResponse = await window.fetch(API_URL, {
            headers: { 'Authorization': "token " + GITHUB_TOKEN },
            cache: 'no-store'
        });

        if (!fileResponse.ok) throw new Error("Failed to fetch gallery JSON");

        const fileData = await fileResponse.json();
        const galleryArray = JSON.parse(decodeBase64ToUtf8(fileData.content.replace(/\n/g, '')));

        // מחיקה
        galleryArray.splice(indexToDelete, 1);

        const updatedContentBase64 = encodeToBase64(JSON.stringify(galleryArray, null, 2));

        const payload = {
            message: `Delete album index ${indexToDelete} (by ${GITHUB_USERNAME})`,
            content: updatedContentBase64,
            branch: 'main'
        };
        const updateResponse = await putWithShaRetry(API_URL, payload, GITHUB_TOKEN, fileData.sha, 2);

        if (updateResponse && updateResponse.ok) {
            galleryStatusMessage.textContent = 'האלבום נמחק בהצלחה';
            galleryStatusMessage.style.color = 'green';
            logEvent(`מחק אלבום תמונות אינדקס ${indexToDelete}`, 'gallery');
            loadAndRenderGallery();
        } else {
            throw new Error('Update failed');
        }
    } catch (err) {
        showStatus('שגיאה במחיקת האלבום: ' + err.message, null, true);
    }
}

/* ----------------- פונקציה לוגיקה ראשית ----------------- */
async function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    for (const file of files) {
        // [תיקון קריטי ל-404]: יצירת URL זמני לתצוגה מקדימה
        const localUrl = URL.createObjectURL(file);

        selectedFiles.push({
            file: file,
            localUrl: localUrl
        });

        // הצגת תצוגה מקדימה
        const item = createPreviewItem(localUrl, false);
        albumPreview.appendChild(item);
    }

    if (!albumPreview.querySelector('.is-thumbnail')) {
        const firstItem = albumPreview.querySelector('.album-preview-item');
        if (firstItem) {
            const starBtn = firstItem.querySelector('.preview-btn:not(.remove)');
            if (starBtn) starBtn.click();
        }
    }
    e.target.value = '';
}

function createPreviewItem(src, isExisting = false, existingIndex = null) {
    const wrapper = document.createElement('div');
    wrapper.className = 'album-preview-item';
    wrapper.dataset.existing = isExisting ? '1' : '0';
    if (isExisting && existingIndex !== null) wrapper.dataset.index = existingIndex;

    const img = document.createElement('img');
    img.src = src;
    img.style.cursor = 'pointer';
    wrapper.appendChild(img);

    // כפתורים: הגדר כתמונת שער + מחק
    const controls = document.createElement('div');
    controls.className = 'preview-controls';

    // כפתור תמונת שער (סטאר)
    const thumbBtn = document.createElement('button');
    thumbBtn.type = 'button';
    thumbBtn.className = 'preview-btn';
    thumbBtn.title = 'בחירת תמונת שער לאלבום';
    thumbBtn.textContent = '⭐';

    const setAsThumbnail = () => {
        const albumThumbnailUrlInput = document.getElementById('albumThumbnailUrl');
        if (albumThumbnailUrlInput) albumThumbnailUrlInput.value = src;

        // עדכון ויזואלי של כל הפריטים
        Array.from(albumPreview.querySelectorAll('.album-preview-item')).forEach(el => {
            el.classList.remove('is-thumbnail');
            const b = el.querySelector('.preview-thumb-badge');
            if (b) b.remove();
        });

        // עדכון הפריט הנוכחי
        wrapper.classList.add('is-thumbnail');
        const badge = document.createElement('div');
        badge.className = 'preview-thumb-badge';
        badge.textContent = 'שער';
        wrapper.appendChild(badge);
    };

    thumbBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        setAsThumbnail();
    });

    // לחיצה על התמונה פותחת את המסך המלא
    img.addEventListener('click', (e) => {
        e.stopPropagation();
        const allItems = Array.from(albumPreview.querySelectorAll('.album-preview-item'));
        const index = allItems.indexOf(wrapper);
        showLargePreview(index !== -1 ? index : 0);
    });

    // כפתור מחיקה
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'preview-btn remove';
    removeBtn.title = 'הסר תמונה';
    removeBtn.textContent = '🗑';
    removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = img.src;

        if (wrapper.dataset.existing === '0') {
            const fileObj = selectedFiles.find(f => f.localUrl === url);
            if (fileObj) {
                URL.revokeObjectURL(fileObj.localUrl);
                selectedFiles = selectedFiles.filter(f => f.localUrl !== url);
            }
        }

        const albumThumbnailUrlInput = document.getElementById('albumThumbnailUrl');
        if (albumThumbnailUrlInput && albumThumbnailUrlInput.value === url) {
            albumThumbnailUrlInput.value = '';
        }

        wrapper.remove();
    });

    controls.appendChild(thumbBtn);
    controls.appendChild(removeBtn);

    wrapper.appendChild(controls);

    return wrapper;
}
// admin-gallery.js (פונקציית handleGallerySubmit - מתוקנת)
async function handleGallerySubmit(e) {
    e.preventDefault();

    const albumTitle = albumTitleInput.value.trim();
    const albumThumbnailUrlInput = document.getElementById('albumThumbnailUrl');
    const albumImages = albumImagesInput.files;
    
    const submitBtn = galleryForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    if (!albumTitle) {
        showStatus('נא להזין שם לאלבום', null, true);
        if (submitBtn) submitBtn.disabled = false;
        return;
    }

    // בדיקת אורך כותרת
    if (albumTitle.length < 2 || albumTitle.length > 100) {
        showStatus('שם האלבום חייב להיות בין 2 ל-100 תווים.', null, true);
        if (submitBtn) submitBtn.disabled = false;
        return;
    }

    // בדיקת URL לתמונת השער אם הוזן ידנית
    if (albumThumbnailUrlInput && albumThumbnailUrlInput.value) {
        try {
            new URL(albumThumbnailUrlInput.value);
        } catch (e) {
            // אם זה לא URL תקין וזה לא מקומי (blob)
            if (!albumThumbnailUrlInput.value.startsWith('blob:')) {
                showStatus('כתובת תמונת השער אינה תקינה.', null, true);
                if (submitBtn) submitBtn.disabled = false;
                return;
            }
        }
    }

    // בדיקת קבצים נבחרים - סוג וגודל
    for (const file of albumImages) {

        // בדיקת סוג קובץ (רק תמונות)
        if (!file.type.startsWith('image/')) {
            showStatus(`הקובץ "${file.name}" אינו תמונה. אנא העלה רק קבצי תמונות.`, null, true);
            if (submitBtn) submitBtn.disabled = false;
            return;
        }

        // בדיקת גודל קובץ (מקסימום 10MB)
        const maxSizeInBytes = 10 * 1024 * 1024;
        if (file.size > maxSizeInBytes) {
            showStatus(`הקובץ "${file.name}" גדול מדי. הגודל המקסימלי המותר הוא 10MB.`, null, true);
            if (submitBtn) submitBtn.disabled = false;
            return;
        }
    }

    const existingImagesCount = document.getElementById('albumPreview')?.children.length || 0;
    if (albumImages.length === 0 && existingImagesCount === 0) {
        showStatus('נא לבחור לפחות תמונה אחת לאלבום.', null, true);
        if (submitBtn) submitBtn.disabled = false;
        return;
    }

    if (!albumThumbnailUrlInput?.value) {
        showStatus('יש לבחור תמונת שער מתוך התמונות שהעלית, או להעלות חדשה, על ידי לחיצה על הכוכבית.', null, true);
        if (submitBtn) submitBtn.disabled = false;
        return;
    }

    showStatus('מכין העלאה לדרייב... נא להמתין', 10);

    try {
        // [תיקון קריטי 1]: ביצוע Login וקבלת ה-Token
        showStatus('מתחבר לחשבון גוגל...', 20);
        const googleAccessToken = APPS_SCRIPT_URL ? null : await googleLogin();

        // 1. השגת הקובץ הנוכחי
        showStatus('ניגש למאגר הנתונים ב-GitHub...', 35);
        const API_URL = "https://api.github.com/repos/" + REPO_OWNER + "/" + REPO_NAME + "/contents/" + GALLERY_JSON_PATH;
        const fileResponse = await window.fetch(API_URL, {
            headers: { 'Authorization': "token " + GITHUB_TOKEN },
            cache: 'no-store'
        });

        if (!fileResponse.ok) throw new Error('Failed to fetch gallery JSON');
        const fileData = await fileResponse.json();
        const galleryArray = JSON.parse(decodeBase64ToUtf8(fileData.content.replace(/\n/g, '')));

        // 2. איסוף רשימת התמונות הסופית מה-DOM
        const previewItems = albumPreview.querySelectorAll('.album-preview-item');
        const totalItems = previewItems.length;
        let processedCount = 0;

        showStatus(`מתחיל עיבוד והעלאה של ${totalItems} תמונות...`, 40);

        const selectedFilesMap = new Map(selectedFiles.map(f => [f.localUrl, f]));
        const previewItemsArray = Array.from(previewItems);
        const results = new Array(previewItemsArray.length);
        const uploadTasks = [];

        for (let i = 0; i < previewItemsArray.length; i++) {
            const item = previewItemsArray[i];
            const img = item.querySelector('img');

            if (item.dataset.existing === '1') {
                processedCount++;
                results[i] = img.getAttribute('src');
            } else {
                const fileObj = selectedFilesMap.get(img.src);
                if (fileObj) {
                    uploadTasks.push(async () => {
                        let fileToUpload = fileObj.file;
                        const originalSize = (fileToUpload.size / 1024 / 1024).toFixed(2);
                        console.log(`DEBUG: Original file size: ${originalSize}MB`);

                        try {
                            // דחיסת תמונה לחיסכון בנפח (רק אם זו תמונה)
                            if (fileToUpload.type.startsWith('image/')) {
                                fileToUpload = await compressImage(fileToUpload);
                                const compressedSize = (fileToUpload.size / 1024 / 1024).toFixed(2);
                                console.log(`DEBUG: Compressed file size: ${compressedSize}MB`);
                            }
                        } catch (compressErr) {
                            console.warn("Compression failed, uploading original:", compressErr);
                        }

                        const fileId = await uploadFileToDrive(fileToUpload, googleAccessToken);
                        const publicUrl = await makeFilePublic(fileId, googleAccessToken);

                        processedCount++;
                        showStatus(`מעלה תמונות לדרייב (${processedCount}/${totalItems})...`, 40 + (processedCount / totalItems * 40));

                        results[i] = publicUrl;
                    });
                } else {
                    results[i] = null;
                }
            }
        }

        const BATCH_SIZE = 3;
        for (let i = 0; i < uploadTasks.length; i += BATCH_SIZE) {
            const batch = uploadTasks.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(task => task()));
        }
        const finalImages = results.filter(url => url !== null);

        // 3. בניית האובייקט החדש
        let thumbnailUrl = "";
        // const previewItemsArray = Array.from(previewItems); // already defined above
        const thumbnailIndex = previewItemsArray.findIndex(item => item.classList.contains('is-thumbnail'));
        
        if (thumbnailIndex !== -1 && results[thumbnailIndex]) {
            thumbnailUrl = results[thumbnailIndex];
        } else {
            thumbnailUrl = finalImages[0] || "";
        }

        if (!thumbnailUrl && finalImages.length === 0) {
            showStatus('שגיאה: אין תמונות באלבום. אנא הוסף לפחות תמונה אחת.', null, true);
            if (submitBtn) submitBtn.disabled = false;
            return;
        }

        const albumDateInput = document.getElementById('albumDateInput');
        const albumDate = (albumDateInput && albumDateInput.value) ? albumDateInput.value : new Date().toISOString().split('T')[0];

        const newAlbum = {
            data: {
                title: albumTitleInput.value,
                date: albumDate,
                thumbnail: thumbnailUrl,
                images: finalImages
            },
            content: ""
        };

        // 4. עדכון המערך
        const isUpdate = editingAlbumIndex !== null;
        const savedEditingAlbumIndex = editingAlbumIndex;
        if (isUpdate) {
            galleryArray[editingAlbumIndex] = newAlbum;
            editingAlbumIndex = null;
        } else {
            galleryArray.push(newAlbum);
        }

        showStatus('מעדכן את האתר... כמעט סיימנו', 90);

        // 5. שמירה ב-GitHub
        const transformFn = (latestContent) => {
            if (savedEditingAlbumIndex !== null) {
                latestContent[savedEditingAlbumIndex] = newAlbum;
            } else {
                latestContent.push(newAlbum);
            }
            return encodeToBase64(JSON.stringify(latestContent, null, 2));
        };

        const initialContent = encodeToBase64(JSON.stringify(galleryArray, null, 2));

        const updateResponse = await putWithShaRetry(API_URL, {
            message: `Update gallery: ${albumTitleInput.value}`,
            content: initialContent,
            branch: 'main'
        }, GITHUB_TOKEN, fileData.sha, 3, transformFn);

        if (updateResponse && updateResponse.ok) {
            showStatus('האלבום נשמר בהצלחה!', 100);
            setTimeout(hideStatus, 1500);
            logEvent(`${isUpdate ? 'עדכן' : 'הוסיף'} אלבום: ${albumTitleInput.value}`, 'gallery');
            
            // [חדש] התראה על הוספת/עדכון אלבום
            if (!isUpdate) {
                sendPushNotification(albumTitleInput.value, "גלריית תמונות חדשה פורסמה באתר הישיבה: היכנסו לצפייה.", false);
            } else {
                sendPushNotification(albumTitleInput.value, "עדכון בגלריית התמונות באתר הישיבה: היכנסו לצפייה בתמונות החדשות.", true);
            }
            
            resetGalleryForm();
            loadAndRenderGallery();
        } else {
            throw new Error('Save to GitHub failed');
        }

    } catch (err) {
        showStatus('שגיאה בתהליך השמירה: ' + err.message, null, true);
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}
