function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ─── Recipe Normaliser ────────────────────────────────────────────────────────
// Different AI content types produce varied schemas. This normalises all
// variants to the shape renderRecipe expects, handling:
//   - recipe_card nesting (email newsletter AI quirk)
//   - 'nutrition' vs 'estimated_nutrition_per_serving' field name
//   - 'carbs_g' vs 'carbohydrates_g' field name
//   - string ingredients (AI omits object format)
//   - {name, quantity, unit} objects missing display_quantity
//   - "10 minutes" string times vs numeric {prep_minutes} objects
function normaliseRecipe(recipe) {
  if (!recipe || typeof recipe !== 'object') return null;

  // Unwrap extra recipe_card nesting (email newsletter AI quirk)
  if (!recipe.title && recipe.recipe_card && typeof recipe.recipe_card === 'object') {
    recipe = recipe.recipe_card;
  }
  if (!recipe.title) return null;

  // Normalise nutrition — handle field name variants from any provider
  const rawNut = recipe.estimated_nutrition_per_serving || recipe.nutrition || {};
  const normNut = {
    calories:        rawNut.calories        || 0,
    protein_g:       rawNut.protein_g       || rawNut.protein                   || 0,
    carbohydrates_g: rawNut.carbohydrates_g || rawNut.carbs_g || rawNut.carbs  || 0,
    fat_g:           rawNut.fat_g           || rawNut.fat                       || 0,
    fiber_g:         rawNut.fiber_g         || rawNut.fiber                     || 0,
    sugar_g:         rawNut.sugar_g         || rawNut.sugar                     || 0,
    sodium_mg:       rawNut.sodium_mg       || rawNut.sodium                    || 0,
  };

  // Parse minutes from a number or a string like "20 minutes" / "20 min" / 20
  function toMinutes(val) {
    if (!val && val !== 0) return 0;
    if (typeof val === 'number') return val;
    const m = String(val).match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  }

  // Normalise time — handle {prep_minutes} objects AND "10 minutes" strings
  const rawTime = recipe.time || {};
  const normTime = {
    prep_minutes:  rawTime.prep_minutes  || toMinutes(recipe.prep_time_minutes  || recipe.prep_time  || recipe.prep_minutes)  || 0,
    cook_minutes:  rawTime.cook_minutes  || toMinutes(recipe.cook_time_minutes  || recipe.cook_time  || recipe.cook_minutes)  || 0,
    total_minutes: rawTime.total_minutes || toMinutes(recipe.total_time_minutes || recipe.total_time || recipe.total_minutes) || 0,
  };

  // Normalise ingredients — handle three formats AI may produce:
  //   1. Plain string: "1 cup oats, rolled"
  //   2. Object {name, quantity, unit} — missing display_quantity
  //   3. Object {name, display_quantity} — already correct
  const normIngredients = (recipe.ingredients || []).map(ing => {
    if (typeof ing === 'string') {
      // Treat the whole string as the ingredient name for display
      return { name: ing, display_quantity: '', preparation: '' };
    }
    return {
      ...ing,
      display_quantity: ing.display_quantity
        || (ing.quantity && ing.unit ? `${ing.quantity} ${ing.unit}`.trim() : String(ing.quantity || '')),
    };
  });

  // Normalise storage field names
  const rawStorage = recipe.storage || {};
  const normStorage = {
    ...rawStorage,
    refrigeration: rawStorage.refrigeration || rawStorage.notes || '',
  };

  return {
    ...recipe,
    estimated_nutrition_per_serving: normNut,
    time: normTime,
    ingredients: normIngredients,
    storage: normStorage,
  };
}

// ─── Content Type View Dispatcher ────────────────────────────────────────────

export function renderContentTypeView(data, contentType, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  switch (contentType) {
    case 'blog_post':         renderBlogPost(data, container);         break;
    case 'meal_prep_guide':   renderMealPrepGuide(data, container);    break;
    case 'social_hit':        renderSocialHit(data, container);        break;
    case 'email_newsletter':  renderEmailNewsletter(data, container);  break;
    default:                  renderRecipe(data, containerId);         break;
  }
}

// ─── Blog Post Renderer ───────────────────────────────────────────────────────

