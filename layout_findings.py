"""graph.html -> graph_발견.html : 발견 1~6 기준 재배치 (LAYOUT_RULES.md 보완).

원본 graph.html(등급 색·의존 엣지·hull 렌더러)은 건드리지 않고, 주입된
POS(고정 좌표)와 hyperedges(영역 hull)만 발견 기준으로 교체해 새 파일을 쓴다.

  - 색 = 투고 등급 (원본 유지)
  - 위치·영역 = 사다리 레이스의 발견 1~6
    (정본: PFTF_dev/experiments/{groundnode,tensorline,conservative}_ladder/)
  - 발견 4·5·6은 같은 보수성 레이스의 세 판정이라 한 영역으로 묶음
  - 발견 3 옆에 대조 지대(1차가 사는 곳)를 붙여 소거/생존을 인접 대비

실행:  python layout_findings.py            (KIT_sodi 저장소에서)

2026-07-19b: 발견 영역 간 **의존성 화살표** 추가 (분류표 노트의 DAG).
멱등: 같은 파일에 재실행해도 안전(마커 블록 교체). graph.html과
graph_발견.html 두 파일을 동일 내용으로 갱신한다.
"""
import io
import copy
import json
import math
import os
import re
import sys
from pathlib import Path
from html import escape as html_escape

HERE = Path(__file__).resolve().parent
SRC = HERE / "graph.html"
# graph.html is the canonical deployed graph.  graph_발견.html is a frozen
# findings view and is intentionally not touched by new-project onboarding.
DSTS = [HERE / "graph.html"]
# 2026-09-18: PFTF_ResearchOptimize 를 걷어냈다(사용자 판단 — 더 필요하지 않다).
# graph.html 의 RAW_NODES 는 보존되는 스냅샷이라 정의를 지우는 것만으로는 노드가
# 남으므로, 여기에 적어야 재생성이 노드와 그 엣지를 함께 걷어낸다.
HIDDEN_NODE_IDS = {"PFTF_subMarine", "PFTF_Terrain", "PFTF_ResearchOptimize"}

# Project notes are the single source of truth for local VS Code paths.  The
# graph node id normally matches the Obsidian project-note stem, so the button
# stays correct when a project is moved without hard-coding 30+ paths here.
VAULT_ROOT = Path(os.environ.get("CFMS_RESEARCH_VAULT", r"D:\cfms-research-vault"))
PROJECTS_DIR = VAULT_ROOT / "Projects"

def _strip_yaml_comment(value):
    """볼트 frontmatter 의 path: 값에서 따옴표와 뒤따르는 YAML 주석을 걷어낸다.

    2026-09-10: 주석을 남겨 두면 경로에 문장이 통째로 섞여 들어가 그래프의
    「VSCode 로 열기」 버튼이 열 수 없는 경로를 받는다.  SFTF_DrapePrior 에서
    실제로 그렇게 됐다 — `...\\SFTF_DrapePrior_dev'   # 2026-08-19 이동. ...` 이
    _project_path 에 그대로 박혀 있었다.  경로에 공백+`#` 가 들어가는 일은 없다.
    """
    value = value.strip()
    quoted = re.match(r"^(['\"])(.*?)\1", value)
    if quoted:
        return quoted.group(2).strip()
    return re.split(r"[ \t]#", value, maxsplit=1)[0].strip()


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
        match = re.search(r"(?m)^path:[ \t]*(.+?)[ \t\r]*$", text)
        if match:
            paths[note.stem] = _strip_yaml_comment(match.group(1))
    return paths

PROJECT_PATHS = _load_project_paths()


def _strip_inline_comment(value):
    """`3   # 논문 완성도 …` 처럼 값 뒤에 붙는 YAML 주석을 걷어낸다.

    `_strip_yaml_comment` 는 경로용이라 줄 전체가 주석일 때(`# 논문 완성도 …`)
    그 문장을 값으로 돌려준다.  완성도는 숫자뿐이므로 여기서는 `#` 부터 잘라
    빈 문자열을 돌려주고, 그 빈 값이 「다음 줄부터 트랙별 중첩 맵」 신호가 된다.
    """
    return re.sub(r"(?:^|[ \t])#.*$", "", value).strip()


def _load_paper_completeness():
    """볼트 frontmatter 의 `paper_completeness` 를 노드 id 기준 지도로 모은다.

    1=완성도 높음 … 10=낮음 이며, 3D 뷰(graph3d.html)의 z 축이 이 값을 쓴다.
    한 노트에 논문이 둘인 트랙 노트(cfmsAutoPlace·Tomo_Shell2026)는 중첩 맵이라
    `노트_트랙` 키로 펴서 담는다 — 그래프의 노드 id 가 그 꼴이다
    (cfmsAutoPlace_IJCST).  판정 규칙의 정본은 볼트의 프로젝트현황 대시보드다.
    """
    scores = {}
    if not PROJECTS_DIR.is_dir():
        return scores
    for note in PROJECTS_DIR.glob("*.md"):
        try:
            lines = note.read_text(encoding="utf-8").splitlines()
        except OSError:
            continue
        for index, line in enumerate(lines):
            head = re.match(r"^paper_completeness:[ \t]*(.*)$", line)
            if not head:
                continue
            inline = _strip_inline_comment(head.group(1))
            if inline:
                if re.fullmatch(r"\d+", inline):
                    scores[note.stem] = int(inline)
                break
            for nested in lines[index + 1:]:
                track = re.match(r"^[ \t]+([A-Za-z0-9_]+):[ \t]*(.*)$", nested)
                if not track:
                    break
                value = _strip_inline_comment(track.group(2))
                if re.fullmatch(r"\d+", value):
                    scores[f"{note.stem}_{track.group(1)}"] = int(value)
            break
    return scores

PAPER_COMPLETENESS = _load_paper_completeness()


def _load_note_stages():
    """볼트 frontmatter 의 `stage:` 를 노트 이름 기준으로 모은다.

    통합 단계 어휘(published inprint accepted revision submitted draft undecided
    blocked cancelled idea)이며 정본은 볼트 `scripts/lib/stage.mjs` 다.  graph.html 은
    이 값으로 노드를 파이로 그린다 — **채운 정도가 투고 진도이고 색은 논문 등급**이다.
    표(research_outputs)가 살아 있으면 그쪽 값이 이기고, 여기 값은 오프라인 씨앗이다.
    """
    stages = {}
    if not PROJECTS_DIR.is_dir():
        return stages
    for note in PROJECTS_DIR.glob("*.md"):
        try:
            lines = note.read_text(encoding="utf-8").splitlines()
        except OSError:
            continue
        for line in lines:
            head = re.match(r"^stage:[ \t]*(.*)$", line)
            if not head:
                continue
            value = _strip_inline_comment(head.group(1)).strip().strip("\"'")
            if value:
                stages[note.stem] = value
            break
    return stages


NOTE_STAGES = _load_note_stages()


def _load_coauthor_candidates():
    """볼트 frontmatter 의 `coauthor_candidate:` 를 노트 이름 기준으로 모은다.

    2026-09-16: 공저자가 없는 프로젝트 가운데 교내 교수를 공저자로 붙일 후보다
    (볼트 Dashboards/cfms_cowork_KIT.md, 맨 앞이 1순위).  **확정이 아니라 제안**이므로
    훌(HYPEREDGES)에는 넣지 않고 노드 정보의 「공저 후보」 한 줄로만 보인다.  확정되면
    볼트가 coauthors 로 옮기고 이 필드를 지우므로 여기서도 자연히 빠진다.
    """
    candidates = {}
    if not PROJECTS_DIR.is_dir():
        return candidates
    for note in PROJECTS_DIR.glob("*.md"):
        try:
            lines = note.read_text(encoding="utf-8").splitlines()
        except OSError:
            continue
        for line in lines:
            head = re.match(r"^coauthor_candidate:[ \t]*(.*)$", line)
            if not head:
                continue
            value = _strip_inline_comment(head.group(1)).strip().strip("\"'")
            if value:
                candidates[note.stem] = value
            break
    return candidates


COAUTHOR_CANDIDATES = _load_coauthor_candidates()

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
    # 2026-09-20 볼트 동기화. 옛 문구(여각 규약 오류 정정·천장 ρ=+0.754·코퍼스 50메쉬)는
    # 2026-08-21 에 주 기여가 양성 2건으로 교체되기 전의 것이었다.
    "SFTF_QEM": "SFTF_QEM [draft] — 상: 주 기여 양성 2건(슬라이서 대비 ρ=+0.905, "
                "배향당 1/103 비용), v3.0 개정 완료. Tomo_SFTF accept 대기.",
    "SFTF_DynamicTargetSearch": "SFTF_DynamicTargetSearch — ToDo: "
                                "Net1 G0 topology·provenance와 15개 테스트 완료; "
                                "LeakDB scenario localization·baseline 전",
    "SFTF_ActiveOverprint": "SFTF_ActiveOverprint — ToDo: "
                            "surface·next-view 계약 테스트 8개 완료; "
                            "Physical AI 의복 시뮬레이션 직접 통합선; "
                            "RGB-D replay·controlled textile print 전",
    "SFTF_UrbanTraffic": "SFTF_UrbanTraffic — 하: 한국재난정보학회논문집(KOSDI) 투고 완료(2026-09-16, 김우석 교수 측 투고). 도시 교통 가역차로 방향장 응용",
    "PFTF_GFiberCT": "PFTF_GFiberCT — 중: positive two-layer draft; "
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
    # 2026-08-31: 사용자가 graph.html에서 조정한 34-node 배치를 정본으로 승격.
    "Tomo_SFTF": (710, 190),
    "Tomo_SFTFSoft": (450, 20),
    "SFTF_Clustering": (450, 400),
    "PFTF": (710, 390),
    "SFTF_Composite": (940, 620),
    "SFTF_InjMold": (860, -150),
    # 2026-09-20: 방대석 교수님 훌을 세우면서 PFTF_Mold 가 그래프에 처음 들어왔다.
    # SFTF_InjMold 와 같은 왼쪽 끝 열(x=-360), 한 칸 위인 y=190 행이다 — 그 행은
    # SFTFSoft_GNN_DFSVR·SFTF_QEM·Tomo_SFTF 가 쓰는 줄이라 격자에 맞는다.
    "PFTF_Mold": (980, -150),
    "PFTF_Compression": (210, 620),
    "Tomo_DFSVR": (210, 20),
    "PFTF_VisCull_kDop": (210, 390),
    "SFTF_SewerPOC": (1150, 190),
    "SFTFSoft_GNN": (210, 190),
    "SFTF_DrapePrior": (-30, 570),
    "PFTF_AsymTensor": (710, 620),
    "PFTF_DrapePrior_VisCull_kDop": (-30, 390),
    "PFTF_GFiberCT": (710, 800),
    "SFTF_QEM": (450, 190),
    "SFTF_DynamicTargetSearch": (620, -300),
    "DFSVR_VisCull": (-30, 20),
    "SFTFSoft_GNN_DFSVR": (-30, 190),
    "SFTF_ActiveOverprint": (450, -150),
    "ColdOndol": (940, 390),
    "ColdOndol_Positioning": (1150, 390),
    "cfmsCIPC": (-30, 1050),
    # 2026-09-11: TSE_SEM 을 논문 3편 트랙으로 나눴다.  ① 은 옛 TSE_SEM 자리를 잇고
    # ②·③ 은 SFTF_Composite → ① 방향을 따라 위쪽으로 한 칸씩 이어진다.
    "TSE_SEM1_Bezier": (1150, 620),
    "TSE_SEM2_Tensor": (1150, 800),
    "TSE_SEM3_AutoTune": (1150, 1020),
    "SFTF_HeatMethod": (940, 800),
    "cfmsPINNDrape": (-30, 900),
    "cfmsDrape": (-360, 1020),
    "cfmsMiindo": (-170, 770),
    "cfmsPINNCAD": (210, 1020),
    "SFTFSoft_DFSVR": (210, -150),
    # Restored from the last pre-archive graph snapshot.
    "SFTF_UrbanTraffic": (940, 100),
    "cfmsAutoSew": (210, 1200),
    "cfmsAutoPlace_IJCST": (-30, 1330),
    "cfmsAutoPlace_JCDE": (-30, 1190),
    # 2026-09-01: ToDo DrapeSCAN onboarding from the Obsidian project note.
    "cfmsDrapeSCAN": (210, 840),
    # 2026-09-18: 93196cb 가 graph.html 에만 넣어 둔 노드를 여기로 들여왔다. 파일 씨앗이
    # 이 노드를 몰라서 전체 재생성이 좌표를 날려 버리고 있었다.
    "cfmsDrapeInverse": (-30, 720),
    # 2026-09-07: graph.html 의 큐레이션 노드(SFTF_HOLONOMY_NODE)와 짝을 이룬다.
    "SFTF_Holonomy": (940, 1020),
    # 2026-09-10: graph.html 의 큐레이션 노드(HIPDETECT_NODE)와 짝을 이룬다.
    "HIPDetect": (450, 1020),
    # 2026-09-14: graph.html 의 큐레이션 노드(CFMSDISPERSITY_NODE)와 짝을 이룬다.
    # 이미 나온 논문인데 그래프에 없었다. 자리는 은종현 교수님 묶음 오른쪽의 빈 곳이다.
    "cfmsDispersity": (710, 1020),
    # 2026-09-14: graph.html 의 큐레이션 노드(TOMO_SHELL_NODES)와 짝을 이룬다.
    # 포트폴리오 표에는 두 트랙이 있는데 그래프에는 노드가 없었다(사용자 지적).
    # 자리는 이희란 교수님 묶음 왼쪽 아래의 빈 곳이다 — 파일 씨앗과 표(graph_positions)
    # 양쪽에서 가장 한산한 자리를 골랐다.
    "TSE_TomoSh4": (450, 620),
    "TSE_TomoSh5": (450, 840),
    # 2026-09-19: 전석진 교수님 후보 둘. 김우석 묶음(y<=470) 아래, 은종현 묶음(x<=914)
    # 오른쪽의 빈 자리다. 드래그 격자(10)에 맞춰 두었다 — 웹에서 옮기면 표가 정본이 된다.
    "Jeon_DLPOrient": (720, -60),
    # 2026-09-19: 볼트에서 Jeon_DispersityProp → cfmsDispersityProp 로 개명되고 공저
    # 후보도 전석진 → 은종현 으로 바뀌었다. 자리도 은종현 묶음 안으로 옮긴다 —
    # 부모 cfmsDispersity 바로 아래이고 그 묶음의 격자 간격(180)과 같은 칸이다.
    "cfmsDispersityProp": (710, 1200),
}

# 노드 id 가 노트 이름에서 규칙으로 나오지 않는 트랙 노드 → (볼트 노트 stem,
# paper_completeness 중첩 맵의 키).  한 노트가 논문 여럿을 담을 때 생기는 짝이다.
#
# 이 표가 없으면 두 가지가 조용히 빠진다 — 노드의 **투고 단계**(VAULT_STAGES: 파이의
# 채운 정도와 지름이 여기서 나온다)와 **논문 완성도**(graph3d 의 z 축).  2026-09-14 에
# SEM 트랙 이름을 TSE_SEM_Bezier → TSE_SEM1_Bezier 로 바꾸면서 실제로 그렇게 됐다:
# 「노트이름_」 접두어 규칙이 더는 맞지 않아 세 노드가 단계를 잃고 가장 작은 원이 됐다.
# cfmsAutoPlace_IJCST 처럼 접두어 규칙으로 풀리는 짝은 여기 적을 필요가 없다.
TRACK_NOTES = {
    "TSE_SEM1_Bezier": ("TSE_SEM", "Bezier"),
    "TSE_SEM2_Tensor": ("TSE_SEM", "Tensor"),
    "TSE_SEM3_AutoTune": ("TSE_SEM", "AutoTune"),
    "TSE_TomoSh4": ("Tomo_Shell2026", "TomoSh4"),
    "TSE_TomoSh5": ("Tomo_Shell2026", "TomoSh5"),
}

# 트랙 노드의 **단계만** 부모 노트와 다를 때 적는다.  트랙 노드는 부모 노트의 `stage:` 를
# 물려받는 것이 원칙이고(아래 stage_by_id), 그 원칙이 맞지 않는 예외가 여기 모인다.
#
# 2026-09-14: TSE_SEM3_AutoTune 이 보류로 돌아왔다.  부모 노트 TSE_SEM.md 의 `stage:` 는
# `draft` 인데 그것은 ①② 의 상태다 — 노트 하나가 논문 셋을 담고 있어서, 노트의 단계를
# 보류로 바꾸면 멀쩡한 ①② 까지 투고 불가로 그려진다.  그래서 ③ 만 여기서 덮는다.
# 사유는 게이트도 게재지도 아니고 **일정**이다(사용자 지시: 투고 시점 2027-03-01 이후).
# 볼트 쪽 짝은 Dashboards/프로젝트현황.md 의 분리트랙 `투고상태` 이고, 그쪽도 같은 날
# 같은 값으로 고쳤다 — 포트폴리오 표와 그래프가 갈라지지 않게 둘을 함께 본다.
TRACK_STAGES = {
    "TSE_SEM3_AutoTune": "blocked",
    # 2026-09-14: TomoSh5 만 나갔다(한국섬유공학회지 26M-09-036). 부모 노트
    # Tomo_Shell2026.md 의 stage 는 draft 인데 그것은 아직 안 나간 TomoSh4 쪽이다 —
    # 한 노트가 논문 둘을 담고 있어서 노트의 단계 하나로는 둘을 다 못 적는다.
    # 볼트 쪽 짝은 그 노트의 paper_stage 중첩 맵이다.
    "TSE_TomoSh5": "submitted",
}

