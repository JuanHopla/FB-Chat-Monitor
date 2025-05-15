/**
 * Script to verify that all source files exist and are available
 * for the compilation process
 */

const fs = require('fs');
const path = require('path');

// File paths
const SRC_DIR = path.join(__dirname, '../src');

// List of files to verify
const sourceFiles = [
  'tampermonkey-header.js',
  'config.js',
  'utils.js',
  'conversation-analyzer.js',
  'responseManager.js',
  'human-simulator.js',
  'ChatManager.js',
  'product-extractor.js',
  'openai-manager.js',
  'assistant-manager-ui.js',
  'ui.js',
  'main.js',
  'init.js'
];

console.log('Verifying source files...');
console.log(`Directory: ${SRC_DIR}`);
console.log('----------------------------');

let missingFiles = [];
let totalSize = 0;

// Verify each file
sourceFiles.forEach(file => {
  const filePath = path.join(SRC_DIR, file);
  
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    const sizeKB = (stats.size / 1024).toFixed(2);
    totalSize += stats.size;
    console.log(`✅ ${file} (${sizeKB} KB)`);
  } else {
    console.log(`❌ ${file} - DOES NOT EXIST`);
    missingFiles.push(file);
  }
});

console.log('----------------------------');
console.log(`Total files: ${sourceFiles.length}`);
console.log(`Missing files: ${missingFiles.length}`);
console.log(`Total size: ${(totalSize / 1024).toFixed(2)} KB`);

if (missingFiles.length > 0) {
  console.log('\n⚠️ MISSING FILES:');
  missingFiles.forEach(file => console.log(`  - ${file}`));
  console.log('\nYou must create these files or correct their names in the compilation script.');
}
