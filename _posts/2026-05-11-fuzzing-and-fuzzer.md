---
title: "Fuzzing과 Fuzzer 정리"
date: 2026-05-11 00:00:00 +0900
categories: [BugBounty]
tags: [fuzzing, fuzzer, BugBounty]
---

# fuzzing 과 fuzzer 에 대한 내용 정리

## 1. 개요

보안 취약점을 찾는 방법에는 코드 리뷰, 정적 분석, 동적 분석, 수동 침투 테스트 등 여러 방식이 있다. 그중 **Fuzzing**, 즉 **퍼징**은 프로그램에 비정상적이거나 예상하지 못한 입력값을 반복적으로 넣어보면서 오류나 취약점을 찾는 자동화 테스트 기법이다.

쉽게 말하면 퍼징은 프로그램을 “이상한 입력값으로 계속 두드려 보는 방식”이다.

예를 들어 어떤 프로그램이 파일을 읽는다고 가정해보자. 정상적인 사용자는 올바른 이미지 파일, 문서 파일, 압축 파일 등을 입력한다. 하지만 공격자는 정상적인 파일만 넣지 않는다. 깨진 파일, 너무 긴 문자열, 잘못된 헤더, 음수 값, 특수문자, 널 바이트 등이 포함된 데이터를 넣어 프로그램이 비정상적으로 동작하는지 확인한다.

이런 입력을 사람이 하나하나 만들기는 어렵다.

그래서 이를 자동으로 수행하는 도구가 필요하다. 이 도구를 **Fuzzer**, 즉 **퍼저**라고 한다.

---

## 2. Fuzzing이란?

Fuzzing은 프로그램에 무작위 또는 변형된 입력값을 대량으로 전달하여 프로그램의 비정상 동작을 찾아내는 테스트 기법이다.

퍼징의 기본 흐름은 다음과 같다.

```text
입력 생성 → 프로그램 실행 → 결과 관찰 → Crash 확인 → 입력 변형 → 반복
```

퍼저는 프로그램에 수많은 입력값을 넣는다. 그리고 프로그램이 다음과 같은 이상 동작을 보이는지 확인한다.

```text
Crash
Segmentation Fault
Memory Corruption
Timeout
Infinite Loop
Assertion Failure
Unhandled Exception
```

이런 현상은 단순한 오류일 수도 있지만, 보안 관점에서는 취약점으로 이어질 수 있다. 특히 C/C++처럼 메모리 관리를 직접 하는 언어에서는 퍼징을 통해 버퍼 오버플로우, Use After Free, Double Free 같은 치명적인 취약점이 발견될 수 있다.

---

## 3. Fuzzing이 중요한 이유

퍼징이 중요한 이유는 사람이 생각하지 못한 입력을 자동으로 탐색할 수 있기 때문이다.

개발자는 보통 정상적인 입력을 기준으로 프로그램을 작성한다. 하지만 실제 공격자는 비정상적인 입력을 사용한다. 예를 들어 로그인 페이지에는 일반적인 아이디와 비밀번호만 들어오는 것이 아니라, SQL Injection Payload, 긴 문자열, 특수문자, 인코딩된 값 등이 들어올 수 있다.

파일 업로드 기능에서도 마찬가지다. 사용자는 정상적인 이미지 파일을 업로드하지만, 공격자는 깨진 이미지, 조작된 메타데이터, 비정상적인 MIME 타입, 확장자 우회 파일을 업로드할 수 있다.

퍼징은 이런 예외 상황을 자동으로 실험한다.

특히 다음과 같은 분야에서 많이 사용된다.

```text
브라우저
운영체제 커널
PDF Reader
이미지 Parser
압축 해제 프로그램
동영상/오디오 Decoder
네트워크 프로토콜
API 입력 검증
암호화 라이브러리
```

Google의 OSS-Fuzz는 오픈소스 소프트웨어의 안정성과 보안을 높이기 위해 현대적인 퍼징 기법과 대규모 분산 실행을 결합한다고 설명한다.

---

## 4. Fuzzing의 기본 동작 과정

### 4-1. Seed 입력 준비

