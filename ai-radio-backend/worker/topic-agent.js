#!/usr/bin/env node

/**
 * Topic Research Agent
 *
 * Runs an HTTP server that accepts webhook calls to process topic suggestions.
 * Uses Claude CLI to research RSS feeds and build a topic configuration,
 * then inserts the new topic into the `topics` table and marks the request complete.
 *
 * Environment variables:
 *   SUPABASE_URL          - Supabase project REST URL (e.g. https://xyz.supabase.co)
 *   SUPABASE_SERVICE_KEY  - Supabase service-role key (bypasses RLS)
 *   WEBHOOK_SECRET        - Shared secret for authenticating webhook calls
 *   WEBHOOK_PORT          - Port for the HTTP server (default: 3457)
 *   CLAUDE_PATH           - Path to Claude CLI binary (default: /usr/bin/claude)
 */

const { execFile } = require('child_process');
const https = require('https');
const http = require('http');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const WEBHOOK_PORT = parseInt(process.env.WEBHOOK_PORT, 10) || 3457;
const CLAUDE_PATH = process.env.CLAUDE_PATH || '/usr/bin/claude';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('[topic-agent] FATAL: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
  process.exit(1);
}
if (!WEBHOOK_SECRET) {
  console.error('[topic-agent] FATAL: WEBHOOK_SECRET must be set');
  process.exit(1);
}

const SUPABASE_REST = `${SUPABASE_URL}/rest/v1`;

// ---------------------------------------------------------------------------
// HTTP helper (works with both http and https, returns parsed JSON)
// ---------------------------------------------------------------------------

function request(method, url, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const headers = {
      'Content-Type': 'application/json',
      ...extraHeaders,
    };
    if (body) {
      headers['Content-Length'] = Buffer.byteLength(JSON.stringify(body));
    }
    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method,
        headers,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null, raw: data });
          } catch {
            resolve({ status: res.statusCode, data: null, raw: data });
          }
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Supabase REST helper
function supabaseRequest(method, path, body, extraHeaders = {}) {
  const url = `${SUPABASE_REST}${path}`;
  return request(method, url, body, {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    Prefer: method === 'POST' ? 'return=representation' : 'return=representation',
    ...extraHeaders,
  });
}

// ---------------------------------------------------------------------------
// Supabase operations
// ---------------------------------------------------------------------------

async function fetchRequestById(requestId) {
  const res = await supabaseRequest(
    'GET',
    `/topic_requests?id=eq.${encodeURIComponent(requestId)}&limit=1`,
    null
  );
  if (res.status !== 200 || !Array.isArray(res.data) || res.data.length === 0) {
    return null;
  }
  return res.data[0];
}

async function updateRequestStatus(id, status, extra = {}) {
  const body = { status, ...extra };
  const res = await supabaseRequest('PATCH', `/topic_requests?id=eq.${id}`, body);
  if (res.status < 200 || res.status >= 300) {
    log('WARN', `Failed to update request ${id} to ${status}: ${res.status} ${res.raw}`);
  }
  return res;
}

