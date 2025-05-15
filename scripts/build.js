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
  let combinedCode = '';

  // Add header
  const headerPath = path.join(__dirname, '../tampermonkey-header.js');
  combinedCode += readFileWithFallback(headerPath);
  combinedCode += '\n\n';

  // Add IIFE start
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

  // Minify in production
  if (isProd) {
    console.log('Minifying code...');
    try {
      const minified = await Terser.minify(combinedCode, {
        compress: {
          drop_console: false,
          drop_debugger: true
        },
        format: {
          comments: /==UserScript==|@preserve|@license/
        }
      });
      combinedCode = minified.code;
    } catch (err) {
      console.error('Error minifying code:', err);
    }
  } else {
    // Add source map in development
    combinedCode += '\n//# sourceMappingURL=dev.user.js.map';
  }

  // Write the final file
  fs.writeFileSync(OUTPUT_FILE, combinedCode);
  console.log(`Built ${OUTPUT_FILE} (${combinedCode.length} bytes)`);
}

// Execute the build
build();
