---
title: "[2026 ACDC] Never forget rule"
date: 2026-10-31 14:00:00 +0900
categories: [CTF/Wargame]
tags: [ctf, ai-security, yara, reversing, onnx]
---

# Never forget rule - SVF2 포맷과 AI 분류 모델의 YARA 특징 복원

- 대회: ACDC 2026
- 분야: Security for AI / 파일 포맷 리버싱 / YARA 특징 복원
- 분석 대상: `Never forget rule.zip`에 포함된 SVF2 샘플, stripped 검증 프로그램, ONNX 분류 모델
- 최종 결과: 특징 검증 **40/40**, 탐지율 **99.5%**, 오탐률 **0%**, 서버 `passed: true`

## 1. 문제와 해결 방향

보안 분석 파이프라인을 이전하는 과정에서 SVF2 컨테이너의 특징을 추출하던 YARA 규칙이 사라졌다. 남아 있는 자료를 이용해 `feature_00`부터 `feature_23`까지 24개 불리언 특징을 복구해야 한다.

복구한 규칙으로 추출한 특징은 고정된 AI 분류 모델의 입력이 된다. 문제 설명의 목표는 악성 200개와 정상 200개로 구성된 평가 데이터에서 TPR 98% 이상, FPR 0.5% 이하를 만족하는 것이다. 실제 서버 응답에는 별도의 특징 검증 40개도 있었다. 분류 성능을 만족한 첫 제출은 특징 검증에서 실패했으며 플래그가 나오지 않았다.

핵심은 모델을 새로 학습하는 것이 아니라 **원래 모델이 기대하는 입력의 의미를 복원하는 것**이었다. 다음 순서로 분석했다.

1. `sample_viewer`의 검증 로직과 샘플 바이트를 대조해 v1/v2 포맷을 복원한다.
2. 과거 기록과 control/variant 쌍의 차이로 각 특징의 조건을 추론한다.
3. YARA 매치 결과를 24차원 벡터로 변환하고 ONNX 모델에 입력해 과거 점수를 재현한다.
4. 서버의 특징 검증 결과로 조건의 적용 범위를 수정한다.

이 문서의 특징 설명은 **최종 서버 검증을 통과한 제출 규칙의 동작**을 기준으로 한다. 비공개 원본 구현과 모든 가능한 입력에서 동일함을 증명한 것은 아니다.

## 2. 제공 파일

| 파일 | 용도 |
| --- | --- |
| `sample_viewer` | stripped x86-64 ELF. 컨테이너의 구조를 검증하고 버전·레코드 수·활성 레코드 수·digest를 출력한다. |
| `baseline.yar` | 불완전한 초기 규칙. v1 중심의 일부 특징만 구현되어 있다. |
| `old_traces.jsonl` | 샘플별 과거 점수와 분류. 일부 샘플에는 24개 특징 벡터도 있다. |
| `detector.onnx` | 복원한 특징을 입력받는 고정 분류 모델. |
| `samples/*.svf` | v1/v2 샘플과 `probe_XX_control` / `probe_XX_variant` 쌍. |

과거 기록은 45개이며, 특징 벡터가 직접 공개된 기록은 8개였다. 샘플 디렉터리에는 이 외에 과거 점수가 제공되지 않은 mixed 샘플도 있다.

검증 프로그램의 출력 예시는 다음과 같다.

```text
$ ./sample_viewer samples/probe_23_variant.svf
accepted version=2 records=4 active=4 digest=66f168f871c07e1c
```

이 프로그램은 특징 벡터를 직접 출력하지 않는다. 따라서 프로그램의 수용 여부와 구조 검사에서 얻은 정보에 샘플 비교와 모델 점수 재현을 결합해야 했다.

## 3. SVF2 포맷 복원

### 3.1 공통 헤더

다중 바이트 정수는 little endian이다. 헤더 크기는 `0x40`이다.

| 오프셋 | 크기 | 역할 |
| --- | --- | --- |
| `0x00` | 4 | magic: 바이트 문자열 `SVF2`, 정수로 `0x32465653` |
| `0x04` | 2 | 버전: 1 또는 2 |
| `0x06` | 2 | 헤더 크기: `0x40` |
| `0x08` | 4 | 헤더 플래그 |
| `0x0c` | 2 | 레코드 수 |
| `0x0e` | 2 | 레코드 크기: v1 `0x10`, v2 `0x14` |
| `0x10` | 4 | 레코드 테이블 시작 오프셋 |
| `0x14` | 4 | 레코드 테이블 크기 |
| `0x18` | 4 | 설정 영역 시작 오프셋 |
| `0x1c` | 4 | 설정 영역 크기: v1 `0x10`, v2 `0x14` |
| `0x20` | 4 | 문자열 영역 시작 오프셋 |
| `0x24` | 4 | 문자열 영역 크기 |
| `0x28` | 4 | 이력 영역 시작 오프셋 |
| `0x2c` | 4 | 이력 영역 크기 |
| `0x30` | 4 | 특징 비교에 쓰이는 값. 이하 `nonce`로 표기 |
| `0x34` | 4 | 최종 제출 규칙에서 사용하지 않음 |
| `0x38` | 4 | 전체 파일 크기 |
| `0x3c` | 4 | 이력 항목 수 |

