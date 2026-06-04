// Self-hosted web console for managing OTA updates.
//
// One edge function serves both a small single-page UI (GET) and a JSON API
// (POST) guarded by a shared secret. The Supabase service key never leaves the
// server: the browser only ever holds the console secret the operator types in.
//
// Configure the secret as an edge-function secret:
//   supabase secrets set OTA_CONSOLE_SECRET=$(openssl rand -hex 24)
//
// Then open https://<project>.functions.supabase.co/ota-console

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const CONSOLE_SECRET = Deno.env.get('OTA_CONSOLE_SECRET');

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function authorized(token: unknown): boolean {
  // When no secret is configured the console is disabled (fail closed).
  if (!CONSOLE_SECRET) return false;
  return typeof token === 'string' && token === CONSOLE_SECRET;
}

async function handleApi(body: Record<string, unknown>): Promise<Response> {
  if (!authorized(body.token)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const action = body.action;

  if (action === 'list') {
    let query = supabase
      .from('ota_updates')
      .select(
        'id, created_at, channel, platform, runtime_version, is_active, is_mandatory, rollout_percentage, message, app_version, target_app_version'
      )
      .order('created_at', { ascending: false })
      .limit(Number(body.limit ?? 100));

    if (body.channel) query = query.eq('channel', body.channel);
    if (body.platform) query = query.eq('platform', body.platform);
    if (body.activeOnly === true) query = query.eq('is_active', true);

    const { data, error } = await query;
    if (error) return json({ error: error.message }, 500);
    return json({ updates: data ?? [] });
  }

  if (action === 'setActive') {
    const id = body.id;
    if (typeof id !== 'string') return json({ error: 'Missing id' }, 400);
    const { error } = await supabase
      .from('ota_updates')
      .update({ is_active: body.isActive === true })
      .eq('id', id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  if (action === 'stats') {
    const id = body.id;
    if (typeof id !== 'string') return json({ error: 'Missing id' }, 400);
    const { data, error } = await supabase.rpc('get_update_stats', {
      p_update_id: id,
    });
    if (error) return json({ error: error.message }, 500);
    return json({ stats: data?.[0] ?? null });
  }

  return json({ error: `Unknown action: ${action}` }, 400);
}

serve(async (req) => {
  if (req.method === 'POST') {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }
    return handleApi(body);
  }

  if (req.method === 'GET') {
    return new Response(HTML, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  return new Response('Method Not Allowed', { status: 405 });
});

const HTML = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>OTA Console</title>
<style>
  :root { color-scheme: light dark; --b: #2f6fed; }
  * { box-sizing: border-box; }
  body { font: 14px/1.5 system-ui, sans-serif; margin: 0; padding: 24px; }
  h1 { font-size: 18px; margin: 0 0 16px; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 16px; }
  input, select, button { font: inherit; padding: 6px 10px; border-radius: 6px; border: 1px solid #8884; background: transparent; color: inherit; }
  button { cursor: pointer; }
  button.primary { background: var(--b); color: #fff; border-color: var(--b); }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #8883; vertical-align: top; }
  th { font-weight: 600; white-space: nowrap; }
  .pill { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 12px; }
  .on { background: #1a7f3722; color: #1a7f37; }
  .off { background: #8881; color: #888; }
  .muted { color: #888; }
  .err { color: #d33; margin: 8px 0; }
  code { font-size: 12px; }
</style>
</head>
<body>
<h1>OTA Console</h1>

<div id="login" class="row">
  <input id="token" type="password" placeholder="Console secret" style="min-width:260px" />
  <button class="primary" onclick="saveToken()">Sign in</button>
</div>

<div id="app" hidden>
  <div class="row">
    <select id="platform">
      <option value="">All platforms</option>
      <option value="ios">iOS</option>
      <option value="android">Android</option>
    </select>
    <input id="channel" placeholder="Channel (e.g. PRODUCTION)" />
    <label><input id="activeOnly" type="checkbox" /> Active only</label>
    <button onclick="load()">Refresh</button>
    <button onclick="signOut()">Sign out</button>
  </div>
  <div id="err" class="err"></div>
  <table>
    <thead>
      <tr><th>Created</th><th>Platform</th><th>Runtime</th><th>Channel</th>
      <th>Active</th><th>Forced</th><th>Rollout</th><th>Message</th><th></th></tr>
    </thead>
    <tbody id="rows"></tbody>
  </table>
</div>

<script>
const $ = (id) => document.getElementById(id);
let token = sessionStorage.getItem('ota_token') || '';

function saveToken() {
  token = $('token').value.trim();
  sessionStorage.setItem('ota_token', token);
  showApp();
  load();
}
function signOut() {
  token = '';
  sessionStorage.removeItem('ota_token');
  $('app').hidden = true;
  $('login').hidden = false;
}
function showApp() {
  $('login').hidden = true;
  $('app').hidden = false;
}

async function api(payload) {
  const res = await fetch(location.pathname, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, ...payload }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
  return data;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

async function load() {
  $('err').textContent = '';
  try {
    const { updates } = await api({
      action: 'list',
      platform: $('platform').value || undefined,
      channel: $('channel').value.trim().toUpperCase() || undefined,
      activeOnly: $('activeOnly').checked,
    });
    render(updates);
  } catch (e) {
    if (String(e.message).includes('Unauthorized')) { signOut(); return; }
    $('err').textContent = e.message;
  }
}

function render(updates) {
  $('rows').innerHTML = updates.map((u) => {
    const created = new Date(u.created_at).toLocaleString();
    const active = u.is_active
      ? '<span class="pill on">active</span>'
      : '<span class="pill off">inactive</span>';
    const btn = u.is_active
      ? '<button onclick="toggle(\\'' + u.id + '\\', false)">Deactivate</button>'
      : '<button class="primary" onclick="toggle(\\'' + u.id + '\\', true)">Activate</button>';
    return '<tr>' +
      '<td class="muted">' + esc(created) + '</td>' +
      '<td>' + esc(u.platform) + '</td>' +
      '<td>' + esc(u.runtime_version) + '</td>' +
      '<td>' + esc(u.channel) + '</td>' +
      '<td>' + active + '</td>' +
      '<td>' + (u.is_mandatory ? 'yes' : '') + '</td>' +
      '<td>' + (u.rollout_percentage ?? 100) + '%</td>' +
      '<td>' + esc(u.message || '') + '</td>' +
      '<td>' + btn + '</td>' +
    '</tr>';
  }).join('') || '<tr><td colspan="9" class="muted">No updates</td></tr>';
}

async function toggle(id, isActive) {
  $('err').textContent = '';
  try {
    await api({ action: 'setActive', id, isActive });
    load();
  } catch (e) { $('err').textContent = e.message; }
}

if (token) { showApp(); load(); }
</script>
</body>
</html>`;
