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
 */
(function () {
  const TODO = {
    /* ── 저널 손에 가 있는 것 ─────────────────────────────── */
    "Tomo_SFTF":            "심사 대기",
    "cfmsCIPC":             "심사 대기",
    "SFTF_UrbanTraffic":    "심사 대기",
    "TSE_TomoSh4":          "심사 대기",
    "TSE_TomoSh5":          "심사 대기",
    "SFTF_DrapePrior":      "게재확정 — 교정쇄 확인",  /* TSE 는 게재료가 없다 (2026-09-21) */
    "cfmsDispersity":       "",  /* 게재 완료 — 빈 칸으로 둔다 */

    /* ── Tomo_SFTF accept 가 열어 주는 것 ───────────────────
       순서 정본은 볼트 Papers/SFTF_4편_투고순서_2026-09-22.md — SFTFSoft 를 먼저
       내고 preprint 를 같이 올려야 QEM 의 자매 인용과 GNN 의 게이트가 풀린다. */
    "Tomo_SFTFSoft":        "SFTF Accept 대기 — 넷 중 먼저, preprint 같이",
    "SFTF_QEM":             "SFTF Accept 대기 — SFTFSoft 며칠 뒤",
    "SFTF_Clustering":      "SFTF Accept 대기 — APC 유보·공저자 동의 먼저",
    "SFTFSoft_GNN":         "SFTFSoft preprint DOI 뒤",

    /* ── 공저자 손에 가 있는 것 ───────────────────────────── */
    "SFTF_InjMold":         "공저자 작업 중",
    "PFTF_Mold":            "공저자 작업 중",
    "ColdOndol_Materials":  "공저자 작업 중",  /* 김우석 교수님께 넘어갔다 (2026-09-21) */
    "TSE_SEM1_Bezier":      "공저자 작업 중",
    "TSE_SEM2_Tensor":      "공저자 작업 중 — ① 접수 후 투고",
    "PFTF_AsymTensor":      "은종현 교수님 실측 회신 대기",

    /* ── 남의 눈이 필요한 것 ──────────────────────────────── */
    "cfmsAutoPlace_IJCST":  "제2 전문가 의견 대기 중",
    "HIPDetect":            "제2 전문가 의견 대기 중",

    /* ── 내가 실측·촬영을 해야 하는 것 ────────────────────── */
    "cfmsDrapeInverse":     "직물 촬영 필요",
    "cfmsDispersityProp":   "은종현 교수님에게 분산도 샘플 협조받기",
    "Jeon_DLPOrient":       "DLP 실물 출력 시편 확보",
    "cfmsDrapeSCAN":        "마네킹 스캔 촬영 필요",
    "SFTF_ActiveOverprint": "RGB-D 촬영 필요",
    "PFTF_Compression":     "SizeKorea 실측 연동 필요",
    "SFTF_Composite":       "공식 CAD·물성 시험 확보",
    "PFTF_GFiberCT":        "대조군 실험 보강",
    "SFTFSoft_DFSVR":       "절제 사다리 실측",
    "cfmsPINNDrape":        "봉제 구간 시간 계측",
    "cfmsPINNCAD":          "실제 스커트·스캔 대조",
    "ColdOndol":            "EnergyPlus 대조 실행",
    "Tomo_DiffSupport":     "utility 게이트 실행",
    "cfmsAutoSew":          "edge F1 측정",

    /* ── 내가 원고·문서를 써야 하는 것 ────────────────────── */
    "cfmsAutoPlace_JCDE":   "영문 집필",
    "SFTF_SewerPOC":        "원고 수치 v2 갱신",
    "Tomo_DFSVR":           "원고 결함 4건 수정",
    "PFTF":                 "이론 문서 V2–V4 동기화",
    "PFTF_VisCull_kDop":    "GPU 경로 구현",
    "SFTF_HeatMethod":      "투고처 결정 필요",
    "ColdOndol_Positioning":"투고처 결정 필요",

    /* ── 순서를 기다리는 것 ───────────────────────────────── */
    "SFTF_Holonomy":        "HeatMethod 투고 후 진행",
    "TSE_SEM3_AutoTune":    "2027-03 투고 대기",
    "DFSVR_VisCull":        "착수 전 — DFSVR 뒤",
    "SFTFSoft_GNN_DFSVR":   "착수 전 — GNN 뒤",
    "SFTF_DynamicTargetSearch": "상수관망 현장 확보 전까지 보류",

    /* ── 응용선 — 남의 데이터가 있어야 움직이는 것 ────────── */
    "PFTF_FXShock":         "데이터 확장 필요",
    "PFTF_AssetShock":      "실시장 데이터 확보",
    "SFTF_ThermalChip":     "외부 열해석 검증 필요",
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
