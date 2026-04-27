/**
 * 대순진리회 전경 스크래퍼
 * URL: http://www.daesoon.org/about/bible.book.php?cate=N&jang=M
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BASE_URL = 'http://www.daesoon.org/about/bible.book.php';

const SECTIONS = [
  { cate: 1, name: '행록',  chapters: 5 },
  { cate: 2, name: '공사',  chapters: 3 },
  { cate: 3, name: '교운',  chapters: 2 },
  { cate: 4, name: '교법',  chapters: 3 },
  { cate: 5, name: '권지',  chapters: 2 },
  { cate: 6, name: '제생',  chapters: 1 },
  { cate: 7, name: '예시',  chapters: 1 },
];

async function fetchPage(cate, jang) {
  const url = `${BASE_URL}?cate=${cate}&jang=${jang}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, '')       // 태그 제거
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/　/g, ' ')           // 전각 공백 → 일반 공백
    .replace(/\s+/g, ' ')
    .trim();
}

function parseVerses(html, sectionName, chapterNum) {
  const verses = [];

  // dt-dd 쌍 추출: <dt>...<a name="N">...</dt> <dd>...</dd>
  const pairRegex = /<dt>\s*<a name="(\d+)"><\/a>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g;
  let match;
  while ((match = pairRegex.exec(html)) !== null) {
    const verseNum = parseInt(match[1], 10);
    const text = stripHtml(match[3]);
    if (text) {
      verses.push({ section: sectionName, chapter: chapterNum, verse: verseNum, text });
    }
  }
  return verses;
}

function toCsvLine(row) {
  // 텍스트에 쌍따옴표·줄바꿈이 있을 수 있으므로 안전하게 감쌈
  const escaped = row.text.replace(/"/g, '""');
  return `${row.section},${row.chapter},${row.verse},"${escaped}"`;
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const allVerses = [];

  for (const section of SECTIONS) {
    for (let jang = 1; jang <= section.chapters; jang++) {
      process.stdout.write(`${section.name} ${jang}장 수집 중...`);
      try {
        const html = await fetchPage(section.cate, jang);
        const verses = parseVerses(html, section.name, jang);
        process.stdout.write(` ${verses.length}절\n`);
        allVerses.push(...verses);
      } catch (err) {
        console.error(`\n  오류: ${err.message}`);
      }
      await sleep(600); // 서버 부담 최소화
    }
  }

  const csvLines = ['section,chapter,verse,text', ...allVerses.map(toCsvLine)];
  const outputPath = join(__dirname, '../data/raw/scriptures.csv');
  writeFileSync(outputPath, csvLines.join('\n'), 'utf8');

  console.log(`\n완료: 총 ${allVerses.length}절 → ${outputPath}`);
}

main().catch(err => {
  console.error('스크래핑 실패:', err);
  process.exit(1);
});