퍼징은 보통 완전히 무작위 입력에서 시작하지 않는다.

대부분은 정상적으로 동작하는 입력값, 즉 **Seed Corpus**를 준비한다.

예를 들어 PNG Parser를 퍼징한다면 정상 PNG 파일 몇 개를 준비한다.

```text
sample1.png
sample2.png
sample3.png
```

퍼저는 이 파일들을 기반으로 내용을 조금씩 바꾸면서 새로운 테스트 입력을 만든다.

---

### 4-2. 입력 변형

퍼저는 Seed 파일을 변형한다.

예를 들어 원본 입력이 다음과 같다고 하자.

```text
username=guest&password=1234
```

퍼저는 다음과 같이 바꿀 수 있다.

```text
username=AAAAAAAAAAAAAAAAAAAA&password=1234
username=%x%x%x%x&password=1234
username=guest&password=' OR '1'='1
username=guest&password=\x00\xff\x41
```

이 과정에서 프로그램이 예상하지 못한 입력을 만나게 된다.

---

### 4-3. 프로그램 실행

퍼저는 변형된 입력을 대상 프로그램에 전달한다.

```bash
./target input.txt
```

또는 네트워크 서비스라면 HTTP 요청 형태로 보낼 수도 있다.

```bash
curl "http://example.com/search?q=AAAA"
```

---

### 4-4. 결과 관찰

퍼저는 프로그램이 정상 종료되었는지, Crash가 발생했는지, 너무 오래 멈춰 있는지 확인한다.

Crash가 발생하면 해당 입력값을 저장한다.

```text
crashes/id_000001
crashes/id_000002
hangs/id_000001
```

이 저장된 입력은 이후 취약점 분석에 사용된다.

---

## 5. Fuzzing의 종류

퍼징은 여러 기준으로 나눌 수 있다.

가장 대표적인 기준은 프로그램 내부 정보를 얼마나 활용하느냐이다.

---

## 5-1. Black-box Fuzzing

Black-box Fuzzing은 프로그램 내부 구조를 모르는 상태에서 입력과 출력만 보고 테스트하는 방식이다.

즉, 소스코드도 모르고 내부 로직도 모른다.

```text
입력값 → 프로그램 → 결과 확인
```

대표적으로 웹 서버, API, 바이너리 프로그램처럼 내부 코드를 알 수 없는 대상을 테스트할 때 사용할 수 있다.

장점은 간단하다는 것이다. 대상 프로그램에 입력만 넣을 수 있으면 된다.

하지만 단점도 있다. 내부 코드 커버리지를 알 수 없기 때문에 퍼저가 새로운 경로를 찾고 있는지 판단하기 어렵다.

예를 들어 어떤 프로그램 내부에 다음과 같은 코드가 있다고 하자.

```c
if (strcmp(input, "admin_secret_key") == 0) {
    vulnerable_function();
}
```

Black-box 방식은 이 조건을 우연히 맞혀야 한다. 그래서 깊은 코드 경로까지 도달하기 어렵다.

대표적인 Black-box 계열 도구로는 Radamsa, zzuf 등이 있다.

---

## 5-2. White-box Fuzzing

White-box Fuzzing은 프로그램 내부 구조를 분석하면서 입력을 생성하는 방식이다.

소스코드, 제어 흐름, 조건문, 경로 제약 조건 등을 분석한다.

대표적으로 Symbolic Execution이나 Concolic Execution을 활용한다.

예를 들어 다음 코드가 있다고 하자.

```c
if (x == 1337) {
    crash();
}
```

일반 랜덤 퍼징은 x가 1337이 되는 입력을 우연히 찾아야 한다.

하지만 White-box 방식은 조건식을 분석해서 x가 1337이어야 해당 경로로 들어갈 수 있다는 것을 계산할 수 있다.

장점은 깊은 경로를 탐색할 수 있다는 점이다. 단점은 매우 느리고 복잡하다는 점이다.

대표 도구로는 KLEE, SAGE 등이 있다.

---

## 5-3. Grey-box Fuzzing

Grey-box Fuzzing은 Black-box와 White-box의 중간 방식이다.

