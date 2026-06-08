import { renderRecipe, renderContentTypeView } from './components/recipeRenderer.js';

const API_BASE = '/api';

function getToken() { return sessionStorage.getItem('auth_token'); }
function setToken(t) { sessionStorage.setItem('auth_token', t); }
function clearToken() {
  sessionStorage.removeItem('auth_token');
  sessionStorage.removeItem('auth_user');
}
function getUser() {
  try { return JSON.parse(sessionStorage.getItem('auth_user') || 'null'); } catch { return null; }
}
function setUser(u) { sessionStorage.setItem('auth_user', JSON.stringify(u)); }
function getUserRole() { return getUser()?.role || 'viewer'; }

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Short labels for content types — shared by the Library and Drafts inbox.
const CT_LABELS = { recipe_card: 'Recipe', blog_post: 'Blog', meal_prep_guide: 'Prep', social_hit: 'Social', email_newsletter: 'Email' };
// Full labels for the conversion picker.
const CT_FULL_LABELS = { recipe_card: 'Recipe Card', blog_post: 'Blog Post', meal_prep_guide: 'Meal Prep Guide', social_hit: 'Social', email_newsletter: 'Email' };
// Valid conversion TARGETS (meal_prep_guide excluded — it is inherently multi-recipe).
const CONVERT_TARGETS = ['recipe_card', 'blog_post', 'social_hit', 'email_newsletter'];

function showLoginScreen() {
  const ls = document.getElementById('login-screen');
  if (ls) ls.style.display = 'flex';
}

function hideLoginScreen() {
  const ls = document.getElementById('login-screen');
  if (ls) ls.style.display = 'none';
}

