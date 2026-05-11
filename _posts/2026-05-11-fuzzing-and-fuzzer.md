---
title: "Fuzzing과 Fuzzer 완벽 정리"
date: 2026-05-11 21:00:00 +0900
categories: [BugBounty, Security]
tags: [Fuzzing, Fuzzer, AFL++, libFuzzer, Jackalope, BugBounty, Vulnerability Research]
description: "Fuzzing의 개념부터 종류, 대표 퍼저 비교, 버그바운티 활용까지 정리"
toc: true
comments: true
image:
  path: /assets/img/security/fuzzing-cover.png
---

# Fuzzing과 Fuzzer

## 들어가며

보안 취약점을 찾는 방법에는 다양한 접근 방식이 존재한다.

대표적으로 다음과 같은 방법들이 있다.

- 코드 리뷰 (Code Review)
- 정적 분석 (Static Analysis)
- 동적 분석 (Dynamic Analysis)
- 수동 침투 테스트 (Manual Penetration Testing)

그중에서도 **자동화된 취약점 탐지 기법**으로 매우 강력한 것이 바로 **Fuzzing(퍼징)** 이다.

Fuzzing은 프로그램에 예상하지 못한 입력값을 반복적으로 넣어보며 프로그램의 비정상 동작을 유도하는 테스트 기법이다.

쉽게 표현하면 다음과 같다.

> 프로그램을 이상한 입력값으로 계속 괴롭혀서 어디서 터지는지 찾는 방식

예를 들어 이미지 처리 프로그램이 있다고 해보자.

정상적인 사용자는:

- 정상 PNG
- 정상 JPG
- 정상 GIF

같은 파일을 넣는다.

하지만 공격자는 그렇지 않다.

공격자는:

- 깨진 파일
- 조작된 헤더
- 너무 큰 데이터
- NULL 바이트 포함 입력
- 비정상적인 메타데이터

등을 넣는다.

이 과정에서 프로그램이 Crash가 나거나 메모리 손상이 발생하면 보안 취약점일 가능성이 생긴다.

---

## Fuzzing이란?

Fuzzing은 비정상적이거나 예상하지 못한 입력값을 자동으로 생성하여 프로그램의 예외 동작을 찾는 테스트 기법이다.

기본 흐름은 다음과 같다.

```text
입력 생성
→ 프로그램 실행
→ 결과 확인
→ Crash 탐지
→ 입력 변형
→ 반복
```

퍼저(Fuzzer)는 프로그램에 수천, 수만, 심지어 수백만 개의 입력을 넣는다.

확인하는 항목은 다음과 같다.

```text
Crash
Segmentation Fault
Memory Corruption
Infinite Loop
Timeout
Assertion Failure
Unhandled Exception
```

특히 C/C++ 프로그램에서는 메모리 관련 취약점을 잘 발견할 수 있다.

대표적인 취약점:

- Buffer Overflow
- Heap Overflow
- Use After Free
- Double Free
- Integer Overflow
- Out-of-Bounds Read/Write

---

## 왜 중요한가?

사람은 모든 예외 입력을 생각할 수 없다.

예를 들어 로그인 기능을 만든다고 가정하자.

개발자는 보통 이런 입력을 생각한다.

```text
admin
guest
user123
```

하지만 공격자는 다음처럼 넣는다.

```text
AAAAAAAAAAAAAAAAAAAAAAAAAAAA
%x%x%x%x%x
' OR '1'='1
../../../etc/passwd
\x00\xff
```

즉, 공격자의 입력은 정상 사용자의 입력과 완전히 다르다.

Fuzzing은 이런 **비정상 입력을 자동으로 대량 생성**해서 취약점을 찾는다.

실제로 퍼징은 다음 분야에서 매우 많이 사용된다.

- Browser
- Kernel
- PDF Parser
- Image Parser
- Media Decoder
- Compression Utility
- API Validation
- Protocol Stack
- Crypto Library

Google OSS-Fuzz도 오픈소스 보안 강화를 위해 퍼징을 적극 활용하고 있다.

---

## Fuzzing 동작 원리

### 1. Seed 준비

퍼징은 완전 랜덤에서 시작하지 않는 경우가 많다.

정상 입력 파일을 준비한다.

예:

```text
sample1.png
sample2.png
sample3.png
```

이걸 **Seed Corpus**라고 부른다.

---

### 2. Mutation

Seed 데이터를 변형한다.

예:

원본:

```text
username=guest&password=1234
```

변형:

```text
username=AAAAAAAAAAAAAAAAAAAA
username=%x%x%x%x
username=' OR '1'='1
username=\x00\xff\x41
```

---

### 3. 실행

대상 프로그램에 입력 전달:

```bash
./target input.txt
```

또는:

```bash
curl http://example.com/?q=AAAA
```

---

### 4. 모니터링

퍼저는 다음을 확인한다.

- Crash
- Hang
- Timeout
- New Coverage

Crash 발생 시:

```text
crashes/id_000001
```

형태로 저장된다.

---

## Fuzzing 종류

---

## Black-box Fuzzing

프로그램 내부를 모른다.

입력과 출력만 본다.

```text
입력 → 프로그램 → 결과
```

장점:

- 간단함
- 빠름
- 구현 쉬움

단점:

- 코드 커버리지 모름
- 깊은 경로 탐색 어려움

예:

```c
if (strcmp(input, "secret_admin") == 0)
```

이 조건은 우연히 맞춰야 한다.

대표 도구:

- Radamsa
- zzuf

---

## White-box Fuzzing

프로그램 내부 구조를 분석한다.

활용 기술:

