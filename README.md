# QIS (Quality Information System) — 설치형 앱

> 예전 이름: 개인 QMS (ver 0.3.5부터 QIS)

웹 주소로 올려 두고 Edge·Chrome에서 **앱으로 설치**해 쓰는 버전입니다.
바탕화면 · 시작 메뉴 아이콘, 별도 창, 인터넷 없이 실행, 폴더 허용 기억이 됩니다.
**데이터는 지금처럼 노트북 안에만 저장**되고, 웹에 올리는 것은 프로그램 파일뿐입니다.

## 주요 기능

- **불량 관리**: 불량 등록 · 심각도 평가 · 귀책 조사(FAR) · 사내 대책 · 비용/구상(수량 × 단가, 통화 환산)
- **NCR / 8D**: 발행 · 협력사 통보(통보일 · 방법) · 대책서 회신 · D3 봉쇄 · 대책서 평가 · 유효성 검증 · 종결
- **이슈 · RCA**, **COPQ**, **협력사 품질**(PPM · 등급 · 입고 내역)
- **기준정보**: 협력사(ERP 거래처 목록 업로드) · 부품(통화별 단가, MES/ERP 업로드) · BOM(MES 'BOM 구성현황' 다단계)
- **입고 내역**: MES 거래명세서현황을 줄 단위로 업로드 → 월별 입고수량 · PPM 자동 계산, 입고 건에서 불량 등록
- 변경 내역은 [CHANGELOG.md](CHANGELOG.md)

## 들어 있는 파일

| 파일 | 역할 |
|---|---|
| `index.html` | 앱 본체 (`개인 QMS_ver0.html`과 같은 내용 + 설치 기능) |
| `manifest.webmanifest` | 앱 이름 · 아이콘 · 창 모양 |
| `sw.js` | 인터넷 없이 실행되게 하는 파일 |
| `icons/` | 앱 아이콘 |
| `lib/` | SQLite 엔진 (QIS.sqlite 만들기용, sql.js) |
| `web.config` | 회사 서버가 IIS일 때만 필요 |
| `.nojekyll` | GitHub Pages용 (없어도 동작) |
| `CHANGELOG.md` | 버전별 변경 내역 |

---

## 1단계. 웹에 올리기 — A 또는 B 중 하나

### A. GitHub Pages (무료, 10분)

1. github.com 로그인 → 오른쪽 위 **＋ → New repository**
2. 이름 `qms` · **Public** 선택 → **Create repository**
3. 화면의 **uploading an existing file** 클릭 → 압축을 푼 폴더 안의 파일 · `icons` 폴더를 모두 끌어다 놓기 → **Commit changes**
4. 저장소 **Settings → Pages** → Source: **Deploy from a branch**, Branch: **main / (root)** → **Save**
5. 1~2분 뒤 주소가 생깁니다: `https://<GitHub 아이디>.github.io/qms/`

> 무료 계정의 Pages는 **공개 저장소**만 됩니다. 올라가는 것은 프로그램 코드뿐이고, 불량 · NCR · 회사명 같은 데이터는 올라가지 않습니다.
> 그래도 업무용 프로그램을 외부에 올리는 것이 회사 보안 규정에 맞는지 먼저 확인하세요.

### B. 회사 내부 웹서버

- IT에 **정적 파일 호스팅**만 요청하면 됩니다 (DB · 서버 프로그램 불필요). 폴더째 올리면 끝입니다.
- **반드시 https 주소**여야 합니다. `http://`면 설치 · 오프라인 실행이 되지 않습니다.
- 서버가 **IIS**면 함께 넣은 `web.config`가 `.webmanifest` 형식을 등록해 줍니다.

---

## 2단계. 앱으로 설치

1. Edge(또는 Chrome)로 1단계 주소를 엽니다.
2. 화면 오른쪽 위 **앱으로 설치** 버튼을 누릅니다.
   버튼이 안 보이면: 주소창 오른쪽의 **앱 설치 아이콘**, 또는 메뉴(⋯) → **앱 → 이 사이트를 앱으로 설치**
3. 바탕화면 · 시작 메뉴에 **QIS** 아이콘이 생깁니다. 작업 표시줄에 고정해 두면 편합니다.
4. 아이콘을 오른쪽 클릭하면 **불량 등록**, **NCR / 8D**로 바로 들어가는 메뉴가 있습니다.

