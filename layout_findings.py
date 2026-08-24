"""graph.html -> graph_발견.html : 발견 1~6 기준 재배치 (LAYOUT_RULES.md 보완).

원본 graph.html(등급 색·의존 엣지·hull 렌더러)은 건드리지 않고, 주입된
POS(고정 좌표)와 hyperedges(영역 hull)만 발견 기준으로 교체해 새 파일을 쓴다.

  - 색 = 투고 등급 (원본 유지)
  - 위치·영역 = 사다리 레이스의 발견 1~6
    (정본: PFTF_dev/experiments/{groundnode,tensorline,conservative}_ladder/)
  - 발견 4·5·6은 같은 보수성 레이스의 세 판정이라 한 영역으로 묶음
  - 발견 3 옆에 대조 지대(1차가 사는 곳)를 붙여 소거/생존을 인접 대비

실행:  python layout_findings.py            (graphify-out 폴더에서)

2026-07-19b: 발견 영역 간 **의존성 화살표** 추가 (분류표 노트의 DAG).
멱등: 같은 파일에 재실행해도 안전(마커 블록 교체). graph.html과
graph_발견.html 두 파일을 동일 내용으로 갱신한다.
"""
import io
import json
import math
import os
import re
from pathlib import Path
from html import escape as html_escape

SRC = "graph.html"
# graph.html is the canonical deployed graph.  graph_발견.html is a frozen
# findings view and is intentionally not touched by new-project onboarding.
DSTS = ["graph.html"]

# Project notes are the single source of truth for local VS Code paths.  The
# graph node id normally matches the Obsidian project-note stem, so the button
# stays correct when a project is moved without hard-coding 30+ paths here.
PROJECTS_DIR = Path(r"D:\cfms-research-vault\Projects")
if not PROJECTS_DIR.is_dir():
    PROJECTS_DIR = Path(__file__).resolve().parents[1] / "Projects"

def _load_project_paths():
    paths = {}
    if not PROJECTS_DIR.is_dir():
        return paths
    for note in PROJECTS_DIR.glob("*.md"):
        try:
            text = note.read_text(encoding="utf-8")
        except OSError:
            continue
        if not re.search(r"(?m)^type:\s*project\s*$", text):
            continue
        match = re.search(r"(?m)^path:\s*['\"]?(.+?)['\"]?\s*$", text)
        if match:
            paths[note.stem] = match.group(1).strip()
    return paths

PROJECT_PATHS = _load_project_paths()

# Exact, project-specific caption suffixes requested for the graph view.
# Keep these separate from Papers/투고현황.md: that source is reserved for
# journal-qualified submission badges such as "[RPJ,draft]".
CAPTION_SUFFIXES = {
    "SFTF_Composite": "[draft]",
    # 2026-07-30: 상으로 동기화됐으나 미투고이므로 draft 표기를 유지한다.
    "SFTF_QEM": "[draft]",
}

# 노드 hover 툴팁.  TODO_NODES 로 주입된 노드는 이미 graph.html 안에 있으면
# 다시 주입되지 않으므로, 등급이 바뀌어도 예전 title 이 그대로 남는다.
# (SFTF_QEM 이 상으로 올라간 뒤에도 이전 등급이 표시될 수 있는 것이 그 사례다.)
# 여기에 적어 두면 매 실행마다 덮어쓴다.
NODE_TITLES = {
    "SFTF_QEM": "SFTF_QEM [draft] — 상: 여각 규약 오류 정정 후 전 게이트 재검증, "
                "Cura 교차검증(두 신뢰 기준의 천장 ρ=+0.754), 코퍼스 50메쉬. 미투고.",
    "SFTF_DynamicTargetSearch": "SFTF_DynamicTargetSearch — ToDo: "
                                "Net1 G0 topology·provenance와 15개 테스트 완료; "
                                "LeakDB scenario localization·baseline 전",
    "SFTF_ActiveOverprint": "SFTF_ActiveOverprint — ToDo: "
                            "surface·next-view 계약 테스트 8개 완료; "
                            "Physical AI 의복 시뮬레이션 직접 통합선; "
                            "RGB-D replay·controlled textile print 전",
    "PFTF_alpha": "PFTF_alpha — 중: positive two-layer draft; "
                  "Phase 50/51C frozen evidence, B5/M1 상대 207/207 paired wins·"
                  "topology error 0. PFTF/local-SPD 우월성은 주장하지 않으며 "
                  "게재지·관련연구·submission package가 남음",
    "DFSVR_VisCull": "DFSVR_VisCull — ToDo: DFSVR exact first-hit용 "
                     "conservative BVH scalability 설계선; 값·gradient parity·"
                     "거짓음성 0·end-to-end utility gate 전",
    "SFTFSoft_GNN_DFSVR": "SFTFSoft_GNN_DFSVR — ToDo: profile-conditioned "
                          "GNN proposer → DFSVR first-hit refiner → "
                          "held-out slicer verifier",
}

# Nodes promoted from idea-only placeholders to real project notes keep their
# source link synchronized here even when they already exist in RAW_NODES.
NODE_SOURCE_FILES = {
    "SFTF_DynamicTargetSearch": "SFTF_DynamicTargetSearch.md",
    "SFTF_ActiveOverprint": "SFTF_ActiveOverprint.md",
}

# ----------------------------------------------------------------- 좌표 (발견 기준)
POS = {
    # 2026-08-06: 사용자가 graph.html에서 조정한 배치를 정본으로 승격.
    "Tomo_SFTF": (-210, 192),
    "Tomo_SFTFSoft": (-20, 207),
    "SFTF_Clustering": (109, 508),
    "PFTF": (101, 390),
    "SFTF_Composite": (349, 706),
    "SFTF_InjMold": (-417, 0),
    "PFTF_Compression": (530, 578),
    "SFTF_ThermalChip": (-366, -185),
    "PFTF_Mold": (508, 667),
    "Tomo_DiffSupport": (259, 135),
    "PFTF_VisCull_kDop": (395, 422),
    "SFTF_SewerPOC": (-121, -142),
    "PFTF_FXShock": (155, 653),
    "SFTF_BatteryThermal": (-172, -250),
    "SFTF_PDNElectric": (-330, -90),
    "PFTF_Inspection": (533, 394),
    "PFTF_RainNowcast": (6, 635),
    "PFTF_Terrain": (-132, 572),
    "PFTF_Solar": (56, 708),
    "PFTF_subMarine": (-244, 549),
    "PFTF_Assembly": (-127, 687),
    "PFTF_CNC": (74, -222),
    "PFTF_Radiotherapy": (348, 615),
    "SFTF_DataCenterTraffic": (-281, 464),
    "SFTF_UrbanTraffic": (-345, 226),
    "SFTF_WarehouseAGV": (-429, 151),
    "PFTF_AssetShock": (-361, 337),
    "SFTFSoft_GNN": (149, 69),
    "SFTF_DrapePrior": (207, 304),
    "PFTF_AsymTensor": (146, 173),
    "PFTF_DrapePrior_VisCull_kDop": (275, 263),
    "PFTF_ResearchOptimize": (-70, 423),
    "PFTF_alpha": (182, -238),
    "SFTF_QEM": (34, 1),
    "SFTF_DynamicTargetSearch": (-142, 41),
    "SFTF_ActiveOverprint": (-67, 112),
    "DFSVR_VisCull": (458, 229),
    "SFTFSoft_GNN_DFSVR": (300, -36),
}

HYPEREDGES = [
    {"label": "발견1",
     "nodes": ["SFTF_InjMold", "SFTF_SewerPOC", "SFTF_PDNElectric",
               "SFTF_ThermalChip", "SFTF_BatteryThermal", "PFTF_CNC"]},
    {"label": "발견2",
     "nodes": ["SFTF_Composite", "PFTF_Compression", "PFTF_Mold",
               "PFTF_Radiotherapy"]},
    {"label": "발견3",
     "nodes": ["SFTF_WarehouseAGV", "PFTF_AssetShock", "SFTF_UrbanTraffic"]},
    {"label": "발견3'",
     "nodes": ["SFTF_DataCenterTraffic", "PFTF_subMarine", "PFTF_Assembly",
               "PFTF_RainNowcast", "PFTF_Terrain", "PFTF_Solar",
               "PFTF_FXShock"]},
    {"label": "발견4·5·6",
     "nodes": ["PFTF_VisCull_kDop", "PFTF_Inspection"]},
    # The four method-level foundations are intentionally separate from the
    # 발견1~6 application regions.  A teal dashed hull exposes the strategic
    # base role without reusing the finding-region color.
    {"label": "BASE",
     "kind": "base",
     "nodes": ["Tomo_SFTF", "Tomo_SFTFSoft", "SFTF_Clustering", "PFTF"],
     "color": "#0f766e", "labelColor": "#115e59",
     "fillAlpha": 0.10, "strokeAlpha": 0.85, "labelAlpha": 0.95,
     "lineWidth": 3, "dash": [12, 6], "scale": 1.18},
    # 발견 hyperedge와 별개인 역할 overlay. 발견을 확정하지 않고 방법론과
    # 다단계 통합 구조를 보여 준다.
    {"label": "METHOD / 이론·추론 확장",
     "kind": "role",
     "nodes": ["Tomo_DiffSupport", "SFTFSoft_GNN", "PFTF_AsymTensor"],
     "color": "#7c3aed", "labelColor": "#6d28d9",
     "fillAlpha": 0.035, "strokeAlpha": 0.75, "labelAlpha": 0.95,
     "lineWidth": 2, "dash": [4, 6], "scale": 1.12},
    {"label": "PIPELINE / 다단계 통합",
     "kind": "role",
     "nodes": ["SFTF_DrapePrior", "PFTF_DrapePrior_VisCull_kDop",
               "SFTF_DynamicTargetSearch", "SFTF_ActiveOverprint", "DFSVR_VisCull",
               "SFTFSoft_GNN_DFSVR"],
     "color": "#0891b2", "labelColor": "#0e7490",
     "fillAlpha": 0.025, "strokeAlpha": 0.70, "labelAlpha": 0.95,
     "lineWidth": 2, "dash": [16, 8], "scale": 1.08},
]

