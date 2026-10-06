반도체 공정 실험실 - 웹서버에 올리는 방법
==========================================

1. 이 폴더(semiconductor-labs) 전체를 웹서버에 그대로 올립니다.
   - lib 폴더도 꼭 함께 올려야 합니다. (3D 화면과 QR 코드에 필요)
   - 서버 프로그램이나 데이터베이스는 필요 없습니다. 정적 파일만 올리면 됩니다.
     (학교 웹서버, GitHub Pages, HTML 업로드가 되는 LMS 등 어디든 가능)

2. 학생들에게는 index.html 주소 하나만 알려 주면 됩니다.
   예) https://내서버주소/semiconductor-labs/
   - index.html을 웹서버에서 열면 그 주소의 QR 코드가 화면에 나타납니다.
     수업 시간에 화면에 띄워 학생들이 휴대폰으로 찍게 하세요.

3. 파일 목록 (번호 = 수업 순서)
   index.html                   목차 페이지 (QR 코드 포함)
   1  chip-fab.html             내 이름 칩 공장 (설명용, 칩 하나)
   2  chip-fab-multi-die.html   내 이름 칩 공장 · 멀티 다이 (학생 실습용)
   3  etch-lab.html             습식·건식 식각 실험실
   4  deposition-shooter.html   증착 버블 슈터 (PVD·CVD·ALD)
   5  transistor-evolution.html MOSFET에서 MBCFET까지
   6  cpu-gpu-memory.html       CPU와 GPU, DRAM과 HBM (게임 로딩 포함)
   lib/three.min.js             3D 그래픽 라이브러리 (three.js r128, MIT 라이선스)
   lib/qrcode.min.js            QR 코드 라이브러리 (qrcodejs 1.0.0, MIT 라이선스)

4. 인터넷 연결에 대해
   - 글꼴만 Google Fonts에서 불러옵니다. 인터넷이 막혀 있어도 기본 글꼴(맑은 고딕 등)로
     바뀔 뿐 모든 기능은 그대로 동작합니다.
   - 나머지는 모두 이 폴더 안에 들어 있습니다.

5. 수업 전에 확인할 것
   - 올린 뒤 학생들이 쓰는 휴대폰으로 각 페이지를 한 번씩 열어 보세요.
   - 칩 공장 두 페이지는 3D 화면이라 오래된 휴대폰에서는 느릴 수 있습니다.
   - 증착 버블 슈터의 결과 비교표는 학생 각자의 브라우저에만 저장됩니다.

6. 내 컴퓨터에서 미리 보기
   - index.html을 더블클릭해도 열립니다. (이때는 QR 코드만 나오지 않습니다)
