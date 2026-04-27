const APP_CACHE_VERSION = "2026.04.28";
const DATA_URL = "data/scriptures.json";
const SETTINGS_KEY = "dg_settings";
const LAST_READ_KEY = "dg_last_read";
const BOOKMARK_KEY = "dg_bookmarks";
const SEARCH_SORT_KEY = "dg_search_sort";
const READ_HISTORY_KEY = "dg_read_history";
const SEARCH_WINDOW_KEY = "dg_search_window";
const SEARCH_PREVIEW_KEY = "dg_search_preview";

const state = {
  db: null,
  verses: [],
  sections: [],
  currentIndex: 0,
  screen: "home",
  settings: {
    theme: "light",
    fontSize: 20,
    readerMode: "scroll"
  },
  searchSort: "relevance",
  searchWindow: "all",
  searchPreview: "long",
  readHistory: {},
  bookmarks: [],
  longPressTimer: null
};

const el = {
  sectionGrid: document.querySelector("#sectionGrid"),
  todayMessage: document.querySelector("#todayMessage"),
  continueBtn: document.querySelector("#continueBtn"),
  readerPath: document.querySelector("#readerPath"),
  readerVerse: document.querySelector("#readerVerse"),
  prevBtn: document.querySelector("#prevBtn"),
  nextBtn: document.querySelector("#nextBtn"),
  progressSlider: document.querySelector("#progressSlider"),
  progressText: document.querySelector("#progressText"),
  bookmarkBtn: document.querySelector("#bookmarkBtn"),
  bookmarkList: document.querySelector("#bookmarkList"),
  clearBookmarksBtn: document.querySelector("#clearBookmarksBtn"),
  openSettingsBtn: document.querySelector("#openSettingsBtn"),
  settingsDialog: document.querySelector("#settingsDialog"),
  themeSelect: document.querySelector("#themeSelect"),
  fontSizeInput: document.querySelector("#fontSizeInput"),
  readerModeSelect: document.querySelector("#readerModeSelect"),
  saveSettingBtn: document.querySelector("#saveSettingBtn"),
  searchInput: document.querySelector("#searchInput"),
  searchSort: document.querySelector("#searchSort"),
  searchWindow: document.querySelector("#searchWindow"),
  searchPreview: document.querySelector("#searchPreview"),
  searchResult: document.querySelector("#searchResult"),
  searchMeta: document.querySelector("#searchMeta"),
  openSearchFromReader: document.querySelector("#openSearchFromReader"),
  actionDialog: document.querySelector("#actionDialog"),
  actionVerseInfo: document.querySelector("#actionVerseInfo"),
  actionBookmark: document.querySelector("#actionBookmark"),
  actionCopy: document.querySelector("#actionCopy"),
  actionShare: document.querySelector("#actionShare"),
  tabButtons: Array.from(document.querySelectorAll(".tab-btn")),
  screens: {
    home: document.querySelector("#screen-home"),
    reader: document.querySelector("#screen-reader"),
    bookmarks: document.querySelector("#screen-bookmarks"),
    search: document.querySelector("#screen-search")
  }
};

boot();

async function boot() {
  setTodayMessage();
  loadLocalState();
  bindEvents();
  applySettings();
  await registerServiceWorker();
  state.db = await openDatabase();
  await ensureDatasetFresh();
  await hydrateVersesFromDB();
  renderSectionGrid();
  restoreLastRead();
  renderBookmarks();
  renderReader();
  updateSearchMeta("검색 대기 중입니다.");
}