`feature_00`은 magic, 버전, 헤더 크기, 전체 크기를 검사한다. `feature_01`은 레코드 수, 버전별 크기, 영역 순서와 경계, 레코드가 참조하는 문자열의 범위를 검사한다.

주요 제약은 다음과 같다.

```text
1 <= record_count <= 8
record_size == 0x10 (v1) 또는 0x14 (v2)
record_table_size == record_count * record_size
config_size == record_size
history_count <= 16
history_size == history_count * 8

0x40 <= record_offset
record_end <= config_offset
config_end <= string_offset
string_end <= history_offset
history_end <= filesize

각 레코드의 string_offset + string_length <= string_area_size
```

### 3.2 버전별 레코드 배치

`kind`, `id`, `link`, `param`, `severity` 등은 복원을 설명하기 위한 분석용 명칭이다.

| 필드 | 크기 | v1 상대 오프셋 | v2 상대 오프셋 |
| --- | --- | --- | --- |
| `kind` | 1 | `0x00` | `0x01` |
| `flags` | 1 | `0x01` | `0x00` |
| `severity` | 1 | `0x02` | `0x03` |
| 기타 1바이트 필드 | 1 | `0x03` | `0x02` |
| `id` | 2 | `0x04` | `0x0c` |
| `link` | 2 | `0x06` | `0x0e` |
| `param` | 4 | `0x08` | `0x04` |
| 문자열 상대 오프셋 | 2 | `0x0c` | `0x08` |
| 문자열 길이 | 2 | `0x0e` | `0x0a` |
| `stamp` | 4 | 없음 | `0x10` |

활성 상태는 `flags & 1`로 판단한다.

v2는 단순히 v1 레코드 뒤에 필드를 덧붙인 포맷이 아니다. 기존 필드의 위치도 이동한다. v1 오프셋을 그대로 사용하면 겉보기에는 파일을 인식해도 특징의 의미가 달라진다.

최종 YARA는 다음 값을 이용해 두 버전의 오프셋을 하나의 식으로 처리했다.

```text
v = version - 1                     # v1: 0, v2: 1
R(i) = record_offset + i * record_size

kind(i)     = uint8(R(i) + v)
flags(i)    = uint8(R(i) + 1 - v)
severity(i) = uint8(R(i) + 2 + v)
id(i)       = uint16(R(i) + 4 + 8*v)
link(i)     = uint16(R(i) + 6 + 8*v)
param(i)    = uint32(R(i) + 8 - 4*v)
```

### 3.3 문자열 인코딩

v1 문자열은 평문이며, v2 문자열은 헤더 `0x30`의 하위 1바이트로 XOR되어 있다.

```python
key = data[0x30] if version == 2 else 0
plaintext = bytes(b ^ key for b in encoded_string)
```

문자열의 실제 파일 위치는 다음과 같다.

```text
header.string_area_offset + record.string_relative_offset
```

최종 규칙은 문자열 영역 전체에서 단순 검색하는 대신, 해당 레코드의 문자열 길이를 확인한 뒤 참조 위치의 바이트를 복호화해 접두사를 비교한다. 이를 통해 레코드 종류와 활성 상태도 함께 검사할 수 있다.

### 3.4 설정 영역

설정 영역 시작을 `C`라고 하면 다음 필드를 사용한다.

| 필드 | v1 | v2 |
| --- | --- | --- |
| 모드 | `uint8(C)` | `uint8(C+1)` |
| 플래그 | `uint8(C+1)` | `uint8(C)` |
| 간격 값 | `uint16(C+2)` | `uint16(C+2)` |
| 활성 레코드 참조 ID | `uint16(C+6)` | `uint16(C+4)` |
| 비활성 레코드 참조 ID | `uint16(C+4)` | `uint16(C+6)` |
| `config_word` | `uint32(C+8)` | `uint32(C+8)` |
| 프로파일 태그 | `uint32(C+12)` | `uint32(C+12)` |
| salt | 없음 | `uint32(C+16)` |

특히 두 참조 ID의 위치가 버전에 따라 교환된다. 초기 복원에서 이 차이를 놓쳐 `probe_08_variant`, `probe_09_variant`, `probe_10_variant`의 분류가 맞지 않았고, 설정 영역의 바이트 차이를 확인해 수정했다.

### 3.5 이력 영역

각 항목은 8바이트이다.

```text
+0x00  uint16  record_id
+0x02  uint8   operation
+0x03  uint8   flags
+0x04  uint32  value
```

`value`는 최종 규칙에서 두 항목 사이의 대소 비교에 사용한다. 이 문서에서는 실제 시간 단위나 원래 필드 이름을 단정하지 않고 `value`로 부른다.

## 4. 24개 특징 복원

아래에서 `active`는 `flags & 1 == 1`, `inactive`는 그 반대이다. `feature_02` 이후의 모든 규칙은 `feature_01`을 전제로 한다.

