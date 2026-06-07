import { describe, it, expect } from 'vitest';
import {
  validatePositiveInt,
  validateOllamaUrl,
  validateUsername,
  validateRole,
  validateEmail,
  validatePassword,
  KNOWN_SETTING_KEYS,
  SENSITIVE_SETTING_KEYS,
  EXPORT_EXCLUDED_KEYS,
  VALID_ROLES,
  ALLOWED_SORT,
  ALLOWED_CONTENT_TYPES,
} from '../../server/validators.js';

describe('validatePositiveInt', () => {
  it('accepts a positive integer', () => expect(validatePositiveInt(1, 'id')).toBe(1));
  it('accepts a positive integer string', () => expect(validatePositiveInt('42', 'id')).toBe(42));
  it('rejects zero', () => expect(() => validatePositiveInt(0, 'id')).toThrow());
  it('rejects negative numbers', () => expect(() => validatePositiveInt(-1, 'id')).toThrow());
  it('rejects floats', () => expect(() => validatePositiveInt(1.5, 'id')).toThrow());
  it('rejects non-numeric strings', () => expect(() => validatePositiveInt('abc', 'id')).toThrow());
  it('rejects null', () => expect(() => validatePositiveInt(null, 'id')).toThrow());
  it('rejects undefined', () => expect(() => validatePositiveInt(undefined, 'id')).toThrow());
  it('attaches status 400 to thrown error', () => {
    try { validatePositiveInt(-1, 'id'); } catch (e) { expect(e.status).toBe(400); }
  });
});

describe('validateOllamaUrl', () => {
  it('accepts host.docker.internal on port 11434', () =>
    expect(validateOllamaUrl('http://host.docker.internal:11434/api/generate')).toBe(true));

  it('accepts localhost on port 11434', () =>
    expect(validateOllamaUrl('http://localhost:11434/api/generate')).toBe(true));

  it('accepts 127.0.0.1 on port 11480', () =>
    expect(validateOllamaUrl('http://127.0.0.1:11480/api/generate')).toBe(true));

  it('accepts 172.17.0.1 on port 11434', () =>
    expect(validateOllamaUrl('http://172.17.0.1:11434/api/generate')).toBe(true));

  it('rejects https protocol', () =>
    expect(() => validateOllamaUrl('https://localhost:11434/api/generate')).toThrow());

  it('rejects unknown external host (SSRF)', () =>
    expect(() => validateOllamaUrl('http://evil.example.com:11434/api/generate')).toThrow());

  it('rejects AWS metadata endpoint (SSRF)', () =>
    expect(() => validateOllamaUrl('http://169.254.169.254/latest/meta-data/')).toThrow());

  it('rejects GCP metadata endpoint (SSRF)', () =>
    expect(() => validateOllamaUrl('http://metadata.google.internal:11434/')).toThrow());

  it('rejects disallowed port', () =>
    expect(() => validateOllamaUrl('http://localhost:8080/api/generate')).toThrow());

  it('rejects port 80 (common redirect target)', () =>
    expect(() => validateOllamaUrl('http://localhost:80/')).toThrow());

  it('rejects completely invalid URL', () =>
    expect(() => validateOllamaUrl('not-a-url')).toThrow());

  it('rejects empty string', () =>
    expect(() => validateOllamaUrl('')).toThrow());

  it('attaches status 400 to thrown error', () => {
    try { validateOllamaUrl('http://evil.com:11434/'); } catch (e) { expect(e.status).toBe(400); }
  });
});

describe('KNOWN_SETTING_KEYS', () => {
  const expected = [
    'ollama_url', 'ollama_model', 'ai_provider',
    'claude_api_key', 'claude_model',
    'openai_api_key', 'openai_model',
    'gemini_api_key', 'gemini_model',
    'default_goal', 'default_meal_type', 'default_batch_amount',
    'log_retention_days',
  ];

  it('is a Set', () => expect(KNOWN_SETTING_KEYS).toBeInstanceOf(Set));
  it('contains all expected keys', () => {
    for (const k of expected) {
      expect(KNOWN_SETTING_KEYS.has(k)).toBe(true);
    }
  });
  it('has 13 entries', () => expect(KNOWN_SETTING_KEYS.size).toBe(13));
  it('does not contain admin_password_hash (internal key)', () =>
    expect(KNOWN_SETTING_KEYS.has('admin_password_hash')).toBe(false));
  it('does not contain unknown keys', () =>
    expect(KNOWN_SETTING_KEYS.has('evil_key')).toBe(false));
});