async function apiCall(endpoint, method = 'GET', body = null) {
  const token = getToken();
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (token) options.headers['Authorization'] = `Bearer ${token}`;
  if (body) options.body = JSON.stringify(body);

  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, options);
      if (res.status === 401) {
        clearToken();
        showLoginScreen();
        throw new Error('Session expired');
      }
      if (res.ok) return await res.json();
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${res.status}`);
    } catch (e) {
      if (e.message === 'Session expired' || i === 2) throw e;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw new Error(`API failed after retries: ${endpoint}`);
}

document.addEventListener('DOMContentLoaded', () => {
  // --- CORE SELECTORS ---
  const navBtns = document.querySelectorAll('.nav-btn[data-target]');
  const views = document.querySelectorAll('.view');
  const masterWorkspace = document.getElementById('master-workspace');
  const closeWorkspaceBtn = document.getElementById('close-workspace-btn');
  const wTabBtns = document.querySelectorAll('.w-tab-btn');
  const masterTabContents = document.querySelectorAll('.master-tab-content');
  const editorTabBtns = document.querySelectorAll('.editor-tab-btn');
  const editorSections = document.querySelectorAll('.editor-section');

  const recipeForm = document.getElementById('recipe-form');
  const masterSaveBtn = document.getElementById('master-save-btn');

  // --- CONTENT TYPE PILL SELECTOR ---
  const contentTypePills = document.querySelectorAll('.content-type-pill');
  const selectedContentTypeInput = document.getElementById('selected-content-type');
  contentTypePills.forEach(pill => {
    pill.onclick = () => {
      contentTypePills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      if (selectedContentTypeInput) selectedContentTypeInput.value = pill.getAttribute('data-content-type');
    };
  });

  // Settings — sidebar tabs
  const settingsTabBtns = document.querySelectorAll('.settings-tab-btn');
  const settingsSections = document.querySelectorAll('.settings-section');

  // Settings — AI tab
  const configUrl = document.getElementById('config-url');
  const configModel = document.getElementById('config-model');
  const saveAiBtn = document.getElementById('save-ai-btn');
  const testAiBtn = document.getElementById('test-ai-btn');
  const setActiveProviderBtn = document.getElementById('set-active-provider-btn');
  const aiTestResult = document.getElementById('ai-test-result');
  const providerTabBtns = document.querySelectorAll('.provider-tab-btn');

  // Settings — generation defaults
  const generationDefaultsForm = document.getElementById('generation-defaults-form');

  // Settings — account / password
  const changePasswordForm = document.getElementById('change-password-form');

  // Settings — logs tab
  const logTypeFilter = document.getElementById('log-type-filter');
  const logLimitInput = document.getElementById('log-limit-input');
  const refreshLogsBtn = document.getElementById('refresh-logs-btn');
  const clearLogsBtn = document.getElementById('clear-logs-btn');

  // Settings — data tab
  const exportDbBtn = document.getElementById('export-db-btn');
  const importFile = document.getElementById('import-file');
  const importDbBtn = document.getElementById('import-db-btn');
  const clearDraftsBtn = document.getElementById('clear-drafts-btn');

  let currentRecipeData = null;
  let currentRecipeId = null;
  let currentEditableRecipe = null;  // the recipe sub-object the Structured Editor reads/writes
  let currentContentType = 'recipe_card';
  let currentPage = 1;
  const currentLimit = 20;
  const selectedRecipeIds = new Set();
  const selectedDraftIds = new Set();
  let currentProviderTab = 'ollama'; // which provider config is currently shown

  // --- AUTH ---
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.onsubmit = async (e) => {
      e.preventDefault();
      const usernameEl = document.getElementById('login-username');
      const passwordEl = document.getElementById('login-password');
      const errorEl = document.getElementById('login-error');
      const username = usernameEl?.value?.trim() || '';
      const password = passwordEl?.value || '';
      if (errorEl) errorEl.style.display = 'none';
      try {
        const res = await fetch(`${API_BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (errorEl) {
            const hint = username.includes('@')
              ? ' Use your username (e.g. "admin"), not your email.'
              : '';
            errorEl.textContent = (data.error || 'Invalid credentials') + hint;
            errorEl.style.display = 'block';
          }
          return;
        }
        const data = await res.json();
        setToken(data.token);
        if (data.user) setUser(data.user);
        hideLoginScreen();
        initApp();
      } catch {
        if (errorEl) {
          errorEl.textContent = 'Connection failed. Try again.';
          errorEl.style.display = 'block';
        }
      }
    };
  }

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.onclick = () => {
      clearToken();
      showLoginScreen();
    };
  }

  // --- NAVIGATION ---
  function switchView(target) {
    navBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-target') === target));
    views.forEach(v => v.classList.toggle('active', v.id === target));
    try {
      if (target === 'view-library') refreshLibrary();
      if (target === 'view-generator') refreshDrafts();
      if (target === 'view-settings') loadSettings();
    } catch (e) { console.error('Navigation Refresh Failed', e); }
  }

  navBtns.forEach(btn => {
    btn.onclick = () => switchView(btn.getAttribute('data-target'));
  });

  wTabBtns.forEach(btn => {
    btn.onclick = () => {
      const target = btn.getAttribute('data-w-tab');
      wTabBtns.forEach(b => b.classList.toggle('active', b === btn));
      masterTabContents.forEach(c => c.classList.toggle('active', c.id === target));
      if (target === 'master-view' && currentRecipeData) {
        const ct = currentRecipeData?.content_type || 'recipe_card';
        if (ct === 'recipe_card') renderRecipe(currentRecipeData, 'visual-view-integrated');
        else renderContentTypeView(currentRecipeData, ct, 'visual-view-integrated');
      }
      if (target === 'master-json' && currentRecipeData) {
        const jsonEl = document.getElementById('raw-json-editor');
        if (jsonEl) jsonEl.value = JSON.stringify(currentRecipeData, null, 2);
      }
    };
  });

  editorTabBtns.forEach(btn => {
    btn.onclick = () => {
      const target = btn.getAttribute('data-tab');
      editorTabBtns.forEach(b => b.classList.toggle('active', b === btn));
      editorSections.forEach(s => s.classList.toggle('active', s.id === target));
    };
  });

  if (closeWorkspaceBtn) closeWorkspaceBtn.onclick = () => {
    if (masterWorkspace) masterWorkspace.style.display = 'none';
  };

  // --- SETTINGS SIDEBAR TAB SWITCHING ---
  settingsTabBtns.forEach(btn => {
    btn.onclick = () => {
      const target = btn.getAttribute('data-settings-tab');
      settingsTabBtns.forEach(b => b.classList.toggle('active', b === btn));
      settingsSections.forEach(s => s.classList.toggle('active', s.id === target));

      // Lazy-load tab content on first click
      if (target === 'settings-prompts') loadPrompts();
      if (target === 'settings-logs') loadLogsPanel();
      if (target === 'settings-data') loadStats();
      if (target === 'settings-security') loadSecurityInfo();
      if (target === 'settings-account') { loadSessionInfo(); loadUsers(); }
    };
  });

  // --- PROVIDER TAB SWITCHING (within AI tab) ---
  providerTabBtns.forEach(btn => {
    btn.onclick = () => {
      currentProviderTab = btn.getAttribute('data-provider');
      providerTabBtns.forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.provider-config').forEach(c => {
        c.style.display = c.id === `provider-config-${currentProviderTab}` ? 'block' : 'none';
      });
    };
  });

  // --- KEY SHOW/HIDE TOGGLES ---
  document.querySelectorAll('.key-toggle-btn').forEach(btn => {
    btn.onclick = () => {
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
      btn.textContent = input.type === 'password' ? '👁' : '🙈';
    };
  });

  // --- AI TAB: SAVE CONFIGURATION ---
  if (saveAiBtn) {
    saveAiBtn.onclick = async () => {
      try {
        saveAiBtn.disabled = true;
        saveAiBtn.textContent = 'Saving...';
        const settingsToSave = buildAiSettingsPayload();
        await apiCall('/settings', 'POST', { settings: settingsToSave });
        showAlert(aiTestResult, '✓ Configuration saved.', 'success');
      } catch (err) {
        showAlert(aiTestResult, `Save failed: ${err.message}`, 'error');
      } finally {
        saveAiBtn.disabled = false;
        saveAiBtn.textContent = 'Save Configuration';
      }
    };
  }

  // --- AI TAB: SET AS ACTIVE PROVIDER ---
  if (setActiveProviderBtn) {
    setActiveProviderBtn.onclick = async () => {
      try {
        setActiveProviderBtn.disabled = true;
        // Save current config + set ai_provider in one request
        const settingsToSave = buildAiSettingsPayload();
        settingsToSave.push({ key: 'ai_provider', value: currentProviderTab });
        await apiCall('/settings', 'POST', { settings: settingsToSave });
        updateActiveBadge(currentProviderTab);
        showAlert(aiTestResult, `✓ ${capitalize(currentProviderTab)} is now the active AI provider.`, 'success');
      } catch (err) {
        showAlert(aiTestResult, `Failed: ${err.message}`, 'error');
      } finally {
        setActiveProviderBtn.disabled = false;
      }
    };
  }

  function buildAiSettingsPayload() {
    const out = [];
    // Always include current provider's settings; skip if empty (for sensitive keys with no new value)
    if (currentProviderTab === 'ollama') {
      if (configUrl?.value) out.push({ key: 'ollama_url', value: configUrl.value });
      if (configModel?.value) out.push({ key: 'ollama_model', value: configModel.value });
    } else if (currentProviderTab === 'claude') {
      const key = document.getElementById('config-claude-key')?.value;
      const model = document.getElementById('config-claude-model')?.value;
      if (key) out.push({ key: 'claude_api_key', value: key });
      if (model) out.push({ key: 'claude_model', value: model });
    } else if (currentProviderTab === 'openai') {
      const key = document.getElementById('config-openai-key')?.value;
      const model = document.getElementById('config-openai-model')?.value;
      if (key) out.push({ key: 'openai_api_key', value: key });
      if (model) out.push({ key: 'openai_model', value: model });
    } else if (currentProviderTab === 'gemini') {
      const key = document.getElementById('config-gemini-key')?.value;
      const model = document.getElementById('config-gemini-model')?.value;
      if (key) out.push({ key: 'gemini_api_key', value: key });
      if (model) out.push({ key: 'gemini_model', value: model });
    }
    return out;
  }

  // --- AI TAB: TEST CONNECTION ---
  if (testAiBtn) {
    testAiBtn.onclick = async () => {
      testAiBtn.disabled = true;
      testAiBtn.textContent = 'Testing...';
      if (aiTestResult) aiTestResult.style.display = 'none';
      try {
        const payload = { provider: currentProviderTab };
        if (currentProviderTab === 'ollama') {
          payload.url = configUrl?.value;
          payload.model = configModel?.value;
        }
        const res = await apiCall('/health-check-ai', 'POST', payload);
        if (res.success) {
          let msg = `✓ Connection successful!`;
          if (res.models?.length) {
            msg += ` ${res.models.length} models found.`;
            // Populate Ollama datalist
            if (currentProviderTab === 'ollama') {
              const list = document.getElementById('ollama-model-list');
              if (list) {
                list.innerHTML = '';
                res.models.forEach(m => {
                  const opt = document.createElement('option');
                  opt.value = m;
                  list.appendChild(opt);
                });
              }
            }
          }
          showAlert(aiTestResult, msg, 'success');
        } else {
          showAlert(aiTestResult, `✗ ${res.error || 'Connection failed'}`, 'error');
        }
      } catch (err) {
        showAlert(aiTestResult, `✗ ${err.message}`, 'error');
      } finally {
        testAiBtn.disabled = false;
        testAiBtn.textContent = 'Test Connection';
      }
    };
  }

  // --- GENERATION DEFAULTS FORM ---
  if (generationDefaultsForm) {
    generationDefaultsForm.onsubmit = async (e) => {
      e.preventDefault();
      const msgEl = document.getElementById('gen-defaults-msg');
      try {
        await apiCall('/settings', 'POST', {
          settings: [
            { key: 'default_goal',         value: document.getElementById('default-goal')?.value || '' },
            { key: 'default_meal_type',    value: document.getElementById('default-meal-type')?.value || '' },
            { key: 'default_batch_amount', value: String(document.getElementById('default-batch-amount')?.value || '1') },
          ],
        });
        showAlert(msgEl, '✓ Generation defaults saved.', 'success');
        // Apply to generator form immediately
        applyGenerationDefaultsFromForm();
      } catch (err) {
        showAlert(msgEl, `Failed: ${err.message}`, 'error');
      }
    };
  }

  // --- ACCOUNT: CHANGE PASSWORD ---
  if (changePasswordForm) {
    changePasswordForm.onsubmit = async (e) => {
      e.preventDefault();
      const msgEl = document.getElementById('pw-change-msg');
      const currentPw = document.getElementById('current-password')?.value || '';
      const newPw = document.getElementById('new-password')?.value || '';
      const confirmPw = document.getElementById('confirm-password')?.value || '';

      if (newPw !== confirmPw) {
        showAlert(msgEl, 'New passwords do not match.', 'error');
        return;
      }
      if (newPw.length < 12) {
        showAlert(msgEl, 'New password must be at least 12 characters.', 'error');
        return;
      }

      try {
        await apiCall('/auth/change-password', 'POST', { currentPassword: currentPw, newPassword: newPw });
        showAlert(msgEl, '✓ Password changed successfully. Update your .env ADMIN_PASSWORD if you intend to use it as fallback.', 'success');
        changePasswordForm.reset();
      } catch (err) {
        showAlert(msgEl, `Failed: ${err.message}`, 'error');
      }
    };
  }

  // --- LOGS TAB ---
  async function loadLogsPanel() {
    const container = document.getElementById('logs-panel-container');
    if (!container) return;
    container.innerHTML = '<p style="color:var(--text-muted);">Loading...</p>';
    try {
      const type = logTypeFilter?.value || '';
      const limit = parseInt(logLimitInput?.value, 10) || 100;
      const params = new URLSearchParams({ limit });
      if (type) params.set('type', type);
      const logs = await apiCall(`/logs?${params}`);
      renderLogsTable(container, logs);
    } catch (err) {
      container.innerHTML = `<p style="color:#ef4444;">Failed to load logs: ${escapeHtml(err.message)}</p>`;
    }
  }

  function renderLogsTable(container, logs) {
    if (!logs.length) {
      container.innerHTML = '<p style="color:var(--text-muted);padding:1rem 0;">No log entries found.</p>';
      return;
    }
    const typeColors = {
      sys: '#10b981', ai: '#00d9ff', db: '#a855f7', val: '#eab308',
      success: '#10b981', error: '#ef4444', auth_success: '#10b981', auth_fail: '#ef4444',
      ai_stream: '#444',
    };
    let html = `<table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
      <thead><tr style="border-bottom:1px solid var(--glass-border);text-align:left;">
        <th style="padding:0.5rem 1rem;color:var(--text-muted);width:160px;">Time</th>
        <th style="padding:0.5rem 1rem;color:var(--text-muted);width:100px;">Type</th>
        <th style="padding:0.5rem 1rem;color:var(--text-muted);">Message</th>
      </tr></thead><tbody>`;
    logs.forEach(log => {
      const color = typeColors[log.type] || '#94a3b8';
      const ts = log.timestamp ? new Date(log.timestamp).toLocaleString() : '';
      html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.03);">
        <td style="padding:0.4rem 1rem;color:var(--text-muted);white-space:nowrap;">${escapeHtml(ts)}</td>
        <td style="padding:0.4rem 1rem;"><span style="color:${color};font-weight:600;font-size:0.7rem;text-transform:uppercase;">${escapeHtml(log.type || '')}</span></td>
        <td style="padding:0.4rem 1rem;word-break:break-word;">${escapeHtml(log.message || '')}</td>
      </tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
  }

  if (refreshLogsBtn) refreshLogsBtn.onclick = loadLogsPanel;

  if (logTypeFilter) logTypeFilter.onchange = loadLogsPanel;

  if (clearLogsBtn) {
    clearLogsBtn.onclick = async () => {
      if (!confirm('Delete all log entries older than 30 days?')) return;
      try {
        const res = await apiCall('/logs', 'DELETE', { days: 30 });
        await loadLogsPanel();
        alert(`Cleared ${res.deleted} old log entries.`);
      } catch (err) {
        alert(`Failed: ${err.message}`);
      }
    };
  }

  // --- DATA TAB: STATS ---
  async function loadStats() {
    try {
      const stats = await apiCall('/admin/stats');
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      set('stat-total-recipes', stats.recipes?.total ?? '—');
      set('stat-draft-recipes', stats.recipes?.draft ?? '—');
      set('stat-final-recipes', stats.recipes?.final ?? '—');
      set('stat-log-entries',   stats.logs?.total   ?? '—');
    } catch { /* non-fatal */ }
  }

  // --- DATA TAB: EXPORT ---
  if (exportDbBtn) {
    exportDbBtn.onclick = async () => {
      try {
        const token = getToken();
        const res = await fetch('/api/export', {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) { alert('Export failed.'); return; }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `nutrition-ai-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) { alert(`Export failed: ${err.message}`); }
    };
  }

  // --- DATA TAB: IMPORT ---
  if (importDbBtn) {
    importDbBtn.onclick = async () => {
      const resultEl = document.getElementById('import-result');
      const file = importFile?.files?.[0];
      if (!file) { showAlert(resultEl, 'Please select a JSON file first.', 'error'); return; }

      importDbBtn.disabled = true;
      importDbBtn.textContent = 'Importing...';
      showAlert(resultEl, 'Reading file...', 'info');

      try {
        const text = await file.text();
        const json = JSON.parse(text);
        const recipes = Array.isArray(json.recipes) ? json.recipes : [];
        const settings = Array.isArray(json.settings) ? json.settings : [];
        const jobs = Array.isArray(json.jobs) ? json.jobs : [];
        if (!recipes.length && !settings.length && !jobs.length) {
          showAlert(resultEl, 'No importable data found in file.', 'error');
          return;
        }
        const payload = {};
        if (recipes.length) payload.recipes = recipes;
        if (settings.length) payload.settings = settings;
        if (jobs.length) payload.jobs = jobs;
        const res = await apiCall('/import', 'POST', payload);
        const parts = [];
        if (res.recipes) parts.push(`recipes: ${res.recipes.imported} imported, ${res.recipes.skipped} skipped`);
        if (res.settings) parts.push(`settings: ${res.settings.imported} imported, ${res.settings.skipped} skipped`);
        if (res.jobs) parts.push(`jobs: ${res.jobs.imported} imported, ${res.jobs.skipped} skipped`);
        showAlert(resultEl, `✓ Import complete — ${parts.join(' | ')}`, 'success');
        loadStats();
      } catch (err) {
        showAlert(resultEl, `Import failed: ${err.message}`, 'error');
      } finally {
        importDbBtn.disabled = false;
        importDbBtn.textContent = 'Import';
      }
    };
  }

  // --- DATA TAB: CLEAR DRAFTS ---
  if (clearDraftsBtn) {
    clearDraftsBtn.onclick = async () => {
      if (!confirm('Permanently delete ALL draft recipes? This cannot be undone.')) return;
      try {
        const drafts = await apiCall('/recipes?status=draft&limit=100');
        const ids = (drafts.data || []).map(r => r.id);
        if (!ids.length) { alert('No drafts to delete.'); return; }
        await apiCall('/recipes/bulk', 'POST', { ids, action: 'delete' });
        alert(`Deleted ${ids.length} draft recipe(s).`);
        loadStats();
        refreshDrafts();
      } catch (err) { alert(`Failed: ${err.message}`); }
    };
  }

  // --- SECURITY TAB ---
  async function loadSecurityInfo() {
    try {
      // Show allowed origins
      const info = await apiCall('/system-info');
      const el = document.getElementById('allowed-origins-display');
      if (el && info.allowedOrigins) {
        el.textContent = info.allowedOrigins.join(', ');
      }
    } catch { /* non-fatal */ }

    // Load recent auth events
    try {
      const authLogs = await apiCall('/logs?type=auth_fail&limit=10');
      const successLogs = await apiCall('/logs?type=auth_success&limit=10');
      const combined = [...authLogs, ...successLogs]
        .sort((a, b) => b.id - a.id)
        .slice(0, 15);
      const container = document.getElementById('auth-events-container');
      if (container) renderLogsTable(container, combined);
    } catch { /* non-fatal */ }
  }

  // --- ACCOUNT TAB: SESSION INFO ---
  const ROLE_COLORS = { admin: '#a855f7', editor: '#3b82f6', viewer: '#64748b' };
  function loadSessionInfo() {
    const token = getToken();
    const container = document.getElementById('session-info');
    if (!container) return;
    if (!token) { container.innerHTML = '<p style="color:var(--text-muted);">Not logged in.</p>'; return; }
    try {
      const [, payload] = token.split('.');
      const data = JSON.parse(atob(payload));
      const issued = data.iat ? new Date(data.iat * 1000).toLocaleString() : 'Unknown';
      const expires = data.exp ? new Date(data.exp * 1000).toLocaleString() : 'Unknown';
      const now = Math.floor(Date.now() / 1000);
      const remaining = data.exp ? Math.max(0, data.exp - now) : 0;
      const hrs = Math.floor(remaining / 3600);
      const mins = Math.floor((remaining % 3600) / 60);
      const role = data.role || 'admin';
      const roleColor = ROLE_COLORS[role] || '#64748b';
      container.innerHTML = `
        <table style="font-size:0.9rem;border-collapse:collapse;width:100%;">
          <tr><td style="padding:0.4rem 0;color:var(--text-muted);width:140px;">Username</td><td><strong>${escapeHtml(data.username || '—')}</strong></td></tr>
          <tr><td style="padding:0.4rem 0;color:var(--text-muted);">Role</td><td><span class="role-badge" style="background:${roleColor}20;color:${roleColor};border:1px solid ${roleColor}40;border-radius:4px;padding:2px 8px;font-size:0.75rem;font-weight:600;text-transform:uppercase;">${escapeHtml(role)}</span></td></tr>
          <tr><td style="padding:0.4rem 0;color:var(--text-muted);">Issued</td><td>${escapeHtml(issued)}</td></tr>
          <tr><td style="padding:0.4rem 0;color:var(--text-muted);">Expires</td><td>${escapeHtml(expires)}</td></tr>
          <tr><td style="padding:0.4rem 0;color:var(--text-muted);">Remaining</td><td style="color:${remaining < 3600 ? '#ef4444' : '#10b981'};">${hrs}h ${mins}m</td></tr>
        </table>`;
    } catch {
      container.innerHTML = '<p style="color:var(--text-muted);">Could not decode session token.</p>';
    }
  }

  // --- TERMINAL LOGGING ---
  const terminal = document.getElementById('ai-terminal');
  let lastLogId = 0;

  // Cancel run button — shown only while LIVE
  const cancelJobBtn = document.getElementById('cancel-job-btn');
  if (cancelJobBtn) {
    cancelJobBtn.onclick = async () => {
      cancelJobBtn.disabled = true;
      cancelJobBtn.textContent = '⏳ Stopping…';
      try {
        await apiCall('/jobs/cancel-all', 'POST');
      } catch { /* ignore — worker will detect cancelled status on next iteration */ }
      finally {
        cancelJobBtn.disabled = false;
        cancelJobBtn.textContent = '◼ STOP ALL';
      }
    };
  }

  async function pollLogs() {
    if (!getToken()) return;
    try {
      try {
        const statusRes = await apiCall('/worker-status');
        const statusBadge = document.getElementById('terminal-status');
        if (statusBadge && statusRes) {
          if (statusRes.isProcessing) {
            statusBadge.style.background = 'rgba(0,255,204,0.1)';
            statusBadge.style.borderColor = 'rgba(0,255,204,0.3)';
            statusBadge.style.color = '#00ffcc';
            statusBadge.innerHTML = '<span class="pulse-dot" style="width: 8px; height: 8px; background: #00ffcc; border-radius: 50%; box-shadow: 0 0 10px #00ffcc;"></span> LIVE';
            // Show cancel button and attach active job ID
            if (cancelJobBtn) {
              cancelJobBtn.dataset.jobId = statusRes.activeJobId || '';
              cancelJobBtn.style.display = 'inline-flex';
              cancelJobBtn.style.alignItems = 'center';
            }
          } else {
            statusBadge.style.background = 'rgba(255,255,255,0.05)';
            statusBadge.style.borderColor = 'rgba(255,255,255,0.1)';
            statusBadge.style.color = '#666';
            statusBadge.innerHTML = '<span style="width: 8px; height: 8px; background: #666; border-radius: 50%;"></span> IDLE';
            // Hide cancel button when idle
            if (cancelJobBtn) cancelJobBtn.style.display = 'none';
          }
        }
      } catch { /* status fail is non-fatal */ }

      // --- QUEUE PANEL ---
      try {
        const jobs = await apiCall('/jobs');
        const queueList = document.getElementById('job-queue-list');
        const queueBadge = document.getElementById('queue-count-badge');
        const emptyState = document.getElementById('queue-empty-state');
        if (queueList && Array.isArray(jobs)) {
          const active = jobs
            .filter(j => j.status === 'pending' || j.status === 'processing')
            .sort((a, b) => {
              // Running job always first
              if (a.status === 'processing' && b.status !== 'processing') return -1;
              if (b.status === 'processing' && a.status !== 'processing') return 1;
              // Then oldest to newest by id
              return a.id - b.id;
            });
          if (queueBadge) queueBadge.textContent = `${active.length} job${active.length !== 1 ? 's' : ''}`;

          // Only re-render when the set of active job ids changes (avoids flicker)
          const newIds = active.map(j => `${j.id}:${j.status}:${j.progress}`).join(',');
          if (queueList.dataset.lastIds !== newIds) {
            queueList.dataset.lastIds = newIds;

            // Remove existing job cards (keep the empty state element)
            Array.from(queueList.querySelectorAll('.queue-job-card')).forEach(el => el.remove());

            if (active.length === 0) {
              if (emptyState) emptyState.style.display = 'flex';
            } else {
              if (emptyState) emptyState.style.display = 'none';
              active.forEach(job => {
                const isProcessing = job.status === 'processing';
                const pct = job.progress != null ? Math.round(job.progress * 100) : 0;
                const label = (job.goal || '').length > 48
                  ? (job.goal || '').slice(0, 48) + '…'
                  : (job.goal || '—');
                const ctLabel = (job.content_type || 'recipe_card').replace(/_/g, ' ');
                const amtLabel = job.amount > 1 ? ` ×${job.amount}` : '';

                const card = document.createElement('div');
                card.className = 'queue-job-card';
                card.dataset.jobId = job.id;
                card.style.cssText = `
                  background: ${isProcessing ? 'rgba(0,255,204,0.06)' : 'rgba(255,255,255,0.03)'};
                  border: 1px solid ${isProcessing ? 'rgba(0,255,204,0.2)' : 'rgba(255,255,255,0.06)'};
                  border-radius: 5px;
                  padding: 0.3rem 0.5rem;
                  margin-bottom: 0.25rem;
                  font-family: 'Fira Code', monospace;
                  font-size: 0.68rem;
                `;

                card.innerHTML = `
                  <div style="display:flex; align-items:center; justify-content:space-between; gap:0.4rem;">
                    <div style="display:flex; align-items:center; gap:0.4rem; flex:1; min-width:0; overflow:hidden;">
                      ${isProcessing
                        ? `<span class="pulse-dot" style="width:5px;height:5px;background:#00ffcc;border-radius:50%;flex-shrink:0;box-shadow:0 0 5px #00ffcc;"></span>
                           <span style="color:#00ffcc;font-size:0.6rem;font-weight:700;flex-shrink:0;">RUN</span>`
                        : `<span style="width:5px;height:5px;background:#eab308;border-radius:50%;flex-shrink:0;"></span>
                           <span style="color:#eab308;font-size:0.6rem;flex-shrink:0;">WAIT</span>`}
                      <span style="color:#444;font-size:0.6rem;flex-shrink:0;">#${job.id}</span>
                      <span style="color:#aaa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(job.goal || '')}">${escapeHtml(label)}</span>
                      <span style="color:#444;font-size:0.6rem;flex-shrink:0;">${escapeHtml(ctLabel)}${amtLabel}</span>
                      ${isProcessing && pct > 0 ? `<span style="color:#00ffcc;font-size:0.6rem;flex-shrink:0;">${pct}%</span>` : ''}
                    </div>
                    <button class="queue-cancel-btn" data-job-id="${job.id}" style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);color:#ef4444;font-family:monospace;font-size:0.6rem;padding:1px 5px;border-radius:3px;cursor:pointer;flex-shrink:0;" title="Cancel">&#9632;</button>
                  </div>
                `;

                // Wire per-card cancel button
                const btn = card.querySelector('.queue-cancel-btn');
                if (btn) {
                  btn.onclick = async (ev) => {
                    ev.stopPropagation();
                    const jid = btn.dataset.jobId;
                    btn.disabled = true;
                    btn.textContent = '…';
                    try {
                      await apiCall(`/jobs/${jid}/cancel`, 'POST');
                      card.style.opacity = '0.4';
                      card.style.pointerEvents = 'none';
                    } catch { btn.disabled = false; btn.textContent = '◼'; }
                  };
                }

                queueList.appendChild(card);
              });
            }
          }
        }
      } catch { /* queue panel fail is non-fatal */ }

      const logs = await apiCall(`/logs?since=${lastLogId}`);
      if (logs && logs.length > 0) {
        logs.forEach(log => {
          if (!terminal) return;

          let color = '#ffffff';
          let prefix = '';

          if (log.type === 'ai') { color = '#00d9ff'; prefix = '[AI_CORE] '; }
          if (log.type === 'ai_stream') { color = '#444'; prefix = ''; }
          if (log.type === 'db') { color = '#a855f7'; prefix = '[DB_ENGINE] '; }
          if (log.type === 'val') { color = '#eab308'; prefix = '[VAL_LOGIC] '; }
          if (log.type === 'sys') { color = '#10b981'; prefix = '[SYSTEM] '; }
          if (log.type === 'success') {
            color = '#10b981';
            prefix = '[SUCCESS] ';
            refreshDrafts();
          }
          if (log.type === 'error') { color = '#ef4444'; prefix = '[ERROR] '; }

          if (log.type === 'ai_stream') {
            let streamSpan = terminal.querySelector('.current-stream');
            if (!streamSpan) {
              streamSpan = document.createElement('span');
              streamSpan.className = 'current-stream';
              streamSpan.style.color = '#555';
              streamSpan.style.fontSize = '0.75rem';
              terminal.appendChild(streamSpan);
            }
            streamSpan.textContent += log.message;
          } else {
            const div = document.createElement('div');
            div.style.marginBottom = '4px';
            div.style.color = color;

            const oldStream = terminal.querySelector('.current-stream');
            if (oldStream) oldStream.classList.remove('current-stream');

            const tsSpan = document.createElement('span');
            tsSpan.style.cssText = 'color:#444; font-size:0.7rem;';
            tsSpan.textContent = `[${new Date(log.timestamp).toLocaleTimeString()}]`;
            const prefixEl = document.createElement('strong');
            prefixEl.textContent = prefix;
            div.appendChild(tsSpan);
            div.appendChild(document.createTextNode(' '));
            div.appendChild(prefixEl);
            div.appendChild(document.createTextNode(log.message));
            terminal.appendChild(div);
          }

          lastLogId = log.id;
        });
        if (terminal) terminal.scrollTop = terminal.scrollHeight;

        // children[0] is the flex spacer — never remove it
        if (terminal.children.length > 501) {
          for (let i = 0; i < 100; i++) {
            const child = terminal.children[1];
            if (child) terminal.removeChild(child);
          }
        }
      }
    } catch { /* silent poll fail */ }
  }
  // --- SYNC PANEL HEIGHTS ---
  // Lock the terminal panel to exactly the same height as the form panel.
  // Must fire AFTER fonts + layout are complete — offsetHeight returns 0 if
  // called too early. We use three triggers to guarantee it fires correctly.
  function syncPanelHeights() {
    const formPanel = document.getElementById('form-container');
    const terminalPanel = document.getElementById('terminal-panel');
    if (!formPanel || !terminalPanel) return;
    const h = formPanel.offsetHeight;
    if (h > 0) terminalPanel.style.height = h + 'px';
  }
  // 1. After fonts/images fully loaded
  window.addEventListener('load', syncPanelHeights);
  // 2. Double-rAF: runs after browser completes at least one full layout pass
  requestAnimationFrame(() => requestAnimationFrame(syncPanelHeights));
  // 3. Resize
  window.addEventListener('resize', syncPanelHeights);

  pollLogs();
  setInterval(pollLogs, 5000);

  // --- GENERATION ---
  if (recipeForm) {
    recipeForm.onsubmit = async (e) => {
      e.preventDefault();
      const goalEl = document.getElementById('goal-select');
      const mealEl = document.getElementById('meal-type');
      const extraEl = document.getElementById('extra-details');
      const batchEl = document.getElementById('batch-amount');

      if (!goalEl || !mealEl) return;

      const goal = goalEl.value;
      const mealType = mealEl.value;
      const extraDetails = extraEl?.value || '';
      const amount = parseInt(batchEl?.value) || 1;

      const contentType = selectedContentTypeInput?.value || 'recipe_card';
      let fullGoal = `A ${mealType} recipe designed for ${goal}.`;
      if (extraDetails) fullGoal += ` Additional details: ${extraDetails}`;

      if (terminal) {
        const msg = document.createElement('div');
        msg.style.color = '#00ffcc';
        msg.style.marginTop = '10px';
        msg.textContent = `[SYSTEM] Production Run Requested: ${amount} ${contentType.replace(/_/g,' ')}(s). Initializing background worker...`;
        terminal.appendChild(msg);
      }

      try {
        await apiCall('/jobs', 'POST', { goal: fullGoal, amount, content_type: contentType });
        const draftInterval = setInterval(async () => {
          await refreshDrafts();
          const res = await apiCall('/jobs');
          const activeJob = res.find(j => j.status === 'processing' || j.status === 'pending');
          if (!activeJob) clearInterval(draftInterval);
        }, 3000);
      } catch (err) { console.error(err); }
    };
  }

  // --- NUTRITION EXTRACTION HELPER ---
  // Handles the varying data shapes produced by different AI content types.
  // LLMs sometimes use 'nutrition' instead of 'estimated_nutrition_per_serving',
  // or 'carbs_g' instead of 'carbohydrates_g'. This helper normalises all variants.
  function extractNutrition(recipe) {
    const data = recipe.data;
    const ct = recipe.content_type || 'recipe_card';
    let raw = null;

    if (ct === 'meal_prep_guide') {
      // Nutrition lives inside meals[0].recipe
      const firstRecipe = Array.isArray(data?.meals) ? data.meals[0]?.recipe : null;
      raw = firstRecipe?.estimated_nutrition_per_serving
         || firstRecipe?.nutrition
         || null;
    } else {
      // recipe_card: top-level estimated_nutrition_per_serving
      // blog_post / social_hit / email_newsletter: data.recipe.estimated_nutrition_per_serving
      // Fallbacks: data.recipe.nutrition (AI field-name drift)
      //            data.recipe.recipe_card.* (AI adds extra nesting)
      const r = data?.recipe;
      raw = r?.estimated_nutrition_per_serving
         || r?.nutrition
         || r?.recipe_card?.estimated_nutrition_per_serving
         || r?.recipe_card?.nutrition
         || data?.estimated_nutrition_per_serving
         || null;
    }

    if (!raw) return null;
    return {
      calories:       raw.calories        || 0,
      protein_g:      raw.protein_g       || raw.protein   || 0,
      fat_g:          raw.fat_g           || raw.fat        || 0,
      // AI sometimes outputs carbs_g instead of carbohydrates_g
      carbohydrates_g: raw.carbohydrates_g || raw.carbs_g  || raw.carbs || 0,
    };
  }

  // Extract meal_type from wherever the specific content type stores it.
  // Falls back to parsing the meal_slot string ("Monday Breakfast" → "breakfast")
  // so meal_prep_guide always shows a value even if the AI omitted the field.
  function extractMealType(recipe) {
    const data = recipe.data;
    const ct = recipe.content_type || 'recipe_card';

    if (ct === 'meal_prep_guide') {
      // Prefer explicit field, then derive from first meal slot string
      const explicit = data?.meals?.[0]?.recipe?.meal_type;
      if (explicit) return explicit;
      const slot = (data?.meals?.[0]?.meal_slot || '').toLowerCase();
      if (slot.includes('breakfast')) return 'breakfast';
      if (slot.includes('lunch'))     return 'lunch';
      if (slot.includes('dinner'))    return 'dinner';
      if (slot.includes('snack'))     return 'snack';
      return 'multi-meal';
    }

    if (ct === 'email_newsletter') {
      return data?.recipe?.meal_type
          || data?.recipe?.recipe_card?.meal_type
          || data?.meal_type
          || '-';
    }

    // recipe_card, blog_post, social_hit
    return data?.recipe?.meal_type
        || data?.meal_type
        || '-';
  }

  // Normalise a recipe object IN PLACE before the Structured Editor renders it.
  // Handles field-name drift and format differences from old AI-generated records:
  //   - nutrition → estimated_nutrition_per_serving
  //   - "10 minutes" string times → time.{prep_minutes, cook_minutes, total_minutes}
  //   - string ingredients → {name, display_quantity, estimated_nutrition_total} objects
  //   - string instructions → {step_number, instruction} objects
  //   - missing storage object → default storage
  // Mutations propagate to currentRecipeData (live reference), so saves persist the upgrade.
  function normaliseRecipeInPlace(recipe) {
    if (!recipe || typeof recipe !== 'object') return;

    // Nutrition field name
    if (!recipe.estimated_nutrition_per_serving && recipe.nutrition) {
      const raw = recipe.nutrition;
      recipe.estimated_nutrition_per_serving = {
        calories:        raw.calories        || 0,
        protein_g:       raw.protein_g       || raw.protein       || 0,
        carbohydrates_g: raw.carbohydrates_g || raw.carbs_g || raw.carbs || 0,
        fat_g:           raw.fat_g           || raw.fat           || 0,
        fiber_g:         raw.fiber_g         || raw.fiber         || 0,
        sugar_g:         raw.sugar_g         || raw.sugar         || 0,
        sodium_mg:       raw.sodium_mg       || raw.sodium        || 0,
      };
    }

    // Time: flat strings ("10 minutes") or flat numbers → nested object
    if (!recipe.time || typeof recipe.time !== 'object') {
      const toMin = v => {
        if (!v && v !== 0) return 0;
        if (typeof v === 'number') return v;
        const m = String(v).match(/(\d+)/);
        return m ? parseInt(m[1], 10) : 0;
      };
      recipe.time = {
        prep_minutes:  toMin(recipe.prep_time_minutes  || recipe.prep_time  || recipe.prep_minutes)  || 0,
        cook_minutes:  toMin(recipe.cook_time_minutes  || recipe.cook_time  || recipe.cook_minutes)  || 0,
        total_minutes: toMin(recipe.total_time_minutes || recipe.total_time || recipe.total_minutes) || 0,
      };
    }

    // Ingredients: string → structured object
    if (Array.isArray(recipe.ingredients)) {
      recipe.ingredients = recipe.ingredients.map(ing => {
        if (typeof ing === 'string') {
          return {
            name: ing,
            display_quantity: '',
            estimated_nutrition_total: { calories: 0, protein_g: 0, carbohydrates_g: 0, fat_g: 0 },
          };
        }
        // Build display_quantity from quantity + unit if missing
        if (!ing.display_quantity && (ing.quantity || ing.unit)) {
          ing.display_quantity = `${ing.quantity || ''} ${ing.unit || ''}`.trim();
        }
        // Ensure per-ingredient nutrition object exists
        if (!ing.estimated_nutrition_total) {
          ing.estimated_nutrition_total = { calories: 0, protein_g: 0, carbohydrates_g: 0, fat_g: 0 };
        }
        return ing;
      });
    }

    // Instructions: string → {step_number, instruction}
    if (Array.isArray(recipe.instructions)) {
      recipe.instructions = recipe.instructions.map((inst, idx) => {
        if (typeof inst === 'string') {
          return { step_number: idx + 1, instruction: inst };
        }
        return inst;
      });
    }

    // Ensure storage object exists
    if (!recipe.storage || typeof recipe.storage !== 'object') {
      recipe.storage = { refrigerator_days: 5, freezer_months: 2, notes: '' };
    }
    if (recipe.storage.food_safety === undefined) {
      recipe.storage.food_safety = '';
    }

    // Convert legacy array macro_adjustments → named-key object.
    // Old schema generated [{goal, adjustment}]; new schema uses {higher_protein, lower_carbohydrate}.
    if (Array.isArray(recipe.macro_adjustments)) {
      const obj = { higher_protein: '', lower_carbohydrate: '' };
      recipe.macro_adjustments.forEach(item => {
        if (item.goal && item.adjustment) {
          const key = item.goal.toLowerCase().replace(/[\s-]+/g, '_');
          obj[key] = item.adjustment;
        }
      });
      recipe.macro_adjustments = obj;
    }
    if (!recipe.macro_adjustments || typeof recipe.macro_adjustments !== 'object' || Array.isArray(recipe.macro_adjustments)) {
      recipe.macro_adjustments = { higher_protein: '', lower_carbohydrate: '' };
    }
    if (recipe.macro_adjustments.higher_protein === undefined) recipe.macro_adjustments.higher_protein = '';
    if (recipe.macro_adjustments.lower_carbohydrate === undefined) recipe.macro_adjustments.lower_carbohydrate = '';
  }

  // Returns the recipe sub-object the Structured Editor should read/write.
  // For recipe_card this IS the full data object.
  // For all other types it is the embedded recipe nested inside the wrapper.
  // currentEditableRecipe is a live JS reference — mutations propagate back to
  // currentRecipeData automatically (no merge step needed on save).
  function getEditableRecipe(data, contentType) {
    switch (contentType) {
      case 'meal_prep_guide':
        return data?.meals?.[0]?.recipe || data;
      case 'blog_post':
      case 'social_hit':
      case 'email_newsletter':
        // After DB migration, recipe is always at data.recipe.
        // Keep the legacy recipe_card fallback for any un-migrated records.
        return data?.recipe?.recipe_card || data?.recipe || data;
      default: // recipe_card
        return data;
    }
  }

  // --- DRAFTS INBOX ---
  async function refreshDrafts() {
    try {
      const res = await apiCall('/recipes?status=draft&limit=50');
      const drafts = res.data || [];
      const tbody = document.getElementById('draft-table-body');
      if (!tbody) return;

      if (drafts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="padding: 2rem; text-align: center; color: var(--text-muted);">No drafts currently in production.</td></tr>';
        return;
      }

      tbody.innerHTML = '';
      drafts.forEach(recipe => {
        const row = document.createElement('tr');
        row.style.borderBottom = '1px solid var(--glass-border)';
        const isSelected = selectedDraftIds.has(recipe.id);
        const ct = recipe.content_type || 'recipe_card';
        const ctLabel = CT_LABELS[ct] || ct;
        const nut = extractNutrition(recipe);

        row.innerHTML = `
          <td style="padding: 1rem;"><input type="checkbox" class="draft-row-checkbox" value="${escapeHtml(String(recipe.id))}" ${isSelected ? 'checked' : ''}></td>
          <td style="padding: 1rem; font-weight: bold;" class="draft-title-cell"></td>
          <td style="padding: 1rem;"><span class="content-type-badge badge-${escapeHtml(ct)} draft-ct-cell"></span></td>
          <td style="padding: 1rem; color: var(--primary-color);" class="draft-meal-cell"></td>
          <td style="padding: 1rem; font-size: 0.8rem; color: var(--text-muted);" class="draft-nut-cell"></td>
          <td style="padding: 1rem; text-align: right; white-space: nowrap;">
            <button class="primary-btn finalize-btn" style="padding: 2px 8px; font-size: 0.7rem; background: #10b981;">Finalize</button>
            <button class="secondary-btn edit-btn" style="padding: 2px 8px; font-size: 0.7rem;">Edit</button>
            <button class="secondary-btn convert-btn" style="padding: 2px 8px; font-size: 0.7rem;">Convert</button>
            <button class="danger-btn delete-btn" style="padding: 2px 8px; font-size: 0.7rem;">&times;</button>
          </td>
        `;
        row.querySelector('.draft-title-cell').textContent = recipe.title;
        row.querySelector('.draft-ct-cell').textContent = ctLabel;
        row.querySelector('.draft-meal-cell').textContent = extractMealType(recipe);
        row.querySelector('.draft-nut-cell').textContent = nut
          ? `${nut.calories} kcal | ${nut.protein_g}g P | ${nut.fat_g}g F | ${nut.carbohydrates_g}g C`
          : '—';

        row.querySelector('.draft-row-checkbox').onchange = (e) => {
          if (e.target.checked) selectedDraftIds.add(recipe.id);
          else selectedDraftIds.delete(recipe.id);
          updateDraftBulkToolbar();
        };

        row.querySelector('.finalize-btn').onclick = async () => {
          await apiCall(`/recipes/${recipe.id}/finalize`, 'POST');
          selectedDraftIds.delete(recipe.id);
          updateDraftBulkToolbar();
          refreshDrafts();
        };
        row.querySelector('.edit-btn').onclick = () => openWorkspace(recipe, 'master-edit');
        row.querySelector('.convert-btn').onclick = () => openConvertModal(recipe);
        row.querySelector('.delete-btn').onclick = async () => {
          if (confirm('Delete this draft?')) {
            await apiCall(`/recipes/${recipe.id}`, 'DELETE');
            refreshDrafts();
          }
        };
        tbody.appendChild(row);
      });
    } catch (e) { console.error('Draft Refresh Failed', e); }
  }

  // --- CONVERT (recipe → new content type) ---
  let convertSourceRecipe = null;

  function openConvertModal(recipe) {
    convertSourceRecipe = recipe;
    const modal = document.getElementById('convert-modal');
    const select = document.getElementById('convert-target-select');
    const label = document.getElementById('convert-source-label');
    const msg = document.getElementById('convert-msg');
    if (!modal || !select) return;

    const sourceCt = recipe.content_type || 'recipe_card';
    if (label) label.textContent = `Source: "${recipe.title}" (${CT_FULL_LABELS[sourceCt] || sourceCt})`;
    if (msg) { msg.style.display = 'none'; msg.textContent = ''; }

    // Offer every valid target except the source's own type.
    select.innerHTML = '';
    CONVERT_TARGETS.filter(t => t !== sourceCt).forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = CT_FULL_LABELS[t] || t;
      select.appendChild(opt);
    });

    modal.style.display = 'flex';
  }

  function closeConvertModal() {
    const modal = document.getElementById('convert-modal');
    if (modal) modal.style.display = 'none';
    convertSourceRecipe = null;
  }

  async function submitConversion() {
    const select = document.getElementById('convert-target-select');
    const msg = document.getElementById('convert-msg');
    if (!convertSourceRecipe || !select) return;
    const target = select.value;
    try {
      await apiCall(`/recipes/${convertSourceRecipe.id}/convert`, 'POST', { target_content_type: target });
      showAlert(msg, '✓ Conversion queued — check the Drafts inbox shortly.', 'success');
      setTimeout(closeConvertModal, 1500);
    } catch (err) {
      showAlert(msg, `Failed: ${err.message}`, 'error');
    }
  }

  const convertSubmitBtn = document.getElementById('convert-submit-btn');
  if (convertSubmitBtn) convertSubmitBtn.onclick = submitConversion;
  const convertCancelBtn = document.getElementById('convert-cancel-btn');
  if (convertCancelBtn) convertCancelBtn.onclick = closeConvertModal;

  // --- LIBRARY ---
  async function refreshLibrary() {
    try {
      const search = document.getElementById('lib-search')?.value || '';
      const mealFilter = document.getElementById('lib-filter-meal')?.value || '';
      const goalFilter = document.getElementById('lib-filter-goal')?.value || '';
      const typeFilter = document.getElementById('lib-filter-type')?.value || '';
      const sort = document.getElementById('lib-sort')?.value || 'created_desc';

      const recipeRes = await apiCall(`/recipes?page=${currentPage}&limit=${currentLimit}&search=${encodeURIComponent(search)}&status=final&meal_type=${encodeURIComponent(mealFilter)}&goal=${encodeURIComponent(goalFilter)}&content_type=${encodeURIComponent(typeFilter)}&sort=${encodeURIComponent(sort)}`);
      const recipes = recipeRes.data || [];
      const total = recipeRes.total || 0;
      const totalPages = recipeRes.totalPages || 1;

      const tableBody = document.getElementById('recipe-table-body');
      if (tableBody) {
        tableBody.innerHTML = '';
        recipes.forEach(recipe => {
          const row = document.createElement('tr');
          row.style.borderBottom = '1px solid var(--glass-border)';
          const isSelected = selectedRecipeIds.has(recipe.id);
          // Use shared extractNutrition / extractMealType helpers so non-recipe_card
          // types (blog_post, social_hit, email_newsletter, meal_prep_guide) show
          // correct values instead of 0 kcal / "—".
          const nut = extractNutrition(recipe) || { calories: 0, protein_g: 0, fat_g: 0, carbohydrates_g: 0 };
          const ct = recipe.content_type || 'recipe_card';

          row.innerHTML = `
            <td style="padding: 1rem;"><input type="checkbox" class="row-checkbox" value="${escapeHtml(String(recipe.id))}" ${isSelected ? 'checked' : ''}></td>
            <td style="padding: 1rem; font-weight: bold;" class="lib-title-cell"></td>
            <td style="padding: 1rem;"><span class="content-type-badge badge-${escapeHtml(ct)} lib-ct-cell"></span></td>
            <td style="padding: 1rem; color: var(--primary-color);" class="lib-meal-cell"></td>
            <td style="padding: 1rem; font-size: 0.8rem; color: var(--text-muted);">
              ${escapeHtml(String(nut.calories))} kcal |
              ${escapeHtml(String(nut.protein_g))}g P |
              ${escapeHtml(String(nut.fat_g))}g F |
              ${escapeHtml(String(nut.carbohydrates_g))}g C
            </td>
            <td style="padding: 1rem; text-align: right;">
              <button class="secondary-btn view-btn" style="padding: 2px 8px; font-size: 0.7rem;">View</button>
              <button class="secondary-btn edit-btn" style="padding: 2px 8px; font-size: 0.7rem;">Edit</button>
              <button class="secondary-btn convert-btn" style="padding: 2px 8px; font-size: 0.7rem;">Convert</button>
            </td>
          `;
          row.querySelector('.lib-title-cell').textContent = recipe.title;
          row.querySelector('.lib-ct-cell').textContent = CT_LABELS[ct] || ct;
          row.querySelector('.lib-meal-cell').textContent = extractMealType(recipe);

          row.querySelector('.row-checkbox').onchange = (e) => {
            if (e.target.checked) selectedRecipeIds.add(recipe.id);
            else selectedRecipeIds.delete(recipe.id);
            updateBulkToolbar();
          };

          row.querySelector('.view-btn').onclick = () => openWorkspace(recipe, 'master-view');
          row.querySelector('.edit-btn').onclick = () => openWorkspace(recipe, 'master-edit');
          row.querySelector('.convert-btn').onclick = () => openConvertModal(recipe);
          tableBody.appendChild(row);
        });

        const pageInfo = document.getElementById('page-info');
        const prevBtn = document.getElementById('page-prev-btn');
        const nextBtn = document.getElementById('page-next-btn');

        if (pageInfo) pageInfo.textContent = `Showing ${(currentPage - 1) * currentLimit + 1}–${Math.min(currentPage * currentLimit, total)} of ${total}`;
        if (prevBtn) {
          prevBtn.disabled = currentPage <= 1;
          prevBtn.onclick = () => { currentPage--; refreshLibrary(); };
        }
        if (nextBtn) {
          nextBtn.disabled = currentPage >= totalPages;
          nextBtn.onclick = () => { currentPage++; refreshLibrary(); };
        }
      }
    } catch (e) { console.error('Library Refresh Failed', e); }
  }

  function updateBulkToolbar() {
    const toolbar = document.getElementById('bulk-action-toolbar');
    const countSpan = document.getElementById('bulk-selection-count');
    const selectAllCb = document.getElementById('select-all-checkbox');

    if (toolbar && countSpan) {
      if (selectedRecipeIds.size > 0) {
        toolbar.style.display = 'flex';
        countSpan.textContent = `${selectedRecipeIds.size} Selected`;
      } else {
        toolbar.style.display = 'none';
        if (selectAllCb) selectAllCb.checked = false;
      }
    }
  }

  function updateDraftBulkToolbar() {
    const toolbar = document.getElementById('draft-bulk-toolbar');
    const countSpan = document.getElementById('draft-selection-count');
    const selectAllCb = document.getElementById('select-all-drafts');

    if (toolbar && countSpan) {
      if (selectedDraftIds.size > 0) {
        toolbar.style.display = 'flex';
        countSpan.textContent = `${selectedDraftIds.size} Selected`;
      } else {
        toolbar.style.display = 'none';
        if (selectAllCb) selectAllCb.checked = false;
      }
    }
  }

  const selectAllDraftsCb = document.getElementById('select-all-drafts');
  if (selectAllDraftsCb) {
    selectAllDraftsCb.onchange = (e) => {
      const rowCbs = document.querySelectorAll('.draft-row-checkbox');
      if (e.target.checked) {
        rowCbs.forEach(cb => { cb.checked = true; selectedDraftIds.add(parseInt(cb.value)); });
      } else {
        rowCbs.forEach(cb => { cb.checked = false; selectedDraftIds.delete(parseInt(cb.value)); });
      }
      updateDraftBulkToolbar();
    };
  }

  const bulkFinalizeBtn = document.getElementById('bulk-finalize-btn');
  if (bulkFinalizeBtn) {
    bulkFinalizeBtn.onclick = async () => {
      const ids = Array.from(selectedDraftIds);
      for (const id of ids) {
        await apiCall(`/recipes/${id}/finalize`, 'POST');
      }
      selectedDraftIds.clear();
      updateDraftBulkToolbar();
      refreshDrafts();
      refreshLibrary();
    };
  }

  const bulkDraftDeleteBtn = document.getElementById('bulk-draft-delete-btn');
  if (bulkDraftDeleteBtn) {
    bulkDraftDeleteBtn.onclick = async () => {
      if (confirm(`Delete ${selectedDraftIds.size} drafts?`)) {
        await apiCall('/recipes/bulk', 'POST', { ids: Array.from(selectedDraftIds), action: 'delete' });
        selectedDraftIds.clear();
        updateDraftBulkToolbar();
        refreshDrafts();
      }
    };
  }

  ['lib-search', 'lib-filter-meal', 'lib-filter-goal', 'lib-filter-type', 'lib-sort'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => { currentPage = 1; refreshLibrary(); });
    if (id === 'lib-search' && el) {
      el.addEventListener('keyup', (e) => { if (e.key === 'Enter') { currentPage = 1; refreshLibrary(); } });
    }
  });

  const selectAllCb = document.getElementById('select-all-checkbox');
  if (selectAllCb) {
    selectAllCb.onchange = (e) => {
      const rowCbs = document.querySelectorAll('.row-checkbox');
      if (e.target.checked) {
        rowCbs.forEach(cb => { cb.checked = true; selectedRecipeIds.add(parseInt(cb.value)); });
      } else {
        rowCbs.forEach(cb => { cb.checked = false; selectedRecipeIds.delete(parseInt(cb.value)); });
      }
      updateBulkToolbar();
    };
  }

  const bulkApproveBtn = document.getElementById('bulk-approve-btn');
  if (bulkApproveBtn) {
    bulkApproveBtn.onclick = async () => {
      await apiCall('/recipes/bulk', 'POST', { ids: Array.from(selectedRecipeIds), action: 'approve' });
      selectedRecipeIds.clear();
      updateBulkToolbar();
      refreshLibrary();
    };
  }

  const bulkDeleteBtn = document.getElementById('bulk-delete-btn');
  if (bulkDeleteBtn) {
    bulkDeleteBtn.onclick = async () => {
      if (confirm(`Delete ${selectedRecipeIds.size} items?`)) {
        await apiCall('/recipes/bulk', 'POST', { ids: Array.from(selectedRecipeIds), action: 'delete' });
        selectedRecipeIds.clear();
        updateBulkToolbar();
        refreshLibrary();
      }
    };
  }

  // --- WORKSPACE EDITOR ---
  function getNestedValue(obj, path) {
    return path.split('.').reduce((prev, curr) => (prev ? prev[curr] : null), obj);
  }

  function setNestedValue(obj, path, value) {
    const parts = path.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) current[parts[i]] = {};
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
  }

  function renderListEditor(container, data, path) {
    container.innerHTML = '';
    (data || []).forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'list-editor-item';
      row.innerHTML = `
        <textarea style="flex: 1;"></textarea>
        <button class="danger-btn remove-btn" style="padding: 4px 12px;">&times;</button>
      `;
      row.querySelector('textarea').value = item;
      row.querySelector('.remove-btn').onclick = () => {
        data.splice(index, 1);
        renderListEditor(container, data, path);
      };
      row.querySelector('textarea').oninput = (e) => { data[index] = e.target.value; };
      container.appendChild(row);
    });
    const addBtn = document.createElement('button');
    addBtn.className = 'secondary-btn';
    addBtn.textContent = '+ Add Item';
    addBtn.onclick = (e) => {
      e.preventDefault();
      data.push('');
      renderListEditor(container, data, path);
    };
    container.appendChild(addBtn);
  }

  function renderIngredientsEditor(container, ingredients) {
    container.innerHTML = '';
    (ingredients || []).forEach((ing, index) => {
      const row = document.createElement('div');
      row.className = 'ingredient-edit-row';
      row.innerHTML = `
        <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;">
          <input type="text" placeholder="Qty" class="ing-qty" style="flex: 1;">
          <input type="text" placeholder="Ingredient" class="ing-name" style="flex: 3;">
          <button class="danger-btn remove-btn">&times;</button>
        </div>
        <div class="ing-macro-row">
          <div class="ing-macro-input"><label>Cal</label><input type="number" class="ing-cal"></div>
          <div class="ing-macro-input"><label>Prot</label><input type="number" class="ing-prot"></div>
          <div class="ing-macro-input"><label>Carb</label><input type="number" class="ing-carb"></div>
          <div class="ing-macro-input"><label>Fat</label><input type="number" class="ing-fat"></div>
        </div>
      `;
      row.querySelector('.ing-qty').value = ing.display_quantity || '';
      row.querySelector('.ing-name').value = ing.name || '';
      row.querySelector('.ing-cal').value = ing.estimated_nutrition_total?.calories || 0;
      row.querySelector('.ing-prot').value = ing.estimated_nutrition_total?.protein_g || 0;
      row.querySelector('.ing-carb').value = ing.estimated_nutrition_total?.carbohydrates_g || 0;
      row.querySelector('.ing-fat').value = ing.estimated_nutrition_total?.fat_g || 0;
      row.querySelector('.remove-btn').onclick = () => {
        ingredients.splice(index, 1);
        renderIngredientsEditor(container, ingredients);
      };
      row.querySelectorAll('input').forEach(input => {
        input.oninput = () => {
          ing.display_quantity = row.querySelector('.ing-qty').value;
          ing.name = row.querySelector('.ing-name').value;
          ing.estimated_nutrition_total = {
            calories: parseInt(row.querySelector('.ing-cal').value) || 0,
            protein_g: parseInt(row.querySelector('.ing-prot').value) || 0,
            carbohydrates_g: parseInt(row.querySelector('.ing-carb').value) || 0,
            fat_g: parseInt(row.querySelector('.ing-fat').value) || 0,
          };
        };
      });
      container.appendChild(row);
    });
    const addBtn = document.createElement('button');
    addBtn.className = 'secondary-btn';
    addBtn.textContent = '+ Add Ingredient';
    addBtn.onclick = (e) => {
      e.preventDefault();
      ingredients.push({ name: '', display_quantity: '', estimated_nutrition_total: {} });
      renderIngredientsEditor(container, ingredients);
    };
    container.appendChild(addBtn);
  }

  function renderInstructionsEditor(container, instructions) {
    container.innerHTML = '';
    (instructions || []).forEach((inst, index) => {
      const row = document.createElement('div');
      row.className = 'instruction-edit-row';
      row.innerHTML = `
        <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;">
          <span style="padding: 0.5rem; color: var(--text-muted); font-size: 0.8rem;">Step ${escapeHtml(String(inst.step_number || index + 1))}</span>
          <textarea style="flex: 1;"></textarea>
          <button class="danger-btn remove-btn">&times;</button>
        </div>
      `;
      row.querySelector('textarea').value = inst.instruction || inst;
      row.querySelector('.remove-btn').onclick = () => {
        instructions.splice(index, 1);
        renderInstructionsEditor(container, instructions);
      };
      row.querySelector('textarea').oninput = (e) => {
        if (typeof instructions[index] === 'object') {
          instructions[index].instruction = e.target.value;
        } else {
          instructions[index] = e.target.value;
        }
      };
      container.appendChild(row);
    });
    const addBtn = document.createElement('button');
    addBtn.className = 'secondary-btn';
    addBtn.textContent = '+ Add Step';
    addBtn.onclick = (e) => {
      e.preventDefault();
      if (!instructions) instructions = [];
      instructions.push({ step_number: (instructions.length || 0) + 1, instruction: '' });
      renderInstructionsEditor(container, instructions);
    };
    container.appendChild(addBtn);
  }

  function openWorkspace(recipe, startTab = 'master-view') {
    currentRecipeId = recipe.id;
    currentRecipeData = typeof recipe.data === 'string' ? JSON.parse(recipe.data) : recipe.data;

    const ct = recipe.content_type || currentRecipeData?.content_type || 'recipe_card';
    currentContentType = ct;

    // Point the Structured Editor at the correct recipe sub-object.
    // For recipe_card this IS currentRecipeData; for all other types it is the
    // embedded recipe nested inside (e.g. data.recipe or data.meals[0].recipe).
    // Because this is a live JS reference, any writes via setNestedValue()
    // automatically propagate back into currentRecipeData — no merge needed.
    currentEditableRecipe = getEditableRecipe(currentRecipeData, ct);

    // Normalise the editable recipe in-place: convert string ingredients/instructions
    // to objects, flat time strings to {prep_minutes, cook_minutes}, old 'nutrition'
    // field name to 'estimated_nutrition_per_serving', etc.
    // Mutations propagate to currentRecipeData, so saving permanently upgrades old records.
    normaliseRecipeInPlace(currentEditableRecipe);

    if (ct === 'recipe_card') {
      renderRecipe(currentRecipeData, 'visual-view-integrated');
    } else {
      renderContentTypeView(currentRecipeData, ct, 'visual-view-integrated');
    }
    const jsonEl = document.getElementById('raw-json-editor');
    if (jsonEl) jsonEl.value = JSON.stringify(currentRecipeData, null, 2);

    wTabBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-w-tab') === startTab));
    masterTabContents.forEach(c => c.classList.toggle('active', c.id === startTab));

    // Populate all [data-path] form inputs from the editable recipe sub-object
    const inputs = document.querySelectorAll('#master-editor-form [data-path]');
    inputs.forEach(input => {
      const path = input.getAttribute('data-path');
      const value = getNestedValue(currentEditableRecipe, path);
      if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
        input.value = value || '';
      }
    });

    // Populate list editors (equipment, preparation_notes, etc.) from editable recipe
    const listContainers = document.querySelectorAll('.list-editor-container');
    listContainers.forEach(c => {
      const path = c.getAttribute('data-path');
      if (!currentEditableRecipe[path]) currentEditableRecipe[path] = [];
      renderListEditor(c, currentEditableRecipe[path], path);
    });

    // Populate ingredients and instructions editors from editable recipe
    renderIngredientsEditor(document.getElementById('structured-ingredients-editor'), currentEditableRecipe.ingredients);
    renderInstructionsEditor(document.getElementById('structured-instructions-editor'), currentEditableRecipe.instructions);

    // Show info banner for content types where the structured editor has known scope limitations
    const structuredEditorBanner = document.getElementById('structured-editor-banner');
    if (structuredEditorBanner) {
      if (ct === 'meal_prep_guide') {
        structuredEditorBanner.textContent = 'Structured Editor shows Meal Slot 1 only. Use Raw JSON to edit additional meal slots.';
        structuredEditorBanner.style.display = 'block';
      } else {
        structuredEditorBanner.style.display = 'none';
      }
    }

    if (masterWorkspace) masterWorkspace.style.display = 'flex';
  }

  if (masterSaveBtn) {
    masterSaveBtn.onclick = async () => {
      // Write [data-path] input values into the editable recipe sub-object.
      // Since currentEditableRecipe is a live reference into currentRecipeData,
      // currentRecipeData is updated automatically at the correct nested path.
      const inputs = document.querySelectorAll('#master-editor-form [data-path]');
      inputs.forEach(input => {
        const path = input.getAttribute('data-path');
        if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
          setNestedValue(currentEditableRecipe, path, input.value);
        }
      });

      try {
        // Use the recipe's own title field; fall back to wrapper title
        const saveTitle = currentEditableRecipe?.title || currentRecipeData?.title;
        // For wrapped content types the editable recipe is nested inside currentRecipeData.
        // Sync the top-level wrapper title so visual preview renders the updated title after save.
        if (currentContentType !== 'recipe_card' && saveTitle && currentRecipeData.title !== undefined) {
          currentRecipeData.title = saveTitle;
        }
        await apiCall(`/recipes/${currentRecipeId}`, 'PUT', {
          title: saveTitle,
          data: currentRecipeData,
          status: 'draft',
        });
        alert('Changes saved successfully.');
        if (currentContentType === 'recipe_card') {
          renderRecipe(currentRecipeData, 'visual-view-integrated');
        } else {
          renderContentTypeView(currentRecipeData, currentContentType, 'visual-view-integrated');
        }
        refreshLibrary();
      } catch { alert('Error saving changes.'); }
    };
  }

  // --- HELPERS ---
  function showAlert(el, message, type = 'info') {
    if (!el) return;
    el.textContent = message;
    el.className = `settings-alert settings-alert-${type}`;
    el.style.display = 'block';
  }

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function updateActiveBadge(provider) {
    const labelEl = document.getElementById('active-provider-label');
    const modelEl  = document.getElementById('active-model-label');
    if (labelEl) labelEl.textContent = capitalize(provider);
    if (modelEl) {
      const modelMap = {
        ollama: configModel?.value || 'llama3',
        claude: document.getElementById('config-claude-model')?.value || '',
        openai: document.getElementById('config-openai-model')?.value || '',
        gemini: document.getElementById('config-gemini-model')?.value || '',
      };
      modelEl.textContent = modelMap[provider] || '';
    }
  }

  function applyGenerationDefaultsFromForm() {
    const goal   = document.getElementById('default-goal')?.value;
    const meal   = document.getElementById('default-meal-type')?.value;
    const batch  = document.getElementById('default-batch-amount')?.value;
    const goalEl  = document.getElementById('goal-select');
    const mealEl  = document.getElementById('meal-type');
    const batchEl = document.getElementById('batch-amount');
    if (goal  && goalEl)  goalEl.value  = goal;
    if (meal  && mealEl)  mealEl.value  = meal;
    if (batch && batchEl) batchEl.value = batch;
  }

  // --- AI LLM CALLS (prompt registry) ---
  async function loadPrompts() {
    const list = document.getElementById('prompts-list');
    if (!list) return;
    const isAdmin = getUserRole() === 'admin';
    list.innerHTML = '<p style="color:var(--text-muted);">Loading prompts…</p>';
    try {
      const res = await apiCall('/prompts');
      const prompts = res.prompts || [];
      list.innerHTML = '';
      prompts.forEach(p => {
        const card = document.createElement('div');
        card.className = 'glass-panel';
        card.style.cssText = 'padding:1.25rem;margin-bottom:1.5rem;';
        card.dataset.key = p.key;

        const isCustom = p.source === 'custom';
        const badgeText = isCustom
          ? '⚡ Custom — overrides the built-in default'
          : '✓ Using built-in default';
        const badgeClass = isCustom ? 'settings-alert-info' : 'settings-alert-success';

        card.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;flex-wrap:wrap;">
            <div style="flex:1;min-width:240px;">
              <h4 style="margin:0 0 0.35rem;">${escapeHtml(p.name)}</h4>
              <p style="margin:0;color:var(--text-muted);font-size:0.85rem;">${escapeHtml(p.description)}</p>
            </div>
            <span class="prompt-badge settings-alert ${badgeClass}" style="white-space:nowrap;font-size:0.75rem;">${badgeText}</span>
          </div>
          <textarea class="code-editor prompt-textarea" style="height:30vh;font-family:monospace;margin-top:1rem;width:100%;"></textarea>
          <div class="prompt-actions" style="display:${isAdmin ? 'flex' : 'none'};gap:1rem;margin-top:0.75rem;flex-wrap:wrap;">
            <button type="button" class="primary-btn prompt-save-btn">💾 Save</button>
            <button type="button" class="danger-btn prompt-reset-btn">↺ Reset to Default</button>
          </div>
          <div class="prompt-msg settings-alert" style="display:none;margin-top:0.75rem;"></div>
        `;

        const textarea = card.querySelector('.prompt-textarea');
        textarea.value = p.value;
        textarea.readOnly = !isAdmin;

        const msgEl = card.querySelector('.prompt-msg');
        const saveBtn = card.querySelector('.prompt-save-btn');
        const resetBtn = card.querySelector('.prompt-reset-btn');

        if (saveBtn) saveBtn.onclick = () => savePrompt(p.key, textarea.value, msgEl);
        if (resetBtn) resetBtn.onclick = () => resetPrompt(p.key, p.name, msgEl);

        list.appendChild(card);
      });
      if (!prompts.length) {
        list.innerHTML = '<p style="color:var(--text-muted);">No prompts available.</p>';
      }
    } catch (e) {
      list.innerHTML = `<p style="color:#ef4444;">Failed to load prompts: ${escapeHtml(e.message)}</p>`;
    }
  }

  async function savePrompt(key, value, msgEl) {
    if (!value.trim()) { showAlert(msgEl, 'Prompt cannot be empty.', 'error'); return; }
    try {
      await apiCall(`/prompts/${encodeURIComponent(key)}`, 'PUT', { value });
      showAlert(msgEl, '✓ Saved.', 'success');
      await loadPrompts();
    } catch (err) { showAlert(msgEl, `Failed: ${err.message}`, 'error'); }
  }

  async function resetPrompt(key, name, msgEl) {
    if (!confirm(`Reset "${name}" to the built-in default? Your custom version will be permanently deleted.`)) return;
    try {
      await apiCall(`/prompts/${encodeURIComponent(key)}`, 'DELETE');
      showAlert(msgEl, '✓ Reset to built-in default.', 'success');
      await loadPrompts();
    } catch (err) { showAlert(msgEl, `Failed: ${err.message}`, 'error'); }
  }

  // --- LOAD SETTINGS FROM SERVER ---
  async function loadSettings() {
    if (getUserRole() !== 'admin') return;
    try {
      const rows = await apiCall('/settings');
      const map = Object.fromEntries(rows.map(s => [s.key, s.value]));

      // Ollama
      if (configUrl)   configUrl.value   = map.ollama_url   || '';
      if (configModel) configModel.value = map.ollama_model || '';

      // Claude
      const claudeKeyEl   = document.getElementById('config-claude-key');
      const claudeModelEl = document.getElementById('config-claude-model');
      if (claudeKeyEl) {
        if (map.claude_api_key === '•••••') {
          claudeKeyEl.value = '';
          claudeKeyEl.placeholder = '••••• (saved — enter new key to change)';
        } else {
          claudeKeyEl.value = map.claude_api_key || '';
        }
      }
      if (claudeModelEl && map.claude_model) claudeModelEl.value = map.claude_model;

      // OpenAI
      const openaiKeyEl   = document.getElementById('config-openai-key');
      const openaiModelEl = document.getElementById('config-openai-model');
      if (openaiKeyEl) {
        if (map.openai_api_key === '•••••') {
          openaiKeyEl.value = '';
          openaiKeyEl.placeholder = '••••• (saved — enter new key to change)';
        } else {
          openaiKeyEl.value = map.openai_api_key || '';
        }
      }
      if (openaiModelEl && map.openai_model) openaiModelEl.value = map.openai_model;

      // Gemini
      const geminiKeyEl   = document.getElementById('config-gemini-key');
      const geminiModelEl = document.getElementById('config-gemini-model');
      if (geminiKeyEl) {
        if (map.gemini_api_key === '•••••') {
          geminiKeyEl.value = '';
          geminiKeyEl.placeholder = '••••• (saved — enter new key to change)';
        } else {
          geminiKeyEl.value = map.gemini_api_key || '';
        }
      }
      if (geminiModelEl && map.gemini_model) geminiModelEl.value = map.gemini_model;

      // Active provider badge
      const activeProvider = map.ai_provider || 'ollama';
      updateActiveBadge(activeProvider);

      // Generation defaults
      const defaultGoalEl  = document.getElementById('default-goal');
      const defaultMealEl  = document.getElementById('default-meal-type');
      const defaultBatchEl = document.getElementById('default-batch-amount');
      if (defaultGoalEl  && map.default_goal)         defaultGoalEl.value  = map.default_goal;
      if (defaultMealEl  && map.default_meal_type)    defaultMealEl.value  = map.default_meal_type;
      if (defaultBatchEl && map.default_batch_amount) defaultBatchEl.value = map.default_batch_amount;

      // Apply defaults to the generator form
      applyGenerationDefaultsFromForm();

    } catch (e) { console.warn('Settings could not be loaded from server.', e); }
  }

  // --- USER MANAGEMENT ---
  async function loadUsers() {
    const section = document.getElementById('user-mgmt-section');
    const container = document.getElementById('users-table-container');
    if (!section) return;

    // Show/hide the whole section based on role
    const role = getUserRole();
    section.style.display = role === 'admin' ? 'block' : 'none';
    if (role !== 'admin') return;

    if (!container) return;
    container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:1rem;">Loading…</p>';
    try {
      const users = await apiCall('/users');
      renderUsersTable(container, users);
    } catch (err) {
      container.innerHTML = `<p style="color:#ef4444;">Failed to load users: ${escapeHtml(err.message)}</p>`;
    }
  }

  function renderUsersTable(container, users) {
    if (!users.length) {
      container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:1rem;">No users found.</p>';
      return;
    }
    const currentUser = getUser();
    let html = `<table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
      <thead><tr style="border-bottom:1px solid var(--glass-border);text-align:left;">
        <th style="padding:0.5rem 0.75rem;color:var(--text-muted);">Username</th>
        <th style="padding:0.5rem 0.75rem;color:var(--text-muted);">Role</th>
        <th style="padding:0.5rem 0.75rem;color:var(--text-muted);">Status</th>
        <th style="padding:0.5rem 0.75rem;color:var(--text-muted);">Last Login</th>
        <th style="padding:0.5rem 0.75rem;color:var(--text-muted);">Actions</th>
      </tr></thead><tbody>`;
    users.forEach(u => {
      const roleColor = ROLE_COLORS[u.role] || '#64748b';
      const isSelf = currentUser && currentUser.user_id === u.id;
      const lastLogin = u.last_login ? new Date(u.last_login).toLocaleString() : 'Never';
      const statusBadge = u.is_active
        ? '<span style="color:#10b981;font-size:0.75rem;font-weight:600;">● Active</span>'
        : '<span style="color:#ef4444;font-size:0.75rem;font-weight:600;">● Inactive</span>';
      html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
        <td style="padding:0.5rem 0.75rem;font-weight:500;">${escapeHtml(u.username)}${isSelf ? ' <span style="color:var(--text-muted);font-size:0.7rem;">(you)</span>' : ''}</td>
        <td style="padding:0.5rem 0.75rem;"><span style="background:${roleColor}20;color:${roleColor};border:1px solid ${roleColor}40;border-radius:4px;padding:2px 8px;font-size:0.72rem;font-weight:600;text-transform:uppercase;">${escapeHtml(u.role)}</span></td>
        <td style="padding:0.5rem 0.75rem;">${statusBadge}</td>
        <td style="padding:0.5rem 0.75rem;color:var(--text-muted);font-size:0.8rem;">${escapeHtml(lastLogin)}</td>
        <td style="padding:0.5rem 0.75rem;">
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
            <button class="secondary-btn user-toggle-btn" data-uid="${u.id}" data-active="${u.is_active}" style="padding:2px 10px;font-size:0.75rem;" ${isSelf ? 'disabled' : ''}>${u.is_active ? 'Deactivate' : 'Activate'}</button>
            <button class="secondary-btn user-reset-pw-btn" data-uid="${u.id}" data-uname="${escapeHtml(u.username)}" style="padding:2px 10px;font-size:0.75rem;">Reset PW</button>
            <button class="danger-btn user-delete-btn" data-uid="${u.id}" data-uname="${escapeHtml(u.username)}" style="padding:2px 10px;font-size:0.75rem;" ${isSelf ? 'disabled' : ''}>Delete</button>
          </div>
        </td>
      </tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;

    // Wire up action buttons
    container.querySelectorAll('.user-toggle-btn').forEach(btn => {
      btn.onclick = async () => {
        const uid = parseInt(btn.getAttribute('data-uid'));
        const active = btn.getAttribute('data-active') === 'true';
        try {
          await apiCall(`/users/${uid}`, 'PUT', { is_active: !active });
          await loadUsers();
        } catch (err) { alert(`Failed: ${err.message}`); }
      };
    });

    container.querySelectorAll('.user-reset-pw-btn').forEach(btn => {
      btn.onclick = async () => {
        const uid = parseInt(btn.getAttribute('data-uid'));
        const uname = btn.getAttribute('data-uname');
        const newPw = prompt(`Enter new password for "${uname}" (min 8 chars):`);
        if (!newPw) return;
        if (newPw.length < 8) { alert('Password must be at least 8 characters.'); return; }
        try {
          await apiCall(`/users/${uid}/reset-password`, 'POST', { new_password: newPw });
          alert(`✓ Password reset for "${uname}".`);
        } catch (err) { alert(`Failed: ${err.message}`); }
      };
    });

    container.querySelectorAll('.user-delete-btn').forEach(btn => {
      btn.onclick = async () => {
        const uid = parseInt(btn.getAttribute('data-uid'));
        const uname = btn.getAttribute('data-uname');
        if (!confirm(`Permanently delete user "${uname}"? This cannot be undone.`)) return;
        try {
          await apiCall(`/users/${uid}`, 'DELETE');
          await loadUsers();
        } catch (err) { alert(`Failed: ${err.message}`); }
      };
    });
  }

  // Add User form toggle
  const addUserBtn = document.getElementById('add-user-btn');
  const addUserFormWrap = document.getElementById('add-user-form-wrap');
  const cancelAddUserBtn = document.getElementById('cancel-add-user-btn');
  const addUserForm = document.getElementById('add-user-form');

  if (addUserBtn) {
    addUserBtn.onclick = () => {
      if (addUserFormWrap) addUserFormWrap.style.display = addUserFormWrap.style.display === 'none' ? 'block' : 'none';
    };
  }
  if (cancelAddUserBtn) {
    cancelAddUserBtn.onclick = () => {
      if (addUserFormWrap) addUserFormWrap.style.display = 'none';
      if (addUserForm) addUserForm.reset();
    };
  }
  if (addUserForm) {
    addUserForm.onsubmit = async (e) => {
      e.preventDefault();
      const msgEl = document.getElementById('add-user-msg');
      const username = document.getElementById('new-user-username')?.value?.trim();
      const email = document.getElementById('new-user-email')?.value?.trim() || undefined;
      const password = document.getElementById('new-user-password')?.value;
      const role = document.getElementById('new-user-role')?.value;

      if (!username || !password || !role) {
        showAlert(msgEl, 'Username, password, and role are required.', 'error');
        return;
      }
      try {
        await apiCall('/users', 'POST', { username, email, password, role });
        showAlert(msgEl, `✓ User "${username}" created.`, 'success');
        addUserForm.reset();
        if (addUserFormWrap) addUserFormWrap.style.display = 'none';
        await loadUsers();
      } catch (err) { showAlert(msgEl, `Failed: ${err.message}`, 'error'); }
    };
  }

  // --- INITIALIZATION ---
  async function initApp() {
    try {
      applyRoleBasedUI();
      await loadSettings();
      await refreshDrafts();
      await refreshLibrary();
      loadSessionInfo();
    } catch (e) { console.error('Initial Load Failed', e); }
  }

  function applyRoleBasedUI() {
    const role = getUserRole();
    const isAdmin = role === 'admin';
    const isEditor = role === 'admin' || role === 'editor';

    // Hide job creation for viewers
    const formContainer = document.getElementById('form-container');
    if (formContainer) formContainer.style.display = isEditor ? '' : 'none';

    // Only the account tab remains visible to non-admin users.
    const adminOnlySettingsTabs = ['settings-ai', 'settings-generation', 'settings-security', 'settings-logs', 'settings-data', 'settings-prompts'];
    adminOnlySettingsTabs.forEach((tabId) => {
      const btn = document.querySelector(`.settings-tab-btn[data-settings-tab="${tabId}"]`);
      const section = document.getElementById(tabId);
      if (btn) btn.style.display = isAdmin ? '' : 'none';
      if (section && !isAdmin) section.classList.remove('active');
    });
    const accountBtn = document.querySelector('.settings-tab-btn[data-settings-tab="settings-account"]');
    const accountSection = document.getElementById('settings-account');
    if (!isAdmin) {
      settingsTabBtns.forEach(btn => btn.classList.toggle('active', btn === accountBtn));
      settingsSections.forEach(section => section.classList.toggle('active', section === accountSection));
    }

    // Settings save buttons hidden for non-admins
    const saveAiBtnEl = document.getElementById('save-ai-btn');
    if (saveAiBtnEl) saveAiBtnEl.style.display = isAdmin ? '' : 'none';
    const setActiveBtnEl = document.getElementById('set-active-provider-btn');
    if (setActiveBtnEl) setActiveBtnEl.style.display = isAdmin ? '' : 'none';
    const genDefaultsForm = document.getElementById('generation-defaults-form');
    if (genDefaultsForm) {
      const saveBtn = genDefaultsForm.querySelector('button[type="submit"]');
      if (saveBtn) saveBtn.style.display = isAdmin ? '' : 'none';
    }

    // Export/Import hidden for non-admins
    const exportBtn = document.getElementById('export-db-btn');
    if (exportBtn) exportBtn.style.display = isAdmin ? '' : 'none';
    const importFileEl = document.getElementById('import-file');
    if (importFileEl) importFileEl.style.display = isAdmin ? '' : 'none';
    const importBtnEl = document.getElementById('import-db-btn');
    if (importBtnEl) importBtnEl.style.display = isAdmin ? '' : 'none';
    // (AI LLM Calls prompt Save/Reset buttons are gated per-card in loadPrompts())
  }

  if (getToken()) {
    hideLoginScreen();
    initApp();
  } else {
    showLoginScreen();
  }

  setInterval(() => {
    if (!getToken()) return;
    try { refreshLibrary(); } catch { /* silent periodic refresh fail */ }
  }, 10000);
});