| 특징 | 최종 통과 규칙의 조건 |
| --- | --- |
| `feature_00` | 공통 헤더의 magic, 버전, 헤더 크기, 파일 크기가 유효함 |
| `feature_01` | 버전별 구조 크기, 영역 경계, 문자열 참조 범위가 유효함 |
| `feature_02` | active kind 1 레코드의 문자열이 `cmd.exe`로 시작함 |
| `feature_03` | active kind 2 레코드의 문자열이 `pwsh -enc`로 시작함 |
| `feature_04` | active kind 3 레코드가 2개 이상 |
| `feature_05` | active kind 3 레코드 중 `param & 0xffff == 4444`인 항목이 있음 |
| `feature_06` | 설정 플래그의 bit 0이 켜짐 |
| `feature_07` | 설정 모드가 3이고 간격 값이 100 미만 |
| `feature_08` | active kind 4 레코드의 문자열이 `AUTO_RUN:`으로 시작함 |
| `feature_09` | 설정의 활성 참조 ID와 ID가 같은 active 레코드가 있음 |
| `feature_10` | active kind 1과 active kind 3 레코드의 ID가 같음 |
| `feature_11` | inactive kind 5 레코드의 문자열이 `ransom_note`로 시작함 |
| `feature_12` | 문자열이 `beacon:`으로 시작하는 active 레코드가 2개 이상 |
| `feature_13` | active `beacon:beta` 레코드의 `param == nonce ^ 0xa5a55a5a` |
| `feature_14` | 헤더 플래그 bit 2가 켜져 있고 설정 프로파일 태그가 `0xc0dec0de` |
| `feature_15` | active kind 6 → 7 → 8의 `link == 다음 레코드 id` 연결이 존재함 |
| `feature_16` | v2이고 active 레코드 중 `stamp == config_word ^ 0x13579bdf`인 항목이 있음 |
| `feature_17` | active 레코드 중 `severity >= 8`, `link == nonce & 0xffff`인 항목이 있음 |
| `feature_18` | active kind 2와 active kind 4 레코드의 ID가 같음 |
| `feature_19` | active 레코드와 ID가 같은 이력 중 operation 2, flags bit 0이 켜진 항목이 있음 |
| `feature_20` | 동일 active 레코드 ID에 대해 operation 0 이후 operation 1 항목이 있고, 뒤 항목의 `value`가 더 큼 |
| `feature_21` | 설정의 비활성 참조 ID와 ID가 같은 inactive 레코드가 있음 |
| `feature_22` | v2이고 설정 salt가 `nonce ^ 0x6d2b79f5` |
| `feature_23` | active 레코드와 ID가 같은 이력 중 operation 3, flags bit 0이 켜진 항목이 있음 |

### 4.1 control/variant 쌍으로 조건 분리

샘플 쌍은 여러 조건이 함께 사용되는 모델에서 개별 특징을 분리하는 단서가 되었다.

- `probe_09`: 레코드 내용은 유지되고 설정의 참조 ID가 바뀐다. 설정 참조가 active 레코드에 연결되는 조건을 찾을 수 있다.
- `probe_13`: `beacon:beta`의 `param`이 바뀐다. variant의 값은 헤더 `nonce ^ 0xa5a55a5a`와 일치한다.
- `probe_14`: 헤더 플래그와 설정 프로파일 태그가 바뀐다. 문자열 존재만으로는 충분하지 않음을 보여 준다.
- `probe_16`: `stamp`가 바뀐다. variant는 `config_word ^ 0x13579bdf`를 만족한다.
- `probe_17`: severity와 link가 바뀐다. 큰 severity 값과 nonce 하위 16비트의 교차 조건을 확인한다.
- `probe_19`: operation 2, flags 1인 이력 항목이 추가된다.
- `probe_20`: operation 0/1 이력 쌍과 증가하는 `value`가 만들어진다.
- `probe_22`: 설정의 v2 salt만 바뀌며 `nonce ^ 0x6d2b79f5`를 만족한다.
- `probe_23`: operation 3, flags 1인 이력 항목이 추가된다.

쌍 이름은 분석의 출발점으로 사용했다. 이름만으로 조건을 확정하지 않고 실제 필드 차이와 모델 출력, 최종 서버 검증을 대조했다.

## 5. ONNX 모델 분석과 로컬 검증

모델은 24차원 실수 벡터를 입력받는 작은 신경망이었다.

```text
features [1, 24]
    → MatMul(W1 [24, 12]) + B1 [12]
    → ReLU
    → MatMul(W2 [12, 1]) + B2 [1]
    → Sigmoid
    → score [1, 1]
```

수식으로는 다음과 같다.

```text
score = sigmoid(ReLU(features @ W1 + B1) @ W2 + B2)
```

YARA에 매치된 규칙 이름을 이용해 `feature_00`부터 `feature_23`까지 순서대로 0/1을 채운다. 모델에 넣을 때는 `float32`로 변환한다.

가중치를 보면 다음 특징들이 각각 같은 은닉 뉴런에 강하게 연결되어 있었다.

```text
(02, 03), 억제 방향: 11, 21
(04, 05, 06, 07)
(08, 09, 10)
(12, 13, 14)
(15, 19)
(16, 17, 18)
(20, 22, 23)
```

이 묶음은 분석 방향을 잡는 데 유용했다. 다만 모델에는 작은 교차 가중치도 있으므로 위 목록을 정확한 논리식과 동일시해서는 안 된다.

예를 들어 명령과 스크립트가 함께 있어도 tombstone이나 비활성 참조 특징이 활성화되면 낮은 점수가 나올 수 있다. 문자열 몇 개를 탐지하는 방식으로는 원래 입력을 복원할 수 없었다.

최종 제출 규칙을 사용한 로컬 검증 결과는 다음과 같다.

