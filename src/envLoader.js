/**
 * Environment variables loader for Tampermonkey script
 * This module provides functionality to load environment variables
 * either from browser storage or from a default configuration
 */

import { logInfo, logError } from './utils.js';

// Default environment values (used if no stored values are found)
const DEFAULT_ENV = {
  OPENAI_API_KEY: '',
  AI_MODEL: 'gpt-3.5-turbo',
  AI_TEMPERATURE: 0.7,
  AI_MAX_TOKENS: 150,
  AI_ENDPOINT: 'https://api.openai.com/v1/chat/completions',
  DEBUG_MODE: false,
  LOG_LEVEL: 'INFO'
};

// Storage key for environment variables in browser storage
const ENV_STORAGE_KEY = 'FB_CHAT_MONITOR_ENV';

/**
 * Load environment variables from storage
 * @returns {Object} Environment variables
 */
export function loadEnv() {
  try {
    // Try to load from localStorage
    const storedEnv = localStorage.getItem(ENV_STORAGE_KEY);
    if (storedEnv) {
      const parsedEnv = JSON.parse(storedEnv);
      logInfo('Environment variables loaded from storage');
      return { ...DEFAULT_ENV, ...parsedEnv };
    }
  } catch (error) {
    logError(`Error loading environment variables: ${error.message}`);
  }
  
  logInfo('Using default environment variables');
  return { ...DEFAULT_ENV };
}

/**
 * Save environment variables to storage
 * @param {Object} env - Environment variables to save
 * @returns {Boolean} True if saved successfully
 */
export function saveEnv(env) {
  try {
    const envToSave = { ...env };
    localStorage.setItem(ENV_STORAGE_KEY, JSON.stringify(envToSave));
    logInfo('Environment variables saved to storage');
    return true;
  } catch (error) {
    logError(`Error saving environment variables: ${error.message}`);
    return false;
  }
}

/**
 * Update a specific environment variable
 * @param {String} key - Environment variable key
 * @param {*} value - New value
 * @returns {Boolean} True if updated successfully
 */
export function updateEnvVar(key, value) {
  try {
    const currentEnv = loadEnv();
    currentEnv[key] = value;
    return saveEnv(currentEnv);
  } catch (error) {
    logError(`Error updating environment variable ${key}: ${error.message}`);
    return false;
  }
}

/**
 * Get a specific environment variable
 * @param {String} key - Environment variable key
 * @param {*} defaultValue - Default value if not found
 * @returns {*} The environment variable value or default
 */
export function getEnvVar(key, defaultValue = null) {
  const env = loadEnv();
  return env[key] !== undefined ? env[key] : defaultValue;
}
