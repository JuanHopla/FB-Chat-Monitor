const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Starting publication process...');

// Run the optimized build first
console.log('Building optimized version...');
try {
  execSync('npm run build-optimized', { stdio: 'inherit' });
  console.log('Build completed successfully');
} catch (error) {
  console.error('Build failed:', error);
  process.exit(1);
}

// Check branch
try {
  const currentBranch = execSync('git branch --show-current').toString().trim();
  console.log(`Currently on branch: ${currentBranch}`);
} catch (error) {
  console.error('Error checking git branch:', error);
}

// Update the gh-pages branch
console.log('Updating gh-pages branch...');
try {
  // Save current work if any
  execSync('git stash');
  
  // Check if gh-pages branch exists
  const branchExists = execSync('git branch --list gh-pages').toString().trim() !== '';
  
  if (!branchExists) {
    console.log('Creating gh-pages branch...');
    execSync('git checkout --orphan gh-pages');
    execSync('git rm -rf .');
  } else {
    console.log('Switching to gh-pages branch...');
    execSync('git checkout gh-pages');
  }
  
  // Copy the built file
  fs.copyFileSync(
    path.join(__dirname, '..', 'dist', 'main.user.js'),
    path.join(__dirname, '..', 'main.user.js')
  );
  
  // Commit and push the changes
  execSync('git add main.user.js');
  execSync(`git commit -m "Update distribution version ${new Date().toISOString()}"`);
  execSync('git push -u origin gh-pages');
  
  // Switch back to original branch
  const originalBranch = execSync('git stash list').toString().includes('develop') ? 'develop' : 'main';
  execSync(`git checkout ${originalBranch}`);
  
  // Restore stashed changes if any
  if (execSync('git stash list').toString().trim() !== '') {
    execSync('git stash pop', { stdio: 'ignore' });
  }
  
} catch (error) {
  console.error('Error updating gh-pages branch:', error);
  console.log('Attempting to switch back to original branch...');
  
  try {
    execSync('git checkout develop || git checkout main');
  } catch (e) {
    console.error('Failed to switch back to original branch:', e);
  }
  
  process.exit(1);
}

console.log('✅ Publication complete!');
console.log('The script is now available at: https://juanhopla.github.io/FB-Chat-Monitor/main.user.js');
