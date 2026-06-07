import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pg from 'pg';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import {
  generateRecipeWithProvider, critiqueRecipe,
  PROMPT_REGISTRY, PROMPT_KEYS, resolvePrompt, getSystemPromptKeyForContentType,
  extractRecipeSubObject,
} from './llmService.js';
import { createAuthRouter, requireAuth, requireRole } from './auth.js';
import {
  ALLOWED_STATUSES, ALLOWED_ACTIONS, ALLOWED_SORT, ALLOWED_CONTENT_TYPES,
  KNOWN_SETTING_KEYS, SENSITIVE_SETTING_KEYS, EXPORT_EXCLUDED_KEYS,
  validatePositiveInt, validateOllamaUrl,
  validateUsername, validateRole as validateRoleValue, validateEmail, validatePassword,
} from './validators.js';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 80;

// --- SECURITY MIDDLEWARE ---
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      connectSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:8080').split(',').map(s => s.trim());
app.use(cors({ origin: allowedOrigins, credentials: true }));

app.use(express.json({ limit: '2mb' }));

// --- RATE LIMITERS ---
// General limiter: 2000 req / 15 min per IP.
// The terminal polls 2 endpoints every 5 s (24/min), plus UI interactions.
// With multiple browser tabs open a realistic ceiling is ~1500 req/15 min,
// so 2000 gives a comfortable margin while still guarding against scanners.
// Authenticated endpoints are already protected by JWT — this is a secondary
// DoS / scraping guard only.
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
  // Skip requests that already carry a valid-looking JWT so that ordinary
  // authenticated traffic (polling, library refreshes) never hits this wall.
  skip: (req) => {
    const auth = req.headers.authorization || '';
    return auth.startsWith('Bearer ') && auth.length > 20;
  },
});

const jobsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Job creation rate limit exceeded' },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later' },
  skipSuccessfulRequests: true,
});

app.use('/api/', generalLimiter);

// --- DATABASE ---
const pool = new Pool({
  user: process.env.POSTGRES_USER,
  host: process.env.POSTGRES_HOST || 'db',
  database: process.env.POSTGRES_DB,
  password: process.env.POSTGRES_PASSWORD,
  port: 5432,
  connectionTimeoutMillis: 5000,
});

async function initDb() {
  const maxRetries = process.env.NODE_ENV === 'test' ? 1 : 5;
  const retryDelay = process.env.NODE_ENV === 'test' ? 100 : 5000;
  let retries = maxRetries;
  while (retries > 0) {
    try {
      const client = await pool.connect();
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS recipes (
            id SERIAL PRIMARY KEY,
            recipe_id VARCHAR(255) UNIQUE,
            slug VARCHAR(255) UNIQUE,
            title VARCHAR(255),
            data JSONB,
            status VARCHAR(50) DEFAULT 'draft',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
          CREATE TABLE IF NOT EXISTS jobs (
            id SERIAL PRIMARY KEY,
            goal TEXT,
            amount INTEGER,
            progress INTEGER DEFAULT 0,
            status VARCHAR(50) DEFAULT 'pending',
            error TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
          CREATE TABLE IF NOT EXISTS settings (
            id SERIAL PRIMARY KEY,
            key VARCHAR(255) UNIQUE,
            value TEXT
          );
          CREATE TABLE IF NOT EXISTS terminal_logs (
            id SERIAL PRIMARY KEY,
            message TEXT,
            type VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
          CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(255) UNIQUE NOT NULL,
            email VARCHAR(255),
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(50) NOT NULL DEFAULT 'editor',
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_login TIMESTAMP
          );
        `);

        // Content-type columns (zero-downtime migration — existing rows default to 'recipe_card')
        await client.query(`
          ALTER TABLE jobs    ADD COLUMN IF NOT EXISTS content_type VARCHAR(50) NOT NULL DEFAULT 'recipe_card';
          ALTER TABLE recipes ADD COLUMN IF NOT EXISTS content_type VARCHAR(50) NOT NULL DEFAULT 'recipe_card';
        `);

        // Conversion jobs: a non-null source_recipe_id marks a job that converts an
        // existing recipe into a new content-type draft (rather than generating fresh).
        await client.query(`
          ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source_recipe_id INTEGER;
        `);

        // Flatten email_newsletter records that have legacy data.recipe.recipe_card nesting.
        // After this migration data.recipe holds the recipe directly (no wrapper).
        await client.query(`
          UPDATE recipes
          SET data = jsonb_set(data, '{recipe}', data->'recipe'->'recipe_card')
          WHERE content_type = 'email_newsletter'
            AND data->'recipe' ? 'recipe_card'
            AND status IN ('draft','final');
        `);

        // Indexes for terminal_logs performance (critical for large tables)
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_terminal_logs_type ON terminal_logs (type);
          CREATE INDEX IF NOT EXISTS idx_terminal_logs_created_at ON terminal_logs (created_at);
          CREATE INDEX IF NOT EXISTS idx_terminal_logs_id_type ON terminal_logs (id, type);
        `);

        // Seed default settings (ON CONFLICT DO NOTHING preserves existing values)
        const defaultSettings = [
          ['ollama_url', 'http://host.docker.internal:11434/api/generate'],
          ['ollama_model', ''],
          ['ai_provider', 'ollama'],
          ['claude_model', 'claude-sonnet-4-5'],
          ['openai_model', 'gpt-4o'],
          ['gemini_model', 'gemini-1.5-pro'],
          ['default_goal', ''],
          ['default_meal_type', ''],
          ['default_batch_amount', '1'],
          ['log_retention_days', '30'],
        ];
        for (const [key, value] of defaultSettings) {
          await client.query(
            "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING",
            [key, value]
          );
        }

        // Seed admin user from env vars if users table is empty
        const userCount = await client.query('SELECT COUNT(*) FROM users');
        if (parseInt(userCount.rows[0].count, 10) === 0) {
          const adminUsername = process.env.INITIAL_ADMIN_USERNAME || 'admin';
          const adminPassword = process.env.ADMIN_PASSWORD;
          if (adminPassword) {
            const hash = await bcrypt.hash(adminPassword, 12);
            await client.query(
              `INSERT INTO users (username, email, password_hash, role)
               VALUES ($1, NULL, $2, 'admin')
               ON CONFLICT (username) DO NOTHING`,
              [adminUsername, hash]
            );
            console.log(`Seeded admin user: ${adminUsername}`);
          }
        }

        await client.query(
          "INSERT INTO terminal_logs (message, type) VALUES ($1, $2)",
          ['Persistence layer verified. History synchronization ready.', 'sys']
        );
        return;
      } finally {
        client.release();
      }
    } catch (err) {
      retries--;
      console.error(`DB init failed, ${retries} retries left:`, err.message);
      if (retries === 0) {
        if (process.env.NODE_ENV !== 'test') {
          console.error('FATAL: Database failed to initialize after all retries. Exiting.');
          process.exit(1);
        }
        throw err;
      }
      await new Promise(r => setTimeout(r, retryDelay));
    }
  }
}

// --- LOGGING ---
async function addLog(message, type = 'info') {
  try {
    await pool.query(
      "INSERT INTO terminal_logs (message, type) VALUES ($1, $2)",
      [String(message).slice(0, 2000), type]
    );
  } catch (e) {
    console.error("Failed to write to terminal_logs", e.message);
  }
}

