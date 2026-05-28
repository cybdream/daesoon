import { escapeHtml } from "./helpers.js";

// KO: 대순회보 목록을 화면에 채웁니다.
// EN: Render the Hoebo issue list into the page.
export async function loadHoeboIssues() {
  const listEl = document.querySelector("#hoeboIssueList");
  if (!listEl) return;

  try {
    const res = await fetch("../hoebo/data/index.json");
    if (!res.ok) throw new Error("not found");
    const payload = await res.json();
    const issues = Array.isArray(payload.issues) ? payload.issues : [];
    issues.sort((a, b) => b.issueNo - a.issueNo);

    if (issues.length === 0) {
      listEl.innerHTML = `<p class="muted hoebo-loading">회보 데이터가 없습니다.</p>`;
      return;
    }

    listEl.innerHTML = issues.map((issue) => `
      <div class="hoebo-card">
        ${issue.coverUrl
          ? `<img src="${escapeHtml(issue.coverUrl)}" alt="${escapeHtml(issue.issueLabel)} 표지" class="hoebo-cover" loading="lazy" />`
          : `<div class="hoebo-cover hoebo-cover-placeholder"></div>`}
        <div class="hoebo-card-body">
          <strong>${escapeHtml(issue.issueLabel)}</strong>
          <span class="muted">${escapeHtml(issue.dateLabel)}</span>
          <span class="muted">${issue.articleCount || "?"}개 기사</span>
        </div>
        <div class="hoebo-card-actions">
          ${issue.pdfUrl
            ? `<a href="${escapeHtml(issue.pdfUrl)}" target="_blank" rel="noreferrer noopener" class="hoebo-pdf-btn">PDF ↓</a>`
            : `<span class="hoebo-pdf-none">PDF 없음</span>`}
        </div>
      </div>
    `).join("");
  } catch {
    listEl.innerHTML = `<p class="muted hoebo-loading">hoebo 구축 데이터를 찾을 수 없습니다. <code>npm run build:data</code>를 먼저 실행하세요.</p>`;
  }
}