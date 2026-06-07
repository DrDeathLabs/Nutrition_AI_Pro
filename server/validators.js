export const ALLOWED_STATUSES = new Set(['draft', 'final']);
export const ALLOWED_ACTIONS = new Set(['delete', 'approve']);
export const ALLOWED_CONTENT_TYPES = new Set([
  'recipe_card', 'blog_post', 'meal_prep_guide', 'social_hit', 'email_newsletter',
]);
export const ALLOWED_SORT = new Set([
  'title_asc', 'title_desc', 'created_desc', 'created_asc',
  'cal_desc', 'cal_asc', 'pro_desc', 'pro_asc',
  'fat_desc', 'fat_asc', 'carb_desc', 'carb_asc',
]);

export const KNOWN_SETTING_KEYS = new Set([
  'ollama_url', 'ollama_model',
  'ai_provider',
  'claude_api_key', 'claude_model',
  'openai_api_key', 'openai_model',
  'gemini_api_key', 'gemini_model',
  'default_goal', 'default_meal_type', 'default_batch_amount',
  'log_retention_days',
  // system_contract is managed via its own endpoints, not POST /api/settings
]);

// Values for these keys are masked in GET /api/settings responses
export const SENSITIVE_SETTING_KEYS = new Set([
  'claude_api_key', 'openai_api_key', 'gemini_api_key',
]);

// Keys never included in exports (even masked) — plaintext secrets
export const EXPORT_EXCLUDED_KEYS = new Set([
  'admin_password_hash', 'claude_api_key', 'openai_api_key', 'gemini_api_key',
]);

export const VALID_ROLES = new Set(['admin', 'editor', 'viewer']);

export const ALLOWED_OLLAMA_HOSTS = ['host.docker.internal', 'localhost', '127.0.0.1', '172.17.0.1'];
export const ALLOWED_OLLAMA_PORTS = [11434, 11480];

export function validatePositiveInt(value, name) {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    throw Object.assign(new Error(`${name} must be a positive integer`), { status: 400 });
  }
  return num;
}

export function validateOllamaUrl(urlStr) {
  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw Object.assign(new Error('Invalid URL format'), { status: 400 });
  }
  if (parsed.protocol !== 'http:') {
    throw Object.assign(new Error('Only http:// protocol is allowed for Ollama URL'), { status: 400 });
  }
  if (!ALLOWED_OLLAMA_HOSTS.includes(parsed.hostname)) {
    throw Object.assign(
      new Error(`Host "${parsed.hostname}" is not in the allowed list`),
      { status: 400 }
    );
  }
  const port = Number(parsed.port);
  if (!ALLOWED_OLLAMA_PORTS.includes(port)) {
    throw Object.assign(
      new Error(`Port ${port} is not allowed. Allowed ports: ${ALLOWED_OLLAMA_PORTS.join(', ')}`),
      { status: 400 }
    );
  }
  return true;
}

export function validateUsername(username) {
  if (!username || typeof username !== 'string') {
    throw Object.assign(new Error('username is required'), { status: 400 });
  }
  const trimmed = username.trim();
  if (trimmed.length < 2 || trimmed.length > 50) {
    throw Object.assign(new Error('username must be 2–50 characters'), { status: 400 });
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(trimmed)) {
    throw Object.assign(new Error('username may only contain letters, digits, underscores, dots, and hyphens'), { status: 400 });
  }
  return trimmed;
}

export function validateRole(role) {
  if (!role || !VALID_ROLES.has(role)) {
    throw Object.assign(
      new Error(`role must be one of: ${[...VALID_ROLES].join(', ')}`),
      { status: 400 }
    );
  }
  return role;
}

export function validateEmail(email) {
  if (!email) return null; // email is optional
  if (typeof email !== 'string' || email.length > 255) {
    throw Object.assign(new Error('email must be a string of 255 chars or fewer'), { status: 400 });
  }
  // basic format check
  if (email && !/.+@.+\..+/.test(email)) {
    throw Object.assign(new Error('email format is invalid'), { status: 400 });
  }
  return email.trim();
}

export function validatePassword(password, fieldName = 'password') {
  if (!password || typeof password !== 'string') {
    throw Object.assign(new Error(`${fieldName} is required`), { status: 400 });
  }
  if (password.length < 8) {
    throw Object.assign(new Error(`${fieldName} must be at least 8 characters`), { status: 400 });
  }
  if (password.length > 128) {
    throw Object.assign(new Error(`${fieldName} must be 128 characters or fewer`), { status: 400 });
  }
  return password;
}