# 2026-07-30 quality snapshot, synchronized from the KIT_sodi mindmap backup. Quality is the single classification axis
# used by both the node colors and the Communities legend.
QUALITY_ROWS = [
    ("Tomo_SFTF", "Tomo_SFTF", "상", "TDP v2.1·외부 60-mesh 감사·budget–complexity·PiAM 연속성"),
    ("Tomo_SFTFSoft", "Tomo_SFTFSoft", "상", "TDP v2.1·현대/legacy Cura·receiver 반례·조건부 first-hit 수렴"),
    ("SFTFSoft_GNN", "SFTFSoft_GNN", "상", "3,817 mesh·held-out·Cura 재라벨·Prusa 교차검증"),
    ("SFTF_Clustering", "SFTF_Clustering", "상", "SFTFCluster 계열 TDP 원고·cross-slicer/partition 자산; 독립성 게이트 잔여"),
    ("PFTF", "PFTF", "중", "PFTF v0.9 이론·family synthesis; 삼형제 V2/V3/V4 synchronization TODO"),
    ("SFTF_DrapePrior", "SFTF_DrapePrior", "상", "IJCST 투고본·ESM·노이즈 플로어 방어된 M3; 판별자는 홀드아웃 과적합(20/32)"),
    ("SFTF_Composite", "SFTF_Composite", "상", "한·영문 완성·191 tests·R9–R13 사전등록/독립감사; R11 합성 held-out 음성, 공식 CAD·물리 검증 잔여"),
    ("SFTF_InjMold", "SFTF_InjMold", "중", "B24·exact integration·set-cover·B-rep·blind protocol; 원고 조립 잔여"),
    ("Tomo_DiffSupport", "Tomo_DiffSupport", "중", "claim–evidence matrix·JAX gradient·fail-closed; utility/print gate 미실행"),
    ("PFTF_AsymTensor", "PFTF_AsymTensor", "중", "9/9 meshes·6 figures·TDP v1; 응용 held-out 부족"),
    ("PFTF_Compression", "PFTF_Compression", "상", "역설계·orthotropic contact·friction·held-out 원고; 임상 cohort 잔여"),
    ("PFTF_Mold", "PFTF_Mold", "중", "IBOF gate·영문 원고; held-out 일반화 0%"),
    ("PFTF_FXShock", "PFTF_FXShock", "중", "frozen/event holdout/falsification; n=8·실제 시장/인과 근거 제한"),
    ("PFTF_VisCull_kDop", "PFTF_VisCull_kDop", "중", "G1–G22 검증선·원고 2편(en/kr); 음성 timing 결과가 2번째 CPU 모델에서 복제(사전등록 R0–R3 통과); GPU contact 미구현"),
    ("SFTF_ThermalChip", "SFTF_ThermalChip", "중", "재현 가능한 PoC 한·영 원고·그림; 외부 칩/열해석 검증 부족"),
    ("SFTF_SewerPOC", "SFTF_SewerPOC", "중", "수식 매핑·AVE·PoC 원고; 실제 관망/수리모형 검증 부족"),
    ("SFTF_BatteryThermal", "SFTF_BatteryThermal", "하", "배터리 열·유동 응용 PoC; 외부 열해석·실측·held-out 검증 미확보"),
    ("SFTF_PDNElectric", "SFTF_PDNElectric", "하", "전기/PDN 응용 PoC; 독립 baseline·재현 benchmark·원고 근거 부족"),
    ("PFTF_Inspection", "PFTF_Inspection", "하", "held-out coverage 0.991·oracle 0.998·latency 25%; 논문·외부 cohort 잔여"),
    ("PFTF_RainNowcast", "PFTF_RainNowcast", "하", "Stage A+B·CSI 개선·FSS +0.09/Brier 개선; 외부시즌·기상장 일반화 잔여"),
    ("PFTF_Terrain", "PFTF_Terrain", "하", "3종 AWS terrain tiles held-out·PoC; 규모·외부 지형 일반화 잔여"),
    ("PFTF_Solar", "PFTF_Solar", "하", "PoC+초안·정확 surrogate/계측 oracle; 실측·외부기간 held-out 잔여"),
    ("PFTF_subMarine", "PFTF_subMarine", "하", "Stage A–B 반복·SFTF 우세 확인; sparse 조건·외부 해양장 일반화 잔여"),
    ("PFTF_Assembly", "PFTF_Assembly", "하", "완료조건 4/4·exact edge·false-feasible 0; CAD cohort·원고 조립 잔여"),
    ("PFTF_CNC", "PFTF_CNC", "중", "완료조건 4/4·dense oracle·undercut/normal 검증; 실기계·held-out cohort 잔여"),
    ("PFTF_Radiotherapy", "PFTF_Radiotherapy", "하", "train 20/held-out 8·surrogate gate; clinical/TCIA cohort·외부 검증 미완료"),
    ("SFTF_DataCenterTraffic", "SFTF_DataCenterTraffic", "하", "96-node PoC·warm-start·4–47x 개선; 실운영 trace·외부 재현 잔여"),
    ("SFTF_UrbanTraffic", "SFTF_UrbanTraffic", "하", "M2–M4 계획·solver gap 미해결·추가 DP 필요; 완성 원고·외부 검증 부족"),
    ("SFTF_WarehouseAGV", "SFTF_WarehouseAGV", "하", "DES 초기 검증·proxy 실패·정책 비교 잔여; 실창고 trace·원고 부족"),
    ("PFTF_AssetShock", "PFTF_AssetShock", "하", "38 benchmark/provider rehearsal; draft 원고와 실제 provider outcome 없음"),
    ("PFTF_DrapePrior_VisCull_kDop", "PFTF_DrapePrior_VisCull_kDop", "ToDo", "M3→kDOP gate+exact fallback 설계선; 실제 cloth solver end-to-end benchmark 전"),
    ("PFTF_ResearchOptimize", "PFTF_ResearchOptimize", "ToDo", "연구 그래프 기반 evidence-aware 투고 순서 설계; 실제 back-test·가중치 calibration 전"),
    ("PFTF_alpha", "PFTF_alpha", "중", "Phase 50 합성 144건·Phase 51C S3DIS 63건 frozen held-out, B5/M1 상대 207/207 paired wins·topology error 0; PFTF/local-SPD 우월성 제외"),
    ("SFTF_QEM", "SFTF_QEM", "상", "여각 규약 오류 정정·Cura 교차검증(천장 ρ=+0.754)·코퍼스 50메쉬·원고 2편+설명서; 성능 우월 주장 없는 평가방법론 트랙, 미투고"),
    ("SFTF_DynamicTargetSearch", "SFTF_DynamicTargetSearch", "ToDo",
     "Net1 G0 topology·provenance, 11 nodes·12 candidate pipes, 총 15 tests; LeakDB scenario localization·baseline 전"),
    ("SFTF_ActiveOverprint", "SFTF_ActiveOverprint", "ToDo",
     "surface·next-view 계약 8 tests, Physical AI 의복 시뮬레이션 직접 통합선; RGB-D replay·controlled textile overprint 전"),
    ("DFSVR_VisCull", "DFSVR_VisCull", "ToDo",
     "DFSVR exact first-hit용 conservative BVH scalability 설계선; 값·gradient parity·거짓음성 0·end-to-end utility gate 전"),
    ("SFTFSoft_GNN_DFSVR", "SFTFSoft_GNN_DFSVR", "ToDo",
     "profile-conditioned GNN proposer → DFSVR first-hit refiner → held-out slicer verifier; frozen budget-matched A–E benchmark 전"),
]

