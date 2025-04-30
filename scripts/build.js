/**
 * Unified script to build development and production versions
 */
const fs = require('fs');
const path = require('path');

// Process arguments
const args = process.argv.slice(2);
const mode = args[0] === 'prod' ? 'prod' : 'dev';
const isProduction = mode === 'prod';

// Paths
const rootDir = path.join(__dirname, '..');
const srcDir = path.join(rootDir, 'src');
const distDir = path.join(rootDir, 'dist');
const templatesDir = path.join(rootDir, 'templates');

// Output file
const outputFilename = isProduction ? 'main.user.js' : 'dev.user.js';
const outputFile = path.join(distDir, outputFilename);
const headerFile = isProduction
    ? path.join(templatesDir, 'header-prod.js')
    : path.join(templatesDir, 'header.js');

console.log(`🔧 Building ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'} version (${outputFilename})`);

// Ensure dist directory exists
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
}

// Ensure src directory exists
if (!fs.existsSync(srcDir)) {
    console.error('❌ The src/ directory does not exist. Run "node scripts/extract-source.js" first');
    process.exit(1);
}

// Read the header
let header;
try {
    header = fs.readFileSync(headerFile, 'utf8');
} catch (error) {
    console.error(`❌ Error reading header file: ${headerFile}`);
    console.error('❌ Please make sure it exists by running "node scripts/extract-source.js" first');
    process.exit(1);
}

// If building production version, update the header
if (isProduction && !fs.existsSync(path.join(templatesDir, 'header-prod.js'))) {
    console.log('⚠️ Production header not found, generating one from the development header...');
    header = header
        .replace('[DEV]', '')
        .replace('0.1-dev', '0.1')
        .replace(
            '@run-at       document-idle',
            '@updateURL    https://juanhopla.github.io/FB-Chat-Monitor/main.user.js\n// @downloadURL  https://juanhopla.github.io/FB-Chat-Monitor/main.user.js'
        );

    // Save for future use
    fs.writeFileSync(path.join(templatesDir, 'header-prod.js'), header, 'utf8');
    console.log('✅ Production header generated and saved');
}

// Order of files to process with updated structure
const fileOrder = [
    'config.js',
    'utils.js',
    // New feature modules
    'conversation-analyzer.js',
    'responseManager.js',
    'human-simulator.js',
    'product-extractor.js',
    'openai-manager.js',
    'assistant-manager-ui.js',
    // Core components
    'ChatManager.js',
    'marketplace.js',
    'ui.js',
    'main.js',
    'init.js',
    'entry.js',
    'extensions.js',
    'diagnostics.js'
];

// Start script content with IIFE
let content = '(function() {\n\'use strict\';\n\n';

// Check if files exist and process them in order
let missingFiles = [];
let fileCount = 0;
let totalBytes = 0;

for (const file of fileOrder) {
    const filePath = path.join(srcDir, file);
    if (fs.existsSync(filePath)) {
        // Read the file
        let fileContent = fs.readFileSync(filePath, 'utf8');
        totalBytes += fileContent.length;
        fileCount++;

        // Remove module.exports related code if present
        fileContent = fileContent
            .replace(/if\s*\(typeof\s*module\s*!==\s*['"]undefined['"]\)[\s\S]*?}/g, '')
            .replace(/\/\/\s*Exportar[\s\S]*?;$/gm, '')
            .trim();

        // Add content to script with descriptive comments based on the filename
        const sectionName = getDescriptiveSectionName(file);
        content += `// ----- ${sectionName} -----\n\n`;
        content += `${fileContent}\n\n`;

        console.log(`✅ Processed: ${file} (${fileContent.length} bytes)`);
    } else {
        missingFiles.push(file);
        console.warn(`⚠️ File not found: ${file}`);
    }
}

// Close IIFE
content += '})();';

// Report missing files
if (missingFiles.length > 0) {
    console.warn('⚠️ Missing files:');
    missingFiles.forEach(f => console.warn(`   - src/${f}`));

    // If no files found, recommend extraction
    if (fileCount === 0) {
        console.error('\n❌ No source files found. Please run first:');
        console.error('   node scripts/extract-source.js');
        process.exit(1);
    }
}

// Calculate statistics
const headerLines = header.split('\n').length;
const contentLines = content.split('\n').length;
const totalLines = headerLines + contentLines;

console.log(`\n📊 Generated file statistics:`);
console.log(`   - Files processed: ${fileCount}/${fileOrder.length}`);
console.log(`   - Total size: ${totalBytes} bytes`);
console.log(`   - Header lines: ${headerLines}`);
console.log(`   - Code lines: ${contentLines}`);
console.log(`   - Total lines: ${totalLines}`);

// Backup existing file if it exists
if (fs.existsSync(outputFile)) {
    const backupFile = outputFile + '.bak';
    fs.copyFileSync(outputFile, backupFile);
    console.log(`📦 Backup created at: ${backupFile}`);
}

// Write the final file
try {
    fs.writeFileSync(outputFile, `${header}\n\n${content}`, 'utf8');
    console.log(`\n✅ File ${outputFile} generated successfully (${totalLines} lines)`);
} catch (error) {
    console.error(`❌ Error writing file ${outputFile}:`, error.message);
    process.exit(1);
}

// Final message
console.log('🚀 Build process completed');

/**
 * Gets a descriptive section name based on the filename
 */
function getDescriptiveSectionName(fileName) {
    switch (fileName) {
        case 'config.js': return 'BASIC CONFIGURATION';
        case 'utils.js': return 'UTILITIES';
        case 'ChatManager.js': return 'CHAT MANAGEMENT';
        case 'marketplace.js': return 'REDIRECTION TO MARKETPLACE';
        case 'ui.js': return 'USER INTERFACE';
        case 'main.js': return 'MAIN PROCESS';
        case 'init.js': return 'INITIALIZATION';
        case 'extensions.js': return 'jQuery-like VERSION FOR :contains() SELECTOR';
        case 'diagnostics.js': return 'API DIAGNOSTIC FUNCTION';
        // New modules descriptive names
        case 'conversation-analyzer.js': return 'CONVERSATION ANALYSIS AND CONTEXT DETECTION';
        case 'responseManager.js': return 'RESPONSE MANAGEMENT AND HANDLING';
        case 'human-simulator.js': return 'HUMAN BEHAVIOR SIMULATION';
        case 'product-extractor.js': return 'PRODUCT INFORMATION EXTRACTION';
        case 'openai-manager.js': return 'OPENAI INTEGRATION';
        case 'assistant-manager-ui.js': return 'ASSISTANT MANAGEMENT UI';
        default: return fileName.toUpperCase().replace('.JS', '');
    }
}
