/**
 * Script to verify the project structure after cleanup
 */
const fs = require('fs');
const path = require('path');

// Essential files for the build process
const essentialFiles = [
  // Tampermonkey header
  'tampermonkey-header.js',
  
  // Essential source code files
  'src/config.js',
  'src/utils.js',
  'src/ChatManager.js',
  'src/marketplace.js',
  'src/ui.js',
  'src/main.js',
  'src/init.js',
  'src/extensions.js', 
  'src/diagnostics.js',
  
  // Build scripts
  'scripts/build.js',
  'scripts/build-dev.js',
  'scripts/extract-source.js',
  'scripts/clean.js',
  'scripts/verify-structure.js',
  
  // Configuration files
  'package.json',
  'package-lock.json',
  '.gitignore',
  
  // Documentation
  'README.md',
  'CONTRIBUTING.md'
];

// Essential directories
const essentialDirs = [
  'src',
  'scripts',
  'dist'
];

// Check for essential files
console.log('Verifying project structure...');
console.log('\nEssential files:');

let missingCount = 0;
essentialFiles.forEach(file => {
  const filePath = path.join(__dirname, '..', file);
  if (fs.existsSync(filePath)) {
    console.log(`✓ Present: ${file}`);
  } else {
    console.log(`✗ Missing: ${file}`);
    missingCount++;
  }
});

// Check essential directories
console.log('\nEssential directories:');
let missingDirCount = 0;
essentialDirs.forEach(dir => {
  const dirPath = path.join(__dirname, '..', dir);
  if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
    console.log(`✓ Present: ${dir}`);
  } else {
    console.log(`✗ Missing: ${dir}`);
    missingDirCount++;
  }
});

// Look for potentially obsolete files
console.log('\nLooking for potentially obsolete files:');
const obsoletePatterns = [
  'src/index.js',
  'src/fbMarketplaceScraper.js',
  'src/storage.js',
  'src/messengerScraper.js',
  'src/observer.js',
  'src/aiService.js',
  'src/envLoader.js',
  'src/ui',
  'build',
  'main.user.js',
  'diagnostic.js'
];

let obsoleteCount = 0;
obsoletePatterns.forEach(pattern => {
  const itemPath = path.join(__dirname, '..', pattern);
  if (fs.existsSync(itemPath)) {
    console.log(`! Potential obsolete file found: ${pattern}`);
    obsoleteCount++;
  }
});

// Summary
console.log('\n--- Summary ---');
if (missingCount > 0) {
  console.log(`✗ ${missingCount} essential files are missing`);
} else {
  console.log('✓ All essential files are present');
}

if (missingDirCount > 0) {
  console.log(`✗ ${missingDirCount} essential directories are missing`);
} else {
  console.log('✓ All essential directories are present');
}

if (obsoleteCount > 0) {
  console.log(`! Found ${obsoleteCount} potentially obsolete files`);
} else {
  console.log('✓ No obsolete files detected');
}

if (missingCount === 0 && missingDirCount === 0 && obsoleteCount === 0) {
  console.log('\n✅ Project structure is correct');
} else {
  console.log('\n⚠️ Project structure needs adjustments');
}
