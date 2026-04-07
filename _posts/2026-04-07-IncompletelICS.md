---
title: "[2025 ACS] Incomplete-ICS"
date: 2026-04-07 01:00:00 +0900
categories: [CTF/Wargame]
tags: [ctf, blockchain, delegatecall, exploit]
---

## 0. 개요

- **문제 이름**: Incomplete-ICS  
- **목표**: `Setup.isSolved() == true` 상태를 만들어 플래그 획득  
- **핵심 목표**: `ICS.solved = true` 만들기  

---

## 1. 온체인 구조 분석

### 1-1. Setup.sol

- ICS, ConfigurationLibrary, DiagnosticLibrary 배포
- player = tx.origin → 우리가 OPERATOR 권한 보유
- 목표:
```solidity
return icsContract.solved() == true;
