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

// Structure of source files to create with improved patterns
const sourceFiles = [
    { 
        name: 'config.js', 
        pattern: /\/\/ ----- BASIC CONFIGURATION -----[\s\S]*?const CONFIG = \{[\s\S]*?\};/m 
    },
    { 
        name: 'utils.js', 
        pattern: /\/\/ ----- UTILITIES -----[\s\S]*?(\/\/ ----- CHAT MANAGEMENT -----)/m,
        replaceLast: true
    },
    { 
        name: 'ChatManager.js', 
        pattern: /\/\/ ----- CHAT MANAGEMENT -----[\s\S]*?class ChatManager[\s\S]*?(\/\/ ----- REDIRECTION TO MARKETPLACE -----)/m,
        replaceLast: true
    },
    { 
        name: 'marketplace.js', 
        pattern: /\/\/ ----- REDIRECTION TO MARKETPLACE -----[\s\S]*?(\/\/ ----- USER INTERFACE -----)/m,
        replaceLast: true
    },
    { 
        name: 'ui.js', 
        pattern: /\/\/ ----- USER INTERFACE -----[\s\S]*?(\/\/ ----- MAIN PROCESS -----)/m,
        replaceLast: true
    },
    { 
        name: 'main.js', 
        pattern: /\/\/ ----- MAIN PROCESS -----[\s\S]*?(\/\/ ----- INITIALIZATION -----)/m,
        replaceLast: true
    },
    { 
        name: 'init.js', 
        pattern: /\/\/ ----- INITIALIZATION -----[\s\S]*?(\/\/ ----- jQuery-like VERSION)/m,
        replaceLast: true
    },
    { 
        name: 'extensions.js', 
        pattern: /\/\/ ----- jQuery-like VERSION[\s\S]*?(\/\/ ----- API DIAGNOSTIC FUNCTION -----)/m,
        replaceLast: true
    },
    { 
        name: 'diagnostics.js', 
        pattern: /\/\/ ----- API DIAGNOSTIC FUNCTION -----[\s\S]*?$/m 
    }
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

// Extract source code according to the improved patterns
function extractSourceFiles(fileContent) {
    console.log('Extracting source files...');

    sourceFiles.forEach(file => {
        try {
            const match = fileContent.match(file.pattern);
            if (match) {
                // Determine content, removing the last captured group if needed
                let content = file.replaceLast ? match[0].replace(match[1], '') : match[0];
                
                // Remove section comments at the beginning for cleaner files
                content = content.replace(/\/\/ ----- [A-Z\s]+ -----\n\n?/, '');
                
                const filePath = path.join(srcDir, file.name);
                fs.writeFileSync(filePath, content, 'utf8');
                console.log(`✅ File created: ${file.name} (${content.length} bytes)`);
            } else {
                console.warn(`⚠️ Could not extract content for: ${file.name}`);
            }
        } catch (error) {
            console.error(`❌ Error extracting ${file.name}:`, error.message);
        }
    });
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