```text
labels: 45/45
published vectors: 8/8
max score error: 1.446853638e-07
```

마지막 오차는 약 `1.45 × 10^-7`이다. JSON에 기록된 점수와 float32 모델 출력 사이의 수치 차이 범위에서 점수를 재현했다.

로컬 분류 비교에는 0.5를 기준으로 사용했다. 과거 기록의 clean/suspicious 점수가 충분히 분리되어 있었으며, 서버의 최종 통과 여부는 아래 실제 평가 응답으로 별도 확인했다.

## 6. 서버 평가에서 찾은 적용 범위 오류

제출 API는 웹 클라이언트 `app.js`에서 확인했다.

```javascript
fetch("/submit", {
  method: "POST",
  headers: { "Content-Type": "text/plain; charset=utf-8" },
  body: source.value,
});
```

분석 초반에는 서버가 TCP 연결 뒤 HTTP 응답을 보내지 않았다. 재시도 중 서버가 응답하기 시작한 뒤 실제 평가를 진행했다.

### 6.1 첫 제출: 분류 성능은 만족했지만 실패

```json
{
  "classification": {
    "detection_rate": 1.0,
    "false_positive_rate": 0.0,
    "maximum_false_positive_rate": 0.005,
    "required_detection_rate": 0.98
  },
  "feature_cases": {"correct": 36, "total": 40},
  "ok": true,
  "passed": false
}
```

200개 악성 샘플과 200개 정상 샘플의 분류는 모두 맞았지만, 특징 검증 4개가 틀려 플래그가 나오지 않았다.

원인은 이력 조건의 범위를 과도하게 좁힌 것이었다. 초기 구현은 `feature_19`, `feature_20`, `feature_23`의 대상 레코드를 kind 8로 제한했다. chain 관련 예제에서 이력이 kind 8 레코드에 붙어 있었기 때문이다.

그러나 **연결 구조를 검사하는 `feature_15`와 이력을 검사하는 특징은 독립적**이었다. 이력 특징은 kind 8에만 적용할 조건이 아니었다.

### 6.2 `feature_19` 범위 수정: 38/40

이력의 대상 레코드에 대한 조건을 다음과 같이 바꾸었다.

```text
수정 전:
    active이고 kind == 8인 레코드와 ID가 같은 이력

수정 후:
    active 레코드와 ID가 같은 이력
```

`feature_19`만 수정한 서버 평가에서 특징 검증이 36/40에서 38/40으로 증가했고, 분류 성능은 그대로 유지되었다.

### 6.3 최종 수정: 40/40과 플래그

동일한 적용 범위 수정을 `feature_20`, `feature_23`에도 반영했다. 개별 실험 중 일부 요청은 시간 초과되어 결과를 받지 못했으므로, 남은 두 검증의 개선을 특정 규칙 하나에만 귀속시키지는 않는다. 최종적으로 세 이력 특징을 active 레코드 전체에 적용한 제출이 40/40을 통과했다.

최종 조건을 의사 코드로 정리하면 다음과 같다.

```python
feature_19 = any(
    record.active
    and history.record_id == record.id
    and history.operation == 2
    and history.flags & 1
)

feature_20 = any(
    record.active
    and history_0.record_id == record.id
    and history_1.record_id == record.id
    and history_0.operation == 0
    and history_1.operation == 1
    and history_1.index > history_0.index
    and history_1.value > history_0.value
)

feature_23 = any(
    record.active
    and history.record_id == record.id
    and history.operation == 3
    and history.flags & 1
)
```

별도의 암호학적 서명 계산을 추가할 필요는 없었다. 최종 `feature_23`은 대상 ID, operation, 플래그를 검사하며 이력의 32비트 `value` 자체를 검증하지 않는다.

## 7. 최종 서버 결과와 플래그

실제 서버가 반환한 응답은 다음과 같다.

```json
{
  "classification": {
    "detection_rate": 0.995,
    "false_positive_rate": 0.0,
    "maximum_false_positive_rate": 0.005,
    "required_detection_rate": 0.98
  },
  "feature_cases": {
    "correct": 40,
    "total": 40
  },
  "flag": "acdc2026{b6e77bbd8754e5ad070931f856d01c09d21f479cca64f94d1b6cc32ef435f01a}",
  "ok": true,
  "passed": true
}
```

| 항목 | 최종 결과 |
| --- | --- |
| 특징 검증 | 40/40 |
| TPR | 99.5% = 199/200 |
| FPR | 0% = 0/200 |
| 판정 | PASSED |

```text
acdc2026{b6e77bbd8754e5ad070931f856d01c09d21f479cca64f94d1b6cc32ef435f01a}
```

최종 제출본은 [submission.yar](Never_forget_rule_solution/submission.yar), 서버 응답 원본은 [server_result.json](Never_forget_rule_solution/server_result.json)에 저장되어 있다. `recovered_candidate.yar`는 특징 검증이 36/40이었던 이전 후보이므로 최종 제출 파일과 구분해야 한다.

## 8. 재현 방법

아래 명령은 WSL/bash 기준이다. Python 패키지는 별도 가상 환경에 설치한다.