function renderBlogPost(data, container) {
  const seo = data.seo || {};
  const narrative = data.narrative || {};
  const engagement = data.engagement || {};
  const emailTeaser = data.email_teaser || {};
  const proTips = Array.isArray(data.pro_tips) ? data.pro_tips : [];
  const relatedTopics = Array.isArray(engagement.related_posts_topics) ? engagement.related_posts_topics : [];

  // SEO info row
  const seoRow = seo.meta_title ? `
    <div class="ct-highlight-box" style="display:flex;gap:1.5rem;flex-wrap:wrap;font-size:0.8rem;margin-bottom:0.5rem;">
      <div><span style="color:var(--text-muted);text-transform:uppercase;font-size:0.65rem;font-weight:700;">Focus Keyword</span><br>${escapeHtml(seo.focus_keyword || '')}</div>
      <div><span style="color:var(--text-muted);text-transform:uppercase;font-size:0.65rem;font-weight:700;">Read Time</span><br>${escapeHtml(String(seo.estimated_read_time_minutes || '?'))} min</div>
      <div style="flex:1;"><span style="color:var(--text-muted);text-transform:uppercase;font-size:0.65rem;font-weight:700;">Meta Description</span><br>${escapeHtml(seo.meta_description || '')}</div>
    </div>` : '';

  // Narrative section
  const storyParas = (narrative.personal_story || '').split(/\n+/).filter(Boolean)
    .map(p => `<p>${escapeHtml(p)}</p>`).join('');

  // Pro tips
  const tipsHtml = proTips.length
    ? `<ol class="ct-tips-list">${proTips.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ol>`
    : '<p style="color:var(--text-muted)">No pro tips provided.</p>';

  // Related topics
  const relatedHtml = relatedTopics.map(t => `<li>${escapeHtml(t)}</li>`).join('');

  // Email teaser
  const teaserHtml = emailTeaser.subject_line ? `
    <h2>📧 Email Teaser</h2>
    <div class="ct-email-preview">
      <div class="ct-email-header">
        <div style="font-weight:700;font-size:0.9rem;">${escapeHtml(emailTeaser.subject_line)}</div>
        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px;">${escapeHtml(emailTeaser.preview_text || '')}</div>
      </div>
      <div class="ct-email-body"><p>${escapeHtml(emailTeaser.teaser_body || '')}</p></div>
    </div>` : '';

  container.innerHTML = `<div class="ct-view">
    <h1>${escapeHtml(data.title || data.recipe?.title || 'Blog Post')}</h1>
    ${seoRow}
    <h2>🪝 Hook</h2>
    <div class="ct-hook">${escapeHtml(narrative.hook || '')}</div>
    <h2>📋 How to Make It Work</h2>
    ${storyParas}
    <h2>🥗 Why This Recipe</h2>
    <div class="ct-highlight-box"><p>${escapeHtml(narrative.why_this_recipe || '')}</p></div>
    <h2>🍽️ The Recipe</h2>
    <div id="blog-embedded-recipe"></div>
    <h2>💡 Pro Tips</h2>
    ${tipsHtml}
    <h2>💬 Engagement</h2>
    <div class="ct-engagement-block">
      <p><strong>Comment Prompt:</strong> ${escapeHtml(engagement.comment_prompt || '')}</p>
      <p><strong>Social Share:</strong> ${escapeHtml(engagement.social_share_line || '')}</p>
      ${relatedHtml ? `<p><strong>Related Topics:</strong></p><ul style="padding-left:1.25rem;color:var(--text-secondary);">${relatedHtml}</ul>` : ''}
    </div>
    ${teaserHtml}
  </div>`;

  // Render embedded recipe card inside the blog post
  const normRecipe = normaliseRecipe(data.recipe);
  if (normRecipe) {
    const embeddedContainer = document.getElementById('blog-embedded-recipe');
    if (embeddedContainer) renderRecipe(normRecipe, 'blog-embedded-recipe');
  }
}

// ─── Meal Prep Guide Renderer ─────────────────────────────────────────────────