function setTodayMessage() {
  const now = new Date();
  const text = `포덕 ${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;
  el.todayMessage.textContent = text;
}

function bindEvents() {
  el.tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => setScreen(btn.dataset.screen));
  });

  el.continueBtn.addEventListener("click", () => {
    setScreen("reader");
    renderReader();
  });

  el.prevBtn.addEventListener("click", () => moveVerse(-1));
  el.nextBtn.addEventListener("click", () => moveVerse(1));

  el.progressSlider.addEventListener("input", () => {
    const idx = Number(el.progressSlider.value) - 1;
    state.currentIndex = idx;
    renderReader();
  });

  el.bookmarkBtn.addEventListener("click", () => toggleBookmarkCurrent());

  el.clearBookmarksBtn.addEventListener("click", () => {
    if (confirm("즐겨찾기를 모두 비우시겠습니까?")) {
      state.bookmarks = [];
      persistBookmarks();
      renderBookmarks();
      renderReader();
    }
  });

  el.openSettingsBtn.addEventListener("click", openSettingsDialog);
  el.saveSettingBtn.addEventListener("click", saveSettingsFromDialog);

  el.searchInput.addEventListener("input", debounce(runSearch, 120));
  el.searchSort.addEventListener("change", () => {
    state.searchSort = el.searchSort.value;
    localStorage.setItem(SEARCH_SORT_KEY, state.searchSort);
    if (el.searchInput.value.trim()) {
      runSearch();
    }
  });
  el.searchWindow.addEventListener("change", () => {
    state.searchWindow = el.searchWindow.value;
    localStorage.setItem(SEARCH_WINDOW_KEY, state.searchWindow);
    if (el.searchInput.value.trim()) {
      runSearch();
    }
  });
  el.searchPreview.addEventListener("change", () => {
    state.searchPreview = el.searchPreview.value;
    localStorage.setItem(SEARCH_PREVIEW_KEY, state.searchPreview);
    if (el.searchInput.value.trim()) {
      runSearch();
    }
  });
  el.openSearchFromReader.addEventListener("click", () => setScreen("search"));

  bindLongPressActions();

  el.actionBookmark.addEventListener("click", (event) => {
    event.preventDefault();
    toggleBookmarkCurrent();
  });

  el.actionCopy.addEventListener("click", async (event) => {
    event.preventDefault();
    const current = currentVerse();
    if (!current) return;
    await navigator.clipboard.writeText(`${current.path} ${current.text}`);
    toast("구절을 복사했습니다.");
  });

  el.actionShare.addEventListener("click", async (event) => {
    event.preventDefault();
    await shareCurrentVerse();
  });
}

function bindLongPressActions() {
  const start = () => {
    clearTimeout(state.longPressTimer);
    state.longPressTimer = setTimeout(() => {
      const current = currentVerse();
      if (!current) return;
      el.actionVerseInfo.textContent = current.path;
      if (typeof el.actionDialog.showModal === "function") {
        el.actionDialog.showModal();
      }
    }, 700);
  };

  const cancel = () => clearTimeout(state.longPressTimer);

  el.readerVerse.addEventListener("pointerdown", start);
  el.readerVerse.addEventListener("pointerup", cancel);
  el.readerVerse.addEventListener("pointerleave", cancel);
  el.readerVerse.addEventListener("pointercancel", cancel);
}

function openSettingsDialog() {
  el.themeSelect.value = state.settings.theme;
  el.fontSizeInput.value = state.settings.fontSize;
  el.readerModeSelect.value = state.settings.readerMode;
  el.settingsDialog.showModal();
}

function saveSettingsFromDialog() {
  state.settings.theme = el.themeSelect.value;
  state.settings.fontSize = Number(el.fontSizeInput.value);
  state.settings.readerMode = el.readerModeSelect.value;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  applySettings();
}

function loadLocalState() {
  try {
    const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
    if (settings) {
      state.settings = { ...state.settings, ...settings };
    }
  } catch {
    localStorage.removeItem(SETTINGS_KEY);
  }

  try {
    state.bookmarks = JSON.parse(localStorage.getItem(BOOKMARK_KEY) || "[]");
  } catch {
    state.bookmarks = [];
  }

  const savedSort = localStorage.getItem(SEARCH_SORT_KEY);
  if (savedSort === "relevance" || savedSort === "recent") {
    state.searchSort = savedSort;
  }

  const savedWindow = localStorage.getItem(SEARCH_WINDOW_KEY);
  if (savedWindow === "all" || savedWindow === "1d" || savedWindow === "7d" || savedWindow === "30d") {
    state.searchWindow = savedWindow;
  }

  const savedPreview = localStorage.getItem(SEARCH_PREVIEW_KEY);
  if (savedPreview === "short" || savedPreview === "long") {
    state.searchPreview = savedPreview;
  }

  try {
    const readHistory = JSON.parse(localStorage.getItem(READ_HISTORY_KEY) || "{}");
    state.readHistory = readHistory && typeof readHistory === "object" ? readHistory : {};
  } catch {
    state.readHistory = {};
  }
}

function applySettings() {
  document.documentElement.dataset.theme = state.settings.theme;
  document.documentElement.style.setProperty("--reader-size", `${state.settings.fontSize}px`);
  el.readerVerse.classList.toggle("swipe", state.settings.readerMode === "swipe");
  el.searchSort.value = state.searchSort;
  el.searchWindow.value = state.searchWindow;
  el.searchPreview.value = state.searchPreview;
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("sw.js");
  } catch (error) {
    console.warn("ServiceWorker 등록 실패", error);
  }
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("dg-viewer-db", 1);

    req.onupgradeneeded = () => {
      const db = req.result;
      const verseStore = db.createObjectStore("verses", { keyPath: "id" });
      verseStore.createIndex("by_path", "path");
      verseStore.createIndex("by_text", "text");
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function ensureDatasetFresh() {
  const storedVersion = localStorage.getItem("dg_dataset_version");
  const response = await fetch(`${DATA_URL}?v=${APP_CACHE_VERSION}`);
  const payload = await response.json();

  if (storedVersion !== payload.version) {
    const tx = state.db.transaction("verses", "readwrite");
    const store = tx.objectStore("verses");
    store.clear();
    payload.verses.forEach((verse) => store.put(verse));
    await transactionDone(tx);
    localStorage.setItem("dg_dataset_version", payload.version);
  }
}

async function hydrateVersesFromDB() {
  const tx = state.db.transaction("verses", "readonly");
  const store = tx.objectStore("verses");
  const req = store.getAll();

  state.verses = await requestResult(req);
  state.verses.forEach((verse) => {
    verse.pathLower = verse.path.toLowerCase();
    verse.textLower = verse.text.toLowerCase();
    verse.searchText = `${verse.pathLower} ${verse.textLower}`;
    verse.searchCompact = compactForSearch(verse.searchText);
    verse.initials = verse.initials || toInitialConsonants(verse.text);
    verse.initialsCompact = compactForSearch(verse.initials);
  });
  state.verses.sort((a, b) => a.order - b.order);
  state.sections = [...new Set(state.verses.map((v) => v.section))];
}

function restoreLastRead() {
  const lastId = localStorage.getItem(LAST_READ_KEY);
  if (!lastId) return;

  const idx = state.verses.findIndex((v) => v.id === lastId);
  if (idx < 0) return;

  if (confirm("읽던 구절부터 시작하시겠습니까?")) {
    state.currentIndex = idx;
    setScreen("reader");
  }
}

function renderSectionGrid() {
  el.sectionGrid.innerHTML = "";

  state.sections.forEach((section) => {
    const sectionVerses = state.verses.filter((v) => v.section === section);
    const count = sectionVerses.length;
    const chapters = [...new Set(sectionVerses.map((v) => v.chapter))].sort((a, b) => a - b);

    const card = document.createElement("article");
    card.className = "section-card";
    card.innerHTML = `
      <div class="section-card-head">
        <strong>${section}</strong>
        <p class="muted">${count}개 절</p>
      </div>
      <div class="chapter-row" role="group" aria-label="${section} 장 선택"></div>
    `;

    const chapterRow = card.querySelector(".chapter-row");
    chapters.forEach((chapter) => {
      const chapterBtn = document.createElement("button");
      chapterBtn.type = "button";
      chapterBtn.className = "chapter-btn";
      chapterBtn.textContent = `${chapter}장`;
      chapterBtn.addEventListener("click", () => {
        const idx = state.verses.findIndex((v) => v.section === section && v.chapter === chapter);
        if (idx >= 0) {
          state.currentIndex = idx;
          setScreen("reader");
          renderReader();
        }
      });
      chapterRow.appendChild(chapterBtn);
    });

    el.sectionGrid.appendChild(card);
  });
}

function setScreen(screen) {
  state.screen = screen;
  Object.entries(el.screens).forEach(([name, node]) => {
    node.classList.toggle("is-active", name === screen);
  });

  el.tabButtons.forEach((btn) => {
    btn.classList.toggle("is-on", btn.dataset.screen === screen);
  });

  if (screen === "bookmarks") renderBookmarks();
  if (screen === "search") el.searchInput.focus();
}

function renderReader() {
  const current = currentVerse();
  if (!current) {
    el.readerPath.textContent = "데이터가 없습니다";
    el.readerVerse.textContent = "표시할 구절이 없습니다.";
    return;
  }

  el.readerPath.textContent = current.path;
  el.readerVerse.innerHTML = `<span class="verse-no">${current.verse}절</span>${escapeHtml(current.text)}`;

  el.progressSlider.max = String(state.verses.length);
  el.progressSlider.value = String(state.currentIndex + 1);
  el.progressText.textContent = `${state.currentIndex + 1} / ${state.verses.length}`;

  const marked = isBookmarked(current.id);
  el.bookmarkBtn.textContent = marked ? "★" : "☆";
  localStorage.setItem(LAST_READ_KEY, current.id);
  updateReadHistory(current.id);
  updateMediaSession(current);
}

function renderBookmarks() {
  el.bookmarkList.innerHTML = "";

  if (state.bookmarks.length === 0) {
    el.bookmarkList.innerHTML = `<article class="list-card"><p class="muted">저장된 구절이 없습니다.</p></article>`;
    return;
  }

  const items = state.bookmarks
    .map((mark) => state.verses.find((verse) => verse.id === mark.id))
    .filter(Boolean);

  items.forEach((verse) => {
    const card = document.createElement("article");
    card.className = "list-card";
    card.innerHTML = `
      <p class="muted">${verse.path}</p>
      <p>${escapeHtml(verse.text)}</p>
      <button class="ghost-btn">바로 읽기</button>
    `;
    card.querySelector("button").addEventListener("click", () => {
      const idx = state.verses.findIndex((v) => v.id === verse.id);
      if (idx >= 0) {
        state.currentIndex = idx;
        setScreen("reader");
        renderReader();
      }
    });
    el.bookmarkList.appendChild(card);
  });
}

function moveVerse(delta) {
  const next = Math.max(0, Math.min(state.verses.length - 1, state.currentIndex + delta));
  state.currentIndex = next;
  renderReader();
}

function currentVerse() {
  return state.verses[state.currentIndex];
}

function toggleBookmarkCurrent() {
  const current = currentVerse();
  if (!current) return;

  if (isBookmarked(current.id)) {
    state.bookmarks = state.bookmarks.filter((item) => item.id !== current.id);
    toast("즐겨찾기를 해제했습니다.");
  } else {
    state.bookmarks.push({ id: current.id, createdAt: Date.now() });
    toast("즐겨찾기에 저장했습니다.");
  }

  persistBookmarks();
  renderBookmarks();
  renderReader();
}

function persistBookmarks() {
  localStorage.setItem(BOOKMARK_KEY, JSON.stringify(state.bookmarks));
}

function isBookmarked(id) {
  return state.bookmarks.some((item) => item.id === id);
}

async function runSearch() {
  const keywordRaw = el.searchInput.value.trim();
  if (!keywordRaw) {
    el.searchResult.innerHTML = "";
    updateSearchMeta("검색어를 입력해 주세요.");
    return;
  }

  const keyword = keywordRaw.toLowerCase();
  const keywordCompact = compactForSearch(keywordRaw);
  const initialsCompact = compactForSearch(toInitialConsonants(keywordRaw));
  const initialOnlyQuery = /^[ㄱ-ㅎ]+$/.test(keywordCompact);
  const query = {
    keyword,
    keywordCompact,
    initialsCompact,
    initialOnlyQuery,
    raw: keywordRaw
  };

  const started = performance.now();
  let scored = state.verses
    .map((verse) => ({
      verse,
      score: calcSearchScore(verse, query)
    }))
    .filter((item) => item.score > 0);

  if (state.searchSort === "recent") {
    const windowMs = getSearchWindowMs(state.searchWindow);
    if (windowMs > 0) {
      const cutoff = Date.now() - windowMs;
      scored = scored.filter((item) => getReadTimestamp(item.verse.id) >= cutoff);
    }

    scored.sort((a, b) => {
      const recentGap = getReadTimestamp(b.verse.id) - getReadTimestamp(a.verse.id);
      if (recentGap !== 0) return recentGap;
      if (b.score !== a.score) return b.score - a.score;
      return a.verse.order - b.verse.order;
    });
  } else {
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.verse.order - b.verse.order;
    });
  }

  const result = scored.map((item) => item.verse);
  const elapsed = Math.round(performance.now() - started);

  paintSearchResult(result, query);
  updateSearchMeta(`${result.length}건 검색 (${elapsed}ms)`);
}

function calcSearchScore(verse, query) {
  let score = 0;

  if (verse.pathLower === query.keyword) {
    score += 1200;
  } else if (verse.pathLower.startsWith(query.keyword)) {
    score += 900;
  } else if (verse.pathLower.includes(query.keyword)) {
    score += 700;
  }

  if (verse.textLower.includes(query.keyword)) {
    score += 520;
  }

  if (query.keywordCompact && verse.searchCompact.includes(query.keywordCompact)) {
    score += 350;
  }

  if (query.initialsCompact && verse.initialsCompact.includes(query.initialsCompact)) {
    score += query.initialOnlyQuery ? 820 : 230;
  }

  return score;
}

function paintSearchResult(list, query) {
  el.searchResult.innerHTML = "";

  if (list.length === 0) {
    el.searchResult.innerHTML = `<article class="list-card"><p class="muted">검색 결과가 없습니다.</p></article>`;
    return;
  }

  list.slice(0, 60).forEach((verse) => {
    const previewText = makePreviewText(verse.text, state.searchPreview);
    const readTs = getReadTimestamp(verse.id);
    const pathHtml = query.initialOnlyQuery
      ? highlightInitialMatch(verse.path, query.initialsCompact)
      : highlight(escapeHtml(verse.path), escapeHtml(query.raw));
    const textHtml = query.initialOnlyQuery
      ? highlightInitialMatch(previewText, query.initialsCompact)
      : highlight(escapeHtml(previewText), escapeHtml(query.raw));
    const chips = buildSearchChips(verse, readTs);

    const card = document.createElement("article");
    card.className = "list-card";
    card.innerHTML = `
      <p class="muted">${pathHtml}</p>
      <div class="search-chip-row">${chips}</div>
      <p>${textHtml}</p>
      <button class="ghost-btn">이 구절 열기</button>
    `;

    card.querySelector("button").addEventListener("click", () => {
      const idx = state.verses.findIndex((v) => v.id === verse.id);
      if (idx >= 0) {
        state.currentIndex = idx;
        setScreen("reader");
        renderReader();
      }
    });
    el.searchResult.appendChild(card);
  });
}

function updateSearchMeta(message) {
  el.searchMeta.textContent = message;
}

function toInitialConsonants(input) {
  const cho = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
  let output = "";

  for (const char of input) {
    const code = char.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const index = Math.floor((code - 0xac00) / 588);
      output += cho[index];
    } else {
      output += char;
    }
  }

  return output;
}

function compactForSearch(input) {
  return input
    .toLowerCase()
    .replace(/[^0-9a-z\uac00-\ud7a3ㄱ-ㅎ]/gi, "");
}

function highlightInitialMatch(text, initialsQuery) {
  if (!initialsQuery) return escapeHtml(text);

  const chars = [...text];
  for (let start = 0; start < chars.length; start += 1) {
    const first = getInitialForMatch(chars[start]);
    if (first !== initialsQuery[0]) continue;

    let q = 0;
    let i = start;
    let end = start;

    while (i < chars.length && q < initialsQuery.length) {
      const initial = getInitialForMatch(chars[i]);
      if (!initial) {
        i += 1;
        continue;
      }

      if (initial === initialsQuery[q]) {
        q += 1;
        end = i;
        i += 1;
        continue;
      }

      break;
    }

    if (q === initialsQuery.length) {
      const head = escapeHtml(chars.slice(0, start).join(""));
      const body = escapeHtml(chars.slice(start, end + 1).join(""));
      const tail = escapeHtml(chars.slice(end + 1).join(""));
      return `${head}<mark>${body}</mark>${tail}`;
    }
  }

  return escapeHtml(text);
}

function getInitialForMatch(char) {
  const cho = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
  const code = char.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const index = Math.floor((code - 0xac00) / 588);
    return cho[index];
  }

  if (/^[ㄱ-ㅎ]$/.test(char)) {
    return char;
  }

  return "";
}

function updateReadHistory(verseId) {
  state.readHistory[verseId] = Date.now();
  localStorage.setItem(READ_HISTORY_KEY, JSON.stringify(state.readHistory));
}

function getReadTimestamp(verseId) {
  return Number(state.readHistory[verseId] || 0);
}

function buildSearchChips(verse, readTs) {
  const chips = [];
  chips.push(`<span class="search-chip">${escapeHtml(verse.section)}</span>`);
  chips.push(`<span class="search-chip">${verse.chapter}장 ${verse.verse}절</span>`);

  if (readTs > 0) {
    chips.push(`<span class="search-chip recent">최근 열람 ${escapeHtml(formatRelativeTime(readTs))}</span>`);
  }

  return chips.join("");
}

function formatRelativeTime(timestamp) {
  const diff = Date.now() - timestamp;
  if (diff < 60 * 1000) return "방금";
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}분 전`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}시간 전`;
  return `${Math.floor(diff / (24 * 60 * 60 * 1000))}일 전`;
}

function getSearchWindowMs(windowKey) {
  if (windowKey === "1d") return 24 * 60 * 60 * 1000;
  if (windowKey === "7d") return 7 * 24 * 60 * 60 * 1000;
  if (windowKey === "30d") return 30 * 24 * 60 * 60 * 1000;
  return 0;
}

function makePreviewText(text, previewMode) {
  const limit = previewMode === "short" ? 46 : 110;
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}...`;
}

