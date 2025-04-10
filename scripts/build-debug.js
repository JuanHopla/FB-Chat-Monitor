const fs = require('fs');
const path = require('path');

// Paths
const HEADER_FILE = path.join(__dirname, '..', 'tampermonkey-header.js');
const CONFIG_FILE = path.join(__dirname, '..', 'src', 'config.js');
const UTILS_FILE = path.join(__dirname, '..', 'src', 'utils.js');
const CHAT_MANAGER_FILE = path.join(__dirname, '..', 'src', 'chatManager.js');
const INDEX_FILE = path.join(__dirname, '..', 'src', 'index.js');
const OUTPUT_FILE = path.join(__dirname, '..', 'dist', 'main.user.js');

console.log('Starting build process...');

// Ensure dist directory exists
if (!fs.existsSync(path.dirname(OUTPUT_FILE))) {
  console.log('Creating dist directory...');
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
}

// Read the Tampermonkey header
console.log('Reading header file...');
let header;
try {
  header = fs.readFileSync(HEADER_FILE, 'utf8');
  console.log('Header loaded successfully');
} catch (err) {
  console.error(`Error reading header file: ${err}`);
  process.exit(1);
}

// Combine all source files
console.log('Combining source files...');
let combinedCode = '';
const files = [CONFIG_FILE, UTILS_FILE, CHAT_MANAGER_FILE, INDEX_FILE];

for (const file of files) {
  try {
    console.log(`Reading ${path.basename(file)}...`);
    const content = fs.readFileSync(file, 'utf8');
    // Replace ES6 imports with comments for Tampermonkey compatibility
    const processedContent = content.replace(/import\s+.*?from\s+['"].*?['"]/g, '// Import statement removed for compatibility');
    combinedCode += processedContent + '\n\n';
    console.log(`${path.basename(file)} processed successfully`);
  } catch (err) {
    console.error(`Error reading file ${file}: ${err}`);
  }
}

// Wrap combined code in IIFE
console.log('Wrapping code in IIFE...');
combinedCode = `(function() {
  'use strict';
  
${combinedCode}
})();`;

// Skip obfuscation for debugging
console.log('Skipping obfuscation for debugging...');

// Combine header with code
const finalCode = header + '\n\n' + combinedCode;

// Save the result
console.log(`Writing output to ${OUTPUT_FILE}...`);
try {
  fs.writeFileSync(OUTPUT_FILE, finalCode);
  console.log('Build complete! ✅');
} catch (err) {
  console.error(`Error writing output file: ${err}`);
  process.exit(1);
}