describe('SENSITIVE_SETTING_KEYS', () => {
  it('is a Set', () => expect(SENSITIVE_SETTING_KEYS).toBeInstanceOf(Set));
  it('contains claude_api_key', () => expect(SENSITIVE_SETTING_KEYS.has('claude_api_key')).toBe(true));
  it('contains openai_api_key', () => expect(SENSITIVE_SETTING_KEYS.has('openai_api_key')).toBe(true));
  it('contains gemini_api_key', () => expect(SENSITIVE_SETTING_KEYS.has('gemini_api_key')).toBe(true));
  it('does not contain ollama_url', () => expect(SENSITIVE_SETTING_KEYS.has('ollama_url')).toBe(false));
  it('does not contain ollama_model', () => expect(SENSITIVE_SETTING_KEYS.has('ollama_model')).toBe(false));
  it('has exactly 3 entries', () => expect(SENSITIVE_SETTING_KEYS.size).toBe(3));
});

describe('ALLOWED_SORT', () => {
  const basicSorts = ['created_desc', 'created_asc', 'title_asc', 'title_desc'];
  const nutritionSorts = [
    'cal_desc', 'cal_asc',
    'pro_desc', 'pro_asc',
    'fat_desc', 'fat_asc',
    'carb_desc', 'carb_asc',
  ];

  it('is a Set', () => expect(ALLOWED_SORT).toBeInstanceOf(Set));
  it('contains basic sort options', () => {
    for (const s of basicSorts) expect(ALLOWED_SORT.has(s)).toBe(true);
  });
  it('contains nutrition sort options', () => {
    for (const s of nutritionSorts) expect(ALLOWED_SORT.has(s)).toBe(true);
  });
  it('has 12 entries total', () => expect(ALLOWED_SORT.size).toBe(12));
  it('does not contain arbitrary string', () =>
    expect(ALLOWED_SORT.has('malicious_sort')).toBe(false));
});

describe('VALID_ROLES', () => {
  it('is a Set', () => expect(VALID_ROLES).toBeInstanceOf(Set));
  it('contains admin', () => expect(VALID_ROLES.has('admin')).toBe(true));
  it('contains editor', () => expect(VALID_ROLES.has('editor')).toBe(true));
  it('contains viewer', () => expect(VALID_ROLES.has('viewer')).toBe(true));
  it('has exactly 3 entries', () => expect(VALID_ROLES.size).toBe(3));
  it('does not contain superadmin', () => expect(VALID_ROLES.has('superadmin')).toBe(false));
});

describe('EXPORT_EXCLUDED_KEYS', () => {
  it('is a Set', () => expect(EXPORT_EXCLUDED_KEYS).toBeInstanceOf(Set));
  it('contains admin_password_hash', () => expect(EXPORT_EXCLUDED_KEYS.has('admin_password_hash')).toBe(true));
  it('contains claude_api_key', () => expect(EXPORT_EXCLUDED_KEYS.has('claude_api_key')).toBe(true));
  it('contains openai_api_key', () => expect(EXPORT_EXCLUDED_KEYS.has('openai_api_key')).toBe(true));
  it('contains gemini_api_key', () => expect(EXPORT_EXCLUDED_KEYS.has('gemini_api_key')).toBe(true));
  it('does not contain ollama_url (not sensitive)', () => expect(EXPORT_EXCLUDED_KEYS.has('ollama_url')).toBe(false));
});

describe('validateUsername', () => {
  it('accepts valid alphanumeric username', () => expect(validateUsername('alice123')).toBe('alice123'));
  it('accepts username with dots and dashes', () => expect(validateUsername('alice.bob-99')).toBe('alice.bob-99'));
  it('accepts minimum length username (2 chars)', () => expect(validateUsername('ab')).toBe('ab'));
  it('accepts maximum length username (50 chars)', () => expect(validateUsername('a'.repeat(50))).toBe('a'.repeat(50)));
  it('trims surrounding whitespace', () => expect(validateUsername('  alice  ')).toBe('alice'));
  it('rejects empty string', () => expect(() => validateUsername('')).toThrow());
  it('rejects null', () => expect(() => validateUsername(null)).toThrow());
  it('rejects undefined', () => expect(() => validateUsername(undefined)).toThrow());
  it('rejects too-short username (1 char)', () => expect(() => validateUsername('a')).toThrow());
  it('rejects too-long username (51 chars)', () => expect(() => validateUsername('a'.repeat(51))).toThrow());
  it('rejects username with spaces', () => expect(() => validateUsername('alice bob')).toThrow());
  it('rejects username with special chars (@)', () => expect(() => validateUsername('alice@bob')).toThrow());
  it('attaches status 400 to thrown error', () => {
    try { validateUsername(''); } catch (e) { expect(e.status).toBe(400); }
  });
});

