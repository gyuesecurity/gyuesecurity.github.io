---
title: "[2026 UHCON CTF] ThreadMAZE"
date: 2026-10-31 13:03:00 +0900
categories: [CTF/Wargame]
tags: [ctf, reversing, go, multithreading, elf]
---

# ThreadMAZE - Go 런타임 메타데이터와 스레드 검증 로직 역분석

- 분류: Reversing
- 대상: `ThreadMAZE.zip`의 `prob`
- 목표: 원본 실행 파일에서 `Correct!`가 출력되는 48바이트 입력 복원

## 1. 결과

복원한 입력은 다음과 같다.

```text
iB3F74InASXCvZ9WvxoqOtk943NzPOyi2xJB-DAg6Uzm-ra2
```

따라서 최종 플래그는 다음과 같다.

```text
FLAG{iB3F74InASXCvZ9WvxoqOtk943NzPOyi2xJB-DAg6Uzm-ra2}
```

수정하지 않은 원본 바이너리에서 직접 확인한 결과는 다음과 같다.

```console
$ printf '%s\n' 'iB3F74InASXCvZ9WvxoqOtk943NzPOyi2xJB-DAg6Uzm-ra2' | ./prob
> Correct!
```

## 2. 파일 확인

`prob`는 x86-64 Linux용 Go 실행 파일이다. ELF 섹션 헤더가 제거되어 일반적인 심볼·섹션 중심 분석은 어렵지만, 프로그램 헤더와 Go 런타임 메타데이터는 남아 있다.

| 항목 | 값 |
|---|---|
| 파일 크기 | 2,515,248바이트 |
| 형식 | ELF64, x86-64, little endian, PIE |
| 섹션 헤더 | 제거됨 (`e_shoff = 0`, `e_shnum = 0`) |
| `prob` SHA-256 | `a2f64dde8d0d4d9af016136b209516698966400222323eb4c76be4d9d45bd3a9` |

섹션 헤더가 없어도 `PT_LOAD` 프로그램 헤더를 이용하면 가상주소를 파일 오프셋으로 바꿀 수 있다.

```text
file_offset = p_offset + (VA - p_vaddr)
```

Go의 함수 메타데이터에 해당하는 구조는 VA `0x5a88e0` 부근에 남아 있었다. 이를 이용해 함수 경계와 애플리케이션 코드 영역을 복원했다.

## 3. 입력 검증 루틴

주요 루틴은 다음과 같이 식별할 수 있다.

| 역할 | VA |
|---|---:|
| 애플리케이션 초기화 | `0x4fa320` |
| 최종 입력 검증 | `0x501260` |
| `main` | `0x501460` |
| 성공 문자열 생성 | `0x5018a0` |
| 512개 함수 디스패치 테이블 | `0x663360` |

`main`은 입력의 길이와 문자 범위를 먼저 검사한다. 허용 형식은 다음과 같다.

```regex
[A-Za-z0-9_-]{48}
```

즉 정답은 정확히 48바이트이며 영문 대·소문자, 숫자, `_`, `-`만 사용할 수 있다.

초기화가 끝난 뒤 VA `0x6c5ee0`에는 구조 복원 및 키 파생에 사용되는 32바이트 고정 키가 생성된다.

```text
5c10292963e2ecfa90795476389b5ae11c66606864c3dd24ebe8127b6afe1f7f
```

## 4. 핵심 흔적: 512개 함수의 NOP 길이

VA `0x663360`의 테이블에는 512개의 함수 값 포인터가 들어 있다. 각 엔트리는 ABI wrapper를 거쳐 짧은 leaf 함수 하나를 호출한다. leaf는 `XOR`, `ADD`, `ROL`, `NOT` 중 하나를 수행하며, 실제 연산과 결과 저장 명령 사이에 가변 길이 NOP 패딩이 들어 있다.

대표적인 형태는 다음과 같다.

