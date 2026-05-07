# 2026 자율학습 출석체크

Next.js + Google Sheets API 기반 자율학습 출석 관리 시스템 (1~3학년 통합)

---

## 1. Google Cloud 서비스 계정 설정

### 1-1. Google Cloud 프로젝트 생성
1. [Google Cloud Console](https://console.cloud.google.com) 접속
2. 새 프로젝트 생성 (예: `attendance-check-2026`)

### 1-2. Google Sheets API 활성화
1. 좌측 메뉴 → **API 및 서비스** → **라이브러리**
2. "Google Sheets API" 검색 → **사용 설정**

### 1-3. 서비스 계정 생성
1. **API 및 서비스** → **사용자 인증 정보** → **사용자 인증 정보 만들기** → **서비스 계정**
2. 이름 입력 후 생성
3. 생성된 서비스 계정 클릭 → **키** 탭 → **키 추가** → **새 키 만들기** → **JSON** 선택
4. 다운로드된 JSON 파일에서 아래 두 값을 복사:
   - `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → `GOOGLE_PRIVATE_KEY`

---

## 2. Google Spreadsheet 설정

### 2-1. 스프레드시트 생성
1. [Google Sheets](https://sheets.google.com) → 새 스프레드시트 생성
2. 이름: `2026 자율학습 출석기록` (자유롭게 지정 가능)

### 2-2. 시트 이름 설정
기본 시트(Sheet1)를 포함해 시트 3개를 아래 이름으로 만든다:
- `출석기록_1`  (1학년)
- `출석기록_2`  (2학년)
- `출석기록_3`  (3학년)

### 2-3. 헤더 행 입력
각 시트의 **A1:G1** 에 아래 헤더를 입력한다:

```
날짜  교시  학번  이름  상태  메모  기록시각
```

### 2-4. 서비스 계정과 공유
스프레드시트 우상단 **공유** 버튼 → 서비스 계정 이메일 추가 → **편집자** 권한 부여

### 2-5. 스프레드시트 ID 복사
주소표시줄 URL에서 ID 복사:
```
https://docs.google.com/spreadsheets/d/[여기가_SPREADSHEET_ID]/edit
```

---

## 3. 환경 변수 설정

### 로컬 개발: `.env.local` 수정
프로젝트 루트의 `.env.local` 파일을 실제 값으로 채운다:

```env
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-sa@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n"
GOOGLE_SPREADSHEET_ID=1ABC...xyz
JWT_SECRET=최소32자이상의랜덤문자열
ADMIN_PIN=1234
GRADE1_PIN=1111
GRADE2_PIN=2222
GRADE3_PIN=3333
```

> **주의**: `GOOGLE_PRIVATE_KEY`의 줄바꿈은 `\n` 그대로 유지 (실제 줄바꿈 없이 한 줄로).

### Vercel 배포: 환경 변수 입력
Vercel 프로젝트 → **Settings** → **Environment Variables** 에서 위 항목을 모두 추가한다.

---

## 4. 로컬 개발 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000` 접속

---

## 5. Vercel 배포

### 5-1. GitHub 저장소 연결 (권장)
1. 이 폴더를 GitHub 저장소로 push
2. [Vercel](https://vercel.com) → **New Project** → GitHub 저장소 선택
3. **Environment Variables** 에 `.env.local` 내용 입력
4. **Deploy** 클릭

### 5-2. CLI 배포
```bash
npm i -g vercel
vercel
```

---

## 6. 페이지 구조

| URL | 설명 |
|-----|------|
| `/` | 학년 선택 |
| `/student/[grade]` | 반 선택 (1~9반) |
| `/student/[grade]/[cls]` | 출석 체크 |
| `/teacher` | 교사 로그인 & 대시보드 |

---

## 7. 계정 정보

| 계정 | 환경 변수 | 권한 |
|------|-----------|------|
| 관리자 | `ADMIN_PIN` | 전체 학년 조회 |
| 1학년 담당 | `GRADE1_PIN` | 1학년만 조회 |
| 2학년 담당 | `GRADE2_PIN` | 2학년만 조회 |
| 3학년 담당 | `GRADE3_PIN` | 3학년만 조회 |

---

## 8. 학생 명단 업데이트

명단이 바뀌면 `students.json`을 다시 생성 후 재배포한다.  
루트에 있는 xlsx 파일(1~3학년 명렬표)을 수정하고 아래 스크립트를 실행:

```bash
python3 generate_students.py
```

(이미 생성된 경우라면 변환 스크립트를 별도 보관할 것)

---

## 9. 데이터 모델

**스프레드시트 시트별 컬럼 (A~G)**

| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| 날짜 | 교시 | 학번 | 이름 | 상태 | 메모 | 기록시각 |

- 날짜: `yyyy-MM-dd`
- 교시: `1` 또는 `2`
- 학번: 5자리 숫자 (학년×10000 + 반×100 + 번호)
- 상태: `출석` 또는 `결석`
