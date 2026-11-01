---
title: "[2026 ACDC] Sound Picking"
date: 2026-10-31 14:06:00 +0900
categories: [CTF/Wargame]
tags: [ctf, ai, signal-processing, machine-learning, audio]
---

# Sound Picking - 음향 신호 분석으로 가상 열쇠의 홈 깊이 복원

## 1. 문제 정보

- 문제명: **Sound Picking**
- 분야: AI for Security / 신호 분석 / 머신러닝
- 목표: WAV 녹음에서 가상 열쇠의 홈 깊이 10자리를 복원
- 깊이 범위: 각 자리 `0`–`3`
- 정답 형식: `^[0-3]{10}$`
- 플래그 형식: `acdc2026{...}`

문제는 총 3단계로 구성된다. 각 단계에서 대상 열쇠 3개의 형상을 맞히면 다음 단계 자료를 받을 수 있고, Phase 3까지 통과하면 플래그가 반환된다.

## 2. 최종 결과

### Phase 1

| 대상 | 정답 |
|---|---|
| `t00` | `1131220003` |
| `t01` | `1213033122` |
| `t02` | `3022202222` |

### Phase 2

| 대상 | 정답 |
|---|---|
| `t03` | `3100121212` |
| `t04` | `0221032212` |
| `t05` | `1320330310` |

### Phase 3

| 대상 | 정답 |
|---|---|
| `t06` | `0020021233` |
| `t07` | `0310003300` |
| `t08` | `2013120233` |

### 플래그

아래 값은 Phase 3 정답을 현재 진행 키로 서버에 다시 제출하여 `"ok": true` 응답과 함께 확인한 플래그다.

```text
acdc2026{ae9ecefb922d2baab2b895f2605155c273da7b9d0e4055ef6b2c9fe0bbf40b6952c2818e2184af48223b17a1e72f20046f7e771ec1fa5d806c9bcee8b248784d4acdaedaa8b53c72}
```

## 3. 데이터 구조

각 단계의 압축 파일에는 다음 자료가 들어 있다.

```text
manifest.json
known/<10자리 정답>/r00.wav ... r05.wav
targets/<대상 ID>/r00.wav ... r05.wav
```

- `known`: 열쇠 형상이 폴더명으로 공개된 학습 데이터
- `targets`: 형상을 복원해야 하는 대상 데이터
- 열쇠 하나마다 반복 녹음 6개 제공
- 샘플레이트 16 kHz, 길이 6초
- Phase 1은 mono, Phase 2와 3은 stereo

제출 API는 다음 구조를 사용한다.

```json
{
  "phase": "phase1",
  "phase_key": null,
  "answers": {
    "t00": "1131220003",
    "t01": "1213033122",
    "t02": "3022202222"
  }
}
```

Phase 1 성공 응답에서 받은 `next.key`를 Phase 2 다운로드 및 제출에 사용하고, Phase 2 성공 키를 Phase 3에 사용한다.

## 4. 핵심 아이디어: 깊이가 아니라 전이를 분류한다

각 홈의 절대 깊이를 오디오 구간과 바로 대응시키는 방식은 정확도가 낮았다. 대신 이전 깊이 `p`에서 현재 깊이 `d`로 이동할 때 통과하는 경계를 분류했다.

깊이를 `0`, `1`, `2`, `3`으로 두면 방향을 무시한 전이 클래스는 일곱 가지다.

| 클래스 | 전이 | 통과 경계 |
|---:|---|---|
| 0 | 같은 깊이 | 없음 |
| 1 | `0↔1` | 1 |
| 2 | `1↔2` | 2 |
| 3 | `2↔3` | 3 |
| 4 | `0↔2` | 1, 2 |
| 5 | `1↔3` | 2, 3 |
| 6 | `0↔3` | 1, 2, 3 |

이를 행렬로 표현하면 다음과 같다.

```python
EDGE = np.array([
    [0, 1, 4, 6],
    [1, 0, 2, 5],
    [4, 2, 0, 3],
    [6, 5, 3, 0],
])
```

첫 번째 홈 이전 깊이는 `0`으로 가정한다.

```python
previous = np.r_[0, depths[:-1]]
edge_labels = EDGE[previous, depths]
```

## 5. 시간축과 주파수축 정렬

### 5.1. 10개 구간 분리

녹음의 약 6.2 kHz 대역에는 0.5초 간격의 기준 클릭이 있다. 5.8–6.6 kHz 에너지에서 11개의 경계를 검출하고, 누락된 경계는 보간한다.

```python
ids = np.rint((detected_times - 0.5) / 0.5).astype(int)
ticks = np.interp(np.arange(11), ids, detected_times)
```

각 경계 사이를 동일한 길이의 시간축으로 워핑하면 삽입 속도가 달라도 같은 홈 위치를 비교할 수 있다.

### 5.2. 헤더에 따른 주파수 보정

초반 헤더에는 약 7.0 kHz 또는 7.5 kHz 계열이 존재한다. 두 계열에 따라 열쇠 경계 신호의 중심 주파수가 달라진다.

```python
high = fi / ft > 1.17
detuning = fi - (7500 if high else 7000)
centers = np.array([2000, 2600, 3200]) + 400 * high + detuning
```

즉, 낮은 계열의 중심은 대략 2.0/2.6/3.2 kHz이고 높은 계열은 각각 400 Hz 위에 있다. 녹음별 detuning까지 보정한 뒤 특징을 추출한다.

## 6. 특징 추출과 학습

STFT 예시는 다음과 같다.

