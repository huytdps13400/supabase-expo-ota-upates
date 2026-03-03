#!/usr/bin/env node

// CLI entry point for supabase-expo-ota-updates
// This file is kept as JavaScript for direct Node.js execution

const fs = require('fs');
const path = require('path');

// Determine if we're running from source or compiled
const isCompiled = fs.existsSync(
  path.join(__dirname, '..', 'lib', 'module', 'src', 'cli', 'index.js')
);
const cliPath = isCompiled
  ? path.join(__dirname, '..', 'lib', 'module', 'src', 'cli', 'index.js')
  : path.join(__dirname, '..', 'src', 'cli', 'index.ts');

if (isCompiled) {
  // Run compiled version
  require(cliPath);
} else {
  // Run with ts-node for development
  try {
    require('ts-node/register');
    require(cliPath);
  } catch {
    console.error('Error: ts-node is required for running from source.');
    console.error('Install with: npm install -D ts-node');
    console.error('Or build first: npm run build');
    process.exit(1);
  }
}
