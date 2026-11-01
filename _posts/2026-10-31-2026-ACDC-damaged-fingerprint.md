---
title: "[2026 ACDC] Damaged fingerprint"
date: 2026-10-31 12:32:48 +0900
categories: [CTF/Wargame]
tags: [ctf, ai, image-restoration, computer-vision, forensics]
---

# Damaged fingerprint - 교차 세션 관측본을 이용한 손상 지문 복원

## Summary

- Category: AI / image restoration
- Primitive/invariant: 쿠키마다 다른 문제를 주지만, 사전 생성된 풀의 서로 다른 세션이 **동일 지문 identity의 다른 관측본**을 공유한다.
- Flag path: 다른 세션의 비손상 융선을 현재 세션에 정합하고 RidgeNet 예측과 혼합한 세 PNG를 제출한다.
- Verification level: 원격 서비스 `accepted: true`, 세 이미지의 PSNR·SSIM 검사 모두 통과. `ctfctl verify` V3.
- Technique tags: `cross-session data reuse`, `fingerprint SIFT matching`, `RANSAC affine registration`, `DIS optical flow`, `masked image fusion`.

Flag: `acdc2026{phase_fields_reconnect_ridges_without_touching_evidence}`

## Challenge contract

서버는 `/api/challenge`를 처음 호출한 브라우저 쿠키에 3개의 손상 지문과 마스크를 배정한다. 각 제출 파일은 275×400의 8-bit grayscale PNG여야 하며, 마스크 밖 픽셀은 손상본과 바이트 단위로 같아야 한다. 서버는 마스크의 연결 성분별 PSNR과 경계 주변 SSIM을 계산한 뒤 `0.65 × 최저 성분 + 0.35 × 성분 평균`으로 합산한다. 세 이미지가 각각 두 임계값을 모두 넘어야 flag가 반환된다. 실패 응답에는 개별 점수가 없다.

제공된 `README.txt`에 따르면 새 쿠키로 새 배정을 받는 데 팀 단위 제한이 없고, 배정은 사전 생성된 풀에서 이루어진다. 따라서 여러 세션의 입력을 합법적으로 관찰할 수 있다. 제출은 **현재 타깃 쿠키**로만 해야 한다.

## Triage and key observations

처음에는 제공된 RidgeNet 체크포인트와 PDE·융선 추적 기법을 현재 이미지에만 적용했다. 검증 이미지 일부는 개선됐지만 세 라이브 이미지가 동시에 통과하지 못했다. 원래 배정의 RidgeNet baseline은 임계값과 가까웠지만, 가장 불리한 성분을 강조하는 채점 때문에 작은 위상 오류도 치명적이었다.

방향을 바꿔 다른 세션의 지문을 SIFT로 비교하자, 서로 다른 세션 이미지 사이에서 100개가 넘는 RANSAC 정합점이 발견됐다. 단순 픽셀 비교는 크게 달랐지만 회전·크기 변화와 국소 변형을 보정하면 같은 융선 구조였다. 수집한 155개 세션에서 465개 이미지(정확히 같은 PNG를 제외하면 318개)를 검사한 결과, 원래 배정의 세 이미지에 각각 8개·5개·7개의 다른 관측본 매치를 찾았다. 매치 기록은 [pool_reuse_match_full.txt](.ctf/evidence/pool_reuse_match_full.txt)에 있다.

## Root cause or invariant

손상 마스크는 한 관측본에만 적용된다. 같은 identity의 다른 관측본에서는 그 영역의 융선이 보일 수 있다. 따라서 단일 이미지 복원보다 먼저 **다른 관측본의 관찰된 픽셀**을 정합해 가져오는 것이 유리하다. 다만 관측본은 단순한 동일 이미지가 아니므로 전역 affine 변환만으로는 부족하고, 비선형 광학 흐름과 밝기 보정이 필요했다.

RidgeNet 예측은 최종 답으로만 쓰지 않았다. 손상 영역을 가로지르는 광학 흐름의 가이드로 사용하고, 선택한 donor의 관찰 픽셀과 혼합했다. donor 마스크를 임시 inpainting한 것은 흐름 계산용일 뿐, 최종 픽셀 공급에는 donor의 비손상 영역만 사용했다.

## Solve chain

1. 새 쿠키들로 `/api/challenge`를 호출해 배정된 쿠키를 모으고 각 세션의 `damaged{1..3}.png`, `mask{1..3}.png`를 다운로드한다. 타깃의 쿠키는 별도로 유지한다.
2. SIFT descriptor에 0.72 ratio test를 적용하고 `estimateAffinePartial2D`의 RANSAC(2.5px)으로 같은 identity를 찾는다. 정확히 같은 PNG는 donor 후보에서 제외한다.
3. donor를 affine 정합한 뒤, RidgeNet 예측과 donor 가이드 영상 사이에 DIS optical flow를 계산한다. 타깃 마스크 내부의 흐름은 주변 흐름에서 보간한다. donor의 실제 비손상 픽셀을 이 흐름으로 warp한다.
4. 타깃의 이미 알려진 비손상 픽셀에서 국소 밝기 차이와 RMSE를 추정한다. 각 이미지마다 마스크 주변 RMSE가 가장 낮은 donor 하나를 고르고, donor 추정값을 RidgeNet baseline과 가중 혼합한다. donor가 없는 픽셀은 baseline으로 채우고, 타깃 마스크 밖은 원본 바이트로 되돌린다.
5. 세 파일을 원래 쿠키로 `/submit`에 보낸다. 성공한 설정은 `--flow-source baseline --photo --flow-mask-mode inpaint --max-near-rmse 30 --top-donors 1 --baseline-weight 10`이었다. 실제 시험에서 세 이미지 모두 이 설정을 택한 `(1, 1, 1)` 조합이 두 번째 질의에 합격했다.

