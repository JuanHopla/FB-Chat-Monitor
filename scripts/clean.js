/**
 * Script to remove obsolete files from the project
 */
const fs = require('fs');
const path = require('path');

// Files to remove (paths relative to project root)
const filesToRemove = [
  'src/index.js',
  'src/fbMarketplaceScraper.js',
  'src/storage.js',
  'src/ui/controlPanel.js',
  'build/bundle.user.js',
  'src/aiService.js',
  'src/envLoader.js',
  // Additional files detected
  'src/messengerScraper.js',
  'src/ui/floatingControls.js', // Found in reference
  'src/ui/index.js',
  'src/ui/styles.js',
  'src/observer.js', // Possible obsolete file
  // Find any files in src/ui directory
  ...findAllFilesInDirectory(path.join(__dirname, '..', 'src', 'ui')),
  // Redundant files in root
  'main.user.js', // Redundant, already exists in dist/
  'diagnostic.js', // Not essential for build process
  'conversationBuilder.js',
  'src/conversation-analyzer.js',
  'src/extensions.js'
];

// Directories to remove if they exist and are empty
const dirsToRemove = [
  'build',
  'src/ui'
];

// Function to find all files in a directory
function findAllFilesInDirectory(dirPath) {
  let files = [];
  if (fs.existsSync(dirPath)) {
    try {
      const items = fs.readdirSync(dirPath);
      for (const item of items) {
        const fullPath = path.join(dirPath, item);
        const stat = fs.statSync(fullPath);
        if (stat.isFile()) {
          // Convert to relative path
          files.push(path.relative(path.join(__dirname, '..'), fullPath));
        }
      }
    } catch (err) {
      console.error(`Error reading directory ${dirPath}:`, err.message);
    }
  }
  return files;
}

// Recursive function to remove a directory and its contents
function removeDirectoryRecursive(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.readdirSync(dirPath).forEach(file => {
      const curPath = path.join(dirPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        removeDirectoryRecursive(curPath);
      } else {
        fs.unlinkSync(curPath);
        console.log(`✓ Removed: ${path.relative(path.join(__dirname, '..'), curPath)}`);
      }
    });
    fs.rmdirSync(dirPath);
    console.log(`✓ Removed directory: ${path.relative(path.join(__dirname, '..'), dirPath)}`);
  }
}

// Remove files
console.log('Removing obsolete files...');
const uniqueFiles = [...new Set(filesToRemove)]; // Remove duplicates
uniqueFiles.forEach(file => {
  const filePath = path.join(__dirname, '..', file);
  if (fs.existsSync(filePath) && fs.lstatSync(filePath).isFile()) {
    fs.unlinkSync(filePath);
    console.log(`✓ Removed: ${file}`);
  } else {
    console.log(`→ Not found: ${file}`);
  }
});

// Forcibly remove directories
console.log('\nForcibly removing directories...');
dirsToRemove.forEach(dir => {
  const dirPath = path.join(__dirname, '..', dir);
  
  if (fs.existsSync(dirPath)) {
    try {
      removeDirectoryRecursive(dirPath);
    } catch (error) {
      console.error(`✗ Error removing directory ${dir}:`, error.message);
    }
  } else {
    console.log(`→ Directory not found: ${dir}`);
  }
});

console.log('\n✅ Cleanup completed');