프로그램 내부를 완전히 분석하지는 않지만, 실행 중 어떤 코드 경로를 지났는지 정도는 확인한다.

대표적인 정보가 **Coverage**, 즉 코드 커버리지이다.

Grey-box Fuzzing의 핵심은 다음과 같다.

```text
새로운 입력 생성
→ 프로그램 실행
→ 새로운 코드 경로를 발견했는지 확인
→ 새로운 경로라면 저장
→ 해당 입력을 다시 변형
```

이 방식은 매우 실용적이다.

너무 느리지 않으면서도 단순 랜덤 방식보다 훨씬 효율적으로 취약점을 찾을 수 있다.

AFL++, libFuzzer, Honggfuzz 등이 대표적인 Grey-box Fuzzer이다.

AFL++ 문서에서도 AFL++는 instrumentation-guided genetic algorithm을 사용하는 brute-force fuzzer이며, edge coverage를 활용해 프로그램 제어 흐름의 변화를 감지한다고 설명한다.

---

## 6. Mutation-based Fuzzing과 Generation-based Fuzzing

퍼징은 입력을 어떻게 만드는지에 따라서도 나눌 수 있다.

---

## 6-1. Mutation-based Fuzzing

Mutation-based Fuzzing은 기존 입력을 변형하는 방식이다.

정상 입력이 있다면 일부 바이트를 바꾸거나, 삭제하거나, 추가하거나, 반복한다.

예를 들어 원본 입력이 다음과 같다고 하자.

```text
GET /index.html HTTP/1.1
Host: example.com
```

퍼저는 다음과 같이 변형할 수 있다.

```text
GET /AAAA HTTP/1.1
Host: example.com
```

```text
GET /../../../../etc/passwd HTTP/1.1
Host: example.com
```

```text
GET /index.html HTTP/1.1
Host: %x%x%x%x
```

장점은 구현이 쉽고 빠르다는 것이다. AFL++ 같은 퍼저가 이 방식을 강력하게 활용한다.

단점은 입력 구조가 복잡한 경우 깊은 경로까지 도달하기 어렵다는 것이다.

예를 들어 PNG, PDF, ZIP처럼 구조가 복잡한 파일은 아무렇게나 바꾸면 파일 자체가 파싱되지 않고 초반에 거부될 수 있다.

---

## 6-2. Generation-based Fuzzing

Generation-based Fuzzing은 입력을 처음부터 생성하는 방식이다.

대상 파일 포맷이나 프로토콜의 문법을 알고 있어야 한다.

예를 들어 PNG 파일은 대략 다음과 같은 구조를 가진다.

```text
PNG Signature
IHDR Chunk
IDAT Chunk
IEND Chunk
```

Generation-based Fuzzer는 이런 구조를 알고 그 형식에 맞는 입력을 생성한다.

장점은 복잡한 포맷에서도 더 깊은 로직까지 도달할 수 있다는 점이다.

단점은 포맷에 대한 지식이 필요하고, 퍼저를 만드는 비용이 크다는 점이다.

---

## 7. Coverage-guided Fuzzing

현대 퍼징에서 가장 중요한 개념 중 하나는 **Coverage-guided Fuzzing**이다.

Coverage-guided Fuzzing은 프로그램이 어떤 코드 경로를 실행했는지 추적하고,

새로운 경로를 발견한 입력을 더 가치 있는 입력으로 판단한다.

예를 들어 다음 코드가 있다고 하자.

```c
if (input[0] == 'F') {
    if (input[1] == 'U') {
        if (input[2] == 'Z') {
            if (input[3] == 'Z') {
                crash();
            }
        }
    }
}
```

완전 랜덤 입력으로 "FUZZ"를 찾기는 어렵다. 하지만 Coverage-guided Fuzzer는 F를 맞혀서 첫 번째 조건문을 통과한 입력을 저장하고, 그 입력을 다시 변형해서 FU, FUZ, FUZZ에 점점 가까워질 수 있다.

즉, 단순히 랜덤으로 때려 넣는 것이 아니라 “새로운 코드 경로를 열어준 입력”을 중심으로 진화시키는 방식이다.

