# 데이터 빌드 스크립트

## 목적

원본 CSV를 앱에서 사용하는 JSON 포맷으로 정규화합니다.

## 명령

```bash
npm run verify:data
npm run build:data
```

## 옵션

```bash
node scripts/build-dataset.mjs --input data/raw/scriptures.csv --output data/scriptures.json --version 2026.04.28.2
node scripts/build-dataset.mjs --input data/raw/scriptures.csv --output data/scriptures.json --check-only
```