// ─── Record Integrity Validator ──────────────────────────────────────────────
// Checks only for well-formed data — not taste. Called after LLM generation, before
// the critic, to catch data bugs that don't require culinary judgment.
function validateRecordIntegrity(data, contentType) {
  const issues = [];

  // Extract the recipe sub-object (mirrors getEditableRecipe on the frontend)
  let recipe = data;
  if (contentType === 'meal_prep_guide') {
    recipe = data?.meals?.[0]?.recipe || data;
  } else if (['blog_post', 'social_hit', 'email_newsletter'].includes(contentType)) {
    recipe = data?.recipe || data;
  }

  const desc        = String(recipe?.description        || '');
  const rationale   = String(recipe?.fitness_rationale  || '');
  const adj         = recipe?.macro_adjustments         || {};
  const ingredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];

  // 1. Description minimum length
  if (desc.length < 80) {
    issues.push(`description too short (${desc.length} chars — minimum 80)`);
  }

  // 2. Fitness rationale minimum length
  if (rationale.length < 80) {
    issues.push(`fitness_rationale too short (${rationale.length} chars — minimum 80)`);
  }

  // 3. Higher protein adjustment must be filled
  const hp = typeof adj.higher_protein === 'string' ? adj.higher_protein.trim() : '';
  if (hp.length < 20) {
    issues.push(`macro_adjustments.higher_protein is empty or too generic (${hp.length} chars)`);
  }

  // 4. Lower carbohydrate adjustment must be filled
  const lc = typeof adj.lower_carbohydrate === 'string' ? adj.lower_carbohydrate.trim() : '';
  if (lc.length < 20) {
    issues.push(`macro_adjustments.lower_carbohydrate is empty or too generic (${lc.length} chars)`);
  }

  // 5. Minimum ingredient count
  if (ingredients.length < 3) {
    issues.push(`only ${ingredients.length} ingredient(s) — minimum 3 required`);
  }

  // 6. At least one ingredient must have non-zero nutrition
  if (ingredients.length >= 4) {
    const hasNutrition = ingredients.some(ing => {
      const n = ing.estimated_nutrition_total || {};
      return (n.calories || 0) > 0 || (n.protein_g || 0) > 0;
    });
    if (!hasNutrition) {
      issues.push(`all ingredient nutrition values are zero — LLM did not estimate macros`);
    }
  }

  // 7. Banned AI-generic description openers
  const descLower = desc.toLowerCase().trim();
  if (['this recipe ', 'this dish ', 'are you ', 'in this post', 'welcome to'].some(b => descLower.startsWith(b))) {
    issues.push(`description starts with banned AI opener: "${desc.slice(0, 50)}"`);
  }

  // 8. Invalid improper fraction in ingredient measurement
  ingredients.forEach(ing => {
    const qty = String(ing.display_quantity || '');
    const m = qty.match(/\b(\d+)\/(\d+)\b/);
    if (m) {
      const num = parseInt(m[1], 10);
      const den = parseInt(m[2], 10);
      if (num > den && den !== 1) {
        issues.push(`"${ing.name}" has invalid measurement "${qty}" — ${num}/${den} is not a valid culinary fraction`);
      }
    }
  });

  return { valid: issues.length === 0, issues };
}

// --- RESILIENT WORKER ---
let loopLocked = false;
let isWorkerBusy = false;
let activeJobId = null;