# 2026-09-14: 발견1~6 · METHOD · PIPELINE · 도메인 오버레이를 걷어냈다.
# 그 틀은 SFTF → PFTF 일반화가 잘 풀렸을 때를 가정하고 그린 것인데, PFTF 논문 진도가
# 그렇게 가지 않았다. 화면에 남겨 두면 없는 구조를 있다고 말하게 되므로 사용자 판단으로
# 내렸다. BASE 만 남기고, 실제로 굴러가는 축인 **공저자**로 다시 묶는다.
#
# 구성원 정본은 볼트 Projects/*.md 의 coauthors / coauthor 다(부모 노트를 쓰는 트랙 노드는
# 그 값을 물려받는다). 여기 적힌 목록은 그 스냅샷이고, 볼트에서 공저자가 바뀌면 이 목록도
# 같이 고친다 — 등급·단계와 달리 hyperedge 는 아직 발행 경로가 없다.
HYPEREDGES = [
    # 2026-09-14: BASE(네 방법론 기반)를 내리고 주제 훌 하나를 세웠다. BASE 는 PFTF 를
    # 기둥으로 세운 묶음이었는데 그 일반화가 아직 논문이 아니라서, 화면에서 자리만 차지하고
    # 다른 훌을 가로막았다(사용자 판단). 대신 실제로 굴러가는 주제인 3D 프린팅·지지구조를
    # 묶는다. **PFTF 노드는 넣지 않는다** — 논문 가능성이 아직 없다는 같은 이유다.
    #
    # 구성원은 「출력·지지대·슬라이서·빌드 방향」이 연구 주장의 축인 노드들이다. 판단이
    # 갈리는 둘은 빼 두었다: SFTF_InjMold(사출 성형이라 적층이 아니다),
    # SFTF_Composite·PFTF_GFiberCT(복합재 적층·CT 계측 쪽이고 이미 은종현 교수님 훌이다).
    {"label": "3D프린팅",
     "kind": "topic",
     "nodes": ["Tomo_SFTF", "Tomo_SFTFSoft", "Tomo_DFSVR", "SFTF_Clustering",
               "SFTFSoft_GNN", "SFTFSoft_DFSVR", "SFTFSoft_GNN_DFSVR",
               "DFSVR_VisCull", "SFTF_QEM", "SFTF_ActiveOverprint"],
     "color": "#0f766e", "labelColor": "#115e59",
     "fillAlpha": 0.06, "strokeAlpha": 0.85, "labelAlpha": 0.95,
     "lineWidth": 3, "dash": [12, 6], "scale": 1.14},
    # 2026-09-20: SFTF_Clustering 을 뺐다(사용자 지시). 이희란 교수는 여전히 공저자지만
    # (볼트 coauthors: [이희란, 강지언]), 그 노드는 3D프린팅 훌의 구성원이기도 해서
    # 두 훌에 동시에 들어 있었다 — 유일한 겹침이었고 이희란 훌이 그 노드를 잡으려고
    # 위로 길게 뻗어 모양을 버렸다. 공저 관계는 노드 정보의 공저자 줄에 그대로 남는다.
    {"label": "이희란 교수님",
     "kind": "coauthor",
     "nodes": ["PFTF_Compression", "cfmsAutoSew",
               "cfmsAutoPlace_IJCST", "cfmsAutoPlace_JCDE", "cfmsDrapeSCAN",
               "HIPDetect", "TSE_TomoSh4", "TSE_TomoSh5"],
     "color": "#7c3aed", "labelColor": "#6d28d9",
     "fillAlpha": 0.035, "strokeAlpha": 0.80, "labelAlpha": 0.95,
     "lineWidth": 2.5, "dash": [8, 5], "scale": 1.10},
    # 2026-09-14: TSE_SEM3_AutoTune 을 뺐다.  ③ 만 **설인환 단독 저자**로 바뀌었다
    # (볼트 TSE_SEM.md 2026-09-14 「③ 단독 저자 전환」 — authors_ko·authors_en·corresp 를
    # 고치고 고지 절의 저자 기여 항목을 지웠다).  사사도 ①② 의 NRF 가 아니라 금오공대
    # 대학 연구과제비(2026-2027)다.  ①② 는 세 저자(대학원생·설인환†·은종현†) 그대로라
    # 훌에 남는다 — 이 훌은 공저자 관계를 그리는 것이므로 셋을 한 묶음으로 둘 수 없다.
    # 2026-09-16: PFTF_AsymTensor 가 들어왔다.  은종현 교수가 공저자로 확정됐다(볼트
    # PFTF_AsymTensor.md coauthors, 저자 대학원생·설인환†·은종현†) — 주 결론이 부정으로 남은
    # 원고의 축을 복합재 순서 뒤집기 실측으로 갈아 끼우는 자리다.  좌표는 사용자가 이미 웹에서
    # 이 묶음 옆(669, 836)으로 끌어 두었고, 파일 씨앗은 pull-graph-positions 로 따라왔다.
    # 2026-09-19: cfmsDispersityProp 가 들어왔다. 볼트에서 Jeon_DispersityProp 로 서 있던
    # 것이 개명되고 공저 후보가 전석진 → **은종현**으로 바뀌었다(노트 coauthor_candidate:
    # 「부모 논문 TSE 63(4) 248-257 의 공동 교신저자」). 그래서 전석진 훌에서 이리로 옮긴다.
    {"label": "은종현 교수님",
     "kind": "coauthor",
     "nodes": ["SFTF_Composite", "PFTF_GFiberCT", "TSE_SEM1_Bezier",
               "TSE_SEM2_Tensor", "SFTF_HeatMethod",
               "SFTF_Holonomy", "cfmsDispersity", "PFTF_AsymTensor",
               "cfmsDispersityProp"],
     "color": "#db2777", "labelColor": "#be185d",
     "fillAlpha": 0.035, "strokeAlpha": 0.80, "labelAlpha": 0.95,
     "lineWidth": 2.5, "dash": [8, 5], "scale": 1.10},
    # ColdOndol_Positioning 은 2026-09-14 에 볼트 노트에 coauthor 가 적히면서 들어왔다
    # (ColdOndol 과 같은 저장소·같은 draft/ 이고 공저자도 같다).
    {"label": "김우석 교수님",
     "kind": "coauthor",
     "nodes": ["SFTF_SewerPOC", "ColdOndol", "ColdOndol_Positioning",
               "SFTF_UrbanTraffic"],
     "color": "#65a30d", "labelColor": "#4d7c0f",
     "fillAlpha": 0.035, "strokeAlpha": 0.80, "labelAlpha": 0.95,
     "lineWidth": 2.5, "dash": [8, 5], "scale": 1.10},
    # 2026-09-19: 사용자 지시로 세운다. ⚠️ 앞의 넷과 성격이 다르다 — 두 노트가 가진 것은
    # `coauthor_candidate` 이지 `coauthors` 가 아니다(공저 **후보**, 확정이 아니다).
    # _load_coauthor_candidates 의 규약은 「후보는 훌에 넣지 않고 노드 정보의 한 줄로만
    # 보인다」인데, 사용자가 이 둘만은 묶어 달라고 했으므로 예외로 둔다. 확정되면 볼트가
    # coauthors 로 옮기고 이 예외 표시도 지우면 된다.
    # 2026-09-19 오후: cfmsDispersityProp(옛 Jeon_DispersityProp)가 은종현 훌로 갔다.
    # 「전석진·은종현 순서를 뒤집을지」 기다리던 건이 은종현으로 정해진 결과다. 남은 하나도
    # 제안 자체는 보류 상태다(단기 불가) — 후보는 유지하되 지금 제안하지 않는다.
    {"label": "전석진 교수님",
     "kind": "coauthor",
     "nodes": ["Jeon_DLPOrient"],
     "color": "#b45309", "labelColor": "#92400e",
     "fillAlpha": 0.035, "strokeAlpha": 0.80, "labelAlpha": 0.95,
     "lineWidth": 2.5, "dash": [8, 5], "scale": 1.10},
    # 2026-09-20: 사용자 지시로 세운다. 처음에는 전석진 훌과 같은 「후보」 예외였는데,
    # 같은 날 볼트가 두 노트를 coauthors: [방대석] 으로 **확정**해서 예외가 아니게 됐다
    # (Rules/논문생성규칙.md 의 C 그룹 — 저자 「대학원생(방대석 교수 지도학생) · 설인환 ·
    # 방대석†」). 이제 앞의 넷과 성격이 같다.
    # 둘을 묶는 실질 축은 **금형**이다 — 사출 성형 설계(SFTF_InjMold)와 수축 보정(PFTF_Mold).
    # 그래서 SFTF_InjMold 를 3D프린팅 훌에서 뺀 사유(적층이 아니다)와 어긋나지 않는다.
    {"label": "방대석 교수님",
     "kind": "coauthor",
     "nodes": ["PFTF_Mold", "SFTF_InjMold"],
     "color": "#0284c7", "labelColor": "#0369a1",
     "fillAlpha": 0.035, "strokeAlpha": 0.80, "labelAlpha": 0.95,
     "lineWidth": 2.5, "dash": [8, 5], "scale": 1.10},
]
HYPEREDGES = [
    {**h, "nodes": [node_id for node_id in h["nodes"] if node_id not in HIDDEN_NODE_IDS]}
    for h in HYPEREDGES
]

# 투고 뒤 등급 (2026-09-14, 사용자 규칙)
#   원고가 저널에 나간 뒤의 등급은 **투고한 저널의 급**으로 본다 — SCIE 上 · Scopus 中 ·
#   국내 저널 下. 투고 전 등급은 「이 원고가 어디까지 갈 수 있나」는 전망이지만, 나간 뒤에는
#   그 전망이 실제 선택으로 확정되기 때문이다. 정본은 볼트 노트의 grade 이고 여기 표는 그
#   스냅샷이다.
#
# Paper-quality snapshot synchronized from the Obsidian Projects frontmatter.
# ``등급 없음`` is distinct from ToDo: it marks repositories that are useful
# infrastructure/integration records but are not paper-quality candidates.
QUALITY_ROWS = [
    ("Tomo_SFTF", "Tomo_SFTF", "상", "TDP v2.1·외부 60-mesh 감사·budget–complexity·PiAM 연속성; **2026-09-17 수정본 제출 완료(3DP-2026-0119.R1)** — 1차 리뷰 지적 2건(속도 기준 불일치·후보 영역 미입증)에 전향 확증 70메쉬로 대응(SFTF 단독 not confirmed, 혼합 30메쉬 기준 충족)하고 그대로 실었다. 심사 결과 대기, 본문 4,740/4,000 단어가 남은 위험"),
    ("Tomo_SFTFSoft", "Tomo_SFTFSoft", "상", "TDP v2.1·현대/legacy Cura·receiver 반례·조건부 first-hit 수렴"),
    ("SFTFSoft_GNN", "SFTFSoft_GNN", "상", "3,817 mesh·held-out·Cura 재라벨·Prusa 교차검증"),
    ("SFTF_Clustering", "SFTF_Clustering", "상", "SFTFCluster 계열 TDP 원고·cross-slicer/partition 자산; 독립성 게이트 잔여"),
    ("PFTF", "PFTF", "중", "PFTF v0.9 이론·family synthesis; 삼형제 V2/V3/V4 synchronization TODO"),
    ("SFTF_DrapePrior", "SFTF_DrapePrior", "하", "**2026-09-17 한국섬유공학회지 게재확정(26M-08-029)** — 투고(2026-08-14) → 수정후 게재가(2026-09-03) → Rev1 당일 제출 → 게재확정. 드레이프 품질 평가의 재현성(노이즈 플로어·예산 일치·솔버 간 이득 부호 반전). 권/호·쪽·DOI 는 미정"),
    ("SFTF_Composite", "SFTF_Composite", "상", "한·영문 완성·191 tests·R9–R13 사전등록/독립감사; R11 합성 held-out 음성, 공식 CAD·물리 검증 잔여"),
    ("SFTF_InjMold", "SFTF_InjMold", "중", "B24·exact integration·set-cover·B-rep·blind protocol; 원고 조립 잔여"),
    ("Tomo_DiffSupport", "Tomo_DiffSupport", "중", "claim–evidence matrix·JAX gradient·fail-closed; utility/print gate 미실행"),
    ("PFTF_AsymTensor", "PFTF_AsymTensor", "중", "사전 동료심사 2라운드(2026-09-13)로 인증·성분 귀속 철회, 주 결론이 부정만 남아 ⛔ 주 기여 축 교체 전 투고 보류(RPJ). 축 교체 후보는 복합재 순서 뒤집기(은종현 교수 실측, 09-15 보완안). **2026-09-16 은종현 교수 공저 확정** — 저자 대학원생·설인환†·은종현†"),
    ("PFTF_Compression", "PFTF_Compression", "중", "역설계·orthotropic contact·friction·held-out 원고; 임상 cohort 잔여"),
    ("PFTF_Mold", "PFTF_Mold", "중", "IBOF 통일·사독 1차 대응 완료. melt-front 완화를 구현해 수반 경사를 1.0e-8 로 검증. held-out 은 사독 지적에 따라 '크기 전이 시험'으로 축소했다(옛 '일반화 0%' 는 철회). 투고 저널 미정"),
    ("PFTF_FXShock", "PFTF_FXShock", "중", "frozen/event holdout/falsification; n=8·실제 시장/인과 근거 제한"),
    ("PFTF_VisCull_kDop", "PFTF_VisCull_kDop", "중", "G1–G22 검증선·원고 2편(en/kr); 음성 timing 결과가 2번째 CPU 모델에서 복제(사전등록 R0–R3 통과); GPU contact 미구현"),
    ("SFTF_ThermalChip", "SFTF_ThermalChip", "중", "재현 가능한 PoC 한·영 원고·그림; 외부 칩/열해석 검증 부족"),
    ("SFTF_SewerPOC", "SFTF_SewerPOC", "하", "수식 매핑·AVE·PoC 원고; 실제 관망/수리모형 검증 부족"),
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
    ("SFTF_UrbanTraffic", "SFTF_UrbanTraffic", "하", "**2026-09-16 한국재난정보학회논문집(KOSDI) 투고 완료** — 김우석 교수 측 투고(제1저자 유인근·교신 김우석, 설인환 3저자), 실측 VDS 예측·경보 응용 원고(hwpx). 원고번호 대기. D-SFTF 방법론 원고(M2 기각·합성 시간화)는 이 경로로 대체됐다"),
    ("SFTF_WarehouseAGV", "SFTF_WarehouseAGV", "하", "DES 초기 검증·proxy 실패·정책 비교 잔여; 실창고 trace·원고 부족"),
    ("PFTF_AssetShock", "PFTF_AssetShock", "하", "38 benchmark/provider rehearsal; draft 원고와 실제 provider outcome 없음"),
    ("PFTF_DrapePrior_VisCull_kDop", "PFTF_DrapePrior_VisCull_kDop", "등급 없음", "통합 evidence 저장소; 독립 논문 등급 미적용"),
    ("PFTF_GFiberCT", "PFTF_GFiberCT", "중", "합성 144건·NCF 유리섬유 복합재 X선 CT 17쌍(원저자 분할) 사전등록 검증, B5/M1 대비 사례별 144/144·17/17 승, 위상 오차 0; **한국복합재료학회지**(2026-09-16 변경, 그전 한국섬유공학회지) 국문 투고본 초고; PFTF/local-SPD 우월성 제외"),
    # 2026-09-20 볼트 동기화(grade_note). 2026-08-21 에 주 기여가 양성 2건으로 바뀌면서
    # ⛔ 긍정 효과 규칙 위반이 해소됐고 원고 개정도 같은 날 끝났다.
    ("SFTF_QEM", "SFTF_QEM", "상", "주 기여를 양성 2건으로 교체 완료 — 슬라이서 대비 ρ=+0.905(천장 +0.754 초과)·배향당 1/103 비용, ε-정지가 형상별 손튜닝 대체. v3.0 원고 개정 완료, CuraEngine 28메쉬×62방향 외부 교차검증, 테스트 151개. SFTF 텐서 구조는 무기여라 신규성 주장 없음"),
    ("SFTF_DynamicTargetSearch", "SFTF_DynamicTargetSearch", "ToDo",
     "Net1 G0 topology·provenance, 11 nodes·12 candidate pipes, 총 15 tests; LeakDB scenario localization·baseline 전"),
    ("SFTF_ActiveOverprint", "SFTF_ActiveOverprint", "ToDo",
     "surface·next-view 계약 8 tests, Physical AI 의복 시뮬레이션 직접 통합선; RGB-D replay·controlled textile overprint 전"),
    ("DFSVR_VisCull", "DFSVR_VisCull", "ToDo",
     "DFSVR exact first-hit용 conservative BVH scalability 설계선; 값·gradient parity·거짓음성 0·end-to-end utility gate 전"),
    ("SFTFSoft_GNN_DFSVR", "SFTFSoft_GNN_DFSVR", "ToDo",
     "profile-conditioned GNN proposer → DFSVR first-hit refiner → held-out slicer verifier; frozen budget-matched A–E benchmark 전"),
    ("ColdOndol", "ColdOndol", "하", "온돌 냉방 중 숨은 에어컨 검출 한계"),
    ("ColdOndol_Positioning", "ColdOndol_Positioning", "하", "부하·이슬점 기반 냉방 배분 최적화"),
    # 2026-09-14 中 → 下: 투고 뒤에는 투고한 저널의 등급으로 본다(아래 「투고 뒤 등급」).
    ("cfmsCIPC", "cfmsCIPC", "하", "의복 충돌 강건성 벤치마크; 한국섬유공학회지 투고 완료 (2026-08-21, 26M-08-030)"),
    # 2026-09-11: TSE_SEM 한 저장소의 논문 3편 트랙을 mindmap.html 의 SEM1·SEM2·SEM3 노드와
    # 같은 이름으로 나눈다.  등급은 볼트 노트(TSE_SEM.md, grade 하)와 마인드맵 kind(low)를
    # 따르고, 근거는 노트의 「논문 트랙」·「투고 일정」 절을 요약한 것이다.
    ("TSE_SEM1_Bezier", "TSE_SEM1_Bezier", "하",
     "① 방향 리프팅+3차 Bézier 관 재구성; 실제 SEM IoU 0.814·팬텀 12종 배향 오차 2.3–11.6°, 원고 완성, **한국복합재료학회지**(2026-09-16 변경)로 은종현 교수 측이 투고(박명진 학생 학회 양식 변환, 금주) — 저자·COI·수치 대조 잔여"),
    ("TSE_SEM2_Tensor", "TSE_SEM2_Tensor", "하",
     "② 이진화 없는 배향 텐서장, 하부층 포함; 저배율 SEM 9장 observed fraction 0.86–0.93, 원고 완성, ① 접수 후 companion 인용으로 **한국복합재료학회지**(2026-09-16 변경, ①과 같은 학회지)에 은종현 교수 측이 투고"),
    ("TSE_SEM3_AutoTune", "TSE_SEM3_AutoTune", "하",
     "③ 증거 제약 기반 자동 파라미터 선택; 게이트 C1~C4 전부 처리(2026-09-14), 사전 등록한 확인 실험은 불통과여서 부정 결과·경계 설정 논문으로 주장이 좁아졌다. 투고처 한국섬유공학회지 확정. **설인환 단독 저자**·금오공대 대학 연구과제비(2026-2027)로 ①② 와 저자·사사가 갈렸고, 투고 시점이 2027-03-01 이후로 정해져 그때까지 보류(일정 사유)"),
    ("SFTF_HeatMethod", "SFTF_HeatMethod", "중", "열전달 기반 복합재 설계 연구선"),
    # 2026-09-07: SFTF_Holonomy 논문 트랙 편입.  graph.html 의 큐레이션 노드는
    # RAW_NODES 밖에 있어도 등급 행은 여기서 나가야 재생성 뒤에 살아남는다.
    ("SFTF_Holonomy", "SFTF_Holonomy", "상",
     "전단각 항등식 논문 트랙; 적합 0개로 반구 실측 29점 MAE 0.57°, 원고 4종+표제지 완비. 앞 편 SFTF_HeatMethod 투고가 선행 게이트"),
    ("cfmsPINNDrape", "cfmsPINNDrape", "하", "PINN 기반 드레이프 실험"),
    ("cfmsDrape", "cfmsDrape", "등급 없음", "드레이프 엔진 기반 저장소; 독립 논문 등급 미적용"),
    ("cfmsMiindo", "cfmsMiindo", "등급 없음", "의복 CAD·드레이프 모노레포; 독립 논문 등급 미적용"),
    ("cfmsPINNCAD", "cfmsPINNCAD", "하", "PINN 기반 의복 CAD 연구선"),
    # 2026-09-10: cfmsPINNCAD 의 계측기 쪽 결과가 독립 논문 HIPDetect 로 갈라졌다.
    # graph.html 의 큐레이션 노드는 RAW_NODES 밖에 있어도 등급 행은 여기서 나가야 한다.
    ("HIPDetect", "HIPDetect", "중",
     "엉덩이높이 기준점 논문 트랙; 평탄 구간 중앙 추정량이 LOSO 잔차 RMS 1.285 → 0.358 cm (9명 중 8명, 부호검정 p 0.0195), IJCST 원고 3종·그림 5개·커버레터 완비, 미투고. held-out 0건·N=10 한 조사가 남은 심사 위험"),
    # 2026-09-14: 이미 게재된 논문(TSE 63(4) 248-257). 그래프에 노드가 없어 새로 넣었다.
    ("cfmsDispersity", "cfmsDispersity", "하",
     "게재 완료 — Textile Science and Engineering 63(4), 248-257 (2026), DOI 10.12772/TSE.2026.63.248; 정적 kNN 반발에너지 분산도 지표"),
    # 2026-09-14: 한 저장소(Tomo_Shell2026)의 미발표 두 편. 발표본 TomoSh1~3(한국섬유
    # 공학회지 2025, 62권)은 그래프 밖에 있고, 이 둘이 그 사슬을 잇는다.
    ("TSE_TomoSh4", "TSE_TomoSh4", "하",
     "분할 트랙 — 이진 법선 패널티를 연속 가중으로 바꿔 점-뼈대 거리 분할의 파편화를 줄인다; 한국섬유공학회지 투고본 완성. 동시 투고 계획이었으나 TomoSh5 가 먼저 나가(26M-09-036) **익명 companion 인용 방향이 뒤집혔다** — 이 원고가 그 번호를 받아 적고 투고한다"),
    ("TSE_TomoSh5", "TSE_TomoSh5", "하",
     "계측 트랙 — 허위 둘레선을 기각하고 실패를 격리해 계측 실패가 사용자에게 드러나게 한다; **2026-09-14 한국섬유공학회지 투고 완료(원고번호 26M-09-036)**, 심사 결과 대기"),
    ("SFTFSoft_DFSVR", "SFTFSoft_DFSVR", "중", "SFTFSoft와 DFSVR 결합 연구선"),
    ("Tomo_DFSVR", "Tomo_DFSVR", "중", "미분 가능한 지지 구조 계산 연구선"),
    ("cfmsAutoSew", "cfmsAutoSew", "하", "패턴 봉제 대응 자동화 연구선"),
    ("cfmsAutoPlace_IJCST", "cfmsAutoPlace_IJCST", "중", "IJCST 패턴 논문 트랙; 대칭·골선 사례연구 원고 및 전수 분석 완료, 검증 집합 확대 잔여"),
    ("cfmsAutoPlace_JCDE", "cfmsAutoPlace_JCDE", "중", "JCDE CAD 논문 트랙; 시험 분할 100벌·본론 골격 완료, 영문 집필·투고 준비 잔여"),
    ("cfmsDrapeSCAN", "cfmsDrapeSCAN", "ToDo", "Gate 0 GO; 실 스캔 데이터·마네킹 파일럿 전, cfmsDrape/cfmsMiindo 기반 실험 모듈"),
    # 2026-09-18: 볼트 노트가 grade: ToDo 이고 grade_note 도 「실측 회수가 닫히기 전에는
    # quality 판정을 보류한다」다. 곧 정식 프로젝트가 되면 등급을 올리면 된다(사용자).
    # 볼트 Rules §8 대로 grade_note 전문을 옮기지 않고 공개 가능한 한 줄만 싣는다.
    ("cfmsDrapeInverse", "cfmsDrapeInverse", "ToDo", "정적 평형 adjoint 로 기울기를 얻는 원단 물성 역추정선; 합성 검증 완료, 실측 회수 전"),
    # 2026-09-19 신설. 볼트 두 노트 모두 grade: ToDo · stage: undecided 이고, 등급은
    # 실측 대조 전까지 보류다. 볼트 Rules §8 대로 grade_note 전문을 옮기지 않는다.
    ("Jeon_DLPOrient", "Jeon_DLPOrient", "ToDo", "값싼 배향 순위가 실물 출력물의 물성 순위와 맞는지 재는 검증선; 착수 게이트 통과, 실측 대조 전"),
    ("cfmsDispersityProp", "cfmsDispersityProp", "ToDo", "분산도 지표와 실제 물성의 상관을 기존 시편 사진으로 확인하는 검증선; 착수 게이트 통과, 실측 대조 전"),
]
QUALITY_ROWS = [row for row in QUALITY_ROWS if row[0] not in HIDDEN_NODE_IDS]

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
    "PFTF_GFiberCT": "서로 떨어진 두 표면을 먼저 구분해 각 층을 따로 복원함으로써 alpha 방법의 잘못된 연결과 위상 오류를 줄이는 연구다.",
    # 2026-09-20 볼트 동기화(intro). 배포본 RAW_NODES 는 이미 이 값이고 씨앗만 낡아 있었다.
    "SFTF_QEM": "3D 프린팅 배향 순위를 값싸게 매기는 대리모델이, 정답 역할을 하는 두 방법(복셀 solver·프로덕션 슬라이서)이 서로 일치하는 정도보다 더 정확하게 순위를 맞히면서 배향당 100배 싸다는 것을 보인 연구다. 여기에 메쉬를 중앙값 6%만 남겨도 같은 배향을 고르는 자동 정지 규칙이 붙는데, 선행 방법이 형상마다 손으로 맞추던 상수가 필요 없어진다. 여각 규약 오류 정정과 자기 철회 기록은 보충자료로 내렸다.",
    "SFTF_DynamicTargetSearch": "여러 이동 센서의 불완전한 보고를 합쳐 구조가 바뀌는 공간에서 목표물과 다음 탐색 경로를 찾으려는 연구다.",
    "SFTF_ActiveOverprint": "카메라로 기존 물체나 로봇이 고정한 의복의 출력 가능 표면과 다음 관측 위치를 찾고 그 위에 안전하게 작은 형상을 덧출력하려는 연구다.",
    "DFSVR_VisCull": "정확한 지지 구조 계산 전에 안전하게 불필요한 교차 후보를 줄여 DFSVR을 빠르게 하려는 연구선이다.",
    "SFTFSoft_GNN_DFSVR": "GNN이 좋은 출력 방향 후보를 빠르게 고르고 DFSVR이 정밀하게 다듬은 뒤 슬라이서로 확인하는 후속 연구다.",
    "cfmsAutoPlace_IJCST": "IJCST 패턴 관점에서 라벨 없는 의복 패턴의 배치와 검증을 다루는 논문 트랙이다.",
    "cfmsAutoPlace_JCDE": "JCDE CAD 관점에서 패널의 신체 부위와 전역 조립·배치 가설을 다루는 논문 트랙이다.",
    "cfmsDrapeSCAN": "고정형·핸드헬드 스캔 패치를 cfmsDrape 물리와 소프트 대응으로 정합해 인체 표면을 복원하려는 실험선이다.",
    "cfmsDrapeInverse": "드레이프한 원단 사진에서 그 원단의 인장·전단·굽힘 강성을 거꾸로 알아내는 도구다.",
    "Jeon_DLPOrient": "값싸게 매긴 3D 프린팅 배향 순위가 실제로 찍어 본 물건의 물성 순위와 맞는지를 처음으로 실물에 대고 재는 연구다.",
    "cfmsDispersityProp": "현미경 사진으로 잰 입자 분산도 숫자가 실제 물성과 정말로 이어지는지를, 이미 찍혀 있는 남의 시편 사진으로 확인한다.",
    "TSE_SEM1_Bezier": "전자현미경 사진 한 장에서 섬유 한 올 한 올을 매끈한 곡선으로 따라가며 굵기와 방향을 재어내는 방법이다.",
    "TSE_SEM2_Tensor": "섬유를 하나씩 오려내지 않고 사진 전체에서 섬유가 어느 쪽으로 누워 있는지와 겹친 아래층까지 한꺼번에 재는 방법이다.",
    "TSE_SEM3_AutoTune": "정답을 모르는 실제 사진에서도 측정기의 손잡이를 스스로 안전하게 맞추는 방법을 다루는 연구다.",
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
}

