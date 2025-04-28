const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// File paths
const headerPath = path.join(__dirname, '..', 'tampermonkey-header.js');
const srcIndexPath = path.join(__dirname, '..', 'src', 'index.js');
const srcUtilsPath = path.join(__dirname, '..', 'src', 'utils.js');
const srcConfigPath = path.join(__dirname, '..', 'src', 'config.js');
const srcChatManagerPath = path.join(__dirname, '..', 'src', 'chatManager.js');
const srcAiServicePath = path.join(__dirname, '..', 'src', 'aiService.js');
const srcEnvLoaderPath = path.join(__dirname, '..', 'src', 'envLoader.js');
const envPath = path.join(__dirname, '..', '.env');
const outputPath = path.join(__dirname, '..', 'dist', 'dev.user.js');

// Load environment variables from .env file
let envVars = {};
try {
  if (fs.existsSync(envPath)) {
    envVars = dotenv.parse(fs.readFileSync(envPath));
    console.log('Loaded environment variables from .env file');
  } else {
    console.log('No .env file found, using default values');
  }
} catch (err) {
  console.warn(`Warning: Could not load .env file: ${err.message}`);
}

// Function to clean imports and exports from code
function cleanModuleCode(code) {
  // Remove imports
  let cleaned = code.replace(/import\s+.*?from\s+['"].*?['"]\s*;?/g, '');
  cleaned = cleaned.replace(/import\s*{.*?}\s*from\s+['"].*?['"]\s*;?/g, '');
  
  // Remove exports but keep definitions
  cleaned = cleaned.replace(/export\s+const\s+(\w+)/g, 'const $1');
  cleaned = cleaned.replace(/export\s+function\s+(\w+)/g, 'function $1');
  cleaned = cleaned.replace(/export\s+class\s+(\w+)/g, 'class $1');
  cleaned = cleaned.replace(/export\s+async\s+function\s+(\w+)/g, 'async function $1');
  
  // Remove export groups
  cleaned = cleaned.replace(/export\s*{[^}]*}/g, '');
  
  return cleaned;
}

// Function to remove duplicate variable declarations
function removeDuplicates(code, isNotConfigModule = true) {
  if (isNotConfigModule) {
    // Remove any SELECTOR_UTILS redefinition
    code = code.replace(/const\s+SELECTOR_UTILS\s*=\s*{[\s\S]*?};/, '// Using SELECTOR_UTILS defined in CONFIG module');
    
    // Remove duplicate backwards compatibility constants
    code = code.replace(/const\s+FB_MARKETPLACE_SELECTORS\s*=\s*CONFIG\.MARKETPLACE;/, '// FB_MARKETPLACE_SELECTORS already defined');
    code = code.replace(/const\s+MESSENGER_SELECTORS\s*=\s*CONFIG\.MESSENGER;/, '// MESSENGER_SELECTORS already defined');
  }
  return code;
}

// Main function
async function buildDevScript() {
  console.log('Creating development version for testing...');
  
  try {
    // Read files
    const header = fs.readFileSync(headerPath, 'utf8');
    
    // Read and clean modules
    const configCode = cleanModuleCode(fs.readFileSync(srcConfigPath, 'utf8'));
    const utilsCode = cleanModuleCode(fs.readFileSync(srcUtilsPath, 'utf8'));
    const chatManagerCode = cleanModuleCode(fs.readFileSync(srcChatManagerPath, 'utf8'));
    const aiServiceCode = cleanModuleCode(fs.readFileSync(srcAiServicePath, 'utf8'));
    let envLoaderCode = '';
    try {
      envLoaderCode = cleanModuleCode(fs.readFileSync(srcEnvLoaderPath, 'utf8'));
    } catch (err) {
      console.log('envLoader.js not found, continuing without it');
    }
    const indexCode = cleanModuleCode(fs.readFileSync(srcIndexPath, 'utf8'));
    
    // Create development script
    let devScript = header + '\n\n';
    devScript += '(function() {\n';
    devScript += '\'use strict\';\n\n';

    // Log script loaded
    devScript += 'console.log(\'[FB-Chat-Monitor] Script loaded 🚀\');\n\n';
    
    // Show visual notification when script loads
    devScript += 'const notifyScriptLoaded = () => {\n';
    devScript += '  const div = document.createElement(\'div\');\n';
    devScript += '  div.style.position = \'fixed\';\n';
    devScript += '  div.style.bottom = \'20px\';\n';
    devScript += '  div.style.right = \'20px\';\n';
    devScript += '  div.style.padding = \'10px\';\n';
    devScript += '  div.style.backgroundColor = \'#4CAF50\';\n';
    devScript += '  div.style.color = \'white\';\n';
    devScript += '  div.style.borderRadius = \'5px\';\n';
    devScript += '  div.style.zIndex = \'9999\';\n';
    devScript += '  div.style.opacity = \'0.9\';\n';
    devScript += '  div.textContent = \'FB Chat Monitor [DEV]: Script loaded\';\n';
    devScript += '  document.body.appendChild(div);\n';
    devScript += '  setTimeout(() => { document.body.removeChild(div); }, 3000);\n';
    devScript += '};\n\n';
    devScript += 'setTimeout(notifyScriptLoaded, 1000);\n\n';

    // Enable development mode
    devScript += 'const DEBUG_MODE = true;\n\n';
    
    // Environment variables
    devScript += 'const ENV = {\n';
    devScript += `  OPENAI_API_KEY: localStorage.getItem('FB_CHAT_MONITOR_OPENAI_KEY') || "${envVars.OPENAI_API_KEY || ''}",\n`;
    devScript += `  AI_MODEL: localStorage.getItem('FB_CHAT_MONITOR_AI_MODEL') || "${envVars.AI_MODEL || 'gpt-3.5-turbo'}",\n`;
    devScript += `  AI_TEMPERATURE: parseFloat(localStorage.getItem('FB_CHAT_MONITOR_AI_TEMP') || "${envVars.AI_TEMPERATURE || '0.7'}"),\n`;
    devScript += `  AI_MAX_TOKENS: parseInt(localStorage.getItem('FB_CHAT_MONITOR_AI_MAX_TOKENS') || "${envVars.AI_MAX_TOKENS || '150'}"),\n`;
    devScript += `  AI_ENDPOINT: "${envVars.AI_ENDPOINT || 'https://api.openai.com/v1/chat/completions'}",\n`;
    devScript += `  DEBUG_MODE: ${envVars.DEBUG_MODE === 'true'},\n`;
    devScript += `  LOG_LEVEL: "${envVars.LOG_LEVEL || 'INFO'}"\n`;
    devScript += '};\n\n';
    
    // AI Configuration
    devScript += 'const AI_CONFIG = {\n';
    devScript += '  enabled: !!ENV.OPENAI_API_KEY,\n';
    devScript += '  apiKey: ENV.OPENAI_API_KEY,\n';
    devScript += '  model: ENV.AI_MODEL,\n';
    devScript += '  endpoint: ENV.AI_ENDPOINT,\n';
    devScript += '  temperature: ENV.AI_TEMPERATURE,\n';
    devScript += '  maxTokens: ENV.AI_MAX_TOKENS\n';
    devScript += '};\n\n';
    
    // ----- CONFIG MODULE -----
    const modifiedConfigCode = configCode
      .replace(/import.*envLoader.*/, '')
      .replace(/const ENV = loadEnv\(\);/, '// ENV already defined above')
      .replace(/CONFIG\.AI\.apiKey\s*=\s*ENV\.OPENAI_API_KEY/, 'CONFIG.AI.apiKey = ENV.OPENAI_API_KEY || ""')
      .replace(/CONFIG\.AI\.model\s*=\s*ENV\.AI_MODEL/, 'CONFIG.AI.model = ENV.AI_MODEL || "gpt-3.5-turbo"')
      .replace(/CONFIG\.AI\.temperature\s*=\s*ENV\.AI_TEMPERATURE/, 'CONFIG.AI.temperature = ENV.AI_TEMPERATURE || 0.7')
      .replace(/CONFIG\.AI\.maxTokens\s*=\s*ENV\.AI_MAX_TOKENS/, 'CONFIG.AI.maxTokens = ENV.AI_MAX_TOKENS || 150')
      .replace(/CONFIG\.AI\.endpoint\s*=\s*ENV\.AI_ENDPOINT/, 'CONFIG.AI.endpoint = ENV.AI_ENDPOINT || "https://api.openai.com/v1/chat/completions"');
    
    devScript += modifiedConfigCode + '\n\n';
    
    // ----- UTILS MODULE -----
    devScript += removeDuplicates(utilsCode) + '\n\n';
    
    // ----- AI SERVICE MODULE -----
    devScript += removeDuplicates(aiServiceCode) + '\n\n';
    
    // ----- CHAT MANAGER MODULE -----
    devScript += removeDuplicates(chatManagerCode) + '\n\n';
    
    // ----- MAIN MODULE -----
    devScript += removeDuplicates(indexCode) + '\n\n';
    
    // ----- API EXPOSURE -----
    // Define the monitoring object permanently in the global scope
    devScript += 'const FB_CHAT_MONITOR_API = {\n';
    devScript += '  chatManager,\n';
    devScript += '  config: CONFIG,\n';
    devScript += '  utils: SELECTOR_UTILS,\n';
    devScript += '  runMonitor: runMarketplaceMonitor,\n';
    devScript += '  setLogLevel: (level) => {\n';
    devScript += '    console.log(`[FB-Chat-Monitor] Log level set to ${level}`);\n';
    devScript += '  },\n\n';
    devScript += '  // AI configuration\n';
    devScript += '  configureAI(apiKey, model = \'gpt-3.5-turbo\') {\n';
    devScript += '    localStorage.setItem(\'FB_CHAT_MONITOR_OPENAI_KEY\', apiKey);\n';
    devScript += '    localStorage.setItem(\'FB_CHAT_MONITOR_AI_MODEL\', model);\n';
    devScript += '    AI_CONFIG.apiKey = apiKey;\n';
    devScript += '    AI_CONFIG.model = model;\n';
    devScript += '    AI_CONFIG.enabled = true;\n';
    devScript += '    console.log(`[FB-Chat-Monitor] AI configured with model: ${model}`);\n\n';
    devScript += '    const div = document.createElement(\'div\');\n';
    devScript += '    div.style.position = \'fixed\';\n';
    devScript += '    div.style.bottom = \'20px\';\n';
    devScript += '    div.style.right = \'20px\';\n';
    devScript += '    div.style.padding = \'10px\';\n';
    devScript += '    div.style.backgroundColor = \'#4CAF50\';\n';
    devScript += '    div.style.color = \'white\';\n';
    devScript += '    div.style.borderRadius = \'5px\';\n';
    devScript += '    div.style.zIndex = \'9999\';\n';
    devScript += '    div.textContent = \'OpenAI API configured successfully!\';\n';
    devScript += '    document.body.appendChild(div);\n\n';
    devScript += '    setTimeout(() => {\n';
    devScript += '      document.body.removeChild(div);\n';
    devScript += '    }, 3000);\n\n';
    devScript += '    return { success: true, message: "API Key configured successfully" };\n';
    devScript += '  },\n\n';
    devScript += '  disableAI() {\n';
    devScript += '    AI_CONFIG.enabled = false;\n';
    devScript += '    console.log(\'[FB-Chat-Monitor] AI responses disabled\');\n';
    devScript += '    return { success: true, message: "AI responses disabled" };\n';
    devScript += '  },\n\n';
    devScript += '  // Get current AI status\n';
    devScript += '  getAIStatus() {\n';
    devScript += '    return {\n';
    devScript += '      enabled: AI_CONFIG.enabled,\n';
    devScript += '      model: AI_CONFIG.model,\n';
    devScript += '      hasApiKey: !!AI_CONFIG.apiKey\n';
    devScript += '    };\n';
    devScript += '  },\n\n';
    devScript += '  // Diagnostic method\n';
    devScript += '  debug() {\n';
    devScript += '    console.log(\'[FB-Chat-Monitor] Debug information:\');\n';
    devScript += '    console.log(\'- Script loaded: Yes\');\n';
    devScript += '    console.log(\'- API exposed: Yes\');\n';
    devScript += '    console.log(\'- AI Config:\', AI_CONFIG);\n';
    devScript += '    console.log(\'- Current URL:\', window.location.href);\n';
    devScript += '    return "FB Chat Monitor is working! You can use this API.";\n';
    devScript += '  }\n';
    devScript += '};\n\n';
    // Ensure correct exposure in global scope
    devScript += 'window.FB_CHAT_MONITOR = FB_CHAT_MONITOR_API;\n\n';
    // Alternative API exposure for compatibility
    devScript += 'document.FB_CHAT_MONITOR = FB_CHAT_MONITOR_API;\n\n';
    // Auto-verification after load
    devScript += 'setTimeout(() => {\n';
    devScript += '  if (window.FB_CHAT_MONITOR) {\n';
    devScript += '    console.log(\'[FB-Chat-Monitor] API successfully exposed to global scope\');\n';
    devScript += '  } else {\n';
    devScript += '    console.error(\'[FB-Chat-Monitor] Failed to expose API to global scope\');\n';
    devScript += '  }\n';
    devScript += '}, 2000);\n\n';
    
    // Initialize based on current URL
    devScript += 'if (window.location.href.includes(\'facebook.com/marketplace\')) {\n';
    devScript += '  // Small delay to ensure the page is loaded\n';
    devScript += '  setTimeout(runMarketplaceMonitor, 2000);\n';
    devScript += '} else if (window.location.href.includes(\'messenger.com\')) {\n';
    devScript += '  // We’ll focus on Marketplace for now\n';
    devScript += '  console.log(\'[FB-Chat-Monitor] Messenger support coming soon!\');\n';
    devScript += '}\n\n';
    
    devScript += 'console.log(\'[FB-Chat-Monitor] Script initialization complete\');\n';
    devScript += '})();';
    
    // Write the file
    fs.writeFileSync(outputPath, devScript);
    console.log(`✅ Development script generated at ${outputPath}`);
    
  } catch (error) {
    console.error('❌ Error generating development script:', error);
    process.exit(1);
  }
}

buildDevScript();
