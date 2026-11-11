/* todo.js — 저자(설인환) 관점의 「ToDo」 한 줄.
 *
 * 왜 여기 따로 두나 — portfolio.html 의 「다음 게이트」는 Supabase portfolio_rows 에서,
 * graph.html 의 「남은 병목」은 research_outputs 에서 내려온다. 둘 다 옵시디언 볼트에서
 * 발행한 값이고, 그 문장은 **클로드 코드가 보는 진행상황**이라 길고 기술적이다.
 * 저자가 실제로 다음에 움직여야 할 일은 그것과 다르다 — 「심사 대기」, 「공저자 작업 중」,
 * 「직물 촬영 필요」처럼 한 줄이면 끝난다. 그 한 줄을 여기 모아 두고, 두 화면이 이 값을
 * DB 값보다 **먼저** 쓴다. 볼트를 다시 발행해도 이 줄은 지워지지 않는다.
 *
 * 고치는 법 — 이 파일만 고치면 portfolio.html 과 graph.html 이 같이 바뀐다.
 * 키는 프로젝트 id (볼트 노트 이름과 같다). 값은 **한 줄**로 짧게.
 * 여기에 없는 프로젝트는 지금까지처럼 DB 의 옛 문장을 그대로 보여 준다.
 *
 * 2026-09-21 사용자 지시로 신설.
 * 2026-10-09 사용자 지시로 투고분 정리 — HipDetect·PFTF_GFiberCT 는 09-22 에 나갔는데 옛 줄이 남아 있었다.
 * 2026-10-31 사용자 지시로 볼트 대조 갱신(10-21 발행 이후 바뀐 노트) — CIPC Rev2 · TomoSh4/5 Rev1 · SFTFSoft·PartialCost
 *   12월 계획서 전 투고 · Clustering 보류 · AsymTensor 3DP · OrientCert 3단계 완료 · Tomo_SFTF 게재 대기 · DFSVR 투고 준비 ·
 *   HMDispersity·AutoGrading 줄 신설. 같은 날 portfolio_rows 도 그 노트들만 --only 로 다시 발행했다.
 * 2026-11-05 Tomo_SFTF 온라인 게재 — 빈 칸으로, 그 게재를 기다리던 Tomo_DFSVR 줄도 갱신.
 * 2026-11-11 사용자 지시로 미투고 줄 갱신 — 저장소 이력과 볼트 next_gate 를 대조해 투고순서·완성도 재채점과
 *   함께 고쳤다. 다음 일이 바뀐 줄은 그 일의 묶음으로 옮겼다(ColdOndol·SewerPOC → 공저자, AutoSew·PINNDrape → 원고).
 */
