// admin-tasks.js - ניהול משימות מנהל פנימיות
import {
    REPO_OWNER, REPO_NAME, TASKS_JSON_PATH,
    GITHUB_TOKEN,
    showStatus, hideStatus, encodeToBase64, decodeBase64ToUtf8,
    putWithShaRetry
} from './admin-core.js';

let allTasks = [];
let tasksSha = null;
let hasUnsavedChanges = false;
const LOCAL_TASKS_KEY = 'admin_local_tasks_backup';
let syncInterval = null;

// DOM helpers
const getTasksListContainer = () => document.getElementById('tasks-list');
const getNewTaskInput = () => document.getElementById('new-task-input');

export async function loadAndRenderTasks() {
    const container = getTasksListContainer();
    if (!container) return;
    
    container.innerHTML = '<p style="text-align:center;">טוען משימות...</p>';
    
    try {
        const API_URL = "https://api.github.com/repos/" + REPO_OWNER + "/" + REPO_NAME + "/contents/" + TASKS_JSON_PATH;
        const res = await window.fetch(API_URL, {
            headers: { 'Authorization': "token " + GITHUB_TOKEN },
            cache: 'no-store'
        });
        
        let gitHubTasks = [];
        if (res.ok) {
            const data = await res.json();
            tasksSha = data.sha;
            gitHubTasks = JSON.parse(decodeBase64ToUtf8(data.content.replace(/\n/g, '')));
        } else if (res.status === 404) {
            gitHubTasks = [];
            tasksSha = null;
        } else {
            throw new Error('Failed to fetch tasks');
        }
        
        allTasks = gitHubTasks;

        // בדוק שחזור מקומי
        const localRaw = localStorage.getItem(LOCAL_TASKS_KEY);
        if (localRaw) {
            try {
                const localTasks = JSON.parse(localRaw);
                if (localTasks.length > 0 && confirm("נמצאו משימות שלא נשמרו לשרת (שמירה מקומית). האם ברצונך לשחזר רשימה זו?")) {
                    allTasks = localTasks;
                    hasUnsavedChanges = true;
                } else {
                    localStorage.removeItem(LOCAL_TASKS_KEY);
                }
            } catch (e) {
                console.error("Error parsing local tasks:", e);
            }
        }
        
        renderTasks();

        // [חדש] עדכון באדג' (Badge) של האפליקציה במידה ונתמך
        if ('setAppBadge' in navigator) {
            const openTasks = allTasks.filter(t => !t.completed).length;
            if (openTasks > 0) navigator.setAppBadge(openTasks).catch(() => {});
            else navigator.clearAppBadge().catch(() => {});
        }

        // התחל שמירה מקומית כל 10 שניות
        if (syncInterval) clearInterval(syncInterval);
        syncInterval = setInterval(() => {
            if (hasUnsavedChanges) {
                localStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(allTasks));
            }
        }, 10000);

    } catch (err) {
        const p = document.createElement('p');
        p.style.cssText = 'text-align:center; color:red;';
        p.textContent = 'שגיאה בטעינת משימות: ' + err.message;
        container.innerHTML = '';
        container.appendChild(p);
    }
}

function renderTasks() {
    const container = getTasksListContainer();
    if (!container) return;
    
    if (allTasks.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#7f8c8d;">אין משימות פתוחות. עבודה טובה!</p>';
        return;
    }
    
    container.innerHTML = '';
    const fragment = document.createDocumentFragment();
    allTasks.forEach((task, index) => {
        const div = document.createElement('div');
        div.className = `task-item ${task.completed ? 'completed' : ''}`;
        div.style.cssText = `
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px;
            background: ${task.completed ? '#f1f5f9' : '#fff'};
            border: 1px solid ${task.completed ? '#e2e8f0' : '#cbd5e1'};
            border-radius: 8px;
            margin-bottom: 10px;
            transition: all 0.2s;
        `;
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = task.completed;
        checkbox.style.cursor = 'pointer';
        checkbox.addEventListener('change', () => toggleTask(index));
        
        const span = document.createElement('span');
        span.textContent = task.text;
        span.style.cssText = `
            flex: 1;
            font-size: 1rem;
            text-decoration: ${task.completed ? 'line-through' : 'none'};
            color: ${task.completed ? '#64748b' : '#1e293b'};
        `;
        
        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '🗑️';
        deleteBtn.style.cssText = 'background:none; border:none; cursor:pointer; font-size:1.1rem; opacity:0.6;';
        deleteBtn.title = 'מחק משימה';
        deleteBtn.addEventListener('click', () => deleteTask(index));
        deleteBtn.addEventListener('mouseover', () => deleteBtn.style.opacity = '1');
        deleteBtn.addEventListener('mouseout', () => deleteBtn.style.opacity = '0.6');
        
        div.appendChild(checkbox);
        div.appendChild(span);
        div.appendChild(deleteBtn);
        fragment.appendChild(div);
    });
    container.appendChild(fragment);
}

