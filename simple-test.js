#!/usr/bin/env node

import { FormatForgeMCPServer } from './dist/core/FormatForgeMCPServer.js';
import { FormatHandlerRegistry } from './dist/handlers/FormatHandlerRegistry.js';
import * as path from 'path';

async function simpleTest() {
  console.log('🧪 간단한 FormatForge 테스트\n');
  
  try {
    // 1. 핸들러 레지스트리 초기화
    console.log('1️⃣ 핸들러 레지스트리 초기화...');
    const registry = FormatHandlerRegistry.getInstance();
    await registry.initializeDefaultHandlers();
    
    const stats = registry.getStatistics();
    console.log(`✅ 등록된 핸들러: ${stats.totalHandlers}개`);
    console.log(`✅ 지원 포맷: ${stats.supportedFormats.join(', ')}`);
    console.log('');
    
    // 2. 서버 생성 및 상태 확인
    console.log('2️⃣ 서버 상태 확인...');
    const server = new FormatForgeMCPServer();
    const status = await server.executeCommand('status', {});
    console.log(`✅ 서버 이름: ${status.server.name}`);
    console.log(`✅ 서버 버전: ${status.server.version}`);
    console.log(`✅ 지원 입력 포맷: ${status.supported_formats.input.join(', ')}`);
    console.log(`✅ 지원 출력 포맷: ${status.supported_formats.output.join(', ')}`);
    console.log('');
    
    // 3. 도움말 확인
    console.log('3️⃣ 도움말 확인...');
    const help = await server.executeCommand('help', {});
    console.log(`✅ 사용 가능한 명령어: ${help.commands.map(cmd => cmd.name).join(', ')}`);
    console.log('');
    
    console.log('🎉 기본 테스트 완료!');
    
  } catch (error) {
    console.error('❌ 테스트 실패:', error.message);
  }
}

simpleTest();
