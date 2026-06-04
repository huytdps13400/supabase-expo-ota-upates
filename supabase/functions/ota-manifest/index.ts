import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createManifestHandler } from '../_shared/manifest.ts';

// Generic manifest endpoint — channel comes from the expo-channel-name header.
// To restrict accepted channels, pass `allowedChannels: new Set([...])`.
serve(createManifestHandler());