Jackalope도 coverage-guided fuzzer로, 테스트 중 코드 경로를 추적하고 그 정보를 이후 mutation에 활용한다고 설명된다.

---

## 8. Fuzzing으로 발견할 수 있는 취약점

퍼징은 특히 메모리 관련 취약점 탐지에 강하다.

대표적으로 다음과 같은 취약점이 있다.

```text
Buffer Overflow
Heap Overflow
Stack Overflow
Use After Free
Double Free
Integer Overflow
Out-of-bounds Read
Out-of-bounds Write
Null Pointer Dereference
Format String Bug
Race Condition
Infinite Loop
Parser Crash
```

예를 들어 다음과 같은 코드가 있다고 하자.

```c
#include <stdio.h>
#include <string.h>

int main(int argc, char *argv[]) {
    char buf[16];

    if (argc < 2) {
        return 1;
    }

    strcpy(buf, argv[1]);
    printf("%s\n", buf);

    return 0;
}
```

이 코드는 buf 크기가 16바이트인데, strcpy()는 입력 길이를 검사하지 않는다.

따라서 다음과 같이 긴 입력을 넣으면 문제가 발생할 수 있다.

```bash
./test AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
```

이런 단순한 취약점은 사람이 봐도 찾을 수 있지만, 실제 프로그램은 훨씬 복잡하다.

퍼징은 복잡한 코드 안에서 이런 문제를 자동으로 찾아내는 데 유용하다.

---

## 9. 대표 Fuzzer 정리

---

## 9-1. AFL++

AFL++는 가장 널리 사용되는 퍼저 중 하나이다. 기존 AFL을 기반으로 다양한 기능이 추가된 버전이다.

AFL++ GitHub 설명에 따르면 AFL++는 기존 AFL에 커뮤니티 패치, QEMU 모드, collision-free coverage, laf-intel, redqueen, AFLfast++ power schedule, MOpt mutator, unicorn mode 등 다양한 기능이 추가된 퍼저이다.

AFL++의 핵심 특징은 다음과 같다.

```text
Coverage-guided fuzzing
Mutation-based fuzzing
빠른 실행 속도
Fork server 지원
QEMU mode 지원
FRIDA mode 지원
Unicorn mode 지원
Sanitizer 연동 가능
```

AFL++는 소스코드가 있는 C/C++ 프로그램을 퍼징할 때 매우 강력하다.

컴파일 시 instrumentation을 삽입해서 코드 커버리지를 추적한다.

기본 실행 형태는 다음과 같다.

```bash
afl-fuzz -i seeds -o findings -- ./target @@
```

여기서 의미는 다음과 같다.

```text
-i seeds      초기 입력 파일이 들어 있는 디렉터리
-o findings   결과 저장 디렉터리
@@            퍼저가 생성한 입력 파일이 들어갈 위치
```

AFL++는 새로운 코드 경로를 발견한 입력을 저장하고, 해당 입력을 다시 변형하면서 더 깊은 경로를 탐색한다.

입문자가 퍼징을 공부할 때 가장 먼저 다뤄보기 좋은 도구라고 볼 수 있다.

---

## 9-2. libFuzzer

libFuzzer는 LLVM 프로젝트와 함께 사용되는 in-process coverage-guided fuzzing engine이다.

Google fuzzing 튜토리얼에서도 libFuzzer를 coverage-guided in-process fuzzing engine이라고 설명한다.

libFuzzer는 AFL++와 다르게 보통 별도의 실행 파일에 입력 파일을 계속 넣는 방식이 아니라,

특정 함수를 반복 호출하는 방식으로 동작한다.

libFuzzer를 사용하려면 보통 다음과 같은 fuzz target을 작성한다.

```cpp
#include <stdint.h>
#include <stddef.h>

extern "C" int LLVMFuzzerTestOneInput(const uint8_t *Data, size_t Size) {
    // Data와 Size를 이용해 테스트 대상 함수 호출
    return 0;
}
```

중요한 함수는 다음이다.

```cpp
LLVMFuzzerTestOneInput
```

libFuzzer는 이 함수에 다양한 입력을 계속 전달한다.

