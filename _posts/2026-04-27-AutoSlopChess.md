---
title: "[SPACE WAR @ TAURUS (PWN)] AutoSlopChess"
date: 2026-04-27 04:00:00 +0900
categories: [CTF/Wargame]
tags: [ctf, web, SPACE WAR]
---

# 2026 SPACE WAR - 02.TAURUS CTF 문제 풀이

## 0. 개요
``문제 이름`` : AutoSlopChess
문제 유형 : Pwnable

 

이 문제는 UAF와 tcache poisoning을 이용해
함수 포인터를 덮어쓰고 원하는 함수를 실행하는 문제였다.

목표는 최종적으로 callback 함수 포인터를 조작하여 flag를 출력하는 것이다.

1. 프로그램 구조 분석
바이너리는 strip되지 않아 주요 함수들이 그대로 드러난다.

 

대표 함수:

recruitChampionWithCertifiedNonHallucinatedMemory
fieldChampionViaDeepCopyCloud
sellChampionButOnlyIfRefcountLooksHealthy
inspectSigilsWithOverflowResistance
carveSigilsWithMilitaryGradeBoundChecks
queue_ranked_and_seal_the_arena
1-1. 메모리 구조
프로그램은 벤치 / 보드 각각 8개 슬롯을 가진다.

각 슬롯:

 
struct ChampionSlot {
void *heap_ptr;
size_t alloc_size;
size_t rune_size;
char name[0x18];
uint32_t hp;
uint32_t atk;
uint32_t tier;
};
 
실제 데이터는 별도의 heap chunk에 존재
malloc(rune_size + 0x18) 구조

1-2. 핵심 버그
문제의 핵심은 여기서 시작된다.

 
fieldChampionViaDeepCopyCloud()
 
이 함수는 이름과 다르게 deep copy를 하지 않는다

포인터를 그대로 복사한다

 

즉:

bench 슬롯
board 슬롯
같은 heap chunk를 공유

2. 취약점 분석
2-1. Use-After-Free (UAF)
 

공격 흐름:

bench에 챔피언 생성
board로 field
bench에서 sell
 
free(slot->heap_ptr);
 
bench만 초기화된다.
board는 그대로 dangling pointer 유지

결과:

free된 chunk에 대해
inspect / carve 가능
완전한 UAF

2-2. tcache poisoning
glibc tcache safe-linking 구조:

 
fd = next ^ (chunk_addr >> 12)
 
UAF로 free된 chunk를 읽으면 safe-linked pointer leak 가능

leak 복구
두 chunk를 free하면:

leak1 = NULL ^ (addr >> 12)
leak2 = prev ^ (addr >> 12)
 
실제 주소 계산:

chunk1 = leak2 ^ leak1
chunk2 = chunk1 + 0x50
 
heap 주소 복구 성공

poisoning
다음 fd를 조작:

 
fd = target ^ (chunk_addr >> 12)
 
원하는 주소 반환 가능

3. 공격 목표
핵심 타겟:

 
(*(void (*)()) cross_region_evaluation_cache[2])();
 
주소:

0x4074c0
 
함수 포인터 overwrite 가능

3-1. 호출 흐름
queue_ranked_and_seal_the_arena()
→ callback 호출
→ seccomp 적용
 
callback은 seccomp 이전에 실행된다.

3-2. 사용할 함수
warmArchivedReplayCache (0x4014cf)
 
이 함수는:

"flag" 문자열 사용
open("./flag")
read
write
flag 출력 함수

4. 익스플로잇 흐름
전체 흐름은 다음과 같다.

1) 동일 크기 chunk 준비
rune_size = 32
 
동일 tcache bin 사용

2) UAF 발생
bench → field → sell
 
board에서 dangling pointer 확보

3) heap leak
inspect → safe-linking 값 추출
→ heap 주소 계산
 
4) tcache poisoning
fd → 0x4074c0 (callback 주소)
 
5) allocation
malloc → poisoned chunk 반환
 
callback 위치 획득

6) overwrite
*(0x4074c0) = 0x4014cf
 
7) 트리거
queue ranked
 
warmArchivedReplayCache 실행

flag 출력

5. 전체 공격 흐름 정리
UAF 생성
safe-linking leak
heap 주소 복구
tcache poisoning
callback 주소 overwrite
queue 호출
flag 출력
6. 포인트
이 문제의 포인트는 다음 두 줄이다.

deep copy가 아니라 pointer copy

free 후에도 다른 슬롯에서 접근 가능

이를 기반으로:

UAF 발생
tcache poisoning
함수 포인터 overwrite
전체 exploit chain 완성

7. 정리
shallow copy로 인해 발생한 UAF를 이용해 tcache poisoning을 수행하고, callback을 덮어써 flag 출력 함수를 실행하는 문제

8. 최종 플래그
hspace{4N_A1_Sl0P_G4m3_f0R_4I_5LOp}
