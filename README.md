# 디지털 전경 스마트 뷰어 PWA 프로토타입

모바일 우선으로 설계한 시제품입니다. 핵심 화면은 본문 뷰어이며, 홈/즐겨찾기/검색까지 함께 동작합니다.

## 실행 방법

1. 터미널에서 프로젝트 폴더로 이동
2. 정적 서버 실행

예시 (Python 설치 환경):

```bash
cd d:\99_Projects\daesoon
python -m http.server 5500
```

브라우저에서 아래 주소 접속:

- http://localhost:5500

## 포함된 기능

- IndexedDB 기반 본문 저장/조회
- LocalStorage 기반 사용자 설정(테마, 글자 크기, 읽기 모드)
- 이어 읽기(Last Read)
- 즐겨찾기 저장/해제
- 키워드 + 초성 검색
- Service Worker 캐시(오프라인 앱 셸)
- Manifest 기반 설치형 PWA
- Media Session 기반 잠금화면 이전/다음 절 제어 골격

## 현재 데이터

- `data/scriptures.json`에 샘플 구절이 포함되어 있습니다.
- 실제 운영 데이터로 교체하면 동일 구조로 동작합니다.

## 실데이터 이관 파이프라인

1. 원본 CSV 작성

- `data/raw/scriptures.csv`를 운영 데이터로 교체
- 포맷 기준은 `data/SCHEMA.md` 참고

2. 사전 검증

```bash
cd d:\99_Projects\daesoon
npm run verify:data
```

3. 앱용 JSON 생성

```bash
npm run build:data
```

- 생성 결과: `data/scriptures.json`
- 앱은 다음 실행 시 자동으로 신규 버전을 감지해 IndexedDB를 갱신합니다.