# 대학원생이 처음 그래프를 읽을 때 바로 이해할 수 있도록, 각 프로젝트를
# 전문용어 없이 한 문장으로 설명한다.  이 문장은 논문의 성능 주장이 아니라
# Node Info용 안내 문구이며, RAW_NODES와 함께 graph.html에 저장된다.
INTRODUCTIONS = {
    "Tomo_SFTF": "3D 프린터가 물체를 만들 때 가장 안정적인 방향을 찾는 기본 방법이다.",
    "Tomo_SFTFSoft": "딱 잘라 판단하지 않고 부드러운 점수로 가장 좋은 출력 방향을 찾는 방법이다.",
    "SFTF_Clustering": "비슷한 면들을 묶어 복잡한 물체의 지지 구조를 빠르게 분석하는 방법이다.",
    "PFTF": "방향 정보를 행렬로 정리해 여러 응용 문제에 재사용하는 일반 이론이다.",
    "SFTF_Composite": "복합재 부품의 섬유 방향과 지지 조건을 함께 고려해 좋은 제작 방향을 찾는다.",
    "SFTF_InjMold": "사출 금형에서 재료가 흐르는 방향을 보고 결함이 적은 설계를 고르는 방법이다.",
    "PFTF_Compression": "압박 의류가 몸을 누르는 정도를 방향별로 예측해 설계를 돕는다.",
    "SFTF_ThermalChip": "칩 안의 열이 잘 빠져나가는 방향을 찾아 과열을 줄이는 방법이다.",
    "PFTF_Mold": "금형으로 만든 부품이 식으며 줄어드는 양을 예측해 치수 오차를 줄인다.",
    "Tomo_DiffSupport": "지지 구조 계산을 미분 가능하게 만들어 설계 점수를 자동으로 개선하는 연구다.",
    "PFTF_VisCull_kDop": "보이지 않거나 충돌하지 않을 가능성이 큰 후보를 먼저 걸러 3D 계산을 줄이는 방법이다.",
    "SFTF_SewerPOC": "하수관망에서 물이 흐르는 방향을 이용해 관망 해석을 빠르게 시험하는 응용이다.",
    "PFTF_FXShock": "환율 충격이 자산 위험에 미치는 영향을 분석해 위험한 상황을 미리 살피는 방법이다.",
    "SFTF_BatteryThermal": "배터리에서 열이 몰리는 곳을 찾아 냉각 설계를 돕는 방법이다.",
    "SFTF_PDNElectric": "전원망에서 전압이 불안정해지는 위치를 찾아 전기 설계를 점검하는 방법이다.",
    "PFTF_Inspection": "검사 대상의 방향과 위치 정보를 이용해 검사할 후보를 빠르게 줄이는 방법이다.",
    "PFTF_RainNowcast": "비가 어느 방향과 지역으로 퍼질지 예측해 짧은 시간의 강우를 살피는 응용이다.",
    "PFTF_Terrain": "지형의 방향과 경사를 이용해 넓은 지역의 지형 효과를 빠르게 계산하는 응용이다.",
    "PFTF_Solar": "태양빛이 들어오는 방향을 분석해 발전량을 예측하고 배치 설계를 돕는다.",
    "PFTF_subMarine": "바닷속 센서와 물체의 방향 정보를 이용해 위치를 추정하는 응용이다.",
    "PFTF_Assembly": "부품을 조립할 때 서로 부딪히지 않고 들어갈 수 있는 방향을 찾는다.",
    "PFTF_CNC": "CNC 공구가 가공할 수 있는 방향을 골라 가공 실패를 줄이는 응용이다.",
    "PFTF_Radiotherapy": "방사선이 종양에 잘 도달하면서 주변 조직에는 덜 닿는 방향을 찾는 응용이다.",
    "SFTF_DataCenterTraffic": "데이터센터 안의 작업 흐름 방향을 분석해 계산 지연을 줄이는 응용이다.",
    "SFTF_UrbanTraffic": "도시 도로의 차량 흐름 방향을 분석해 교통 병목을 찾는 응용이다.",
    "SFTF_WarehouseAGV": "창고 로봇이 이동하기 좋은 방향과 경로를 찾아 운반 시간을 줄이는 응용이다.",
    "PFTF_AssetShock": "큰 경제 충격이 여러 자산에 미치는 영향을 비교해 위험을 관리하는 응용이다.",
    "SFTFSoft_GNN": "물체의 면을 그래프로 보고 제작 방향의 품질을 학습해 예측하는 방법이다.",
    "SFTF_DrapePrior": "옷감이 몸과 바닥에 어떻게 닿을지 미리 예측해 천 시뮬레이션을 빠르게 시작하는 방법이다.",
    "PFTF_AsymTensor": "방향에 따라 다르게 반응하는 재료나 문제를 표현하기 위한 비대칭 텐서 이론이다.",
    "PFTF_DrapePrior_VisCull_kDop": "옷감의 좋은 시작 상태와 안전한 충돌 필터를 결합해 천 계산을 빠르게 하려는 새 연구선이다.",
    "PFTF_ResearchOptimize": "프로젝트 사이의 연결과 작업량을 비교해 효율적인 논문 투고 순서를 찾는 방법이다.",
    "PFTF_alpha": "서로 떨어진 두 표면을 먼저 구분해 각 층을 따로 복원함으로써 alpha 방법의 잘못된 연결과 위상 오류를 줄이는 연구다.",
    "SFTF_QEM": "메쉬를 줄여 방향 탐색을 빠르게 하려다 그 가설이 기각되었고, 대신 지지비용 계산의 검증 방법 자체를 다루게 된 연구다. 각도 규약 오류를 스스로 찾아 정정한 기록과, 서로 다른 두 슬라이서조차 완전히 일치하지 않는다는 측정이 주 내용이다.",
    "SFTF_DynamicTargetSearch": "여러 이동 센서의 불완전한 보고를 합쳐 구조가 바뀌는 공간에서 목표물과 다음 탐색 경로를 찾으려는 연구다.",
    "SFTF_ActiveOverprint": "카메라로 기존 물체나 로봇이 고정한 의복의 출력 가능 표면과 다음 관측 위치를 찾고 그 위에 안전하게 작은 형상을 덧출력하려는 연구다.",
    "DFSVR_VisCull": "정확한 지지 구조 계산 전에 안전하게 불필요한 교차 후보를 줄여 DFSVR을 빠르게 하려는 연구선이다.",
    "SFTFSoft_GNN_DFSVR": "GNN이 좋은 출력 방향 후보를 빠르게 고르고 DFSVR이 정밀하게 다듬은 뒤 슬라이서로 확인하는 후속 연구다.",
}

# 발견을 확정하는 hyperedge와 구분되는 그래프 해석용 역할 및 후보 표지.
GRAPH_ROLES = {
    "Tomo_DiffSupport": "METHOD / 이론·추론 확장",
    "SFTFSoft_GNN": "METHOD / 이론·추론 확장",
    "PFTF_AsymTensor": "METHOD / 이론·추론 확장",
    "SFTF_DrapePrior": "PIPELINE / 다단계 통합",
    "PFTF_DrapePrior_VisCull_kDop": "PIPELINE / 다단계 통합",
    "SFTF_DynamicTargetSearch": "PIPELINE / 다단계 통합",
    "SFTF_ActiveOverprint": "PIPELINE / 다단계 통합",
    "DFSVR_VisCull": "PIPELINE / 다단계 통합",
    "SFTFSoft_GNN_DFSVR": "PIPELINE / 다단계 통합",
    "SFTF_QEM": "AUDIT / 평가·검증",
    "PFTF_ResearchOptimize": "META / 연구 포트폴리오 도구",
}

FINDING_CANDIDATES = {
    "PFTF_alpha": "발견1?",
    "DFSVR_VisCull": "발견4·5·6?",
}

GRADE_COLORS = {"상": "#e02020", "중": "#f28e2b", "하": "#2a78d6", "ToDo": "#ffffff"}

QUALITY_CSS = r'''/* QUALITY_BOARD_BEGIN */
#quality-board { padding: 10px 12px; border-bottom: 1px solid #dddddd; max-height: 255px; overflow-y: auto; background: #fafafa; }
#quality-board h3 { font-size: 16px; color: #555555; margin-bottom: 5px; letter-spacing: 0.02em; }
#quality-board .quality-meta { font-size: 13px; color: #888888; margin-bottom: 6px; line-height: 1.35; }
#quality-board table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
#quality-board th { color: #777777; text-align: left; font-weight: 600; border-bottom: 1px solid #dddddd; padding: 2px 2px 4px; }
#quality-board td { padding: 3px 2px; border-bottom: 1px solid #eeeeee; vertical-align: top; line-height: 1.25; }
#quality-board td:first-child { white-space: nowrap; font-weight: 600; }
.quality-grade { display: inline-block; min-width: 18px; text-align: center; color: #fff; border-radius: 3px; padding: 1px 3px; font-weight: 700; }
/* QUALITY_BOARD_END */'''

# 영역 간 의존성 (인덱스 = HYPEREDGES 순서: 0=발견1 1=발견2 2=발견3 3=발견3' 4=발견4·5·6)
DEPS_JS = """// FINDING_DEPS_BEGIN — 발견 간 의존성 (분류표 노트의 DAG, layout_findings.py 정본)
const FINDING_DEPS = [
  {from:0, to:1, style:"solid",    label:"전제(사다리·레이스)"},
  {from:0, to:2, style:"solid",    label:"전제"},
  {from:0, to:4, style:"solid",    label:"전제", labelT:0.22},
  {from:2, to:1, style:"dotted",   label:"\\u2124\\u2082 보조정리", labelT:0.78},
  {from:2, to:4, style:"double",   label:"\\u2124\\u2082 쌍대(\\u00b1d)"},
  {from:2, to:3, style:"contrast", label:"소거 \\u2194 생존 대비"},
];
function _regionCentroid(h) {
  const ps = h.nodes.map(nid => network.getPositions([nid])[nid]).filter(p => p);
  return {x: ps.reduce((s,p)=>s+p.x,0)/ps.length,
          y: ps.reduce((s,p)=>s+p.y,0)/ps.length};
}
(function(ctx) {
  ctx.save();
  FINDING_DEPS.forEach(dp => {
    const a = _regionCentroid(hyperedges[dp.from]);
    const b = _regionCentroid(hyperedges[dp.to]);
    const dx = b.x-a.x, dy = b.y-a.y, L = Math.hypot(dx,dy);
    const ux = dx/L, uy = dy/L;
    const x1 = a.x+ux*115, y1 = a.y+uy*115;   // 영역 라벨을 피해 안쪽에서 시작/끝
    const x2 = b.x-ux*135, y2 = b.y-uy*135;
    // 전부 dashed + 5배 두께 + 반투명: 노드 간 실선 엣지와 확실히 구분
    ctx.beginPath();
    ctx.lineWidth = dp.style === "double" ? 15 : 8;
    ctx.strokeStyle = dp.style === "contrast" ? "#8a8a5e" : "#a5a8f5";
    ctx.setLineDash(dp.style === "dotted" ? [4,10]
                    : dp.style === "double" ? [22,14]
                    : dp.style === "contrast" ? [10,12] : [14,10]);
    ctx.globalAlpha = 0.22;
    ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    ctx.setLineDash([]);
    if (dp.style !== "contrast") {            // 화살촉 (두께에 맞춰 확대)
      const ah = dp.style === "double" ? 34 : 26;
      ctx.beginPath();
      ctx.moveTo(x2+ux*10,y2+uy*10);
      ctx.lineTo(x2-ux*ah-uy*ah*0.45, y2-uy*ah+ux*ah*0.45);
      ctx.lineTo(x2-ux*ah+uy*ah*0.45, y2-uy*ah-ux*ah*0.45);
      ctx.closePath();
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = ctx.strokeStyle; ctx.fill();
    }
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = "#4a4dbf";
    ctx.font = "18px sans-serif"; ctx.textAlign = "center";
    const t = dp.labelT === undefined ? 0.5 : dp.labelT;
    ctx.fillText(dp.label, x1+(x2-x1)*t, y1+(y2-y1)*t - 6);
  });
  ctx.restore();
})(ctx);
// 발견 영역 라벨 왼쪽에 사다리 글리프(0차·1차·2차·topology) — 시그니처 다이어그램과 동일 모티프
const REGION_GLYPHS = [
  [["m0", 0], ["topo", -34]],      // 발견1: 0차 + 연결지도
  [["F", 0]],                       // 발견2: 2차
  [["m", 0], ["kill", 0]],          // 발견3: 1차 소거(빨간 사선)
  [["m", 0]],                       // 발견3': 1차 생존
  [["gate", 0]],                    // 발견4·5·6: 게이트(체크)
];
function _glyph(ctx, type, x, y) {
  ctx.save();
  ctx.strokeStyle = "#4f46e5"; ctx.fillStyle = "#4f46e5"; ctx.lineWidth = 2;
  if (type === "m0") { ctx.beginPath(); ctx.arc(x, y, 7, 0, 6.2832); ctx.fill(); }
  else if (type === "m") {
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x - 9, y + 7); ctx.lineTo(x + 5, y - 3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 10, y - 7);
    ctx.lineTo(x + 1, y - 6); ctx.lineTo(x + 6, y + 2); ctx.closePath(); ctx.fill();
  } else if (type === "F") {
    ctx.translate(x, y); ctx.rotate(-0.42);
    ctx.beginPath(); ctx.ellipse(0, 0, 12, 6.5, 0, 0, 6.2832); ctx.stroke();
    ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(12, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -6.5); ctx.lineTo(0, 6.5); ctx.stroke();
  } else if (type === "topo") {
    ctx.fillStyle = "#666666"; ctx.strokeStyle = "#666666"; ctx.lineWidth = 1.4;
    [[-8, -8], [0, -10], [8, -7]].forEach(p => {
      ctx.beginPath(); ctx.arc(x + p[0], y + p[1], 2.6, 0, 6.2832); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + p[0], y + p[1]); ctx.lineTo(x, y + 5); ctx.stroke();
    });
    ctx.fillStyle = "#4f46e5"; ctx.fillRect(x - 4, y + 4, 8, 7);
    ctx.strokeStyle = "#4f46e5"; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(x - 6, y + 14); ctx.lineTo(x + 6, y + 14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 3.5, y + 17); ctx.lineTo(x + 3.5, y + 17); ctx.stroke();
  } else if (type === "kill") {
    ctx.strokeStyle = "#c04040"; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(x - 11, y + 10); ctx.lineTo(x + 11, y - 10); ctx.stroke();
  } else if (type === "gate") {
    ctx.strokeStyle = "#2e9e44"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x - 8, y); ctx.lineTo(x - 2, y + 7); ctx.lineTo(x + 9, y - 8);
    ctx.stroke();
  }
  ctx.restore();
}
(function(ctx) {
  hyperedges.forEach((h, i) => {
    const glyphs = REGION_GLYPHS[i] || [];
    if (!glyphs.length) return;
    const ps = h.nodes.map(nid => network.getPositions([nid])[nid]).filter(p => p);
    if (ps.length < 2) return;
    const cy = ps.reduce((s, p) => s + p.y, 0) / ps.length;
    const cx = ps.reduce((s, p) => s + p.x, 0) / ps.length;
    const minY = Math.min.apply(null, ps.map(p => p.y));
    const topY = cy + (minY - cy) * 1.25;          // hull 라벨과 동일한 확장 규칙
    ctx.font = "bold 20px sans-serif";
    const w = ctx.measureText(h.label).width;
    const gx = cx - w / 2 - 26, gy = topY - 23;    // 라벨 baseline(topY-16) 좌측
    glyphs.forEach(g => _glyph(ctx, g[0], gx + g[1], gy));
  });
})(ctx);
// FINDING_DEPS_END"""

