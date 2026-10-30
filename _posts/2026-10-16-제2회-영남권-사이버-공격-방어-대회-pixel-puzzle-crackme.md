---
title: "[제2회 영남권 사이버 공격 방어 대회] Pixel Puzzle Crackme"
date: 2026-10-16 16:30:20 +0900
categories: [CTF/Wargame]
tags: [ctf, reversing, crackme, cryptography]
---


## 문제 개요

- 분야: Reverse Engineering / Crackme
- 제공 파일: `crackme`, `puzzle.enc`
- 목표:
  1. ELF 바이너리의 시리얼 검증 로직을 분석한다.
  2. 올바른 시리얼로 `puzzle.enc`를 복호화한다.
  3. 생성된 6×6 직소 퍼즐을 맞춘다.
  4. 완성된 그림에서 `FLAG{...}` 형식의 플래그를 찾는다.

## 1. 파일 확인

압축을 해제한 뒤 파일 형식을 확인했다.

```bash
$ file crackme puzzle.enc
crackme:    ELF 64-bit LSB pie executable, x86-64, dynamically linked, not stripped
puzzle.enc: data
```

`crackme`는 심볼이 제거되지 않은 64비트 ELF이며, 문자열과 심볼을 확인하면 다음 요소들이 보인다.

```bash
strings -a crackme
nm -C crackme
```

주요 문자열과 심볼은 다음과 같다.

```text
Enter serial:
Access denied.
Access granted! Serial accepted.
puzzle.enc
pieces/piece_%d_%d.bmp
puzzle.html
sha256_transform
aes_sbox
aes_invsbox
aes_rcon
```

즉, 프로그램은 시리얼을 검증한 뒤 SHA-256과 AES를 사용해 `puzzle.enc`를 복호화하고, 결과 이미지를 퍼즐 조각으로 나누는 구조임을 알 수 있다.

## 2. 시리얼 검증 로직 분석

`main`을 디스어셈블하면 입력값에 대해 다음 검사가 수행된다.

```bash
objdump -d -M intel --disassemble=main crackme
```

핵심 검증 로직을 의사 코드로 옮기면 다음과 같다.

```c
if (*(uint32_t *)serial != 0x7b59454b)  // little endian: "KEY{"
    fail();

inner = serial + 4;

if (strlen(inner) <= 15)
    fail();

if (inner[15] != '}')
    fail();

for (int i = 0; i < 15; i++) {
    if ((inner[i] ^ key[i]) != target[i])
        fail();
}
```

따라서 시리얼 형식은 아래와 같다.

```text
KEY{???????????????}
    └── 15 bytes ──┘
```

`.rodata`의 `target`과 `key` 배열은 다음과 같다.

```text
target = 9c ee 42 72 4c 81 ce 76 d4 a2 4e 76 9a 0f 23
key    = d7 80 2d 11 27 de a5 18 bb c1 25 29 d4 6a 4c
```

검사식이 `inner[i] ^ key[i] == target[i]`이므로, 각 내부 문자는 다음 식으로 복구할 수 있다.

```text
inner[i] = target[i] ^ key[i]
```

간단한 Python 코드로 계산했다.

```python
{% raw %}
target = bytes.fromhex(
    "9cee42724c81ce76d4a24e769a0f23"
)
key = bytes.fromhex(
    "d7802d1127dea518bbc12529d46a4c"
)

inner = bytes(a ^ b for a, b in zip(target, key))
print(inner.decode())
print(f"KEY{{{inner.decode()}}}")
{% endraw %}
```

실행 결과는 다음과 같다.

```text
Knock_knock_Neo
KEY{Knock_knock_Neo}
```

따라서 정답 시리얼은 다음과 같다.

```text
KEY{Knock_knock_Neo}
```

## 3. `puzzle.enc` 복호화

시리얼을 프로그램에 전달하면 검증을 통과한다.

```bash
printf 'KEY{Knock_knock_Neo}\n' | ./crackme
```

출력:

```text
=== The Matrix Access Terminal ===
Enter serial: Access granted! Serial accepted.
[ok] 시리얼 확인! 이미지가 복호화되었습니다 (720x720).
[ok] 6x6 = 36개 조각을 pieces/ 폴더에 저장했습니다.
[ok] puzzle.html 생성 완료 - 더블클릭해서 브라우저로 여세요.
```

복호화 흐름은 다음과 같다.

1. 입력 시리얼을 `KEY{&#37;.15s}` 형태로 정규화한다.
2. 정규화된 시리얼의 SHA-256 해시를 계산한다.
3. 해시의 앞 16바이트를 AES-128 키로 사용한다.
4. `puzzle.enc`의 첫 16바이트를 IV로 사용한다.
5. 나머지 데이터를 AES-CBC로 복호화하고 PKCS#7 패딩을 제거한다.
6. 복호화된 720×720 BMP 이미지를 120×120 크기의 조각 36개로 분할한다.

`puzzle.enc`의 크기도 이 구조와 일치한다.

```text
16 bytes                    : IV
1,555,264 bytes             : AES-CBC ciphertext
1,555,254 bytes after unpad : 54-byte BMP header + 720×720×3 pixels
```

## 4. 퍼즐 자동 재조립

프로그램은 아래 이름으로 조각을 저장한다.

```text
pieces/piece_0_0.bmp
pieces/piece_0_1.bmp
...
pieces/piece_5_5.bmp
```

웹 페이지에서는 조각이 무작위 순서로 나타나지만, 파일명 자체에 원래의 행과 열 좌표가 들어 있다. 따라서 직접 드래그하지 않고 파일명의 `(row, col)` 순서대로 배치하면 된다.

Pillow를 이용한 재조립 예시는 다음과 같다.

```python
from PIL import Image

GRID = 6
PW = PH = 120
result = Image.new("RGB", (GRID * PW, GRID * PH))

for row in range(GRID):
    for col in range(GRID):
        piece = Image.open(f"pieces/piece_{row}_{col}.bmp")
        result.paste(piece, (col * PW, row * PH))

result.save("completed.png")
```

이 과정을 거치면 원래의 720×720 이미지가 완성된다.

## 5. 플래그 판독

완성 이미지 중앙에는 회색 글자로 플래그가 적혀 있다. 배경과 글자의 대비가 낮아 알파벳 `o`, `l`처럼 보일 수 있지만, 확대하고 대비를 높여 확인하면 실제 문자는 숫자 `0`, `1`이다.

```text
Welcome  (X)
Welc0me  (O)

World    (X)
Wor1d    (O)
```

따라서 최종 플래그는 다음과 같다.

```text
FLAG{Welc0me_to_the_Real_Wor1d}
```

## 최종 정답

```text
Serial: KEY{Knock_knock_Neo}
Flag:   FLAG{Welc0me_to_the_Real_Wor1d}
```

