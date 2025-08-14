#!/usr/bin/env node

import { FormatForgeMCPServer } from './dist/core/FormatForgeMCPServer.js';
import { FormatHandlerRegistry } from './dist/handlers/FormatHandlerRegistry.js';
import * as path from 'path';
import * as fs from 'fs';

async function conversionTest() {
  console.log('🔄 FormatForge 변환 테스트\n');
  
  const testDataDir = path.join(process.cwd(), 'test-data');
  
  try {
    // 1. 핸들러 초기화
    console.log('1️⃣ 핸들러 초기화...');
    const registry = FormatHandlerRegistry.getInstance();
    await registry.initializeDefaultHandlers();
    console.log('✅ 핸들러 초기화 완료\n');
    
    // 2. 서버 생성
    console.log('2️⃣ 서버 생성...');
    const server = new FormatForgeMCPServer();
    console.log('✅ 서버 생성 완료\n');
    
    // 3. CSV to JSON 변환 테스트
    console.log('3️⃣ CSV to JSON 변환 테스트...');
    const csvToJsonResult = await server.executeCommand('convert_format', {
      source_path: path.join(testDataDir, 'sample.csv'),
      target_format: 'json',
      output_path: path.join(testDataDir, 'output-csv-to-json.json'),
      transformations: {
        keyStyle: 'camelCase'
      }
    });
    
    if (csvToJsonResult.success) {
      console.log('✅ CSV to JSON 변환 성공');
      console.log(`📁 출력 파일: ${csvToJsonResult.outputPath}`);
      
      // 파일 내용 확인
      if (fs.existsSync(csvToJsonResult.outputPath)) {
        const content = fs.readFileSync(csvToJsonResult.outputPath, 'utf8');
        console.log('📄 파일 내용 미리보기:');
        console.log(content.substring(0, 200) + '...');
      }
    } else {
      console.log('❌ CSV to JSON 변환 실패');
      console.log(`💬 오류: ${csvToJsonResult.message}`);
    }
    console.log('');
    
    // 4. JSON to XML 변환 테스트
    console.log('4️⃣ JSON to XML 변환 테스트...');
    const jsonToXmlResult = await server.executeCommand('convert_format', {
      source_path: path.join(testDataDir, 'sample.json'),
      target_format: 'xml',
      output_path: path.join(testDataDir, 'output-json-to-xml.xml'),
      transformations: {
        keyStyle: 'lowercase'
      }
    });
    
    if (jsonToXmlResult.success) {
      console.log('✅ JSON to XML 변환 성공');
      console.log(`📁 출력 파일: ${jsonToXmlResult.outputPath}`);
      
      // 파일 내용 확인
      if (fs.existsSync(jsonToXmlResult.outputPath)) {
        const content = fs.readFileSync(jsonToXmlResult.outputPath, 'utf8');
        console.log('📄 파일 내용 미리보기:');
        console.log(content.substring(0, 200) + '...');
      }
    } else {
      console.log('❌ JSON to XML 변환 실패');
      console.log(`💬 오류: ${jsonToXmlResult.message}`);
    }
    console.log('');
    
    // 5. XML to CSV 변환 테스트
    console.log('5️⃣ XML to CSV 변환 테스트...');
    const xmlToCsvResult = await server.executeCommand('convert_format', {
      source_path: path.join(testDataDir, 'sample.xml'),
      target_format: 'csv',
      output_path: path.join(testDataDir, 'output-xml-to-csv.csv'),
      options: {
        encoding: 'utf-8',
        includeHeaders: true
      }
    });
    
    if (xmlToCsvResult.success) {
      console.log('✅ XML to CSV 변환 성공');
      console.log(`📁 출력 파일: ${xmlToCsvResult.outputPath}`);
      
      // 파일 내용 확인
      if (fs.existsSync(xmlToCsvResult.outputPath)) {
        const content = fs.readFileSync(xmlToCsvResult.outputPath, 'utf8');
        console.log('📄 파일 내용 미리보기:');
        console.log(content.substring(0, 200) + '...');
      }
    } else {
      console.log('❌ XML to CSV 변환 실패');
      console.log(`💬 오류: ${xmlToCsvResult.message}`);
    }
    console.log('');
    
    // 6. 생성된 파일들 목록
    console.log('6️⃣ 생성된 파일들 확인...');
    const outputFiles = [
      'output-csv-to-json.json',
      'output-json-to-xml.xml',
      'output-xml-to-csv.csv'
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
    
    console.log('\n🎉 변환 테스트 완료!');
    
  } catch (error) {
    console.error('❌ 테스트 중 오류 발생:', error.message);
    console.error(error.stack);
  }
}

conversionTest();
