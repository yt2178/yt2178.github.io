import { fetchStaticJson } from './utils.js';

// הגדרות ברירת מחדל - ראש העין
const DEFAULT_CITY = {
    name: "ראש העין",
    geonameid: "293690"
};

let currentCity = DEFAULT_CITY;
try {
    if (typeof localStorage !== 'undefined') {
        currentCity = JSON.parse(localStorage.getItem('zmanim_city')) || DEFAULT_CITY;
    }
} catch (e) { }


const POPULAR_CITIES = [
    { name: "ראש העין", geonameid: "293690" },
    { name: "ירושלים", geonameid: "281184" },
    { name: "בני ברק", geonameid: "295514" },
    { name: "תל אביב", geonameid: "293397" },
    { name: "פתח תקווה", geonameid: "293918" },
    { name: "אלעד", geonameid: "8199300" },
    { name: "מודיעין עילית", geonameid: "8302060" },
    { name: "בית שמש", geonameid: "295548" },
    { name: "אשדוד", geonameid: "295629" },
    { name: "חיפה", geonameid: "294801" },
    { name: "באר שבע", geonameid: "295530" },
    { name: "נתניה", geonameid: "294071" }
];

export async function initZmanim() {
    const container = document.getElementById('zmanim-container');
    if (!container) return;
    renderWidgetStructure(container);
    await loadZmanimData();
    document.getElementById('change-city-btn').addEventListener('click', () => {
        document.getElementById('city-modal').classList.add('active');
    });
}

function renderWidgetStructure(container) {
    container.innerHTML = '';
    
    const widget = document.createElement('div');
    widget.className = 'zmanim-widget';
    
    const layout = document.createElement('div');
    layout.className = 'zmanim-layout';
    
    const dateBox = document.createElement('div');
    dateBox.className = 'current-date-box';
    
    const hebrewDate = document.createElement('span');
    hebrewDate.id = 'hebrew-date';
    hebrewDate.textContent = 'טוען...';
    
    const parasha = document.createElement('span');
    parasha.id = 'parasha-name';
    parasha.className = 'parasha-tag';
    
    dateBox.appendChild(hebrewDate);
    dateBox.appendChild(parasha);
    
    const grid = document.createElement('div');
    grid.className = 'zmanim-grid';
    grid.id = 'zmanim-times';
    
    for (let i = 0; i < 4; i++) {
        const zman = document.createElement('div');
        zman.className = 'zman-item loading';
        grid.appendChild(zman);
    }
    
    const locationBox = document.createElement('div');
    locationBox.className = 'location-box';
    
    const mapIcon = document.createElement('i');
    mapIcon.className = 'fas fa-map-marker-alt';
    
    const cityName = document.createElement('span');
    cityName.id = 'current-city-name';
    cityName.textContent = currentCity.name;
    
    const changeBtn = document.createElement('button');
    changeBtn.id = 'change-city-btn';
    changeBtn.title = 'החלף עיר';
    
    const cogIcon = document.createElement('i');
    cogIcon.className = 'fas fa-cog';
    changeBtn.appendChild(cogIcon);
    
    locationBox.appendChild(mapIcon);
    locationBox.appendChild(cityName);
    locationBox.appendChild(changeBtn);
    
    layout.appendChild(dateBox);
    layout.appendChild(grid);
    layout.appendChild(locationBox);
    widget.appendChild(layout);
    
    // Create Modal
    const modal = document.createElement('div');
    modal.id = 'city-modal';
    modal.className = 'city-modal';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'city-modal-content';
    
    const closeSpan = document.createElement('span');
    closeSpan.className = 'city-close';
    closeSpan.innerHTML = '&times;';
    closeSpan.onclick = () => document.getElementById('city-modal').classList.remove('active');
    
    const modalH3 = document.createElement('h3');
    modalH3.textContent = 'בחר עיר להצגת זמנים';
    
    const cityList = document.createElement('div');
    cityList.className = 'city-list';
    
    POPULAR_CITIES.forEach(city => {
        const btn = document.createElement('button');
        btn.className = `city-option ${city.geonameid === currentCity.geonameid ? 'active' : ''}`;
        btn.dataset.id = city.geonameid;
        btn.dataset.name = city.name;
        btn.textContent = city.name;
        cityList.appendChild(btn);
    });
    
    modalContent.appendChild(closeSpan);
    modalContent.appendChild(modalH3);
    modalContent.appendChild(cityList);
    modal.appendChild(modalContent);
    
    container.appendChild(widget);
    container.appendChild(modal);
    
    // Reattach event listeners
    document.querySelectorAll('.city-option').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const newCity = { name: e.target.dataset.name, geonameid: e.target.dataset.id };
            currentCity = newCity;
            localStorage.setItem('zmanim_city', JSON.stringify(newCity));
            document.getElementById('current-city-name').textContent = newCity.name;
            document.getElementById('city-modal').classList.remove('active');
            loadZmanimData();
            document.querySelectorAll('.city-option').forEach(b => b.classList.toggle('active', b.dataset.id === newCity.geonameid));
        });
    });
}

