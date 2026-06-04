import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createManifestHandler } from '../_shared/manifest.ts';

// Channel-pinned STAGING endpoint. Shares all logic with the generic handler.
serve(createManifestHandler({ fixedChannel: 'STAGING' }));
