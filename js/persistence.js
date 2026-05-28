const SETTINGS_KEY = "dg_settings";
const BOOKMARK_KEY = "dg_bookmarks";
const SEARCH_SORT_KEY = "dg_search_sort";
const READ_HISTORY_KEY = "dg_read_history";
const SEARCH_WINDOW_KEY = "dg_search_window";
const SEARCH_PREVIEW_KEY = "dg_search_preview";

// KO: 저장된 로컬 상태를 읽어 앱 초기값을 구성합니다.
// EN: Read persisted local state and build the app's initial settings.
export function loadLocalState(storage) {
  const state = {
    settings: readJson(storage, SETTINGS_KEY, {}),
    bookmarks: readJson(storage, BOOKMARK_KEY, []),
    searchSort: readEnum(storage, SEARCH_SORT_KEY, ["relevance", "recent"], "relevance"),
    searchWindow: readEnum(storage, SEARCH_WINDOW_KEY, ["all", "1d", "7d", "30d"], "all"),
    searchPreview: readEnum(storage, SEARCH_PREVIEW_KEY, ["short", "long"], "long"),
    readHistory: readJson(storage, READ_HISTORY_KEY, {})
  };

  return {
    settings: state.settings && typeof state.settings === "object" ? state.settings : {},
    bookmarks: Array.isArray(state.bookmarks) ? state.bookmarks : [],
    searchSort: state.searchSort,
    searchWindow: state.searchWindow,
    searchPreview: state.searchPreview,
    readHistory: state.readHistory && typeof state.readHistory === "object" ? state.readHistory : {}
  };
}

// KO: 즐겨찾기 목록을 저장합니다.
// EN: Persist bookmark data.
export function persistBookmarks(storage, bookmarks) {
  storage.setItem(BOOKMARK_KEY, JSON.stringify(bookmarks));
}

// KO: 최근 열람 이력을 저장합니다.
// EN: Persist recent read history.
export function persistReadHistory(storage, readHistory) {
  storage.setItem(READ_HISTORY_KEY, JSON.stringify(readHistory));
}

// KO: 특정 구절의 최근 열람 시각을 읽습니다.
// EN: Read the last viewed timestamp for a verse.
export function getReadTimestamp(readHistory, verseId) {
  return Number(readHistory[verseId] || 0);
}

function readJson(storage, key, fallback) {
  try {
    const value = JSON.parse(storage.getItem(key) || JSON.stringify(fallback));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function readEnum(storage, key, allowedValues, fallback) {
  const value = storage.getItem(key);
  return allowedValues.includes(value) ? value : fallback;
}