FINDING_CANDIDATES = {
    "PFTF_GFiberCT": "발견1?",
    "DFSVR_VisCull": "발견4·5·6?",
}

GRADE_COLORS = {
    "상": "#e02020", "중": "#f28e2b", "하": "#2a78d6", "ToDo": "#ffffff",
    "등급 없음": "#94a3b8",
}

# (2026-09-13: 「최근 논문 quality」 보드를 걷어내면서 그 CSS(QUALITY_CSS)도 지웠다.
#  자세한 사연은 아래 보드 제거 주석에 있다.)

# 영역 간 의존성 (인덱스 = HYPEREDGES 순서: 0=발견1 1=발견2 2=발견3 3=발견3' 4=발견4·5·6)
DEPS_JS = """// FINDING_DEPS_BEGIN — 발견 간 의존성 (분류표 노트의 DAG, layout_findings.py 정본)
// 2026-09-14: 비웠다. 이 화살표들은 발견1~6 영역 **사이**의 의존성이었는데 그 영역을
// 걷어냈다(인덱스로 가리키던 대상이 없다). 공저자 묶음 사이에는 그런 의존이 없다.
// 노드 사이의 개발 목표 엣지와 캡션은 이것과 무관하며 그대로다.
// 아래 그리기 코드는 남겨 둔다 — 나중에 영역 간 관계를 다시 그릴 일이 생기면 여기에 적는다.
const FINDING_DEPS = [];
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
  });
  ctx.restore();
})(ctx);
// 발견 영역 라벨 왼쪽에 사다리 글리프(0차·1차·2차·topology) — 시그니처 다이어그램과 동일 모티프
// 2026-09-14: 영역 캡션 옆 기호(REGION_GLYPHS·_glyph)를 걷어냈다.
// 0차·2차·소거·게이트 같은 발견1~5 의 어휘였는데, 그 표는 **배열 순서(index)** 로 훌에
// 붙는다. 훌을 3D프린팅·공저자로 갈아 끼운 뒤에도 그 자리에 그대로 달려서, 뜻이 없는
// 작은 점·화살표·타원 넷이 새 캡션 옆에 남아 있었다(사용자 보고).
// FINDING_DEPS_END"""

HYPEREDGE_LABEL_HELPERS_JS = r'''// HYPEREDGE_LABEL_HELPERS_BEGIN
function _boxOverlapArea(a, b) {
  const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return w * h;
}
function _nodeLabelBoxes() {
  return RAW_NODES.map(n => {
    const b = network.getBoundingBox(n.id);
    return b && {left: b.left - 6, right: b.right + 6, top: b.top - 6, bottom: b.bottom + 6};
  }).filter(Boolean);
}
function _hyperedgeViewportBounds() {
  const pad = 14;
  const tl = network.DOMtoCanvas({x: pad, y: pad});
  const br = network.DOMtoCanvas({x: Math.max(pad, container.clientWidth - pad),
                                  y: Math.max(pad, container.clientHeight - pad)});
  return {left: Math.min(tl.x, br.x), right: Math.max(tl.x, br.x),
          top: Math.min(tl.y, br.y), bottom: Math.max(tl.y, br.y)};
}
function _drawHyperedgeLabel(ctx, h, polygon, cx, cy, nodeBoxes, placedBoxes, viewport) {
  ctx.font = 'bold 20px sans-serif';
  const textWidth = ctx.measureText(h.label).width;
  const textHeight = 22;
  let best = null;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length < 1) continue;
    const ux = dx / length, uy = dy / length;
    let nx = -uy, ny = ux;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    if (nx * (mx - cx) + ny * (my - cy) < 0) { nx = -nx; ny = -ny; }
    let angle = Math.atan2(dy, dx);
    if (angle > Math.PI / 2) angle -= Math.PI;
    if (angle < -Math.PI / 2) angle += Math.PI;
    const ca = Math.abs(Math.cos(angle)), sa = Math.abs(Math.sin(angle));
    const halfW = (ca * textWidth + sa * textHeight) / 2;
    const halfH = (sa * textWidth + ca * textHeight) / 2;
    // 12px puts the 22px text box about 1px outside the hull edge. Larger
    // offsets are fallbacks only when a node/title collision requires them.
    for (const offset of [12, 18, 26, 38, 52]) {
      const x = mx + nx * offset, y = my + ny * offset;
      const box = {left: x - halfW, right: x + halfW, top: y - halfH, bottom: y + halfH};
      const nodeOverlap = nodeBoxes.reduce((sum, other) => sum + _boxOverlapArea(box, other), 0);
      const labelOverlap = placedBoxes.reduce((sum, other) => sum + _boxOverlapArea(box, other), 0);
      const overflow = Math.max(0, viewport.left - box.left) + Math.max(0, box.right - viewport.right)
                     + Math.max(0, viewport.top - box.top) + Math.max(0, box.bottom - viewport.bottom);
      const shortfall = Math.max(0, textWidth + 18 - length);
      const proximityPenalty = (offset - 12) * 2000;
      const score = nodeOverlap * 1000 + labelOverlap * 200 + overflow * overflow * 1000
                  + shortfall * shortfall * 2 + proximityPenalty;
      if (!best || score < best.score) best = {x, y, angle, box, score};
    }
  }
  if (!best) return;
  placedBoxes.push(best.box);
  ctx.save();
  ctx.translate(best.x, best.y);
  ctx.rotate(best.angle);
  ctx.globalAlpha = h.labelAlpha == null ? 0.8 : h.labelAlpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.strokeText(h.label, 0, 0);
  ctx.fillStyle = h.labelColor || h.color || '#6366f1';
  ctx.fillText(h.label, 0, 0);
  ctx.restore();
}
// HYPEREDGE_LABEL_HELPERS_END'''

EDGE_LABEL_LAYOUT_JS = r'''// EDGE_LABEL_LAYOUT_BEGIN
// Keep every edge caption at the lengthwise midpoint of its edge, turned to
// run along that edge.  Only the perpendicular offset changes, so dragging a
// node can resolve collisions without making the caption look attached to
// either endpoint.
function _edgeLabelOverlapArea(a, b) {
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return width * height;
}

function _edgeLabelViewportBounds() {
  const pad = 12;
  const topLeft = network.DOMtoCanvas({x: pad, y: pad});
  const bottomRight = network.DOMtoCanvas({
    x: Math.max(pad, container.clientWidth - pad),
    y: Math.max(pad, container.clientHeight - pad),
  });
  return {
    left: Math.min(topLeft.x, bottomRight.x),
    right: Math.max(topLeft.x, bottomRight.x),
    top: Math.min(topLeft.y, bottomRight.y),
    bottom: Math.max(topLeft.y, bottomRight.y),
  };
}

function _drawDynamicEdgeLabels(ctx) {
  const visibleEdges = RAW_EDGES.map((edge, id) => ({edge, id, view: edgesDS.get(id)}))
    .filter(({edge, view}) => edge.label && view && view.hidden !== true);
  if (!visibleEdges.length) return;

  const positions = network.getPositions();
  const nodeBoxes = nodesDS.get({filter: node => node.hidden !== true})
    .map(node => network.getBoundingBox(node.id))
    .filter(Boolean)
    .map(box => ({
      left: box.left - 6, right: box.right + 6,
      top: box.top - 6, bottom: box.bottom + 6,
    }));
  const viewport = _edgeLabelViewportBounds();
  const placedBoxes = [];
  const offsets = [0, 18, -18, 34, -34, 52, -52, 72, -72];

  ctx.save();
  ctx.font = '600 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  visibleEdges.forEach(({edge}) => {
    const from = positions[edge.from];
    const to = positions[edge.to];
    if (!from || !to) return;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    if (length < 1) return;

    // The along-edge coordinate is always 0.5 (the exact midpoint).
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    const normalX = -dy / length;
    const normalY = dx / length;
    // Turn the caption along its edge.  Folding the angle into [-90, +90]
    // keeps the text left-to-right: without it, every edge that points
    // leftwards would render its caption upside down.
    let angle = Math.atan2(dy, dx);
    if (angle > Math.PI / 2) angle -= Math.PI;
    if (angle < -Math.PI / 2) angle += Math.PI;
    // The collision box stays axis-aligned, so it has to cover the *rotated*
    // text's extent — a tilted caption is wider and taller than the flat one.
    const textWidth = ctx.measureText(edge.label).width + 10;
    const textHeight = 22;
    const ca = Math.abs(Math.cos(angle)), sa = Math.abs(Math.sin(angle));
    const halfWidth = (ca * textWidth + sa * textHeight) / 2;
    const halfHeight = (sa * textWidth + ca * textHeight) / 2;
    let best = null;

    offsets.forEach(offset => {
      const x = midX + normalX * offset;
      const y = midY + normalY * offset;
      const box = {
        left: x - halfWidth, right: x + halfWidth,
        top: y - halfHeight, bottom: y + halfHeight,
      };
      const nodeOverlap = nodeBoxes.reduce(
        (sum, other) => sum + _edgeLabelOverlapArea(box, other), 0,
      );
      const labelOverlap = placedBoxes.reduce(
        (sum, other) => sum + _edgeLabelOverlapArea(box, other), 0,
      );
      const overflow = Math.max(0, viewport.left - box.left)
        + Math.max(0, box.right - viewport.right)
        + Math.max(0, viewport.top - box.top)
        + Math.max(0, box.bottom - viewport.bottom);
      const score = nodeOverlap * 2000 + labelOverlap * 1200
        + overflow * overflow * 1000 + Math.abs(offset) * 20;
      if (!best || score < best.score) best = {x, y, box, score};
    });

    if (!best) return;
    placedBoxes.push(best.box);
    ctx.save();
    ctx.translate(best.x, best.y);
    ctx.rotate(angle);
    ctx.globalAlpha = 0.96;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,255,255,0.94)';
    ctx.strokeText(edge.label, 0, 0);
    ctx.fillStyle = '#3a3a3a';
    ctx.fillText(edge.label, 0, 0);
    ctx.restore();
  });
  ctx.restore();
}

// vis-network redraws continuously while a node is dragged, so this handler
// recomputes collision-free edge-caption positions on every rendered frame.
network.on('afterDrawing', function(ctx) {
  _drawDynamicEdgeLabels(ctx);
});
// EDGE_LABEL_LAYOUT_END'''

