const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// File paths
const headerPath = path.join(__dirname, '..', 'templates', 'header.js');
const srcConfigPath = path.join(__dirname, '..', 'src', 'config.js');
const srcUtilsPath = path.join(__dirname, '..', 'src', 'utils.js');
const srcResponseManagerPath = path.join(__dirname, '..', 'src', 'responseManager.js');
const srcAudioAssociationPath = path.join(__dirname, '..', 'src', 'audio-association.js');
const srcChatManagerPath = path.join(__dirname, '..', 'src', 'chatManager.js');
const srcProductExtractorPath = path.join(__dirname, '..', 'src', 'product-extractor.js');
const srcImageFilterUtilsPath = path.join(__dirname, '..', 'src', 'core', 'openai', 'image-filter-utils.js');
const srcTimestampUtilsPath = path.join(__dirname, '..', 'src', 'core', 'openai', 'timestamp-utils.js');
const srcApiClientPath = path.join(__dirname, '..', 'src', 'core', 'openai', 'ApiClient.js');
const srcThreadStorePath = path.join(__dirname, '..', 'src', 'core', 'openai', 'ThreadStore.js');
const srcMessageUtilsPath = path.join(__dirname, '..', 'src', 'core', 'openai', 'MessageUtils.js');
const srcMessagePreprocessorPath = path.join(__dirname, '..', 'src', 'core', 'openai', 'MessagePreprocessor.js');
const srcAssistantHandlerPath = path.join(__dirname, '..', 'src', 'core', 'openai', 'AssistantHandler.js');
const srcOpenAIManagerPath = path.join(__dirname, '..', 'src', 'openai-manager.js');
const srcUiPath = path.join(__dirname, '..', 'src', 'ui.js');
const srcMainPath = path.join(__dirname, '..', 'src', 'main.js');
const srcInitPath = path.join(__dirname, '..', 'src', 'init.js');

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
  cleaned = cleaned.replace(/export\s+default\s+/g, ''); // Handle export default
  cleaned = cleaned.replace(/export\s+const\s+(\w+)/g, 'const $1');
  cleaned = cleaned.replace(/export\s+function\s+(\w+)/g, 'function $1');
  cleaned = cleaned.replace(/export\s+class\s+(\w+)/g, 'class $1');
  cleaned = cleaned.replace(/export\s+async\s+function\s+(\w+)/g, 'async function $1');

  // Remove export groups
  cleaned = cleaned.replace(/export\s*{[^}]*}/g, '');

  return cleaned;
  // Esta función elimina los imports/exports y los adapta para funcionar en un contexto global
  // Es necesaria para tu enfoque actual
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
    console.log(`Using development header from: ${headerPath}`);

    // Read and clean modules
    // This list should mirror the one in extract-source.js for consistency, plus new files
    const modules = [
      // Config modular
      { path: path.join(__dirname, '..', 'src', 'config', 'basicConfig.js'), sectionName: 'BASIC CONFIGURATION', varName: 'basicConfigCode' },
      { path: path.join(__dirname, '..', 'src', 'config', 'aiConfig.js'), sectionName: 'AI CONFIGURATION', varName: 'aiConfigCode' },
      { path: path.join(__dirname, '..', 'src', 'config', 'productConfig.js'), sectionName: 'PRODUCT CONFIGURATION', varName: 'productConfigCode' },
      { path: path.join(__dirname, '..', 'src', 'config', 'audioTranscriptionConfig.js'), sectionName: 'AUDIO TRANSCRIPTION CONFIGURATION', varName: 'audioTranscriptionConfigCode' },
      { path: path.join(__dirname, '..', 'src', 'config', 'selectors.js'), sectionName: 'SELECTORS CONFIGURATION', varName: 'selectorsConfigCode' },
      { path: srcConfigPath, sectionName: 'CONFIGURATION', varName: 'configCode' },
      
      // Utils submodules
      { path: path.join(__dirname, '..', 'src', 'utils/logger.js'), sectionName: 'UTILS - LOGGER', varName: 'utilsLoggerCode' },
      { path: path.join(__dirname, '..', 'src', 'utils/domUtils.js'), sectionName: 'UTILS - DOM UTILS', varName: 'utilsDomUtilsCode' },
      { path: path.join(__dirname, '..', 'src', 'utils/storageUtils.js'), sectionName: 'UTILS - STORAGE UTILS', varName: 'utilsStorageUtilsCode' },
      { path: path.join(__dirname, '..', 'src', 'utils/userActivityTracker.js'), sectionName: 'UTILS - USER ACTIVITY TRACKER', varName: 'utilsUserActivityTrackerCode' },
      { path: path.join(__dirname, '..', 'src', 'utils/retryUtils.js'), sectionName: 'UTILS - RETRY UTILS', varName: 'utilsRetryUtilsCode' },
      { path: path.join(__dirname, '..', 'src', 'utils/timeUtils.js'), sectionName: 'UTILS - TIME UTILS', varName: 'utilsTimeUtilsCode' },
      { path: path.join(__dirname, '..', 'src', 'utils/pageUtils.js'), sectionName: 'UTILS - PAGE UTILS', varName: 'utilsPageUtilsCode' },
      { path: path.join(__dirname, '..', 'src', 'utils/facebookUtils.js'), sectionName: 'UTILS - FACEBOOK UTILS', varName: 'utilsFacebookUtilsCode' },
      { path: path.join(__dirname, '..', 'src', 'utils/generalUtils.js'), sectionName: 'UTILS - GENERAL UTILS', varName: 'utilsGeneralUtilsCode' },
      { path: srcUtilsPath, sectionName: 'UTILITIES', varName: 'utilsCode' },
      
      // Product-extractor submodules
      { path: path.join(__dirname, '..', 'src', 'product-extractor', 'cacheManager.js'), sectionName: 'PRODUCT EXTRACTOR - CACHE MANAGER', varName: 'productExtractorCacheManagerCode' },
      { path: path.join(__dirname, '..', 'src', 'product-extractor', 'idExtractor.js'), sectionName: 'PRODUCT EXTRACTOR - ID EXTRACTOR', varName: 'productExtractorIdExtractorCode' },
      { path: path.join(__dirname, '..', 'src', 'product-extractor', 'detailsExtractor.js'), sectionName: 'PRODUCT EXTRACTOR - DETAILS EXTRACTOR', varName: 'productExtractorDetailsExtractorCode' },
      { path: path.join(__dirname, '..', 'src', 'product-extractor', 'htmlExtractor.js'), sectionName: 'PRODUCT EXTRACTOR - HTML EXTRACTOR', varName: 'productExtractorHtmlExtractorCode' },
      { path: path.join(__dirname, '..', 'src', 'product-extractor', 'utils.js'), sectionName: 'PRODUCT EXTRACTOR - UTILS', varName: 'productExtractorUtilsCode' },
      { path: srcProductExtractorPath, sectionName: 'PRODUCT INFORMATION EXTRACTION', varName: 'productExtractorCode' },
      { path: path.join(__dirname, '..', 'src', 'openai-manager/apiKeyManager.js'), sectionName: 'OPENAI MANAGER - API KEY MANAGER', varName: 'openAIapiKeyManagerCode' },
      { path: path.join(__dirname, '..', 'src', 'openai-manager/assistantManager.js'), sectionName: 'OPENAI MANAGER - ASSISTANT MANAGER', varName: 'openAIassistantManagerCode' },
      { path: path.join(__dirname, '..', 'src', 'openai-manager/threadManager.js'), sectionName: 'OPENAI MANAGER - THREAD MANAGER', varName: 'openAIthreadManagerCode' },
      { path: path.join(__dirname, '..', 'src', 'openai-manager/messageHandler.js'), sectionName: 'OPENAI MANAGER - MESSAGE HANDLER', varName: 'openAImessageHandlerCode' },
      { path: srcOpenAIManagerPath, sectionName: 'OPENAI INTEGRATION', varName: 'openAICode' },
      // AssistantManagerUI new modules
      { path: path.join(__dirname, '..', 'src', 'AssistantManagerUI', 'createStyles.js'), sectionName: 'ASSISTANT MANAGER UI - CREATE STYLES', varName: 'assistantManagerUiCreateStylesCode' },
      { path: path.join(__dirname, '..', 'src', 'AssistantManagerUI', 'createPanel.js'), sectionName: 'ASSISTANT MANAGER UI - CREATE PANEL', varName: 'assistantManagerUiCreatePanelCode' },
      { path: path.join(__dirname, '..', 'src', 'AssistantManagerUI', 'attachEvents.js'), sectionName: 'ASSISTANT MANAGER UI - ATTACH EVENTS', varName: 'assistantManagerUiAttachEventsCode' },
      { path: path.join(__dirname, '..', 'src', 'AssistantManagerUI', 'saveAssistant.js'), sectionName: 'ASSISTANT MANAGER UI - SAVE ASSISTANT', varName: 'assistantManagerUiSaveAssistantCode' },
      { path: path.join(__dirname, '..', 'src', 'AssistantManagerUI', 'showStatus.js'), sectionName: 'ASSISTANT MANAGER UI - SHOW STATUS', varName: 'assistantManagerUiShowStatusCode' },
      { path: srcAssistantManagerUiPath, sectionName: 'ASSISTANT MANAGEMENT UI CORE', varName: 'assistantManagerUiCode' },
      // ChatManager new modules
      { path: path.join(__dirname, '..', 'src', 'ChatManager/helpers/timeConverter.js'), sectionName: 'CHAT MANAGER - TIME CONVERTER', varName: 'chatManagerTimeConverterCode' },
      { path: path.join(__dirname, '..', 'src', 'ChatManager/helpers/chatStateUtils.js'), sectionName: 'CHAT MANAGER - CHAT STATE UTILS', varName: 'chatManagerChatStateUtilsCode' },
      { path: path.join(__dirname, '..', 'src', 'ChatManager/helpers/audioUtils.js'), sectionName: 'CHAT MANAGER - AUDIO UTILS', varName: 'chatManagerAudioUtilsCode' },
      { path: path.join(__dirname, '..', 'src', 'ChatManager/extractors/chatDataExtractor.js'), sectionName: 'CHAT MANAGER - CHAT DATA EXTRACTOR', varName: 'chatManagerChatDataExtractorCode' },
      { path: path.join(__dirname, '..', 'src', 'ChatManager/scanners/inboxScanner.js'), sectionName: 'CHAT MANAGER - INBOX SCANNER', varName: 'chatManagerInboxScannerCode' },
      { path: path.join(__dirname, '..', 'src', 'ChatManager/processors/chatOperations.js'), sectionName: 'CHAT MANAGER - CHAT OPERATIONS', varName: 'chatManagerChatOperationsCode' },
      { path: srcChatManagerPath, sectionName: 'CHAT MANAGEMENT', varName: 'chatManagerCode' },
      { path: srcMarketplacePath, sectionName: 'REDIRECTION TO MARKETPLACE', varName: 'marketplaceCode' },
      // UI submodules
      { path: path.join(__dirname, '..', 'src', 'ui/state.js'), sectionName: 'UI - STATE', varName: 'uiStateCode' },
      { path: path.join(__dirname, '..', 'src', 'ui/styles.js'), sectionName: 'UI - STYLES', varName: 'uiStylesCode' },
      { path: path.join(__dirname, '..', 'src', 'ui/utils.js'), sectionName: 'UI - UTILS', varName: 'uiUtilsCode' },
      { path: path.join(__dirname, '..', 'src', 'ui/components/floatingButton.js'), sectionName: 'UI - FLOATING BUTTON', varName: 'uiFloatingButtonCode' },
      { path: path.join(__dirname, '..', 'src', 'ui/components/controlPanel.js'), sectionName: 'UI - CONTROL PANEL', varName: 'uiControlPanelCode' },
      { path: path.join(__dirname, '..', 'src', 'ui/components/tabs/dashboard.js'), sectionName: 'UI - TAB DASHBOARD', varName: 'uiTabDashboardCode' },
      { path: path.join(__dirname, '..', 'src', 'ui/components/tabs/assistants.js'), sectionName: 'UI - TAB ASSISTANTS', varName: 'uiTabAssistantsCode' },
      { path: path.join(__dirname, '..', 'src', 'ui/components/tabs/config.js'), sectionName: 'UI - TAB CONFIG', varName: 'uiTabConfigCode' },
      { path: path.join(__dirname, '..', 'src', 'ui/components/tabs/logs.js'), sectionName: 'UI - TAB LOGS', varName: 'uiTabLogsCode' },
      { path: path.join(__dirname, '..', 'src', 'ui/components/tabs/history.js'), sectionName: 'UI - TAB HISTORY', varName: 'uiTabHistoryCode' },
      { path: path.join(__dirname, '..', 'src', 'ui/handlers/eventHandlers.js'), sectionName: 'UI - EVENT HANDLERS', varName: 'uiEventHandlersCode' },
      { path: path.join(__dirname, '..', 'src', 'ui/handlers/assistantHandler.js'), sectionName: 'UI - ASSISTANT HANDLER', varName: 'uiAssistantHandlerCode' },
      { path: path.join(__dirname, '..', 'src', 'ui/handlers/configHandler.js'), sectionName: 'UI - CONFIG HANDLER', varName: 'uiConfigHandlerCode' },
      { path: path.join(__dirname, '..', 'src', 'ui/handlers/logsHandler.js'), sectionName: 'UI - LOGS HANDLER', varName: 'uiLogsHandlerCode' },
      { path: path.join(__dirname, '..', 'src', 'ui/handlers/historyHandler.js'), sectionName: 'UI - HISTORY HANDLER', varName: 'uiHistoryHandlerCode' },
      { path: srcUiPath, sectionName: 'USER INTERFACE', varName: 'uiCode' },
      // Main flow modules
      { path: path.join(__dirname, '..', 'src', 'main', 'createUI.js'), sectionName: 'CREATE UI', varName: 'mainCreateUICode' },
      { path: path.join(__dirname, '..', 'src', 'main', 'initialize.js'), sectionName: 'INITIALIZE', varName: 'mainInitializeCode' },
      { path: path.join(__dirname, '..', 'src', 'main', 'loadSavedSettings.js'), sectionName: 'LOAD SAVED SETTINGS', varName: 'mainLoadSavedSettingsCode' },
      { path: path.join(__dirname, '..', 'src', 'main', 'setupAdaptiveMonitoring.js'), sectionName: 'SETUP ADAPTIVE MONITORING', varName: 'mainSetupAdaptiveMonitoringCode' },
      { path: path.join(__dirname, '..', 'src', 'main', 'updateScanInterval.js'), sectionName: 'UPDATE SCAN INTERVAL', varName: 'mainUpdateScanIntervalCode' },
      { path: path.join(__dirname, '..', 'src', 'main', 'toggleMonitoring.js'), sectionName: 'TOGGLE MONITORING', varName: 'mainToggleMonitoringCode' },
      { path: path.join(__dirname, '..', 'src', 'main', 'updateMonitoringUI.js'), sectionName: 'UPDATE MONITORING UI', varName: 'mainUpdateMonitoringUICode' },
      { path: path.join(__dirname, '..', 'src', 'main', 'runChatMonitor.js'), sectionName: 'RUN CHAT MONITOR', varName: 'mainRunChatMonitorCode' },
      { path: path.join(__dirname, '..', 'src', 'main', 'resetMonitoringInterval.js'), sectionName: 'RESET MONITORING INTERVAL', varName: 'mainResetMonitoringIntervalCode' },
      { path: path.join(__dirname, '..', 'src', 'main', 'incrementErrorCount.js'), sectionName: 'INCREMENT ERROR COUNT', varName: 'mainIncrementErrorCountCode' },
      { path: path.join(__dirname, '..', 'src', 'main', 'getMonitoringStats.js'), sectionName: 'GET MONITORING STATS', varName: 'mainGetMonitoringStatsCode' },
      { path: path.join(__dirname, '..', 'src', 'main', 'manualScan.js'), sectionName: 'MANUAL SCAN', varName: 'mainManualScanCode' },
      { path: path.join(__dirname, '..', 'src', 'main', 'setupTranscriptionUpdates.js'), sectionName: 'SETUP TRANSCRIPTION UPDATES', varName: 'mainSetupTranscriptionUpdatesCode' },
      { path: srcMainPath, sectionName: 'MAIN PROCESS', varName: 'mainCode' },
      { path: srcInitPath, sectionName: 'INITIALIZATION', varName: 'initCode' },
      { path: srcEntryPath, sectionName: 'ENTRY', varName: 'entryCode' },
      { path: srcDiagnosticsPath, sectionName: 'API DIAGNOSTIC FUNCTION', varName: 'diagnosticsCode' },
    ];

    const loadedModules = {};
    for (const moduleInfo of modules) {
      try {
        loadedModules[moduleInfo.varName] = cleanModuleCode(fs.readFileSync(moduleInfo.path, 'utf8'));
      } catch (err) {
        console.warn(`Warning: Could not read or clean module ${moduleInfo.path}: ${err.message}`);
        loadedModules[moduleInfo.varName] = `// Module ${moduleInfo.path} not found or failed to load\n`;
      }
    }

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
    // Special handling for config.js: remove its own env loading and use the global ENV
    const modifiedConfigCode = loadedModules.configCode
      .replace(/import.*envLoader.*/, '// Import from envLoader removed by build-dev.js')
      .replace(/const ENV = loadEnv\(\);/, '// const ENV = loadEnv(); replaced by build-dev.js with global ENV object')
      .replace(/CONFIG\.AI\.apiKey\s*=\s*ENV\.OPENAI_API_KEY/, 'CONFIG.AI.apiKey = ENV.OPENAI_API_KEY || ""')
      .replace(/CONFIG\.AI\.model\s*=\s*ENV\.AI_MODEL/, 'CONFIG.AI.model = ENV.AI_MODEL || "gpt-3.5-turbo"')
      .replace(/CONFIG\.AI\.temperature\s*=\s*ENV\.AI_TEMPERATURE/, 'CONFIG.AI.temperature = ENV.AI_TEMPERATURE || 0.7')
      .replace(/CONFIG\.AI\.maxTokens\s*=\s*ENV\.AI_MAX_TOKENS/, 'CONFIG.AI.maxTokens = ENV.AI_MAX_TOKENS || 150')
      .replace(/CONFIG\.AI\.endpoint\s*=\s*ENV\.AI_ENDPOINT/, 'CONFIG.AI.endpoint = ENV.AI_ENDPOINT || "https://api.openai.com/v1/chat/completions"');

    devScript += modifiedConfigCode + '\n\n';

    // Concatenate other modules with section delimiters
    for (const moduleInfo of modules) {
      // Skip configCode as it's already handled
      if (moduleInfo.varName === 'configCode') continue;

      devScript += `// ----- ${moduleInfo.sectionName} -----\n\n`;
      devScript += removeDuplicates(loadedModules[moduleInfo.varName], moduleInfo.varName !== 'configCode') + '\n\n';
    }

    // ----- API EXPOSURE -----
    // Define the monitoring object permanently in the global scope
    devScript += 'const FB_CHAT_MONITOR_API = {\n';
    devScript += '  chatManager,\n';
    devScript += '  config: CONFIG,\n'; // Ensure CONFIG is correctly referenced
    devScript += '  utils: domUtils, // Assuming domUtils is the primary export from utils for API\n';
    devScript += '  logger: logger,\n';
    devScript += '  productExtractor: productExtractor,\n';
    devScript += '  openAIManager: openAIManager,\n';
    devScript += '  responseManager: responseManager,\n';
    devScript += '  humanSimulator: humanSimulator,\n';
    devScript += '  assistantManagerUI: assistantManagerUI,\n';
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
    devScript += '    console.log(\'- CONFIG:\', CONFIG);\n'; // Changed from AI_CONFIG to full CONFIG
    devScript += '    console.log(\'- Current URL:\', window.location.href);\n';
    devScript += '    // Add other relevant debug info here, e.g., chatManager.currentChatId\n';
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
    console.error(`❌ Error building development script: ${error.message}`);
    process.exit(1);
  }
}

buildDevScript();