```asm
mov rax, [rsp+8]
rol rax, 13
; 0x90 NOP가 가변 개수만큼 존재
mov [rsp+16], rax
ret
```

512개 함수의 NOP 개수를 모두 세면 다음 규칙이 성립한다.

```text
nop_count = 17 + 32 * symbol
symbol in {0, 1, 2, 3, 4, 5, 6, 7}
```

따라서 각 함수에서 3비트 값을 하나씩 복구할 수 있다.

```python
symbol = (nop_count - 17) // 32
```

| NOP 개수 | 17 | 49 | 81 | 113 | 145 | 177 | 209 | 241 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 3비트 값 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |

전체 은닉 데이터 크기는 정확히 192바이트다.

```text
512 functions * 3 bits = 1536 bits = 192 bytes
```

## 5. 함수 순서와 3비트 혼합 복원

테이블에 나타나는 함수 순서는 논리 ID 순서가 아니다. 고정 키와 seed `0xc6bc279692b5cc83`으로 Fisher-Yates 순열을 생성하여 512개 값을 먼저 재배열한다.

상태 혼합에는 SplitMix64 계열의 다음 함수를 사용한다.

```python
MASK64 = (1 << 64) - 1

def mix64(x):
    x &= MASK64
    x = ((x ^ (x >> 30)) * 0xbf58476d1ce4e5b9) & MASK64
    x = ((x ^ (x >> 27)) * 0x94d049bb133111eb) & MASK64
    return (x ^ (x >> 31)) & MASK64
```

각 논리 ID에는 키로부터 계산되는 3비트 마스크가 더해져 있으므로 이를 `mod 8`에서 제거한다.

```python
mask = (signature ^ (signature >> 17) ^ (signature >> 41)) & 7
value = (encoded_value - mask) & 7
```

그 뒤 seed `0xdb4f0b9175ae2165`로 생성한 1,536개 혼합 연산을 역순으로 적용한다. 사용되는 연산은 위치 교환, `mod 8` 덧셈, XOR, 홀수 곱셈이다. `1, 3, 5, 7`은 모두 `mod 8`에서 자기 자신이 역원이므로 역산할 수 있다.

혼합을 제거한 512개 값은 다음 세 필드로 나뉜다.

| 필드 | 3비트 값 수 | 크기 | 위치 선택 seed |
|---|---:|---:|---:|
| 암호문 | 128 | 48바이트 | `0xd1b54a32d192ed03` |
| 마스킹된 파라미터 | 336 | 126바이트 | `0xa24baed4963ee407` |
| 마스킹된 nonce | 48 | 18바이트 | `0x9fb21c651e98df25` |

값은 낮은 비트부터 누적해 바이트로 변환한다. 복원된 48바이트 암호문은 다음과 같다.

```text
2fb9239d0fa930b2d8e854058b1f2f3c8acdc72ed5559b71fde353518855afd48245ca9b65095ccf70c6efd4f88543e5
```

## 6. nonce와 파라미터 복원

추출된 nonce와 126바이트 파라미터에는 한 단계의 마스킹이 더 적용되어 있다. 문자열 `control-mask-v1`, `capsule-wrap-v1`, `key-envelope`를 사용하는 SHA-256/HMAC 기반 마스크를 바이너리의 처리 순서대로 재현해 마스크를 제거한다.

복원된 nonce는 다음과 같다.

```text
5cd4943062f57980a2e3098a60511145be5b
```

HMAC 확장은 다음과 같은 HKDF 유사 구조다.

```text
T(0) = empty
T(n) = HMAC-SHA256(key, T(n-1) || info || uint8(n))
output = T(1) || T(2) || ...
```

고정 키 32바이트, 복원 파라미터 126바이트, nonce 18바이트를 결합해 각 라운드의 키·IV·명령 스트림을 생성한다. 전체 파생 자료의 길이는 3,035바이트다.

## 7. 13개 변환 역산

