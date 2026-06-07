import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_EXPIRY = '24h';

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET env var is missing or too short (min 32 chars)');
  process.exit(1);
}
if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 8) {
  console.error('FATAL: ADMIN_PASSWORD env var is missing or too short (min 8 chars)');
  process.exit(1);
}

// ─── Password verification ────────────────────────────────────────────────────

// Verify against a users table row's password_hash
async function verifyUserPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

// Timing-safe env-var comparison (fallback when no users table row)
function verifyEnvPassword(password) {
  const provided = Buffer.from(password.padEnd(72), 'utf8');
  const expected = Buffer.from(ADMIN_PASSWORD.padEnd(72), 'utf8');
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

// ─── Auth Router ──────────────────────────────────────────────────────────────

export function createAuthRouter(express, loginLimiter, pool) {
  const router = express.Router();

  // POST /api/auth/login
  // Accepts { username, password } — looks up users table.
  // Backward-compat: if username omitted, falls back to env-var check (admin only).
  router.post('/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body;

    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Password is required' });
    }

    let user = null;

    if (pool && username && typeof username === 'string' && username.trim().length > 0) {
      // Look up user by username in users table
      try {
        const result = await pool.query(
          'SELECT id, username, email, password_hash, role, is_active FROM users WHERE username = $1',
          [username.trim()]
        );
        if (result.rows.length > 0) {
          user = result.rows[0];
        }
      } catch (err) {
        console.error('Login DB query failed:', err.message);
        // Fall through to env-var check
      }
    }

    let authenticated = false;
    let tokenPayload = null;

    if (user) {
      if (!user.is_active) {
        if (pool) {
          pool.query(
            "INSERT INTO terminal_logs (message, type) VALUES ($1, $2)",
            [`Login rejected (inactive account): ${username} from ${req.ip || 'unknown'}`, 'auth_fail']
          ).catch(() => {});
        }
        return res.status(401).json({ error: 'Account is disabled' });
      }
      authenticated = await verifyUserPassword(password, user.password_hash);
      if (authenticated) {
        tokenPayload = { user_id: user.id, username: user.username, role: user.role };
        // Update last_login
        pool?.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]).catch(() => {});
      }
    } else {
      // Backward-compat: no username provided or users table empty → env-var admin check
      authenticated = verifyEnvPassword(password);
      if (authenticated) {
        tokenPayload = { user_id: 0, username: process.env.INITIAL_ADMIN_USERNAME || 'admin', role: 'admin' };
      }
    }

    if (!authenticated) {
      if (pool) {
        pool.query(
          "INSERT INTO terminal_logs (message, type) VALUES ($1, $2)",
          [`Login failed${username ? ` for "${username}"` : ''} from ${req.ip || 'unknown'}`, 'auth_fail']
        ).catch(() => {});
      }
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    if (pool) {
      pool.query(
        "INSERT INTO terminal_logs (message, type) VALUES ($1, $2)",
        [`Login successful: ${tokenPayload.username} from ${req.ip || 'unknown'}`, 'auth_success']
      ).catch(() => {});
    }

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
    res.json({
      token,
      user: { user_id: tokenPayload.user_id, username: tokenPayload.username, role: tokenPayload.role }
    });
  });

  // GET /api/auth/status
  router.get('/status', requireAuth, (req, res) => {
    res.json({
      authenticated: true,
      role: req.user.role,
      username: req.user.username,
      user_id: req.user.user_id,
      exp: req.user.exp,
      iat: req.user.iat
    });
  });

  // GET /api/auth/me
  router.get('/me', requireAuth, async (req, res) => {
    if (pool && req.user.user_id) {
      try {
        const result = await pool.query(
          'SELECT id, username, email, role, is_active, created_at, last_login FROM users WHERE id = $1',
          [req.user.user_id]
        );
        if (result.rows.length > 0) {
          return res.json(result.rows[0]);
        }
      } catch { /* fall through */ }
    }
    // Fallback for env-var-based sessions
    res.json({ user_id: req.user.user_id, username: req.user.username, role: req.user.role });
  });

  // POST /api/auth/change-password — changes the authenticated user's own password
  router.post('/change-password', requireAuth, async (req, res) => {
    if (!pool) {
      return res.status(503).json({ error: 'Database not available' });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || typeof currentPassword !== 'string') {
      return res.status(400).json({ error: 'currentPassword is required' });
    }
    if (!newPassword || typeof newPassword !== 'string') {
      return res.status(400).json({ error: 'newPassword is required' });
    }
    if (newPassword.length < 12) {
      return res.status(400).json({ error: 'New password must be at least 12 characters' });
    }
    if (newPassword.length > 128) {
      return res.status(400).json({ error: 'New password must be 128 characters or fewer' });
    }

    try {
      // Look up user's current hash
      const result = await pool.query(
        'SELECT id, password_hash FROM users WHERE id = $1',
        [req.user.user_id]
      );

      let currentValid = false;
      if (result.rows.length > 0) {
        currentValid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
      } else {
        // env-var admin fallback
        currentValid = verifyEnvPassword(currentPassword);
      }

      if (!currentValid) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      const hash = await bcrypt.hash(newPassword, 12);

      if (result.rows.length > 0) {
        await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.user_id]);
      } else {
        // env-var admin: upsert into settings as fallback (legacy path)
        await pool.query(
          "INSERT INTO settings (key, value) VALUES ('admin_password_hash', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
          [hash]
        );
      }

      pool.query(
        "INSERT INTO terminal_logs (message, type) VALUES ($1, $2)",
        [`Password changed for user: ${req.user.username}`, 'auth_success']
      ).catch(() => {});

      return res.json({ success: true });
    } catch {
      return res.status(503).json({ error: 'Database error while changing password' });
    }
  });

  return router;
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const token = header.slice(7);
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * requireRole(...roles) — must be used after requireAuth.
 * Allows the request through if req.user.role is in the provided list.
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}
