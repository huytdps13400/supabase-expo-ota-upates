#!/usr/bin/env node

import { initCommand } from './commands/init';
import { publishCommand } from './commands/publish';
import { cleanupCommand } from './commands/cleanup';
import { cronCommand } from './commands/cron';
import { doctorCommand } from './commands/doctor';
import { infoCommand } from './commands/info';
import { setupCommand } from './commands/setup';

const argv = process.argv.slice(2);
const command = argv[0];

function showHelp(): void {
  console.log(`
supabase-expo-ota-updates CLI

Usage: npx supabase-expo-ota-updates <command> [options]

Commands:
  init      One-command bootstrap (setup + deploy)
  setup     Scaffold Supabase infrastructure (DB, storage, edge functions)
  publish   Build and publish OTA update
  cleanup   Remove old OTA updates
  cron      Output SQL for scheduled cleanup
  doctor    Validate configuration
  info      Show current configuration

Global Options:
  --config <path>     Path to config file
  --platform <name>   Target platform (ios|android)
  --channel <name>    Channel (any valid name)
  --dry-run           Simulate without making changes
  --help              Show this help

Publish Options:
  --force-update, -f  Make this a mandatory update
  --rollout <0-100>   Percentage of devices to receive update (default: 100)
  --message, -m       Update message/changelog
  --app-version       App version for semver matching

Examples:
  npx supabase-expo-ota-updates init --supabase-url https://<id>.supabase.co
  npx supabase-expo-ota-updates init --config-only --format ts
  npx supabase-expo-ota-updates setup --supabase-url https://<id>.supabase.co --deploy
  npx supabase-expo-ota-updates publish --platform ios --channel DEV
  npx supabase-expo-ota-updates publish --platform ios --channel PROD -f --rollout 50
  npx supabase-expo-ota-updates doctor
`);
}

async function main(): Promise<void> {
  if (!command || command === '--help' || command === '-h') {
    showHelp();
    process.exit(0);
  }

  try {
    switch (command) {
      case 'init':
        await initCommand(argv.slice(1));
        break;
      case 'publish':
        await publishCommand(argv.slice(1));
        break;
      case 'cleanup':
        await cleanupCommand(argv.slice(1));
        break;
      case 'cron':
        await cronCommand(argv.slice(1));
        break;
      case 'doctor':
        await doctorCommand(argv.slice(1));
        break;
      case 'info':
        await infoCommand(argv.slice(1));
        break;
      case 'setup':
        await setupCommand(argv.slice(1));
        break;
      default:
        console.error(`Unknown command: ${command}`);
        showHelp();
        process.exit(1);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
