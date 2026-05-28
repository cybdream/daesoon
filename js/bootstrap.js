import { compactForSearch, requestResult, toInitialConsonants, transactionDone } from "./helpers.js";

// KO: 앱 시작, 데이터베이스 연결, 구절 적재를 담당합니다.
// EN: Handle app startup, database connection, and verse hydration.
export function createBootstrapController(deps) {
  const {
    state,
    storage,
    appCacheVersion,
    dataUrl,
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
  } = deps;

  async function boot() {
    setTodayMessage();
    const persisted = loadLocalState(storage);
    state.settings = { ...state.settings, ...persisted.settings };
    state.bookmarks = persisted.bookmarks;
    state.searchSort = persisted.searchSort;
    state.searchWindow = persisted.searchWindow;
    state.searchPreview = persisted.searchPreview;
    state.readHistory = persisted.readHistory;
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
    if (state.screen === "reader") {
      commitCurrentReadProgress();
    }
    updateSearchMeta("검색 대기 중입니다.");
    loadHoeboIssues();
  }

  async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    try {
      const registration = await navigator.serviceWorker.register(`sw.js?v=${appCacheVersion}`, {
        updateViaCache: "none"
      });
      await registration.update();
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
    const storedVersion = storage.getItem("dg_dataset_version");
    const response = await fetch(`${dataUrl}?v=${appCacheVersion}`);
    const payload = await response.json();

    if (storedVersion !== payload.version) {
      const tx = state.db.transaction("verses", "readwrite");
      const store = tx.objectStore("verses");
      store.clear();
      payload.verses.forEach((verse) => store.put(verse));
      await transactionDone(tx);
      storage.setItem("dg_dataset_version", payload.version);
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

  return {
    boot,
    registerServiceWorker,
    openDatabase,
    ensureDatasetFresh,
    hydrateVersesFromDB
  };
}