#!/bin/bash

# FormatForge MCP Server Claude Desktop Setup Script
echo "🚀 FormatForge MCP Server Claude Desktop 설정 스크립트"
echo "=================================================="

# Get current directory
CURRENT_DIR=$(pwd)
DIST_PATH="$CURRENT_DIR/dist/index.js"

# Check if dist/index.js exists
if [ ! -f "$DIST_PATH" ]; then
    echo "❌ Error: dist/index.js 파일을 찾을 수 없습니다."
    echo "   먼저 'npm run build'를 실행하여 프로젝트를 빌드하세요."
    exit 1
fi

# Create Claude Desktop config directory
CLAUDE_CONFIG_DIR="$HOME/.config/claude"
echo "📁 Claude Desktop 설정 디렉토리 생성: $CLAUDE_CONFIG_DIR"
mkdir -p "$CLAUDE_CONFIG_DIR"

# Create the configuration file
CONFIG_FILE="$CLAUDE_CONFIG_DIR/desktop-config.json"
echo "⚙️  설정 파일 생성: $CONFIG_FILE"

cat > "$CONFIG_FILE" << EOF
{
  "mcpServers": {
    "format-forge": {
      "command": {
        "name": "node",
        "args": ["$DIST_PATH"]
      },
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
EOF

echo "✅ 설정 완료!"
echo ""
echo "📋 설정된 내용:"
echo "   - 서버 경로: $DIST_PATH"
echo "   - 설정 파일: $CONFIG_FILE"
echo ""
echo "🔄 다음 단계:"
echo "   1. Claude Desktop을 완전히 종료하세요"
echo "   2. Claude Desktop을 다시 시작하세요"
echo "   3. 자연어로 파일 변환을 요청해보세요:"
echo "      'Convert this JSON to XML format'"
echo ""
echo "🔧 설정을 수정하려면:"
echo "   nano $CONFIG_FILE"
