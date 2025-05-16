const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Starting publication process...');

// Store the original branch name at the start
let originalBranch;
let stashCreated = false;

try {
  originalBranch = execSync('git branch --show-current').toString().trim();
  console.log(`Currently on branch: ${originalBranch}`);
} catch (error) {
  console.error('Error checking git branch:', error);
  process.exit(1);
}

// Helper function to safely return to the original branch
function returnToOriginalBranch() {
  console.log(`Returning to original branch: ${originalBranch}...`);
  try {
    execSync(`git checkout ${originalBranch}`);
    
    // Only try to restore stash if we created one
    if (stashCreated) {
      try {
        console.log('Restoring stashed changes...');
        execSync('git stash pop');
      } catch (stashErr) {
        console.warn('Failed to restore stashed changes:', stashErr.message);
      }
    }
  } catch (checkoutErr) {
    console.error(`Failed to return to ${originalBranch}:`, checkoutErr.message);
  }
}

// Run the optimized build first
console.log('Building optimized version...');
try {
  execSync('npm run build-optimized', { stdio: 'inherit' });
  console.log('Build completed successfully');
} catch (error) {
  console.error('Build failed:', error);
  process.exit(1);
}

// Update the gh-pages branch
console.log('Updating gh-pages branch...');
try {
  // Check if there are pending changes before stashing
  const status = execSync('git status --porcelain').toString().trim();
  
  if (status) {
    console.log('Stashing pending changes...');
    execSync('git stash');
    stashCreated = true;
  } else {
    console.log('No changes to stash');
  }
  
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
  
  // Ensure the dist directory exists before copying
  const distPath = path.join(__dirname, '..', 'dist');
  const mainScriptPath = path.join(distPath, 'main.user.js');
  
  if (!fs.existsSync(mainScriptPath)) {
    throw new Error(`Build file not found at ${mainScriptPath}`);
  }
  
  // Copy the built file
  fs.copyFileSync(
    mainScriptPath,
    path.join(__dirname, '..', 'main.user.js')
  );
  
  // Commit and push the changes
  execSync('git add main.user.js');
  execSync(`git commit -m "Update distribution version ${new Date().toISOString()}"`);
  
  try {
    console.log('Pushing changes to gh-pages branch...');
    execSync('git push -u origin gh-pages');
  } catch (pushError) {
    console.error('Failed to push to gh-pages:', pushError.message);
    // Don't exit here, still try to return to original branch
    throw pushError; // Re-throw to be caught by the outer catch
  }
  
  // Successfully completed gh-pages update, return to original branch
  returnToOriginalBranch();
  
} catch (error) {
  console.error('Error in publication process:', error.message);
  
  // Always attempt to return to the original branch
  returnToOriginalBranch();
  
  process.exit(1);
}

console.log('✅ Publication complete!');
console.log('The script is now available at: https://juanhopla.github.io/FB-Chat-Monitor/main.user.js');