s = io.open(SRC, encoding="utf-8").read()


def _prefer_local_graph_side(text):
    """Remove stale Git conflict wrappers before regenerating the graph.

    ``graph.html`` is a generated artifact, so a merge conflict must never be
    copied into the next generated artifact.  The local side is the current
    graph snapshot that this layout pass is already operating on; preserve it
    and discard the stale remote duplicate.  A stray opening marker is also
    removed because older interrupted merges left one without its closing
    pair.
    """
    conflict = re.compile(
        r"(?ms)^<<<<<<< HEAD\r?\n(?P<local>.*?)^=======\r?\n"
        r".*?^>>>>>>> origin/main\r?\n?"
    )
    text = conflict.sub(lambda match: match.group("local"), text)
    text = re.sub(r"(?m)^<<<<<<< HEAD\r?\n?", "", text)
    text = re.sub(r"(?m)^=======\r?\n?", "", text)
    text = re.sub(r"(?m)^>>>>>>> origin/main\r?\n?", "", text)
    if re.search(r"(?m)^(<<<<<<<|=======|>>>>>>>)", text):
        raise ValueError("graph.html still contains unresolved Git conflict markers")
    return text


s = _prefer_local_graph_side(s)

# Preserve the extended quality overlay used by the deployed graph (Closed
# nodes, bottlenecks, project roles, and bracket-caption rims).  Older/fresh
# graphify exports may only have the compact overlay, in which case the
# generator's fallback block below is used.
existing_quality_js_match = re.search(
    r"\n// QUALITY_BOARD_BEGIN.*?// QUALITY_BOARD_END",
    s,
    flags=re.S,
)
existing_quality_js = (
    existing_quality_js_match.group(0).strip()
    if existing_quality_js_match
    else ""
)
preserve_extended_quality = "const REMAINING_BOTTLENECKS" in existing_quality_js

def _update_json_object_constant(js, name, updates):
    """Update one JSON-valued JavaScript object without rewriting its logic."""
    pattern = rf"const {re.escape(name)} = (\{{.*?\}});"
    def repl(match):
        value = json.loads(match.group(1))
        value.update(updates)
        return f"const {name} = " + json.dumps(value, ensure_ascii=False) + ";"
    updated, count = re.subn(pattern, repl, js, count=1, flags=re.S)
    assert count == 1, f"{name} constant not found"
    return updated

if preserve_extended_quality:
    s = _update_json_object_constant(
        s,
        "STATUS_BADGES",
        {"PFTF_alpha": "미정,draft"},
    )
    existing_quality_js = _update_json_object_constant(
        existing_quality_js,
        "REMAINING_BOTTLENECKS",
        {
            "PFTF_alpha": "게재지·관련연구·서지·저자·declarations·data availability 확정; close-layer·outlier·N<160·automatic pair discovery와 PFTF/local-SPD 우월성 주장 금지",
            "DFSVR_VisCull": "값·gradient parity·거짓음성 0 및 실제 end-to-end utility 검증",
            "SFTFSoft_GNN_DFSVR": "frozen budget-matched A–E baseline, held-out slicer 전이 및 latency/quality 동시 검증",
        },
    )
    s = _update_json_object_constant(
        s,
        "INDUSTRIAL_EFFECTS",
        {
            "PFTF_alpha": "실내 스캔의 바닥·천장처럼 떨어진 두 표면을 먼저 분리 복원해 잘못된 연결과 topology 오류를 줄일 수 있다. 자동 객체 탐지와 close-layer는 미지원이다.",
            "DFSVR_VisCull": "정확한 first-hit 결과를 유지하면서 불필요한 교차 후보를 안전하게 줄이면 미분가능 지지 구조 계산의 확장성을 높일 수 있다.",
            "SFTFSoft_GNN_DFSVR": "GNN의 빠른 후보 제안과 DFSVR의 정밀 보정을 결합해 출력 방향 탐색 시간과 검증 비용을 함께 줄이는 것을 목표로 한다.",
        },
    )

# Remove a prior overlay before reinserting it so the generator remains
# idempotent when the quality snapshot changes.
s = re.sub(r"\n/\* QUALITY_BOARD_BEGIN \*/.*?/\* QUALITY_BOARD_END \*/\n?", "\n", s, flags=re.S)
s = re.sub(r"\n// QUALITY_BOARD_BEGIN.*?// QUALITY_BOARD_END\n?", "\n", s, flags=re.S)
s = re.sub(r"\n\s*<div id=\"quality-board\">.*?(?=\n\s*<div id=\"quality-board\">|\n\s*<div id=\"legend-wrap\">)",
            "\n", s, flags=re.S)

quality_rows_json = json.dumps(
    [{"id": i, "label": label, "grade": grade, "note": note}
     for i, label, grade, note in QUALITY_ROWS],
    ensure_ascii=False,
)
quality_lookup = {i: (grade, note) for i, _label, grade, note in QUALITY_ROWS}
QUALITY_COMMUNITY_IDS = {"상": 1, "중": 2, "하": 3, "ToDo": 4}

TODO_NODE = {
    "id": "PFTF_DrapePrior_VisCull_kDop",
    "label": "PFTF_DrapePrior_VisCull_kDop",
    "color": {"background": "#ffffff", "border": "#000000",
               "highlight": {"background": "#ffffff", "border": "#000000"}},
    "size": 16.4,
    "font": {"size": 12, "color": "#333333"},
    "title": "PFTF_DrapePrior_VisCull_kDop — ToDo: M3→kDOP gate+exact fallback end-to-end",
    "community": 4,
    "community_name": "ToDo",
    "source_file": "PFTF_DrapePrior_VisCull_kDop.md",
    "file_type": "concept",
    "degree": 2,
}

RESEARCH_OPTIMIZE_NODE = {
    "id": "PFTF_ResearchOptimize",
    "label": "PFTF_ResearchOptimize",
    "color": {"background": "#ffffff", "border": "#000000",
               "highlight": {"background": "#ffffff", "border": "#000000"}},
    "size": 16.4,
    "font": {"size": 12, "color": "#333333", "bold": False},
    "title": "PFTF_ResearchOptimize — ToDo: evidence-aware submission scheduling",
    "community": 4,
    "community_name": "ToDo",
    "source_file": "PFTF_ResearchOptimize.md",
    "file_type": "concept",
    "degree": 1,
}

ALPHA_NODE = {
    "id": "PFTF_alpha",
    "label": "PFTF_alpha",
    "color": {"background": "#f28e2b", "border": "#f28e2b",
               "highlight": {"background": "#f28e2b", "border": "#f28e2b"}},
    "size": 16.4,
    "font": {"size": 12, "color": "#333333", "bold": False},
    "title": NODE_TITLES["PFTF_alpha"],
    "community": 2,
    "community_name": "중",
    "source_file": "PFTF_alpha.md",
    "file_type": "concept",
    "degree": 2,
}

DYNAMIC_TARGET_SEARCH_NODE = {
    "id": "SFTF_DynamicTargetSearch",
    "label": "SFTF_DynamicTargetSearch",
    "color": {"background": "#ffffff", "border": "#000000",
               "highlight": {"background": "#ffffff", "border": "#000000"}},
    "size": 16.4,
    "font": {"size": 12, "color": "#333333", "bold": False},
    "title": NODE_TITLES["SFTF_DynamicTargetSearch"],
    "community": 4,
    "community_name": "ToDo",
    "source_file": "SFTF_DynamicTargetSearch.md",
    "file_type": "concept",
    "degree": 3,
}

ACTIVE_OVERPRINT_NODE = {
    "id": "SFTF_ActiveOverprint",
    "label": "SFTF_ActiveOverprint",
    "color": {"background": "#ffffff", "border": "#000000",
               "highlight": {"background": "#ffffff", "border": "#000000"}},
    "size": 16.4,
    "font": {"size": 12, "color": "#333333", "bold": False},
    "title": NODE_TITLES["SFTF_ActiveOverprint"],
    "community": 4,
    "community_name": "ToDo",
    "source_file": "SFTF_ActiveOverprint.md",
    "file_type": "concept",
    "degree": 4,
}

