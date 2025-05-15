import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import { babel } from '@rollup/plugin-babel';
import { terser } from 'rollup-plugin-terser';
import replace from '@rollup/plugin-replace';

// Load environment variables
const production = process.env.NODE_ENV === 'production';

export default {
  input: 'src/index.js',
  output: {
    file: production ? 'dist/main.user.js' : 'dist/dev.user.js',
    format: 'iife',
    name: 'FBChatMonitor',
    sourcemap: !production,
    generatedCode: 'es2015',
    strict: false,
    // Add this option to prevent code-splitting
    inlineDynamicImports: true
  },
  plugins: [
    resolve({
      browser: true,
      preferBuiltins: false,
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.json']
    }),
    commonjs({
      transformMixedEsModules: true,
      include: 'node_modules/**'
    }),
    json(),
    babel({
      babelHelpers: 'runtime', // Changed from 'bundled' to 'runtime'
      exclude: 'node_modules/**',
      presets: [
        ['@babel/preset-env', {
          targets: {
            browsers: ['last 2 versions', 'not dead']
          },
          useBuiltIns: 'usage',
          corejs: 3,
          modules: false
        }]
      ],
      plugins: [
        '@babel/plugin-transform-runtime'
      ]
    }),
    replace({
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
      preventAssignment: true
    }),
    production && terser({
      compress: {
        conditionals: true,
        dead_code: true,
        drop_console: false,
        drop_debugger: true,
        keep_fnames: /^async/
      },
      mangle: {
        keep_fnames: true
      },
      format: {
        comments: /@preserve|@license|@cc_on|\/\/ ==UserScript==/
      }
    })
  ].filter(Boolean),
  onwarn(warning, warn) {
    if (warning.code === 'CIRCULAR_DEPENDENCY') return;
    if (warning.code === 'EVAL') return;
    warn(warning);
  }
};
