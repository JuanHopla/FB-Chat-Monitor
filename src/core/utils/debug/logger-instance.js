import { StructuredLogger } from './StructuredLogger.js';
import LogManager from './LegacyLogger.js';
import { showSimpleAlert } from '../../../shared/utils/notify.js';

// Crea instancia de loggers
const structured = new StructuredLogger();
const legacy = new LogManager();

// API unificada: prioriza structured para fases; legacy para compat
const logger = {
  // Fases modernas
  startCycle: (...a) => structured.startCycle?.(...a),
  startPhase: (...a) => structured.startPhase?.(...a),
  sub: (...a) => structured.sub?.(...a),
  endPhase: (...a) => structured.endPhase?.(...a),
  endCycle: (...a) => structured.endCycle?.(...a),
  flushCycle: (...a) => structured.flushCycle?.(...a),
  resolvePhase: (...a) => structured.resolvePhase?.(...a),

  // Compat procesos legacy
  process: (...a) => legacy.phase?.(...a),
  substep: (...a) => legacy.step?.(...a),

  // Niveles básicos
  log: (m,d={}) => { if (window.CONFIG?.debug) { console.debug('[FB-Chat-Monitor]', m, Object.keys(d).length?d:''); } },
  debug: (m,d={}) => { if (window.CONFIG?.debug) console.debug('[FB-Chat-Monitor][DEBUG]', m, Object.keys(d).length?d:''); },
  warn: (m,d={}) => { console.warn('[FB-Chat-Monitor][WARN]', m, Object.keys(d).length?d:''); },
  error: (m,d={},e=null) => { console.error('[FB-Chat-Monitor][ERROR]', m, Object.keys(d).length?d:'', e||''); },

  notify: (msg,type='info',opts={}) => { try { return showSimpleAlert(msg,type,opts); } catch { console.log(`[FB-Chat-Monitor][${type.toUpperCase()}] ${msg}`); } },

  setLogLevel: (level) => { legacy.setLogLevel?.(level); if(level==='debug'){ window.CONFIG=window.CONFIG||{}; window.CONFIG.debug=true;} return level; },
  // Panel de Logs - compat
  getAllLogs: () => (legacy && Array.isArray(legacy._logs)) ? legacy._logs.map(l => ({
    timestamp: l.ts,
    type: l.level?.toUpperCase?.() || 'INFO',
    message: l.message
  })) : [],
  clearLogs: () => { if (legacy && Array.isArray(legacy._logs)) legacy._logs.length = 0; }
};

export default logger;