s = io.open(SRC, encoding="utf-8").read()
ORIGINAL_S = s


def _prefer_local_graph_side(text):
    """Keep the current generated snapshot and discard stale merge wrappers."""
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

# '개발 목표' edges start visible (2026-09-10: the checkbox defaults on). The
# checkbox, runtime state, and DataSet must agree on the first frame; otherwise
# vis-network briefly renders the opposite state before the handler runs.
s, nedge_checkbox = re.subn(
    r'(<input type="checkbox" id="edge-cb")(?: checked)?(>[^<]*</label>)',
    r'\1 checked\2', s, count=1,
)
s, nedge_state = re.subn(
    r"let showEdges = (?:true|false);",
    "let showEdges = true;", s, count=1,
)
s, nedge_initial_hidden = re.subn(
    r"(id: i, from: e\.from, to: e\.to,\n)(?:  hidden: (?:true|false),\n)?",
    r"\1  hidden: false,\n", s, count=1,
)
# vis-network's built-in edge labels can overlap endpoint captions.  Keep its
# label payload empty; a custom afterDrawing pass below places each RAW_EDGES
# caption at the edge midpoint and resolves collisions on every redraw.
s, nedge_builtin_label = re.subn(
    r"(const edgesDS = new vis\.DataSet\(RAW_EDGES\.map\(\(e, i\) => \(\{\n"
    r"  id: i, from: e\.from, to: e\.to,\n"
    r"  hidden: false,\n)"
    r"  label: (?:e\.label \|\| ''|''),\n"
    r"(?:  font: \{.*?\},\n)?",
    r"\1  label: '',\n",
    s,
    count=1,
    flags=re.S,
)
# A new canonical deployment must not be overridden by coordinates saved under
# the previous key in localStorage.  Keeping v5 stable also makes regeneration
# idempotent after this one-time reset.
s, npos_store_key = re.subn(
    r"const POS_STORE_KEY = 'graphify_graph_positions_v\d+';",
    "const POS_STORE_KEY = 'graphify_graph_positions_v5';",
    s,
    count=1,
)
assert nedge_checkbox == nedge_state == nedge_initial_hidden == 1, (
    nedge_checkbox, nedge_state, nedge_initial_hidden
)
assert nedge_builtin_label == npos_store_key == 1, (
    nedge_builtin_label, npos_store_key
)

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

def _update_json_object_constant(js, name, updates, remove=()):
    """Update one JSON-valued JavaScript object without rewriting its logic.

    ``remove`` 는 더 이상 없는 노드의 키다 — 갈라진 노드의 옛 id 가 배지·병목 표에
    남아 있어도 화면에는 안 보이지만, 정본에서 걷어내야 재생성이 되돌리지 않는다.
    """
    pattern = rf"const {re.escape(name)} = (\{{.*?\}});"
    def repl(match):
        value = json.loads(match.group(1))
        for key in remove:
            value.pop(key, None)
        value.update(updates)
        return f"const {name} = " + json.dumps(value, ensure_ascii=False) + ";"
    updated, count = re.subn(pattern, repl, js, count=1, flags=re.S)
    assert count == 1, f"{name} constant not found"
    return updated

