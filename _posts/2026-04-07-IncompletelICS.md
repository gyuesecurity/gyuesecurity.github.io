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

```solidity
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

### 1-2. IndustrialControlSystem.sol

```python
contract IndustrialControlSystem {
    enum Role { OPERATOR, ENGINEER, ADMINISTRATOR }

    struct SystemConfig {
        uint256 maxPressure;
        uint256 maxTemperature;
        uint256 emergencyThreshold;
        bool safetySystemEnabled;
    }

    address public configurationLibrary;
    address public diagnosticLibrary;
    address public administrator;
    mapping(address => Role) public userRoles;
    SystemConfig public config;
    uint256 public currentPressure;
    uint256 public currentTemperature;
    bool public systemOperational;
    bool public solved;

    bytes4 constant CONFIG_SIG = bytes4(keccak256("updateConfig(uint256)"));
    bytes4 constant DIAGNOSTIC_SIG = bytes4(keccak256("runDiagnostic(uint256)"));
```

### 생성자

```python
constructor(address _configLib, address _diagnosticLib) {
    administrator = msg.sender; // Setup 컨트랙트 주소
    userRoles[msg.sender] = Role.ADMINISTRATOR;
    configurationLibrary = _configLib;
    diagnosticLibrary = _diagnosticLib;

    config = SystemConfig({
        maxPressure: 1000,
        maxTemperature: 150,
        emergencyThreshold: 1200,
        safetySystemEnabled: true
    });

    systemOperational = true;
    solved = false;
}
```
- **administrator = Setup 주소**
- safetySystemEnabled = true 초기값.

### 권한 관련

```python
modifier onlyRole(Role requiredRole) {
    require(userRoles[msg.sender] >= requiredRole, "ICS: Insufficient privileges");
    _;
}

modifier systemSafety() {
    require(config.safetySystemEnabled, "ICS: Safety system disabled");
    _;
}
```

- userRoles의 default 값은 enum의 0번, 즉 Role.OPERATOR
- -> 아무 주소나 최소 OPERATOR 권한을 가진다고 볼 수 있는 구조 (치명적인 설계).

### config 업데이트 함수

```python
function updateSystemConfig(uint256 _value)
    public
    onlyRole(Role.OPERATOR)
    systemSafety
{
    emit AccessAttempt(msg.sender, "updateSystemConfig", true);

    (bool success,) = configurationLibrary.delegatecall(
        abi.encodePacked(CONFIG_SIG, _value)
    );
    require(success, "ICS: Configuration update failed");

    emit ConfigurationChanged("system_parameter", 0, _value);
}
```

- 누구든 userRoles[msg.sender] >= OPERATOR(0)면 통과 -> 사실상 모든 주소 접근 가능.
- delegatecall(configurationLibrary, updateConfig(uint256))가 핵심이다.  

### solved를 true로 만드는 함수

```python
function claimVictory() public {
    require(msg.sender == administrator, "ICS: Only administrator can claim victory");
    solved = true;
    emit SystemAlert("CHALLENGE_SOLVED", block.timestamp);
}
```

- solved를 true로 만드는 유일한 함수.
- 단, msg.sender == administrator 여야 한다.
- 현재 administrator는 Setup -> EOA로는 호출 불가.

---

### 1-3. ConfigurationLibrary / DiagnosticLibrary

```python
contract ConfigurationLibrary {
    uint256 public configValue;

    function updateConfig(uint256 _value) public {
        configValue = _value;
    }
}
```

- storage layout : slot 0에 configValue.

```python
contract DiagnosticLibrary {
    uint256 public diagnosticResult;

    function runDiagnostic(uint256 _code) public {
        diagnosticResult = _code;
    }
}
```

---

## 2. 취약점 분석
