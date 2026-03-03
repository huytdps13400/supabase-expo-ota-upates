import {
  loadConfig,
  findConfigFile,
  getSupabaseUrl,
  getDefaultChannel,
  deriveRuntimeVersion,
  validatePublishEnv,
} from '../../utils/config';
import { testManifestEndpoint } from '../../utils/supabase';
import type { DoctorOptions, Platform } from '../../types';

function parseArgs(args: string[]): DoctorOptions {
  const options: DoctorOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--config') {
      options.config = args[++i];
    } else if (arg === '--test-manifest') {
      options.testManifest = true;
    }
  }

  return options;
}

export async function doctorCommand(args: string[]): Promise<void> {
  const options = parseArgs(args);
  const config = await loadConfig(options.config);

  console.log('Running diagnostics...\n');

  let issues = 0;
  let checks = 0;

  // Check config file
  checks++;
  const configPath = options.config ?? findConfigFile();
  if (configPath) {
    console.log(`✓ Config file found: ${configPath}`);
  } else {
    console.log(`⚠ No config file found (supabase-ota.config.ts|js|json)`);
    console.log('  Run `npx supabase-expo-ota-updates init` to create one');
    issues++;
  }

  // Check required env vars
  checks++;
  const envCheck = validatePublishEnv(config ?? undefined);
  if (envCheck.valid) {
    console.log('✓ Required environment variables set');
  } else {
    console.log('✗ Missing environment variables:');
    envCheck.missing.forEach((v) => console.log(`    - ${v}`));
    issues++;
  }

  // Check Supabase URL
  checks++;
  const supabaseUrl = getSupabaseUrl(config ?? undefined);
  if (supabaseUrl) {
    console.log(`✓ Supabase URL: ${supabaseUrl}`);
  } else {
    console.log('✗ Could not determine Supabase URL');
    issues++;
  }

  // Check channel
  checks++;
  const channel = getDefaultChannel(config ?? undefined);
  if (channel) {
    console.log(`✓ Default channel: ${channel}`);
  } else {
    console.log(
      '⚠ No default channel (set EXPO_PUBLIC_ENV or channel in config)'
    );
    issues++;
  }

  // Check runtime version derivation
  checks++;
  const iosRuntime = deriveRuntimeVersion(
    'ios',
    undefined,
    config ?? undefined
  );
  const androidRuntime = deriveRuntimeVersion(
    'android',
    undefined,
    config ?? undefined
  );

  if (iosRuntime) {
    console.log(`✓ iOS runtime version: ${iosRuntime}`);
  } else {
    console.log(
      '⚠ Could not derive iOS runtime version (set VERSION_NUMBER and IOS_BUILD_NUMBER)'
    );
  }

  if (androidRuntime) {
    console.log(`✓ Android runtime version: ${androidRuntime}`);
  } else {
    console.log(
      '⚠ Could not derive Android runtime version (set VERSION_NUMBER and ANDROID_BUILD_NUMBER)'
    );
  }

  // Test manifest endpoint if requested
  if (options.testManifest && supabaseUrl && channel) {
    checks++;
    console.log('\nTesting manifest endpoint...');

    const testPlatform: Platform = iosRuntime ? 'ios' : 'android';
    const testRuntime = iosRuntime ?? androidRuntime ?? '1.0.0(1)';
    const otaUrl = `${supabaseUrl}/functions/v1/ota-manifest`;

    const result = await testManifestEndpoint(
      otaUrl,
      testPlatform,
      testRuntime,
      channel
    );

    if (result.success) {
      console.log(`✓ Manifest endpoint responded (${result.status})`);
    } else {
      console.log(
        `✗ Manifest endpoint failed: ${result.error ?? `HTTP ${result.status}`}`
      );
      issues++;
    }
  }

  // Summary
  console.log(`\n${checks} checks completed, ${issues} issues found`);

  if (issues > 0) {
    console.log('\nFix the issues above before running publish.');
    process.exit(1);
  } else {
    console.log('\n✅ All checks passed!');
  }
}
