import {
  loadConfig,
  getSupabaseUrl,
  getDefaultChannel,
  getBucket,
  deriveRuntimeVersion,
} from '../../utils/config';
import type { InfoOptions, Platform } from '../../types';

function parseArgs(args: string[]): InfoOptions {
  const options: InfoOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--platform') {
      const value = args[++i];
      if (value === 'ios' || value === 'android') {
        options.platform = value;
      }
    } else if (arg === '--config') {
      options.config = args[++i];
    }
  }

  return options;
}

export async function infoCommand(args: string[]): Promise<void> {
  const options = parseArgs(args);
  const config = await loadConfig(options.config);

  const supabaseUrl = getSupabaseUrl(config ?? undefined);
  const channel = getDefaultChannel(config ?? undefined);
  const bucket = getBucket(config ?? undefined);

  console.log('Supabase OTA Configuration\n');

  // Supabase info
  console.log('Supabase:');
  if (supabaseUrl) {
    console.log(`  URL: ${supabaseUrl}`);
    console.log(`  OTA URL: ${supabaseUrl}/functions/v1/ota-manifest`);
  } else {
    console.log('  URL: Not configured');
  }

  // Storage info
  console.log('\nStorage:');
  console.log(`  Bucket: ${bucket}`);

  // Channel info
  console.log('\nChannel:');
  if (channel) {
    console.log(`  Default: ${channel}`);
  } else {
    console.log('  Default: Not set (use EXPO_PUBLIC_ENV or config.channel)');
  }

  // Runtime versions
  console.log('\nRuntime Versions:');

  const platforms: Platform[] = options.platform
    ? [options.platform]
    : ['ios', 'android'];

  for (const platform of platforms) {
    const runtimeVersion = deriveRuntimeVersion(
      platform,
      undefined,
      config ?? undefined
    );
    if (runtimeVersion) {
      console.log(`  ${platform}: ${runtimeVersion}`);
    } else {
      const buildVar =
        platform === 'ios' ? 'IOS_BUILD_NUMBER' : 'ANDROID_BUILD_NUMBER';
      console.log(
        `  ${platform}: Not derivable (needs VERSION_NUMBER and ${buildVar})`
      );
    }
  }

  // Config file
  console.log('\nConfig:');
  if (config) {
    console.log(`  Loaded: Yes`);
    if (config.runtimeVersionPolicy) {
      console.log(`  Runtime Version Policy: ${config.runtimeVersionPolicy}`);
    }
  } else {
    console.log(`  Loaded: No (using environment variables only)`);
  }

  // Storage path example
  console.log('\nExample Storage Path:');
  const examplePlatform: Platform = options.platform ?? 'ios';
  const exampleRuntime =
    deriveRuntimeVersion(examplePlatform, undefined, config ?? undefined) ??
    '1.0.0(1)';
  const exampleChannel = channel ?? 'DEV';
  const exampleTimestamp = `${Math.floor(Date.now() / 1000)}`;
  console.log(
    `  ${exampleChannel}/${examplePlatform}/${exampleRuntime}/${exampleTimestamp}/bundles/main.jsbundle`
  );
}
