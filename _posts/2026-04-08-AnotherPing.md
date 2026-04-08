---
title: "[DreamHack] Another Ping"
date: 2026-04-08 00:40:00 +0900
categories: [CTF/Wargame]
tags: [ctf, web, DreamHack]
---

# 드림핵 CTF 문제 풀이

## 0. 개요

- **문제 이름** : Another Ping
- **문제 유형** : Command Injection
- **환경** : 
  - 사용자 입력을 받아 ping 명령을 수행하는 서비스   
- **목표** :
  - 필터링을 우회하여 flag.txt 내용을 출력한다.
 
  핵심은 제한된 문자 환경에서 **command substitution을 이용해 플래그를 노출시키는 것**이다.   

---

## 1. 전체 구조 분석

### 1-1. 서비스 구조 

서비스는 사용자가 입력한 값을 기반으로 ping 명령을 실행한다.  
즉, 내부적으로 다음과 같은 형태로 동작한다.  

```python
ping -c 4 [user_input]
```

사용자가 입력한 값이 그대로 shell 명령에 포함된다.  

---

### 1-2. 실행 결과 확인

다음과 같은 입력을 넣었을 때의 결과를 보면 구조가 명확해진다.  

```python
8.8.8.8`cat$IFS''flag.txt`
```

실행 결과:
```python
{
"command": "ping -c 4 8.8.8.8`cat$IFS''flag.txt`",
"returncode": 2,
"stderr": "ping: 8.8.8.8DH{...}: Name or service not known\n",
"stdout": ""
}
```

이 결과에서 중요한 점은 **ping의 인자에 flag 값이 포함되어 있다.**

---

## 2. 취약점 분석

### 2-1. command injection 가능 구조

입력이 그대로 명령어에 들어가기 때문에 기본적으로 command injection 이 가능하다.  

```python
ping -c [input]
```

일반적으로는 다음과 같은 방식이 가능하다.  

```python
; command
| command
&& command
```

---

### 2-2. 필터링 존재

하지만 문제에서는 다음 문자들이 필터링되어 있다.  
- 공백  
- ;  
- |  
- (  
- )  
  
즉, 일반적인 command injection 방식은 사용할 수 없다.   

---

### 2-3. 우회 방향

이 상황에서 필요한 조건은 다음과 같다.  
- 공백 없이 명령 실행
- 필터링 문자 없이 command injection
- 결과를 출력 가능한 형태로 전달  

---

## 3. 공격 시나리오

### 3-1. 아이디어 

이 문제는 command chaining이 아니라 **command substitution**을 이용한다.

사용된 문법으로는 command  
-> 이 문법은 내부 명령을 실행하고 그 결과를 문자열로 치환한다.  

---

### 3-2. 공백 우회 

문제는 공백이 필터링 된다는 점이다.  
이를 해결하기 위해 사용한 것이 &IFS 이다.  

```python
cat$IFSflag.txt
```

여기서 &IFS는 shell의 내부 구분자로 실행 시점에 공백으로 변환된다.  
따라서 실제 실행은 다음과 같다.  

```python
cat flag.txt
```

---

### 3-3. 최종 Payload

최종적으로 사용한 입력:

```python
8.8.8.8`cat$IFS''flag.txt`
```


구성 요소:
- 8.8.8.8 → 정상 ping 대상  
- `...` → command substitution  
- $IFS → 공백 우회  
- '' → 문자열 분리 유지

---

### 3-4. 실행 흐름

실제 shell에서의 처리 순서는 다음과 같다.  
1. 벡틱 내부 실행
2. cat flag.txt
3. 출력 결과를 문자열로 치환
4. ping -c 4 8.8.8.8[FLAG]
5. ping 실행

--- 

### 3-5. 플래그 노출

ping은 존재하지 않은 호스트를 처리할때 다음과 같은 에러를 출력한다.  

ping: [hostname]: Name or service not known  

이때 hostname에 플래그가 포함되어 있기 때문에 **stderr에 플래그가 그대로 출력된다.**  

---

## 4. 결과 

최종적으로 stderr에서 플래그를 획득할 수 있다.  

- DH{ c64c86a3e2121098:r8X0WxwcwA2FsWtRgoA+7g== }  

---

## 5. 전체 공격 흐름 정리

전체 익스플로잇은 다음과 같이 정리된다.  
1. 입력값이 ping 명령에 그대로 들어가는 구조 확인
2. 일반 command injection 이 필터로 인해 불가능
3. command substitution(` ) 사용 가능 확인
4. &IFS를 이용한 공백 우회
5. cat flag.txt 실행 결과를 ping 인자로 삽입
6. ping 에러 메시지를 통해 stderr로 플래그 출력

--- 

## 6. 포인트 

이 문제의 핵심은 다음 세 가지다.  
- command substitution을 이용한 우회
- &IFS를 이용한 공백 필터 우회
- 에러 메시지를 이용한 데이터 exfiltration

---

## 7. 정리 

**필터링된 환경에서 &IFS와 벡틱을 이용해 command substitution 을 수행하고,  
ping 에러 메시지를 통해 플래그를 유출하는 문제이다.**  

---
