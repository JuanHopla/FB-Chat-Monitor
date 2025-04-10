const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

// Paths
const HEADER_FILE = path.join(__dirname, '..', 'tampermonkey-header.js');
const OUTPUT_FILE = path.join(__dirname, '..', 'dist', 'main.user.js');
const MAIN_FILE = path.join(__dirname, '..', 'main.user.js');

console.log('Starting optimized build process...');

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
  // If header file doesn't exist, extract it from main.user.js
  console.log('Header file not found, extracting from main.user.js...');
  const mainContent = fs.readFileSync(MAIN_FILE, 'utf8');
  const headerMatch = mainContent.match(/(\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==)/);
  header = headerMatch ? headerMatch[0] : '';
  console.log('Header extracted successfully');
}

// Read main script
console.log('Reading main script...');
let mainScript;
try {
  mainScript = fs.readFileSync(MAIN_FILE, 'utf8');
  // Remove header from main script if it exists
  mainScript = mainScript.replace(/(\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==)/, '');
  console.log('Main script loaded successfully');
} catch (err) {
  console.error(`Error reading main script: ${err}`);
  process.exit(1);
}

// Obfuscate the code (optional - comment out for debugging)
console.log('Obfuscating code...');
try {
  const obfuscationResult = JavaScriptObfuscator.obfuscate(mainScript, {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.3,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.2,
    identifierNamesGenerator: 'hexadecimal',
    log: false,
    renameGlobals: false,
    rotateStringArray: true,
    selfDefending: true,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.75,
    transformObjectKeys: false
  });
  mainScript = obfuscationResult.getObfuscatedCode();
  console.log('Code obfuscated successfully');
} catch (err) {
  console.warn(`Warning: Code obfuscation failed: ${err}`);
  console.log('Proceeding with non-obfuscated code...');
}

// Combine header and script
const finalCode = header + '\n\n' + mainScript;

// Save the result
console.log(`Writing output to ${OUTPUT_FILE}...`);
try {
  fs.writeFileSync(OUTPUT_FILE, finalCode);
  console.log('Build complete! ✅');
} catch (err) {
  console.error(`Error writing output file: ${err}`);
  process.exit(1);
}