async function workerLoop() {
  if (loopLocked) return;
  loopLocked = true;

  try {
    const { rows } = await pool.query(
      "SELECT * FROM jobs WHERE status IN ('pending', 'processing') ORDER BY created_at ASC LIMIT 1"
    );

    if (rows.length === 0) {
      isWorkerBusy = false; activeJobId = null;
      loopLocked = false;
      return;
    }

    isWorkerBusy = true;
    const job = rows[0];
    activeJobId = job.id;

    if (job.status === 'pending') {
      await addLog(`Initializing production run #${job.id}`, 'sys');
      await pool.query("UPDATE jobs SET status = 'processing' WHERE id = $1", [job.id]);
    }

    const { rows: settingsRows } = await pool.query("SELECT * FROM settings");
    const settings = Object.fromEntries(settingsRows.map(r => [r.key, r.value]));
    const { rows: existingRows } = await pool.query("SELECT title FROM recipes");
    const existingTitles = existingRows.map(r => r.title);

    const activeProvider = settings.ai_provider || 'ollama';
    await addLog(`AI provider: ${activeProvider}`, 'sys');

    // Conversion jobs take a separate path: reuse an existing recipe, generate only
    // the wrapper content for a new content type, and store as a draft.
    if (job.source_recipe_id) {
      await runConversionJob(job, settings, activeProvider);
      isWorkerBusy = false; activeJobId = null;
      loopLocked = false;
      return;
    }

    // Resolve the system prompt for this content type — honors any admin override
    // saved via the AI LLM Calls tab, else falls back to the built-in default.
    const systemPrompt = resolvePrompt(
      getSystemPromptKeyForContentType(job.content_type || 'recipe_card'),
      settings
    );

    let progress = job.progress;
    const MAX_CONSECUTIVE_FAILURES = 3;
    const MAX_SLOT_ATTEMPTS = 8;
    let consecutiveFailures = 0;
    let slotAttempts = 0;
    let lastFeedback = [];

    while (progress < job.amount) {
      // Check if this job was cancelled before starting the next recipe
      const { rows: jobCheck } = await pool.query(
        "SELECT status FROM jobs WHERE id = $1",
        [job.id]
      );
      if (!jobCheck.length || jobCheck[0].status === 'failed') {
        await addLog(`Job #${job.id} was cancelled — stopping generation.`, 'sys');
        isWorkerBusy = false; activeJobId = null;
        loopLocked = false;
        return;
      }

      try {
        slotAttempts++;

        // ── Variety steering ─────────────────────────────────────────────────
        // The model mode-collapses when fed the same goal repeatedly — first on
        // ingredients (cottage cheese/quinoa…), then on dish FORMAT (everything
        // becomes a "bowl"). Show it the recent ingredients AND recent titles, and
        // push for a different primary protein, a different base/grain, AND a
        // different presentation/format. This is the ingredient+format equivalent
        // of the forbidden-titles mechanism.
        const { rows: recentRows } = await pool.query(
          "SELECT title, data FROM recipes ORDER BY created_at DESC LIMIT 8"
        );
        const recentMains = recentRows
          .map(row => {
            const rec = row.data?.recipe || row.data?.meals?.[0]?.recipe || row.data;
            return (rec?.ingredients || [])
              .slice(0, 4)
              .map(i => i.name)
              .filter(Boolean)
              .join(', ');
          })
          .filter(Boolean);

        // Detect an over-used dish format from recent titles (e.g. everything is a "bowl").
        const FORMAT_WORDS = ['bowl', 'wrap', 'skillet', 'scramble', 'bake', 'casserole', 'hash', 'omelette', 'omelet', 'toast', 'muffin', 'pancake', 'parfait', 'smoothie', 'taco', 'burrito', 'fritter', 'patty', 'patties', 'salad', 'soup', 'stir-fry', 'sandwich', 'pizza', 'frittata', 'quiche'];
        const recentTitlesLower = recentRows.map(r => String(r.title || '').toLowerCase());
        const formatCounts = {};
        recentTitlesLower.forEach(t => FORMAT_WORDS.forEach(f => { if (t.includes(f)) formatCounts[f] = (formatCounts[f] || 0) + 1; }));
        const overusedFormats = Object.entries(formatCounts)
          .filter(([, n]) => n >= 3)
          .sort((a, b) => b[1] - a[1])
          .map(([f]) => f);

        const isBreakfast = /breakfast/i.test(job.goal);

        const formatLine = overusedFormats.length > 0
          ? isBreakfast
            ? `\nFORMAT WARNING: the recent breakfast recipes are mostly "${overusedFormats.join('", "')}" dishes. Do NOT make another ${overusedFormats.join('/')}. Choose a clearly different breakfast presentation — e.g. a frittata, baked egg cups, shakshuka, breakfast burrito/wrap, smoothie bowl, yogurt parfait, avocado toast, sheet-pan eggs, egg-stuffed peppers, grain-free egg dish, pancakes/waffles, or breakfast casserole.`
            : `\nFORMAT WARNING: the recent recipes are mostly "${overusedFormats.join('", "')}" dishes. Do NOT make another ${overusedFormats.join('/')}. Choose a clearly different presentation — e.g. a wrap, skillet, frittata, bake/casserole, hash, fritters/patties, stuffed peppers, toast, muffins, an omelette, a sheet-pan dish, or something else entirely.`
          : isBreakfast
            ? `\nAlso vary the FORMAT — breakfast has more range than bowls and scrambles. Rotate through: frittatas, baked egg cups, omelets, breakfast burritos/wraps, grain-free egg dishes, yogurt parfaits, smoothie bowls, pancakes/waffles, avocado toast, breakfast casseroles, muffins, sheet-pan eggs, shakshuka, egg-stuffed peppers, etc.`
            : `\nAlso vary both FORMAT and CUISINE — do not default to a plain bowl every time. Pick a cuisine style that naturally brings seasoning and brightness: Mexican (tacos, enchiladas, burrito bowls with salsa), Mediterranean (stuffed peppers, flatbreads, grain salads with herbs and lemon), Asian-inspired (stir-fry, rice paper wraps, noodle dishes), American (skillets, sheet-pan, casseroles with a sauce), Middle Eastern (wraps, grain salads with herbs and acid). A specific cuisine style naturally delivers the flavor and contrast the dish needs.`;

        const varietyClause = recentMains.length > 0
          ? isBreakfast
            ? `\n\nVARIETY REQUIREMENT — recent recipes used these ingredients:\n${recentMains.map((m, i) => `${i + 1}. ${m}`).join('\n')}\nThis new breakfast recipe MUST center on a clearly DIFFERENT primary protein and a different base or format than the recurring ingredients above. Breakfast proteins to rotate: whole eggs, egg whites, Greek yogurt, cottage cheese, smoked salmon, turkey sausage/bacon, tofu scramble, nut butter. Breakfast bases/formats to rotate: oats, toast/bread, sweet potato, fruit, waffles/pancakes, yogurt base, smoothie — or NO grain base at all (many excellent breakfasts are grain-free). Do NOT force a meat-and-grain pairing; that framing belongs to lunch and dinner.${formatLine}`
            : `\n\nVARIETY REQUIREMENT — recent recipes used these ingredients:\n${recentMains.map((m, i) => `${i + 1}. ${m}`).join('\n')}\nThis new recipe MUST center on a clearly DIFFERENT primary protein AND a different flavor profile than the recurring recipes above. If cottage cheese, quinoa, chickpeas, Greek yogurt, or egg whites keep appearing as the main protein, choose something else (e.g. salmon, chicken, turkey, shrimp, tofu, lean beef, beans). Beyond protein variety, the dish MUST deliver all three of the following or it will fail the quality gate:\n1. A FLAVOR HOOK — a real sauce, bold spice blend, marinade, char/sear, or umami element that makes the dish worth eating (not a plain unsauced protein on a plain grain).\n2. PROPER SEASONING — seasoned for its cuisine style, not just salt and a pinch of one spice.\n3. A BRIGHT OR CONTRASTING ELEMENT — citrus, fresh herbs, vinegar, chili heat, or a textural crunch that cuts through the dish.\nPick a cuisine and execution that naturally delivers all three.${formatLine}`
          : '';

        // ── Narrative variety steering ───────────────────────────────────────
        // The recipe ingredients are kept diverse by the block above, but the
        // surrounding narrative (hook, story, captions, intros) mode-collapses
        // into a fixed template. Pull the recent openings for THIS content type
        // and forbid reusing their framing — the prose equivalent of the
        // ingredient variety mechanism.
        const ctype = job.content_type || 'recipe_card';
        let narrativeVarietyClause = '';
        if (ctype !== 'recipe_card') {
          const { rows: recentCt } = await pool.query(
            "SELECT data FROM recipes WHERE content_type = $1 ORDER BY created_at DESC LIMIT 5",
            [ctype]
          );
          const extractOpening = (d) => {
            if (!d) return '';
            if (ctype === 'blog_post')        return d.narrative?.hook || '';
            if (ctype === 'social_hit')       return d.instagram_caption?.hook_line || d.tiktok_hook || '';
            if (ctype === 'email_newsletter') return d.intro_paragraph || '';
            if (ctype === 'meal_prep_guide')  return d.intro || '';
            return '';
          };
          const recentOpenings = recentCt
            .map(r => extractOpening(r.data))
            .filter(Boolean)
            .map(o => o.replace(/\s+/g, ' ').trim().slice(0, 160));
          if (recentOpenings.length > 0) {
            narrativeVarietyClause =
              `\n\nNARRATIVE VARIETY — recent ${ctype.replace(/_/g, ' ')} posts opened like this:\n` +
              recentOpenings.map((o, i) => `${i + 1}. ${o}`).join('\n') +
              `\nDo NOT reuse these openings, their framing, their sentence structure, or their closing pattern. Take a clearly DIFFERENT angle and a different opening sentence. The writing must not read as templated or algorithm-generated.`;
          }
        }

        // Build goal with variety steering + feedback from previous failed attempts
        const goalWithFeedback = job.goal + varietyClause + narrativeVarietyClause + (lastFeedback.length > 0
          ? `\n\nA previous attempt was rejected by the tasting panel:\n- ${lastFeedback.join('\n- ')}\nGenerate a DIFFERENT recipe that fixes these specific problems.`
          : '');

        await addLog(`Drafting recipe ${progress + 1} of ${job.amount}... (attempt ${slotAttempts})`, 'sys');
        await addLog(`Sending system prompt and context to LLM...`, 'ai');

        const data = await generateRecipeWithProvider(
          goalWithFeedback,
          activeProvider,
          settings,
          existingTitles,
          (chunk) => { addLog(chunk, 'ai_stream'); },
          systemPrompt
        );

        // Reset failure streak on successful generation
        consecutiveFailures = 0;

        await addLog(`Received raw JSON. Checking data integrity...`, 'val');

        // ── Data integrity gate (non-taste checks only) ─────────────────────
        const integrity = validateRecordIntegrity(data, job.content_type || 'recipe_card');
        if (!integrity.valid) {
          integrity.issues.forEach(issue => addLog(`Data integrity: ${issue}`, 'val'));
          lastFeedback = integrity.issues;

          if (slotAttempts >= MAX_SLOT_ATTEMPTS) {
            await addLog(
              `Recipe slot ${progress + 1} could not produce a valid recipe after ${MAX_SLOT_ATTEMPTS} attempts. ` +
              `Check the AI provider and model configuration.`,
              'error'
            );
            await pool.query("UPDATE jobs SET status = 'failed' WHERE id = $1", [job.id]);
            isWorkerBusy = false; activeJobId = null;
            loopLocked = false;
            return;
          }
          continue; // retry slot without advancing progress
        }

        // ── Tasting panel (the actual tastiness judgment) ────────────────────
        await addLog('Tasting panel reviewing the recipe...', 'val');
        const critique = await critiqueRecipe(
          data,
          job.content_type || 'recipe_card',
          activeProvider,
          settings,
          (chunk) => { addLog(chunk, 'ai_stream'); }
        );

        if (critique.verdict === 'fail') {
          critique.issues.forEach(issue => addLog(`Tasting panel: ${issue}`, 'val'));
          lastFeedback = critique.issues;

          if (slotAttempts >= MAX_SLOT_ATTEMPTS) {
            await addLog(
              `Recipe slot ${progress + 1} rejected by tasting panel after ${MAX_SLOT_ATTEMPTS} attempts. ` +
              `Could not produce a passing recipe. Aborting job.`,
              'error'
            );
            await pool.query("UPDATE jobs SET status = 'failed' WHERE id = $1", [job.id]);
            isWorkerBusy = false; activeJobId = null;
            loopLocked = false;
            return;
          }
          continue; // retry slot without advancing progress
        }

        // Recipe passed both gates — store it
        await addLog(`Tasting panel approved "${data.title}". ${critique.summary}`, 'success');
        lastFeedback = [];
        slotAttempts = 0;
        // ────────────────────────────────────────────────────────────────────

        const slugBase = (data.title || 'untitled')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');
        const SLUG_PREFIXES = { blog_post: 'blog-', meal_prep_guide: 'prep-', social_hit: 'social-', email_newsletter: 'email-' };
        const slugPrefix = SLUG_PREFIXES[job.content_type] || '';
        const slug = slugPrefix ? `${slugPrefix}${slugBase}` : slugBase;
        const recipe_id = crypto.randomUUID();

        await addLog(`Scanning for title collisions: "${data.title}"`, 'db');

        let finalSlug = slug;
        let collision = false;
        for (let attempt = 0; attempt < 5; attempt++) {
          const { rows: dupCheck } = await pool.query(
            "SELECT id FROM recipes WHERE slug = $1",
            [finalSlug]
          );
          if (dupCheck.length === 0) { collision = false; break; }
          collision = true;
          finalSlug = `${slug}-${crypto.randomUUID().slice(0, 8)}`;
        }

        if (collision) {
          await addLog(`Could not resolve slug collision for "${data.title}" after 5 attempts. Skipping.`, 'error');
          progress++;
          await pool.query("UPDATE jobs SET progress = $1 WHERE id = $2", [progress, job.id]);
          continue;
        }

        await addLog(`Writing draft ID ${recipe_id} to persistent storage...`, 'db');
        await pool.query(
          "INSERT INTO recipes (recipe_id, slug, title, data, status, content_type) VALUES ($1, $2, $3, $4, $5, $6)",
          [recipe_id, finalSlug, data.title, data, 'draft', job.content_type || 'recipe_card']
        );
        existingTitles.push(data.title);

        progress++;
        await pool.query("UPDATE jobs SET progress = $1 WHERE id = $2", [progress, job.id]);
        await addLog(`Successfully drafted "${data.title}"`, 'success');

      } catch (err) {
        consecutiveFailures++;
        await addLog(`AI Generation failed: ${err.message}`, 'error');

        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          await addLog(
            `Job #${job.id} aborted after ${MAX_CONSECUTIVE_FAILURES} consecutive AI failures. ` +
            `Configure an AI provider in Settings to retry.`,
            'error'
          );
          await pool.query("UPDATE jobs SET status = 'failed' WHERE id = $1", [job.id]);
          isWorkerBusy = false; activeJobId = null;
          loopLocked = false;
          return;
        }

        // Exponential backoff: 5s, 10s, 20s (capped at 60s)
        const backoffMs = Math.min(5000 * Math.pow(2, consecutiveFailures - 1), 60000);
        await addLog(`Retrying in ${backoffMs / 1000}s... (attempt ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`, 'sys');
        await new Promise(r => setTimeout(r, backoffMs));
      }
    }

    await pool.query("UPDATE jobs SET status = 'completed' WHERE id = $1", [job.id]);
    await addLog(`Production run #${job.id} completed. All drafts in inbox.`, 'success');
    isWorkerBusy = false;

  } catch (err) {
    console.error("Worker Error:", err.message);
    isWorkerBusy = false;
  } finally {
    loopLocked = false;
  }
}

