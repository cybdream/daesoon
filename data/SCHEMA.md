# 데이터 스키마 가이드

## 원본 CSV 포맷

파일: `data/raw/scriptures.csv`

헤더는 반드시 아래 순서 또는 동일 컬럼명을 포함해야 합니다.

- `section`: 행록, 교운, 교법, 제생, 공사, 권지, 예시 중 하나
- `chapter`: 장 번호 (정수)
- `verse`: 절 번호 (정수)
- `text`: 절 본문

예시:

```csv
section,chapter,verse,text
교법,1,1,천지의 이치와 인사의 법도를 바르게 깨달아 상생의 길을 닦아야 하느니라.
```

## 생성 JSON 포맷

파일: `data/scriptures.json`

```json
{
  "version": "20260428.1630",
  "generatedAt": "2026-04-28T07:30:00.000Z",
  "verses": [
    {
      "id": "gyobeop-1-1",
      "order": 1,
      "section": "교법",
      "chapter": 1,
      "verse": 1,
      "path": "교법 1장 1절",
      "text": "...",
      "initials": "ㅊㅈ..."
    }
  ]
}
```

## 검증 규칙

- 필수 컬럼 누락 시 실패
- section 값이 허용 목록 외이면 실패
- chapter/verse가 1 이상 정수가 아니면 실패
- text가 비어 있으면 실패
- section/chapter/verse 조합 중복 시 실패