합격한 타깃에서 선택된 donor는 `.ctf/solve/pool/sessions_batch2/` 아래의 `session58/damaged3.png`, `session26/damaged3.png`, `session34/damaged2.png`였고, 알려진 마스크 주변 픽셀의 RMSE는 13.796·20.111·20.553이었다. 이 숫자는 숨겨진 마스크 내부 점수가 아니라 donor 선택용 국소 지표다.

핵심 구현은 [pool_reuse.py](.ctf/solve/pool_reuse.py), [match_donors.py](.ctf/solve/match_donors.py), [multiview.py](.ctf/solve/multiview.py), [multiview_variants.py](.ctf/solve/multiview_variants.py)에 있다.

## Reproduction

아래는 제공된 챌린지 디렉터리에서 새로 시작하는 재현 절차다. 새 배정은 무작위이므로 donor가 부족하거나 임계값이 더 어려우면 샘플 수를 늘려야 한다. 실제 합격에 사용된 타깃은 보존된 쿠키의 instance `97faf8fc54e4`이다. `opencv-python-headless`는 제공된 `requirements.txt`에 없는 추가 의존성이다.

```bash
cd /mnt/c/CTF/ACDC/damage/.ctf/solve
BASE_URL=http://3.34.239.133:8000

# 타깃 배정과 RidgeNet baseline. 쿠키 파일은 이 디렉터리에 보존한다.
python3 ../../client.py fetch "$BASE_URL"
python3 cache_predictions.py

# 별도 세션을 모으되 타깃 쿠키는 덮어쓰지 않는다.
python3 sample_sessions.py "$BASE_URL" --count 155 --folder sessions
python3 pool_reuse.py --base-url "$BASE_URL" --workers 4
python3 match_donors.py --targets .

# 합격에 사용된 단일-donor 혼합 설정.
python3 multiview.py --flow-source baseline --photo \
  --flow-mask-mode inpaint --max-near-rmse 30 --top-donors 1 \
  --baseline-weight 10 --output-dir v1_best_blend
python3 ../../client.py submit "$BASE_URL" \
  v1_best_blend/restored1.png \
  v1_best_blend/restored2.png \
  v1_best_blend/restored3.png
```

`sample_sessions.py`가 만든 쿠키는 타깃과 분리된 `sessions/`에 저장된다. 실제 풀이에서는 이와 같은 방법으로 155개 세션을 모았고, [multiview_variants.py](.ctf/solve/multiview_variants.py)가 네 설정의 조합을 순서대로 시험하다가 합격 시 즉시 멈췄다. 타깃 또는 세션 쿠키를 바꾸면 기존 PNG를 섞어 제출할 수 없다.

## Verification

원격 응답은 `accepted: true`였고 여섯 검사가 모두 `true`였다. [accepted_response.json](.ctf/solve/accepted_response.json)에 응답 전문이 보존돼 있으며, [verification report](.ctf/evidence/verification-20261031T032524.842282Z-b1e3cd17a6b2.json)는 서비스 합격을 근거로 V3 `accepted`를 기록한다.

```bash
cd /mnt/c/CTF/ACDC/damage
/mnt/c/ctf/ctfctl verify 'acdc2026{phase_fields_reconnect_ridges_without_touching_evidence}' \
  --transcript .ctf/solve/accepted_response.json --require-accept --record .
```

| 이미지 | baseline PSNR / SSIM | 임계값 PSNR / SSIM | 합격 제출 PSNR / SSIM |
| --- | ---: | ---: | ---: |
| 1 | 21.745640 / 0.747845 | 21.967505 / 0.765317 | 24.065947 / 0.835575 |
| 2 | 19.936140 / 0.710460 | 20.398524 / 0.741891 | 21.204844 / 0.774470 |
| 3 | 18.615632 / 0.788869 | 19.250758 / 0.807965 | 19.277400 / 0.811072 |

## Useful failures

- 단일 이미지 RidgeNet 재적용, PDE, 곡선 융선 추적, Gabor/주파수 보정과 소규모 파인튜닝은 일부 검증 이미지에서만 개선됐고 세 라이브 이미지의 동시 합격으로 이어지지 않았다.
- 같은 identity를 찾더라도 전역 affine 정합만으로는 변형을 설명하지 못했다. 한 쌍의 마스크 주변 알려진 픽셀 RMSE가 약 37이었고, 광학 흐름 보정 후 약 17로 줄었다.
- 손상 영상을 그대로 광학 흐름에 넣으면 위상 추정이 어긋났다. 임시 가림 영역 교차검증에서 RidgeNet 예측을 가이드로 쓸 때 오차가 더 낮았다.
- 여러 donor를 무조건 섞은 첫 제출은 거절됐다. 비손상 영역에서 가장 잘 맞는 donor **하나**를 골라 baseline과 혼합한 결과가 통과했다.
- `/files/clean1.png`는 허용되지 않았고, 잘못된 PNG·비마스크 픽셀 오류를 섞어도 이미지별 숨겨진 점수는 새지 않았다. 파일 접근 우회나 오류 채널이 풀이 경로는 아니었다.

## Reusable lessons

- Detection signals: 별도 세션 이미지 간 SIFT/RANSAC 정합점이 비정상적으로 많으면 원본 identity 재사용을 의심할 수 있다.
- Environment pitfalls: 세션 쿠키와 여섯 입력 파일은 한 배정에 묶여 있다. `requirements.txt` 외에 OpenCV가 필요하다. 무작위 새 배정에서는 동일한 donor 수·합격을 보장하지 않는다.