장점은 매우 빠르다는 것이다. 프로세스를 매번 새로 실행하지 않고 하나의 프로세스 안에서 반복 실행하기 때문이다.

단점은 fuzz harness를 직접 작성해야 한다는 것이다.

즉, 어떤 함수를 어떻게 테스트할지 개발자가 명확히 지정해야 한다.

libFuzzer는 다음과 같은 경우에 적합하다.

```text
소스코드가 있는 경우
라이브러리 함수를 직접 테스트하고 싶은 경우
C/C++ 프로젝트를 개발하면서 퍼징을 통합하고 싶은 경우
Sanitizer와 함께 메모리 버그를 찾고 싶은 경우
```

---

## 9-3. Jackalope

Jackalope는 Google Project Zero에서 공개한 coverage-guided fuzzer이다.

Jackalope GitHub 설명에 따르면 Jackalope는 customizable, distributed, coverage-guided fuzzer이며 black-box binary를 대상으로 동작할 수 있다. 특히 Windows와 macOS의 black-box binary를 대상으로 하는 coverage-guided fuzzer가 상대적으로 적다는 문제의식에서 출발했다.

Jackalope의 특징은 다음과 같다.

```text
Binary 대상 퍼징 가능
Coverage-guided fuzzing
Windows/macOS/Linux/Android 지원
TinyInst 기반 instrumentation
분산 퍼징 지원
```

AFL++나 libFuzzer는 소스코드가 있을 때 강력하다. 반면 Jackalope는 소스코드가 없는 바이너리 대상 퍼징에 유리하다.

예를 들어 상용 프로그램, Windows 프로그램, 폐쇄형 프로그램을 분석할 때 사용할 수 있다.

버그바운티 관점에서는 소스코드가 없는 클라이언트 프로그램이나 파일 파서 프로그램을 분석할 때 유용할 수 있다.

---

## 9-4. Honggfuzz

Honggfuzz도 대표적인 coverage-guided fuzzer 중 하나이다.

특징은 다음과 같다.

```text
Coverage-guided fuzzing
Mutation-based fuzzing
Sanitizer 연동
Linux 기반 대상에 강함
Crash 분석 기능 제공
```

AFL++와 비슷하게 native binary fuzzing에 많이 사용된다.

---

## 9-5. Radamsa

Radamsa는 비교적 단순한 입력 변형 도구이다.

Coverage-guided 방식은 아니고, 입력 데이터를 변형해서 이상한 테스트 케이스를 만들어주는 데 초점이 있다.

예를 들어 다음과 같이 사용할 수 있다.

```bash
echo "hello world" | radamsa
```

또는 정상 HTTP 요청 파일을 준비한 뒤 Radamsa로 변형해서 서버에 보낼 수도 있다.

장점은 사용이 매우 간단하다는 것이다. 단점은 코드 커버리지를 기반으로 똑똑하게 경로를 탐색하지는 못한다는 것이다.

---

## 10. Fuzzer 비교표

| Fuzzer | 방식 | Coverage-guided | 소스코드 필요 | 주요 대상 | 특징 |
|--------|------|----------------|--------------|----------|------|
| AFL++ | Grey-box | O | 있으면 좋음 | C/C++, 바이너리 | 가장 대중적, 강력한 mutation |
| libFuzzer | Grey-box | O | 필요 | 라이브러리, 함수 단위 | in-process, 빠름 |
| Jackalope | Grey-box | O | 없어도 가능 | Windows/macOS/Linux 바이너리 | black-box binary fuzzing |
| Honggfuzz | Grey-box | O | 있으면 좋음 | Native binary | sanitizer 연동 좋음 |
| Radamsa | Black-box | X | 불필요 | 파일, 문자열, 프로토콜 | 간단한 랜덤 변형 |

---

## 11. Fuzzing과 Sanitizer

퍼징에서 Sanitizer는 매우 중요하다.

퍼저가 Crash를 찾는 것도 중요하지만, 모든 메모리 오류가 즉시 Crash로 이어지는 것은 아니다.

어떤 메모리 버그는 조용히 지나가기도 한다.

이때 AddressSanitizer 같은 도구를 함께 사용하면 메모리 오류를 더 잘 탐지할 수 있다.