```bash
cd '/mnt/c/Users/최양환/Downloads'
mkdir -p never-forget-rule-work
unzip 'Never forget rule.zip' -d never-forget-rule-work
cp Never_forget_rule_solution/submission.yar never-forget-rule-work/
cp Never_forget_rule_solution/validate_final.py never-forget-rule-work/
cd never-forget-rule-work

python3 -m venv .venv
source .venv/bin/activate
python -m pip install numpy onnxruntime yara-python
python validate_final.py
```

검증 스크립트는 모델과 과거 기록, 샘플을 현재 디렉터리에서 읽는다. 특징 벡터와 점수 비교 결과는 `final_validation.json`에 저장한다.

서버가 운영 중이라면 다음 명령으로 동일한 규칙을 제출할 수 있다.

```bash
curl --max-time 120 \
  -H 'Content-Type: text/plain; charset=utf-8' \
  --data-binary @submission.yar \
  http://43.203.159.124/submit
```

서버가 내려가 있어도 로컬 재현은 가능하다. 플래그 획득 근거는 분석 당시 저장한 서버 응답이며, 향후 서버 가용성을 전제로 하지 않는다.

## 9. 풀이에서 중요했던 점

- **포맷의 버전 차이를 먼저 해결해야 한다.** 레코드 필드뿐 아니라 설정의 참조 ID도 v1/v2에서 위치가 바뀐다.
- **분류가 맞는 것과 특징이 맞는 것은 다르다.** 신경망의 다른 조건이 활성화되지 않으면 일부 잘못된 입력도 같은 점수를 낼 수 있다.
- **예제의 사용 문맥을 특징 정의로 착각하면 안 된다.** chain 예제에 붙은 이력이라고 해서 이력 특징을 chain의 마지막 레코드에만 제한하면 안 된다.
- **최종 결과는 서버 응답으로 확인한다.** 로컬 45개 기록 재현, 공개 벡터 8개 일치, 서버 특징 검증 40개 통과를 구분해 확인했다.

## 부록 A. 로컬 검증 코드

아래 코드는 다운로드 폴더의 `Never_forget_rule_solution/validate_final.py`와 같다.

```python
import argparse
import json
from pathlib import Path

import numpy as np
import onnxruntime as ort
import yara

parser = argparse.ArgumentParser()
parser.add_argument('--rules', default='submission.yar')
parser.add_argument('--report', default='final_validation.json')
args = parser.parse_args()
rules = yara.compile(filepath=args.rules)
model = ort.InferenceSession('detector.onnx', providers=['CPUExecutionProvider'])
rows = []
for line in Path('old_traces.jsonl').read_text().splitlines():
    trace = json.loads(line)
    matched = {m.rule for m in rules.match(str(Path('samples') / trace['file']))}
    features = [int(f'feature_{i:02d}' in matched) for i in range(24)]
    score = float(model.run(None, {'features': np.array([features], dtype=np.float32)})[0].item())
    label = 'suspicious' if score >= 0.5 else 'clean'
    rows.append({
        'file': trace['file'], 'features': features,
        'score': score, 'expected_score': trace['score'],
        'label_matches': label == trace['label'],
        'features_match': features == trace['features'] if 'features' in trace else None,
    })
Path(args.report).write_text(json.dumps(rows, ensure_ascii=False, indent=2))
print(f"labels: {sum(r['label_matches'] for r in rows)}/{len(rows)}")
known = [r for r in rows if r['features_match'] is not None]
print(f"published vectors: {sum(r['features_match'] for r in known)}/{len(known)}")
print(f"max score error: {max(abs(r['score'] - r['expected_score']) for r in rows):.10g}")
```

## 부록 B. 최종 YARA 규칙 전체

아래는 서버에서 `passed: true`를 받은 `submission.yar`의 전체 내용이다. 각 규칙의 길이가 긴 것은 버전별 필드 오프셋과 문자열 XOR 비교를 YARA 식으로 직접 전개했기 때문이다.

