// KO: 문자열을 검색용으로 단순화합니다.
// EN: Normalize text for search matching.
export function compactForSearch(input) {
  return input
    .toLowerCase()
    .replace(/[^0-9a-z\uac00-\ud7a3ㄱ-ㅎ]/gi, "");
}

// KO: 한글 초성을 추출합니다.
// EN: Extract Hangul initial consonants.
export function toInitialConsonants(input) {
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

// KO: 초성 검색 하이라이트를 계산합니다.
// EN: Highlight a match based on initial consonants.
export function highlightInitialMatch(text, initialsQuery) {
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

// KO: 비교에 사용할 초성을 얻습니다.
// EN: Get one initial consonant for matching.
export function getInitialForMatch(char) {
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

// KO: 본문 미리보기 길이를 조절합니다.
// EN: Trim text for search previews.
export function makePreviewText(text, previewMode) {
  const limit = previewMode === "short" ? 46 : 110;
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}...`;
}

// KO: 상대 시간을 사람이 읽기 좋게 바꿉니다.
// EN: Format a timestamp as relative time.
export function formatRelativeTime(timestamp) {
  const diff = Date.now() - timestamp;
  if (diff < 60 * 1000) return "방금";
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}분 전`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}시간 전`;
  return `${Math.floor(diff / (24 * 60 * 60 * 1000))}일 전`;
}

// KO: 검색 범위 키를 밀리초로 바꿉니다.
// EN: Convert a search window key to milliseconds.
export function getSearchWindowMs(windowKey) {
  if (windowKey === "1d") return 24 * 60 * 60 * 1000;
  if (windowKey === "7d") return 7 * 24 * 60 * 60 * 1000;
  if (windowKey === "30d") return 30 * 24 * 60 * 60 * 1000;
  return 0;
}

// KO: 문자열을 안전하게 마크업화합니다.
// EN: Escape HTML-sensitive characters.
export function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// KO: 일반 키워드 하이라이트를 적용합니다.
// EN: Highlight a plain-text keyword match.
export function highlight(text, keyword) {
  if (!keyword) return text;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const reg = new RegExp(`(${escaped})`, "gi");
  return text.replace(reg, "<mark>$1</mark>");
}

// KO: 비동기 요청 결과를 Promise로 감쌉니다.
// EN: Wrap an async request result in a Promise.
export function requestResult(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// KO: 트랜잭션 완료를 기다립니다.
// EN: Wait for an IndexedDB transaction to finish.
export function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// KO: 호출 빈도를 제한합니다.
// EN: Debounce repeated calls.
export function debounce(fn, delay) {
  let timer = 0;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delay);
  };
}