function renderMealPrepGuide(data, container) {
  const meals = Array.isArray(data.meals) ? data.meals : [];
  const shoppingList = Array.isArray(data.shopping_list) ? data.shopping_list : [];

  const mealsHtml = meals.map((m, i) => `
    <div class="ct-meal-slot" id="prep-recipe-slot-${i}">
      <div class="ct-meal-slot-label">${escapeHtml(m.meal_slot || `Meal ${i + 1}`)}</div>
      <div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:0.5rem;">${escapeHtml(m.container_notes || '')}</div>
      <div id="prep-embedded-${i}" style="border-top:1px solid rgba(255,255,255,0.05);padding-top:0.75rem;margin-top:0.5rem;"></div>
    </div>`).join('');

  const shoppingRows = shoppingList.map(item => `
    <tr>
      <td>${escapeHtml(item.ingredient || '')}</td>
      <td>${escapeHtml(item.quantity || '')}</td>
      <td>${escapeHtml(item.category || '')}</td>
    </tr>`).join('');

  container.innerHTML = `<div class="ct-view">
    <h1>${escapeHtml(data.title || 'Meal Prep Guide')}</h1>
    <div class="ct-highlight-box" style="display:flex;gap:2rem;font-size:0.85rem;flex-wrap:wrap;">
      <div>📅 <strong>Prep Day:</strong> ${escapeHtml(data.prep_day || '—')}</div>
      <div>⏱️ <strong>Total Time:</strong> ${escapeHtml(String(data.total_prep_time_minutes || '—'))} min</div>
    </div>
    <h2>📋 Overview</h2>
    <p>${escapeHtml(data.intro || '')}</p>
    <h2>🥘 Meals</h2>
    ${mealsHtml}
    <h2>🛒 Shopping List</h2>
    <table class="ct-shopping-table">
      <thead><tr><th>Ingredient</th><th>Quantity</th><th>Category</th></tr></thead>
      <tbody>${shoppingRows}</tbody>
    </table>
    <h2>🧊 Storage</h2>
    <div class="ct-highlight-box"><p>${escapeHtml(data.storage_overview || '')}</p></div>
  </div>`;

  // Render each embedded recipe with field-name normalisation
  meals.forEach((m, i) => {
    const normRecipe = normaliseRecipe(m.recipe);
    if (normRecipe) renderRecipe(normRecipe, `prep-embedded-${i}`);
  });
}

// ─── Social Hit Renderer ─────────────────────────────────────────────────────

function renderSocialHit(data, container) {
  const ig = data.instagram_caption || {};
  const hashtags = Array.isArray(ig.hashtags) ? ig.hashtags : [];

  const hashtagHtml = hashtags.map(h => `<span class="ct-hashtag">${escapeHtml(h)}</span>`).join('');

  container.innerHTML = `<div class="ct-view">
    <h1>${escapeHtml(data.title || data.recipe?.title || 'Social Hit')}</h1>
    <div class="ct-social-card">
      <h2 style="margin-top:0;">📸 Instagram Caption</h2>
      <p style="font-size:1rem;font-weight:700;color:var(--text-primary);">${escapeHtml(ig.hook_line || '')}</p>
      <p>${escapeHtml(ig.body || '')}</p>
      <p style="color:#ef4444;"><em>${escapeHtml(ig.cta || '')}</em></p>
      <div class="ct-hashtags">${hashtagHtml}</div>
    </div>
    <h2>🎬 TikTok Hook (First 3 Seconds)</h2>
    <div class="ct-highlight-box">
      <p style="font-size:1rem;font-style:italic;">"${escapeHtml(data.tiktok_hook || '')}"</p>
    </div>
    <h2>♿ Alt Text</h2>
    <div class="ct-highlight-box"><p>${escapeHtml(data.alt_text || '')}</p></div>
    <h2>🍽️ The Recipe</h2>
    <div id="social-embedded-recipe"></div>
  </div>`;

  const normRecipe = normaliseRecipe(data.recipe);
  if (normRecipe) renderRecipe(normRecipe, 'social-embedded-recipe');
}

// ─── Email Newsletter Renderer ────────────────────────────────────────────────

function renderEmailNewsletter(data, container) {
  const cta = data.cta || {};

  container.innerHTML = `<div class="ct-view">
    <h1>${escapeHtml(data.title || data.recipe?.title || 'Email Newsletter')}</h1>
    <div class="ct-email-preview">
      <div class="ct-email-header">
        <div style="font-weight:700;">${escapeHtml(data.subject_line || '')}</div>
        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px;">${escapeHtml(data.preview_text || '')}</div>
      </div>
      <div class="ct-email-body">
        <p style="font-weight:600;">${escapeHtml(data.greeting || '')}</p>
        <p>${escapeHtml(data.intro_paragraph || '')}</p>
      </div>
    </div>
    <h2>🍽️ Featured Recipe</h2>
    <div id="email-embedded-recipe"></div>
    <h2>💡 Tip of the Week</h2>
    <div class="ct-highlight-box"><p>${escapeHtml(data.tip_of_the_week || '')}</p></div>
    <h2>📣 Call to Action</h2>
    <div class="ct-engagement-block">
      <p><strong>${escapeHtml(cta.text || '')}</strong> <code style="font-size:0.75rem;color:var(--text-muted);">${escapeHtml(cta.url_placeholder || '')}</code></p>
      ${cta.secondary_text ? `<p>${escapeHtml(cta.secondary_text)}</p>` : ''}
    </div>
    <p style="font-size:0.75rem;color:var(--text-muted);margin-top:1.5rem;">${escapeHtml(data.footer_note || '')}</p>
  </div>`;

  const normRecipe = normaliseRecipe(data.recipe);
  if (normRecipe) renderRecipe(normRecipe, 'email-embedded-recipe');
}