// ─── Conversion worker ────────────────────────────────────────────────────────
// Turns an existing recipe into a NEW draft of a different content type. The recipe
// itself is preserved verbatim; only the surrounding wrapper (blog narrative,
// captions, email, etc.) is AI-generated. Converting TO recipe_card needs no LLM.
async function runConversionJob(job, settings, provider) {
  const target = job.content_type || 'recipe_card';
  const MAX_CONVERSION_ATTEMPTS = 3;
  try {
    const { rows: srcRows } = await pool.query(
      "SELECT * FROM recipes WHERE id = $1",
      [job.source_recipe_id]
    );
    if (srcRows.length === 0) {
      await addLog(`Conversion job #${job.id} failed: source recipe #${job.source_recipe_id} not found.`, 'error');
      await pool.query("UPDATE jobs SET status = 'failed' WHERE id = $1", [job.id]);
      return;
    }
    const sourceRow = srcRows[0];
    const sourceData = typeof sourceRow.data === 'string' ? JSON.parse(sourceRow.data) : sourceRow.data;
    const sourceRecipe = extractRecipeSubObject(sourceData, sourceRow.content_type || 'recipe_card');

    await addLog(`Converting "${sourceRow.title}" (${sourceRow.content_type}) → ${target}...`, 'sys');

    let newData;
    if (target === 'recipe_card') {
      // Mechanical unwrap — no LLM needed.
      newData = sourceRecipe;
      await addLog('Unwrapping embedded recipe into a standalone recipe card...', 'sys');
    } else {
      // AI-generate the wrapper around the EXACT recipe, then splice the recipe back.
      const systemPrompt = resolvePrompt(getSystemPromptKeyForContentType(target), settings);
      const conversionGoal =
        `CONVERSION TASK: Build a complete ${target.replace(/_/g, ' ')} around the EXACT recipe provided below. ` +
        `Reuse the recipe's ingredients, instructions, and nutrition VERBATIM in the recipe section of your output — ` +
        `do NOT invent a new recipe or change any of its values. Generate only the surrounding wrapper content ` +
        `(narrative, captions, email copy, SEO, etc.) appropriate to a ${target.replace(/_/g, ' ')}.\n\n` +
        `SOURCE RECIPE JSON:\n${JSON.stringify(sourceRecipe)}`;

      let lastErr = null;
      for (let attempt = 1; attempt <= MAX_CONVERSION_ATTEMPTS; attempt++) {
        try {
          await addLog(`Generating ${target} wrapper (attempt ${attempt})...`, 'ai');
          const result = await generateRecipeWithProvider(
            conversionGoal, provider, settings, [],
            (chunk) => { addLog(chunk, 'ai_stream'); }, systemPrompt
          );
          // Guarantee fidelity: overwrite whatever recipe the model produced with the original.
          result.recipe = sourceRecipe;
          result.content_type = target;
          result.title = result.title || sourceRecipe.title || sourceRow.title;

          const integrity = validateRecordIntegrity(result, target);
          if (!integrity.valid) {
            integrity.issues.forEach(issue => addLog(`Data integrity: ${issue}`, 'val'));
            lastErr = new Error('integrity check failed');
            continue;
          }
          newData = result;
          break;
        } catch (err) {
          lastErr = err;
          await addLog(`Conversion attempt ${attempt} failed: ${err.message}`, 'error');
        }
      }
      if (!newData) {
        await addLog(`Conversion job #${job.id} failed after ${MAX_CONVERSION_ATTEMPTS} attempts: ${lastErr?.message || 'unknown error'}.`, 'error');
        await pool.query("UPDATE jobs SET status = 'failed' WHERE id = $1", [job.id]);
        return;
      }
    }

    // Store as a new draft (mirrors the worker's slug/collision pattern).
    const title = newData.title || sourceRecipe.title || sourceRow.title || 'untitled';
    const slugBase = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const SLUG_PREFIXES = { blog_post: 'blog-', meal_prep_guide: 'prep-', social_hit: 'social-', email_newsletter: 'email-' };
    const slug = (SLUG_PREFIXES[target] || '') + slugBase;
    const recipe_id = crypto.randomUUID();

    let finalSlug = slug;
    for (let attempt = 0; attempt < 5; attempt++) {
      const { rows: dup } = await pool.query("SELECT id FROM recipes WHERE slug = $1", [finalSlug]);
      if (dup.length === 0) break;
      finalSlug = `${slug}-${crypto.randomUUID().slice(0, 8)}`;
    }

    await pool.query(
      "INSERT INTO recipes (recipe_id, slug, title, data, status, content_type) VALUES ($1, $2, $3, $4, $5, $6)",
      [recipe_id, finalSlug, title, newData, 'draft', target]
    );
    await pool.query("UPDATE jobs SET status = 'completed', progress = 1 WHERE id = $1", [job.id]);
    await addLog(`Conversion complete — new ${target} draft "${title}" is in the inbox.`, 'success');
  } catch (err) {
    console.error('Conversion job error:', err.message);
    await addLog(`Conversion job #${job.id} failed: ${err.message}`, 'error');
    try { await pool.query("UPDATE jobs SET status = 'failed' WHERE id = $1", [job.id]); } catch { /* ignore */ }
  }
}

