/**
 * Script to extract code from dev.user.js into individual source files
 * Creates or updates files in the src/ folder with the corresponding code
 */
const fs = require('fs');
const path = require('path');

// File paths
const devFilePath = path.join(__dirname, '../dist/dev.user.js');
const srcDir = path.join(__dirname, '../src');
const headerFilePath = path.join(__dirname, '../templates/header.js');

// Ensure directories exist
if (!fs.existsSync(srcDir)) {
    fs.mkdirSync(srcDir, { recursive: true });
}

// Structure of source files to create - UPDATED to match exactly what's in dev.user.js
// These section names must match the exact comments in dev.user.js: // ----- SECTION NAME -----
const sourceFiles = [
    // Main config
    { name: 'config.js', sectionName: 'BASIC CONFIGURATION' },
    
    // Main modules
    { name: 'utils.js', sectionName: 'UTILITIES' },
    { name: 'conversation-analyzer.js', sectionName: 'CONVERSATION ANALYSIS AND CONTEXT DETECTION' },
    { name: 'responseManager.js', sectionName: 'RESPONSE MANAGEMENT AND HANDLING' },
    { name: 'human-simulator.js', sectionName: 'HUMAN BEHAVIOR SIMULATION' },
    { name: 'product-extractor.js', sectionName: 'PRODUCT INFORMATION EXTRACTION' },
    { name: 'openai-manager.js', sectionName: 'OPENAI INTEGRATION' },
    { name: 'assistant-manager-ui.js', sectionName: 'ASSISTANT MANAGEMENT UI' },
    { name: 'ChatManager.js', sectionName: 'CHAT MANAGEMENT' },
    { name: 'marketplace.js', sectionName: 'REDIRECTION TO MARKETPLACE' },
    { name: 'ui.js', sectionName: 'USER INTERFACE' },
    { name: 'main.js', sectionName: 'MAIN PROCESS' },
    { name: 'init.js', sectionName: 'INITIALIZATION' },
    { name: 'entry.js', sectionName: 'ENTRY' },
    
    // Additional files that might exist
    { name: 'extensions.js', sectionName: 'jQuery-like VERSION FOR :contains() SELECTOR' },
    { name: 'diagnostics.js', sectionName: 'API DIAGNOSTIC FUNCTION' }
];

// Extract the header
function extractHeader(fileContent) {
    const headerMatch = fileContent.match(/(\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==)/);
    if (headerMatch) {
        fs.writeFileSync(headerFilePath, headerMatch[1], 'utf8');
        console.log('✅ Header extracted and saved to templates/header.js');
    } else {
        console.error('❌ Could not extract the header');
    }
}

// Extract source code according to the section markers
function extractSourceFiles(fileContent) {
    console.log('Extracting source files...');

    for (let i = 0; i < sourceFiles.length; i++) {
        const currentFileSpec = sourceFiles[i];
        const nextFileSpec = sourceFiles[i + 1];

        // Escape special characters in section names for use in RegExp
        const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // Look for section headers with exact format: // ----- SECTION NAME -----
        const startDelimiter = `// ----- ${escapeRegExp(currentFileSpec.sectionName)} -----`;
        let pattern;

        if (nextFileSpec) {
            const nextDelimiter = `// ----- ${escapeRegExp(nextFileSpec.sectionName)} -----`;
            // Regex to capture from startDelimiter up to (but not including) nextDelimiter
            pattern = new RegExp(`${startDelimiter}[\\s\\S]*?(?=\\n*${nextDelimiter})`, 'm');
        } else {
            // Last file: capture from startDelimiter to the end of the IIFE
            pattern = new RegExp(`${startDelimiter}[\\s\\S]*?(?=\\s*^\\}\\)\\(\\);\\s*$)`, 'm');
        }

        console.log(`Buscando sección: ${currentFileSpec.sectionName}`);

        try {
            const match = fileContent.match(pattern);
            if (match && match[0]) {
                let content = match[0];
                
                // Remove the initial section comment
                const initialCommentPattern = new RegExp(`^// ----- ${escapeRegExp(currentFileSpec.sectionName)} -----\\r?\\n(\\r?\\n)?`, '');
                content = content.replace(initialCommentPattern, '');
                
                // Trim leading/trailing whitespace
                content = content.trim();
                
                // Create directory if needed
                const filePath = path.join(srcDir, currentFileSpec.name);
                const dirPath = path.dirname(filePath);
                if (!fs.existsSync(dirPath)) {
                    fs.mkdirSync(dirPath, { recursive: true });
                }
                
                fs.writeFileSync(filePath, content, 'utf8');
                console.log(`✅ File created: ${currentFileSpec.name} (${content.length} bytes)`);
                console.log(`✅ Sección encontrada: ${currentFileSpec.sectionName}`);
            } else {
                console.warn(`⚠️ No se encontró la sección: ${currentFileSpec.sectionName}`);
            }
        } catch (error) {
            console.error(`❌ Error extracting ${currentFileSpec.name}:`, error.message);
        }
    }
}

// Main function
function extractCode() {
    try {
        if (!fs.existsSync(devFilePath)) {
            console.error(`❌ The file ${devFilePath} does not exist`);
            return;
        }

        const fileContent = fs.readFileSync(devFilePath, 'utf8');
        console.log(`📄 File read: ${devFilePath} (${fileContent.length} bytes)`);

        // Create templates directory if it doesn't exist
        const templatesDir = path.join(__dirname, '../templates');
        if (!fs.existsSync(templatesDir)) {
            fs.mkdirSync(templatesDir, { recursive: true });
        }

        // Extract header and source code
        extractHeader(fileContent);
        extractSourceFiles(fileContent);

        console.log('✅ Extraction completed. Source files have been saved to the src/ folder');
    } catch (error) {
        console.error('❌ Error during extraction:', error.message);
    }
}

extractCode();