async function shareCurrentVerse() {
  const current = currentVerse();
  if (!current) return;
  const text = `${current.path}\n${current.text}`;

  if (navigator.share) {
    try {
      await navigator.share({ title: current.path, text });
    } catch {
      return;
    }
  } else {
    await navigator.clipboard.writeText(text);
    toast("공유 API 미지원 환경이라 클립보드에 복사했습니다.");
  }
}

function highlight(text, keyword) {
  if (!keyword) return text;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const reg = new RegExp(`(${escaped})`, "gi");
  return text.replace(reg, "<mark>$1</mark>");
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function requestResult(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function debounce(fn, delay) {
  let timer = 0;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delay);
  };
}

function toast(message) {
  const node = document.createElement("div");
  node.textContent = message;
  node.style.position = "fixed";
  node.style.left = "50%";
  node.style.bottom = "92px";
  node.style.transform = "translateX(-50%)";
  node.style.background = "rgba(12,16,37,0.9)";
  node.style.color = "#fff";
  node.style.padding = "0.5rem 0.75rem";
  node.style.borderRadius = "10px";
  node.style.fontSize = "0.9rem";
  node.style.zIndex = "9999";
  document.body.appendChild(node);
  window.setTimeout(() => node.remove(), 1500);
}

function updateMediaSession(verse) {
  if (!("mediaSession" in navigator) || !("MediaMetadata" in window)) return;

  navigator.mediaSession.metadata = new MediaMetadata({
    title: verse.path,
    artist: "디지털 전경 스마트 뷰어",
    album: verse.section
  });

  navigator.mediaSession.setActionHandler("nexttrack", () => {
    moveVerse(1);
  });

  navigator.mediaSession.setActionHandler("previoustrack", () => {
    moveVerse(-1);
  });
}
