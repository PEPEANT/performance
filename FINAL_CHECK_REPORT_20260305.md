# Final Check Report (2026-03-05)

## 범위
- performance 단독 서비스 구조 점검
- Emptines 포탈 링크 경로 호환성 확인
- 소켓 멀티플레이(호스트/플레이어/채팅/공연 상태/정원 50) 검증
- 렌더링 관련 회귀 여부(스크린 위치 조정 포함) 점검

## 최종 판정
- 판정: 통과(배포 가능)
- 조건: 아래 "권장 개선"은 추후 반영 가능, 필수 차단 이슈는 현재 없음

## 필수 수정 (이번 점검에서 실제 반영)
1. 호스트 미지정 룸에서 운영 불가 리스크 수정
- 문제: 모든 클라이언트가 player 의도로 접속하면 hostId가 비어, 공연 시작/문 제어가 막힐 수 있음
- 조치: 서버에서 호스트 의도자가 없을 때 룸 첫 플레이어를 자동 호스트로 폴백
- 파일: `server.js` (`findHostCandidate`)
- 상태: 완료

## 링크/서버/렌더링 점검 결과
1. 링크 연결
- Emptines 고정 타겟 `/performance/index.html?from=emptines` 기준으로 라우팅 정상
- `/performance/*` 별칭 라우트 정상

2. 서버 연결
- Socket.IO 이벤트 정상
- `host:update`, `door:state`, `show:state`, `chat:recv`, `room:snapshot` 전파 정상
- `HOST_ONLY` 가드 정상

3. 렌더링/씬 구성
- 무대 뒤 스크린 위치 조정 반영
- 변경값: `screen.position.set(0, stageHeight + 11.2, -86)`
- 회귀 없음

## 자동 검증 결과 (`npm run qa:smoke`)
- 총 21개 체크 통과
- 주요 통과 항목
1. `/`, `/performance/`, `/performance/index.html` 응답 + UTF-8
2. `/performance/app.js`, `/performance/style.css`, `/performance/asset-manifest.json` 응답 + UTF-8
3. 호스트/플레이어 역할 분리
4. 호스트 의도자 없음 룸에서 자동 호스트 폴백
5. 문 제어/공연 시작/채팅 브로드캐스트
6. 룸 스냅샷 동기화
7. 50명 정원 채우기 + 51번째 `ROOM_FULL` 차단

## 권장 개선 (필수 아님)
1. 브라우저 2탭 수동 체크 항목 고정
- 점프 체감
- 의자 충돌 체감
- 포탈 근접 입장 UX 문구

2. Emptines 통합 배포 시 운영 규칙 문서화
- 호스트 접속 URL 규칙
- 룸 코드 운영 규칙
- 장애 시 롤백 브랜치

3. 성능 계측 로그(선택)
- 접속자 20/50명 구간 프레임 평균 기록
- 모바일(중저사양) 품질 모드 강제 기준 정의
