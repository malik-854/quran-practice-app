// Firebase Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyDg1xpIVnSgW27tnOaGbF4QkebxsscQMfw",
  authDomain: "quran-practice-9ff5a.firebaseapp.com",
  projectId: "quran-practice-9ff5a",
  storageBucket: "quran-practice-9ff5a.firebasestorage.app",
  messagingSenderId: "321198049044",
  appId: "1:321198049044:web:b0faa9c6dfa438e2dfe401"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

const API_BASE = "https://api.quran.com/api/v4";
let verses = [];
let currentIndex = 0;
let currentSurahId = 1;
let currentLang = 'en';
let surahTranslations = {}; 
let studyList = [];
let currentUser = null;

const surahSelect = document.getElementById('surah-select');
const verseJump = document.getElementById('verse-jump');
const totalVersesSpan = document.getElementById('total-verses');
const arabicDisplay = document.getElementById('arabic-text');
const wbwSection = document.getElementById('wbw-section');
const verseTranslationSection = document.getElementById('verse-translation-section');
const toggleWbwBtn = document.getElementById('toggle-wbw');
const toggleVerseBtn = document.getElementById('toggle-verse-translation');
const urduInput = document.getElementById('urdu-input');
const nextBtn = document.getElementById('next-btn');
const prevBtn = document.getElementById('prev-btn');
const lastSeenBtn = document.getElementById('last-seen-btn');
const loading = document.getElementById('loading');
const langEnBtn = document.getElementById('lang-en');
const langUrBtn = document.getElementById('lang-ur');
const authBtn = document.getElementById('auth-btn');
const skipLoginBtn = document.getElementById('skip-login-btn');
const logoutBtn = document.getElementById('logout-btn');
const loginScreen = document.getElementById('login-screen');
const appContent = document.getElementById('app-content');
const studyListBtn = document.getElementById('study-list-btn');
const studyModal = document.getElementById('study-list-modal');
const studyContainer = document.getElementById('study-list-container');
const closeStudyBtn = document.getElementById('close-study-list');
const toast = document.getElementById('toast');

const TRANSLATION_IDS = { en: 131, ur: 158 };

// --- AUTHENTICATION LOGIC ---

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        showApp();
    } else {
        currentUser = null;
        if (sessionStorage.getItem('skipLogin')) {
            showApp();
        } else {
            showLogin();
        }
    }
});

function showApp() {
    loginScreen.style.display = 'none';
    appContent.classList.remove('hidden');
    fetchChapters(); // Initial data load
}

function showLogin() {
    loginScreen.style.display = 'flex';
    appContent.classList.add('hidden');
}

skipLoginBtn.addEventListener('click', () => {
    sessionStorage.setItem('skipLogin', 'true');
    showApp();
    lastSeenBtn.textContent = "Guest Mode (Not Syncing)";
    lastSeenBtn.title = "Login to save progress to the cloud";
});

authBtn.addEventListener('click', async () => {
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Login failed:", error);
    }
});

logoutBtn.addEventListener('click', async () => {
    sessionStorage.removeItem('skipLogin');
    await signOut(auth);
});

// --- CLOUD DATA LOGIC (USER SPECIFIC) ---

async function loadCloudProgress() {
    if (!currentUser) {
        // Guest mode - optionally load from local storage if desired
        const localSurah = localStorage.getItem('lastSurah') || 1;
        const localIndex = localStorage.getItem('lastIndex') || 0;
        currentSurahId = parseInt(localSurah);
        currentIndex = parseInt(localIndex);
        surahSelect.value = currentSurahId;
        await fetchChapterVerses(currentSurahId, currentIndex);
        return;
    }
    try {
        // Path is now unique to EACH user
        const docRef = doc(db, "users", currentUser.uid, "progress", "state");
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            currentSurahId = data.lastSeenSurahId || 1;
            currentIndex = data.lastSeenVerseIndex || 0;
            currentLang = data.lastLang || 'en';
            setLanguage(currentLang);
            surahSelect.value = currentSurahId;
            await fetchChapterVerses(currentSurahId, currentIndex);
        } else {
            await fetchChapterVerses(1, 0);
        }
    } catch (error) {
        console.error("Error loading progress:", error);
        await fetchChapterVerses(1, 0);
    }
}

