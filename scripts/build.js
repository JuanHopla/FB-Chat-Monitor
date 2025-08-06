const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const JavaScriptObfuscator = require('javascript-obfuscator');

// Check if we are in production or development mode
const isProd = process.argv[2] === 'prod';
console.log(`Building in ${isProd ? 'PRODUCTION' : 'DEVELOPMENT'} mode`);

// File paths
const SRC_DIR = path.join(__dirname, '../src');
const DIST_DIR = path.join(__dirname, '../dist');
const OUTPUT_FILE = path.join(DIST_DIR, isProd ? 'main.user.js' : 'dev.user.js');

// Define header paths based on build mode
const HEADER_PATH = path.join(__dirname, '../templates', isProd ? 'header-prod.js' : 'header.js');

// Ensure the dist directory exists
if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

// List of files to combine in order
const sourceFiles = [
  // Header will be handled separately now, not in this list
  'config.js',
  'utils.js',
  'core/openai/Storage.js',
  'core/openai/ThreadStore.js',
  'audioTranscriber.js',
  'core/ScrollManager.js',
  'core/EventCoordinator.js',
  'chatManager.js',
  'product-extractor.js',
  'core/openai/image-filter-utils.js',
  'core/openai/timestamp-utils.js',
  'core/openai/ApiClient.js',
  'core/openai/MessagePreprocessor.js',
  'core/openai/AssistantHandler.js',
  'openai-manager.js',
  'ui.js',
  'main.js',
  'init.js',
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
  const headerContent = readFileWithFallback(HEADER_PATH);
  console.log(`Using header from: ${HEADER_PATH}`);

  let combinedCode = '';

  // Add IIFE start (do not add the header here, we will do it later)
  combinedCode += '(function () {\n\n';

  // Combine all source files
  for (const sourceFile of sourceFiles) {
    const filePath = path.join(SRC_DIR, sourceFile);
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

  if (isProd) {
    console.log('Obfuscating code...');
    try {
      const obfuscationResult = JavaScriptObfuscator.obfuscate(combinedCode, {
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.6,
        deadCodeInjection: true,
        deadCodeInjectionThreshold: 0.1,
        debugProtection: false,
        debugProtectionInterval: 0,
        disableConsoleOutput: false,
        identifierNamesGenerator: 'hexadecimal',
        log: false,
        numbersToExpressions: true,
        renameGlobals: false,
        selfDefending: true,
        simplify: true,
        splitStrings: true,
        stringArray: true,
        stringArrayThreshold: 0.75,
        transformObjectKeys: false,
        unicodeEscapeSequence: false,
        reservedNames: [
          // Tampermonkey API
          'GM_setValue',
          'GM_getValue',
          'GM_deleteValue',
          'GM_listValues',
          'GM_xmlhttpRequest',
          'GM_addStyle',

          // Config and utilities
          'CONFIG',
          'UTILS',

          // Main managers
          'ChatManager',
          'chatManager',
          'responseManager',
          'ResponseManager',
          'openAIManager',
          'OpenAIManager',
          'humanSimulator',
          'HumanSimulator',

          // User interface
          'ui',
          'UI',
          'assistantManagerUI',
          'AssistantManagerUI',
          'domUtils',

          // Global classes and objects
          'FBChatMonitor',
          'ProductExtractor',
          'productExtractor',
          'ConversationAnalyzer',
          'conversationAnalyzer',
          'storageUtils',

          // Specific utilities
          'logger',
          'audioTranscriber',
          'initializeMonitor',
          'getProductInfo',
          'extractProductDetails',

          // Critical properties and methods
          'initialize',
          'sendMessage',
          'processMessage',
          'analyzeConversation'
        ]
      });

      combinedCode = obfuscationResult.getObfuscatedCode();
      console.log('Obfuscation completed successfully.');
    } catch (err) {
      console.error('Error during obfuscation:', err);
      console.log('Continuing with non-obfuscated code...');
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