export function renderRecipe(recipe, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Always normalise before rendering — handles field-name drift from any caller
  const r = normaliseRecipe(recipe) || recipe;

  const macros = r.estimated_nutrition_per_serving || { calories: 0, protein_g: 0, carbohydrates_g: 0, fat_g: 0 };
  const time = r.time || { total_minutes: 0, prep_minutes: 0, cook_minutes: 0 };

  const html = `
    <div class="hfm-preview">
      <header class="hfm-hero">
        <h1 class="hfm-title">${escapeHtml(r.title || 'Untitled Recipe')}</h1>
        <p class="hfm-intro-text">${escapeHtml(r.description || '')}</p>
        <button class="hfm-jump-btn" onclick="document.getElementById('recipe-card').scrollIntoView({behavior:'smooth'})">
          Jump to Recipe ▼
        </button>
      </header>

      <div class="hfm-content-block">
        <section>
          <h2 class="hfm-section-title">Why I like making this recipe</h2>
          <p>${escapeHtml(r.fitness_rationale || '')}</p>
        </section>

        <section>
          <h2 class="hfm-section-title">Ingredients you will need</h2>
          ${r.preparation_notes?.[0] ? `<p style="color:#6b7280;font-size:0.95rem;margin-bottom:1.5rem;">${escapeHtml(r.preparation_notes[0])}</p>` : ''}
          <ul style="margin: 2rem 0; padding-left: 1.5rem;">
            ${(r.ingredients || []).map(ing => `<li><strong>${escapeHtml(ing.name)}</strong></li>`).join('')}
          </ul>
        </section>

        <div id="recipe-card" class="hfm-recipe-card">
          <div class="hfm-card-header">
            <h2 class="hfm-card-title">${escapeHtml(r.title || '')}</h2>
            <div class="hfm-card-meta">
              <span>Prep: ${escapeHtml(String(time.prep_minutes || 0))}m</span>
              <span>Cook: ${escapeHtml(String(time.cook_minutes || 0))}m</span>
              <span>Total: ${escapeHtml(String(time.total_minutes || 0))}m</span>
              <span>Servings: ${escapeHtml(String(r.servings || 0))}</span>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1.5fr; gap: 4rem;">
            <div>
              <h3 style="font-family: 'Playfair Display', serif; font-size: 1.5rem; margin-bottom: 1.5rem;">Ingredients</h3>
              <ul class="hfm-ing-list">
                ${(r.ingredients || []).map(ing => `
                  <li class="hfm-ing-item">
                    <span>${escapeHtml(ing.display_quantity || '')} ${escapeHtml(ing.name)}${ing.preparation ? ` (${escapeHtml(ing.preparation)})` : ''}</span>
                  </li>
                `).join('')}
              </ul>
            </div>

            <div>
              <h3 style="font-family: 'Playfair Display', serif; font-size: 1.5rem; margin-bottom: 1.5rem;">Instructions</h3>
              <div class="hfm-step-list">
                ${(r.instructions || []).map((inst, idx) => `
                  <div class="hfm-step-item">
                    <span class="hfm-step-num">Step ${idx + 1}</span>
                    <p style="margin: 0;">${escapeHtml(inst.instruction || String(inst))}</p>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>

          <div class="hfm-nutrition-box">
            <div><div class="hfm-nut-val">${escapeHtml(String(macros.calories))}</div><div class="hfm-nut-lab">Calories</div></div>
            <div><div class="hfm-nut-val">${escapeHtml(String(macros.protein_g))}g</div><div class="hfm-nut-lab">Protein</div></div>
            <div><div class="hfm-nut-val">${escapeHtml(String(macros.carbohydrates_g))}g</div><div class="hfm-nut-lab">Carbs</div></div>
            <div><div class="hfm-nut-val">${escapeHtml(String(macros.fat_g))}g</div><div class="hfm-nut-lab">Fat</div></div>
          </div>

          <div style="margin-top: 3rem; padding-top: 2rem; border-top: 1px solid #e5e7eb;">
            <h4 style="font-family: 'Playfair Display', serif; margin-bottom: 1rem;">Notes &amp; Tips</h4>
            <p style="font-size: 0.95rem; color: #6b7280;">
              ${escapeHtml(r.storage?.refrigeration || r.storage?.notes || 'Store in airtight containers.')}
              ${escapeHtml(r.preparation_notes?.[0] || '')}
            </p>
          </div>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;
}