let debounceSyncTimer = null;
function triggerAutoSync() {
    hasUnsavedChanges = true;
    if (debounceSyncTimer) clearTimeout(debounceSyncTimer);
    debounceSyncTimer = setTimeout(() => {
        forceSyncTasks();
    }, 2000);
}

function addTask() {
    const input = getNewTaskInput();
    const text = input ? input.value.trim() : '';
    if (!text) return;
    
    allTasks.unshift({
        text,
        completed: false,
        createdAt: new Date().toISOString()
    });
    
    if (input) input.value = '';
    hasUnsavedChanges = true;
    renderTasks();
    triggerAutoSync();
}

function toggleTask(index) {
    const task = allTasks.at(index);
    if (task) {
        task.completed = !task.completed;
        hasUnsavedChanges = true;
        renderTasks();
        triggerAutoSync();
    }
}

function deleteTask(index) {
    const task = allTasks.at(index);
    if (task) {
        allTasks.splice(index, 1);
        hasUnsavedChanges = true;
        renderTasks();
        triggerAutoSync();
    }
}

export async function forceSyncTasks() {
    if (!hasUnsavedChanges) return;

    showStatus('מעדכן משימות ב-GitHub...', 50);
    const API_URL = "https://api.github.com/repos/" + REPO_OWNER + "/" + REPO_NAME + "/contents/" + TASKS_JSON_PATH;
    
    try {
        const initialContent = encodeToBase64(JSON.stringify(allTasks, null, 2));
        const payload = {
            message: "עדכון משימות לביצוע",
            content: initialContent,
            branch: 'main'
        };
        
        const transformFn = () => encodeToBase64(JSON.stringify(allTasks, null, 2));

        const res = await putWithShaRetry(API_URL, payload, GITHUB_TOKEN, tasksSha, 3, transformFn);
        if (res.ok) {
            const data = await res.json();
            tasksSha = data.content.sha;
            hasUnsavedChanges = false;
            localStorage.removeItem(LOCAL_TASKS_KEY); // מחיקת השמירה המקומית
            logEvent('עדכן משימות לביצוע', 'tasks');
            showStatus('המשימות נשמרו בהצלחה! ✅', 100);
            setTimeout(hideStatus, 1500);
        } else {
            throw new Error('Failed to save tasks');
        }
    } catch (err) {
        showStatus(`שגיאה בשמירת משימות: ${err.message}`, null, true);
    }
}

function initTasksListeners() {
    const addTaskBtn = document.getElementById('add-task-btn');
    const newTaskInput = document.getElementById('new-task-input');

    if (addTaskBtn) {
        addTaskBtn.addEventListener('click', addTask);
    }
    if (newTaskInput) {
        newTaskInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addTask();
        });
    }

    // שמירה בשינוי מצב ראות או סגירת הדף
    document.addEventListener("visibilitychange", function() {
        if (document.visibilityState === 'hidden' && hasUnsavedChanges) {
            forceSyncTasks();
        }
    });

    // סנכרון בעת חזרה מדף המשימות לפאנל הניהול הראשי
    const dashboardsBtns = document.querySelectorAll('.back-to-dashboard-btn, #bnav-dashboard');
    dashboardsBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (document.getElementById('tasks-section').style.display !== 'none' && hasUnsavedChanges) {
                forceSyncTasks();
            }
        });
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTasksListeners);
} else {
    initTasksListeners();
}