DFSVR_VIS_CULL_NODE = {
    "id": "DFSVR_VisCull",
    "label": "DFSVR_VisCull",
    "color": {"background": "#ffffff", "border": "#000000",
               "highlight": {"background": "#ffffff", "border": "#000000"}},
    "size": 15.4,
    "font": {"size": 13, "color": "#333333"},
    "title": NODE_TITLES["DFSVR_VisCull"],
    "community": 4,
    "community_name": "ToDo",
    "source_file": "DFSVR_VisCull.md",
    "file_type": "concept",
    "degree": 2,
}

SFTFSOFT_GNN_DFSVR_NODE = {
    "id": "SFTFSoft_GNN_DFSVR",
    "label": "SFTFSoft_GNN_DFSVR",
    "color": {"background": "#ffffff", "border": "#000000",
               "highlight": {"background": "#ffffff", "border": "#000000"}},
    "size": 15.4,
    "font": {"size": 13, "color": "#333333"},
    "title": NODE_TITLES["SFTFSoft_GNN_DFSVR"],
    "community": 4,
    "community_name": "ToDo",
    "source_file": "SFTFSoft_GNN_DFSVR.md",
    "file_type": "concept",
    "degree": 2,
}

# 2026-07-30: mindmap Paper quality 기준 상으로 동기화. 원고 2편+설명서가 있고
# 게이트 T·T2·G2·S·X 가 닫혔다.  라벨에 [draft] 를 병기하는 이유는 등급이
# 상이어도 아직 미투고이기 때문이다.
QEM_NODE = {
    "id": "SFTF_QEM",
    # 캡션의 "[draft]" 는 CAPTION_SUFFIXES 가 붙인다. 여기에 직접 쓰면 두 번 붙는다.
    "label": "SFTF_QEM",
    "color": {"background": "#59a14f", "border": "#59a14f",
               "highlight": {"background": "#59a14f", "border": "#59a14f"}},
    "size": 16.4,
    "font": {"size": 12, "color": "#333333"},
    "title": "SFTF_QEM [draft] — 상: 여각 규약 오류 정정 후 재검증, Cura 교차검증(천장 ρ=+0.754), 코퍼스 50메쉬",
    "community": 1,
    "community_name": "상",
    "source_file": "SFTF_QEM.md",
    "file_type": "concept",
    "degree": 2,
}

# QEM_NODE 는 더 이상 ToDo 가 아니지만, 이 목록은 RAW_NODES 에 없는 노드를
# 주입하는 통로이므로 그대로 둔다.  이름이 등급을 뜻하지 않는다.
TODO_NODES = [
    TODO_NODE,
    RESEARCH_OPTIMIZE_NODE,
    ALPHA_NODE,
    QEM_NODE,
    DYNAMIC_TARGET_SEARCH_NODE,
    ACTIVE_OVERPRINT_NODE,
    DFSVR_VIS_CULL_NODE,
    SFTFSOFT_GNN_DFSVR_NODE,
]

TODO_EDGES = [
    {"from": "PFTF_DrapePrior_VisCull_kDop", "to": "SFTF_DrapePrior",
     "label": "complements", "title": "complements [INFERRED]", "dashes": True,
     "width": 2, "color": {"opacity": 0.7}, "confidence": "INFERRED"},
    {"from": "PFTF_DrapePrior_VisCull_kDop", "to": "PFTF_VisCull_kDop",
     "label": "extends", "title": "extends [INFERRED]", "dashes": True,
     "width": 2, "color": {"opacity": 0.7}, "confidence": "INFERRED"},
    {"from": "PFTF", "to": "PFTF_ResearchOptimize",
     "label": "optimizes", "title": "optimizes [INFERRED]", "dashes": True,
     "width": 2, "color": {"opacity": 0.7}, "confidence": "INFERRED"},
    {"from": "PFTF", "to": "PFTF_alpha",
     "label": "instantiates", "title": "instantiates [INFERRED]", "dashes": True,
     "width": 2, "color": {"opacity": 0.7}, "confidence": "INFERRED"},
    # SFTF_QEM: Tomo_SFTF 가 베이스, PFTF_alpha 와는 문제·기준이 다른 인접/대비 관계다.
    {"from": "Tomo_SFTF", "to": "SFTF_QEM",
     "label": "accelerates", "title": "accelerates [INFERRED]", "dashes": True,
     "width": 2, "color": {"opacity": 0.7}, "confidence": "INFERRED"},
    {"from": "PFTF_alpha", "to": "SFTF_QEM",
     "label": "adjacent",
     "title": "adjacent — 다른 문제(alpha 값 선택 vs 목적함수 보존) [INFERRED]",
     "dashes": True,
     "width": 2, "color": {"opacity": 0.7}, "confidence": "INFERRED"},
    {"from": "Tomo_SFTFSoft", "to": "SFTFSoft_GNN",
     "label": "surrogate", "title": "surrogate [EXTRACTED]", "dashes": True,
     "width": 2, "color": {"opacity": 0.7}, "confidence": "EXTRACTED"},
    {"from": "Tomo_SFTF", "to": "SFTF_DynamicTargetSearch",
     "label": "extends", "title": "extends candidate evaluation [INFERRED]",
     "dashes": True, "width": 2, "color": {"opacity": 0.7},
     "confidence": "INFERRED"},
    {"from": "Tomo_SFTFSoft", "to": "SFTF_DynamicTargetSearch",
     "label": "soft evidence", "title": "soft evidence weighting [INFERRED]",
     "dashes": True, "width": 2, "color": {"opacity": 0.7},
     "confidence": "INFERRED"},
    {"from": "SFTF_Clustering", "to": "SFTF_DynamicTargetSearch",
     "label": "clusters basins", "title": "clusters candidate basins [INFERRED]",
     "dashes": True, "width": 2, "color": {"opacity": 0.7},
     "confidence": "INFERRED"},
    {"from": "SFTF_DynamicTargetSearch", "to": "SFTF_ActiveOverprint",
     "label": "instantiates", "title": "instantiates active-vision overprinting [INFERRED]",
     "dashes": True, "width": 2, "color": {"opacity": 0.7},
     "confidence": "INFERRED"},
    {"from": "Tomo_SFTF", "to": "SFTF_ActiveOverprint",
     "label": "support evidence", "title": "provides support-aware candidate evidence [INFERRED]",
     "dashes": True, "width": 2, "color": {"opacity": 0.7},
     "confidence": "INFERRED"},
    {"from": "SFTF_Clustering", "to": "SFTF_ActiveOverprint",
     "label": "clusters surfaces", "title": "clusters printable surface basins [INFERRED]",
     "dashes": True, "width": 2, "color": {"opacity": 0.7},
     "confidence": "INFERRED"},
    {"from": "SFTF_DrapePrior", "to": "SFTF_ActiveOverprint",
     "label": "garment state", "title": "provides draped garment/contact state for Physical AI overprinting [INFERRED]",
     "dashes": True, "width": 2, "color": {"opacity": 0.7},
     "confidence": "INFERRED"},
    {"from": "Tomo_DiffSupport", "to": "DFSVR_VisCull",
     "label": "accelerates", "title": "accelerates — scales [INFERRED]",
     "dashes": True, "width": 3, "color": {"opacity": 0.7},
     "confidence": "INFERRED", "_rel": "accelerates", "_detail": "scales",
     "_tentative": False},
    {"from": "PFTF_VisCull_kDop", "to": "DFSVR_VisCull",
     "label": "provides", "title": "provides — conservative gate [INFERRED]",
     "dashes": True, "width": 3, "color": {"opacity": 0.7},
     "confidence": "INFERRED", "_rel": "provides",
     "_detail": "conservative gate", "_tentative": False},
    {"from": "SFTF_QEM", "to": "SFTFSoft_GNN",
     "label": "validates", "title": "validates — audits tessellation [INFERRED]",
     "dashes": True, "width": 3, "color": {"opacity": 0.7},
     "confidence": "INFERRED", "_rel": "validates",
     "_detail": "audits tessellation", "_tentative": False},
    {"from": "PFTF_AsymTensor", "to": "SFTFSoft_GNN",
     "label": "provides", "title": "provides — directed messages [INFERRED]",
     "dashes": True, "width": 3, "color": {"opacity": 0.7},
     "confidence": "INFERRED", "_rel": "provides",
     "_detail": "directed messages", "_tentative": False},
    {"from": "SFTFSoft_GNN", "to": "SFTFSoft_GNN_DFSVR",
     "label": "provides", "title": "provides — proposes top-K [INFERRED]",
     "dashes": True, "width": 3, "color": {"opacity": 0.7},
     "confidence": "INFERRED", "_rel": "provides",
     "_detail": "proposes top-K", "_tentative": False},
    {"from": "Tomo_DiffSupport", "to": "SFTFSoft_GNN_DFSVR",
     "label": "provides", "title": "provides — refines [INFERRED]",
     "dashes": True, "width": 3, "color": {"opacity": 0.7},
     "confidence": "INFERRED", "_rel": "provides", "_detail": "refines",
     "_tentative": True},
]

