#!/usr/bin/env node

import { FormatForgeMCPServer } from './dist/core/FormatForgeMCPServer.js';
import { Logger } from './dist/core/Logger.js';
import { LogLevel } from './dist/core/Logger.js';
import * as path from 'path';
import * as fs from 'fs';

// 테스트 데이터 디렉토리
const testDataDir = path.join(process.cwd(), 'test-data');

async function testServer() {
  console.log('🚀 FormatForge MCP Server 테스트 시작\n');
  
  // 서버 인스턴스 생성
  const server = new FormatForgeMCPServer();
  const logger = Logger.getInstance();
  logger.setLevel(LogLevel.INFO);
  
  try {
    // 1. 서버 상태 확인
    console.log('📊 1. 서버 상태 확인');
    const status = await server.executeCommand('status', {});
    console.log('서버 정보:', JSON.stringify(status, null, 2));
    console.log('');
    
    // 2. 도움말 확인
    console.log('❓ 2. 도움말 확인');
    const help = await server.executeCommand('help', {});
    console.log('사용 가능한 명령어:', help.commands.map(cmd => cmd.name).join(', '));
    console.log('');
    
    // 3. CSV to JSON 변환 테스트
    console.log('🔄 3. CSV to JSON 변환 테스트');
    const csvToJsonResult = await server.executeCommand('convert_format', {
      source_path: path.join(testDataDir, 'sample.csv'),
      target_format: 'json',
      output_path: path.join(testDataDir, 'output-from-csv.json'),
      transformations: {
        keyStyle: 'camelCase'
      }
    });
    console.log('CSV to JSON 결과:', csvToJsonResult.success ? '✅ 성공' : '❌ 실패');
    if (csvToJsonResult.success) {
      console.log('출력 파일:', csvToJsonResult.outputPath);
    }
    console.log('');
    
    // 4. JSON to XML 변환 테스트
    console.log('🔄 4. JSON to XML 변환 테스트');
    const jsonToXmlResult = await server.executeCommand('convert_format', {
      source_path: path.join(testDataDir, 'sample.json'),
      target_format: 'xml',
      output_path: path.join(testDataDir, 'output-from-json.xml'),
      transformations: {
        keyStyle: 'lowercase'
      }
    });
    console.log('JSON to XML 결과:', jsonToXmlResult.success ? '✅ 성공' : '❌ 실패');
    if (jsonToXmlResult.success) {
      console.log('출력 파일:', jsonToXmlResult.outputPath);
    }
    console.log('');
    
    // 5. XML to CSV 변환 테스트
    console.log('🔄 5. XML to CSV 변환 테스트');
    const xmlToCsvResult = await server.executeCommand('convert_format', {
      source_path: path.join(testDataDir, 'sample.xml'),
      target_format: 'csv',
      output_path: path.join(testDataDir, 'output-from-xml.csv'),
      options: {
        encoding: 'utf-8',
        includeHeaders: true
      }
    });
    console.log('XML to CSV 결과:', xmlToCsvResult.success ? '✅ 성공' : '❌ 실패');
    if (xmlToCsvResult.success) {
      console.log('출력 파일:', xmlToCsvResult.outputPath);
    }
    console.log('');
    
    // 6. Markdown to JSON 변환 테스트
    console.log('🔄 6. Markdown to JSON 변환 테스트');
    const mdToJsonResult = await server.executeCommand('convert_format', {
      source_path: path.join(testDataDir, 'sample.md'),
      target_format: 'json',
      output_path: path.join(testDataDir, 'output-from-md.json'),
      transformations: {
        keyStyle: 'snake_case'
      }
    });
    console.log('Markdown to JSON 결과:', mdToJsonResult.success ? '✅ 성공' : '❌ 실패');
    if (mdToJsonResult.success) {
      console.log('출력 파일:', mdToJsonResult.outputPath);
    }
    console.log('');
    
    // 7. 에러 처리 테스트
    console.log('⚠️ 7. 에러 처리 테스트');
    const errorResult = await server.executeCommand('convert_format', {
      source_path: '/non/existent/file.csv',
      target_format: 'json'
    });
    console.log('존재하지 않는 파일 처리:', errorResult.success ? '❌ 예상과 다름' : '✅ 올바른 에러 처리');
    console.log('');
    
    // 8. 생성된 파일들 확인
    console.log('📁 8. 생성된 파일들 확인');
    const outputFiles = [
      'output-from-csv.json',
      'output-from-json.xml',
      'output-from-xml.csv',
      'output-from-md.json'
    ];
    
    for (const file of outputFiles) {
      const filePath = path.join(testDataDir, file);
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        console.log(`✅ ${file} (${stats.size} bytes)`);
      } else {
        console.log(`❌ ${file} (파일 없음)`);
      }
    }
    
    console.log('\n🎉 테스트 완료!');
    
  } catch (error) {
    console.error('❌ 테스트 중 오류 발생:', error.message);
  }
}

// 테스트 실행
testServer();
