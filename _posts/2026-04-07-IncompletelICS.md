---
title: "[2025 ACS] Incomplete-ICS"
date: 2026-04-07 01:00:00 +0900
categories: [CTF/Wargame]
tags: [ctf, blockchain, delegatecall, exploit]
---

## 0. 개요

- **문제 이름** : Incomplete-ICS
- **환경** : 
  - nc 10.100.0.11 30000 - 인스턴스 생성 / 종료 / 플래그 조회 메뉴
  - rpc 10.100.0.11 30001 - 개인 블록체인 인스턴스 JSON-RPC
  - 각인스턴스는 **UUID**로 구분 되고, **10분 후 자동 종료**
- **목표** : `Setup.isSolved() == true` 상태를 만들어 플래그 획득  

---

## 1. 온체인 구조 분석

### 1-1. Setup.sol

- ICS, ConfigurationLibrary, DiagnosticLibrary 배포
- player = tx.origin → 우리가 OPERATOR 권한 보유
- 목표:
```solidity
return icsContract.solved() == true;