대표적인 Sanitizer는 다음과 같다.

```text
AddressSanitizer: 메모리 오류 탐지
UndefinedBehaviorSanitizer: 정의되지 않은 동작 탐지
MemorySanitizer: 초기화되지 않은 메모리 사용 탐지
ThreadSanitizer: 스레드 경쟁 상태 탐지
LeakSanitizer: 메모리 누수 탐지
```
Google fuzzing 문서에서도 libFuzzer나 AFL을 sanitizer 도구와 함께 사용해 fuzz target을 빌드하는 방법을 다룬다.

---

## 12. Fuzzing 실습 흐름 예시

퍼징을 처음 공부한다면 다음 순서로 접근하는 것이 좋다.

### 1단계: 취약한 C 프로그램 작성

```c
#include <stdio.h>
#include <string.h>

int main(int argc, char *argv[]) {
    char buf[8];

    if (argc < 2) {
        return 1;
    }

    strcpy(buf, argv[1]);

    if (strcmp(buf, "FUZZ") == 0) {
        printf("Matched\n");
    }

    return 0;
}
```

---

### 2단계: Sanitizer로 컴파일

```bash
clang -fsanitize=address -g test.c -o test
```

---

### 3단계: 긴 입력으로 테스트

```bash
./test AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
```

---

### 4단계: Crash 확인

AddressSanitizer가 stack-buffer-overflow 같은 오류를 출력할 수 있다.

---

### 5단계: AFL++로 자동화

AFL++를 사용하면 사람이 직접 입력을 넣는 대신 퍼저가 자동으로 입력을 생성하고 Crash를 찾는다.

```bash
mkdir seeds
echo "test" > seeds/input.txt

afl-clang-fast test.c -o test_afl
afl-fuzz -i seeds -o output -- ./test_afl @@
```

---

## 13. BugBounty 관점에서 Fuzzing 활용

버그바운티에서 퍼징은 단순히 바이너리 취약점만 찾는 기술이 아니다. 웹 보안에서도 퍼징 사고방식은 매우 중요하다.

예를 들어 다음과 같은 부분에 적용할 수 있다.

```text
API 파라미터
파일 업로드 기능
JSON Parser
XML Parser
이미지 업로드
PDF 변환 기능
압축 파일 처리
URL 라우팅
GraphQL Query
검색 기능
인증 토큰 처리
```

웹 애플리케이션에서는 다음과 같은 입력을 퍼징할 수 있다.

```text
긴 문자열
특수문자
인코딩된 값
SQL Injection Payload
XSS Payload
Path Traversal Payload
Null Byte
잘못된 JSON 구조
중첩된 객체
매우 큰 배열
```

예를 들어 API가 다음 요청을 받는다고 하자.

```http
POST /api/profile
Content-Type: application/json

{
  "name": "test",
  "age": 20
}
```

퍼징 관점에서는 다음처럼 바꿔볼 수 있다.

```json
{
  "name": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  "age": -1
}
```

```json
{
  "name": "<script>alert(1)</script>",
  "age": "test"
}
```

```json
{
  "name": null,
  "age": 999999999999999999999999
}
```

이런 입력을 통해 서버 오류, 예외 처리 실패, 인증 우회, XSS, SQL Injection 가능성을 확인할 수 있다.

---

## 14. Fuzzing의 한계

퍼징은 강력하지만 만능은 아니다.

### 14-1. 인증이 필요한 기능은 어렵다

로그인이 필요한 서비스는 단순 퍼징만으로 접근하기 어렵다.

세션, 쿠키, CSRF Token, JWT 등이 필요하기 때문이다.

---

### 14-2. 상태 기반 로직은 어렵다

일부 프로그램은 특정 순서를 따라야 취약한 코드에 도달한다.

예를 들어 다음 순서가 필요할 수 있다.

```text
회원가입 → 로그인 → 파일 업로드 → 변환 요청 → 다운로드
```

이런 경우 단순 랜덤 입력만으로는 취약한 지점까지 도달하기 어렵다.

---

### 14-3. 복잡한 포맷은 단순 변형으로 어렵다