if (process.env.NODE_ENV !== 'test') setInterval(workerLoop, 5000);

// --- AUTH ROUTES ---
app.use('/api/auth', createAuthRouter(express, loginLimiter, pool));

// --- SYSTEM INFO ---
app.get('/api/system-info', requireAuth, (req, res) => {
  res.json({ allowedOrigins });
});

// --- RECIPES ---

app.get('/api/recipes', requireAuth, async (req, res) => {
  try {
    const {
      status,
      page = '1',
      limit: rawLimit = '20',
      search = '',
      meal_type = '',
      goal = '',
      content_type = '',
      sort = 'created_desc',
    } = req.query;

    const page_ = Math.max(1, parseInt(page, 10) || 1);
    const limit_ = Math.min(100, Math.max(1, parseInt(rawLimit, 10) || 20));
    const safeSort = ALLOWED_SORT.has(sort) ? sort : 'created_desc';

    if (status && !ALLOWED_STATUSES.has(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    let queryStr = 'SELECT * FROM recipes WHERE 1=1';
    const params = [];

    if (status) {
      params.push(status);
      queryStr += ` AND status = $${params.length}`;
    }
    if (search) {
      params.push(`%${search.slice(0, 200)}%`);
      queryStr += ` AND title ILIKE $${params.length}`;
    }
    if (meal_type) {
      params.push(meal_type.slice(0, 50));
      queryStr += ` AND data->>'meal_type' = $${params.length}`;
    }
    if (goal) {
      params.push(`%${goal.slice(0, 200)}%`);
      queryStr += ` AND (data->'goal_fit')::text ILIKE $${params.length}`;
    }
    if (content_type && ALLOWED_CONTENT_TYPES.has(content_type)) {
      params.push(content_type);
      queryStr += ` AND content_type = $${params.length}`;
    }

    const SORT_SQL = {
      title_asc:    'ORDER BY title ASC',
      title_desc:   'ORDER BY title DESC',
      created_asc:  'ORDER BY created_at ASC',
      created_desc: 'ORDER BY created_at DESC',
      cal_desc:  "ORDER BY (data->'estimated_nutrition_per_serving'->>'calories')::numeric DESC NULLS LAST",
      cal_asc:   "ORDER BY (data->'estimated_nutrition_per_serving'->>'calories')::numeric ASC NULLS LAST",
      pro_desc:  "ORDER BY (data->'estimated_nutrition_per_serving'->>'protein_g')::numeric DESC NULLS LAST",
      pro_asc:   "ORDER BY (data->'estimated_nutrition_per_serving'->>'protein_g')::numeric ASC NULLS LAST",
      fat_desc:  "ORDER BY (data->'estimated_nutrition_per_serving'->>'fat_g')::numeric DESC NULLS LAST",
      fat_asc:   "ORDER BY (data->'estimated_nutrition_per_serving'->>'fat_g')::numeric ASC NULLS LAST",
      carb_desc: "ORDER BY (data->'estimated_nutrition_per_serving'->>'carbohydrates_g')::numeric DESC NULLS LAST",
      carb_asc:  "ORDER BY (data->'estimated_nutrition_per_serving'->>'carbohydrates_g')::numeric ASC NULLS LAST",
    };
    queryStr += ` ${SORT_SQL[safeSort] || SORT_SQL.created_desc}`;

    const offset = (page_ - 1) * limit_;
    const countRes = await pool.query(`SELECT COUNT(*) FROM (${queryStr}) AS total`, params);
    const total = parseInt(countRes.rows[0].count, 10);

    params.push(limit_, offset);
    queryStr += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const { rows } = await pool.query(queryStr, params);
    res.json({ data: rows, total, page: page_, totalPages: Math.ceil(total / limit_) });
  } catch (err) {
    console.error('GET /api/recipes error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Convert an existing recipe into a NEW draft of a different content type.
// Queues a conversion job (source_recipe_id set); the worker handles it.
app.post('/api/recipes/:id/convert', requireAuth, requireRole('admin', 'editor'), async (req, res) => {
  try {
    const id = validatePositiveInt(req.params.id, 'Recipe ID');
    const { target_content_type } = req.body;

    if (!ALLOWED_CONTENT_TYPES.has(target_content_type)) {
      return res.status(400).json({ error: `target_content_type must be one of: ${[...ALLOWED_CONTENT_TYPES].join(', ')}` });
    }
    if (target_content_type === 'meal_prep_guide') {
      return res.status(400).json({ error: 'meal_prep_guide is not a valid conversion target' });
    }

    const { rows } = await pool.query("SELECT id, title, content_type FROM recipes WHERE id = $1", [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Recipe not found' });
    }
    const source = rows[0];
    if ((source.content_type || 'recipe_card') === target_content_type) {
      return res.status(400).json({ error: 'Source and target content type are the same' });
    }

    const goalLabel = `Convert recipe #${id} "${source.title}" → ${target_content_type}`;
    const { rows: jobRows } = await pool.query(
      "INSERT INTO jobs (goal, amount, content_type, source_recipe_id) VALUES ($1, 1, $2, $3) RETURNING id",
      [goalLabel.slice(0, 1000), target_content_type, id]
    );
    await addLog(`Conversion job #${jobRows[0].id} queued: ${source.content_type} → ${target_content_type}.`, 'sys');
    res.json({ job_id: jobRows[0].id });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('POST /api/recipes/:id/convert error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/recipes/:id/finalize', requireAuth, requireRole('admin', 'editor'), async (req, res) => {
  try {
    const id = validatePositiveInt(req.params.id, 'Recipe ID');
    await addLog(`Promoting recipe #${id} to Vault...`, 'db');
    await pool.query("UPDATE recipes SET status = 'final' WHERE id = $1", [id]);
    await addLog(`Recipe #${id} finalized successfully.`, 'success');
    res.json({ success: true });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('POST /api/recipes/:id/finalize error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/jobs', requireAuth, requireRole('admin', 'editor'), jobsLimiter, async (req, res) => {
  try {
    const { goal, amount, content_type = 'recipe_card' } = req.body;

    if (!goal || typeof goal !== 'string' || goal.trim().length === 0) {
      return res.status(400).json({ error: 'goal is required and must be a non-empty string' });
    }
    if (goal.length > 1000) {
      return res.status(400).json({ error: 'goal must be 1000 characters or fewer' });
    }

    const amount_ = parseInt(amount, 10);
    if (!Number.isInteger(amount_) || amount_ < 1 || amount_ > 100) {
      return res.status(400).json({ error: 'amount must be an integer between 1 and 100' });
    }

    if (!ALLOWED_CONTENT_TYPES.has(content_type)) {
      return res.status(400).json({ error: `content_type must be one of: ${[...ALLOWED_CONTENT_TYPES].join(', ')}` });
    }

    const { rows } = await pool.query(
      "INSERT INTO jobs (goal, amount, content_type) VALUES ($1, $2, $3) RETURNING id",
      [goal.trim(), amount_, content_type]
    );
    await addLog(`New production job #${rows[0].id} queued: ${amount_} ${content_type.replace(/_/g,' ')}(s).`, 'sys');
    res.json({ id: rows[0].id });
  } catch (err) {
    console.error('POST /api/jobs error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/jobs', requireAuth, async (req, res) => {
  try {
    // Return ALL active jobs (no limit) so the queue panel never drops the
    // running job when many newer jobs are queued behind it.
    const { rows } = await pool.query(
      "SELECT * FROM jobs WHERE status IN ('pending','processing') ORDER BY created_at ASC"
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /api/jobs error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/worker-status', requireAuth, (req, res) => {
  res.json({ isProcessing: isWorkerBusy, activeJobId });
});

app.post('/api/jobs/cancel-all', requireAuth, requireRole('admin', 'editor'), async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      "UPDATE jobs SET status = 'failed' WHERE status IN ('pending', 'processing')"
    );
    await addLog(`All queued jobs cancelled by ${req.user.username}. ${rowCount} job(s) stopped.`, 'sys');
    res.json({ success: true, cancelled: rowCount });
  } catch (err) {
    console.error('POST /api/jobs/cancel-all error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/jobs/:id/cancel', requireAuth, requireRole('admin', 'editor'), async (req, res) => {
  try {
    const jobId = parseInt(req.params.id, 10);
    if (!Number.isInteger(jobId)) return res.status(400).json({ error: 'Invalid job ID' });
    const { rowCount } = await pool.query(
      "UPDATE jobs SET status = 'failed' WHERE id = $1 AND status IN ('pending', 'processing')",
      [jobId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Job not found or already finished' });
    await addLog(`Job #${jobId} cancelled by ${req.user.username}.`, 'sys');
    res.json({ success: true });
  } catch (err) {
    console.error('POST /api/jobs/:id/cancel error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- LOGS ---

app.get('/api/logs', requireAuth, async (req, res) => {
  try {
    const since = Math.max(0, parseInt(req.query.since, 10) || 0);
    const safeType = req.query.type ? String(req.query.type).slice(0, 20) : null;
    const limit = Math.min(500, Math.max(10, parseInt(req.query.limit, 10) || (since > 0 ? 200 : 100)));

    const params = [];
    const conditions = [];

    if (since > 0) {
      params.push(since);
      conditions.push(`id > $${params.length}`);
    }
    if (safeType) {
      params.push(safeType);
      conditions.push(`type = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit);

    let rows;
    if (since === 0 && !safeType) {
      const result = await pool.query(
        `SELECT id, message, type,
           TO_CHAR(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS timestamp
         FROM (SELECT * FROM terminal_logs ORDER BY id DESC LIMIT $1) AS catchup
         ORDER BY id ASC`,
        [limit]
      );
      rows = result.rows;
    } else if (since > 0 && !safeType) {
      const result = await pool.query(
        `SELECT id, message, type,
           TO_CHAR(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS timestamp
         FROM terminal_logs ${whereClause} ORDER BY id ASC LIMIT $${params.length}`,
        params
      );
      rows = result.rows;
    } else {
      const result = await pool.query(
        `SELECT id, message, type,
           TO_CHAR(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS timestamp
         FROM terminal_logs ${whereClause} ORDER BY id DESC LIMIT $${params.length}`,
        params
      );
      rows = result.rows;
    }

    res.json(rows);
  } catch (err) {
    console.error('GET /api/logs error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/logs', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const rawDays = req.body.days;
    const days = parseInt(rawDays, 10);
    if (!Number.isInteger(days) || days <= 0) {
      return res.status(400).json({ error: 'days must be a positive integer' });
    }
    const result = await pool.query(
      "DELETE FROM terminal_logs WHERE created_at < NOW() - ($1 || ' days')::INTERVAL",
      [days]
    );
    await addLog(`Cleared ${result.rowCount} log entries older than ${days} days.`, 'sys');
    res.json({ success: true, deleted: result.rowCount });
  } catch (err) {
    console.error('DELETE /api/logs error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- SETTINGS ---

app.get('/api/settings', requireAuth, async (req, res) => {
  try {
    // Exclude the password hash and the large prompt blobs (managed via /api/prompts).
    const { rows } = await pool.query(
      "SELECT key, value FROM settings WHERE key != 'admin_password_hash' AND key != ALL($1) ORDER BY key",
      [PROMPT_KEYS]
    );
    const masked = rows.map(row => ({
      key: row.key,
      value: (SENSITIVE_SETTING_KEYS.has(row.key) && row.value) ? '•••••' : row.value,
    }));
    res.json(masked);
  } catch (err) {
    console.error('GET /api/settings error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/settings', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { settings } = req.body;
    if (!Array.isArray(settings)) {
      return res.status(400).json({ error: 'settings must be an array' });
    }

    const toSave = [];
    for (const s of settings) {
      if (!KNOWN_SETTING_KEYS.has(s.key)) {
        return res.status(400).json({ error: `Unknown setting key: "${s.key}"` });
      }
      if (typeof s.value !== 'string' || s.value.length > 500) {
        return res.status(400).json({ error: `Setting value for "${s.key}" must be a string of 500 chars or fewer` });
      }
      if (SENSITIVE_SETTING_KEYS.has(s.key) && s.value === '•••••') {
        continue;
      }
      if (s.key === 'ollama_url' && s.value) {
        validateOllamaUrl(s.value);
      }
      toSave.push(s);
    }

    for (const s of toSave) {
      await pool.query(
        "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
        [s.key, s.value]
      );
    }

    res.json({ success: true });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('POST /api/settings error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- AI LLM PROMPTS (registry of all editable prompts) ---

// Returns every prompt in the registry with its current value and source.
// value = admin override if present, else the built-in default.
app.get('/api/prompts', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT key, value FROM settings WHERE key = ANY($1)",
      [PROMPT_KEYS]
    );
    const overrides = Object.fromEntries(rows.map(r => [r.key, r.value]));
    const prompts = PROMPT_REGISTRY.map(p => {
      const override = overrides[p.key];
      const hasOverride = typeof override === 'string' && override.trim().length > 0;
      return {
        key: p.key,
        name: p.name,
        description: p.description,
        value: hasOverride ? override : p.default,
        source: hasOverride ? 'custom' : 'default',
      };
    });
    res.json({ prompts });
  } catch (err) {
    console.error('GET /api/prompts error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/prompts/:key', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { key } = req.params;
    if (!PROMPT_KEYS.includes(key)) {
      return res.status(400).json({ error: 'Unknown prompt key' });
    }
    const { value } = req.body;
    if (!value || typeof value !== 'string') {
      return res.status(400).json({ error: 'value must be a non-empty string' });
    }
    if (value.length > 100000) {
      return res.status(400).json({ error: 'value must be 100,000 characters or fewer' });
    }
    await pool.query(
      "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
      [key, value]
    );
    await addLog(`AI prompt "${key}" updated by admin.`, 'sys');
    res.json({ success: true });
  } catch (err) {
    console.error('PUT /api/prompts/:key error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/prompts/:key', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { key } = req.params;
    if (!PROMPT_KEYS.includes(key)) {
      return res.status(400).json({ error: 'Unknown prompt key' });
    }
    await pool.query("DELETE FROM settings WHERE key = $1", [key]);
    await addLog(`AI prompt "${key}" reset to default by admin.`, 'sys');
    const entry = PROMPT_REGISTRY.find(p => p.key === key);
    res.json({ success: true, value: entry?.default || '', source: 'default' });
  } catch (err) {
    console.error('DELETE /api/prompts/:key error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- ADMIN STATS ---

app.get('/api/admin/stats', requireAuth, async (req, res) => {
  try {
    const [recipesRes, jobsRes, logsRes, usersRes] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)                                           AS total,
          COUNT(*) FILTER (WHERE status = 'draft')          AS draft,
          COUNT(*) FILTER (WHERE status = 'final')          AS final
        FROM recipes
      `),
      pool.query(`
        SELECT
          COUNT(*)                                           AS total,
          COUNT(*) FILTER (WHERE status = 'completed')      AS completed,
          COUNT(*) FILTER (WHERE status IN ('pending', 'processing')) AS active
        FROM jobs
      `),
      pool.query('SELECT COUNT(*) AS total FROM terminal_logs'),
      pool.query('SELECT COUNT(*) AS total FROM users WHERE is_active = true'),
    ]);

    res.json({
      recipes: {
        total:  parseInt(recipesRes.rows[0].total,     10),
        draft:  parseInt(recipesRes.rows[0].draft,     10),
        final:  parseInt(recipesRes.rows[0].final,     10),
      },
      jobs: {
        total:     parseInt(jobsRes.rows[0].total,     10),
        completed: parseInt(jobsRes.rows[0].completed, 10),
        active:    parseInt(jobsRes.rows[0].active,    10),
      },
      logs: {
        total: parseInt(logsRes.rows[0].total, 10),
      },
      users: {
        active: parseInt(usersRes.rows[0].total, 10),
      },
    });
  } catch (err) {
    console.error('GET /api/admin/stats error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- USER MANAGEMENT ---

// GET /api/users — list all users (admin only)
app.get('/api/users', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, username, email, role, is_active, created_at, last_login
       FROM users ORDER BY created_at ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /api/users error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users — create a new user (admin only)
app.post('/api/users', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { username, email, password, role } = req.body;

    const safeUsername = validateUsername(username);
    const safeRole = validateRoleValue(role);
    const safeEmail = validateEmail(email);
    const safePassword = validatePassword(password);

    const hash = await bcrypt.hash(safePassword, 12);

    const { rows } = await pool.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, email, role, is_active, created_at`,
      [safeUsername, safeEmail, hash, safeRole]
    );

    await addLog(`New user created: ${safeUsername} (${safeRole}) by ${req.user.username}`, 'sys');
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    if (err.code === '23505') return res.status(409).json({ error: 'Username already exists' });
    console.error('POST /api/users error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/:id — get a single user (admin, or self)
app.get('/api/users/:id', requireAuth, async (req, res) => {
  try {
    const id = validatePositiveInt(req.params.id, 'User ID');

    // Only admin or the user themselves
    if (req.user.role !== 'admin' && req.user.user_id !== id) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { rows } = await pool.query(
      'SELECT id, username, email, role, is_active, created_at, last_login FROM users WHERE id = $1',
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('GET /api/users/:id error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/users/:id — update a user
// Admin: can change role, is_active, email
// Self: can only change email
app.put('/api/users/:id', requireAuth, async (req, res) => {
  try {
    const id = validatePositiveInt(req.params.id, 'User ID');
    const isAdmin = req.user.role === 'admin';
    const isSelf = req.user.user_id === id;

    if (!isAdmin && !isSelf) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { email, role, is_active } = req.body;
    const updates = [];
    const params = [];

    if (email !== undefined) {
      const safeEmail = validateEmail(email);
      params.push(safeEmail);
      updates.push(`email = $${params.length}`);
    }

    if (isAdmin) {
      if (role !== undefined) {
        const safeRole = validateRoleValue(role);
        params.push(safeRole);
        updates.push(`role = $${params.length}`);
      }
      if (is_active !== undefined) {
        // Prevent admin from deactivating themselves
        if (isSelf && is_active === false) {
          return res.status(400).json({ error: 'Cannot deactivate your own account' });
        }
        params.push(Boolean(is_active));
        updates.push(`is_active = $${params.length}`);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    params.push(id);
    const { rows } = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${params.length}
       RETURNING id, username, email, role, is_active, created_at, last_login`,
      params
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });

    await addLog(`User #${id} updated by ${req.user.username}`, 'sys');
    res.json(rows[0]);
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('PUT /api/users/:id error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/users/:id — delete a user (admin only, cannot delete self)
app.delete('/api/users/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const id = validatePositiveInt(req.params.id, 'User ID');

    if (req.user.user_id === id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const { rows } = await pool.query(
      'DELETE FROM users WHERE id = $1 RETURNING username',
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });

    await addLog(`User "${rows[0].username}" deleted by ${req.user.username}`, 'sys');
    res.json({ success: true });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('DELETE /api/users/:id error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users/:id/reset-password — admin resets another user's password
app.post('/api/users/:id/reset-password', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const id = validatePositiveInt(req.params.id, 'User ID');
    const { new_password } = req.body;

    const safePassword = validatePassword(new_password, 'new_password');
    if (safePassword.length < 8) {
      return res.status(400).json({ error: 'new_password must be at least 8 characters' });
    }

    const hash = await bcrypt.hash(safePassword, 12);
    const { rows } = await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING username',
      [hash, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });

    await addLog(`Password reset for user "${rows[0].username}" by ${req.user.username}`, 'sys');
    res.json({ success: true });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('POST /api/users/:id/reset-password error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- IMPORT / EXPORT ---

app.get('/api/export', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const recipesRes = await pool.query(
      "SELECT * FROM recipes ORDER BY created_at DESC"
    );
    // Export settings, excluding secrets
    const settingsRes = await pool.query(
      `SELECT key, value FROM settings WHERE key NOT IN (${
        [...EXPORT_EXCLUDED_KEYS].map((_, i) => `$${i + 1}`).join(', ')
      }) ORDER BY key`,
      [...EXPORT_EXCLUDED_KEYS]
    );
    const jobsRes = await pool.query(
      "SELECT id, goal, amount, progress, status, content_type, created_at FROM jobs ORDER BY created_at DESC"
    );

    const exportData = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      recipes: recipesRes.rows,
      settings: settingsRes.rows,
      jobs: jobsRes.rows,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=nutrition_ai_export.json');
    res.json(exportData);
  } catch (err) {
    console.error('GET /api/export error:', err.message);
    res.status(500).json({ error: `Export failed: ${err.message}` });
  }
});

app.post('/api/import', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { recipes, settings, jobs } = req.body;

    if (!Array.isArray(recipes) && !Array.isArray(settings) && !Array.isArray(jobs)) {
      return res.status(400).json({ error: 'Request body must contain at least one of: recipes, settings, or jobs arrays' });
    }

    let recipesImported = 0, recipesSkipped = 0;
    let settingsImported = 0, settingsSkipped = 0;
    let jobsImported = 0, jobsSkipped = 0;

    // Import recipes
    if (Array.isArray(recipes)) {
      if (recipes.length > 1000) {
        return res.status(400).json({ error: 'Cannot import more than 1000 recipes at once' });
      }
      for (const recipe of recipes) {
        if (!recipe.recipe_id || !recipe.title || recipe.data === undefined) {
          recipesSkipped++;
          continue;
        }
        try {
          let dataObj = recipe.data;
          if (typeof dataObj === 'string') dataObj = JSON.parse(dataObj);

          const result = await pool.query(
            `INSERT INTO recipes (recipe_id, slug, title, data, status, content_type, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (recipe_id) DO NOTHING`,
            [
              String(recipe.recipe_id).slice(0, 255),
              String(recipe.slug || recipe.recipe_id).slice(0, 255),
              String(recipe.title).slice(0, 255),
              dataObj,
              recipe.status === 'final' ? 'final' : 'draft',
              recipe.content_type || 'recipe_card',
              recipe.created_at ? new Date(recipe.created_at) : new Date(),
            ]
          );
          if (result.rowCount > 0) recipesImported++;
          else recipesSkipped++;
        } catch {
          recipesSkipped++;
        }
      }
    }

    // Import settings (skip secrets and system_contract — security boundary)
    if (Array.isArray(settings)) {
      const IMPORT_SKIP_KEYS = new Set([...EXPORT_EXCLUDED_KEYS, 'system_contract']);
      for (const s of settings) {
        if (!s.key || !KNOWN_SETTING_KEYS.has(s.key) || IMPORT_SKIP_KEYS.has(s.key)) {
          settingsSkipped++;
          continue;
        }
        if (typeof s.value !== 'string' || s.value.length > 500) {
          settingsSkipped++;
          continue;
        }
        try {
          await pool.query(
            "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
            [s.key, s.value]
          );
          settingsImported++;
        } catch {
          settingsSkipped++;
        }
      }
    }

    // Import jobs (re-queue as pending so they can be retried)
    if (Array.isArray(jobs)) {
      if (jobs.length > 200) {
        return res.status(400).json({ error: 'Cannot import more than 200 jobs at once' });
      }
      for (const job of jobs) {
        if (!job.goal || typeof job.goal !== 'string') {
          jobsSkipped++;
          continue;
        }
        const amount = parseInt(job.amount, 10);
        if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
          jobsSkipped++;
          continue;
        }
        try {
          await pool.query(
            "INSERT INTO jobs (goal, amount, progress, status, content_type) VALUES ($1, $2, $3, 'pending', $4)",
            [job.goal.slice(0, 1000), amount, 0, job.content_type || 'recipe_card']
          );
          jobsImported++;
        } catch {
          jobsSkipped++;
        }
      }
    }

    const summary = `Import: recipes ${recipesImported}/${(recipes?.length || 0)}, settings ${settingsImported}/${(settings?.length || 0)}, jobs ${jobsImported}/${(jobs?.length || 0)}`;
    await addLog(summary, 'sys');
    res.json({
      success: true,
      recipes: { imported: recipesImported, skipped: recipesSkipped },
      settings: { imported: settingsImported, skipped: settingsSkipped },
      jobs: { imported: jobsImported, skipped: jobsSkipped },
    });
  } catch (err) {
    console.error('POST /api/import error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- RECIPE CRUD ---

app.put('/api/recipes/:id', requireAuth, requireRole('admin', 'editor'), async (req, res) => {
  try {
    const id = validatePositiveInt(req.params.id, 'Recipe ID');
    const { title, data, status } = req.body;

    if (!title || typeof title !== 'string' || title.length > 255) {
      return res.status(400).json({ error: 'title must be a non-empty string of 255 chars or fewer' });
    }
    if (status && !ALLOWED_STATUSES.has(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return res.status(400).json({ error: 'data must be a JSON object' });
    }

    await pool.query(
      "UPDATE recipes SET title = $1, data = $2, status = $3 WHERE id = $4",
      [title, data, status || 'draft', id]
    );
    res.json({ success: true });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('PUT /api/recipes/:id error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/recipes/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const id = validatePositiveInt(req.params.id, 'Recipe ID');
    await pool.query("DELETE FROM recipes WHERE id = $1", [id]);
    res.json({ success: true });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('DELETE /api/recipes/:id error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/recipes/bulk', requireAuth, requireRole('admin', 'editor'), async (req, res) => {
  try {
    const { ids, action } = req.body;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500) {
      return res.status(400).json({ error: 'ids must be a non-empty array of up to 500 integers' });
    }
    const safeIds = ids.map((id, i) => {
      const n = parseInt(id, 10);
      if (!Number.isInteger(n) || n <= 0) {
        throw Object.assign(new Error(`ids[${i}] is not a valid positive integer`), { status: 400 });
      }
      return n;
    });
    if (!ALLOWED_ACTIONS.has(action)) {
      return res.status(400).json({ error: `action must be one of: ${[...ALLOWED_ACTIONS].join(', ')}` });
    }

    // Restrict delete to admin only
    if (action === 'delete' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can bulk delete recipes' });
    }

    if (action === 'delete') {
      await pool.query("DELETE FROM recipes WHERE id = ANY($1)", [safeIds]);
    } else if (action === 'approve') {
      await pool.query("UPDATE recipes SET status = 'final' WHERE id = ANY($1)", [safeIds]);
    }
    res.json({ success: true });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('POST /api/recipes/bulk error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- AI HEALTH CHECK ---

app.post('/api/health-check-ai', requireAuth, async (req, res) => {
  try {
    const { provider, url } = req.body;
    const activeProvider = provider || 'ollama';

    const VALID_PROVIDERS = ['ollama', 'claude', 'openai', 'gemini'];
    if (!VALID_PROVIDERS.includes(activeProvider)) {
      return res.status(400).json({ error: `Unknown provider: "${activeProvider}". Valid values: ${VALID_PROVIDERS.join(', ')}` });
    }

    if (activeProvider === 'ollama') {
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'url is required for Ollama provider' });
      }
      validateOllamaUrl(url);

      const baseUrl = url.replace(/\/api\/generate$/, '');
      const tagsUrl = `${baseUrl}/api/tags`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(tagsUrl, { method: 'GET', signal: controller.signal });
        if (!response.ok) {
          return res.json({ success: false, error: `Ollama returned ${response.status}` });
        }
        const data = await response.json();
        const models = (data.models || []).map(m => m.name);
        return res.json({ success: true, models });
      } finally {
        clearTimeout(timeout);
      }
    }

    const { rows: settingsRows } = await pool.query("SELECT key, value FROM settings");
    const settings = Object.fromEntries(settingsRows.map(r => [r.key, r.value]));

    if (activeProvider === 'claude') {
      const apiKey = settings.claude_api_key;
      if (!apiKey) return res.json({ success: false, error: 'Claude API key not configured. Save it in AI Providers settings first.' });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch('https://api.anthropic.com/v1/models', {
          headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          signal: controller.signal,
        });
        if (!response.ok) {
          const errText = await response.text();
          return res.json({ success: false, error: `Anthropic API error ${response.status}: ${errText.slice(0, 100)}` });
        }
        const data = await response.json();
        const models = (data.data || []).map(m => m.id).filter(id => id.startsWith('claude-'));
        return res.json({ success: true, models });
      } finally {
        clearTimeout(timeout);
      }
    }

    if (activeProvider === 'openai') {
      const apiKey = settings.openai_api_key;
      if (!apiKey) return res.json({ success: false, error: 'OpenAI API key not configured. Save it in AI Providers settings first.' });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` },
          signal: controller.signal,
        });
        if (!response.ok) {
          const errText = await response.text();
          return res.json({ success: false, error: `OpenAI API error ${response.status}: ${errText.slice(0, 100)}` });
        }
        const data = await response.json();
        const chatModels = (data.data || [])
          .filter(m => m.id.startsWith('gpt-') || m.id.startsWith('o1') || m.id.startsWith('o3'))
          .map(m => m.id)
          .sort()
          .slice(0, 30);
        return res.json({ success: true, models: chatModels });
      } finally {
        clearTimeout(timeout);
      }
    }

    if (activeProvider === 'gemini') {
      const apiKey = settings.gemini_api_key;
      if (!apiKey) return res.json({ success: false, error: 'Gemini API key not configured. Save it in AI Providers settings first.' });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          const errText = await response.text();
          return res.json({ success: false, error: `Gemini API error ${response.status}: ${errText.slice(0, 100)}` });
        }
        const data = await response.json();
        const models = (data.models || [])
          .filter(m => m.name.includes('gemini') && m.supportedGenerationMethods?.includes('generateContent'))
          .map(m => m.name.replace('models/', ''))
          .slice(0, 20);
        return res.json({ success: true, models });
      } finally {
        clearTimeout(timeout);
      }
    }

  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    res.json({ success: false, error: err.message });
  }
});

// --- STATIC FILES ---
app.use(express.static(path.join(__dirname, '../dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../dist/index.html')));

// --- GLOBAL ERROR HANDLER ---
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

export { app, pool, initDb };

if (process.env.NODE_ENV !== 'test') {
  initDb();
  app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
}