def _reclassify_raw_nodes(match):
    nodes = json.loads(match.group(1))
    for todo_node in TODO_NODES:
        if not any(node.get("id") == todo_node["id"] for node in nodes):
            nodes.append(todo_node.copy())
    for node in nodes:
        node_id = node.get("id")
        node["_intro"] = INTRODUCTIONS.get(node_id, "")
        node["_graph_role"] = GRAPH_ROLES.get(node_id, "")
        node["_finding_candidate"] = FINDING_CANDIDATES.get(node_id, "")
        label = node.get("label") or node_id
        for old_candidate in FINDING_CANDIDATES.values():
            label = re.sub(r"\n" + re.escape(old_candidate) + r"$", "", label)
        candidate = FINDING_CANDIDATES.get(node_id)
        if candidate:
            label += "\n" + candidate
            node["borderWidth"] = max(4, node.get("borderWidth") or 1)
            shape_properties = dict(node.get("shapeProperties") or {})
            shape_properties["borderDashes"] = [6, 4]
            node["shapeProperties"] = shape_properties
        node["label"] = label
        suffix = CAPTION_SUFFIXES.get(node_id)
        if suffix:
            label = re.sub(r"\n\[draft\]$", "", node.get("label") or node["id"])
            node["label"] = label + "\n" + suffix
        title = NODE_TITLES.get(node_id)
        if title:
            node["title"] = title
        source_file = NODE_SOURCE_FILES.get(node_id)
        if source_file:
            node["source_file"] = source_file
        project_path = PROJECT_PATHS.get(node_id)
        if project_path:
            node["_project_path"] = project_path
        else:
            node.pop("_project_path", None)
        q = quality_lookup.get(node_id)
        if q:
            # Historical hover titles sometimes embed the previous grade.
            # Keep them synchronized with QUALITY_ROWS on every regeneration.
            node["title"] = re.sub(
                r" — [상중하上中下]:", f" — {q[0]}:", node.get("title") or node["id"], count=1
            )
            node["community"] = QUALITY_COMMUNITY_IDS[q[0]]
            node["community_name"] = q[0]
            node["_quality"] = q[0]
            node["_quality_note"] = q[1]
            if q[0] == "ToDo":
                node["font"] = {**(node.get("font") or {}), "bold": False}
            node_border = "#000000" if q[0] == "ToDo" else GRADE_COLORS[q[0]]
            node_color = dict(node.get("color") or {})
            highlight = dict(node_color.get("highlight") or {})
            node_color.update(
                background=GRADE_COLORS[q[0]],
                border=node_border,
                highlight={
                    **highlight,
                    "background": GRADE_COLORS[q[0]],
                    "border": node_border,
                },
            )
            node["color"] = node_color
    return "const RAW_NODES = " + json.dumps(nodes, ensure_ascii=False) + ";"

s, nraw = re.subn(r"const RAW_NODES = (\[.*?\]);", _reclassify_raw_nodes,
                  s, count=1, flags=re.S)

def _inject_todo_edges(match):
    edges = json.loads(match.group(1))
    existing = {(edge.get("from"), edge.get("to")) for edge in edges}
    for edge in TODO_EDGES:
        if (edge["from"], edge["to"]) not in existing:
            edges.append(edge)
    # The graph snapshot can drop a project while an older edge survives in
    # the exported edge list.  Never emit an edge whose endpoint is absent;
    # vis-network otherwise reports an initialization error and may render no
    # graph at all.
    node_match = re.search(r"const RAW_NODES = (\[.*?\]);", s, flags=re.S)
    if node_match:
        node_ids = {str(node["id"]) for node in json.loads(node_match.group(1))}
        edges = [
            edge for edge in edges
            if str(edge.get("from")) in node_ids and str(edge.get("to")) in node_ids
        ]
    return "const RAW_EDGES = " + json.dumps(edges, ensure_ascii=False) + ";"

s, nedge = re.subn(r"const RAW_EDGES = (\[.*?\]);", _inject_todo_edges,
                   s, count=1, flags=re.S)
quality_html_rows = "".join(
    f'<tr><td>{html_escape(label)}</td>'
    f'<td><span class="quality-grade" style="background:{GRADE_COLORS[grade]};color:{"#333333" if grade == "ToDo" else "#ffffff"}">{grade}</span></td>'
    f'<td>{html_escape(note)}</td></tr>'
    for _id, label, grade, note in QUALITY_ROWS
)
quality_html = (
    '<div id="quality-board">'
    # QUALITY_ROWS 를 손댈 때 이 날짜도 같이 올린다.  하드코딩이라, 갱신하지 않으면
    # 재생성이 graph.html 의 최신 날짜를 조용히 되돌린다(2026-07-27 에 실제로 발생).
    '<h3>최근 논문 quality (2026-08-07)</h3>'
    '<div class="quality-meta">상=상위권 심사 대응 가능 · 중=핵심 gate 잔여 · 하=PoC/원고 미완료 · ToDo=새 설계선/검증 전<br>'
    '단순 VSCode 커밋은 제외 · 등급 정본: KIT_sodi/mindmap.html 백업(2026-07-30) · 세부 근거: Papers/투고가능성_재평가_2026-08-06.md</div>'
    '<table><thead><tr><th>프로젝트</th><th>등급</th><th>핵심 근거</th></tr></thead>'
    f'<tbody>{quality_html_rows}</tbody></table></div>'
)

s = s.replace("</style>", QUALITY_CSS + "\n</style>", 1)
s = re.sub(r"\n?/\* GRAPH3D_NAV_BEGIN \*/.*?/\* GRAPH3D_NAV_END \*/\n?", "", s, flags=re.S)
s = re.sub(r'\n?<button id="open-3d-btn".*?</button>\n?', "\n", s, count=1, flags=re.S)
GRAPH3D_NAV_CSS = """/* GRAPH3D_NAV_BEGIN */
  #open-3d-btn { position: fixed; top: 12px; left: 12px; z-index: 50; padding: 7px 11px; border: 1px solid #9aa8bd; border-radius: 7px; background: rgba(255,255,255,0.94); color: #243047; font: 600 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; box-shadow: 0 5px 16px rgba(32,48,76,0.14); cursor: pointer; }
  #open-3d-btn:hover { border-color: #4E79A7; background: #ffffff; }
  #open-3d-btn:focus-visible { outline: 2px solid rgba(78,121,167,0.38); outline-offset: 2px; }
/* GRAPH3D_NAV_END */"""
s = s.replace(
    "</style>",
    "\n" + GRAPH3D_NAV_CSS + "\n</style>",
    1,
)
s = s.replace(
    "<body>",
    '<body>\n<button id="open-3d-btn" type="button" title="WebGL 3D 그래프로 전환" '
    'onclick="window.location.href=\'./graph3d.html\'">3D WebGL 보기</button>',
    1,
)
s = s.replace('<div id="legend-wrap">', quality_html + '\n<div id="legend-wrap">', 1)

# Communities is now the paper-quality axis; rebuild its legend from the
# complete snapshot rather than retaining the historical research-track labels.
quality_legend = [
    {
        "cid": QUALITY_COMMUNITY_IDS[grade],
        "color": GRADE_COLORS[grade],
        "label": grade,
        "count": sum(1 for _id, _label, g, _note in QUALITY_ROWS if g == grade),
    }
    for grade in ("상", "중", "하", "ToDo")
]
def _quality_legend(_match):
    return "const LEGEND = " + json.dumps(quality_legend, ensure_ascii=False) + ";"

s, nleg = re.subn(r"const LEGEND = (\[.*?\]);", _quality_legend, s, count=1, flags=re.S)

# Keep the sidebar summary consistent with the quality-only graph.
raw_nodes_for_stats = json.loads(re.search(r"const RAW_NODES = (\[.*?\]);", s, flags=re.S).group(1))
raw_edges_for_stats = json.loads(re.search(r"const RAW_EDGES = (\[.*?\]);", s, flags=re.S).group(1))

# A graph export can add a project before a hand-tuned POS entry exists.  Do
# not leave those nodes at the origin with physics disabled: give only the
# missing IDs a deterministic outer-ring position and preserve every manual
# coordinate above.
position_map = dict(POS)
missing_position_ids = [
    str(node["id"])
    for node in raw_nodes_for_stats
    if str(node["id"]) not in position_map
]
if missing_position_ids:
    radius = 850
    count = len(missing_position_ids)
    for index, node_id in enumerate(missing_position_ids):
        angle = (2 * math.pi * index) / count
        position_map[node_id] = (
            round(radius * math.cos(angle)),
            round(radius * math.sin(angle)),
        )
node_ids_for_hyperedges = {str(node["id"]) for node in raw_nodes_for_stats}
hyperedges_for_graph = []
for hyperedge in HYPEREDGES:
    members = [
        str(node_id)
        for node_id in hyperedge.get("nodes", [])
        if str(node_id) in node_ids_for_hyperedges
    ]
    if len(members) >= 2:
        hyperedges_for_graph.append({**hyperedge, "nodes": members})
stats_text = (
    f"{len(raw_nodes_for_stats)} nodes &middot; {len(raw_edges_for_stats)} edges "
    f"&middot; {len(quality_legend) + (1 if preserve_extended_quality else 0)} communities"
)
s, nstats = re.subn(r"\d+ nodes &middot; \d+ edges &middot; \d+ communities",
                    stats_text, s, count=1)

pos_js = "const POS = " + json.dumps(
    {k: {"x": v[0], "y": v[1]} for k, v in position_map.items()}, ensure_ascii=False) + ";"
s, n1 = re.subn(r"const POS = \{.*?\};", lambda _m: pos_js, s, count=1,
                flags=re.S)
hyper_js = "const hyperedges = " + json.dumps(hyperedges_for_graph, ensure_ascii=False) + ";"
s, n2 = re.subn(r"const hyperedges = \[.*?\];", lambda _m: hyper_js, s, count=1,
                flags=re.S)
s, n3 = re.subn(r"<title>.*?</title>",
                "<title>SFTF/PFTF — 발견 1~6 + BASE/METHOD/PIPELINE</title>", s, count=1,
                flags=re.S)

# Broad role overlays go behind the finding regions, while BASE stays at the
# very back. Array order itself is retained because FINDING_DEPS uses indices.
s = s.replace(
    "const abase = a.kind === 'base' ? 0 : 1;\n"
    "        const bbase = b.kind === 'base' ? 0 : 1;\n"
    "        return abase - bbase;",
    "const rank = h => h.kind === 'base' ? 0 : (h.kind === 'role' ? 1 : 2);\n"
    "        return rank(a) - rank(b);",
    1,
)

# 노드 캡션은 22px에서 15% 축소한 18.7px로 고정한다.
# 영역(hull) 라벨은 기존 20px를 유지한다 (멱등: 값 고정 치환).
s, nf1 = re.subn(r"size: Math\.max\(\d+(?:\.\d+)?, \(n\.font && n\.font\.size\) \|\| 0\)",
                 "size: Math.max(18.7, (n.font && n.font.size) || 0)", s)
s, nf2 = re.subn(r"ctx\.font = 'bold \d+px sans-serif';",
                 "ctx.font = 'bold 20px sans-serif';", s)
assert nf1 >= 1 and nf2 >= 1, (nf1, nf2)
# Node captions remain regular-weight; hyperedge region labels keep their own
# bold styling below.
s = s.replace(
    "font: { ...(n.font || {}), size: Math.max(18.7, (n.font && n.font.size) || 0) }, title:",
    "font: { ...(n.font || {}), size: Math.max(18.7, (n.font && n.font.size) || 0), bold: false }, title:",
)

