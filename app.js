import {
  compactForSearch,
  debounce,
  escapeHtml,
  formatRelativeTime,
  getSearchWindowMs,
  highlight,
  highlightInitialMatch,
  makePreviewText,
  requestResult,
  toInitialConsonants,
  transactionDone
} from "./js/helpers.js";
import { loadHoeboIssues } from "./js/hoebo.js";
import {
  getReadTimestamp,
  loadLocalState,
  persistBookmarks,
  persistReadHistory
} from "./js/persistence.js";
import { createBootstrapController } from "./js/bootstrap.js";
import { createReaderController } from "./js/reader.js";
import { createSearchController } from "./js/search.js";
import { createSettingsController } from "./js/settings.js";

const APP_CACHE_VERSION = "2026.04.30.1";
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
  closeSettingBtn: document.querySelector("#closeSettingBtn"),
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
  closeActionBtn: document.querySelector("#closeActionBtn"),
  tabButtons: Array.from(document.querySelectorAll(".tab-btn")),
  screens: {
    home: document.querySelector("#screen-home"),
    reader: document.querySelector("#screen-reader"),
    bookmarks: document.querySelector("#screen-bookmarks"),
    search: document.querySelector("#screen-search")
  }
};

let readerController;
let searchController;
let bootstrapController;
let settingsController;

readerController = createReaderController({
  state,
  el,
  escapeHtml,
  persistBookmarks,
  persistReadHistory,
  getReadTimestamp,
  updateMediaSession,
  toast,
  openDialog,
  storage: window.localStorage
});

searchController = createSearchController({
  state,
  el,
  compactForSearch,
  toInitialConsonants,
  getSearchWindowMs,
  highlight,
  highlightInitialMatch,
  makePreviewText,
  formatRelativeTime,
  getReadTimestamp,
  escapeHtml,
  setScreen,
  renderReader,
  commitCurrentReadProgress
});

settingsController = createSettingsController({
  state,
  el,
  storage: window.localStorage,
  toast
});

bootstrapController = createBootstrapController({
  state,
  storage: window.localStorage,
  appCacheVersion: APP_CACHE_VERSION,
  dataUrl: DATA_URL,
  loadLocalState,
  setTodayMessage,
  bindEvents,
  applySettings,
  renderSectionGrid,
  restoreLastRead,
  renderBookmarks,
  renderReader,
  commitCurrentReadProgress,
  updateSearchMeta,
  loadHoeboIssues
});

function setTodayMessage() {
  const now = new Date();
  const text = `포덕 ${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;
  el.todayMessage.textContent = text;
}

function bindEvents() {
  el.tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      setScreen(btn.dataset.screen);
      if (btn.dataset.screen === "reader") {
        renderReader();
        commitCurrentReadProgress();
      }
    });
  });

  el.continueBtn.addEventListener("click", () => {
    setScreen("reader");
    renderReader();
    commitCurrentReadProgress();
  });

  el.prevBtn.addEventListener("click", () => moveVerse(-1));
  el.nextBtn.addEventListener("click", () => moveVerse(1));

  el.progressSlider.addEventListener("input", () => {
    const idx = Number(el.progressSlider.value) - 1;
    state.currentIndex = idx;
    renderReader();
    commitCurrentReadProgress();
  });

  el.bookmarkBtn.addEventListener("click", () => toggleBookmarkCurrent());

  el.clearBookmarksBtn.addEventListener("click", () => {
    if (confirm("즐겨찾기를 모두 비우시겠습니까?")) {
      state.bookmarks = [];
      persistBookmarks(window.localStorage, state.bookmarks);
      renderBookmarks();
      renderReader();
    }
  });

  el.openSettingsBtn.addEventListener("click", openSettingsDialog);
  el.closeSettingBtn.addEventListener("click", () => closeDialog(el.settingsDialog));
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
    return settingsController.openSettingsDialog();

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

    el.closeActionBtn.addEventListener("click", (event) => {
      event.preventDefault();
      closeDialog(el.actionDialog);
    });
  }

  function bindLongPressActions() {
    return readerController.bindLongPressActions();
  }

  function openSettingsDialog() {
    return settingsController.openSettingsDialog();
  }

  function saveSettingsFromDialog() {
    return settingsController.saveSettingsFromDialog();
  }

  function openDialog(dialogNode) {
    return settingsController.openDialog(dialogNode);
  }

  function closeDialog(dialogNode) {
    return settingsController.closeDialog(dialogNode);
  }

  function applySettings() {
    return settingsController.applySettings();
  }

  function restoreLastRead() {
    return readerController.restoreLastRead();
  }

  function renderSectionGrid() {
    return readerController.renderSectionGrid();
  }

  function setScreen(screen) {
    return readerController.setScreen(screen);
  }

  function renderReader() {
    return readerController.renderReader();
  }

  function renderBookmarks() {
    return readerController.renderBookmarks();
  }

  function moveVerse(delta) {
    return readerController.moveVerse(delta);
  }

  function commitCurrentReadProgress() {
    return readerController.commitCurrentReadProgress();
  }

  function currentVerse() {
    return readerController.currentVerse();
  }

  function toggleBookmarkCurrent() {
    return readerController.toggleBookmarkCurrent();
  }

  function isBookmarked(id) {
    return readerController.isBookmarked(id);
  }

  function runSearch() {
    return searchController.runSearch();
  }

  function updateSearchMeta(message) {
    return searchController.updateSearchMeta(message);
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

bootstrapController.boot();