```python
f, t, z = scipy.signal.stft(
    waveform,
    fs=16000,
    nperseg=512,
    noverlap=384,
    nfft=2048,
)
amplitude = np.abs(z)
```

각 홈 구간에서 다음 정보를 사용했다.

- 보정된 세 중심 주파수 주변의 스펙트럼
- 시간축 평균과 최댓값
- 대역별 시간 변화 곡선
- 헤더 계열과 홈 위치
- 여섯 반복 녹음의 평균 또는 로그 확률 평균

알려진 열쇠로 전이 클래스를 학습하고 `ExtraTreesClassifier`로 각 구간의 일곱 전이 확률을 예측했다.

```python
model = ExtraTreesClassifier(
    n_estimators=240,
    max_features=0.6,
    min_samples_leaf=2,
    n_jobs=3,
    random_state=426,
)
```

## 7. 동적 계획법으로 10자리 복원

각 구간을 독립적으로 분류하면 앞 구간의 현재 깊이와 다음 구간의 이전 깊이가 맞지 않을 수 있다. 따라서 현재 깊이 `0..3`을 상태로 두고 동적 계획법을 적용한다.

구간 `i`에서 `p → d` 전이 점수를 다음처럼 계산한다.

```text
score(i, p, d)
  = log_probability[i][EDGE[p][d]]
  - log(class_prior[EDGE[p][d]])
```

전이 경로를 누적하여 가장 높은 점수의 10자리 문자열을 선택한다.

```python
def decode(log_probability, prior):
    states = {0: (0.0, "")}

    for row in log_probability:
        next_states = {}
        for depth in range(4):
            candidates = []
            for previous, (score, key) in states.items():
                edge = EDGE[previous, depth]
                candidates.append((
                    score + row[edge] - np.log(prior[edge]),
                    key + str(depth),
                ))
            next_states[depth] = max(candidates)
        states = next_states

    return max(states.values())
```

실전에서는 각 깊이마다 한 경로만 보존하지 않고 여러 상위 경로를 유지하여 서버 제출 후보를 만들었다.

## 8. 단계별 추가 보정

### Phase 1

단일 채널이므로 기준 클릭으로 시간축을 정렬하고 헤더 계열에 맞춰 주파수를 보정한 뒤 전이 모델을 적용했다.

### Phase 2

채널 0에는 기준 신호, 채널 1에는 지연 및 리샘플링된 열쇠 신호가 들어 있다. 약 5.2 kHz 파일럿의 두 채널 주파수 비율로 리샘플링 배율을 계산했다.

```python
scale = pilot_frequency_1 / pilot_frequency_0
sample_frequencies = (base_frequency_grid + offset) * scale
```

시간 경계는 payload 채널에서 직접 검출하고, 주파수 표본 위치에 `scale`을 적용했다.

### Phase 3

두 채널에 두 열쇠 음원이 혼합되어 있으므로 다음 순서로 처리했다.

1. 두 채널 사이의 정수 샘플 지연 추정
2. 상대 이득 추정
3. 선형 결합으로 두 음원 후보 분리
4. 각 분리 음원에서 열쇠 형상 복원
5. 파일럿의 방향 정보를 이용해 실제 대상 음원 선택

이 선택 과정이 중요했다. 예를 들어 `t08`에서는 단순 점수가 높은 첫 번째 복원값이 아니라, 방향 판정으로 선택된 두 번째 키 `2013120233`이 정답이었다.

## 9. 시행착오

다음 접근은 일부 특징을 포착했지만 최종 복원에는 부족했다.

- 대상 녹음을 알려진 64개 열쇠와 단순 파형 거리로 비교
- 고정 시간 구간의 스펙트럼을 홈 깊이에 직접 회귀
- CNN/CTC로 10자리 문자열을 바로 예측
- 인접 깊이 차이의 절댓값만 복원
- 모든 반복 녹음을 함께 정렬한 뒤 나누는 교차검증

특히 마지막 방법은 평가 누수를 만들 수 있다. 같은 열쇠의 반복 녹음을 평가 전에 공동 정렬하면 검증 데이터의 정보가 학습 특징에 섞인다. 최종 모델 선택에서는 같은 형상의 모든 반복을 그룹으로 묶어 홀드아웃하고, 숨긴 열쇠의 10자리 완전 복원률을 기준으로 삼아야 한다.

## 10. 최종 제출

Phase 3 제출 본문은 다음과 같다. `phase_key`에는 Phase 2 성공 응답에서 받은 키를 넣는다.

```json
{
  "phase": "phase3",
  "phase_key": "<PHASE_3_KEY>",
  "answers": {
    "t06": "0020021233",
    "t07": "0310003300",
    "t08": "2013120233"
  }
}
```

서버 응답:

```json
{
  "ok": true,
  "phase": "phase3",
  "flag": "acdc2026{ae9ecefb922d2baab2b895f2605155c273da7b9d0e4055ef6b2c9fe0bbf40b6952c2818e2184af48223b17a1e72f20046f7e771ec1fa5d806c9bcee8b248784d4acdaedaa8b53c72}"
}
```

## 11. 결론

이 문제의 핵심은 열쇠 깊이를 오디오에 직접 대응시키는 것이 아니라, 기준 클릭으로 구간을 정렬한 뒤 **이전 깊이와 현재 깊이 사이에서 통과한 경계**를 분류하는 것이다. Phase 2와 Phase 3에서는 각각 채널 리샘플링과 혼합 음원 분리를 추가하고, 마지막으로 동적 계획법을 사용해 일관된 10자리 깊이열을 복원했다.