if preserve_extended_quality:
    s = _update_json_object_constant(
        s,
        "STATUS_BADGES",
        {
            # 2026-09-16: 은종현 교수 메일로 한국복합재료학회지가 됐다(SEM ①과 같은 날, 같은 메일).
            # 09-16 작업에서 SEM 두 트랙만 고치고 이 줄을 빠뜨려, 표(research_outputs)는 이미
            # 볼트 값으로 맞는데 파일 씨앗만 옛 학회지로 남아 있었다(2026-09-17 발견).
            "PFTF_GFiberCT": "한국복합재료학회지,draft",
            # 2026-09-11: TSE_SEM 의 배지 「섬유공학회지,draft」를 세 트랙이 나눠 갖는다.
            # 2026-09-14 아침: ③ 의 보류가 풀렸다 — 게이트 C1~C4 를 전부 처리했고 투고처도
            # 한국섬유공학회지로 확정해, 셋이 같은 배지를 달았다.
            # 2026-09-14 오후: ③ 이 **다시 보류**다.  이번 사유는 앞과 다르다 — 게이트도
            # 게재지도 면수도 아니고 **일정**이다(사용자 지시: 투고 시점 2027-03-01 이후).
            # 게재지는 한국섬유공학회지로 확정된 채 남으므로 배지에 함께 적는다.
            # 2026-09-16: ①② 는 한국복합재료학회지로 간다 — 은종현 교수 메일로 ① 이 먼저, 같은 날
            # 저녁 사용자 지시로 ② 도.  투고는 은종현 교수 담당.  ③ 만 한국섬유공학회지다.
            # 노드 id 의 TSE_ 접두어는 그대로 둔다 — id 개명은 좌표를 조용히 버린다(런북).
            "TSE_SEM1_Bezier": "한국복합재료학회지,draft",
            "TSE_SEM2_Tensor": "한국복합재료학회지,draft",
            "TSE_SEM3_AutoTune": "보류(2027-03-01 이후 투고 · 한국섬유공학회지)",
            # 2026-09-14: TomoSh4·TomoSh5 는 서로를 익명 companion 으로 인용하며 동시 투고한다.
            "TSE_TomoSh4": "한국섬유공학회지,draft",
            # 2026-09-14: ⑤가 먼저 나갔다. 동시 투고 계획은 지켜지지 않았다.
            "TSE_TomoSh5": "한국섬유공학회지 투고 완료 (2026-09-14, 26M-09-036)",
            # 2026-09-16: 김우석 교수 측이 투고했다(제1저자 유인근).  볼트 badge 와 같은 문구다.
            "SFTF_UrbanTraffic": "한국재난정보학회논문집(KOSDI) 투고 완료 (2026-09-16, 김우석 교수 측 투고)",
            # 2026-09-16: TDP 1차 리뷰 도착.  옛 「TDP,submit,08-13」 배지를 갈아 끼운다.
            # 2026-09-17: 하루 만에 수정본을 냈다(3DP-2026-0119.R1).  단계는 revision 그대로다 —
            # 볼트 통합 어휘에서 revision 은 「심사 수정」이고, 재제출 뒤 결과 대기도 그 안에 든다.
            "Tomo_SFTF": "TDP 수정본 제출 완료 (2026-09-17, 3DP-2026-0119.R1)",
            # 2026-09-17: 게재확정.  이 배지는 파일에 이미 있던 값(투고 완료, #51937 번호 할당 중)을
            # 갈아 끼우는 것이라 여기 적어야 한다 — 이 갱신기는 병합이라 적지 않으면 옛 값이 남는다.
            "SFTF_DrapePrior": "TSE 게재확정 (2026-09-17, 원고번호 26M-08-029)",
            # 2026-09-17: 파일의 원고번호가 26M-08-029(SFTF_DrapePrior 것)로 잘못 적혀 있었다.
            # cfmsCIPC 는 26M-08-030 이다(볼트 badge·표 둘 다 그렇게 적는다).
            "cfmsCIPC": "TSE 투고 완료 (2026-08-21, 원고번호 26M-08-030)",
        },
        # 옛 노드 id 도 함께 지운다.  이 갱신기는 **병합**이라 적어 주지 않으면 옛 키가
        # 남아, 그래프에 없는 id 의 배지가 파일에 계속 실린다(2026-09-14 개명 때 실제로 그랬다).
        remove=("TSE_SEM", "TSE_SEM_Bezier", "TSE_SEM_Tensor", "TSE_SEM_AutoTune"),
    )
    existing_quality_js = _update_json_object_constant(
        existing_quality_js,
        "REMAINING_BOTTLENECKS",
        {
            "PFTF_GFiberCT": "A안 보강 중 — 초록의 시편 표기, 일반 복원 대조군(Poisson/Ball Pivoting), 복원 메시 기반 간격 지도; 시편 1개·ρ=4 는 한 패널의 값; PFTF/local-SPD 우월성 주장 금지",
            # 2026-09-11: 볼트 TSE_SEM.md 「투고 일정」의 트랙별 남은 일.
            # 2026-09-16: ①② 는 은종현 교수 측이 한국복합재료학회지에 투고한다(박명진 학생 학회 양식 변환).
            "TSE_SEM1_Bezier": "은종현 교수 측 투고(한국복합재료학회지, 금주) — 2026-09-13 심사의견 미반영 4건을 그대로 둘지 판단, 저자·기여·COI 확정, 제목의 three-dimensional 유지 여부",
            "TSE_SEM2_Tensor": "① 접수 후 은종현 교수 측 투고(한국복합재료학회지) — ① 접수번호로 companion 인용 확정, ①과의 방법·그림·검증 주장 중복 정리",
            # 2026-09-14: C1~C4 가 전부 처리됐고, 같은 날 저자가 **설인환 단독**으로 확정되어
            # 「저자·기여·COI 확정」이 없어졌다(단독 저자라 기여를 나누지 않는다).  대신 투고
            # 시점이 2027-03-01 이후로 정해져 그때까지 보류다 — 남은 일은 순서와 분량뿐이다.
            "TSE_SEM3_AutoTune": "2027-03-01 까지 보류(일정), ② 접수번호로 상호 인용 확정, 23면 → 20면 분량 조절",
            # 볼트 Tomo_Shell2026.md 의 next_gate 를 트랙별로 나눈 것이다.
            "TSE_TomoSh4": "저자 확인 4건(기여 문구·대학원생 이름, Mixamo 라이선스, SizeKorea 약관, 학회지 규정) 반영, docx 육안 확인, TomoSh5(26M-09-036)를 익명 companion 으로 인용하도록 고쳐 투고",
            "TSE_TomoSh5": "심사 결과 대기 (2026-09-14 투고, 원고번호 26M-09-036)",
            # 2026-09-16: 볼트 노트의 bottleneck·next_gate 를 옮긴 것이다(표가 살아 있으면 표 값이 이긴다).
            # 2026-09-17: 수정본을 냈으므로 병목이 「대응」에서 「대기」로 옮겨 갔다.  볼트 값과 같다.
            "Tomo_SFTF": "심사 결과 대기(3DP-2026-0119.R1). accept 가 나오면 Tomo_SFTFSoft·SFTF_Clustering·SFTFSoft_GNN 의 게이트가 열린다",
            # 2026-09-17: 게재확정 뒤 남은 것은 행정이다(볼트 next_gate 를 옮긴 것).
            "SFTF_DrapePrior": "게재확정 후 행정 — 교정쇄 확인·게재료 처리 → 권/호·쪽·DOI 가 나오면 stage 를 published 로 올리고 업적 행 p253 재발행",
            "SFTF_UrbanTraffic": "접수(원고번호) 회신 확인 → 심사 결과 대기; 설인환 몫은 hwpx v1 공저자 검토(방법·수치 정합)",
            "PFTF_AsymTensor": "⛔ 긍정적 효과 규칙 — 주 기여 축 결정(복합재 순서 뒤집기, 은종현 교수 실측 회신 대기) 전에는 투고 불가; 그다음 60° 임계각 정합 재측정",
            "PFTF_DrapePrior_VisCull_kDop": "독립 논문 등급 미적용 — 통합 evidence 저장소",
            "DFSVR_VisCull": "값·gradient parity·거짓음성 0 및 실제 end-to-end utility 검증",
            "SFTFSoft_GNN_DFSVR": "frozen budget-matched A–E baseline, held-out slicer 전이 및 latency/quality 동시 검증",
            # 2026-09-20 볼트 동기화. 분량 병목(본문 산문 10,810 → 2,564단어)이 해소되면서
            # 남은 것이 「규정이 요구하는데 프로젝트에 없는 산출물 셋」으로 바뀌었다.
            # 표(research_outputs)가 살아 있으면 표 값이 이기므로 볼트에서도 다시 발행해야 한다.
            "SFTF_QEM": "⛔ Tomo_SFTF accept 대기(2026-09-20) — 원고 자체는 투고 가능하다. 그전에 닫을 것 셋: COI 선언 **별도 Word 파일**이 없음(특허·연구비가 있어 체크박스 대체 불가), Vitae 를 표제지 뒤에 병합(새 포털에 올릴 파일 유형이 없고 build_draft.py 가 아직 그렇게 안 만든다), 본문에서 사라진 재현 패키지 주소(4open.science) 복원. 선행연구 인용 보강과 성능 우월 주장 불가는 그대로다",
            # 2026-09-21 볼트 동기화. 분량·형식·인용이 닫히면서 병목이 「행정 둘」로 바뀌었다.
            "SFTF_InjMold": "행정 두 가지뿐이다 — 교신저자 ORCID 와 1저자 실명. 분량·형식·인용은 닫혔다",
        },
        # 2026-09-21: PFTF_Mold 를 걷는다. 파일에 구워져 있던 「solids4foam 사슬 IBOF
        # 재채점·외부 물리 검증」은 볼트가 이미 닫은 일이고(grade_note — 선언한 아홉 관문
        # 전부 충족), 볼트 노트에는 bottleneck 필드 자체가 없다. 없는 것을 없다고 두는 편이
        # 끝난 일을 막힌 일로 보이게 두는 것보다 낫다.
        remove=("TSE_SEM", "TSE_SEM_Bezier", "TSE_SEM_Tensor", "TSE_SEM_AutoTune",
                "PFTF_ResearchOptimize", "PFTF_Mold"),
    )
    s = _update_json_object_constant(
        s,
        "INDUSTRIAL_EFFECTS",
        {
            "PFTF_GFiberCT": "X선 CT로 촬영한 적층 섬유구조(복합재 적층체·스페이서 패브릭)에서 층 간격과 두께를 층간 오연결 없이 계산할 수 있고, 표본이 부족하면 필요한 관측 밀도를 스스로 알려 준다. 맞닿은 계면과 자동 객체 탐지는 미지원이다.",
            "DFSVR_VisCull": "정확한 first-hit 결과를 유지하면서 불필요한 교차 후보를 안전하게 줄이면 미분가능 지지 구조 계산의 확장성을 높일 수 있다.",
            "SFTFSoft_GNN_DFSVR": "GNN의 빠른 후보 제안과 DFSVR의 정밀 보정을 결합해 출력 방향 탐색 시간과 검증 비용을 함께 줄이는 것을 목표로 한다.",
        },
        remove=("PFTF_ResearchOptimize",),
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
QUALITY_COMMUNITY_IDS = {"상": 1, "중": 2, "하": 3, "ToDo": 4, "등급 없음": 7}

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

ALPHA_NODE = {
    "id": "PFTF_GFiberCT",
    "label": "PFTF_GFiberCT",
    "color": {"background": "#f28e2b", "border": "#f28e2b",
               "highlight": {"background": "#f28e2b", "border": "#f28e2b"}},
    "size": 16.4,
    "font": {"size": 12, "color": "#333333", "bold": False},
    "title": NODE_TITLES["PFTF_GFiberCT"],
    "community": 2,
    "community_name": "중",
    "source_file": "PFTF_GFiberCT.md",
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

URBAN_TRAFFIC_NODE = {
    "id": "SFTF_UrbanTraffic",
    "label": "SFTF_UrbanTraffic",
    "color": {"background": "#2a78d6", "border": "#2a78d6",
               "highlight": {"background": "#2a78d6", "border": "#2a78d6"}},
    "size": 13.7,
    "font": {"size": 13, "color": "#333333"},
    "title": NODE_TITLES["SFTF_UrbanTraffic"],
    "community": 3,
    "community_name": "하",
    "source_file": "SFTF_UrbanTraffic.md",
    "file_type": "concept",
    "degree": 1,
}

DRAPESCAN_NODE = {
    "id": "cfmsDrapeSCAN",
    "label": "cfmsDrapeSCAN",
    "color": {"background": "#ffffff", "border": "#000000",
               "highlight": {"background": "#ffffff", "border": "#000000"}},
    "size": 15.4,
    "font": {"size": 13, "color": "#333333", "bold": False},
    "title": "cfmsDrapeSCAN — ToDo: Gate 0 GO; Gate 1 마네킹 파일럿 전",
    "community": 4,
    "community_name": "ToDo",
    "source_file": "cfmsDrapeSCAN.md",
    "file_type": "concept",
    "degree": 7,
    "_intro": INTRODUCTIONS["cfmsDrapeSCAN"],
    "_project_path": PROJECT_PATHS.get("cfmsDrapeSCAN", r"D:\__VSCode_Projects\cfmsDrapeSCAN_dev"),
}

# 2026-09-18: 93196cb 가 graph.html 에만 적어 둔 노드를 여기로 들여왔다. 볼트에
# Projects/cfmsDrapeInverse.md 가 서면서 정식 프로젝트가 될 예정이고(사용자), 그때까지는
# 등급 ToDo 다 — 흰 바탕·검정 외곽선·community 4. 노드가 이미 RAW_NODES 에 있으면
# _preserve_raw_nodes 가 기존 항목을 정본으로 두므로 이 사전은 그때 쓰이지 않는다.
# 배포본이 비거나 새로 만들 때의 씨앗이다.
DRAPEINVERSE_NODE = {
    "id": "cfmsDrapeInverse",
    "label": "cfmsDrapeInverse",
    "color": {"background": "#ffffff", "border": "#000000",
               "highlight": {"background": "#ffffff", "border": "#000000"}},
    "size": 15.4,
    "font": {"size": 13, "color": "#333333", "bold": False},
    "title": "cfmsDrapeInverse — ToDo: 정적 평형 adjoint 로 기울기를 얻는 원단 물성 역추정선; 합성 검증 완료, 실측 회수 전",
    "community": 4,
    "community_name": "ToDo",
    "source_file": "cfmsDrapeInverse.md",
    "file_type": "concept",
    "degree": 3,
    "_intro": INTRODUCTIONS["cfmsDrapeInverse"],
    "_project_path": PROJECT_PATHS.get("cfmsDrapeInverse", r"D:\__CFMS_Projects\cfmsDrapeInverse_dev"),
}


# 2026-09-19: 볼트에 새로 선 전석진 교수님 후보 둘. 두 노트 모두 status: todo ·
# grade: ToDo · stage: undecided 라 흰 바탕·검정 외곽선(community 4)에 빈 원으로 그려진다.
# 단계(undecided)는 NOTE_STAGES 가 볼트에서 자동으로 읽어 오므로 여기 적지 않는다.
DLPORIENT_NODE = {
    "id": "Jeon_DLPOrient",
    "label": "Jeon_DLPOrient",
    "color": {"background": "#ffffff", "border": "#000000",
               "highlight": {"background": "#ffffff", "border": "#000000"}},
    "size": 15.4,
    "font": {"size": 13, "color": "#333333", "bold": False},
    "title": "Jeon_DLPOrient — ToDo: 배향 순위를 실물 출력물로 검증",
    "community": 4,
    "community_name": "ToDo",
    "source_file": "Jeon_DLPOrient.md",
    "file_type": "concept",
    "degree": 2,
    "_intro": INTRODUCTIONS["Jeon_DLPOrient"],
    "_project_path": PROJECT_PATHS.get("Jeon_DLPOrient", r"D:\__KIT_projects\Jeon_DLPOrient_dev"),
}

DISPERSITYPROP_NODE = {
    "id": "cfmsDispersityProp",
    "label": "cfmsDispersityProp",
    "color": {"background": "#ffffff", "border": "#000000",
               "highlight": {"background": "#ffffff", "border": "#000000"}},
    "size": 15.4,
    "font": {"size": 13, "color": "#333333", "bold": False},
    "title": "cfmsDispersityProp — ToDo: 분산도 지표와 물성의 상관 검증",
    "community": 4,
    "community_name": "ToDo",
    "source_file": "cfmsDispersityProp.md",
    "file_type": "concept",
    "degree": 1,
    "_intro": INTRODUCTIONS["cfmsDispersityProp"],
    "_project_path": PROJECT_PATHS.get("cfmsDispersityProp", r"D:\__KIT_projects\cfmsDispersityProp_dev"),
}


# 2026-09-20: 사용자 지시로 그래프에 올린다. 볼트 Projects/PFTF_Mold.md 는 오래 있었지만
# 노드가 없어서 화면에 안 보였다(QUALITY_ROWS·INTRODUCTIONS 에만 있었다). 등급 중 ·
# stage draft 는 둘 다 볼트 값이고, 색·community 는 quality_lookup 이 QUALITY_ROWS 의
# 「중」으로 덮어쓰므로 여기 적은 값은 씨앗일 뿐이다. 단계(draft)는 NOTE_STAGES 가 볼트에서
# 읽어 온다. 볼트 status 는 archived 지만 원고는 살아 있다(사독 2차 대응까지 끝났다).
PFTF_MOLD_NODE = {
    "id": "PFTF_Mold",
    "label": "PFTF_Mold",
    "color": {"background": "#f28e2b", "border": "#f28e2b",
               "highlight": {"background": "#f28e2b", "border": "#f28e2b"}},
    "size": 13.7,
    "font": {"size": 13, "color": "#333333", "bold": False},
    "title": "PFTF_Mold — 중: 비등방 수축 보정과 금형 조건 탐색. IBOF 통일·사독 1차 대응 완료, 투고 저널 미정",
    "community": 2,
    "community_name": "중",
    "source_file": "PFTF_Mold.md",
    "file_type": "concept",
    "degree": 0,
    "_intro": INTRODUCTIONS["PFTF_Mold"],
    "_project_path": PROJECT_PATHS.get(
        "PFTF_Mold", r"D:\__PFTF_Projects(2026)\_PFTF_applications\projects\PFTF_Mold_dev"),
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
    ALPHA_NODE,
    QEM_NODE,
    DYNAMIC_TARGET_SEARCH_NODE,
    ACTIVE_OVERPRINT_NODE,
    DFSVR_VIS_CULL_NODE,
    SFTFSOFT_GNN_DFSVR_NODE,
    URBAN_TRAFFIC_NODE,
    DRAPESCAN_NODE,
    DRAPEINVERSE_NODE,
    DLPORIENT_NODE,
    DISPERSITYPROP_NODE,
    PFTF_MOLD_NODE,
]

TODO_EDGES = [
    # The vault note explicitly links UrbanTraffic to Tomo_SFTF and describes
    # it as a directed-SFTF field instance.  DataCenterTraffic is also linked
    # there, but remains outside the current public graph snapshot.
    {"from": "Tomo_SFTF", "to": "SFTF_UrbanTraffic",
     "label": "application",
     "title": "Tomo_SFTF → SFTF_UrbanTraffic\n"
              "Directed-SFTF 도시 교통 응용\n"
              "출처: 볼트 관련 프로젝트·프로젝트 개요",
     "dashes": False, "width": 2, "color": {"opacity": 0.9},
     "confidence": "EXTRACTED", "_rel": "instantiates",
     "_detail": "directed-SFTF urban-traffic application", "_tentative": False},
    {"from": "PFTF_DrapePrior_VisCull_kDop", "to": "SFTF_DrapePrior",
     "label": "complements", "title": "complements [INFERRED]", "dashes": True,
     "width": 2, "color": {"opacity": 0.7}, "confidence": "INFERRED"},
    {"from": "PFTF_DrapePrior_VisCull_kDop", "to": "PFTF_VisCull_kDop",
     "label": "extends", "title": "extends [INFERRED]", "dashes": True,
     "width": 2, "color": {"opacity": 0.7}, "confidence": "INFERRED"},
    {"from": "PFTF", "to": "PFTF_GFiberCT",
     "label": "instantiates", "title": "instantiates [INFERRED]", "dashes": True,
     "width": 2, "color": {"opacity": 0.7}, "confidence": "INFERRED"},
    # SFTF_QEM: Tomo_SFTF 가 베이스, PFTF_GFiberCT 와는 문제·기준이 다른 인접/대비 관계다.
    {"from": "Tomo_SFTF", "to": "SFTF_QEM",
     "label": "accelerates", "title": "accelerates [INFERRED]", "dashes": True,
     "width": 2, "color": {"opacity": 0.7}, "confidence": "INFERRED"},
    {"from": "PFTF_GFiberCT", "to": "SFTF_QEM",
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

# Curated project-to-project arrows audited against the current Obsidian
# Projects notes.  Entries here replace an existing pair as well as add a
# missing pair, so regenerated graph.html cannot silently restore stale
# confidence/semantics from its embedded RAW_EDGES snapshot.
def _curated_edge(source, target, label, detail, *, relation="provides",
                  dashes=True, width=2.5, confidence="EXTRACTED",
                  source_note="옵시디언 볼트 Projects 노트"):
    return {
        "from": source,
        "to": target,
        "label": label,
        "title": f"{source} → {target}\n{detail}\n출처: {source_note} [{confidence}]",
        "dashes": dashes,
        "width": width,
        "color": {"opacity": 0.75 if dashes else 0.9},
        "confidence": confidence,
        "_rel": relation,
        "_detail": detail,
        "_tentative": confidence != "EXTRACTED",
    }


CURATED_EDGE_UPDATES = [
    # Newly missing direct relationships.
    _curated_edge("PFTF", "SFTF_Composite", "tensor instance",
                  "Advani–Tucker 복합재 배향의 PFTF 인스턴스화 레시피",
                  relation="instantiates"),
    _curated_edge("cfmsDrape", "PFTF_Compression", "contact solver",
                  "접촉압 FE와 지속 접촉력 기반 마찰 요구를 제공",
                  dashes=False, width=3),
    _curated_edge("cfmsCIPC", "cfmsPINNDrape", "cross-engine verifier",
                  "C-IPC에서 봉제 과도기 교란 증폭과 접촉 포화를 독립 재현",
                  relation="validates", dashes=False, width=3),
    _curated_edge("SFTF_DrapePrior", "cfmsPINNCAD", "negative control",
                  "warm-start의 solver 의존성과 worn-garment prior 붕괴를 음성 대조로 계승",
                  relation="validates"),

    # Existing arrows whose current notes now state the relationship directly.
    _curated_edge("PFTF_VisCull_kDop", "PFTF_Compression",
                  "candidate accelerator",
                  "GPU G1-full 압박 계산과 production GPU contact gate가 아직 만나지 않은 backend-blocked 통합 후보",
                  relation="accelerates", confidence="INFERRED",
                  source_note="볼트 그래프와 현재 두 저장소·cfmsDrape backend 감사"),
    _curated_edge("Tomo_SFTFSoft", "Tomo_DFSVR", "baseline / proposer",
                  "soft receiver를 섞지 않고 동결 기준선과 후보 제안기로만 사용"),
    _curated_edge("Tomo_DFSVR", "DFSVR_VisCull", "scalability gate",
                  "DFSVR exact first-hit 앞단의 보수적 BVH 확장"),
    _curated_edge("PFTF_VisCull_kDop", "DFSVR_VisCull", "conservative gate",
                  "방향 텐서 gate 뒤에 exact DFSVR fallback을 유지"),
    _curated_edge("SFTFSoft_GNN", "SFTFSoft_GNN_DFSVR", "top-K proposer",
                  "profile-conditioned top-K 방향 후보를 제안"),
    _curated_edge("Tomo_DFSVR", "SFTFSoft_GNN_DFSVR", "DFSVR refiner",
                  "first-hit support-volume으로 후보를 정련"),
    _curated_edge("SFTF_QEM", "SFTFSoft_GNN", "tessellation audit",
                  "remeshing·tessellation 강건성 감사 방법론을 제공",
                  relation="validates"),
    _curated_edge("PFTF_AsymTensor", "SFTFSoft_GNN", "directed messages",
                  "source→receiver 방향성 message의 명시적 후속 후보"),
    _curated_edge("SFTF_DynamicTargetSearch", "SFTF_ActiveOverprint",
                  "active-search engine", "후보 불확실성과 next-view 엔진을 제공",
                  relation="instantiates"),
    _curated_edge("Tomo_SFTFSoft", "SFTFSoft_DFSVR", "slicer gate",
                  "프로파일 임계각 기반 soft slicer gate를 제공"),
    _curated_edge("Tomo_DFSVR", "SFTFSoft_DFSVR", "first-hit union",
                  "가시성 일관 first-hit와 공간 합집합을 제공"),
    _curated_edge("Tomo_SFTF", "SFTF_QEM", "ranking surrogate",
                  "hard-SFTF 배향 순위를 저비용 QEM 대리모델로 감사",
                  relation="accelerates", dashes=False, width=3),
    _curated_edge("PFTF_GFiberCT", "SFTF_QEM", "problem boundary",
                  "two-layer 분리와 목적함수 보존 문제의 경계를 명시",
                  relation="complements"),
    _curated_edge("Tomo_SFTF", "SFTF_DynamicTargetSearch", "candidate evidence",
                  "후보 생성·평가와 support path를 제공"),
    _curated_edge("Tomo_SFTFSoft", "SFTF_DynamicTargetSearch", "soft evidence",
                  "시간 감쇠와 soft evidence weighting을 제공"),
    _curated_edge("SFTF_Clustering", "SFTF_DynamicTargetSearch", "candidate basins",
                  "후보 basin 압축을 제공"),
    _curated_edge("Tomo_SFTF", "SFTF_ActiveOverprint", "support evidence",
                  "support-aware printable 후보 평가 계보를 제공"),
    _curated_edge("SFTF_Clustering", "SFTF_ActiveOverprint", "surface basins",
                  "조밀한 표면 후보를 printable basin으로 압축"),
    _curated_edge("SFTF_DrapePrior", "SFTF_ActiveOverprint", "garment state",
                  "접촉·clearance prior의 인접 의복 상태를 제공"),
    _curated_edge("SFTF_DrapePrior", "cfmsCIPC", "collision benchmark",
                  "접촉 prior의 solver 경계를 C-IPC 충돌 기준과 대조",
                  relation="validates"),
    _curated_edge("PFTF_VisCull_kDop", "cfmsCIPC", "collision oracle",
                  "보수적 충돌 컬링을 penetration-free 기준과 대조",
                  relation="validates"),
    _curated_edge("cfmsMiindo", "cfmsPINNDrape", "engine / benchmark host",
                  "drape 엔진과 재현성 benchmark의 소유 계보",
                  dashes=False, width=3),
    _curated_edge("cfmsMiindo", "cfmsPINNCAD", "CAD / body provenance",
                  "cad·body·drape 원천 자산과 fixture를 제공",
                  dashes=False, width=3),
]

# cfmsAutoPlace2026_dev now supports two planned papers. Both public nodes
# intentionally point to the same checkout, but their IDs and paper scopes are
# distinct so graph/mindmap consumers do not collapse them back into one item.
LEGACY_AUTOPLACE_ID = "cfmsAutoPlace"
LEGACY_AUTOPLACE_SPLIT_IDS = {"cfmsAutoPlace_1", "cfmsAutoPlace_2"}
AUTOPLACE_TRACKS = [
    {
        "id": "cfmsAutoPlace_IJCST",
        "scope": "IJCST 패턴 논문 트랙",
        "summary": "라벨 없는 의복 패턴의 대칭·골선과 배치·조립 유효성 검증",
        "intro": INTRODUCTIONS["cfmsAutoPlace_IJCST"],
    },
    {
        "id": "cfmsAutoPlace_JCDE",
        "scope": "JCDE CAD 논문 트랙",
        "summary": "산업 DXF 패널의 신체 부위·전역 조립·초기 배치 추정",
        "intro": INTRODUCTIONS["cfmsAutoPlace_JCDE"],
    },
]
AUTOPLACE_IDS = {
    LEGACY_AUTOPLACE_ID,
    *LEGACY_AUTOPLACE_SPLIT_IDS,
    *(track["id"] for track in AUTOPLACE_TRACKS),
}


def _autoplace_node(track, template=None):
    node = copy.deepcopy(template) if template else {}
    grade, note = quality_lookup[track["id"]]
    color = GRADE_COLORS[grade]
    node.update({
        "id": track["id"],
        "label": track["id"],
        "color": {
            "background": color,
            "border": color,
            "highlight": {"background": color, "border": color},
        },
        "size": 15.4,
        "font": {"size": 13, "color": "#333333", "bold": False},
        "title": (
            f'{track["id"]} — {grade}\n'
            f'차수 2 (in 1 / out 1) · L0 · near\n'
            f'{track["scope"]}: {track["summary"]}'
        ),
        "community": QUALITY_COMMUNITY_IDS[grade],
        "community_name": grade,
        "source_file": "cfmsAutoPlace.md",
        "file_type": "concept",
        "degree": 2,
        "_intro": track["intro"],
        "_project_path": r"D:\__CFMS_Projects\cfmsAutoPlace2026_dev",
        "_grade": grade,
        "_stage": "draft",
        "_horizon": "near",
        "_level": 0,
        "_family": "cfms",
        "_in": 1,
        "_out": 1,
        "_quality": grade,
        "_quality_note": note,
        "_bottleneck": None,
        "_graph_role": "",
        "_finding_candidate": "",
    })
    return node


def _autoplace_goal_edge(source, target, label, detail, relation):
    return {
        "from": source,
        "to": target,
        "label": label,
        "title": (
            f"{source} → {target}\n"
            f"개발 목표: {label} ({relation})\n{detail}"
        ),
        "dashes": False,
        "width": 2,
        "color": {"opacity": 0.65},
        "confidence": "GOAL",
        "_rel": relation,
        "_detail": detail,
        "_goal": label,
        "_tentative": False,
    }


AUTOPLACE_GOAL_EDGES = [
    _autoplace_goal_edge(
        "cfmsAutoSew", "cfmsAutoPlace_JCDE", "CAD 배치",
        "봉제 후보를 의복 CAD의 전역 조립·초기 배치 가설로 확장한다", "통합",
    ),
    _autoplace_goal_edge(
        "cfmsAutoPlace_JCDE", "cfmsDrape", "CAD 물리 검증",
        "CAD 조립·초기 배치 후보를 short-rollout 물리 오라클로 검증한다", "정확도",
    ),
    _autoplace_goal_edge(
        "cfmsAutoSew", "cfmsAutoPlace_IJCST", "패턴 배치",
        "봉제 후보를 IJCST 패턴 트랙의 배치·조립 유효성 가설로 확장한다", "통합",
    ),
    _autoplace_goal_edge(
        "cfmsAutoPlace_IJCST", "cfmsDrape", "패턴 물리 검증",
        "패턴 배치 후보를 short-rollout 물리 오라클로 검증한다", "정확도",
    ),
]

# cfmsDrapeSCAN is a planned project, so these relations stay explicit and
# conservative. They mirror the 2026-09-01 Obsidian integration table rather
# than implying that the downstream experiments are already complete. The
# public graph uses its four goal categories for edge styling.
def _drapescan_goal_edge(source, target, label, detail, relation, *, dashes=False):
    return {
        "from": source,
        "to": target,
        "label": label,
        "title": f"{source} → {target}\n볼트 관계: {label} ({relation})\n{detail}",
        "dashes": dashes,
        "width": 2,
        "color": {"opacity": 0.65},
        "confidence": "EXTRACTED",
        "_rel": relation,
        "_detail": detail,
        "_goal": label,
        "_tentative": False,
    }


DRAPESCAN_EDGES = [
    _drapescan_goal_edge(
        "cfmsDrapeSCAN", "cfmsDrape", "실행 기반",
        "cfmsDrape의 shell 물리·정적 평형·body contact·soft tether를 핵심 실행 기반으로 사용",
        "통합",
    ),
    _drapescan_goal_edge(
        "cfmsDrapeSCAN", "cfmsMiindo", "구현 호스트",
        "첫 실측 전까지 cfmsMiindo의 drape/ 위에 얇은 실험 모듈로 배양",
        "통합",
    ),
    _drapescan_goal_edge(
        "cfmsDrapeSCAN", "cfmsPINNCAD", "body atlas",
        "저차원 body atlas·canonical 치수 schema와 단면·둘레·폭·깊이 평가를 보조 입력으로 사용",
        "확장", dashes=True,
    ),
    _drapescan_goal_edge(
        "cfmsDrapeSCAN", "cfmsCIPC", "검증 오라클",
        "대표 난례의 penetration-free 독립 오라클과 clearance 검증에 사용",
        "정확도", dashes=True,
    ),
    _drapescan_goal_edge(
        "cfmsDrapeSCAN", "SFTF_DrapePrior", "부분 재사용",
        "평형을 바꾸지 않는 M2 적응 감쇠와 측정 프로토콜만 부분 재사용",
        "확장", dashes=True,
    ),
    _drapescan_goal_edge(
        "cfmsDrapeSCAN", "PFTF_GFiberCT", "조건부 QA",
        "실제 유령 이중면이 검출될 때만 layer-first QA를 조건부 실행",
        "정확도", dashes=True,
    ),
    _drapescan_goal_edge(
        "cfmsDrapeSCAN", "PFTF_Compression", "후속 응용",
        "등록된 3D 사지·인체 형상을 후속 응용·실험 소비자로 제공",
        "확장", dashes=True,
    ),
    # 들어오는 화살표. 2026-09-18 에 이 목록으로 옮겼다 — cfmsDrapeInverse 를 넣은
    # 93196cb 가 이 엣지를 graph.html 에만 적어 두었는데, 위 _preserve_goal_edges 가
    # cfmsDrapeSCAN 에 닿는 엣지를 **전부** 걷어낸 뒤 이 목록만 다시 넣기 때문에 다음
    # 재생성에서 조용히 사라졌다. cfmsDrapeSCAN 의 엣지는 이 파일이 정본이다.
    _drapescan_goal_edge(
        "cfmsDrapeInverse", "cfmsDrapeSCAN", "관측 대안",
        "같은 물성을 3D 스캔 대신 드레이프 외곽선 사진으로 얻는 경로를 연다",
        "확장",
    ),
]

# SFTF_DynamicTargetSearch 는 Tomo_SFTF 에서 갈라져 나왔다. 볼트 아이디어 노트
# (Papers/SFTF_동적표적탐색_연구아이디어_2026-07-29.md §3·§6)가 Tomo_SFTF 의 후보 생성,
# source→receiver support path, 방향 다양성 선택을 메시 표면에서 시간가변 공간 그래프로
# 옮기는 것을 핵심으로 적고 있고, Projects/SFTF_DynamicTargetSearch.md 도 Tomo_SFTF 를
# 첫 근거로 둔다. 2026-08-28 개발 목표 전환(d7ba711)이 이 노드로 들어오는 계보 화살표
# 셋을 모두 떨어뜨려 부모가 없어 보였으므로, 주 부모 하나만 목표 엣지로 되살린다.
# Tomo_SFTFSoft(soft evidence)·SFTF_Clustering(basin 압축)은 부품만 보태는 보조 부모라
# 공개 그래프에는 두지 않는다. 대상이 아직 ToDo(물리 레인 보류)라서 나가는 엣지와
# 같이 점선·잠정으로 그린다.
DYNAMIC_TARGET_SEARCH_GOAL_EDGES = [
    {
        **_autoplace_goal_edge(
            "Tomo_SFTF", "SFTF_DynamicTargetSearch", "표적 탐색",
            "메시 표면의 후보 생성·평가와 support path를 시간가변 공간 그래프의 이동 표적 탐색으로 옮긴다",
            "확장",
        ),
        "dashes": True,
        "_tentative": True,
    },
]

# ------------------------------------- 김우석 교수님 훌을 본문에 붙인다 (2026-09-18)
# 이 네 노드(SFTF_SewerPOC · SFTF_UrbanTraffic · ColdOndol · ColdOndol_Positioning)는
# 그래프에서 화살표가 하나도 없는 섬이었다. 안쪽 ColdOndol → ColdOndol_Positioning
# 한 줄만 있고 밖으로 나가는 선이 없어서, 3D프린팅 훌과 아무 상관없는 별개의 연구처럼
# 보였다(사용자 보고). 볼트에는 관계가 이미 적혀 있었는데 공개 그래프에만 없었다 —
# 2026-08-28 개발 목표 전환이 응용/계보 화살표를 걷어낼 때 같이 떨어졌고, 옛 사본은
# TODO_EDGES 안에 남아 있지만 _preserve_goal_edges 가 그 목록을 다시 넣지 않는다.
#
# 근거는 전부 볼트 frontmatter 의 depends_on·related 와 노트 §개요다. 없는 관계를
# 만들지 않으려고 두 갈래를 서로 다르게 그린다.
#
#   · 실선(EXTRACTED) — SFTF 골격을 그대로 옮겨 실은 이식 관계. SewerPOC 은 「빌드방향=
#     중력, receiver=하류 노드, ground node=방류구」로 매핑했다고 노트 §개요가 적고,
#     UrbanTraffic 은 directed-SFTF 의 가역차로 필드 인스턴스다. Tomo_SFTF.depends_on
#     에 둘 다 있고, SFTF_Clustering.depends_on 에 SewerPOC 이 있다.
#   · 점선·잠정 — ColdOndol 두 편의 PFTF 연결은 **아직 조건부다.** 두 노트의
#     §SFTF/PFTF 연결 경계가 「주 해법은 표준 RC + 제약 MPC이고, PFTF 는 QP 가 실제
#     병목임이 실측으로 확인된 뒤에만 warm-start 제안 계층으로 비교한다. 기본 QP 가
#     수 ms 에 풀리면 넣지 않는다」로 못박았다. 실선으로 그리면 이미 쓰고 있다는
#     뜻이 되므로 그렇게 그리지 않는다.
#
# PFTF 는 3D프린팅 훌 밖이지만 Tomo_SFTF 와 「이론 일반화」로 이어져 있으므로, 온돌
# 두 편은 두 걸음 거리로 붙는다. 이것이 실제 구조다 — 온돌은 적층 연구가 아니다.
COAUTHOR_KIM_GOAL_EDGES = [
    _autoplace_goal_edge(
        "Tomo_SFTF", "SFTF_SewerPOC", "관망 이식",
        "빌드방향=중력·receiver=하류 노드·ground node=방류구로 매핑해 SFTF 지지 트리를"
        " 자연유하 하수/우수 관망 라우팅으로 옮긴다",
        "확장",
    ),
    _autoplace_goal_edge(
        "SFTF_Clustering", "SFTF_SewerPOC", "유역 분할",
        "메시 분할에 쓰던 flow-region k-medoids 를 관망 유역 분할로 재사용한다",
        "통합",
    ),
    _autoplace_goal_edge(
        "Tomo_SFTF", "SFTF_UrbanTraffic", "방향장 이식",
        "출력 방향장을 가역차로 directed-SFTF 시공간 필드 인스턴스로 옮긴다",
        "확장",
    ),
    {
        **_autoplace_goal_edge(
            "PFTF", "ColdOndol", "조건부 warm-start",
            "제어기를 대체하지 않는다 — QP 가 실제 병목임이 실측으로 확인된 뒤에만"
            " 후보 배분·초기해 제안 계층으로 붙는다",
            "가속",
        ),
        "dashes": True,
        "_tentative": True,
    },
    {
        **_autoplace_goal_edge(
            "PFTF", "ColdOndol_Positioning", "조건부 warm-start",
            "축3 배분의 주 해법은 표준 RC 추정 + 제약 MPC 다. 세대·시나리오가 커져"
            " QP 가 병목으로 확인된 뒤에만 warm-start 제안 계층으로 비교한다",
            "가속",
        ),
        "dashes": True,
        "_tentative": True,
    },
]

# ------------------------------------- 전석진 교수님 후보 둘을 본문에 잇는다 (2026-09-19)
# 볼트 frontmatter 의 depends_on 이 근거다. 김우석 훌이 섬으로 떠 있어 별개 연구처럼 보였던
# 일(2026-09-18)을 되풀이하지 않으려고 처음부터 같이 넣는다.
#   cfmsDispersityProp.depends_on = [cfmsDispersity]   (개명 전 Jeon_DispersityProp)
#   Jeon_DLPOrient.depends_on      = [SFTF_QEM, Tomo_SFTFSoft]
# 둘 다 아직 ToDo·미정이고 실측 대조 전이라 점선·잠정으로 그린다 — 실선은 「이미 쓰고 있다」는
# 뜻이 된다.
JEON_GOAL_EDGES = [
    {
        **_autoplace_goal_edge(
            "cfmsDispersity", "cfmsDispersityProp", "상관 검증",
            "분산도 지표가 실제 물성과 정말로 이어지는지 이미 찍혀 있는 시편 사진으로 확인한다",
            "정확도",
        ),
        "dashes": True,
        "_tentative": True,
    },
    {
        **_autoplace_goal_edge(
            "SFTF_QEM", "Jeon_DLPOrient", "순위 검증",
            "저비용 순위가 실물 출력물의 물성 순위와 맞는지 처음으로 실물에 대고 잰다",
            "정확도",
        ),
        "dashes": True,
        "_tentative": True,
    },
    {
        **_autoplace_goal_edge(
            "Tomo_SFTFSoft", "Jeon_DLPOrient", "배향 순위",
            "출력 방향 평가를 DLP 실물 인장·이방성 순위와 대조하는 검증선으로 넘긴다",
            "정확도",
        ),
        "dashes": True,
        "_tentative": True,
    },
]


# ------------------------------------------------ 금형 두 갈래의 부모 (2026-09-20)
# 방대석 교수님 훌을 세울 때 두 노드가 화살표 없이 떠 있었다(사용자). 부모는 고르는
# 것이 아니라 볼트 노트가 「개요」에서 이미 지목하고 있다 —
#   · PFTF_Mold      「[[PFTF]] 의 **사출 금형 이방성 수축 보정(치수 보정)** 인스턴스」
#   · SFTF_InjMold   「SFTF 의 **사출성형** 적용」, 관련 프로젝트 [[Tomo_SFTF]]
# 둘 다 확정된 계보라 실선이다(dashes False). PFTF_Mold 의 관련 프로젝트에는
# SFTF_InjMold·SFTF_Composite 도 있지만, 한 노드에 부모 하나씩만 긋는다.
MOLD_GOAL_EDGES = [
    _autoplace_goal_edge(
        "PFTF", "PFTF_Mold", "수축 보정",
        "방향 텐서의 Rayleigh 축약으로 이방성 수축을 통일하고, cavity 를 사전 변형하는 "
        "역문제로 물리 cut-and-try 반복을 계산 반복으로 대체한다",
        "확장",
    ),
    _autoplace_goal_edge(
        "Tomo_SFTF", "SFTF_InjMold", "사출 이식",
        "방향 판정을 사출 금형의 재료 흐름 방향으로 옮겨 결함이 적은 설계를 고른다",
        "확장",
    ),
]

# ------------------------------------------------ TSE_SEM 논문 트랙 분리 (2026-09-11)
# TSE_SEM2026_dev 한 저장소에 논문 3편이 있고(볼트 Projects/TSE_SEM.md 의 draft_keyword),
# mindmap.html 의 클라우드 문서는 이미 세 노드로 나뉘어 있다.  graph.html 도 나눈다.
#
# 2026-09-14: 이름을 «TSE_SEM1_Bezier» 꼴로 통일했다(사용자 지시).  그 전에는 캡션이
# 마인드맵 제목인 «SEM1(Bezier)» 이고 노드 id 는 볼트의 «노트_트랙» 규약인
# «TSE_SEM_Bezier» 라서, 같은 논문이 포트폴리오 표와 그래프에서 다른 이름으로 보였다.
# 이제 id 와 캡션이 같고 포트폴리오 행 이름도 같다.  투고 순서를 이름에 넣었으므로
# 어느 화면에서 보든 ①②③ 이 드러난다.  볼트 paper_completeness 중첩 맵의 키는 노트
# 안의 트랙 이름(Bezier/Tensor/AutoTune)이라 그대로고, 아래 vault_key 가 이어 준다.
#
# 화살표는 «먼저 선 것 → 갈라져 나온 것» 규칙과 투고 순서(Bezier → Tensor → AutoTune)를
# 따라 SFTF_Composite → ① → ② → ③ 한 줄이다.
LEGACY_SEM_ID = "TSE_SEM"
SEM_TRACKS = [
    {
        "id": "TSE_SEM1_Bezier",
        "label": "TSE_SEM1_Bezier",
        "level": 3,
        "scope": "① Bézier 관 재구성 트랙 · 한국복합재료학회지(은종현 교수 투고)",
        "summary": "방향 리프팅과 3차 Bézier 곡선으로 SEM 나노섬유 웹의 개별 섬유 중심선·반지름을 3차원 복원",
    },
    {
        "id": "TSE_SEM2_Tensor",
        "label": "TSE_SEM2_Tensor",
        "level": 4,
        "scope": "② 배향 텐서장 트랙 · 한국복합재료학회지(① 접수 후, 은종현 교수 투고)",
        "summary": "이진화 없는 섬유 배향 텐서장으로 전체 배향·교차점·하부층까지 정량화",
    },
    {
        "id": "TSE_SEM3_AutoTune",
        "label": "TSE_SEM3_AutoTune",
        "level": 5,
        # 2026-09-14: 보류가 돌아왔다.  사유가 앞과 다르므로(게이트가 아니라 일정) 적어 둔다.
        "scope": "③ AutoTune 트랙(보류 — 2027-03-01 이후 투고) · 설인환 단독 저자",
        "summary": "정답 없는 SEM 영상에서 증거 제약만으로 텐서 파이프라인의 파라미터를 자동 선택",
    },
]
# 볼트 paper_completeness 중첩 맵의 «노트_트랙» 키. 정본은 위 TRACK_NOTES 하나다.
for _track in SEM_TRACKS:
    _track["vault_key"] = "_".join(TRACK_NOTES[_track["id"]])
SEM_TRACK_IDS = [track["id"] for track in SEM_TRACKS]
# 2026-09-14 이름 통일 전의 노드 id 도 함께 걷어낸다.  이것이 없으면 재생성이 옛 노드를
# 남겨 둔 채 새 노드를 더해, 같은 논문이 그래프에 두 번 선다(좌표도 바깥 고리로 튄다).
# 볼트 paper_completeness 중첩 맵의 «노트_트랙» 키와 같은 문자열이라 vault_key 를 쓴다.
LEGACY_SEM_TRACK_IDS = {track["vault_key"] for track in SEM_TRACKS}
SEM_IDS = {LEGACY_SEM_ID, *LEGACY_SEM_TRACK_IDS, *SEM_TRACK_IDS}

SEM_GOAL_EDGES = [
    # 옛 SFTF_Composite → TSE_SEM 화살표의 라벨·설명은 첫 트랙이 물려받는다.
    _autoplace_goal_edge(
        "SFTF_Composite", "TSE_SEM1_Bezier", "섬유 계측",
        "SEM 사진에서 섬유 굵기·방향을 자동으로 재어 입력을 만든다", "확장",
    ),
    _autoplace_goal_edge(
        "TSE_SEM1_Bezier", "TSE_SEM2_Tensor", "배향 텐서장",
        "개별 섬유의 중심선·반지름 복원에서 이진화 없는 전체 배향장·교차점·하부층 정량화로 넓힌다",
        "확장",
    ),
    _autoplace_goal_edge(
        "TSE_SEM2_Tensor", "TSE_SEM3_AutoTune", "자동 파라미터 선택",
        "정답이 없는 실제 SEM 에서 관측 가능한 자기일관성 지표와 baseline 상대 안전 제약만으로 텐서 파이프라인의 파라미터를 고른다",
        "정확도",
    ),
]


def _sem_node(track, template=None):
    node = copy.deepcopy(template) if template else {}
    grade, note = quality_lookup[track["id"]]
    color = GRADE_COLORS[grade]
    incoming = sum(1 for edge in SEM_GOAL_EDGES if edge["to"] == track["id"])
    outgoing = sum(1 for edge in SEM_GOAL_EDGES if edge["from"] == track["id"])
    node.update({
        "id": track["id"],
        "label": track["label"],
        "color": {
            "background": color,
            "border": color,
            "highlight": {"background": color, "border": color},
        },
        "size": 15.6,
        "font": {"size": 12, "color": "#333333"},
        "title": (
            f'{track["label"]} — {grade}\n'
            f'차수 {incoming + outgoing} (in {incoming} / out {outgoing}) · L{track["level"]} · near\n'
            f'{track["scope"]}: {track["summary"]}'
        ),
        "community": QUALITY_COMMUNITY_IDS[grade],
        "community_name": grade,
        "source_file": f"{LEGACY_SEM_ID}.md",
        "file_type": "concept",
        "degree": incoming + outgoing,
        "_intro": INTRODUCTIONS[track["id"]],
        # 세 트랙이 한 저장소를 쓴다 — 볼트 노트의 path 가 정본이다.
        "_project_path": PROJECT_PATHS.get(LEGACY_SEM_ID, r"D:\__AI_automatized\TSE_SEM2026_dev"),
        "_grade": grade,
        "_stage": "draft",
        "_horizon": "near",
        "_level": track["level"],
        # 인접행렬의 주제 가족.  접두어 규칙(id.split('_')[0])도 TSE 를 주지만 명시해 둔다.
        "_family": "TSE",
        "_in": incoming,
        "_out": outgoing,
        "_quality": grade,
        "_quality_note": note,
        "_bottleneck": None,
        "_graph_role": "",
        "_finding_candidate": "",
    })
    return node


def _replace_sem_tracks(nodes):
    """RAW_NODES 의 TSE_SEM 한 노드를 그 자리에서 세 트랙 노드로 바꾼다(재실행해도 같다)."""
    template = next((node for node in nodes if str(node.get("id")) == LEGACY_SEM_ID), None)
    existing = {
        str(node.get("id")): node for node in nodes if str(node.get("id")) in SEM_TRACK_IDS
    }
    built = [_sem_node(track, existing.get(track["id"]) or template) for track in SEM_TRACKS]
    replaced = []
    inserted = False
    for node in nodes:
        if str(node.get("id")) in SEM_IDS:
            if not inserted:
                replaced.extend(built)
                inserted = True
            continue
        replaced.append(node)
    if not inserted:
        replaced.extend(built)
    return replaced


autoplace_nodes_js = json.dumps(
    [_autoplace_node(track) for track in AUTOPLACE_TRACKS],
    ensure_ascii=False,
    indent=2,
)
autoplace_curated_block = (
    "// CFMS_AUTOPLACE_TRACKS_BEGIN\n"
    f"const CFMS_AUTOPLACE_NODES = {autoplace_nodes_js};\n"
    "CFMS_AUTOPLACE_NODES.forEach(node => {\n"
    "  if (!RAW_NODES.some(existing => existing.id === node.id)) RAW_NODES.push(node);\n"
    "});\n"
    "// CFMS_AUTOPLACE_TRACKS_END"
)
s, nautoplace_block = re.subn(
    r"(?:// CFMS_AUTOPLACE_TRACKS_BEGIN.*?// CFMS_AUTOPLACE_TRACKS_END|"
    r"const CFMS_AUTOPLACE_NODE = \{.*?\};\s*"
    r"if \(!RAW_NODES\.some\(n => n\.id === CFMS_AUTOPLACE_NODE\.id\)\) "
    r"RAW_NODES\.push\(CFMS_AUTOPLACE_NODE\);)",
    lambda _match: autoplace_curated_block,
    s,
    count=1,
    flags=re.S,
)
assert nautoplace_block == 1, "cfmsAutoPlace curated node block not found"


def _replace_curated_garment_edges(match):
    edges = json.loads(match.group(1))
    edges = [
        edge for edge in edges
        if str(edge.get("from")) not in AUTOPLACE_IDS
        and str(edge.get("to")) not in AUTOPLACE_IDS
    ]
    edges = [
        edge for edge in edges
        if str(edge.get("from")) != "cfmsDrapeSCAN"
        and str(edge.get("to")) != "cfmsDrapeSCAN"
    ]
    edges.extend(copy.deepcopy(AUTOPLACE_GOAL_EDGES))
    edges.extend(copy.deepcopy(DRAPESCAN_EDGES))
    return "const CURATED_GARMENT_EDGES = " + json.dumps(edges, ensure_ascii=False) + ";"


s, ncurated_garment_edges = re.subn(
    r"const CURATED_GARMENT_EDGES = (\[.*?\]);",
    _replace_curated_garment_edges,
    s,
    count=1,
    flags=re.S,
)
assert ncurated_garment_edges == 1, "CURATED_GARMENT_EDGES block not found"


def _preserve_raw_nodes(match):
    """Keep the public node snapshot and synchronize its quality fields.

    Relationships, captions, and summaries advance independently of this
    layout script.  Grades are the exception: QUALITY_ROWS is the checked-in
    public snapshot of the Obsidian frontmatter and must also be reflected in
    RAW_NODES so non-browser consumers do not observe stale classifications.
    """
    nodes = json.loads(match.group(1))
    legacy_template = next(
        (node for node in nodes if str(node.get("id")) == LEGACY_AUTOPLACE_ID),
        None,
    )
    split_by_id = {
        str(node.get("id")): node
        for node in nodes
        if str(node.get("id")) in AUTOPLACE_IDS - {LEGACY_AUTOPLACE_ID}
    }
    for track in AUTOPLACE_TRACKS:
        split_by_id[track["id"]] = _autoplace_node(
            track,
            split_by_id.get(track["id"]) or legacy_template,
        )

    expanded_nodes = []
    split_inserted = False
    for node in nodes:
        node_id = str(node.get("id"))
        if node_id == LEGACY_AUTOPLACE_ID or node_id in split_by_id:
            if not split_inserted:
                expanded_nodes.extend(split_by_id[track["id"]] for track in AUTOPLACE_TRACKS)
                split_inserted = True
            continue
        expanded_nodes.append(node)
    if not split_inserted:
        expanded_nodes.extend(split_by_id[track["id"]] for track in AUTOPLACE_TRACKS)
    expanded_nodes = _replace_sem_tracks(expanded_nodes)

    # Add newly onboarded project-note nodes without disturbing the preserved
    # public snapshot. Existing IDs remain authoritative for their metadata.
    existing_ids = {str(node.get("id")) for node in expanded_nodes}
    for candidate in TODO_NODES:
        candidate_id = str(candidate.get("id"))
        if candidate_id not in existing_ids:
            expanded_nodes.append(copy.deepcopy(candidate))
            existing_ids.add(candidate_id)

    preserved_nodes = []
    seen_ids = set()
    for node in expanded_nodes:
        node_id = str(node.get("id"))
        if node_id in HIDDEN_NODE_IDS or node_id in seen_ids:
            continue
        seen_ids.add(node_id)
        if node_id in quality_lookup:
            grade, note = quality_lookup[node_id]
            color = GRADE_COLORS[grade]
            border = "#000000" if grade == "ToDo" else ("#64748b" if grade == "등급 없음" else color)
            node["_grade"] = grade
            node["_quality"] = grade
            node["_quality_note"] = note
            node["community"] = QUALITY_COMMUNITY_IDS[grade]
            node["community_name"] = grade
            node["color"] = {
                **(node.get("color") or {}),
                "background": color,
                "border": border,
                "highlight": {
                    **((node.get("color") or {}).get("highlight") or {}),
                    "background": color,
                    "border": border,
                },
            }
            title_lines = str(node.get("title") or node.get("label") or node_id).split("\n")
            title_lines[0] = re.sub(
                r"^(.*? — )(?:상|중|하|ToDo|Closed|등급 없음)(.*)$",
                lambda title_match: f"{title_match.group(1)}{grade}{title_match.group(2)}",
                title_lines[0],
            )
            node["title"] = "\n".join(title_lines)
        preserved_nodes.append(node)
    return "const RAW_NODES = " + json.dumps(preserved_nodes, ensure_ascii=False) + ";"

s, nraw = re.subn(r"const RAW_NODES = (\[.*?\]);", _preserve_raw_nodes,
                  s, count=1, flags=re.S)

# graph.html 이 **런타임에** RAW_NODES 에 밀어 넣는 큐레이션 노드들이다(파일의 RAW_NODES
# 배열에는 없다). 아래 엣지 필터와 CURATED_POSITIONS 가 같은 목록을 봐야 한다 — 몰랐던
# 2026-09-19 에 cfmsDispersity 로 들어가는 엣지가 조용히 걸러졌다.
RUNTIME_CURATED_NODE_IDS = (
    "cfmsAutoSew", "cfmsAutoPlace_IJCST", "cfmsAutoPlace_JCDE", "cfmsDrapeSCAN",
    "SFTF_Holonomy", "HIPDetect", "cfmsDispersity",
    "TSE_TomoSh4", "TSE_TomoSh5",
)


def _preserve_goal_edges(match):
    """Keep the current development-goal edge snapshot without legacy growth.

    The public graph switched from application/lineage relations to a compact
    development-goal taxonomy on 2026-08-28.  Re-appending TODO_EDGES or
    CURATED_EDGE_UPDATES here silently restored the retired relationship set on
    every layout-only regeneration.  Positions and label rendering must leave
    the current RAW_EDGES payload intact, apart from structural cleanup.
    """
    edges = json.loads(match.group(1))
    edges = [
        edge for edge in edges
        if edge.get("from") not in HIDDEN_NODE_IDS and edge.get("to") not in HIDDEN_NODE_IDS
    ]
    edges = [
        edge for edge in edges
        if str(edge.get("from")) not in AUTOPLACE_IDS
        and str(edge.get("to")) not in AUTOPLACE_IDS
    ]
    edges = [
        edge for edge in edges
        if str(edge.get("from")) != "cfmsDrapeSCAN"
        and str(edge.get("to")) != "cfmsDrapeSCAN"
    ]
    # 계보 엣지는 이 파일이 정본이다. 스냅샷에 남은 옛 사본을 걷어내고 다시 넣어야
    # 아래 pair dedup 이 파일 쪽 라벨·설명을 이긴다.
    lineage_pairs = {
        (str(edge["from"]), str(edge["to"]))
        for edge in DYNAMIC_TARGET_SEARCH_GOAL_EDGES + COAUTHOR_KIM_GOAL_EDGES
        + JEON_GOAL_EDGES + MOLD_GOAL_EDGES
    }
    edges = [
        edge for edge in edges
        if (str(edge.get("from")), str(edge.get("to"))) not in lineage_pairs
    ]
    # TSE_SEM 논문 트랙 사슬도 이 파일이 정본이다 — 옛 TSE_SEM 화살표와 트랙 화살표를
    # 걷어내고 SEM_GOAL_EDGES 를 다시 넣는다.
    edges = [
        edge for edge in edges
        if str(edge.get("from")) not in SEM_IDS and str(edge.get("to")) not in SEM_IDS
    ]
    edges.extend(copy.deepcopy(DYNAMIC_TARGET_SEARCH_GOAL_EDGES))
    edges.extend(copy.deepcopy(COAUTHOR_KIM_GOAL_EDGES))
    edges.extend(copy.deepcopy(JEON_GOAL_EDGES))
    edges.extend(copy.deepcopy(MOLD_GOAL_EDGES))
    edges.extend(copy.deepcopy(AUTOPLACE_GOAL_EDGES))
    edges.extend(copy.deepcopy(DRAPESCAN_EDGES))
    edges.extend(copy.deepcopy(SEM_GOAL_EDGES))
    node_match = re.search(r"const RAW_NODES = (\[.*?\]);", s, flags=re.S)
    if node_match:
        node_ids = {str(node["id"]) for node in json.loads(node_match.group(1))}
        node_ids.update(RUNTIME_CURATED_NODE_IDS)
        edges = [
            edge for edge in edges
            if str(edge.get("from")) in node_ids and str(edge.get("to")) in node_ids
        ]
    deduped_edges = []
    seen_pairs = set()
    for edge in edges:
        pair = (str(edge.get("from")), str(edge.get("to")))
        if pair in seen_pairs:
            continue
        seen_pairs.add(pair)
        deduped_edges.append(edge)
    edges = deduped_edges
    return "const RAW_EDGES = " + json.dumps(edges, ensure_ascii=False) + ";"

edges_only = "--edges-only" in sys.argv[1:]
if edges_only:
    # Scoped graph maintenance: preserve all current node, quality, position,
    # hyperedge, and UI data while refreshing only RAW_EDGES.
    s = ORIGINAL_S
s, nedge = re.subn(r"const RAW_EDGES = (\[.*?\]);", _preserve_goal_edges,
                   s, count=1, flags=re.S)
if edges_only:
    assert nedge == 1, "RAW_EDGES block not found"
    # Edge additions change the hover summary as well as the drawn arrows.
    # Recompute only degree metadata; preserve every other node field verbatim.
    node_match = re.search(r"const RAW_NODES = (\[.*?\]);", s, flags=re.S)
    edge_match = re.search(r"const RAW_EDGES = (\[.*?\]);", s, flags=re.S)
    assert node_match and edge_match, "RAW_NODES/RAW_EDGES block not found"
    nodes = json.loads(node_match.group(1))
    edges = json.loads(edge_match.group(1))
    degree = {str(node["id"]): {"in": 0, "out": 0} for node in nodes}
    for edge in edges:
        source = str(edge.get("from"))
        target = str(edge.get("to"))
        if source in degree:
            degree[source]["out"] += 1
        if target in degree:
            degree[target]["in"] += 1
    for node in nodes:
        counts = degree[str(node["id"])]
        node["degree"] = counts["in"] + counts["out"]
        node["_in"] = counts["in"]
        node["_out"] = counts["out"]
        node["title"] = re.sub(
            r"차수 \d+ \(in \d+ / out \d+\)",
            f'차수 {node["degree"]} (in {counts["in"]} / out {counts["out"]})',
            node.get("title") or "",
        )
    nodes_js = "const RAW_NODES = " + json.dumps(nodes, ensure_ascii=False) + ";"
    s = re.sub(r"const RAW_NODES = \[.*?\];", lambda _m: nodes_js,
               s, count=1, flags=re.S)
    for dst in DSTS:
        io.open(dst, "w", encoding="utf-8", newline="").write(s)
    print(f"wrote {', '.join(str(dst) for dst in DSTS)} | edges only")
    raise SystemExit(0)
# 2026-09-13: 사이드바의 「최근 논문 quality」 보드를 걷어냈다. 등급은 노드 색과 Node Info
# 로 읽으므로 같은 내용을 표로 한 번 더 늘어놓을 이유가 없다(사용자 판단). 보드를 만들던
# quality_html·quality_html_rows 와 그 CSS 를 함께 지웠다.
#
# 위쪽의 제거 정규식(QUALITY_BOARD_BEGIN/END·<div id="quality-board">)은 **그대로 둔다** —
# 이미 배포된 graph.html 에서 옛 보드를 걷어내는 일을 그것들이 한다.
# QUALITY_ROWS·QUALITY_BY_ID·syncQualityBoard() 도 남는다. 노드 등급 색이 그 지도를 쓰고,
# 동기화 함수는 보드가 없으면 빈 NodeList 를 돌아 아무 일도 하지 않는다.
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

# Communities is now the paper-quality axis; rebuild its legend from the
# complete snapshot rather than retaining the historical research-track labels.
quality_legend = [
    {
        "cid": QUALITY_COMMUNITY_IDS[grade],
        "color": GRADE_COLORS[grade],
        "label": grade,
        "count": sum(1 for _id, _label, g, _note in QUALITY_ROWS if g == grade),
    }
    for grade in ("상", "중", "하", "ToDo", "등급 없음")
]
def _quality_legend(_match):
    return "const LEGEND = " + json.dumps(quality_legend, ensure_ascii=False) + ";"

s, nleg = re.subn(r"const LEGEND = (\[.*?\]);", _quality_legend, s, count=1, flags=re.S)

# Keep the sidebar summary consistent with the quality-only graph.
raw_nodes_for_stats = json.loads(re.search(r"const RAW_NODES = (\[.*?\]);", s, flags=re.S).group(1))
raw_edges_for_stats = json.loads(re.search(r"const RAW_EDGES = (\[.*?\]);", s, flags=re.S).group(1))

# New project nodes may arrive before a hand-tuned POS entry.  Give only
# missing IDs a deterministic outer-ring position so physics-disabled
# vis-network does not stack them at the origin.
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
    # A restored single project can still be a meaningful findings region;
    # graph.py renders one-node hulls as padded 3D shells.
    if members:
        hyperedges_for_graph.append({**hyperedge, "nodes": members})
# 엣지는 기본 표시이므로 파일의 RAW_EDGES 수를 적는다. 노드와 마찬가지로 런타임에
# 덧붙는 큐레이션분은 빠지며, 첫 화면의 updateStatsLine() 이 실제 가시 개수로 덮어쓴다.
raw_edges_for_stats = json.loads(re.search(r"const RAW_EDGES = (\[.*?\]);", s, flags=re.S).group(1))
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
# RAW_NODES 에 없고 런타임에 덧붙는 큐레이션 노드는 CURATED_POSITIONS 로도 내보내야
# 재생성 뒤에 좌표가 사라지지 않는다.
curated_position_ids = RUNTIME_CURATED_NODE_IDS
curated_pos_js = "const CURATED_POSITIONS = " + json.dumps(
    {
        node_id: {"x": POS[node_id][0], "y": POS[node_id][1]}
        for node_id in curated_position_ids
    },
    ensure_ascii=False,
) + ";"
s, ncurated_pos = re.subn(
    r"const CURATED_POSITIONS = \{.*?\};",
    lambda _m: curated_pos_js,
    s,
    count=1,
    flags=re.S,
)
assert ncurated_pos == 1, "CURATED_POSITIONS block not found"

# graph3d.html 의 z 축은 볼트의 논문 완성도(1=높음 … 10=낮음)를 쓴다.  graph.html 은
# 값을 나르기만 하고 2D 화면에서는 쓰지 않는다 — 3D 뷰가 정본 파일을 실시간으로
# 읽으므로, 여기 실어야 볼트가 바뀔 때 높이도 따라온다.
completeness_by_id = dict(PAPER_COMPLETENESS)
# 2026-09-14 부터 볼트 노트가 cfmsAutoPlace 처럼 트랙별 중첩 맵(Bezier/Tensor/AutoTune)이라
# _load_paper_completeness 가 «TSE_SEM_Bezier» 꼴 키를 만든다.  노드 id 는 같은 날 사용자
# 지시로 «TSE_SEM1_Bezier» 꼴이 되었으므로 vault_key 로 옮겨 싣고 볼트 키는 버린다 —
# 남겨 두면 그래프에 없는 id 가 3D 뷰의 높이 지도에 끼어든다.
for _node_id, (_stem, _key) in TRACK_NOTES.items():
    score = completeness_by_id.pop(f"{_stem}_{_key}", None)
    if score is not None:
        completeness_by_id[_node_id] = score
# 노트가 옛 형태(노트 하나에 값 하나)로 되돌아갔을 때의 대비책.  지금은 걸리지 않는다.
if LEGACY_SEM_ID in completeness_by_id:
    for track_id in SEM_TRACK_IDS:
        completeness_by_id.setdefault(track_id, completeness_by_id[LEGACY_SEM_ID])
completeness_js = "const PAPER_COMPLETENESS = " + json.dumps(
    dict(sorted(completeness_by_id.items())), ensure_ascii=False) + ";"
s, ncompleteness = re.subn(
    r"const PAPER_COMPLETENESS = \{.*?\};",
    lambda _m: completeness_js,
    s,
    count=1,
    flags=re.S,
)
if not ncompleteness:
    s, ncompleteness = re.subn(
        r"(const CURATED_POSITIONS = \{.*?\};)",
        lambda match: match.group(1) + "\n" + completeness_js,
        s,
        count=1,
        flags=re.S,
    )
assert ncompleteness == 1, "PAPER_COMPLETENESS block not written"

# 노드별 투고 단계.  한 노트가 논문 둘을 담는 트랙 노드(cfmsAutoPlace_IJCST·TSE_TomoSh4 …)는
# 부모 노트의 단계를 물려받는다 — 볼트 대시보드의 분리트랙이 그렇게 적혀 있다.
stage_by_id = {}
# 노드 id 와 노트 이름의 대소문자가 어긋난 짝이 있다(HIPDetect 노드 ↔ HipDetect.md).
_stage_ci = {stem.lower(): stage for stem, stage in NOTE_STAGES.items()}
for _node_id in POS:
    # 부모 노트와 단계가 갈린 트랙은 물려받기 전에 덮는다(TRACK_STAGES 주석 참고).
    if _node_id in TRACK_STAGES:
        stage_by_id[_node_id] = TRACK_STAGES[_node_id]
        continue
    # 트랙 노드는 이름 규칙으로 못 푸는 짝이라 표를 먼저 본다.
    _track_note = TRACK_NOTES.get(_node_id, (None, None))[0]
    if _track_note in NOTE_STAGES:
        stage_by_id[_node_id] = NOTE_STAGES[_track_note]
        continue
    if _node_id in NOTE_STAGES:
        stage_by_id[_node_id] = NOTE_STAGES[_node_id]
        continue
    if _node_id.lower() in _stage_ci:
        stage_by_id[_node_id] = _stage_ci[_node_id.lower()]
        continue
    _parents = [stem for stem in NOTE_STAGES if _node_id.lower().startswith(stem.lower() + "_")]
    if _parents:
        stage_by_id[_node_id] = NOTE_STAGES[max(_parents, key=len)]
stages_js = "const VAULT_STAGES = " + json.dumps(
    dict(sorted(stage_by_id.items())), ensure_ascii=False) + ";"
s, nstages = re.subn(r"const VAULT_STAGES = \{.*?\};", lambda _m: stages_js, s, count=1, flags=re.S)
if not nstages:
    s, nstages = re.subn(
        r"(const PAPER_COMPLETENESS = \{.*?\};)",
        lambda match: match.group(1) + "\n" + stages_js,
        s,
        count=1,
        flags=re.S,
    )
assert nstages == 1, "VAULT_STAGES block not written"

# 교내 공저 후보 (2026-09-16).  노드 id 와 노트 이름이 같은 것만 싣는다 — 후보가 적힌 여섯
# 노트는 모두 그렇다.  VAULT_STAGES 바로 뒤에 두고, graph.html 의 showInfo 가 읽는다.
_graph_node_ids = set(re.findall(r'"id": "([A-Za-z0-9_]+)"', s))
candidates_js = "const COAUTHOR_CANDIDATES = " + json.dumps(
    {stem: text for stem, text in sorted(COAUTHOR_CANDIDATES.items()) if stem in _graph_node_ids},
    ensure_ascii=False) + ";"
s, ncandidates = re.subn(r"const COAUTHOR_CANDIDATES = \{.*?\};", lambda _m: candidates_js, s, count=1, flags=re.S)
if not ncandidates:
    s, ncandidates = re.subn(
        r"(const VAULT_STAGES = \{.*?\};)",
        lambda match: match.group(1) + "\n" + candidates_js,
        s,
        count=1,
        flags=re.S,
    )
assert ncandidates == 1, "COAUTHOR_CANDIDATES block not written"

hyper_js = "const hyperedges = " + json.dumps(hyperedges_for_graph, ensure_ascii=False) + ";"
s, n2 = re.subn(r"const hyperedges = \[.*?\];", lambda _m: hyper_js, s, count=1,
                flags=re.S)

def _replace_curated_hyperedge_members(_match):
    # 이 상수는 **아직 파일에 없는 노드**를 훌에 덧붙이는 장치다. hyperedges_for_graph 는
    # 그 시점의 RAW_NODES 에 있는 id 만 남기는데, 큐레이션으로 뒤늦게 붙는 노드
    # (cfmsAutoSew·HIPDetect 등)가 그보다 나중에 들어오기 때문이다. 그래서 걸러진 구성원을
    # 그대로 실어 두고, 페이지가 로드할 때 다시 붙인다.
    #
    # 2026-09-14: 「의복 시뮬레이션」 한 훌만 손으로 적던 것을 **HYPEREDGES 전체에서 자동으로
    # 계산**하게 바꿨다. 공저자 훌에도 같은 사정이 있는데(이희란 교수님의 cfmsAutoSew·
    # HIPDetect) 손으로 적은 목록에는 그 자리가 없었다.
    late = {}
    for hyperedge in HYPEREDGES:
        missing = [
            str(node_id) for node_id in hyperedge.get("nodes", [])
            if str(node_id) not in node_ids_for_hyperedges
        ]
        if missing:
            late[hyperedge["label"]] = missing
    return "const CURATED_HYPEREDGE_MEMBERS = " + json.dumps(late, ensure_ascii=False) + ";"
s, ncurated_hyperedges = re.subn(
    r"const CURATED_HYPEREDGE_MEMBERS = (\{.*?\});",
    _replace_curated_hyperedge_members,
    s,
    count=1,
    flags=re.S,
)
s = re.sub(
    r"// 2026-08-30: cfmsAutoSew2026·cfmsAutoPlace2026 프로젝트와 의복 CAD 데이터 흐름을 공개 그래프에 편입\.",
    "// 2026-09-01: cfmsAutoPlace2026의 CAD·IJCST 패턴 논문 트랙을 별도 노드로 공개 그래프에 편입.",
    s,
    count=1,
)
s, n3 = re.subn(r"<title>.*?</title>",
                "<title>SFTF/PFTF 연구 그래프 — 3D프린팅 + 공저자</title>", s, count=1,
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

# Hull labels follow a polygon edge and choose the least-overlapping outward
# position against vis-network's actual node/label bounding boxes.
s = re.sub(r"\n// HYPEREDGE_LABEL_HELPERS_BEGIN.*?// HYPEREDGE_LABEL_HELPERS_END\n?",
           "\n", s, flags=re.S)
label_helper_anchor = "// afterDrawing passes ctx already transformed to network coordinate space."
assert label_helper_anchor in s
s = s.replace(label_helper_anchor,
              HYPEREDGE_LABEL_HELPERS_JS + "\n" + label_helper_anchor, 1)
s = re.sub(
    r"\n    const nodeLabelBoxes = _nodeLabelBoxes\(\);\n"
    r"    const placedHyperedgeLabelBoxes = \[\];"
    r"(?:\n    const hyperedgeViewport = _hyperedgeViewportBounds\(\);)?",
    "", s, count=1,
)
s, nlabel_frame = re.subn(
    r"(network\.on\('afterDrawing', function\(ctx\) \{\n"
    r"    if \(!showHyper\) return;[^\n]*\n)",
    r"\1    const nodeLabelBoxes = _nodeLabelBoxes();\n"
    r"    const placedHyperedgeLabelBoxes = [];\n"
    r"    const hyperedgeViewport = _hyperedgeViewportBounds();\n",
    s, count=1,
)
s, nf3 = re.subn(
    r"        // Label[^\n]*\n.*?        ctx\.setLineDash\(\[\]\);",
    "        // Label: choose a hull edge and follow its direction while avoiding nodes.\n"
    "        _drawHyperedgeLabel(ctx, h, expanded, cx, cy, nodeLabelBoxes, placedHyperedgeLabelBoxes, hyperedgeViewport);\n"
    "        ctx.setLineDash([]);",
    s, count=1, flags=re.S,
)
redraw_js = '''// HYPEREDGE_INITIAL_REDRAW_BEGIN
// The network can finish its first frame before the overlay listeners above
// are registered. Draw once more so hulls and rotated labels appear on load.
network.redraw();
// HYPEREDGE_INITIAL_REDRAW_END'''
s = re.sub(r"\n// HYPEREDGE_INITIAL_REDRAW_BEGIN.*?// HYPEREDGE_INITIAL_REDRAW_END\n?",
           "\n", s, flags=re.S)
redraw_anchor = "</script>\n</body>\n</html>"
assert redraw_anchor in s
s = s.replace(redraw_anchor, redraw_js + "\n" + redraw_anchor, 1)
assert nlabel_frame == nf3 == 1, (nlabel_frame, nf3)

# ------------------------------------------------- 프린터 친화 라이트 테마 (2026-07-19d)
# 배경과 캡션 CSS만 정규화한다. 최신 public graph의 ToDo node fill은
# 의도적으로 white이므로 JSON 전체의 #ffffff 값을 회색으로 바꾸지 않는다.
s = re.sub(r'("font": \{"size": \d+, "color": )"(?:#ffffff|#333333)"',
           lambda m: m.group(1) + '"#333333"', s)
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
    '"id": "SFTF_DynamicTargetSearch", "label": "SFTF_DynamicTargetSearch", '
    '"color": {"background": "#c8c8c8", "border": "#000000", '
    '"highlight": {"background": "#c8c8c8", "border": "#000000"}}',
    '"id": "SFTF_DynamicTargetSearch", "label": "SFTF_DynamicTargetSearch", '
    '"color": {"background": "#ffffff", "border": "#000000", '
    '"highlight": {"background": "#ffffff", "border": "#000000"}}',
)
s = s.replace(
    '"id": "PFTF_GFiberCT", "label": "PFTF_GFiberCT", '
    '"color": {"background": "#c8c8c8", "border": "#000000", '
    '"highlight": {"background": "#c8c8c8", "border": "#000000"}}',
    '"id": "PFTF_GFiberCT", "label": "PFTF_GFiberCT", '
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

# ── 노드 좌표를 웹에서 바로 저장하기 (2026-09-13) ─────────────────────────────
# 드래그한 배치를 「위치 복사」 → 파일 → 커밋으로 옮기던 길 대신, 「노드 저장」 한 번으로
# Supabase `graph_positions` 에 올린다. 파일의 POS 는 씨앗(오프라인·표가 빌 때)으로 남고,
# 가끔 `node scripts/pull-graph-positions.mjs` 로 표의 값을 파일에 되받아 굳힌다.
POSITION_SAVE_BUTTON = (
    '&nbsp;<button id="save-pos-btn" title="현재 배치를 모두에게 보이도록 Supabase 에 저장합니다 (로그인 필요)" '
    'style="font-size:14px;padding:2px 8px;cursor:pointer;border:1px solid #2f6feb;border-radius:4px;'
    'background:#eaf1ff;color:#1d4ed8;font-weight:600">노드 저장</button>'
    '<span id="save-pos-note" style="font-size:11px;color:#666;margin-left:6px"></span>'
)
# 앞 공백은 먹지 않는다 — 먹으면 다음 재생성 때 버튼이 stats 줄에 눌어붙어 재생성이
# 멱등하지 않게 된다(2026-09-13 에 실제로 그랬다).
s = re.sub(r'&nbsp;<button id="save-pos-btn".*?</span>', "", s, flags=re.S)
s = s.replace('&nbsp;<button id="reset-pos-btn"',
              POSITION_SAVE_BUTTON + '&nbsp;<button id="reset-pos-btn"', 1)

POSITION_SYNC_JS = r'''// GRAPH_POSITION_SYNC_BEGIN — 노드 좌표를 Supabase graph_positions 와 주고받는다.
// (정본은 layout_findings.py 다. graph.html 을 직접 고치면 다음 재생성 때 사라진다)
//
// 왜 research_outputs 가 아니라 별도 표인가 — 그쪽에도 pos_x/pos_y 가 있지만 **볼트가
// 정본**이라 볼트를 발행할 때마다 노트의 node_pos 로 덮어써진다. 웹에서 끌어 놓은 배치는
// 볼트가 모르는 값이므로 충돌하지 않는 자리(graph_positions)에 둔다.
//
// 우선순위: 이 브라우저의 미저장 드래그(localStorage) > 표의 공유 좌표 > 파일의 POS.
// 「노드 저장」을 누르면 현재 배치가 표로 올라가고, 그 순간 로컬 스크래치는 버린다 —
// 그래야 「내 화면만 다른」 상태가 남지 않는다.
(function () {
  const SUPA_URL = "https://ijutjirouxgqcldjyhma.supabase.co";
  const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqdXRqaXJvdXhncWNsZGp5aG1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MDk4MDAsImV4cCI6MjA5Nzk4NTgwMH0.gIAwf6a2oY-DkTXaf5eM2L4ROMCKim5WsevGfjol7tE";
  const norm = u => (u || "").trim().replace(/\/+$/, "");
  let url = SUPA_URL, key = SUPA_KEY, session = null;
  try { url = norm(localStorage.getItem("cfms_url") || SUPA_URL); } catch (e) {}
  try { key = (localStorage.getItem("cfms_key") || SUPA_KEY).trim(); } catch (e) {}
  try { session = JSON.parse(localStorage.getItem("cfms_session") || "null"); } catch (e) {}
  const REST = url + '/rest/v1/graph_positions';
  const SHARED = {};
  const loggedIn = () => !!(session && session.access_token);

  const btn = document.getElementById('save-pos-btn');
  const note = document.getElementById('save-pos-note');
  function say(text, ok) {
    if (!note) return;
    note.textContent = text || '';
    note.style.color = ok === false ? '#9a3412' : '#4b5563';
  }

  // force=false 면 아직 저장하지 않은 내 드래그는 건드리지 않는다.
  function applyShared(force) {
    let moved = 0;
    RAW_NODES.forEach(n => {
      const p = SHARED[n.id];
      if (!p) return;
      if (!force && savedPos[n.id]) return;
      network.moveNode(n.id, p.x, p.y);
      moved += 1;
    });
    return moved;
  }

  async function load() {
    try {
      const res = await fetch(REST + '?select=id,x,y', { headers: { apikey: key, Authorization: 'Bearer ' + key } });
      if (!res.ok) return;                    // 표가 없거나 권한이 없다 — 파일의 POS 로 그린다
      const rows = await res.json();
      if (!Array.isArray(rows) || !rows.length) return;
      rows.forEach(r => { if (NODE_BY_ID[r.id]) SHARED[r.id] = { x: r.x, y: r.y }; });
      if (applyShared(false)) network.redraw();
      const mine = Object.keys(savedPos).length;
      say('공유 배치 ' + rows.length + '개' + (mine ? (' · 내 미저장 ' + mine + '개') : ''));
    } catch (e) { /* 오프라인 — 조용히 파일 값으로 */ }
  }

  async function save() {
    if (!loggedIn()) { askLogin(); return; }
    const ids = RAW_NODES.map(n => n.id);
    const all = network.getPositions(ids);
    const rows = ids.filter(id => all[id]).map(id => ({
      id: id, x: Math.round(all[id].x), y: Math.round(all[id].y), updated_at: new Date().toISOString(),
    }));
    btn.disabled = true;
    say('저장 중…');
    try {
      const res = await fetch(REST, {
        method: 'POST',
        headers: {
          apikey: key, Authorization: 'Bearer ' + session.access_token,
          'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(rows),
      });
      if (res.status === 401) {
        session = null;
        try { localStorage.removeItem('cfms_session'); } catch (e) {}
        say('세션이 만료됐습니다. 다시 로그인해 주세요.', false);
        askLogin();
        return;
      }
      if (!res.ok) {
        const body = await res.text();
        say(/graph_positions|PGRST205|42P01/i.test(body)
          ? 'graph_positions 표가 없습니다 — schema_graph_positions.sql 을 먼저 돌려 주세요.'
          : ('저장 실패 (' + res.status + ')'), false);
        return;
      }
      rows.forEach(r => { SHARED[r.id] = { x: r.x, y: r.y }; });
      savedPos = {};
      try { localStorage.removeItem(POS_STORE_KEY); } catch (e) {}
      say('저장했습니다 — ' + rows.length + '개');
    } catch (e) {
      say('저장 실패: ' + e.message, false);
    } finally {
      btn.disabled = false;
    }
  }

  // 이 페이지에는 로그인 UI 가 없다(열람 전용이므로). 저장할 때만 작은 상자를 띄우고,
  // 세션은 다른 랩 웹앱과 같은 localStorage 키(cfms_session)를 함께 쓴다.
  function askLogin() {
    if (document.getElementById('pos-login')) return;
    const box = document.createElement('div');
    box.id = 'pos-login';
    box.style.cssText = 'position:fixed;z-index:120;top:52px;right:16px;width:250px;padding:13px 14px;'
      + 'background:#fff;border:1px solid #cbd5e1;border-radius:10px;box-shadow:0 12px 32px rgba(15,23,42,.16);'
      + "font:13px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
    box.innerHTML = '<div style="font-weight:700;margin-bottom:7px">노드 저장 — 로그인</div>'
      + '<div style="font-size:11.5px;color:#64748b;margin-bottom:9px">upjuk·마인드맵과 같은 계정입니다.</div>'
      + '<input id="pos-email" type="email" placeholder="이메일" style="width:100%;margin-bottom:6px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px">'
      + '<input id="pos-pw" type="password" placeholder="비밀번호" style="width:100%;margin-bottom:8px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px">'
      + '<div id="pos-login-err" style="color:#b91c1c;font-size:11.5px;min-height:15px;margin-bottom:6px"></div>'
      + '<button id="pos-login-go" style="padding:5px 11px;border:none;border-radius:6px;background:#2f6feb;color:#fff;font-weight:600;cursor:pointer">로그인</button>'
      + '<button id="pos-login-cancel" style="margin-left:6px;padding:5px 11px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;cursor:pointer">취소</button>';
    document.body.appendChild(box);
    const err = box.querySelector('#pos-login-err');
    box.querySelector('#pos-login-cancel').addEventListener('click', () => box.remove());
    box.querySelector('#pos-login-go').addEventListener('click', async () => {
      const email = box.querySelector('#pos-email').value.trim();
      const pw = box.querySelector('#pos-pw').value;
      if (!email || !pw) { err.textContent = '이메일과 비밀번호를 입력하세요.'; return; }
      try {
        const res = await fetch(url + '/auth/v1/token?grant_type=password', {
          method: 'POST',
          headers: { apikey: key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, password: pw }),
        });
        if (!res.ok) { err.textContent = '로그인 실패 — 이메일/비밀번호를 확인하세요.'; return; }
        const data = await res.json();
        session = { access_token: data.access_token, refresh_token: data.refresh_token, email: email };
        try { localStorage.setItem('cfms_session', JSON.stringify(session)); } catch (e) {}
        box.remove();
        save();
      } catch (e) { err.textContent = '로그인 실패: ' + e.message; }
    });
    box.querySelector('#pos-pw').addEventListener('keydown', e => {
      if (e.key === 'Enter') box.querySelector('#pos-login-go').click();
    });
  }

  if (btn) btn.addEventListener('click', save);
  // 「위치 초기화」는 파일의 POS 로 되돌린다. 공유 배치가 있으면 그쪽이 「모두가 보는 배치」
  // 이므로 초기화의 종착지도 그쪽이어야 한다. 원래 핸들러가 끝난 뒤 덮어쓴다.
  // 같은 click 이벤트 안에서 원래 핸들러 **바로 뒤에** 돌아야 한다. setTimeout 으로 미루면
  // 그 사이에 한 프레임이 그려져서, 표와 파일의 배치가 다를 때 파일 값이 번쩍였다가
  // 공유 값으로 튀는 것처럼 보인다(2026-09-13 사용자 보고).
  const resetBtn = document.getElementById('reset-pos-btn');
  if (resetBtn) resetBtn.addEventListener('click', () => {
    if (applyShared(true)) network.redraw();
  });
  load();
})();
// GRAPH_POSITION_SYNC_END'''
s = re.sub(r"\n// GRAPH_POSITION_SYNC_BEGIN.*?// GRAPH_POSITION_SYNC_END\n?", "\n", s, flags=re.S)
position_sync_anchor = "// HYPEREDGE_INITIAL_REDRAW_BEGIN"
assert position_sync_anchor in s, "position sync anchor not found"
s = s.replace(position_sync_anchor, POSITION_SYNC_JS + "\n" + position_sync_anchor, 1)

# Draw edge captions after every other first-script overlay so the white text
# halo remains legible above hull fills and progress badges.  Replacing the
# marked block makes this safe to rerun after future graph refreshes.
s = re.sub(r"\n// EDGE_LABEL_LAYOUT_BEGIN.*?// EDGE_LABEL_LAYOUT_END\n?",
           "\n", s, flags=re.S)
edge_label_anchor = "\n</script>\n<script>\n/* ====== Supabase 공유 노드(research_outputs, kind='node') 오버라이드"
assert edge_label_anchor in s, "Supabase script anchor not found"
s = s.replace(
    edge_label_anchor,
    "\n" + EDGE_LABEL_LAYOUT_JS + edge_label_anchor,
    1,
)

# 의존성 블록: 기존 블록 제거 후 afterDrawing 핸들러 끝에 삽입 (멱등)
s = re.sub(r"\n// FINDING_DEPS_BEGIN.*?// FINDING_DEPS_END", "", s, flags=re.S)
anchor = "        ctx.restore();\n    });\n});"
assert anchor in s, "afterDrawing anchor not found"
repl = "        ctx.restore();\n    });\n" + DEPS_JS + "\n});"
s, n4 = re.subn(re.escape(anchor), lambda _m: repl, s, count=1)

assert n1 == ncurated_pos == n2 == ncurated_hyperedges == n3 == n4 == nleg == nraw == nedge == nstats == 1, (
    n1, ncurated_pos, n2, ncurated_hyperedges, n3, n4, nleg, nraw, nedge, nstats
)
missing = [k for k in POS if f'"{k}"' not in s]
for dst in DSTS:
    io.open(dst, "w", encoding="utf-8", newline="").write(s)
print(f"wrote {', '.join(str(dst) for dst in DSTS)} | POS {len(POS)} nodes, "
      f"hulls {len(HYPEREDGES)}, deps {DEPS_JS.count('{from:')} | missing ids: {missing}")
print(f"canonical output stays in KIT_sodi: {HERE / 'graph.html'}")
