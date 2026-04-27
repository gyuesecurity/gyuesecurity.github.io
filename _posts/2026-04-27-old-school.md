---
title: "[SPACE WAR @ TAURUS (PWN)] old-school"
date: 2026-04-27 07:00:00 +0900
categories: [CTF/Wargame]
tags: [ctf, pwn, SPACE WAR]
---

# 2026 SPACE WAR - 02.TAURUS CTF 문제 풀이

## 0. 개요

**문제 이름** : old-school  
**문제 유형** : Pwnable  
   
이 문제는 전형적인 힙 취약점처럼 보이지만, 실제 핵심은 다음 두 가지가 결합된 구조이다.  

`shallow copy + 1바이트 refcount overflow`  

이를 기반으로:  
- UAF 생성  
- libc leak  
- tcache poisoning  
- hidden callback hijack  

까지 이어지는 정석적인 modern heap exploitation chain을 구성할 수 있다.  

---

## 1. 프로그램 구조  

### 1-1. Slot 구조  

```python 
struct Slot {
uint32_t idx;
uint32_t len;
uint32_t cap;
uint32_t saved_len;
uint32_t mode; // 8: user ptr+8, 0: raw ptr
void *ptr;
uint8_t active;
uint8_t dirty;
};
```
 
slot은 heap chunk를 가리키는 wrapper  

---

### 1-2. Note 구조  

```python
struct Note {
uint8_t refcnt;
uint8_t flags;
uint16_t rounded;
uint32_t req_size;
char data[];
};
```
   
중요한 포인트:  
- refcnt = 1 byte
- data는 +0x8부터 시작

---

## 2. 취약점 분석  

### 2-1. 취약점 1 — shallow clone + refcount overflow  

clone 동작:  
 
add BYTE PTR [rax], 1  
refcount 1 증가  
  
문제:  
- refcount가 1 byte  
- clone 255번 → overflow  
  
0xff → 0x00  
   
reference tracking 완전히 깨짐  

---

### 2-2. 취약점 2 — rollback → raw mode  

조건:  
ptr[0] == 0  
   
결과:  
mode = 0  
   
정상:  
ptr + 8 (user data)  
   
raw mode:  
ptr + 0 (chunk header)  
   
즉:  
heap metadata까지 직접 읽고 쓰기 가능  

---

### 2-3. 취약점 3 — delete alias 문제  

delete는:  
- 현재 slot만 정리  
- 다른 alias는 그대로 유지  

결과:  
- 하나는 free  
- 하나는 dangling  

UAF 발생

---

## 3. 문제 핵심  

이 세 가지 취약점이 결합된다.  

1. shallow copy  
2. refcount overflow  
3. alias dangling  
  
결과:  
- 완전한 UAF primitive 확보  

---

## 4. 공격 시나리오  

### 4-1. 1단계 — libc leak (unsorted bin)**  

#### 준비  

large chunk + guard chunk  
   
공격 흐름  
1. large chunk 생성  
2. clone 255번 → refcount overflow  
3. rollback → raw mode alias  
4. delete → chunk free  
5. show → chunk header leak  
  
결과  
fd / bk → libc arena  
   
계산:  
libc = leak - 0x21ace0  
pie = libc + 0x22b000  
   
libc + PIE 동시 복구  

---

## 4-2. 2단계 — hidden exit object  

commit 시 생성되는 hidden object:  
.bss + 0x4070  
   
검증 조건:  
magic == constant  
cookie == global_cookie  
func != NULL  
   
성공 시:  
exit → trampoline 실행  

---

### 4-3. trampoline 구조  
 
mov rsp, [rdi+0x18]  
mov rsi, [rdi+0x30]  
mov rdx, [rdi+0x38]  
mov rax, [rdi+0x20]  
mov rdi, [rdi+0x28]  
jmp rax  
   
의미:  
RCE primitive  

---
 
## 4-4. cookie 계산  

cookie = (hidden >> 3)  
^ ((PIE+0x4080) << 17)  
^ CONST  
   
PIE 필요 → 앞 단계에서 확보  

---

### 4-5. 3단계 — tcache poisoning  

목표  
hidden object 주소 반환  
 
흐름  
1. 0xe8 chunk 2개 생성  
2. 각각 clone + rollback  
3. delete → tcache 진입  
  
heap leak:  
A = bleak ^ akey  
hidden = A - 0x190  
   
fd overwrite:  
fd = hidden ^ (addr >> 12)  
   
다음 malloc → hidden 반환  

---

## 5. 익스플로잇 핵심  

### 5-1. system 대신 execve  

문제:  
- trampoline = jmp  
- return address 없음  

system 불안정  
  
해결:  
execve("/bin/sh", ["sh","-c","cat flag"], NULL)  
   
return 필요 없음  
- 안정적  

---

### 5-2. payload 구조  

hidden->magic  
hidden->cookie  
hidden->rsp  
hidden->func = execve  
hidden->rdi = "/bin/sh"  
hidden->rsi = argv  
hidden->rdx = NULL  

---
 
## 6. 익스플로잇 흐름  

전체 흐름:  
1. clone overflow → UAF 준비  
2. unsorted bin → libc leak  
3. PIE 계산  
4. hidden object 생성  
5. tcache poisoning  
6. hidden overwrite  
7. exit → trampoline 실행  
8. execve 실행  
9. flag 출력  

---

## 7. 전체 공격 흐름 정리  

1. shallow clone으로 refcount 공유  
2. overflow로 refcount 무효화  
3. rollback으로 raw mode 확보  
4. delete로 UAF 생성  
5. libc leak  
6. PIE 계산  
7. tcache poisoning  
8. hidden callback overwrite  
9. exit → RCE  

---

## 8. 포인트  

이 문제의 포인트는 다음 세 가지다.  

- shallow copy 구조  
- 1바이트 refcount overflow  
- rollback 기반 raw memory 접근  

이 세 가지가 결합되어 강력한 exploit chain 형성  

## 9. 정리

shallow clone과 1바이트 refcount overflow로 UAF를 만든 뒤, unsorted leak과 tcache poisoning을 통해 hidden callback을 execve로 덮어 RCE를 달성하는 문제  

---

## 10. 최종 플래그

```python
hspace{Don't_waste_your_school_days}
```

---