## 3단계. 기존 데이터 옮기기 (처음 한 번)

앱은 웹 주소별로 저장소가 따로라서, 파일로 쓰던 데이터를 한 번 옮겨야 합니다.

1. 지금 쓰던 `개인 QMS.html`을 열고 화면 위 **백업** → `QMS_백업_날짜.json` 저장
2. 설치한 앱을 열면 나오는 안내의 **백업 파일로 복원** (또는 설정 → 백업 · 복원 → **백업으로 교체**) → 1의 파일 선택
3. 사진 · 첨부까지 그대로 옮겨집니다. 이후로는 **앱만** 쓰세요 (예전 파일과 따로 저장됩니다).

## 4단계. 사진 · 백업 폴더 지정 (권장)

설정 → 백업 · 복원 → **이 PC 저장 폴더**에서 사진 · 첨부 폴더와 백업 폴더를 지정합니다.
설치한 앱은 폴더 허용을 기억하므로, 처음 한 번만 허용하면 다음부터 묻지 않습니다.

---

## SQL로 조회하기 (QIS.sqlite)

설정 › 백업 · 복원 › **SQL로 조회 (SQLite 파일)** 에서 지금 데이터를 SQLite DB 파일 `QIS.sqlite`로 만듭니다.
백업 폴더를 지정해 두면 자동 백업 때 같은 폴더에 **덮어써서** 늘 최신 상태로 둡니다 (파일 위치 고정).
앱의 원본 데이터는 그대로이고, 이 파일은 **읽기용 사본**입니다 — 고쳐도 앱에는 반영되지 않습니다.

- **바로 열어 보기**: [DB Browser for SQLite](https://sqlitebrowser.org/) (무료) → 파일 열기 → ‘SQL 실행’ 탭
- **Excel · Power BI**: SQLite ODBC 드라이버 설치 → ODBC 데이터 원본에 `QIS.sqlite` 연결 → 데이터 가져오기
- 주요 표: `defects` · `defect_costs` · `ncrs` · `parts` · `suppliers` · `supplier_contacts` · `receipts` · `bom_products` · `bom_rows` · `rca_cases` · `rca_actions` · `supplier_month`(협력사 × 월 불량 · 입고 · PPM)
- 조회(뷰): `v_defects` · `v_ncr_open` · `v_monthly`
- `x_` 로 시작하는 열은 앱이 계산한 값 (협력사명 · 심각도 등급 · 진행 상태 · NCR 번호 · 비용 합계 · 원화 단가 등)

```sql
-- 협력사별 월 PPM
SELECT supplier, month, defect_qty, receipt_qty, ROUND(ppm) AS ppm FROM supplier_month ORDER BY month, ppm DESC;
-- 진행 중 NCR
SELECT * FROM v_ncr_open ORDER BY issueDate;
```

SQLite 엔진(`lib/sql-wasm.*`, [sql.js](https://github.com/sql-js/sql.js) 1.10.3, MIT)은 앱과 함께 올라가 오프라인에서도 동작합니다.
HTML 파일을 직접 열어 쓰는 경우에는 처음 한 번 인터넷(cdnjs)에서 받습니다.

---

## 업데이트하는 방법

- 새 `index.html`로 바꿔 올리기만 하면 됩니다. 앱을 다음에 열 때(인터넷 연결 시) 자동으로 새 버전이 열립니다.
- 데이터는 그대로 유지됩니다 (프로그램 파일과 데이터가 분리되어 있음).
- 아이콘 · 앱 이름을 바꾼 경우에는 `sw.js` 맨 위 `VER = 'qms-v0'`의 숫자도 올려 주세요.

## 주의할 점

- **웹 주소가 바뀌면** 데이터 저장소도 바뀝니다. 주소를 옮길 때는 3단계처럼 백업 → 복원하세요.
- **앱을 제거할 때** "Edge에서 데이터도 지우기"를 체크하면 데이터가 지워집니다. 체크하지 마세요.
- 브라우저의 **인터넷 사용 기록 삭제에서 쿠키 · 사이트 데이터를 지우면** 앱 데이터도 지워집니다. 백업 폴더를 지정해 두면 하루 한 번 자동 백업이 남습니다.
- `index.html`을 더블클릭해서 파일로 열어도 동작하지만, 그건 앱과 **다른 저장소**입니다.
