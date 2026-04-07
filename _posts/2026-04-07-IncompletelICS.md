---
title: "[2025 ACS] Incomplete-ICS"
date: 2026-04-07 01:00:00 +0900
categories: [CTF/Wargame]
tags: [ctf, misc, 2025 ACS]
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

```python
contract Setup {
    IndustrialControlSystem public icsContract;
    ConfigurationLibrary public configLib;
    DiagnosticLibrary public diagnosticLib;
    address public player;

    constructor() {
        configLib = new ConfigurationLibrary();
        diagnosticLib = new DiagnosticLibrary();

        icsContract = new IndustrialControlSystem(
            address(configLib),
            address(diagnosticLib)
        );

        player = tx.origin;
        icsContract.grantRole(player, IndustrialControlSystem.Role.OPERATOR);
    }

    function isSolved() public view returns (bool) {
        return icsContract.solved() == true;
    }

    function getChallengeInfo() public view returns (
        address icsAddress,
        address configLibAddress,
        address diagnosticLibAddress,
        address playerAddress,
        IndustrialControlSystem.Role playerRole
    ) {
        return (
            address(icsContract),
            address(configLib),
            address(diagnosticLib),
            player,
            icsContract.userRoles(player)
        );
    }
}
```
- 배포시 ConfigurationLibrary, DiagnosticLibrary, IndustrialControlSystem 순으로 생성.
- player = tx.origin → CTF 참가자의 EOA 주소가 player.  
- icsContract.grantRole(player, Role.OPERATOR);  
  - OPERATOR 권한을 가진 상태로 시작.  
- 플래그 체크: isSolved() == icsContract.solved().  

→ 결론: ICS 컨트랙트의 solved를 true로 만드는 게 목표.  

---



