// Global test setup — runs before every test file via vitest.config.js setupFiles
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long-for-testing-only';
process.env.ADMIN_PASSWORD = 'testpassword123';
process.env.ALLOWED_ORIGINS = 'http://localhost:8080';

// Point to a local test DB if not already set
if (!process.env.POSTGRES_HOST) process.env.POSTGRES_HOST = 'localhost';
if (!process.env.POSTGRES_USER) process.env.POSTGRES_USER = 'postgres';
if (!process.env.POSTGRES_PASSWORD) process.env.POSTGRES_PASSWORD = 'test';
if (!process.env.POSTGRES_DB) process.env.POSTGRES_DB = 'recipe_test_db';
