import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';
import dts from 'rollup-plugin-dts';

const external = [
  '@anthropic-ai/sdk',
  '@supabase/supabase-js', 
  'pdf-lib',
  'pdf-parse',
  'uuid',
  'voyageai',
  'next/server',
  'crypto',
  'fs',
  'path'
];

export default [
  // Build ES modules
  {
    input: {
      'index': 'src/lib/index.ts',
      'lib/index': 'src/lib/index.ts',
      'api/index': 'src/api/index.ts'
    },
    output: [
      {
        dir: 'dist',
        format: 'es',
        entryFileNames: '[name].mjs',
        preserveModules: false,
        exports: 'named'
      },
      {
        dir: 'dist', 
        format: 'cjs',
        entryFileNames: '[name].js',
        preserveModules: false,
        exports: 'named'
      }
    ],
    external,
    plugins: [
      resolve({
        preferBuiltins: true,
        browser: false
      }),
      commonjs(),
      json(),
      typescript({
        tsconfig: './tsconfig.lib.json',
        declaration: false,
        outDir: 'dist'
      })
    ]
  },
  // Build type definitions
  {
    input: {
      'index': 'src/lib/index.ts',
      'lib/index': 'src/lib/index.ts', 
      'api/index': 'src/api/index.ts'
    },
    output: {
      dir: 'dist',
      format: 'es'
    },
    external,
    plugins: [
      dts({
        tsconfig: './tsconfig.lib.json'
      })
    ]
  }
]; 