PDF, PNG, ZIP 같은 파일은 구조가 복잡하다. 아무 바이트나 바꾸면 파일 파서가 초반에 거부할 수 있다.

이 경우 structure-aware fuzzing이나 generation-based fuzzing이 필요하다.

Google fuzzing 문서에서도 libFuzzer를 활용한 structure-aware fuzzing 예제를 제공한다.

---

### 14-4. Crash가 항상 취약점은 아니다

Crash가 발생했다고 해서 무조건 보안 취약점은 아니다.

예를 들어 단순 Null Pointer Dereference는 서비스 거부 공격으로 이어질 수는 있지만, 코드 실행 취약점은 아닐 수 있다.

따라서 Crash 이후에는 다음 분석이 필요하다.

```text
재현 가능한가?
영향 범위가 무엇인가?
메모리 손상인가?
공격자가 제어 가능한 입력인가?
DoS인가, RCE 가능성이 있는가?
실제 서비스 환경에서 도달 가능한가?
```

---

## 15. Fuzzing 학습 로드맵

퍼징을 처음 공부한다면 다음 순서로 학습하면 좋다.

```text
1. Fuzzing 개념 이해
2. Crash와 Memory Bug 개념 이해
3. AddressSanitizer 사용법 학습
4. AFL++ 기본 사용법 실습
5. libFuzzer harness 작성 실습
6. 파일 포맷 Parser 퍼징
7. Coverage와 Corpus 개념 이해
8. Crash triage 방법 학습
9. 실제 CVE 사례 분석
10. 웹/API 입력 퍼징으로 확장
```

입문 단계에서는 AFL++를 먼저 추천한다. 이유는 자료가 많고,

실습 예제가 많으며, coverage-guided fuzzing의 핵심 개념을 이해하기 좋기 때문이다.

그다음 libFuzzer로 넘어가면 함수 단위 퍼징과 sanitizer 기반 분석을 익힐 수 있다.

Windows 바이너리나 소스코드 없는 프로그램을 대상으로 하고 싶다면 Jackalope를 공부하면 좋다.

---

## 16. 참고 자료

```text
AFL++
https://github.com/AFLplusplus/AFLplusplus

Jackalope
https://github.com/googleprojectzero/Jackalope

Google Fuzzing
https://github.com/google/fuzzing/tree/master

OSS-Fuzz
https://google.github.io/oss-fuzz/
```

---

## 17. 결론

Fuzzing은 프로그램에 예상하지 못한 입력을 자동으로 넣어보며 Crash나 취약점을 찾는 보안 테스트 기법이다.

초기에는 단순히 랜덤 데이터를 넣는 방식에 가까웠지만, 현대 퍼징은 coverage-guided fuzzing, sanitizer, structure-aware fuzzing 등과 결합되어 매우 강력한 취약점 탐지 기술로 발전했다.

특히 AFL++, libFuzzer, Jackalope 같은 도구는 실제 보안 연구와 버그바운티에서도 활용 가치가 높다.

정리하면 다음과 같다.

```text
Fuzzing = 비정상 입력을 이용한 자동화 테스트
Fuzzer = 퍼징을 수행하는 도구
AFL++ = 입문과 실전에 모두 강한 대표 퍼저
libFuzzer = 함수 단위, 라이브러리 퍼징에 강함
Jackalope = 소스코드 없는 바이너리 퍼징에 유리
Coverage-guided = 현대 퍼징의 핵심 개념
Sanitizer = 메모리 버그 탐지에 필수적인 보조 도구
```

퍼징을 공부하면 단순히 도구 사용법만 배우는 것이 아니라,

프로그램이 입력을 어떻게 처리하고 어디서 예외가 발생하는지 분석하는 관점을 기를 수 있다.

버그바운티 관점에서도 퍼징은 매우 유용하다. 웹 API, 파일 업로드,

이미지 처리, JSON/XML 파서, 압축 해제 기능처럼 사용자의 입력을 처리하는 모든 지점은 퍼징 대상이 될 수 있다.

따라서 퍼징은 취약점 분석을 공부하는 사람에게 꼭 필요한 기술 중 하나라고 할 수 있다.

---
