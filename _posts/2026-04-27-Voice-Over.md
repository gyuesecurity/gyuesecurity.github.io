---
title: "[2026 Hacktheon Sejong] 𝗩𝗼𝗶𝗰𝗲-𝗢𝘃𝗲𝗿"
date: 2026-04-27 01:00:00 +0900
categories: [CTF/Wargame]
tags: [ctf, AI, Hacktheon]
---

# 2026 Hacktheon Sejong CTF 대회

## 0. 문제 개요

이번 문제는 Voice Over Challenge라는 이름의 음성 기반 CTF 문제였다.  

제공된 파일은 다음과 같았다.  

```python
sample_001.wav
sample_002.wav
sample_003.wav
sample_004.wav
sample_005.wav
```

소스코드는 제공되지 않았고, 문제 페이지 주소만 주어졌다.  

- http://3.37.31.209:8000  

처음에는 제공된 WAV 파일 중 하나가 정답 음성일 것이라고 생각했지만, 실제 서버에 제출해 보니 그렇지 않았다.  

---

## 1. 제공 파일 분석

압축을 해제한 뒤 WAV 파일들을 확인해 보니 모두 같은 형식이었다.  

```python
mono
16kHz
16-bit PCM
```

각 음성 파일을 서버에 제출해 본 결과, 공통적으로 speaker_similarity는 높게 나왔지만 text_similarity는 낮게 나왔다.  
예를 들어 sample_001.wav를 제출했을 때 서버는 화자 유사도를 약 0.957 정도로 판단했다.  
하지만 transcript는 target sentence와 다른 문장으로 인식되었고, 결국 텍스트 유사도 조건을 만족하지 못해 실패했다.  
이를 통해 제공된 음성 파일은 정답 음성이 아니라, 목표 화자의 목소리를 담은 레퍼런스 샘플이라는 것을 알 수 있었다.  
  
즉 문제의 목표는 다음과 같았다.  
- 제공된 샘플 음성을 이용해 target sentence를 같은 화자의 목소리로 읽게 만든 뒤 제출하기  

---

## 2. 서버 API 확인  

웹 페이지와 API를 확인해 보니 주요 엔드포인트는 두 개였다.  

```python
GET  /api/challenge
POST /api/verify
```

- /api/challenge는 매번 새로운 값을 반환했다.  

```pythonn
{
  "token": "...",
  "target_sentence": "..."
}
```

- /api/verify는 업로드한 WAV 파일을 검사해 다음 값을 반환했다.  

```python
speaker_similarity
text_similarity
transcript
success
flag
```

즉 서버는 단순히 음성 파일 하나만 보는 것이 아니라,  

1. 목소리가 목표 화자와 비슷한가?  
2. 말한 문장이 target_sentence와 일치하는가?  
  
두 조건을 동시에 검사하고 있었다.  

---

## 3. 단순 TTS 시도  

처음에는 Windows TTS로 target sentence를 읽게 만든 뒤 제출해 보았다.  
이 경우 text_similarity는 어느 정도 올라갔지만, speaker_similarity가 약 0.53 수준으로 낮게 나와 실패했다.  
  
즉 단순 TTS로는 문제를 풀 수 없었다.  
  
- text_similarity 조건은 만족 가능  
- speaker_similarity 조건은 만족 불가  
  
따라서 필요한 것은 단순 음성 합성이 아니라, 제공된 샘플 음성의 화색을 복제하는 zero-shot voice cloning 이었다.  

---

## 4. Voice Cloning 접근  

공개된 Hugging Face voice cloning 데모를 찾아본 결과, 다음 Space를 사용할 수 있었다.  

- Kikirilkov/Voice_Cloning  
  
이 Space는 다음과 같은 형태로 동작했다.  

```python
predict(text, audio, language)
```

즉,  

```python
text      → 서버가 요구한 target_sentence
audio     → 제공된 sample WAV
language  → en
```

를 입력하면, 레퍼런스 음성과 비슷한 목소리로 target sentence를 읽은 WAV 파일을 생성할 수 있었다.  
레퍼런스로는 가장 길고 안정적인 샘플인 sample_005.wav를 사용했다.  

---

## 5. Solver 코드  