```yara
rule feature_00 { condition: filesize >= 0x40 and uint32(0) == 0x32465653 and (uint16(4) == 1 or uint16(4) == 2) and uint16(6) == 0x40 and uint32(0x38) == filesize }

rule feature_01 { condition: feature_00 and uint16(0x0c) >= 1 and uint16(0x0c) <= 8 and uint16(0x0e) == 0x10 + 4 * (uint16(4) - 1) and uint32(0x14) == uint16(0x0c) * uint16(0x0e) and uint32(0x1c) == uint16(0x0e) and uint32(0x3c) <= 16 and uint32(0x2c) == 8 * uint32(0x3c) and uint32(0x10) >= 0x40 and uint32(0x10) + uint32(0x14) <= uint32(0x18) and uint32(0x18) + uint32(0x1c) <= uint32(0x20) and uint32(0x20) + uint32(0x24) <= uint32(0x28) and uint32(0x28) + uint32(0x2c) <= filesize and for all i in (0..uint16(0x0c) - 1) : (uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1)) + uint16((uint32(0x10) + i * uint16(0x0e)) + 14 - 4 * (uint16(4) - 1)) <= uint32(0x24)) }

rule feature_02 { condition: feature_01 and (for any i in (0..uint16(0x0c) - 1) : (uint8((uint32(0x10) + i * uint16(0x0e)) + (uint16(4) - 1)) == 1 and (uint8((uint32(0x10) + i * uint16(0x0e)) + 1 - (uint16(4) - 1)) & 1) == 1 and uint16((uint32(0x10) + i * uint16(0x0e)) + 14 - 4 * (uint16(4) - 1)) >= 7 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 0) ^ ((uint16(4) - 1) * uint8(0x30))) == 99 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 1) ^ ((uint16(4) - 1) * uint8(0x30))) == 109 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 2) ^ ((uint16(4) - 1) * uint8(0x30))) == 100 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 3) ^ ((uint16(4) - 1) * uint8(0x30))) == 46 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 4) ^ ((uint16(4) - 1) * uint8(0x30))) == 101 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 5) ^ ((uint16(4) - 1) * uint8(0x30))) == 120 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 6) ^ ((uint16(4) - 1) * uint8(0x30))) == 101)) }

rule feature_03 { condition: feature_01 and (for any i in (0..uint16(0x0c) - 1) : (uint8((uint32(0x10) + i * uint16(0x0e)) + (uint16(4) - 1)) == 2 and (uint8((uint32(0x10) + i * uint16(0x0e)) + 1 - (uint16(4) - 1)) & 1) == 1 and uint16((uint32(0x10) + i * uint16(0x0e)) + 14 - 4 * (uint16(4) - 1)) >= 9 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 0) ^ ((uint16(4) - 1) * uint8(0x30))) == 112 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 1) ^ ((uint16(4) - 1) * uint8(0x30))) == 119 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 2) ^ ((uint16(4) - 1) * uint8(0x30))) == 115 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 3) ^ ((uint16(4) - 1) * uint8(0x30))) == 104 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 4) ^ ((uint16(4) - 1) * uint8(0x30))) == 32 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 5) ^ ((uint16(4) - 1) * uint8(0x30))) == 45 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 6) ^ ((uint16(4) - 1) * uint8(0x30))) == 101 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 7) ^ ((uint16(4) - 1) * uint8(0x30))) == 110 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 8) ^ ((uint16(4) - 1) * uint8(0x30))) == 99)) }

rule feature_04 { condition: feature_01 and (for 2 i in (0..uint16(0x0c) - 1) : (uint8((uint32(0x10) + i * uint16(0x0e)) + (uint16(4) - 1)) == 3 and (uint8((uint32(0x10) + i * uint16(0x0e)) + 1 - (uint16(4) - 1)) & 1) == 1)) }

rule feature_05 { condition: feature_01 and (for any i in (0..uint16(0x0c) - 1) : (uint8((uint32(0x10) + i * uint16(0x0e)) + (uint16(4) - 1)) == 3 and (uint8((uint32(0x10) + i * uint16(0x0e)) + 1 - (uint16(4) - 1)) & 1) == 1 and (uint32((uint32(0x10) + i * uint16(0x0e)) + 8 - 4 * (uint16(4) - 1)) & 0xffff) == 4444)) }

rule feature_06 { condition: feature_01 and ((uint8(uint32(0x18) + 1 - (uint16(4) - 1)) & 1) == 1) }

rule feature_07 { condition: feature_01 and (uint8(uint32(0x18) + (uint16(4) - 1)) == 3 and uint16(uint32(0x18) + 2) < 100) }

rule feature_08 { condition: feature_01 and (for any i in (0..uint16(0x0c) - 1) : (uint8((uint32(0x10) + i * uint16(0x0e)) + (uint16(4) - 1)) == 4 and (uint8((uint32(0x10) + i * uint16(0x0e)) + 1 - (uint16(4) - 1)) & 1) == 1 and uint16((uint32(0x10) + i * uint16(0x0e)) + 14 - 4 * (uint16(4) - 1)) >= 9 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 0) ^ ((uint16(4) - 1) * uint8(0x30))) == 65 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 1) ^ ((uint16(4) - 1) * uint8(0x30))) == 85 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 2) ^ ((uint16(4) - 1) * uint8(0x30))) == 84 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 3) ^ ((uint16(4) - 1) * uint8(0x30))) == 79 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 4) ^ ((uint16(4) - 1) * uint8(0x30))) == 95 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 5) ^ ((uint16(4) - 1) * uint8(0x30))) == 82 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 6) ^ ((uint16(4) - 1) * uint8(0x30))) == 85 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 7) ^ ((uint16(4) - 1) * uint8(0x30))) == 78 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 8) ^ ((uint16(4) - 1) * uint8(0x30))) == 58)) }

rule feature_09 { condition: feature_01 and (for any i in (0..uint16(0x0c) - 1) : ((uint8((uint32(0x10) + i * uint16(0x0e)) + 1 - (uint16(4) - 1)) & 1) == 1 and uint16((uint32(0x10) + i * uint16(0x0e)) + 4 + 8 * (uint16(4) - 1)) == uint16(uint32(0x18) + 6 - 2 * (uint16(4) - 1)))) }

rule feature_10 { condition: feature_01 and (for any i in (0..uint16(0x0c) - 1) : (uint8((uint32(0x10) + i * uint16(0x0e)) + (uint16(4) - 1)) == 1 and (uint8((uint32(0x10) + i * uint16(0x0e)) + 1 - (uint16(4) - 1)) & 1) == 1 and for any j in (0..uint16(0x0c) - 1) : (uint8((uint32(0x10) + j * uint16(0x0e)) + (uint16(4) - 1)) == 3 and (uint8((uint32(0x10) + j * uint16(0x0e)) + 1 - (uint16(4) - 1)) & 1) == 1 and uint16((uint32(0x10) + i * uint16(0x0e)) + 4 + 8 * (uint16(4) - 1)) == uint16((uint32(0x10) + j * uint16(0x0e)) + 4 + 8 * (uint16(4) - 1))))) }

rule feature_11 { condition: feature_01 and (for any i in (0..uint16(0x0c) - 1) : (uint8((uint32(0x10) + i * uint16(0x0e)) + (uint16(4) - 1)) == 5 and (uint8((uint32(0x10) + i * uint16(0x0e)) + 1 - (uint16(4) - 1)) & 1) == 0 and uint16((uint32(0x10) + i * uint16(0x0e)) + 14 - 4 * (uint16(4) - 1)) >= 11 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 0) ^ ((uint16(4) - 1) * uint8(0x30))) == 114 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 1) ^ ((uint16(4) - 1) * uint8(0x30))) == 97 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 2) ^ ((uint16(4) - 1) * uint8(0x30))) == 110 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 3) ^ ((uint16(4) - 1) * uint8(0x30))) == 115 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 4) ^ ((uint16(4) - 1) * uint8(0x30))) == 111 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 5) ^ ((uint16(4) - 1) * uint8(0x30))) == 109 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 6) ^ ((uint16(4) - 1) * uint8(0x30))) == 95 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 7) ^ ((uint16(4) - 1) * uint8(0x30))) == 110 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 8) ^ ((uint16(4) - 1) * uint8(0x30))) == 111 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 9) ^ ((uint16(4) - 1) * uint8(0x30))) == 116 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 10) ^ ((uint16(4) - 1) * uint8(0x30))) == 101)) }

rule feature_12 { condition: feature_01 and (for 2 i in (0..uint16(0x0c) - 1) : ((uint8((uint32(0x10) + i * uint16(0x0e)) + 1 - (uint16(4) - 1)) & 1) == 1 and uint16((uint32(0x10) + i * uint16(0x0e)) + 14 - 4 * (uint16(4) - 1)) >= 7 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 0) ^ ((uint16(4) - 1) * uint8(0x30))) == 98 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 1) ^ ((uint16(4) - 1) * uint8(0x30))) == 101 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 2) ^ ((uint16(4) - 1) * uint8(0x30))) == 97 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 3) ^ ((uint16(4) - 1) * uint8(0x30))) == 99 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 4) ^ ((uint16(4) - 1) * uint8(0x30))) == 111 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 5) ^ ((uint16(4) - 1) * uint8(0x30))) == 110 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 6) ^ ((uint16(4) - 1) * uint8(0x30))) == 58)) }

rule feature_13 { condition: feature_01 and (for any i in (0..uint16(0x0c) - 1) : ((uint8((uint32(0x10) + i * uint16(0x0e)) + 1 - (uint16(4) - 1)) & 1) == 1 and uint16((uint32(0x10) + i * uint16(0x0e)) + 14 - 4 * (uint16(4) - 1)) >= 11 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 0) ^ ((uint16(4) - 1) * uint8(0x30))) == 98 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 1) ^ ((uint16(4) - 1) * uint8(0x30))) == 101 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 2) ^ ((uint16(4) - 1) * uint8(0x30))) == 97 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 3) ^ ((uint16(4) - 1) * uint8(0x30))) == 99 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 4) ^ ((uint16(4) - 1) * uint8(0x30))) == 111 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 5) ^ ((uint16(4) - 1) * uint8(0x30))) == 110 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 6) ^ ((uint16(4) - 1) * uint8(0x30))) == 58 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 7) ^ ((uint16(4) - 1) * uint8(0x30))) == 98 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 8) ^ ((uint16(4) - 1) * uint8(0x30))) == 101 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 9) ^ ((uint16(4) - 1) * uint8(0x30))) == 116 and (uint8((uint32(0x20) + uint16((uint32(0x10) + i * uint16(0x0e)) + 12 - 4 * (uint16(4) - 1))) + 10) ^ ((uint16(4) - 1) * uint8(0x30))) == 97 and uint32((uint32(0x10) + i * uint16(0x0e)) + 8 - 4 * (uint16(4) - 1)) == (uint32(0x30) ^ 0xa5a55a5a))) }

rule feature_14 { condition: feature_01 and ((uint32(8) & 4) == 4 and uint32(uint32(0x18) + 12) == 0xc0dec0de) }

rule feature_15 { condition: feature_01 and (for any i in (0..uint16(0x0c) - 1) : (uint8((uint32(0x10) + i * uint16(0x0e)) + (uint16(4) - 1)) == 6 and (uint8((uint32(0x10) + i * uint16(0x0e)) + 1 - (uint16(4) - 1)) & 1) == 1 and for any j in (0..uint16(0x0c) - 1) : (uint8((uint32(0x10) + j * uint16(0x0e)) + (uint16(4) - 1)) == 7 and (uint8((uint32(0x10) + j * uint16(0x0e)) + 1 - (uint16(4) - 1)) & 1) == 1 and uint16((uint32(0x10) + i * uint16(0x0e)) + 6 + 8 * (uint16(4) - 1)) == uint16((uint32(0x10) + j * uint16(0x0e)) + 4 + 8 * (uint16(4) - 1)) and for any k in (0..uint16(0x0c) - 1) : (uint8((uint32(0x10) + k * uint16(0x0e)) + (uint16(4) - 1)) == 8 and (uint8((uint32(0x10) + k * uint16(0x0e)) + 1 - (uint16(4) - 1)) & 1) == 1 and uint16((uint32(0x10) + j * uint16(0x0e)) + 6 + 8 * (uint16(4) - 1)) == uint16((uint32(0x10) + k * uint16(0x0e)) + 4 + 8 * (uint16(4) - 1)))))) }

rule feature_16 { condition: feature_01 and (uint16(4) == 2 and for any i in (0..uint16(0x0c) - 1) : ((uint8((uint32(0x10) + i * uint16(0x0e)) + 1 - (uint16(4) - 1)) & 1) == 1 and uint32((uint32(0x10) + i * uint16(0x0e)) + 16) == (uint32(uint32(0x18) + 8) ^ 0x13579bdf))) }

rule feature_17 { condition: feature_01 and (for any i in (0..uint16(0x0c) - 1) : ((uint8((uint32(0x10) + i * uint16(0x0e)) + 1 - (uint16(4) - 1)) & 1) == 1 and uint8((uint32(0x10) + i * uint16(0x0e)) + 2 + (uint16(4) - 1)) >= 8 and uint16((uint32(0x10) + i * uint16(0x0e)) + 6 + 8 * (uint16(4) - 1)) == (uint32(0x30) & 0xffff))) }

rule feature_18 { condition: feature_01 and (for any i in (0..uint16(0x0c) - 1) : (uint8((uint32(0x10) + i * uint16(0x0e)) + (uint16(4) - 1)) == 2 and (uint8((uint32(0x10) + i * uint16(0x0e)) + 1 - (uint16(4) - 1)) & 1) == 1 and for any j in (0..uint16(0x0c) - 1) : (uint8((uint32(0x10) + j * uint16(0x0e)) + (uint16(4) - 1)) == 4 and (uint8((uint32(0x10) + j * uint16(0x0e)) + 1 - (uint16(4) - 1)) & 1) == 1 and uint16((uint32(0x10) + i * uint16(0x0e)) + 4 + 8 * (uint16(4) - 1)) == uint16((uint32(0x10) + j * uint16(0x0e)) + 4 + 8 * (uint16(4) - 1))))) }

rule feature_19 { condition: feature_01 and (for any i in (0..uint16(0x0c) - 1) : ((uint8((uint32(0x10) + i * uint16(0x0e)) + 1 - (uint16(4) - 1)) & 1) == 1 and uint32(0x3c) > 0 and for any h in (0..uint32(0x3c) - 1) : (uint16(uint32(0x28) + 8 * h + 0) == uint16((uint32(0x10) + i * uint16(0x0e)) + 4 + 8 * (uint16(4) - 1)) and uint8(uint32(0x28) + 8 * h + 2) == 2 and (uint8(uint32(0x28) + 8 * h + 3) & 1) == 1))) }

rule feature_20 { condition: feature_01 and (for any i in (0..uint16(0x0c) - 1) : ((uint8((uint32(0x10) + i * uint16(0x0e)) + 1 - (uint16(4) - 1)) & 1) == 1 and uint32(0x3c) > 0 and for any h in (0..uint32(0x3c) - 1) : (uint16(uint32(0x28) + 8 * h + 0) == uint16((uint32(0x10) + i * uint16(0x0e)) + 4 + 8 * (uint16(4) - 1)) and uint8(uint32(0x28) + 8 * h + 2) == 0 and uint32(0x3c) > 0 and for any g in (0..uint32(0x3c) - 1) : (g > h and uint16(uint32(0x28) + 8 * g + 0) == uint16((uint32(0x10) + i * uint16(0x0e)) + 4 + 8 * (uint16(4) - 1)) and uint8(uint32(0x28) + 8 * g + 2) == 1 and uint32(uint32(0x28) + 8 * g + 4) > uint32(uint32(0x28) + 8 * h + 4))))) }

rule feature_21 { condition: feature_01 and (for any i in (0..uint16(0x0c) - 1) : ((uint8((uint32(0x10) + i * uint16(0x0e)) + 1 - (uint16(4) - 1)) & 1) == 0 and uint16((uint32(0x10) + i * uint16(0x0e)) + 4 + 8 * (uint16(4) - 1)) == uint16(uint32(0x18) + 4 + 2 * (uint16(4) - 1)))) }

rule feature_22 { condition: feature_01 and (uint16(4) == 2 and uint32(uint32(0x18) + 16) == (uint32(0x30) ^ 0x6d2b79f5)) }

rule feature_23 { condition: feature_01 and (for any i in (0..uint16(0x0c) - 1) : ((uint8((uint32(0x10) + i * uint16(0x0e)) + 1 - (uint16(4) - 1)) & 1) == 1 and uint32(0x3c) > 0 and for any h in (0..uint32(0x3c) - 1) : (uint16(uint32(0x28) + 8 * h + 0) == uint16((uint32(0x10) + i * uint16(0x0e)) + 4 + 8 * (uint16(4) - 1)) and uint8(uint32(0x28) + 8 * h + 2) == 3 and (uint8(uint32(0x28) + 8 * h + 3) & 1) == 1))) }
```
