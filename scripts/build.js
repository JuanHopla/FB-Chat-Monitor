const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const Terser = require('terser');

// Check if we are in production or development mode
const isProd = process.argv[2] === 'prod';
console.log(`Building in ${isProd ? 'PRODUCTION' : 'DEVELOPMENT'} mode`);

// File paths
const SRC_DIR = path.join(__dirname, '../src');
const DIST_DIR = path.join(__dirname, '../dist');
const OUTPUT_FILE = path.join(DIST_DIR, isProd ? 'main.user.js' : 'dev.user.js');

// Ensure the dist directory exists
if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

// List of files to combine in order (make sure ChatManager.js is included)
const sourceFiles = [
  'tampermonkey-header.js',
  'config.js',
  'utils.js',
  'responseManager.js',
  'human-simulator.js',
  'ChatManager.js', // Make sure this line exists and matches the exact file name
  'product-extractor.js',
  'openai-manager.js',
  'assistant-manager-ui.js',
  'ui.js',
  'main.js',
  'init.js'
];

// Function to read a file with error handling
function readFileWithFallback(filepath) {
  try {
    return fs.readFileSync(filepath, 'utf8');
  } catch (err) {
    console.error(`Error reading file ${filepath}:`, err.message);
    return `// ERROR LOADING FILE: ${filepath}\n`;
  }
}

async function build() {
  // Save the header separately to ensure it is preserved
  const headerPath = path.join(__dirname, '../tampermonkey-header.js');
  const headerContent = readFileWithFallback(headerPath);
  
  let combinedCode = '';
  
  // Add IIFE start (do not add the header here, we will do it later)
  combinedCode += '(function () {\n\n';

  // Combine all source files (except the header)
  for (let i = 1; i < sourceFiles.length; i++) {
    const filePath = path.join(SRC_DIR, sourceFiles[i]);
    console.log(`Processing: ${filePath}`);
    
    if (fs.existsSync(filePath)) {
      let content = readFileWithFallback(filePath);
      
      // Remove module exports if they exist
      content = content.replace(/module\.exports\s*=\s*.*?;/g, '');
      content = content.replace(/export\s+(?:default\s+)?(?:const|let|var|class|function)\s+(\w+)/g, '$1');
      content = content.replace(/export\s+\{[^}]*\};/g, '');
      content = content.replace(/import\s+.*?from\s+['"].*?['"];/g, '');
      
      combinedCode += content + '\n\n';
    } else {
      console.warn(`Warning: File ${filePath} does not exist, skipping...`);
    }
  }

  // Add IIFE end
  combinedCode += '})();';

  // Apply minification in production mode
  if (isProd) {
    console.log('Minifying code...');
    try {
      const minified = await Terser.minify(combinedCode, {
        compress: {
          drop_console: false,
          drop_debugger: true
        },
        mangle: {
          reserved: ['CONFIG', 'UTILS', 'GM_setValue', 'GM_getValue']
        }
        // Do not configure format.comments here, as we will handle the header separately
      });
      
      if (minified.error) {
        throw new Error(minified.error);
      }
      
      combinedCode = minified.code;
      console.log('Minification completed successfully.');
    } catch (err) {
      console.error('Error during minification:', err);
      console.log('Continuing with unminified code...');
    }
  }

  // Add the header after minification to ensure it is not lost
  const finalCode = headerContent + '\n\n' + combinedCode;

  // Write the final file
  fs.writeFileSync(OUTPUT_FILE, finalCode);
  console.log(`Built ${OUTPUT_FILE} (${finalCode.length} bytes)`);
}

// Execute the build
build();