# hull 라벨 위치: 중심(cy-5) → convex hull 중앙-상단 바깥 (노드 캡션 겹침 회피)
# 멱등: 이전 주입을 먼저 원형으로 되돌린 뒤 다시 적용 (const 중복 선언 방지)
s = s.replace("const topY = Math.min.apply(null, expanded.map(p => p.y)); "
              "ctx.fillText(h.label, cx, topY - 16);",
              "ctx.fillText(h.label, cx, cy - 5);")
s, nf3 = re.subn(
    r"ctx\.fillText\(h\.label, cx, [^)]+\);",
    "const topY = Math.min.apply(null, expanded.map(p => p.y)); "
    "ctx.fillText(h.label, cx, topY - 16);", s)
if nf3 == 0:
    # The deployed 37-node baseline already uses the newer left/top label
    # placement, so no conversion is required.
    nf3 = len(re.findall(r"ctx\.fillText\(h\.label, leftX, topY\);", s))
if nf3 == 0:
    # Newer exports draw the measured label position through the shared
    # helper, which receives the label at the local origin.
    nf3 = len(re.findall(r"ctx\.fillText\(h\.label, 0, 0\);", s))
assert nf3 >= 1, nf3

# ------------------------------------------------- 프린터 친화 라이트 테마 (2026-07-19d)
# 배경 white, 기존 white 요소(베이스 노드·하이라이트·legend 점)는 #c8c8c8.
# 단, 노드 캡션 글자(white)는 white 배경에서 판독 불가라 #333333으로 진하게
# (사용자 규칙의 유일한 의도적 예외 — 회색을 원하면 아래 #333333을 #c8c8c8로).
s = re.sub(r'("font": \{"size": \d+, "color": )"(?:#ffffff|#333333)"',
           lambda m: m.group(1) + '"#333333"', s)
s = s.replace('"#ffffff"', '"#c8c8c8"')            # 노드 fill·highlight·legend 점
CSS_LIGHT = [
    ("body { background: #0f0f1a; color: #e0e0e0;",
     "body { background: #ffffff; color: #333333;"),
    ("#sidebar { width: 280px; background: #1a1a2e;",
     "#sidebar { width: 280px; background: #f5f5f5;"),
    ("#search { width: 100%; background: #0f0f1a; border: 1px solid #3a3a5e; color: #e0e0e0;",
     "#search { width: 100%; background: #ffffff; border: 1px solid #bbbbbb; color: #333333;"),
    ("border: 1.5px solid #3a3a5e; border-radius: 3px; background: #0f0f1a;",
     "border: 1.5px solid #bbbbbb; border-radius: 3px; background: #ffffff;"),
    ("#2a2a4e", "#dddddd"),                        # 패널 경계·hover 배경
    ("color: #aaa;", "color: #777777;"),
    ("color: #ccc;", "color: #444444;"),
    ("color: #e0e0e0;", "color: #222222;"),
    ("color: #555;", "color: #999999;"),
    ("border-left: 3px solid #333;", "border-left: 3px solid #cccccc;"),
]
for old, new in CSS_LIGHT:
    s = s.replace(old, new)

# Keep every text element in the right-side Node Info panel three pixels larger
# than the graphify defaults. These replacements are idempotent and also apply
# when graph.html is freshly exported before this layout pass runs.
s = s.replace("#info-panel h3 { font-size: 13px;", "#info-panel h3 { font-size: 16px;", 1)
s = s.replace("#info-content { font-size: 13px;", "#info-content { font-size: 16px;", 1)
s = s.replace(".neighbor-link { display: block; padding: 2px 6px; margin: 2px 0; border-radius: 3px; cursor: pointer; font-size: 12px;", ".neighbor-link { display: block; padding: 2px 6px; margin: 2px 0; border-radius: 3px; cursor: pointer; font-size: 15px;", 1)
s = s.replace("border-radius:3px;background:#fff;color:#333;font-size:10px;", "border-radius:3px;background:#fff;color:#333;font-size:13px;", 1)
s = s.replace('style="margin-top:8px;color:#aaa;font-size:11px"', 'style="margin-top:8px;color:#aaa;font-size:14px"', 1)
# Enlarge every text element from the paper-quality board through the bottom of
# the sidebar by the same three pixels. The quality board itself is generated
# from QUALITY_CSS above; these rules cover the graphify-owned sections below it.
s = s.replace("#legend-wrap h3 { font-size: 13px;", "#legend-wrap h3 { font-size: 16px;", 1)
s = s.replace(".legend-item { display: flex; align-items: center; gap: 8px; padding: 4px 0; cursor: pointer; border-radius: 4px; font-size: 12px;", ".legend-item { display: flex; align-items: center; gap: 8px; padding: 4px 0; cursor: pointer; border-radius: 4px; font-size: 15px;", 1)
s = s.replace(".legend-count { color: #666; font-size: 11px;", ".legend-count { color: #666; font-size: 14px;", 1)
s = s.replace("#stats { padding: 10px 14px; border-top: 1px solid #dddddd; font-size: 11px;", "#stats { padding: 10px 14px; border-top: 1px solid #dddddd; font-size: 14px;", 1)
s = s.replace("#legend-controls label { display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 12px;", "#legend-controls label { display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 15px;", 1)
s = s.replace('style="font-size:11px;padding:2px 8px;', 'style="font-size:14px;padding:2px 8px;')
# ToDo is intentionally white in both the node and its legend badge; restore
# it after the generic light-theme replacement of historical white elements.
s = s.replace('style="background:#c8c8c8;color:#333333">ToDo',
              'style="background:#ffffff;color:#333333">ToDo')
s = re.sub(r'("cid": 4, "color": )"#c8c8c8"',
           r'\1"#ffffff"', s)
s = s.replace(
    '"id": "PFTF_DrapePrior_VisCull_kDop", "label": "PFTF_DrapePrior_VisCull_kDop", '
    '"color": {"background": "#c8c8c8", "border": "#000000", '
    '"highlight": {"background": "#c8c8c8", "border": "#000000"}}',
    '"id": "PFTF_DrapePrior_VisCull_kDop", "label": "PFTF_DrapePrior_VisCull_kDop", '
    '"color": {"background": "#ffffff", "border": "#000000", '
    '"highlight": {"background": "#ffffff", "border": "#000000"}}',
)
s = s.replace(
    '"id": "PFTF_ResearchOptimize", "label": "PFTF_ResearchOptimize", '
    '"color": {"background": "#c8c8c8", "border": "#000000", '
    '"highlight": {"background": "#c8c8c8", "border": "#000000"}}',
    '"id": "PFTF_ResearchOptimize", "label": "PFTF_ResearchOptimize", '
    '"color": {"background": "#ffffff", "border": "#000000", '
    '"highlight": {"background": "#ffffff", "border": "#000000"}}',
)
s = s.replace(
    '"id": "SFTF_DynamicTargetSearch", "label": "SFTF_DynamicTargetSearch", '
    '"color": {"background": "#c8c8c8", "border": "#000000", '
    '"highlight": {"background": "#c8c8c8", "border": "#000000"}}',
    '"id": "SFTF_DynamicTargetSearch", "label": "SFTF_DynamicTargetSearch", '
    '"color": {"background": "#ffffff", "border": "#000000", '
    '"highlight": {"background": "#ffffff", "border": "#000000"}}',
)
s = s.replace(
    '"id": "PFTF_alpha", "label": "PFTF_alpha", '
    '"color": {"background": "#c8c8c8", "border": "#000000", '
    '"highlight": {"background": "#c8c8c8", "border": "#000000"}}',
    '"id": "PFTF_alpha", "label": "PFTF_alpha", '
    '"color": {"background": "#ffffff", "border": "#000000", '
    '"highlight": {"background": "#ffffff", "border": "#000000"}}',
)
s = s.replace(
    '"id": "SFTF_QEM", "label": "SFTF_QEM", '
    '"color": {"background": "#c8c8c8", "border": "#000000", '
    '"highlight": {"background": "#c8c8c8", "border": "#000000"}}',
    '"id": "SFTF_QEM", "label": "SFTF_QEM", '
    '"color": {"background": "#ffffff", "border": "#000000", '
    '"highlight": {"background": "#ffffff", "border": "#000000"}}',
)

# -------------------------------------------- 엣지 방향·화살촉 정정 (2026-07-19e)
# 재평가 노트 의존성 트리 기준 parent→child 로 통일. 볼트 노트의 위키링크
# 방향(자식 노트가 부모를 링크)이 그대로 엣지가 되어 두 건이 반대로 저장돼
# 있었음: PDN→ThermalChip, kDop→Compression 이 정방향.
s = s.replace('{"from": "SFTF_ThermalChip", "to": "SFTF_PDNElectric"',
              '{"from": "SFTF_PDNElectric", "to": "SFTF_ThermalChip"')
s = s.replace('{"from": "PFTF_Compression", "to": "PFTF_VisCull_kDop"',
              '{"from": "PFTF_VisCull_kDop", "to": "PFTF_Compression"')
# 화살촉이 절반 크기(0.5)라 잘 안 보였음 → 정상 크기로
s = s.replace("arrows: { to: { enabled: true, scaleFactor: 0.5 } }",
              "arrows: { to: { enabled: true, scaleFactor: 1.0 } }")

# Apply the paper-quality snapshot to graph nodes.  Quality is the only
# community/classification axis shown to the user.
quality_js = (
    "// QUALITY_BOARD_BEGIN\n"
    "const QUALITY_ROWS = " + quality_rows_json + ";\n"
    "const QUALITY_BY_ID = Object.fromEntries(QUALITY_ROWS.map(q => [q.id, q]));\n"
    "const QUALITY_COLORS = " + json.dumps(GRADE_COLORS, ensure_ascii=False) + ";\n"
    "const QUALITY_COMMUNITY_IDS = " + json.dumps(QUALITY_COMMUNITY_IDS, ensure_ascii=False) + ";\n"
    "RAW_NODES.forEach(n => {\n"
    "  const q = QUALITY_BY_ID[n.id];\n"
    "  if (!q) return;\n"
     "  const c = QUALITY_COLORS[q.grade] || '#999999';\n"
     "  const border = q.grade === 'ToDo' ? '#000000' : c;\n"
    "  n._quality = q.grade; n._quality_note = q.note;\n"
    "  n.community = QUALITY_COMMUNITY_IDS[q.grade]; n.community_name = q.grade;\n"
     "  n.color = Object.assign({}, n.color, {background: c, border: border, highlight: Object.assign({}, (n.color && n.color.highlight) || {}, {background: c, border: border})});\n"
    "  n.title = (n.title || n.label) + ' — quality ' + q.grade + ': ' + q.note;\n"
    "});\n"
    "// QUALITY_BOARD_END"
)
if preserve_extended_quality:
    quality_js, n_quality_rows = re.subn(
        r"const QUALITY_ROWS = (\[.*?\]);",
        lambda _m: "const QUALITY_ROWS = " + quality_rows_json + ";",
        existing_quality_js,
        count=1,
        flags=re.S,
    )
    assert n_quality_rows == 1