async function insertTopic(topicData) {
  const res = await supabaseRequest('POST', '/topics', topicData, {
    Prefer: 'return=representation,resolution=merge-duplicates',
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Failed to insert topic: ${res.status} ${res.raw}`);
  }
  return Array.isArray(res.data) ? res.data[0] : res.data;
}

async function topicExists(topicId) {
  const res = await supabaseRequest('GET', `/topics?id=eq.${encodeURIComponent(topicId)}&select=id`, null);
  return res.status === 200 && Array.isArray(res.data) && res.data.length > 0;
}

async function fetchAllTopics() {
  const res = await supabaseRequest('GET', '/topics?select=id,name,description,category,sources,languages', null);
  if (res.status === 200 && Array.isArray(res.data)) return res.data;
  return [];
}

function findSimilarTopic(topicName, existingTopics) {
  const needle = topicName.toLowerCase().trim();
  // Exact name match
  const exact = existingTopics.find(t => t.name.toLowerCase() === needle);
  if (exact) return { topic: exact, matchType: 'exact' };
  // Substring match (e.g. "Tech News" matches "Tech News Daily")
  const partial = existingTopics.find(t =>
    t.name.toLowerCase().includes(needle) || needle.includes(t.name.toLowerCase())
  );
  if (partial) return { topic: partial, matchType: 'partial' };
  // Word overlap (>50% of words match)
  const needleWords = needle.split(/\s+/);
  for (const t of existingTopics) {
    const topicWords = t.name.toLowerCase().split(/\s+/);
    const overlap = needleWords.filter(w => topicWords.includes(w)).length;
    if (overlap > 0 && overlap >= Math.ceil(needleWords.length / 2)) {
      return { topic: t, matchType: 'similar' };
    }
  }
  return null;
}

async function mergeSourcesIntoTopic(existingTopic, newSources) {
  const existingUrls = new Set(
    (existingTopic.sources || [])
      .filter(s => s.url)
      .map(s => s.url.toLowerCase())
  );
  const toAdd = newSources.filter(s => !s.url || !existingUrls.has(s.url.toLowerCase()));
  if (toAdd.length === 0) {
    log('INFO', `No new sources to merge into "${existingTopic.id}"`);
    return { merged: false, topic: existingTopic };
  }
  const mergedSources = [...(existingTopic.sources || []), ...toAdd];
  const res = await supabaseRequest(
    'PATCH',
    `/topics?id=eq.${encodeURIComponent(existingTopic.id)}`,
    { sources: mergedSources }
  );
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Failed to merge sources: ${res.status} ${res.raw}`);
  }
  log('INFO', `Merged ${toAdd.length} new source(s) into "${existingTopic.id}" (total: ${mergedSources.length})`);
  return { merged: true, topic: existingTopic, addedCount: toAdd.length };
}

// ---------------------------------------------------------------------------
// Claude CLI interaction
// ---------------------------------------------------------------------------

