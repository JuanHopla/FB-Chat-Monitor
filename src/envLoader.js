/**
 * Environment variable loader utility
 * Provides a simple way to load environment variables
 */

/**
 * Loads environment variables from localStorage
 * @returns {Object} - Object containing environment variables
 */
export function loadEnv() {
  try {
    const envData = localStorage.getItem('FB_CHAT_MONITOR_ENV');
    return envData ? JSON.parse(envData) : {};
  } catch (err) {
    console.error('Error loading environment variables:', err);
    return {};
  }
}

/**
 * Saves environment variables to localStorage
 * @param {Object} env - Environment variables to save
 * @returns {boolean} - Success status
 */
export function saveEnv(env) {
  try {
    localStorage.setItem('FB_CHAT_MONITOR_ENV', JSON.stringify(env));
    return true;
  } catch (err) {
    console.error('Error saving environment variables:', err);
    return false;
  }
}