검증기는 48바이트 입력에 13개의 가역 변환을 키 기반 순서로 적용한다. 복원된 정방향 단계 순서는 다음과 같다.

```text
11, 5, 4, 10, 12, 0, 1, 9, 6, 3, 8, 2, 7
```

암호문에서 입력을 복원할 때는 이를 역순으로 처리한다.

```text
7, 2, 8, 3, 6, 9, 1, 0, 12, 10, 4, 5, 11
```

| ID | VA | 변환 |
|---:|---:|---|
| 0 | `0x4fcf20` | 48바이트 순열 |
| 1 | `0x4fd0a0` | 바이트 ARX 피드백 |
| 2 | `0x4fd6c0` | HMAC-SHA256 Feistel 32라운드 |
| 3 | `0x4fdf40` | PRESENT-80 CBC |
| 4 | `0x4fea20` | AES-256 counter XOR |
| 5 | `0x4fe2e0` | SPECK-128/256 CBC |
| 6 | `0x4fec80` | XTEA CBC |
| 7 | `0x4fda40` | ChaCha20 |
| 8 | `0x4fe4c0` | Salsa20 |
| 9 | `0x4fee80` | RC4-drop8192 |
| 10 | `0x4ff000` | 128명령 가역 VM |
| 11 | `0x4fd220` | 바이트 쌍 ARX 96회 |
| 12 | `0x4fd440` | 32비트 워드 쌍 ARX 96회 |

순열에는 역순열을 사용하고, 덧셈과 회전은 각각 뺄셈과 반대 회전으로 되돌린다. 스트림 암호와 counter XOR 단계는 동일한 키스트림을 다시 XOR한다. Feistel은 라운드 순서를 거꾸로 적용한다.

AES counter block의 구성은 일반적인 big endian 증가 방식과 다르므로 주의해야 한다.

```text
counter_block_i = nonce8 || LE64(counter + i)
```

## 8. 복원 결과

13개 단계를 모두 역산하면 다음 바이트열을 얻는다.

```text
694233463734496e41535843765a395776786f714f746b3934334e7a504f796932784a422d44416736557a6d2d726132
```

ASCII로 변환하면 정확히 48바이트의 허용 문자 문자열이 된다.

```text
iB3F74InASXCvZ9WvxoqOtk943NzPOyi2xJB-DAg6Uzm-ra2
```

복원한 입력에 13개 변환을 정방향으로 다시 적용하면 구조에서 추출한 48바이트 암호문과 일치한다. 마지막으로 원본 `prob`에 입력하여 `Correct!`와 종료 코드 `0`을 확인했다.

## 9. 검증

WSL 또는 Linux에서 다음 명령으로 재현할 수 있다.

```bash
cd '/mnt/c/Users/amder/Downloads/울모해/work_threadmaze'
printf '%s\n' 'iB3F74InASXCvZ9WvxoqOtk943NzPOyi2xJB-DAg6Uzm-ra2' | ./prob
```

출력:

```text
> Correct!
```

첫 글자를 변경한 대조 입력은 실패한다.

```bash
printf '%s\n' 'jB3F74InASXCvZ9WvxoqOtk943NzPOyi2xJB-DAg6Uzm-ra2' | ./prob
```

```text
> Wrong!
```

## 10. 결론

이 문제에서 “손상”된 것은 실행에 필수적인 코드가 아니라 분석에 편리한 ELF 섹션·심볼 정보였다. Go 함수 메타데이터와 참조 관계는 남아 있었고, 특히 512개 leaf 함수의 NOP 길이가 1,536비트의 데이터를 보존하고 있었다.

NOP 길이에서 암호문·파라미터·nonce를 추출하고 키 기반 순열과 3비트 혼합을 제거한 뒤 13개의 가역 변환을 역산하여 원 입력을 복원할 수 있었다.

최종 플래그:

```text
FLAG{iB3F74InASXCvZ9WvxoqOtk943NzPOyi2xJB-DAg6Uzm-ra2}
```