```python
import argparse
from pathlib import Path

import requests

try:
    from gradio_client import Client, handle_file
except ImportError as exc:
    raise SystemExit(
        "Missing dependency: gradio_client\n"
        "Install it with: python -m pip install gradio_client"
    ) from exc


CHALLENGE_URL = "http://3.37.31.209:8000"
DEFAULT_SPACE = "Kikirilkov/Voice_Cloning"


def get_challenge(base_url: str) -> dict:
    response = requests.get(f"{base_url}/api/challenge", timeout=30)
    response.raise_for_status()
    return response.json()


def clone_voice(space_name: str, sample_path: Path, text: str, language: str) -> Path:
    client = Client(space_name)
    output_path = client.predict(
        text,
        handle_file(str(sample_path)),
        language,
        api_name="/predict",
    )
    return Path(output_path)


def submit_audio(base_url: str, token: str, audio_path: Path) -> dict:
    with audio_path.open("rb") as audio_file:
        response = requests.post(
            f"{base_url}/api/verify",
            files={"audio": (audio_path.name, audio_file, "audio/wav")},
            data={"token": token},
            timeout=180,
        )
    response.raise_for_status()
    return response.json()


def main() -> None:
    parser = argparse.ArgumentParser(description="Solve the Voice Over Challenge")
    parser.add_argument(
        "--sample",
        default=str(Path(__file__).with_name("sample_005.wav")),
        help="Reference WAV file for the target speaker",
    )
    parser.add_argument(
        "--space",
        default=DEFAULT_SPACE,
        help="Public Hugging Face Space used for voice cloning",
    )
    parser.add_argument(
        "--language",
        default="en",
        help="Language parameter for the voice cloning API",
    )
    parser.add_argument(
        "--base-url",
        default=CHALLENGE_URL,
        help="Challenge base URL",
    )
    args = parser.parse_args()

    sample_path = Path(args.sample).resolve()
    if not sample_path.exists():
        raise SystemExit(f"Sample file not found: {sample_path}")

    print(f"[+] Reference sample : {sample_path}")
    print(f"[+] Voice clone space: {args.space}")

    challenge = get_challenge(args.base_url)
    print(f"[+] Token           : {challenge['token']}")
    print(f"[+] Target sentence : {challenge['target_sentence']}")

    cloned_audio = clone_voice(
        args.space,
        sample_path,
        challenge["target_sentence"],
        args.language,
    )
    print(f"[+] Cloned audio    : {cloned_audio}")

    result = submit_audio(args.base_url, challenge["token"], cloned_audio)
    print(f"[+] Speaker score   : {result['speaker_similarity']}")
    print(f"[+] Text score      : {result['text_similarity']}")
    print(f"[+] Transcript      : {result['transcript']}")

    if result.get("success") and result.get("flag"):
        print(f"[+] FLAG            : {result['flag']}")
    else:
        print("[-] Solve failed")
        print(result)


if __name__ == "__main__":
    main()
```

---

## 6. 실행 결과  

생성된 음성을 /api/verify에 제출하자 서버가 target sentence를 정확히 인식했다.  
  
성공 응답은 다음과 같았다.  

```python
{
  "text_similarity": 1.0,
  "text_threshold": 0.8,
  "speaker_similarity": 0.8727,
  "success": true,
  "flag": "hacktheon2026{b7d30e21e4106a6ca4d451a218f15a97}"
}
```
  
text_similarity는 1.0으로 완전히 일치했고, speaker_similarity도 임계값인 0.8을 넘어 성공했다.  

---

## 7. 최종 플래그  

```python
hacktheon2026{b7d30e21e4106a6ca4d451a218f15a97}
```

---

## 8. 느낀 점  

이 문제는 일반적인 웹 취약점이나 API 우회 문제가 아니라, 서버가 요구하는 검증 조건을 정확히 이해하는 것이 핵심이었다.  
처음에는 제공된 WAV 파일을 그대로 제출하거나 단순 TTS를 사용하는 방향으로 접근할 수 있지만, 실제로는 두 조건을 동시에 만족해야 했다.  

- 목소리 유사도  
- 문장 일치도  

결국 제공된 샘플은 정답이 아니라 목표 화자의 레퍼런스였고, 문제의 의도는 이를 이용해 target sentence를 같은 목소리로 합성하는 것이었다.  
Voice cloning을 활용해 두 조건을 모두 만족시키면서 문제를 해결할 수 있었다.  

---