async function saveCloudProgress() {
    if (!currentUser) {
        // Save to local storage for guests
        localStorage.setItem('lastSurah', currentSurahId);
        localStorage.setItem('lastIndex', currentIndex);
        lastSeenBtn.textContent = "Saved Locally!";
        setTimeout(() => lastSeenBtn.textContent = "Guest Mode (Local Only)", 2000);
        return;
    }
    lastSeenBtn.textContent = "Saving...";
    try {
        await saveManualTranslation();
        // Path is now unique to EACH user
        await setDoc(doc(db, "users", currentUser.uid, "progress", "state"), {
            lastSeenSurahId: currentSurahId,
            lastSeenVerseIndex: currentIndex,
            lastLang: currentLang,
            updatedAt: new Date()
        });
        lastSeenBtn.textContent = "Saved to Cloud!";
        setTimeout(() => lastSeenBtn.textContent = "Mark Last Seen", 2000);
    } catch (error) {
        console.error("Error saving:", error);
        lastSeenBtn.textContent = "Error!";
    }
}

async function fetchUserTranslations(surahId) {
    if (!currentUser) return;
    try {
        const docRef = doc(db, "users", currentUser.uid, "translations", `surah_${surahId}`);
        const docSnap = await getDoc(docRef);
        surahTranslations = docSnap.exists() ? docSnap.data() : {};
    } catch (error) {
        surahTranslations = {};
    }
}

async function saveManualTranslation() {
    if (!currentUser) return;
    const text = urduInput.value.trim();
    if (!text && !surahTranslations[currentIndex]) return;

    surahTranslations[currentIndex] = text;
    try {
        const docRef = doc(db, "users", currentUser.uid, "translations", `surah_${currentSurahId}`);
        await setDoc(docRef, surahTranslations, { merge: true });
    } catch (error) {
        console.error("Error saving translation:", error);
    }
}

// --- STUDY LIST LOGIC ---

async function loadStudyList() {
    if (!currentUser) {
        studyList = JSON.parse(localStorage.getItem('studyList')) || [];
        renderStudyList();
        return;
    }
    try {
        const docRef = doc(db, "users", currentUser.uid, "progress", "vocabulary");
        const docSnap = await getDoc(docRef);
        studyList = docSnap.exists() ? docSnap.data().words || [] : [];
        renderStudyList();
    } catch (error) {
        studyList = [];
    }
}

async function saveStudyList() {
    if (!currentUser) {
        localStorage.setItem('studyList', JSON.stringify(studyList));
        return;
    }
    try {
        const docRef = doc(db, "users", currentUser.uid, "progress", "vocabulary");
        await setDoc(docRef, { words: studyList });
    } catch (error) {
        console.error("Error saving study list:", error);
    }
}

function addWordToStudyList(wordObj) {
    // Prevent duplicates
    if (studyList.some(item => item.word === wordObj.word)) {
        showToast("Already in list! 📚");
        return;
    }
    studyList.push(wordObj);
    saveStudyList();
    renderStudyList();
    showToast("Added to List! ✨");
}

function removeFromStudyList(index) {
    studyList.splice(index, 1);
    saveStudyList();
    renderStudyList();
}

function renderStudyList() {
    if (studyList.length === 0) {
        studyContainer.innerHTML = '<p class="empty-msg">Double-click any word to add it here!</p>';
        return;
    }
    studyContainer.innerHTML = studyList.map((item, idx) => `
        <div class="study-list-item">
            <div class="study-item-info">
                <span class="study-arabic">${item.word}</span>
                <span class="study-meaning">${item.meaning}</span>
            </div>
            <button class="delete-word-btn" data-index="${idx}">×</button>
        </div>
    `).join('');

    document.querySelectorAll('.delete-word-btn').forEach(btn => {
        btn.onclick = (e) => removeFromStudyList(parseInt(e.target.dataset.index));
    });
}

function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2000);
}

// --- CORE APP LOGIC ---

async function fetchChapters() {
    try {
        const response = await fetch(`${API_BASE}/chapters?language=en`);
        const data = await response.json();
        data.chapters.forEach(chapter => {
            const option = document.createElement('option');
            option.value = chapter.id;
            option.textContent = `${chapter.id}. ${chapter.name_simple} (${chapter.translated_name.name})`;
            surahSelect.appendChild(option);
        });
        await loadCloudProgress();
        await loadStudyList();
    } catch (error) {
        console.error("Error fetching chapters:", error);
    }
}

const fallbackVerse = [{
    arabic: "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ",
    translation: "In the name of Allah...",
    words: [{ arabic: "بِسْمِ", meaning: "In name" }]
}];