(function () {
  const TODO = {
    /* ── 저널 손에 가 있는 것 ─────────────────────────────── */
    "Tomo_SFTF":            "",  /* 출판 — TDP 온라인 게재 2026-11-05, DOI 10.1177/23297662261499844, 권/호·쪽 미정. cfmsDispersityKNN 처럼 빈 칸으로 둔다 */
    "cfmsCIPC":             "Rev2 판정 대기",  /* TSE 26M-08-030 — Rev1 제출 2026-09-22 → Rev2 제출 2026-10-30 */
    "SFTF_UrbanTraffic":    "심사 대기",
    "TSE_TomoSh4":          "최종본 제출",  /* 26M-09-038 — 1차 수정후 게재가 2026-10-20 → Rev1 제출 2026-10-29(이희란 교수) → 게재가 2026-11-09 */
    "TSE_TomoSh5":          "최종본 제출",  /* 26M-09-036 — 1차 수정후 게재가 2026-10-14 → Rev1 제출 2026-11-04 → 게재가 2026-11-08 */
    "TSE_SEM1_Bezier":      "심사 대기",  /* 한국복합재료학회지 S-26-0085 (2026-09-22) */
    "TSE_SEM2_Tensor":      "최종본 제출",  /* 한국섬유공학회지 학문후속세대논문상 트랙 — 2026-10-23 게재가, 26M-10-043 */
    "SFTF_DrapeOverprint":  "심사 대기",  /* 한국섬유공학회지 (2026-10-16, 설인환 단독), 원고번호 할당중 */
    "cfmsHipDetect":        "심사 대기",  /* IJCST IJCST-09-2026-0266 (2026-09-22 ScholarOne 투고). 2026-10-23 HIPDetect → cfmsHipDetect */
    "SFTF_Holonomy":        "심사 대기",  /* FnP 2026-11-03 투고(FIPO-D-26-01939). 이전: IJMF 2026-11-02 투고 → 11-03 데스크 리젝, JCDE-2026-757 2026-10-22 투고 → 10-25 데스크 리젝 */
    "PFTF_GFiberCT":        "최종본 제출",  /* 한국복합재료학회지 PAPER-26-080 (접수 S-26-0084) — 2026-09-22 투고(은종현 교수 측) → 1차 수정후 게재 2026-11-05 → 수정본(rev2) 제출 2026-11-08 → 게재가 2026-11-11 */
    "SFTF_DrapePrior":      "",  /* 출판 — 63권 5호 (2026-10-31). cfmsDispersityKNN 처럼 빈 칸으로 둔다 */
    "cfmsDispersityKNN":       "",  /* 게재 완료 — 빈 칸으로 둔다 */

    /* ── Tomo_SFTF accept 가 열어 준 것 (2026-10-07) ─────────
       순서 정본은 볼트 Papers/SFTF_4편_투고순서_2026-09-22.md. 2026-11-06 서두르지 않기로 했다 —
       QEM·GNN 은 SFTFSoft 의 IJAMT 결과 뒤에 낸다. */
    "Tomo_SFTFSoft":        "심사 대기",  /* IJAMT JAMT-S-26-11299 (2026-11-06 투고) */
    "SFTF_QEM":             "투고 — SFTFSoft IJAMT 결과 뒤",
    "SFTF_Clustering":      "심사 대기",  /* RPJ-11-2026-0777 (2026-11-05 투고) */
    "SFTFSoft_GNN":         "본문 4천 단어로 · SFTFSoft IJAMT 결과 뒤",  /* 2026-11-11: 본문 7,831단어(규칙 4,000), 닫힌 형식 기준선 검산 보류 */

    /* ── 공저자 손에 가 있는 것 ───────────────────────────── */
    "SFTF_InjMold":         "공저자 작업 중",
    "PFTF_Mold":            "공저자 작업 중",
    "ColdOndol_Materials":  "공저자 작업 중",  /* 김우석 교수님께 넘어갔다 (2026-09-21) */
    "ColdOndol":            "공저자 검토 회신 대기",  /* 2026-11-11: EnergyPlus 대조는 끝났다(V2b). 08-16 김우석 교수 전달 뒤 회신 없음 */
    "SFTF_SewerPOC":        "공저자 회신 대기 · 실유역 검증",  /* 2026-11-11: 원고 수치는 08-16 에 이미 갱신됨. 김우석 교수 검토(08-16 전달) */

    /* ── 남의 눈이 필요한 것 ──────────────────────────────── */
    "cfmsAutoPlace_IJCST":  "제2 전문가 의견 대기 중",

    /* ── 내가 실측·촬영을 해야 하는 것 ────────────────────── */
    "cfmsDrapeInverse":     "직물 촬영 필요",
    "cfmsDispersityProp":   "심사 대기",  /* M&M MAM-26-327 (2026-11-05 ScholarOne 투고) */
    "cfmsHMDispersity":     "심사 대기",  /* J. Microscopy JMI-26-00455 (2026-11-05 투고, In Screening). 10-31 보류(blocked) → 투고 */
    "Jeon_DLPOrient":       "DLP 실물 출력 시편 확보",
    "cfmsDrapeSCAN":        "마네킹 스캔 촬영 필요",
    "SFTF_ActiveOverprint": "RGB-D 촬영 필요",
    "PFTF_Compression":     "상완밴드 의복압 실측 · 엔진 재검정",  /* 2026-11-11: SizeKorea held-out 은 원고에 이미 있다. 엔진 BUG-9 는 08-18 종결 */
    "SFTF_Composite":       "R23 반영 결정 · 은 교수팀 실측 회신",  /* 2026-11-11: HeatMethod accept 게이트는 사라졌다. R23(10-20) 원고 미반영 */
    "SFTFSoft_DFSVR":       "절제 사다리 실측",
    "Tomo_DiffSupport":     "utility 게이트 실행",

    /* ── 내가 원고·문서를 써야 하는 것 ────────────────────── */
    "cfmsAutoPlace_JCDE":   "IJCST 투고 뒤 · 봉합 정답 재채점",  /* 2026-11-11: 영문 원고는 있다(11-03 DOCX·PDF). 벌 단위 CI·LOGO 계산이 남았다 */
    "Tomo_DFSVR":           "3차 사독 반영 — SFTFSoft IJAMT 결과 뒤",  /* JCDE. 2026-10-16 세 번째 사전등록에서 확증 통과. 2026-11-11: Tomo_SFTF DOI 는 들어갔다, 11-10 3차 사독 반영 전 */
    "PFTF":                 "보류 — 원고는 PartialCost 로",  /* 성과 없음, ToDo·보류 (2026-10-24 사용자) */
    "PartialCost":          "본문 4천 단어로 · 커버레터 — SFTFSoft IJAMT 결과 뒤",  /* PFTF 저장소에서 갈라진 원고(2026-10-24 신설). 특허 출원 안 함(10-24). 2026-11-06 서두르지 않기로. 2026-11-11: P599 정본화 뒤 본문 4,191단어(TDP 4,000) */
    "PFTF_OrientCert":      "과제 병기 → 공저자 동의 → CAD",  /* 2026-11-01 1편(AsymTensor) 병합 — 통합편. 저자 확정 박명진 · 은종현 · 설인환*(같은 날). 2026-11-11: 병합본 완성(11-01), 같은 날 사독 반영·검토용한글 동기화 커밋(0a276dc). 남은 것 O2 과제 병기·O3 공저자 동의 */
    "cfmsAutoSew":          "라벨 수치 존치 결정 · 분량 축소",  /* 2026-11-11: edge F1 은 09-25 에 쟀다(0.407). GNN 을 덜고 다시 썼다, Emerald ≈8,300/7,000 */
    "cfmsPINNDrape":        "GPU 서술·IJCST 투고 여부 결정",  /* 2026-11-11: 봉제 구간 계측은 끝났다. 10-22 IJCST 원고, GPU 서술·원고 중심 미결 */
    "PFTF_VisCull_kDop":    "GPU 경로 구현",
    "SFTF_HeatMethod":      "보류 — Holonomy 에서 다시 분리, 실을 원고 없음",  /* 2026-10-21 Holonomy 에 병합 → 2026-10-26 JCDE 리젝 사유 ②로 통제 실험을 다시 뺐다. 단독으로 낼지 사용자 결정 전 */
    "ColdOndol_Positioning":"JBPS 서식 정리 · 공저자 회신 대기",  /* 2026-11-11: 투고처는 08-12 JBPS 로 정해져 있었다 */

    /* ── 순서를 기다리는 것 ───────────────────────────────── */
    "TSE_SEM3_AutoTune":    "JMS 실측 SEM 접목 · 2027-3월 투고(교내과제 사사)",  /* 2026-11-11: 11-08 사용자 결정 JMS 실측 접목, 투고본 25면(규정 20). 저자는 09-22 공저로 되돌림 */
    "DFSVR_VisCull":        "착수 전 — DFSVR 뒤",
    "SFTFSoft_GNN_DFSVR":   "착수 전 — GNN 뒤",
    "SFTF_DynamicTargetSearch": "상수관망 현장 확보 전까지 보류",
    "cfmsAutoGrading":      "사용자 결정 뒤 시험 3 사전 기록",  /* GCD 묶음 1–3 의 남은 7,951 디자인 · 그 뒤 m* 추정 */

    /* ── 응용선 — 남의 데이터가 있어야 움직이는 것 ────────── */
    "PFTF_FXShock":         "데이터 확장 필요",
    "PFTF_AssetShock":      "실시장 데이터 확보",
    "SFTF_ThermalChip":     "실단위 보정 1례 · 게재지 확정",  /* 2026-11-11: 볼트 next_gate 와 맞췄다 */
    "PFTF_Inspection":      "치구 장면 재검증",
    "PFTF_RainNowcast":     "국내 사례 추가 필요",
    "PFTF_Terrain":         "실측 이동데이터 확보",
    "PFTF_Solar":           "실측 기상데이터 확보",
    "PFTF_Assembly":        "실측 CAD 확보",
    "PFTF_CNC":             "실기계 검증 필요",
    "PFTF_Radiotherapy":    "공개 코호트 검증 필요",
    "PFTF_subMarine":       "외부 해양 데이터 검증",
    "SFTF_DataCenterTraffic":"실측 트레이스 확보",
    "SFTF_BatteryThermal":  "실배터리 검증 필요",
    "SFTF_PDNElectric":     "실 EDA 벤치 필요",
    "SFTF_WarehouseAGV":    "일반화 검증 필요",

    /* ── 논문 트랙이 아닌 것 ──────────────────────────────── */
    "cfmsDrape":            "논문 트랙 아님 — 엔진",
    "cfmsMiindo":           "논문 트랙 아님 — 모노레포",
    "PFTF_DrapePrior_VisCull_kDop": "논문 트랙 아님 — 통합 저장소",
    "PFTF_kDop":            "PFTF_VisCull_kDop 로 통합",
    "PFTF_VisCull":         "PFTF_VisCull_kDop 로 통합",
    "PFTF_LostPuppy":       "논문 트랙 아님",
    "PFTF_Minesweeper":     "논문 트랙 아님",
  };

  window.CFMS_TODO = TODO;

  /* 화면마다 id 표기가 조금씩 다르다 — 표는 볼트 노트 이름(HipDetect)을, 그래프는 노드
     id(HIPDetect)를 쓴다.  대소문자와 밑줄·점을 지운 이름으로 한 번 더 찾아, 같은 프로젝트를
     두 화면이 같은 한 줄로 부른다 (2026-09-21). */
  const norm = v => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const BY_NORM = {};
  for (const key of Object.keys(TODO)) BY_NORM[norm(key)] = TODO[key];

  /* 조회기.  **없으면 null** 이다 — 빈 문자열("")은 「할 일 없음」이라는 뜻이라
     호출부가 옛 문장으로 떨어지면 안 된다.  그래서 「모름」과 「빈 칸」을 구분한다. */
  window.cfmsTodo = function (...ids) {
    for (const id of ids) {
      if (!id) continue;
      if (Object.prototype.hasOwnProperty.call(TODO, id)) return TODO[id];
      const k = norm(id);
      if (k && Object.prototype.hasOwnProperty.call(BY_NORM, k)) return BY_NORM[k];
    }
    return null;
  };
})();
