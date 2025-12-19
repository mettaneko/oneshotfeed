const allVideos = [
    {
        id: 1,
        videoUrl: "https://nikotube.nekoweb.org/resources/50/@hui87684=34e047(1).mp4", 
        author: "mettaneko",
        desc: "Test meme 1"
    },
    {
        id: 2,
        videoUrl: "https://nikotube.nekoweb.org/resources/Oneshot%20videos%20from%20Google%20Drive/profspiffy_2025-07-20-13-56-53_1753009013013.mp4",
        author: "mettaneko",
        desc: "test meme 132"
    },
    {
        id: 3,
        videoUrl: "https://nikotube.nekoweb.org/resources/Oneshot%20videos%20from%20Google%20Drive/ssstik.io_@alzitonthe_1748635276254.mp4",
        author: "notmettaneko",
        desc: "arh"
    },
];

let subscribedAuthors = JSON.parse(localStorage.getItem('subscribedAuthors')) || [];
let hasInteracted = false;
let globalVolume = 1.0; 
let currentTab = 'foryou';
let currentActiveAuthor = null;

const uiAuthor = document.getElementById('ui-author');
const uiDesc = document.getElementById('ui-desc');
const uiSubBtn = document.getElementById('ui-sub-btn');
const uiPlayBtn = document.getElementById('ui-play-btn');
const uiVolBtn = document.getElementById('ui-vol-btn');
const uiVolCont = document.getElementById('ui-vol-cont');
const uiVolRange = document.getElementById('ui-vol-range');
const feedContainer = document.getElementById('feed');
const tabForYou = document.getElementById('tab-foryou');
const tabFollowing = document.getElementById('tab-following');
const indicator = document.getElementById('nav-indicator');


// --- НАВИГАЦИЯ ---
function updateInd(tab) {
    // tab.offsetLeft уже учитывает padding родителя, если position:relative у родителя
    // Но для идеальной точности:
    indicator.style.width = `${tab.offsetWidth}px`;
    indicator.style.transform = `translateX(${tab.offsetLeft}px)`;
}

function switchToForYou() {
    currentTab = 'foryou';
    tabForYou.classList.add('active'); 
    tabFollowing.classList.remove('active');
    updateInd(tabForYou);
    renderFeed(shuffle([...allVideos]));
}

tabForYou.onclick = switchToForYou;

tabFollowing.onclick = () => {
    if (subscribedAuthors.length === 0) return; // Игнор, если нет подписок
    currentTab = 'following';
    tabFollowing.classList.add('active'); 
    tabForYou.classList.remove('active');
    updateInd(tabFollowing);
    renderFeed(allVideos.filter(v => subscribedAuthors.includes(v.author)));
};

// --- UPDATE GLOBAL UI ---
function updateGlobalUI(videoData) {
    uiAuthor.innerText = `@${videoData.author}`;
    uiDesc.innerText = videoData.desc;
    currentActiveAuthor = videoData.author;
    updateSubBtnState();
    uiPlayBtn.querySelector('i').className = 'fas fa-pause';
    uiPlayBtn.classList.add('active');
}

function updateSubBtnState() {
    if(!currentActiveAuthor) return;
    if (subscribedAuthors.includes(currentActiveAuthor)) uiSubBtn.classList.add('subscribed');
    else uiSubBtn.classList.remove('subscribed');
}

// --- ПОДПИСКА ---
uiSubBtn.onclick = (e) => {
    e.stopPropagation();
    if (!currentActiveAuthor) return;

    if (subscribedAuthors.includes(currentActiveAuthor)) {
        // Отписка
        subscribedAuthors = subscribedAuthors.filter(a => a !== currentActiveAuthor);
        
        if (currentTab === 'following') {
            if(subscribedAuthors.length === 0) {
                switchToForYou(); // Молчаливый переход в For You
            } else {
                renderFeed(allVideos.filter(v => subscribedAuthors.includes(v.author)));
            }
        }
    } else {
        // Подписка
        subscribedAuthors.push(currentActiveAuthor);
    }
    localStorage.setItem('subscribedAuthors', JSON.stringify(subscribedAuthors));
    updateSubBtnState();
};

// --- ПЛЕЕР ---
function getActiveVideo() { return document.querySelector('.video-slide.active-slide .video-player'); }
function getActiveBg() { return document.querySelector('.video-slide.active-slide .video-blur-bg'); }