async function fetchChapterVerses(surahId, startAt = 0) {
    loading.classList.remove('hidden');
    arabicDisplay.textContent = "...";
    verses = [];
    currentSurahId = surahId;
    await fetchUserTranslations(surahId);

    try {
        const transId = TRANSLATION_IDS[currentLang];
        const url = `${API_BASE}/verses/by_chapter/${surahId}?language=${currentLang}&words=true&fields=text_uthmani&word_fields=text_uthmani&translations=${transId}&per_page=300`;
        const response = await fetch(url);
        const data = await response.json();
        verses = data.verses.map(v => ({
            arabic: v.text_uthmani || "...",
            translation: v.translations?.[0]?.text?.replace(/<(?:.|\n)*?>/gm, '') || "...",
            words: v.words.filter(w => w.char_type_name === 'word').map(w => ({
                arabic: w.text_uthmani || w.text || "...",
                meaning: w.translation?.text || "..."
            }))
        }));
        verseJump.max = verses.length;
        totalVersesSpan.textContent = `/ ${verses.length}`;
        currentIndex = Math.min(startAt, verses.length - 1);
        updateUI();
    } catch (error) {
        verses = fallbackVerse;
        updateUI();
    } finally {
        loading.classList.add('hidden');
    }
}

function updateUI() {
    if (verses.length === 0) return;
    const verse = verses[currentIndex];
    arabicDisplay.textContent = verse.arabic;
    const isUrdu = currentLang === 'ur';
    
    wbwSection.innerHTML = verse.words.map(word => `
        <div class="wbw-item" data-word="${word.arabic}" data-meaning="${word.meaning}">
            <span class="wbw-arabic">${word.arabic}</span>
            <span class="wbw-meaning ${isUrdu ? 'rtl' : ''}">${word.meaning}</span>
        </div>
    `).join('');

    // Attach double-click listener to words
    document.querySelectorAll('.wbw-item').forEach(item => {
        item.addEventListener('dblclick', () => {
            const word = item.dataset.word;
            const meaning = item.dataset.meaning;
            addWordToStudyList({ word, meaning });
        });
    });

    verseTranslationSection.textContent = verse.translation;
    verseTranslationSection.classList.toggle('rtl', isUrdu);
    wbwSection.classList.add('hidden');
    verseTranslationSection.classList.add('hidden');
    toggleWbwBtn.classList.remove('active');
    toggleVerseBtn.classList.remove('active');
    verseJump.value = currentIndex + 1;
    urduInput.value = surahTranslations[currentIndex] || '';
    prevBtn.disabled = currentIndex === 0;
    prevBtn.style.opacity = currentIndex === 0 ? '0.5' : '1';
    nextBtn.textContent = currentIndex === verses.length - 1 ? 'End' : 'Next';
}

function setLanguage(lang) {
    currentLang = lang;
    langEnBtn.classList.toggle('active', lang === 'en');
    langUrBtn.classList.toggle('active', lang === 'ur');
}

// Event Listeners
langEnBtn.addEventListener('click', () => { setLanguage('en'); fetchChapterVerses(currentSurahId, currentIndex); });
langUrBtn.addEventListener('click', () => { setLanguage('ur'); fetchChapterVerses(currentSurahId, currentIndex); });
lastSeenBtn.addEventListener('click', saveCloudProgress);
toggleWbwBtn.addEventListener('click', () => wbwSection.classList.toggle('hidden'));
toggleVerseBtn.addEventListener('click', () => verseTranslationSection.classList.toggle('hidden'));
surahSelect.addEventListener('change', async (e) => { await saveManualTranslation(); fetchChapterVerses(e.target.value, 0); });
verseJump.addEventListener('change', async (e) => {
    const jumpVal = parseInt(e.target.value) - 1;
    if (jumpVal >= 0 && jumpVal < verses.length) { await saveManualTranslation(); currentIndex = jumpVal; updateUI(); }
});
nextBtn.addEventListener('click', async () => { if (currentIndex < verses.length - 1) { await saveManualTranslation(); currentIndex++; updateUI(); } });
prevBtn.addEventListener('click', async () => { if (currentIndex > 0) { await saveManualTranslation(); currentIndex--; updateUI(); } });

studyListBtn.addEventListener('click', () => {
    renderStudyList();
    studyModal.classList.remove('hidden');
});

closeStudyBtn.addEventListener('click', () => {
    studyModal.classList.add('hidden');
});

// Close modal on click outside
window.addEventListener('click', (e) => {
    if (e.target === studyModal) studyModal.classList.add('hidden');
});

let autoSaveTimeout;
urduInput.addEventListener('input', () => {
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(() => { surahTranslations[currentIndex] = urduInput.value.trim(); saveManualTranslation(); }, 2000);
});
