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

- 'content': f'... <!-- FLAG: {FLAG} --> ...'
  
즉, 플래그는 HTML 주석 형태로 문서 내부에 포함되어 있다.  

---


