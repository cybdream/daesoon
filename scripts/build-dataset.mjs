#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const SECTION_ORDER = ["행록", "공사", "교운", "교법", "권지", "제생", "예시"];
const SECTION_CODE = {
  행록: "haengnok",
  교운: "gyoun",
  교법: "gyobeop",
  제생: "jesaeng",
  공사: "gongsa",
  권지: "gwonji",
  예시: "yesi"
};

const args = parseArgs(process.argv.slice(2));
const inputPath = args.input;
const outputPath = args.output;
const checkOnly = Boolean(args["check-only"]);
const version = args.version || makeVersion();

if (!inputPath || !outputPath) {
  printUsageAndExit(1);
}

main().catch((error) => {
  console.error(`[build-dataset] 실패: ${error.message}`);
  process.exit(1);
});

async function main() {
  const csv = await fs.readFile(inputPath, "utf-8");
  const rows = parseCsv(csv);

  if (rows.length === 0) {
    throw new Error("CSV 데이터가 비어 있습니다.");
  }

  const header = rows[0].map((cell) => cell.trim());
  const requiredColumns = ["section", "chapter", "verse", "text"];

  requiredColumns.forEach((column) => {
    if (!header.includes(column)) {
      throw new Error(`필수 컬럼 누락: ${column}`);
    }
  });

  const idx = {
    section: header.indexOf("section"),
    chapter: header.indexOf("chapter"),
    verse: header.indexOf("verse"),
    text: header.indexOf("text")
  };

  const verses = rows.slice(1)
    .filter((row) => row.some((cell) => String(cell || "").trim() !== ""))
    .map((row, rowIndex) => normalizeRow(row, rowIndex + 2, idx));

  verses.sort(compareVerse);
  verses.forEach((verse, index) => {
    verse.order = index + 1;
  });

  assertUniqueIds(verses);

  const payload = {
    version,
    generatedAt: new Date().toISOString(),
    verses
  };

  if (checkOnly) {
    console.log(`[build-dataset] 검증 완료: ${verses.length}개 구절`);
    return;
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  console.log(`[build-dataset] 생성 완료: ${outputPath} (${verses.length}개)`);
}

function normalizeRow(row, lineNo, idx) {
  const section = String(row[idx.section] || "").trim();
  const chapter = Number(String(row[idx.chapter] || "").trim());
  const verse = Number(String(row[idx.verse] || "").trim());
  const text = normalizeText(String(row[idx.text] || ""));

  if (!SECTION_ORDER.includes(section)) {
    throw new Error(`${lineNo}행: section 값이 유효하지 않습니다. (${section})`);
  }
  if (!Number.isInteger(chapter) || chapter < 1) {
    throw new Error(`${lineNo}행: chapter는 1 이상의 정수여야 합니다.`);
  }
  if (!Number.isInteger(verse) || verse < 1) {
    throw new Error(`${lineNo}행: verse는 1 이상의 정수여야 합니다.`);
  }
  if (!text) {
    throw new Error(`${lineNo}행: text는 비어 있을 수 없습니다.`);
  }

  const code = SECTION_CODE[section];
  const id = `${code}-${chapter}-${verse}`;
  const pathLabel = `${section} ${chapter}장 ${verse}절`;
  const initials = toInitialConsonants(text);

  return {
    id,
    order: 0,
    section,
    chapter,
    verse,
    path: pathLabel,
    text,
    initials
  };
}

function compareVerse(a, b) {
  const sectionDiff = SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section);
  if (sectionDiff !== 0) return sectionDiff;

  if (a.chapter !== b.chapter) return a.chapter - b.chapter;
  return a.verse - b.verse;
}

function assertUniqueIds(verses) {
  const seen = new Set();
  verses.forEach((verse) => {
    if (seen.has(verse.id)) {
      throw new Error(`중복 절 ID 발견: ${verse.id} (section/chapter/verse 중복)`);
    }
    seen.add(verse.id);
  });
}

function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim();
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

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") {
        i += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += ch;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function parseArgs(argv) {
  const output = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;

    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      output[key] = true;
      continue;
    }

    output[key] = next;
    i += 1;
  }
  return output;
}

function makeVersion() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `${y}${m}${d}.${h}${min}`;
}

function printUsageAndExit(code) {
  console.log("사용법: node scripts/build-dataset.mjs --input <csv> --output <json> [--version <v>] [--check-only]");
  process.exit(code);
}