# `syncQualityBoard()` reads QUALITY_BY_ID immediately.  The historical HTML
# keeps that helper just before the position-storage marker, so inserting at
# the marker would place QUALITY_BY_ID after its first use and stop all graph
# initialization with a ReferenceError.  Anchor before the helper when it is
# present; retain the old marker only as a fallback for a fresh export.
quality_anchor = "function syncQualityBoard()"
if quality_anchor in s:
    s = s.replace(quality_anchor, quality_js + "\n" + quality_anchor, 1)
else:
    s = s.replace("// 드래그 위치 저장소:",
                  quality_js + "\n// 드래그 위치 저장소:", 1)
quality_decl_pos = s.find("const QUALITY_BY_ID =")
quality_sync_pos = s.find("syncQualityBoard();")
assert quality_decl_pos >= 0
assert quality_sync_pos < 0 or quality_decl_pos < quality_sync_pos, (
    quality_decl_pos,
    quality_sync_pos,
)

# Carry the full extended metadata into the node dataset.  Normalize the whole
# generated metadata line so repeated runs cannot silently drop fields when a
# newer deployed graph contains project-role or Closed-node annotations.
s, n_node_meta = re.subn(
    r"  _source_file: n\.source_file, _file_type: n\.file_type,.*?\n",
    "  _source_file: n.source_file, _file_type: n.file_type, "
    "_project_role: n._project_role, _display_label: n._display_label || n.label, "
    "_graph_role: n._graph_role, _finding_candidate: n._finding_candidate, "
    "_closed: n._closed, _degree: n.degree, _project_path: n._project_path, "
    "_intro: INDUSTRIAL_EFFECTS[n.id] || n._intro, _quality: n._quality, "
    "_quality_note: n._quality_note, _bottleneck: n._bottleneck,\n",
    s,
    count=1,
)
assert n_node_meta == 1
s = re.sub(
    r"\n\s*<div class=\"field\">(?:Quality|Paper quality):[^\n]*\n"
    r"\s*\$\{n\._quality_note[^\n]*\}",
    "",
    s,
)
s = re.sub(
    r"\n\s*<div class=\"field\">(?:Quality|Paper quality):[^\n]*",
    "",
    s,
)
s = s.replace('<div class="field">Community: ${esc(n._community_name)}</div>',
              '<div class="field">Quality: <b>${esc(n._quality || \'—\')}</b></div>\n'
              '    ${n._quality_note ? `<div class="field" style="font-size:14px;color:#666">${esc(n._quality_note)}</div>` : \'\'}\n'
              '    <div class="field">Community: ${esc(n._community_name)}</div>',
              1)

# Normalize the inspector labels after the quality field has been inserted.
s = s.replace("Quality: <b>", "Paper quality: <b>", 1)
s = s.replace('    <div class="field">Community: ${esc(n._community_name)}</div>\n', "", 1)

# Replace the historical field labels after the quality field has been inserted.
s = s.replace("<h3>Communities</h3>", "<h3>Paper quality</h3>", 1)
s = s.replace('<div class="field">Community: ${esc(n._community_name)}</div>',
              '<div class="field">Paper quality: ${esc(n._community_name)}</div>',
              1)

# Final inspector normalization: retain exactly one paper-quality field.
s = re.sub(
    r"\n\s*<div class=\"field\">(?:Quality|Paper quality):[^\n]*\n"
    r"\s*\$\{n\._quality_note[^\n]*\}",
    "",
    s,
)
s = re.sub(r"\n\s*<div class=\"field\">(?:Quality|Paper quality):[^\n]*", "", s)
s = re.sub(r"\n\s*<div class=\"field\">Community:[^\n]*", "", s)
_dollar = chr(36)
_backtick = chr(96)
# Remove any earlier introduction interpolation so repeated generation remains
# idempotent.  The inspector stores this as a template-expression line rather
# than a plain HTML line; matching only the inner <div> caused one copy to be
# added on every regeneration.
s = re.sub(
    r"\n\s*\$\{n\._intro \? `[^`]*<div class=\"field\"><b>[^<]*</b>[^`]*` : ''\}",
    "",
    s,
)
_intro_field = (
    "    " + _dollar + "{n._intro ? " + _backtick
    + '<div class="field"><b>소개:</b> '
    + _dollar + "{esc(n._intro)}</div>" + _backtick
    + " : ''}\n"
)
_quality_note_field = (
    "    " + _dollar + "{n._quality_note ? " + _backtick
    + '<div class="field" style="font-size:14px;color:#666">'
    + _dollar + "{esc(n._quality_note)}</div>" + _backtick
    + " : ''}\n"
)
_quality_field = (
    "    <div class=\"field\">Paper quality: <b>"
    + _dollar + "{esc(n._quality || '—')}</b></div>\n"
    + _quality_note_field
)
_role_fields = (
    "    " + _dollar + "{n._graph_role ? " + _backtick
    + '<div class="field">Graph role: <b>'
    + _dollar + "{esc(n._graph_role)}</b></div>" + _backtick
    + " : ''}\n"
    + "    " + _dollar + "{n._finding_candidate ? " + _backtick
    + '<div class="field">Finding candidate: <b>'
    + _dollar + "{esc(n._finding_candidate)}</b></div>" + _backtick
    + " : ''}\n"
)
_source_marker = (
    "    <div class=\"field\">Source: " + _dollar
    + "{esc(n._source_file || '-')}</div>"
)
s = re.sub(r"\n\s*\$\{n\._graph_role \? `[^`]*` : ''\}", "", s)
s = re.sub(r"\n\s*\$\{n\._finding_candidate \? `[^`]*` : ''\}", "", s)
s = s.replace(_source_marker,
              _intro_field + _role_fields + _quality_field + _source_marker, 1)

# Put a small launch button beside each node name.  The project path comes
# from the matching Obsidian project note and is carried through the dataset;
# no shell command is interpolated into the page.
_title_marker = '    <div class="field"><b>${esc(n.label)}</b></div>'
_title_with_vscode = (
    '    <div class="field"><b>${esc(n.label)}</b> '
    '${n._project_path ? `<button type="button" class="vscode-btn" '
    'style="margin-left:8px;padding:2px 6px;border:1px solid #888;'
    'border-radius:3px;background:#fff;color:#333;font-size:13px;'
    'cursor:pointer;vertical-align:middle" '
    'data-vscode-path="${esc(n._project_path)}" '
    'title="Open project in a new VS Code window">VSCODE</button>` : ""}</div>'
)
s = s.replace(_title_marker, _title_with_vscode, 1)

# Use the OS-registered vscode:// handler.  Opening a folder URI is the VS
# Code-supported way to launch that project in a new window from a browser.
vscode_js = r'''// VSCODE_BUTTON_BEGIN
document.addEventListener('click', e => {
  const button = e.target.closest('.vscode-btn');
  if (!button) return;
  e.preventDefault();
  e.stopPropagation();
  const projectPath = button.dataset.vscodePath;
  if (!projectPath) return;
  const normalized = projectPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const uri = 'vscode://file/' + encodeURI(normalized) + '/?windowId=_blank';
  window.open(uri, '_blank', 'noopener');
});
// VSCODE_BUTTON_END'''
s = re.sub(r"\n// VSCODE_BUTTON_BEGIN.*?// VSCODE_BUTTON_END\n?", "\n", s, flags=re.S)
s = s.replace("// Track hovered node — hover detection is more reliable than click params",
              vscode_js + "\n// Track hovered node — hover detection is more reliable than click params", 1)

# 의존성 블록: 기존 블록 제거 후 afterDrawing 핸들러 끝에 삽입 (멱등)
s = re.sub(r"\n// FINDING_DEPS_BEGIN.*?// FINDING_DEPS_END", "", s, flags=re.S)
anchor = "        ctx.restore();\n    });\n});"
assert anchor in s, "afterDrawing anchor not found"
repl = "        ctx.restore();\n    });\n" + DEPS_JS + "\n});"
s, n4 = re.subn(re.escape(anchor), lambda _m: repl, s, count=1)

assert n1 == n2 == n3 == n4 == nleg == nraw == nedge == nstats == 1, (
    n1, n2, n3, n4, nleg, nraw, nedge, nstats
)
missing = [k for k in POS if f'"{k}"' not in s]
for dst in DSTS:
    io.open(dst, "w", encoding="utf-8", newline="").write(s)
print(f"wrote {', '.join(DSTS)} | POS {len(POS)} nodes, "
      f"hulls {len(HYPEREDGES)}, deps 6 | missing ids: {missing}")


# ---------------------------------------------------------------- 자동 배포
# 2026-07-22: graph.html 재생성 시 홈페이지(KIT_sodi)로 자동 복사 — 별도
# 복사 단계 불요. Windows 절대경로 → (원격 세션 VM) 상대경로 순서로 시도.
def _deploy_to_homepage():
    import shutil
    from pathlib import Path as _P
    here = _P(__file__).resolve().parent
    cands = [_P(r"D:\OneDrive\Documents\IIS_Home\KIT_sodi"),
             here.parents[1] / "KIT_sodi"]
    for c in cands:
        if (c / "index.html").exists():
            shutil.copyfile(here / "graph.html", c / "graph.html")
            print(f"deployed -> {c / 'graph.html'} (git commit/push는 수동)")
            return
    print("deploy 대상(KIT_sodi) 미발견 — 복사 생략")

if os.environ.get("SFTF_SKIP_GRAPH_DEPLOY") == "1":
    print("deploy skipped: SFTF_SKIP_GRAPH_DEPLOY=1")
else:
    _deploy_to_homepage()
