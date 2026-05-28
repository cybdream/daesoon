// KO: 검색 화면의 상태, 점수 계산, 결과 렌더링을 묶어 제공합니다.
// EN: Bundle search state, scoring, and result rendering behind one controller.
export function createSearchController(deps) {
  const {
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
  } = deps;

  function runSearch() {
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
        scored = scored.filter((item) => getReadTimestamp(state.readHistory, item.verse.id) >= cutoff);
      }

      scored.sort((a, b) => {
        const recentGap = getReadTimestamp(state.readHistory, b.verse.id) - getReadTimestamp(state.readHistory, a.verse.id);
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
      const readTs = getReadTimestamp(state.readHistory, verse.id);
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
          commitCurrentReadProgress();
        }
      });
      el.searchResult.appendChild(card);
    });
  }

  function updateSearchMeta(message) {
    el.searchMeta.textContent = message;
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

  return {
    runSearch,
    updateSearchMeta
  };
}