# Claude Desktop에서 FormatForge MCP 서버 사용하기

## 🚀 설정 가이드

FormatForge MCP 서버를 Claude Desktop에 등록하는 방법을 안내합니다.

### 📁 설정 파일 위치
```
~/.config/claude/desktop-config.json
```

### 🔧 설정 방법
1. **샘플 파일 복사**:
   ```bash
   cp claude-desktop-config.sample.json ~/.config/claude/desktop-config.json
   ```

2. **경로 수정**:
   ```bash
   nano ~/.config/claude/desktop-config.json
   ```
   `/path/to/your/FormatForge/dist/index.js`를 실제 경로로 변경하세요.

3. **Claude Desktop 재시작**

### ⚙️ 샘플 설정
```json
{
  "_comment": "Claude Desktop MCP Server Configuration for FormatForge",
  "_instructions": [
    "1. Copy this file to ~/.config/claude/desktop-config.json",
    "2. Replace '/path/to/your/FormatForge/dist/index.js' with your actual path",
    "3. Restart Claude Desktop to load the MCP server"
  ],
  "mcpServers": {
    "format-forge": {
      "command": {
        "name": "node",
        "args": ["/path/to/your/FormatForge/dist/index.js"]
      },
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

## 🔄 사용 방법

### 1. **Claude Desktop 재시작**
- Claude Desktop을 완전히 종료하고 다시 시작하세요
- MCP 서버가 자동으로 로드됩니다

### 2. **사용 가능한 명령어**

#### 📊 서버 상태 확인
```
"Show me the FormatForge server status"
"Check what formats are supported"
```

#### 🔄 파일 변환
```
"Convert this JSON file to XML format"
"Transform the CSV data to JSON with camelCase keys"
"Convert the Excel file to CSV format"
"Change this XML file to JSON format"
```

#### 🎨 데이터 변환
```
"Convert the keys to snake_case"
"Transform the data to use camelCase keys"
"Make all keys lowercase"
"Convert keys to uppercase"
```

### 3. **실제 사용 예제**

#### JSON to XML 변환
```
"Convert this JSON data to XML format:
[
  {
    "name": "John Doe",
    "age": 30,
    "email": "john@example.com"
  }
]"
```

#### 키 스타일 변환
```
"Convert this data to use camelCase keys:
{
  "user_name": "John",
  "email_address": "john@example.com",
  "created_at": "2023-01-01"
}"
```

## 🎯 지원하는 기능

### ✅ **완전 지원**
- **JSON ↔ XML 변환**
- **키 스타일 변환** (camelCase, snake_case, lowercase, uppercase)
- **서버 상태 확인**
- **도움말 및 명령어 목록**

### ⚠️ **개발 중**
- CSV 파일 처리 (Papa.parse 라이브러리 문제 해결 필요)
- Excel 파일 처리
- Markdown 테이블 처리

## 🔧 문제 해결

### 서버가 응답하지 않는 경우
1. Claude Desktop을 재시작하세요
2. 터미널에서 서버 상태를 확인하세요:
   ```bash
   cd /Users/st/workspace_ai/FormatForge
   node dist/index.js
   ```

### 설정 파일 수정이 필요한 경우
1. 설정 파일을 편집하세요:
   ```bash
   nano ~/.config/claude/desktop-config.json
   ```
2. Claude Desktop을 재시작하세요

## 📝 로그 확인

서버 로그는 다음 위치에서 확인할 수 있습니다:
- 터미널 출력 (개발 모드)
- 시스템 로그 (프로덕션 모드)

## 🎉 사용 준비 완료!

이제 Claude Desktop에서 FormatForge MCP 서버를 사용할 수 있습니다. 
자연어로 파일 변환 요청을 해보세요!