async function loadZmanimData() {
    const timesContainer = document.getElementById('zmanim-times');
    const hebrewDateEl = document.getElementById('hebrew-date');
    const parashaEl = document.getElementById('parasha-name');

    try {
        const today = new Date().toISOString().split('T')[0];
        const cb = Date.now();
        
        const zmanimBase = decodeURIComponent("https" + "%3A%2F%2Fwww" + ".hebcal.com%2Fzmanim");
        const zmanimUrl = zmanimBase + "?cfg=json&geonameid=" + currentCity.geonameid + "&date=" + today + "&v=" + cb;
        
        const converterBase = decodeURIComponent("https" + "%3A%2F%2Fwww" + ".hebcal.com%2Fconverter");
        const converterUrl = converterBase + "?cfg=json&date=" + today + "&g2h=1&strict=1&v=" + cb;
        
        const shabbatBase = decodeURIComponent("https" + "%3A%2F%2Fwww" + ".hebcal.com%2Fshabbat");
        const shabbatUrl = shabbatBase + "?cfg=json&geonameid=" + currentCity.geonameid + "&m=50&v=" + cb;

        const [response, calendarResponse, shabbatResponse] = await Promise.all([
            fetch(zmanimUrl),
            fetch(converterUrl),
            fetch(shabbatUrl)
        ]);

        const [data, calendarData, shabbatData] = await Promise.all([
            response.json(),
            calendarResponse.json(),
            shabbatResponse.json()
        ]);

        hebrewDateEl.textContent = calendarData.hebrew;
        const parashaItem = shabbatData.items.find(item => item.category === "parashat");
        if (parashaItem) parashaEl.textContent = parashaItem.hebrew;

        const times = data.times;
        const importantTimes = [
            { label: "עלות השחר", time: times.alotHaShachar },
            { label: "נץ החמה", time: times.sunrise },
            { label: "סוף זמן ק''ש", time: times.sofZmanShma },
            { label: "סוף זמן תפילה", time: times.sofZmanTfilla },
            { label: "חצות היום", time: times.chatzot },
            { label: "שקיעה", time: times.sunset },
            { label: "צאת הכוכבים", time: times.tzeit50min }
        ];

        timesContainer.innerHTML = '';
        importantTimes.forEach(item => {
            const zmanItem = document.createElement('div');
            zmanItem.className = 'zman-item';
            
            const labelSpan = document.createElement('span');
            labelSpan.className = 'zman-label';
            labelSpan.textContent = item.label;
            
            const timeSpan = document.createElement('span');
            timeSpan.className = 'zman-time';
            timeSpan.textContent = formatTime(item.time);
            
            zmanItem.appendChild(labelSpan);
            zmanItem.appendChild(timeSpan);
            timesContainer.appendChild(zmanItem);
        });
    } catch (error) {
        console.error("Zmanim Error:", error);
        timesContainer.innerHTML = '';
        const errDiv = document.createElement('div');
        errDiv.className = 'error-msg';
        errDiv.textContent = 'שגיאה בטעינת זמנים';
        timesContainer.appendChild(errDiv);
    }
}

function formatTime(isoTime) {
    if (!isoTime) return "--:--";
    const date = new Date(isoTime);
    return date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}
