import { formatRelativeTime } from "./helpers.js";

const LAST_READ_KEY = "dg_last_read";

// KO: 본문/즐겨찾기 화면 관련 동작을 묶어 제공합니다.
// EN: Bundle reader and bookmark screen behavior behind one controller.
export function createReaderController(deps) {
  const { state, el, escapeHtml, persistBookmarks, persistReadHistory, getReadTimestamp, updateMediaSession, toast, openDialog, storage } = deps;

  function restoreLastRead() {
    const lastId = storage.getItem(LAST_READ_KEY);
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
            commitCurrentReadProgress();
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

    document.body.classList.toggle("reader-screen", screen === "reader");

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
          commitCurrentReadProgress();
        }
      });
      el.bookmarkList.appendChild(card);
    });
  }

  function moveVerse(delta) {
    const next = Math.max(0, Math.min(state.verses.length - 1, state.currentIndex + delta));
    state.currentIndex = next;
    renderReader();
    commitCurrentReadProgress();
  }

  // KO: 사용자가 실제로 본문을 열어본 시점에만 이어보기/최근 열람 기록을 저장합니다.
  // EN: Persist continue/recent-read state only when the user intentionally opens the reader content.
  function commitCurrentReadProgress() {
    const current = currentVerse();
    if (!current) return;

    storage.setItem(LAST_READ_KEY, current.id);
    state.readHistory[current.id] = Date.now();
    persistReadHistory(storage, state.readHistory);
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

    persistBookmarks(storage, state.bookmarks);
    renderBookmarks();
    renderReader();
  }

  function isBookmarked(id) {
    return state.bookmarks.some((item) => item.id === id);
  }

  function bindLongPressActions() {
    const start = () => {
      clearTimeout(state.longPressTimer);
      state.longPressTimer = setTimeout(() => {
        const current = currentVerse();
        if (!current) return;
        el.actionVerseInfo.textContent = current.path;
        openDialog(el.actionDialog);
      }, 700);
    };

    const cancel = () => clearTimeout(state.longPressTimer);

    el.readerVerse.addEventListener("pointerdown", start);
    el.readerVerse.addEventListener("pointerup", cancel);
    el.readerVerse.addEventListener("pointerleave", cancel);
    el.readerVerse.addEventListener("pointercancel", cancel);
  }

  return {
    restoreLastRead,
    renderSectionGrid,
    setScreen,
    renderReader,
    renderBookmarks,
    moveVerse,
    commitCurrentReadProgress,
    currentVerse,
    toggleBookmarkCurrent,
    isBookmarked,
    bindLongPressActions
  };
}