describe('validateRole', () => {
  it('accepts admin', () => expect(validateRole('admin')).toBe('admin'));
  it('accepts editor', () => expect(validateRole('editor')).toBe('editor'));
  it('accepts viewer', () => expect(validateRole('viewer')).toBe('viewer'));
  it('rejects superadmin', () => expect(() => validateRole('superadmin')).toThrow());
  it('rejects empty string', () => expect(() => validateRole('')).toThrow());
  it('rejects null', () => expect(() => validateRole(null)).toThrow());
  it('rejects undefined', () => expect(() => validateRole(undefined)).toThrow());
  it('attaches status 400 to thrown error', () => {
    try { validateRole('bad'); } catch (e) { expect(e.status).toBe(400); }
  });
});

describe('validateEmail', () => {
  it('returns null for undefined (email is optional)', () => expect(validateEmail(undefined)).toBeNull());
  it('returns null for null', () => expect(validateEmail(null)).toBeNull());
  it('accepts valid email', () => expect(validateEmail('test@example.com')).toBe('test@example.com'));
  it('trims surrounding whitespace', () => expect(validateEmail('  test@example.com  ')).toBe('test@example.com'));
  it('rejects email without @', () => expect(() => validateEmail('notanemail')).toThrow());
  it('rejects email without domain', () => expect(() => validateEmail('test@')).toThrow());
  it('rejects email over 255 chars', () => {
    const long = 'a'.repeat(250) + '@x.com';
    expect(() => validateEmail(long)).toThrow();
  });
});

describe('validatePassword', () => {
  it('accepts valid password of exactly 8 chars', () => expect(validatePassword('12345678')).toBe('12345678'));
  it('accepts longer password', () => expect(validatePassword('mysecurepassword!')).toBe('mysecurepassword!'));
  it('accepts password of exactly 128 chars', () => expect(validatePassword('a'.repeat(128))).toBe('a'.repeat(128)));
  it('rejects empty string', () => expect(() => validatePassword('')).toThrow());
  it('rejects null', () => expect(() => validatePassword(null)).toThrow());
  it('rejects too-short password (7 chars)', () => expect(() => validatePassword('1234567')).toThrow());
  it('rejects too-long password (129 chars)', () => expect(() => validatePassword('a'.repeat(129))).toThrow());
  it('uses custom fieldName in error message', () => {
    try { validatePassword('', 'newPassword'); } catch (e) { expect(e.message).toMatch(/newPassword/); }
  });
  it('attaches status 400 to thrown error', () => {
    try { validatePassword(''); } catch (e) { expect(e.status).toBe(400); }
  });
});

describe('ALLOWED_CONTENT_TYPES', () => {
  it('is a Set', () => expect(ALLOWED_CONTENT_TYPES).toBeInstanceOf(Set));
  it('has exactly 5 entries', () => expect(ALLOWED_CONTENT_TYPES.size).toBe(5));
  it('contains recipe_card', () => expect(ALLOWED_CONTENT_TYPES.has('recipe_card')).toBe(true));
  it('contains blog_post', () => expect(ALLOWED_CONTENT_TYPES.has('blog_post')).toBe(true));
  it('contains meal_prep_guide', () => expect(ALLOWED_CONTENT_TYPES.has('meal_prep_guide')).toBe(true));
  it('contains social_hit', () => expect(ALLOWED_CONTENT_TYPES.has('social_hit')).toBe(true));
  it('contains email_newsletter', () => expect(ALLOWED_CONTENT_TYPES.has('email_newsletter')).toBe(true));
  it('rejects unknown type', () => expect(ALLOWED_CONTENT_TYPES.has('transformation_story')).toBe(false));
  it('rejects empty string', () => expect(ALLOWED_CONTENT_TYPES.has('')).toBe(false));
});
