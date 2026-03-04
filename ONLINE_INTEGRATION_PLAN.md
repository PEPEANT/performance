# 온라인/채팅 연동 계획 (Performance 기준)

## 목표
- 현재 로컬 프로토타입(1인칭 + HUD + 채팅 UI + 플레이어 아바타)을 Emptines 방식의 실시간 멀티플레이로 확장
- 단일 오리진 구조를 유지하면서 세션 재접속/호스트 충돌 리스크를 줄임

## 현재 상태
- 1인칭 이동/시점, HUD, 채팅 UI, 플레이어 아바타 렌더 레이어는 클라이언트에 적용됨
- 채팅은 로컬 UI 동작 상태 (네트워크 미연동)
- 리모트 플레이어는 데모 렌더 상태 (네트워크 미연동)

## 아키텍처
1. 전송 계층
- `socket.io` 단일 연결 사용
- 룸 키: `performance:{roomId}`
- 메시지 직렬화: JSON (필수 필드만 전송)

2. 동기화 모델
- 서버 권위(authoritative) 최소 모델
- 클라이언트는 입력/자세를 전송, 서버는 스냅샷 브로드캐스트
- 보간은 클라이언트에서 수행

3. 데이터 모델
- PlayerState
  - `id`, `name`
  - `x`, `y`, `z`, `yaw`, `pitch`
  - `map` (`lobby|hall`)
  - `ts`
- ChatMessage
  - `id`, `senderId`, `senderName`, `text`, `ts`

## 이벤트 계약 (초안)
- `room:join` `{ roomId, name, map }`
- `room:joined` `{ selfId, players[] }`
- `room:leave` `{}`
- `player:state` `{ x, y, z, yaw, pitch, map, ts }` (클라이언트 -> 서버, 15~20Hz)
- `room:snapshot` `{ players[], gone[] }` (서버 -> 클라, 10~15Hz)
- `chat:send` `{ text, ts }`
- `chat:recv` `{ id, senderId, senderName, text, ts }`
- `room:error` `{ code, message }`

## 단계별 구현
1. 서버 골격 이식
- Emptines `server/socket/registerSocketHandlers.js` 패턴을 성능 저장소에 포팅
- `performance` 룸 전용 핸들러 분리 (`server/performanceRoom.js`)

2. 클라이언트 소켓 연결
- `app.js`에 소켓 모듈 추가
- 접속 시 `room:join` 송신, 종료 시 `room:leave`

3. 플레이어 동기화
- 로컬 1인칭 상태를 `player:state`로 주기 전송
- 수신 스냅샷으로 `remotePlayers`를 upsert/remove
- 선형 보간 + 각도 보간 적용

4. 채팅 연동
- `sendChatMessageFromInput()` -> `chat:send`
- `chat:recv` 수신 시 `appendChatLine()` 반영
- 시스템 메시지/자기 메시지 스타일 분리 유지

5. 안정화
- 전송 주기 제한(스로틀)
- stale remote 제거 타임아웃
- 재연결 시 상태 초기화
- 방 인원 상한 50명 검증

## 성능 가드레일 (50인 기준)
- 상태 전송: 플레이어당 15Hz 이하
- 스냅샷 압축: 숫자 필드 라운딩(소수점 2~3자리)
- 원거리 플레이어 LOD
  - 거리 기반 메쉬 표시/숨김
  - 이름표/채팅 버블 거리 제한
- 모바일
  - 그림자/파티클 낮춤
  - 리모트 업데이트 주기 완화

## 테스트 체크리스트
- 2명/10명/30명/50명 순차 부하 테스트
- 지연 100ms/200ms/300ms에서 보간 튐 확인
- 채팅 스팸/긴 메시지/빈 메시지 필터
- 재접속/탭 전환/모바일 백그라운드 복귀
- 로비<->공연장 map 전환 시 상태 보존

## 배포 순서
1. 로컬 멀티플레이 테스트
2. Render 스테이징 배포
3. 10명 내부 테스트
4. 50명 공개 리허설
5. 본 배포