uiPlayBtn.onclick = (e) => {
    e.stopPropagation();
    const v = getActiveVideo(), b = getActiveBg(); if(!v) return;
    if(v.paused) { v.play(); b.play(); uiPlayBtn.querySelector('i').className='fas fa-pause'; uiPlayBtn.classList.add('active'); }
    else { v.pause(); b.pause(); uiPlayBtn.querySelector('i').className='fas fa-play'; uiPlayBtn.classList.remove('active'); }
};
uiVolBtn.onclick = (e) => { e.stopPropagation(); uiVolCont.classList.toggle('active'); };
uiVolRange.oninput = (e) => {
    e.stopPropagation(); globalVolume = parseFloat(e.target.value);
    const v = getActiveVideo(); if(v){ v.volume=globalVolume; v.muted=(globalVolume===0); }
};

// --- СЛАЙДЫ ---
function createSlide(data) {
    const slide = document.createElement('div');
    slide.className = 'video-slide';
    slide.dataset.jsonData = JSON.stringify(data);
    slide.innerHTML = `
        <video class="video-blur-bg" loop muted playsinline src="${data.videoUrl}"></video>
        <div class="video-wrapper">
            <video class="video-player" loop muted playsinline src="${data.videoUrl}"></video>
            <div class="video-progress-container"><div class="video-progress-fill"></div></div>
        </div>
    `;
    const vid = slide.querySelector('.video-player');
    const bg = slide.querySelector('.video-blur-bg');
    const fill = slide.querySelector('.video-progress-fill');
    const bar = slide.querySelector('.video-progress-container');
    
    vid.onclick = () => {
        if(vid.paused) { vid.play(); bg.play(); uiPlayBtn.querySelector('i').className='fas fa-pause'; uiPlayBtn.classList.add('active'); }
        else { vid.pause(); bg.pause(); uiPlayBtn.querySelector('i').className='fas fa-play'; uiPlayBtn.classList.remove('active'); }
    };
    vid.ontimeupdate = () => { if(vid.duration) fill.style.height = `${(vid.currentTime/vid.duration)*100}%`; };
    bar.onclick = (e) => {
        e.stopPropagation();
        const r = bar.getBoundingClientRect();
        vid.currentTime = ((e.clientY - r.top) / r.height) * vid.duration;
    };
    return slide;
}

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        const slide = entry.target;
        const vid = slide.querySelector('.video-player');
        const bg = slide.querySelector('.video-blur-bg');
        if (entry.isIntersecting) {
            document.querySelectorAll('.video-slide').forEach(s => s.classList.remove('active-slide'));
            slide.classList.add('active-slide');
            try { updateGlobalUI(JSON.parse(slide.dataset.jsonData)); } catch(e){}
            vid.currentTime = 0; bg.currentTime = 0;
            if(hasInteracted) { vid.volume=globalVolume; vid.muted=(globalVolume===0); } else { vid.muted=true; }
            vid.play().then(()=>bg.play()).catch(()=>{vid.muted=true;vid.play();bg.play();});
        } else {
            vid.pause(); bg.pause();
        }
    });
}, { threshold: 0.6 });

function renderFeed(videos, append=false) {
    if(!append) feedContainer.innerHTML = '';
    videos.forEach(v => feedContainer.appendChild(createSlide(v)));
    document.querySelectorAll('.video-slide').forEach(s => observer.observe(s));
}

function shuffle(arr) { return arr.sort(() => Math.random() - 0.5); }

feedContainer.addEventListener('scroll', () => {
    if(feedContainer.scrollHeight - (feedContainer.scrollTop+feedContainer.clientHeight) < 300) {
        if(currentTab==='foryou') renderFeed(shuffle([...allVideos]), true);
        else {
            const subs = allVideos.filter(v => subscribedAuthors.includes(v.author));
            if(subs.length>0) renderFeed(subs, true);
        }
    }
});

const ov = document.getElementById('audio-unlock-overlay');
ov.onclick = () => {
    const AudioContext = window.AudioContext||window.webkitAudioContext; const c=new AudioContext(); c.resume();
    ov.classList.add('hidden'); setTimeout(()=>ov.remove(),500); hasInteracted=true;
    const v=getActiveVideo(); if(v){ v.muted=false; v.volume=globalVolume; }
};

// INIT
updateInd(tabForYou);
renderFeed(shuffle([...allVideos]));