- Symbolic Execution
- Constraint Solving
- CFG Analysis

예:

```c
if (x == 1337)
```

화이트박스 퍼징은 이 조건을 계산해서 x=1337 입력을 만들 수 있다.

장점:

- 깊은 코드 탐색
- 정확도 높음

단점:

- 느림
- 복잡함
- 비용 큼

대표:

- KLEE
- SAGE

---

## Grey-box Fuzzing

실전에서 가장 많이 쓰이는 방식.

내부를 완전히 알 필요는 없지만 일부 정보를 활용한다.

대표적으로:

- Coverage
- Edge Coverage

흐름:

```text
입력 생성
→ 실행
→ 새로운 코드 경로 발견?
→ 저장
→ 다시 Mutation
```

대표:

- AFL++
- libFuzzer
- Honggfuzz
- Jackalope

---

## Mutation-based vs Generation-based

---

### Mutation-based

기존 입력 변형

예:

```text
GET /index.html
```

→

```text
GET /AAAA
```

장점:

- 빠름
- 간단함
- 실전적

대표:

- AFL++
- Honggfuzz

---

### Generation-based

입력을 처음부터 생성

예:

PNG 구조

```text
Signature
IHDR
IDAT
IEND
```

이 구조를 지켜서 생성.

장점:

- 깊은 로직 탐색

단점:

- 포맷 지식 필요

대표:

- Peach
- Grammarinator

---

## Coverage-guided Fuzzing

현대 퍼징의 핵심.

예:

```c
if (input[0] == 'F')
 if (input[1] == 'U')
  if (input[2] == 'Z')
   if (input[3] == 'Z')
    crash();
```

랜덤으로 FUZZ 찾기 어렵다.

Coverage-guided는:

- F 도달
- FU 도달
- FUZ 도달
- FUZZ 도달

이렇게 점진적으로 탐색한다.

즉:

> 새로운 코드 경로를 여는 입력을 진화시키는 방식

---

## 대표 Fuzzer 비교

| Fuzzer | 방식 | Coverage | 특징 |
|-------|------|----------|------|
| AFL++ | Grey-box | O | 가장 대중적 |
| libFuzzer | Grey-box | O | In-process |
| Jackalope | Grey-box | O | Binary 대상 |
| Honggfuzz | Grey-box | O | Sanitizer 강함 |
| Radamsa | Black-box | X | 단순 변형 |

---

## AFL++

GitHub: https://github.com/AFLplusplus/AFLplusplus

대표적인 Coverage-guided Fuzzer.

특징:

- Mutation-based
- Fast execution
- Fork server
- QEMU mode
- FRIDA mode
- Unicorn mode
- Sanitizer integration

실행:

```bash
afl-fuzz -i seeds -o findings -- ./target @@
```

입문용으로 가장 추천된다.

---

## libFuzzer

LLVM 기반 퍼저.

Harness 필요.

예:

```cpp
extern "C" int LLVMFuzzerTestOneInput(const uint8_t *Data, size_t Size) {
    return 0;
}
```

특징:

- 매우 빠름
- In-process
- Sanitizer 친화적

---

## Jackalope

Google Project Zero 제작.

특징:

- Binary fuzzing
- Windows/macOS/Linux
- Coverage-guided
- TinyInst 기반

소스 없는 프로그램 퍼징에 강함.

---

## Honggfuzz

특징:

- Coverage-guided
- Mutation-based
- Sanitizer 지원
- Native binary 강점

---

## Radamsa

단순 데이터 변형 도구.

예:

```bash
echo "hello" | radamsa
```

웹/API 입력 퍼징할 때 가볍게 활용 가능.

---

## Sanitizer

퍼징과 같이 쓰면 매우 강력하다.

대표:

- AddressSanitizer
- UndefinedBehaviorSanitizer
- MemorySanitizer
- LeakSanitizer
- ThreadSanitizer

예:

```bash
clang -fsanitize=address test.c
```

Crash 안 나도 버그를 찾을 수 있다.

---

## BugBounty 관점 활용

웹에서도 퍼징 사고방식은 중요하다.

적용 대상:

- API Parameters
- File Upload
- JSON Parser
- XML Parser
- Image Upload
- PDF Converter
- GraphQL
- Search 기능

예:

정상 요청:

```json
{
  "name": "test",
  "age": 20
}
```

퍼징:

```json
{
  "name": null,
  "age": 999999999999999999
}
```

```json
{
  "name": "<script>alert(1)</script>"
}
```

```json
{
  "name": "../../../../etc/passwd"
}
```

---

## 한계점

퍼징이 만능은 아니다.

### 인증 우회 어려움

로그인 필요:

- Session
- JWT
- CSRF

---

### Stateful Logic 어려움

예:

```text
회원가입 → 로그인 → 업로드 → 변환 → 다운로드
```

랜덤으로 찾기 힘듦.

---

### 복잡한 포맷

PDF, ZIP, PNG는 구조가 복잡하다.

---

### Crash ≠ 취약점

Crash 후 검증 필요:

- 재현 가능?
- 입력 제어 가능?
- 메모리 손상?
- DoS?
- RCE 가능?

---

## 학습 로드맵

추천 순서:

```text
Fuzzing 개념
→ Memory Bug 이해
→ AddressSanitizer
→ AFL++
→ libFuzzer
→ Crash Triage
→ CVE 분석
→ Web/API Fuzzing
```

---

## 마무리

Fuzzing은 단순 랜덤 테스트가 아니다.

현대 보안 연구에서 매우 강력한 자동화 취약점 탐지 기법이다.

정리하면:

```text