function runClaude(prompt) {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const child = spawn(
      CLAUDE_PATH,
      ['--print', '--max-turns', '1', '-p', '-'],
      {
        env: { ...process.env, TERM: 'dumb' },
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 5 * 60 * 1000,
      }
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (err) => reject(new Error(`Claude CLI error: ${err.message}`)));
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Claude CLI exited with code ${code}\nstderr: ${stderr}`));
        return;
      }
      resolve(stdout.trim());
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

// ---------------------------------------------------------------------------
// Topic research prompt
// ---------------------------------------------------------------------------

function buildResearchPrompt(topicName, language, description) {
  return `You are a topic configuration researcher for Audexa, an AI radio app that generates podcast episodes from RSS feeds and other sources.

Research and create an Audexa radio topic configuration for: "${topicName}" in language "${language}".
${description ? `User description: "${description}"` : ''}

You MUST:
1. Find 2-4 reliable RSS feeds relevant to this topic. Prefer major, well-known news sources that are actively maintained.
   - For non-English topics, prefer RSS feeds in that language from reputable sources in those regions.
   - Each RSS source object must have: { "type": "rss", "name": "<source name>", "url": "<rss feed url>", "maxItems": 10 }
   - You may also include HackerNews sources: { "type": "hackernews", "name": "<name>", "keywords": ["keyword1", "keyword2"], "maxItems": 10 }
   - You may also include Reddit sources: { "type": "reddit", "name": "r/<subreddit>", "subreddit": "<subreddit>", "maxItems": 10 }

2. For each RSS feed URL, verify it is a plausible, well-known feed URL. Use feeds from major outlets (BBC, NPR, Reuters, TechCrunch, etc.) or well-known niche sources.

3. Choose a category from EXACTLY one of: news, technology, business, science, lifestyle, entertainment, sports

4. Choose an appropriate Apple SF Symbol icon name (e.g., "newspaper.fill", "brain.head.profile", "sportscourt.fill", "heart.fill", "gamecontroller.fill", "chart.line.uptrend.xyaxis", "atom", "sparkles", "globe.americas.fill", "laptopcomputer", "building.columns.fill", "music.note", "film.fill", "book.fill", "leaf.fill", "car.fill", "fork.knife", "house.fill", "paintbrush.fill", "figure.run")

5. Choose a hex color string (e.g., "#4A90E2", "#E74C3C")

6. Write a promptContext: a short instruction (1-2 sentences) telling the AI podcast host how to cover this topic. Example: "Cover AI news with technical depth but keep it accessible. Explain implications of new models and research."

7. Generate a topic ID from the name: lowercase, hyphenated, no special characters (e.g., "crypto-blockchain", "indie-music", "formula-one")

8. Set targetDurationMinutes to 4.

9. Set languages to ${language === 'en' ? '["all"]' : `["${language}"]`}.

10. If the language is not English, provide localizedNames and localizedDescriptions with the native language name and description.

OUTPUT FORMAT: Output ONLY a single JSON object (no markdown, no code fences, no explanation) matching this exact schema:
{
  "id": "topic-id-here",
  "name": "Topic Name in English",
  "description": "Short description in English",
  "icon": "sf.symbol.name",
  "color": "#HEXCOLOR",
  "category": "category",
  "sources": [ ... ],
  "prompt_context": "Instructions for the AI host...",
  "target_duration_minutes": 4,
  "is_active": true,
  "languages": ["all"],
  "localized_names": null,
  "localized_descriptions": null
}

IMPORTANT: Use snake_case keys (prompt_context, target_duration_minutes, is_active, localized_names, localized_descriptions). Output raw JSON only.`;
}

// ---------------------------------------------------------------------------
// Parse Claude output into a topic object
// ---------------------------------------------------------------------------

function parseClaudeOutput(output) {
  // Try to extract JSON from the output (Claude might wrap it in markdown)
  let jsonStr = output;

  // Strip markdown code fences if present
  const fenceMatch = output.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1];
  }

  // Try to find a JSON object in the output
  const objMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (!objMatch) {
    throw new Error('No JSON object found in Claude output');
  }

  const topic = JSON.parse(objMatch[0]);

  // Validate required fields
  const required = ['id', 'name', 'description', 'icon', 'color', 'category', 'sources', 'prompt_context'];
  for (const field of required) {
    if (!topic[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  // Validate category
  const validCategories = ['news', 'technology', 'business', 'science', 'lifestyle', 'entertainment', 'sports'];
  if (!validCategories.includes(topic.category)) {
    throw new Error(`Invalid category: ${topic.category}`);
  }

  // Validate sources
  if (!Array.isArray(topic.sources) || topic.sources.length === 0) {
    throw new Error('sources must be a non-empty array');
  }

  for (const source of topic.sources) {
    if (!source.type || !source.name) {
      throw new Error('Each source must have type and name');
    }
    if (source.type === 'rss' && !source.url) {
      throw new Error(`RSS source "${source.name}" is missing url`);
    }
  }

  // Ensure defaults
  topic.is_active = topic.is_active !== false;
  topic.target_duration_minutes = topic.target_duration_minutes || 4;
  topic.languages = topic.languages || ['all'];
  topic.localized_names = topic.localized_names || null;
  topic.localized_descriptions = topic.localized_descriptions || null;

  return topic;
}

// ---------------------------------------------------------------------------
// Process a single topic request
// ---------------------------------------------------------------------------

async function processRequest(req) {
  const { id, topic_name, language, description } = req;

  log('INFO', `Processing request ${id}: "${topic_name}" (lang=${language})`);

  // Mark as processing
  await updateRequestStatus(id, 'processing');

  try {
    // Check for existing/similar topics before doing any work
    const existingTopics = await fetchAllTopics();
    const match = findSimilarTopic(topic_name, existingTopics);

    if (match && match.matchType === 'exact') {
      log('INFO', `Exact match found: "${match.topic.name}" (${match.topic.id}). Will research and merge sources.`);
      // Still call Claude to find new sources, then merge
      const prompt = buildResearchPrompt(topic_name, language || 'en', description);
      log('INFO', `Calling Claude CLI for additional sources for "${topic_name}"...`);
      const claudeOutput = await runClaude(prompt);
      const topicData = parseClaudeOutput(claudeOutput);
      const result = await mergeSourcesIntoTopic(match.topic, topicData.sources);
      await updateRequestStatus(id, 'completed', { result_topic_id: match.topic.id });
      log('INFO', `Request ${id} completed: merged ${result.addedCount || 0} sources into existing topic "${match.topic.id}"`);
      return match.topic.id;
    }

    if (match && (match.matchType === 'partial' || match.matchType === 'similar')) {
      log('INFO', `Similar topic found: "${match.topic.name}" (${match.topic.id}), match type: ${match.matchType}. Merging sources.`);
      const prompt = buildResearchPrompt(topic_name, language || 'en', description);
      log('INFO', `Calling Claude CLI for additional sources for "${topic_name}"...`);
      const claudeOutput = await runClaude(prompt);
      const topicData = parseClaudeOutput(claudeOutput);
      const result = await mergeSourcesIntoTopic(match.topic, topicData.sources);
      await updateRequestStatus(id, 'completed', { result_topic_id: match.topic.id });
      log('INFO', `Request ${id} completed: merged ${result.addedCount || 0} sources into similar topic "${match.topic.id}"`);
      return match.topic.id;
    }

    // No match — create new topic
    log('INFO', `No existing topic matches "${topic_name}". Creating new.`);
    const prompt = buildResearchPrompt(topic_name, language || 'en', description);
    log('INFO', `Calling Claude CLI for "${topic_name}"...`);

    const claudeOutput = await runClaude(prompt);
    log('DEBUG', `Claude output (first 500 chars): ${claudeOutput.substring(0, 500)}`);

    // Parse the output
    const topicData = parseClaudeOutput(claudeOutput);
    log('INFO', `Parsed topic: id="${topicData.id}", category="${topicData.category}", sources=${topicData.sources.length}`);

    // Check if topic ID already exists (shouldn't since we checked name, but belt-and-suspenders)
    let finalId = topicData.id;
    if (await topicExists(finalId)) {
      finalId = `${finalId}-${Date.now().toString(36)}`;
      topicData.id = finalId;
      log('INFO', `Topic ID collision, using: ${finalId}`);
    }

    // Insert into Supabase topics table
    const inserted = await insertTopic(topicData);
    log('INFO', `Inserted topic "${finalId}" into Supabase`);

    // Mark request as completed
    await updateRequestStatus(id, 'completed', { result_topic_id: finalId });
    log('INFO', `Request ${id} completed successfully with topic_id="${finalId}"`);

    return finalId;
  } catch (err) {
    const errorMsg = err.message || String(err);
    log('ERROR', `Request ${id} failed: ${errorMsg}`);

    await updateRequestStatus(id, 'failed', { error: errorMsg.substring(0, 1000) });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Webhook HTTP server
// ---------------------------------------------------------------------------

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function handleWebhook(req, res) {
  // Authenticate
  const secret = req.headers['x-webhook-secret'];
  if (secret !== WEBHOOK_SECRET) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return;
  }

  // Parse body
  let body;
  try {
    const raw = await readBody(req);
    body = JSON.parse(raw);
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body' });
    return;
  }

  const { requestId } = body;
  if (!requestId) {
    sendJson(res, 400, { error: 'requestId is required' });
    return;
  }

  // Fetch the request from Supabase
  const topicRequest = await fetchRequestById(requestId);
  if (!topicRequest) {
    sendJson(res, 404, { error: `Request ${requestId} not found` });
    return;
  }

  // Respond immediately — process in the background
  sendJson(res, 202, { accepted: true, requestId });

  // Process asynchronously
  processRequest(topicRequest).catch((err) => {
    log('ERROR', `Background processing failed for ${requestId}: ${err.message}`);
  });
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(level, message) {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [topic-agent] [${level}]`;
  if (level === 'ERROR') {
    console.error(`${prefix} ${message}`);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

function start() {
  log('INFO', '=== Topic Research Agent starting ===');
  log('INFO', `Supabase URL: ${SUPABASE_URL}`);
  log('INFO', `Claude CLI: ${CLAUDE_PATH}`);
  log('INFO', `Webhook port: ${WEBHOOK_PORT}`);

  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      sendJson(res, 200, { status: 'ok', uptime: process.uptime() });
      return;
    }
    if (req.method === 'POST' && req.url === '/webhook/topic-suggest') {
      handleWebhook(req, res).catch((err) => {
        log('ERROR', `Webhook handler error: ${err.message}`);
        if (!res.headersSent) {
          sendJson(res, 500, { error: 'Internal server error' });
        }
      });
      return;
    }
    sendJson(res, 404, { error: 'Not found' });
  });

  server.listen(WEBHOOK_PORT, () => {
    log('INFO', `HTTP server listening on port ${WEBHOOK_PORT}`);
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  log('INFO', 'Received SIGINT, shutting down...');
  process.exit(0);
});
process.on('SIGTERM', () => {
  log('INFO', 'Received SIGTERM, shutting down...');
  process.exit(0);
});

// Handle uncaught errors so PM2 can restart
process.on('uncaughtException', (err) => {
  log('ERROR', `Uncaught exception: ${err.message}\n${err.stack}`);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  log('ERROR', `Unhandled rejection: ${reason}`);
  process.exit(1);
});

start();
