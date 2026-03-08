import * as fs from 'fs';
import * as path from 'path';
import { createConfigContent, createEnvExample } from '../../utils/config';
import {
  askQuestion,
  askConfirm,
  askSelect,
  isInteractive,
} from '../../utils/prompt';
import type { InitOptions } from '../../types';
import { setupCommand } from './setup';

function parseArgs(args: string[]): InitOptions {
  const options: InitOptions = { format: 'ts' };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--format' || arg === '-f') {
      const value = args[++i];
      if (value === 'ts' || value === 'js' || value === 'json') {
        options.format = value as 'ts' | 'js' | 'json';
      }
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--supabase-url') {
      options.supabaseUrl = args[++i];
    } else if (arg === '--service-key') {
      options.serviceKey = args[++i];
    } else if (arg === '--skip-migrations') {
      options.skipMigrations = true;
    } else if (arg === '--skip-functions') {
      options.skipFunctions = true;
    } else if (arg === '--skip-config') {
      options.skipConfig = true;
    } else if (arg === '--skip-link') {
      options.skipLink = true;
    } else if (arg === '--skip-deploy') {
      options.skipDeploy = true;
    } else if (arg === '--config-only') {
      options.configOnly = true;
    }
  }

  return options;
}

/**
 * Run interactive prompts when no flags are provided and stdin is TTY.
 */
async function runInteractiveInit(): Promise<void> {
  console.log('\nSupabase Expo OTA Updates Setup\n');

  const supabaseUrl = await askQuestion(
    'Supabase project URL',
    process.env.SUPABASE_URL
  );

  if (!supabaseUrl) {
    console.error('Supabase URL is required.');
    process.exit(1);
  }

  const serviceKey = await askQuestion(
    'Service role key (optional, Enter to skip)',
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const channel = await askQuestion('Default channel', 'PRODUCTION');

  const formatChoice = await askSelect(
    'Config format:',
    ['TypeScript', 'JavaScript', 'JSON'],
    0
  );
  const formatMap: Record<string, 'ts' | 'js' | 'json'> = {
    TypeScript: 'ts',
    JavaScript: 'js',
    JSON: 'json',
  };
  const format = formatMap[formatChoice] ?? 'ts';

  const shouldDeploy = await askConfirm('Deploy to Supabase now?', true);

  console.log('');

  // Build setup args from interactive answers
  const setupArgs: string[] = [];
  setupArgs.push('--format', format);
  setupArgs.push('--supabase-url', supabaseUrl);
  if (serviceKey) {
    setupArgs.push('--service-key', serviceKey);
  }
  if (shouldDeploy) {
    setupArgs.push('--deploy');
  }

  // Set env vars for config generation
  if (channel) {
    process.env.EXPO_PUBLIC_ENV = channel.toUpperCase();
  }

  await setupCommand(setupArgs);
}

function runConfigOnlyInit(options: InitOptions): void {
  const extension = options.format;
  const configFileName = `supabase-ota.config.${extension}`;
  const configPath = path.resolve(process.cwd(), configFileName);
  const envPath = path.resolve(process.cwd(), '.env.example');

  // Check if config already exists
  if (fs.existsSync(configPath) && !options.force) {
    console.error(`Config file already exists: ${configFileName}`);
    console.error('Use --force to overwrite');
    process.exit(1);
  }

  // Create config file
  const configContent = createConfigContent(options.format ?? 'ts');
  fs.writeFileSync(configPath, configContent, 'utf-8');
  console.log(`✓ Created ${configFileName}`);

  // Create .env.example if it doesn't exist
  if (!fs.existsSync(envPath)) {
    const envContent = createEnvExample();
    fs.writeFileSync(envPath, envContent, 'utf-8');
    console.log('✓ Created .env.example');
  }

  console.log('\nNext steps:');
  console.log('1. Copy .env.example to .env and fill in your values');
  console.log(`2. Edit ${configFileName} to match your project setup`);
  console.log('3. Run `npx supabase-expo-ota-updates doctor` to validate');
}

export async function initCommand(args: string[]): Promise<void> {
  const options = parseArgs(args);

  // Keep backward compatibility for users who only want config scaffolding.
  const useConfigOnlyMode =
    options.configOnly || args.includes('--format') || args.includes('-f');

  if (useConfigOnlyMode) {
    runConfigOnlyInit(options);
    return;
  }

  // If no flags provided and stdin is interactive, use interactive prompts
  const hasFlags =
    options.supabaseUrl ||
    options.serviceKey ||
    options.skipMigrations ||
    options.skipFunctions ||
    options.skipConfig ||
    options.skipLink ||
    options.skipDeploy;

  if (!hasFlags && isInteractive()) {
    await runInteractiveInit();
    return;
  }

  console.log('Running init (setup + deploy in one command)\n');

  const setupArgs: string[] = ['--deploy'];

  if (options.supabaseUrl) {
    setupArgs.push('--supabase-url', options.supabaseUrl);
  }
  if (options.serviceKey) {
    setupArgs.push('--service-key', options.serviceKey);
  }
  if (options.force) {
    setupArgs.push('--force');
  }
  if (options.skipMigrations) {
    setupArgs.push('--skip-migrations');
  }
  if (options.skipFunctions) {
    setupArgs.push('--skip-functions');
  }
  if (options.skipConfig) {
    setupArgs.push('--skip-config');
  }
  if (options.skipLink) {
    setupArgs.push('--skip-link');
  }
  if (options.skipDeploy) {
    setupArgs.push('--skip-deploy');
  }

  await setupCommand(setupArgs);
}
