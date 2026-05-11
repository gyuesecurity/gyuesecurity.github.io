---
title: "[Paper Review] 코드 생성형 LLM이 만드는 새로운 공급망 공격 - Package Hallucination"
date: 2026-05-11 01:00:00 +0900
categories: [논문/컨퍼런스]
tags: [LLM, RAG, Paper Review, Security]
---

# 코드 생성형 LLM이 만드는 새로운 공급망 공격

## *Package Hallucination이 소프트웨어 보안을 위협하는 방식*

---

## 논문 정보

### 논문 제목
**We Have a Package for You! A Comprehensive Analysis of Package Hallucinations by Code Generating LLMs**

### 학회
**USENIX Security Symposium 2025**

### 저자
Joseph Spracklen, Raveen Wijewickrama, A H M Nazmus Sakib, Anindya Maiti, Bimal Viswanath, Murtuza Jadliwala

### 논문 링크
- [USENIX 공식 페이지](https://www.usenix.org/conference/usenixsecurity25/presentation/spracklen)
- [논문 PDF](https://www.usenix.org/system/files/usenixsecurity25-spracklen.pdf)

> 본 논문은 USENIX Security 2025 Distinguished Paper Award Winner로 선정되었다.

---

# 논문을 선택한 이유

이 논문을 선택한 가장 큰 이유는 **LLM의 hallucination 문제가 단순히 "틀린 답변"에서 끝나는 것이 아니라 실제 보안 위협으로 이어질 수 있다는 점** 때문이다.

최근 ChatGPT, GitHub Copilot, Claude 같은 코드 생성형 LLM은 개발 과정에서 매우 자연스럽게 사용되고 있다.

단순한 코드 자동완성을 넘어 실제 라이브러리 import 구문, 패키지 설치 명령어, 코드 템플릿까지 자동으로 생성해주기 때문에 생산성이 크게 향상되었다.

하지만 여기서 중요한 질문이 생긴다.

> LLM이 생성한 코드, 정말 신뢰할 수 있을까?

특히 보안 관점에서는 이 질문이 더욱 중요하다.

존재하지 않는 패키지를 LLM이 실제 라이브러리처럼 추천한다면, 단순한 코드 오류가 아니라 새로운 공격 표면이 될 수 있기 때문이다.

이전에 개인적으로 **RAG 기반 보안 학습 도우미 프로젝트**를 고민하면서 LLM hallucination 문제를 중요하게 봤었기 때문에, 이 논문은 매우 흥미롭게 느껴졌다.

단순 AI 품질 문제가 아니라 **공급망 보안(Supply Chain Security)** 문제로 연결된다는 점이 인상적이었다.

---

# 1. 배경: LLM과 소프트웨어 개발의 변화

논문은 먼저 오늘날 소프트웨어 개발 환경이 얼마나 빠르게 변하고 있는지를 설명한다.

GPT-4, Claude, CodeLlama, DeepSeek Coder 같은 코드 생성형 LLM은 더 이상 실험적인 도구가 아니다.

이미 많은 개발자들이 실제 업무에 활용하고 있다.

논문에서는 다음과 같은 통계를 언급한다.

- 개발자의 최대 **97%**가 생성형 AI를 어느 정도 사용
- 오늘날 작성되는 코드의 약 **30%**가 AI에 의해 생성

이 변화는 생산성 측면에서 엄청난 장점을 가진다.

예전에는 라이브러리 사용법을 검색하고 공식 문서를 읽으며 코드를 작성해야 했다.

지금은 이렇게 물어보면 된다.

```text
Python으로 PDF 분석 코드 작성해줘
```

LLM은 바로 코드를 생성한다.

```python
import smartpdfparser
```

겉으로 보기에는 문제 없어 보인다.

하지만 여기서 중요한 문제가 있다.

**smartpdfparser가 실제 존재하는 패키지일까?**

LLM은 검색 엔진이 아니다.

실시간 검증 시스템도 아니다.

LLM은 학습 데이터 기반으로 "가장 그럴듯한 다음 단어"를 생성하는 모델이다.

즉 실제 존재 여부를 확인하지 않고도 충분히 그럴듯한 이름을 만들어낼 수 있다.

이게 바로 문제다.

---

# 2. 문제 정의: Package Hallucination

논문에서 정의하는 **Package Hallucination**은 다음과 같다.

> 코드 생성형 LLM이 실제로 존재하지 않는 패키지 이름을 생성하거나 추천하는 현상

예를 들어:

```python
import fastjsonsecure
```

그런데 PyPI에 `fastjsonsecure`라는 패키지가 없다면?

이것이 package hallucination이다.

보통 이런 상황이면 단순 실행 오류로 끝난다고 생각할 수 있다.

하지만 논문은 더 위험한 시나리오를 보여준다.

공격자가 이 hallucinated package 이름을 발견하고 실제로 PyPI에 등록한다.

```bash
pip install fastjsonsecure
```

이제 이후 사용자가 LLM 추천을 믿고 설치하면?

악성 패키지가 실행된다.

즉 공격 흐름은 이렇게 된다.

기존 공급망 공격:

```text
사용자의 오타
→ 잘못된 패키지 설치
→ 악성 코드 실행
```

이번 논문이 말하는 새로운 흐름:

```text
LLM hallucination
→ 공격자의 패키지 선점
→ 사용자의 설치
→ 악성 코드 실행
```

이게 핵심 차이다.

기존 공격은 사람이 실수해야 한다.

이번 공격은 **AI가 실수를 만들어낸다.**

---

# 3. 왜 이 문제가 중요한가?

## 3-1. 사용자는 LLM을 신뢰한다

많은 사용자는 LLM이 완벽하지 않다는 걸 안다.

하지만 현실에서는:

- 복붙
- 빠른 실행
- 검증 생략

이 자주 일어난다.

특히 초보 개발자는:

- 패키지가 실제 존재하는지
- 안전한지
- 유지보수되는지

이런 걸 확인하지 않는다.

---

## 3-2. 패키지 저장소는 개방형 생태계다

PyPI, npm은 누구나 패키지를 업로드할 수 있다.

즉 공격자는:

1. hallucinated package 발견
2. 같은 이름으로 패키지 등록
3. 악성 코드 삽입

이게 가능하다.

---

## 3-3. 공급망 공격은 피해 범위가 넓다

하나의 악성 패키지가 설치되면 끝이 아니다.

영향:

- 프로젝트 감염
- CI/CD 감염
- credential theft
- dependency chain 오염

즉 단순 코드 오류가 아니라 공급망 문제다.

---

# 4. 기존 연구와의 차이

기존 연구:

- Typosquatting
- Dependency confusion
- Malicious package detection
- Open-source trust analysis

공통점:

**사람의 실수 기반**

이번 논문:

> LLM이 공격자가 악용할 수 있는 패키지명을 생성하는가?

즉 시작점이 AI다.

이게 핵심이다.

---

# 5. 연구 질문

논문은 5개의 핵심 질문을 던진다.

## RQ1
LLM은 얼마나 자주 package hallucination을 일으키는가?

## RQ2
모델 설정이 hallucination에 영향을 주는가?

- temperature
- decoding
- training recency

## RQ3
LLM이 자기 hallucination을 감지할 수 있는가?

## RQ4
hallucinated package는 어떤 특징을 가지는가?

## RQ5
이 문제를 완화할 수 있는가?

---

# 6. 방법론

논문 실험 구조:

```text
Prompt 생성
→ 코드 생성
→ 패키지 추출
→ 존재 여부 검사
→ hallucination 분류
```

## 실험 규모

- 16개 코드 생성형 LLM
- Python + JavaScript
- 576,000 code samples
- 2.23 million package recommendations 분석

이 정도면 충분히 대규모다.

---

# 7. 주요 결과

## hallucination 비율

총:

- 2.23M package recommendation
- 440,445 hallucination
- 19.7%

즉 **5개 중 1개 수준**

---

## unique hallucinated package

무려:

**205,474개**

이건 충격적이다.

랜덤 오류 수준이 아니다.

---

## 상용 vs 오픈소스

Commercial:

**5.2%**

Open-source:

**21.7%**

상용 모델이 더 낫지만 안전하진 않다.

---

## 언어별 차이

Python:

**15.8%**

JavaScript:

**21.3%**

npm 생태계가 더 위험해 보인다.

---

# 8. 저자의 생각 vs 나의 생각

## 저자의 생각

논문은 hallucination을 단순 AI 오류가 아니라:

**공급망 공격 surface**

로 본다.

---

## 내 생각

이 부분이 가장 인상적이었다.

기존 hallucination:

```text
틀린 정보
```

이번 hallucination:

```text
공격 가능 자원
```

이 차이가 크다.

AI가 실수하면 끝이 아니라,

공격자가 그 실수를 weaponize 할 수 있다.

---

# 9. Mitigation

논문이 제안한 대응:

- RAG
- Self-refinement
- Fine-tuning
- Ensemble

## RAG

가장 흥미로웠다.

외부 package DB를 검색해서 valid package만 추천하게 한다.

이건 내가 고민하던 RAG 보안 프로젝트와도 연결된다.

---

## 결과

DeepSeek:

```text
Baseline: 16.14%
RAG: 12.24%
Fine-tuning: 2.66%
Ensemble: 2.40%
```

CodeLlama:

```text
Baseline: 26.28%
RAG: 13.40%
Fine-tuning: 10.27%
Ensemble: 9.32%
```

---

## Trade-off

Fine-tuning은 hallucination 줄이지만 성능 저하 발생.

DeepSeek:

```text
HumanEval pass@1
51.4% → 25.3%
```

즉 보안 vs 성능 trade-off 존재.

---

# 10. 한계점

## 현실 개발 환경 차이

실제 개발자는:

- GitHub 확인
- PyPI 확인
- StackOverflow 검색

할 수도 있다.

---

## 언어 제한

현재:

- Python
- JavaScript

만 분석

추가 필요:

- Rust
- Java
- C#
- Ruby

---

## 존재한다고 안전한 건 아니다

공격자가 이미 package 등록하면?

존재 여부 검사 무의미.

---

# 11. 느낀 점

이 논문에서 가장 크게 느낀 건:

> LLM 신뢰성은 AI 품질 문제가 아니라 보안 요구사항이다.

특히 보안 분야에서는 더 위험하다.

예:

- fake exploit code
- wrong mitigation
- fake tools
- hallucinated security package

이건 실제 사고로 이어질 수 있다.

---

# 12. 앞으로 해볼 것

## 1) Package validator 만들기

자동으로:

- import 추출
- registry 확인
- maintainer 검사
- trust score 계산

---

## 2) Safe RAG package recommender

LLM 자유 생성 금지

trusted package DB 기반 생성

---

## 3) 보안 학습 도우미 적용

내 프로젝트에 적용:

- OWASP
- NIST
- CVE
- official docs

기반 grounding

---

## 4) 추가 논문

읽어볼 것:

- Prompt Injection
- RAG Poisoning
- LLM Agent Security
- Secure Code Generation

---

# 결론

이 논문의 핵심 메시지는 명확하다.

```text
AI hallucination은 새로운 공급망 공격 진입점이 될 수 있다.
```

따라서:

**LLM output = trusted code**

이렇게 생각하면 안 된다.

오히려:

> LLM output도 외부 입력이다.

보안 관점에서는 반드시 검증해야 한다.

---

## Reference

```bibtex
@inproceedings{spracklen2025package,
  title={We Have a Package for You! A Comprehensive Analysis of Package Hallucinations by Code Generating LLMs},
  author={Spracklen, Joseph et al.},
  booktitle={USENIX Security Symposium},
  year={2025}
}
```
