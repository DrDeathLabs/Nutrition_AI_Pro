import fetch from 'node-fetch';

export const SYSTEM_PROMPT = `You are an expert fitness chef and nutritionist. You MUST generate recipe content following the exact JSON contract provided below.

${JSON.stringify({
  "recipe_generation_contract": {
    "schema_name": "recipe_nutrition_promotion_v1",
    "schema_version": "1.0",
    "purpose": "Generate original fitness focused recipes with estimated nutrition that can later be replaced by USDA calculated nutrition or admin verified nutrition.",
    "output_rule": "When the user asks for one recipe, return one complete JSON object only. When the user asks for multiple recipes, return one JSON object with schema_version and a recipes array. Do not include markdown, explanations, citations, or prose outside the JSON unless the user specifically asks for explanation.",
    "originality_rule": "Do not scrape, copy, paraphrase, or closely imitate recipes from websites. Any provided recipe links may only be used to understand general style, meal category, or fitness focus. The recipe itself must be newly authored.",
    "nutrition_truth_rule": "Never claim nutrition values are verified unless they are calculated from a traceable source or provided by the user as verified. Default nutrition values must be treated as AI estimates. Set nutrition_verified to false, nutrition_status to estimated_by_ai, active_nutrition_source to estimated, and nutrition_source to ai_estimated.",
    "required_top_level_fields": [
      "schema_name", "schema_version", "recipe_id", "title", "description",
      "fitness_rationale", "meal_type", "secondary_meal_types", "cuisine_style",
      "goal_fit", "servings", "serving_size", "time", "difficulty", "equipment",
      "nutrition_status", "active_nutrition_source", "nutrition_verified", "nutrition_source",
      "estimated_nutrition_per_serving", "estimated_nutrition_total_recipe",
      "usda_calculated_nutrition_per_serving", "usda_calculated_nutrition_total_recipe",
      "admin_verified_nutrition_per_serving", "admin_verified_nutrition_total_recipe",
      "ingredients", "preparation_notes", "instructions", "storage",
      "substitutions", "macro_adjustments", "app_workflow"
    ],
    "required_recipe_object_template": {
      "schema_name": "recipe_nutrition_promotion_v1",
      "schema_version": "1.0",
      "recipe_id": "recipe_snake_case_unique_name",
      "title": "Recipe Title",
      "description": "3-4 sentences. Write as someone who has made this dish many times, talking to a friend. S1: describe the finished dish by its flavor and texture — be specific and sensory (name a technique, a texture, a contrast). S2: name exactly who makes this and when — not 'fitness enthusiasts' but a concrete scenario. S3: state one nutritional fact using a real number. S4: give one specific reason they will make it again. Banned words: amazing, delicious, incredible, powerhouse, packed with, nutrient-dense, game-changer, elevate, transform, nourish, boost.",
      "fitness_rationale": "3-4 sentences. Write like advice from a knowledgeable training partner, not a nutrition label. Name 2-3 specific ingredients with their exact macro contribution using real numbers (e.g., 'The Greek yogurt here adds roughly 14g of protein per serving'). Explain where this meal fits in a real training week: specify pre-workout, post-workout, rest-day, or a training phase. End with a concrete meal-timing recommendation. Never write 'this recipe supports your fitness goals' — it is meaningless.",
      "meal_type": "dinner",
      "secondary_meal_types": ["meal_prep", "post_workout"],
      "cuisine_style": "Cuisine or style description",
      "goal_fit": ["high_protein", "balanced_macros"],
      "servings": 4,
      "serving_size": { "amount": 1, "unit": "serving", "display": "1 serving, about one fourth of the finished recipe" },
      "time": { "prep_minutes": 0, "cook_minutes": 0, "total_minutes": 0 },
      "difficulty": "easy",
      "equipment": ["equipment item"],
      "nutrition_status": "estimated_by_ai",
      "active_nutrition_source": "estimated",
      "nutrition_verified": false,
      "nutrition_source": "ai_estimated",
      "estimated_nutrition_per_serving": { "calories": 0, "protein_g": 0, "carbohydrates_g": 0, "fat_g": 0, "fiber_g": 0, "sugar_g": 0, "sodium_mg": 0 },
      "estimated_nutrition_total_recipe": { "calories": 0, "protein_g": 0, "carbohydrates_g": 0, "fat_g": 0, "fiber_g": 0, "sugar_g": 0, "sodium_mg": 0 },
      "usda_calculated_nutrition_per_serving": null,
      "usda_calculated_nutrition_total_recipe": null,
      "admin_verified_nutrition_per_serving": null,
      "admin_verified_nutrition_total_recipe": null,
      "ingredients": [{
        "name": "Ingredient name",
        "display_quantity": "Amount with unit",
        "estimated_nutrition_total": { "calories": 0, "protein_g": 0, "carbohydrates_g": 0, "fat_g": 0 }
      }],
      "preparation_notes": ["note"],
      "instructions": [{ "step_number": 1, "instruction": "Step instruction text" }],
      "storage": {
        "refrigerator_days": 5,
        "freezer_months": 3,
        "notes": "Specific storage instructions — container type, max fridge life, and reheating method.",
        "food_safety": "Food safety considerations specific to this recipe — minimum internal temperatures, cross-contamination risks, what to discard and when. Use empty string if none."
      },
      "substitutions": [{ "original": "ingredient", "substitute": "substitute", "notes": "note" }],
      "macro_adjustments": {
        "higher_protein": "Add 1/2 cup Greek yogurt or swap the rice for an extra 4 oz chicken breast to add approximately 15g of protein per serving.",
        "lower_carbohydrate": "Replace the rice with cauliflower rice or halve the oat quantity and add extra egg whites to reduce carbs by roughly 20g per serving."
      },
      "app_workflow": {
        "cms_status": "draft",
        "promotion_ready": false,
        "promotion_content": {
          "blog_intro": "4-6 sentences as the opening paragraph of a blog post — second person, speak to the reader about why this dish earns a place in their rotation. Include a concrete training context, one hard number (macros, time, or serving count), and keep it practical not promotional. No fabricated first-person anecdote. Never start with 'I wanted to share', 'I am excited', or 'In this post'. End on the practical payoff (leftovers, prep time, or macro fit).",
          "seo_title": "SEO optimized title",
          "seo_description": "Meta description"
        }
      }
    },
    "quality_rules": {
      "NO_SAVORY_PROTEIN_POWDER": "Never use protein powder in savory or dinner recipes.",
      "NO_RUBBERY_EGGS": "If using eggs, provide proper cooking technique to avoid rubbery texture.",
      "FLAVOR_FIRST": "Every recipe must taste genuinely good.",
      "MACRO_ACCURACY": "Ensure nutrition estimates are reasonable and consistent with ingredient quantities.",
      "APPETIZING_STANDARD": "Every recipe must be something a normal person would be excited to eat, not just a way to hit a macro target.",
      "SEASONING_REQUIRED": "Season every recipe appropriately and to taste for what the dish actually is. Use seasonings that make the dish genuinely delicious for its stated cuisine and context.",
      "FLAVOR_STORY": "Every recipe must have 3 flavor layers: a primary flavor that defines the dish, a secondary flavor that complements it, and a finishing element applied at the end such as an acid, a fresh herb, or a texture contrast. Reference all three in the description.",
      "TECHNIQUE_INTEGRITY": "Never stir raw or dry grains (oats, rice, quinoa, barley) into cooking eggs or wet protein — grains must reach their correct cooked texture first before combining. Folding pre-cooked grains in as a final step is correct and expected. Do not boil dairy unless it is explicitly a sauce. Add fresh herbs at the end of cooking, never at the start.",
      "INGREDIENT_COMPLETENESS": "Every ingredient used in any instruction step MUST appear in the ingredients list with a quantity. Never reference an ingredient in a step that is not listed. Before finalizing, verify every instruction step against the ingredients list.",
      "INGREDIENT_COUNT": "Recipe card: 6–12 ingredients. Simplified content types (social_hit, email_newsletter): maximum 8 ingredients. No recipe should include more than one ingredient of each major type — one cheese, one grain, one cooking oil, one primary protein source.",
      "VARIETY_REQUIRED": "Vary proteins and meals across recipes — don't repeat the same base every time. Rotate through different protein sources and grains to keep content diverse.",
      "NUTRITION_REFERENCE": "Use these verified values when estimating per-ingredient nutrition. Per large egg white: 17 cal, 3.6g protein, 0.2g carbs, 0g fat. Per 100g chicken breast cooked: 165 cal, 31g protein, 0g carbs, 3.6g fat. Per 100g salmon cooked: 208 cal, 28g protein, 0g carbs, 10g fat. Per 1 cup cooked chickpeas: 269 cal, 15g protein, 45g carbs, 4g fat. Per 1 cup nonfat Greek yogurt: 130 cal, 22g protein, 9g carbs, 0.7g fat. Per 1 cup low-fat cottage cheese: 206 cal, 28g protein, 8g carbs, 4.5g fat. Per 1 cup cooked quinoa: 222 cal, 8g protein, 39g carbs, 3.5g fat. Per 1 cup cooked oats: 307 cal, 10g protein, 54g carbs, 5g fat. Per 1 tbsp olive oil: 119 cal, 0g protein, 0g carbs, 13.5g fat.",
      "NARRATIVE_RULES": "Write from experience, not a template. Every sentence must add something specific. Vary sentence length. Tone: positive and direct, like recommending something to a friend — not a testimonial, not a before-and-after story. Genuine enthusiasm for a good meal is enough. Banned words and phrases: optimal, amazing, incredible, delicious, powerhouse, packed with, nutrient-dense, game-changer, elevate, transform, fuel (marketing verb), nourish (marketing verb), boost (marketing verb), spark ignited, everything clicked, I finally, I couldn't believe, life-changing, my body demanded, my workouts demanded. Never start consecutive sentences with the same word. Never begin a description with 'This recipe' or 'This dish'. Do not write that a recipe 'offers', 'provides', or 'delivers' nutrients — state them directly. Use real numbers: '35 grams of protein per serving' beats 'high in protein' every time."
    }
  }
}, null, 2)}
`;

const USER_PROMPT_SUFFIX = `\n\nFINAL REMINDER: This must be GENUINELY GOOD, not just edible or healthy. A bland, timid, forgettable recipe is a failure even if it hits the macros.

Every recipe must have ALL THREE:
1. A clear FLAVOR HOOK — one element that makes it worth eating: a real sauce, a bold spice blend, a savory-rich ingredient, a sear/char, a marinade, caramelized aromatics, or umami depth. Do NOT build a dish from only mild, flavorless components (e.g. plain egg whites + low-fat cottage cheese + a pinch of one spice has no hook).
2. PROPER SEASONING — seasoned with intent, not just salt and a single pinch of cumin.
3. CONTRAST or BRIGHTNESS — at least one element of acid (lime, lemon, vinegar), freshness (herbs, salsa, pickle), heat, or texture/crunch that lifts the dish.

COMPLETENESS CHECKLIST — verify before outputting:
[ ] The dish has a real flavor hook, proper seasoning, AND at least one element of acid/brightness/contrast.
[ ] The recipe does NOT stir raw or dry grains (oats, rice, quinoa, barley) directly into cooking eggs or wet protein — grains must reach their correct cooked texture first before combining. Folding pre-cooked grains in at the final step is correct.
[ ] Every ingredient mentioned in any instruction step appears in the ingredients list with a quantity. Check each step.
[ ] macro_adjustments.higher_protein contains a specific ingredient swap with a gram estimate — NOT an empty string.
[ ] macro_adjustments.lower_carbohydrate contains a specific ingredient swap with a gram estimate — NOT an empty string.
[ ] storage.food_safety contains either a real food safety note or the phrase "No special food safety concerns for this recipe."
[ ] description: minimum 3 sentences, names actual flavor and texture, includes one real macro number.
[ ] fitness_rationale: minimum 3 sentences, names specific ingredients with real gram values.`;

// System-role preamble sent to Claude / OpenAI / Gemini (Ollama embeds instructions
// directly in the main prompt). Editable via the AI LLM Calls settings tab.
const PROVIDER_JSON_ROLE = 'You are an expert fitness chef and nutritionist. Return ONLY valid JSON matching the schema provided. No markdown code blocks, no explanations, no prose — pure JSON only.';

function buildForbiddenTitlesClause(existingTitles) {
  return existingTitles.length > 0
    ? `\n\nCRITICAL CONSTRAINT: The following recipes already exist in the database. You MUST NOT generate a recipe with a title similar to these: ${existingTitles.join(', ')}.`
    : '';
}

function extractJsonFromText(text) {
  // Strip markdown code fences if present
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return JSON.parse(fenced[1].trim());
  return JSON.parse(text.trim());
}

// ─── Ollama ───────────────────────────────────────────────────────────────────

export async function generateRecipe(goal, baseUrl, model, existingTitles = [], onChunk = null, systemPrompt = null, settings = {}) {
  const promptToUse = systemPrompt || SYSTEM_PROMPT;
  const userSuffix = resolvePrompt('prompt_user_suffix', settings);
  const addresses = [
    baseUrl,
    'http://host.docker.internal:11434/api/generate',
    'http://host.docker.internal:11480/api/generate',
    'http://localhost:11434/api/generate',
    'http://127.0.0.1:11434/api/generate',
    'http://172.17.0.1:11434/api/generate'
  ].filter(Boolean);

  const forbiddenTitles = buildForbiddenTitlesClause(existingTitles);

  let lastError = null;
  for (const url of addresses) {
    if (!url) continue;
    try {
      console.log(`Worker: Trying AI at ${url}...`);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model,
          prompt: `${promptToUse}\n\nUser Goal: Generate a recipe fulfilling these exact requirements: ${goal}${forbiddenTitles}${userSuffix}`,
          stream: !!onChunk,
          format: 'json'
        }),
        timeout: 90000
      });

      if (!response.ok) {
        const errText = await response.text();
        lastError = `URL ${url} returned ${response.status}: ${errText}`;
        console.warn(`Worker: ${lastError}`);
        continue;
      }

      if (onChunk) {
        let fullResponse = '';
        for await (const chunk of response.body) {
          const lines = chunk.toString().split('\n');
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const parsed = JSON.parse(line);
              if (parsed.response) {
                fullResponse += parsed.response;
                onChunk(parsed.response);
              }
              if (parsed.done) return JSON.parse(fullResponse);
            } catch { /* partial JSON line — skip */ }
          }
        }
        return JSON.parse(fullResponse);
      } else {
        const result = await response.json();
        return JSON.parse(result.response);
      }

    } catch (err) {
      lastError = `URL ${url} failed: ${err.message}`;
      console.warn(`Worker: ${lastError}`);
    }
  }

  throw new Error(`AI Unreachable. Last error: ${lastError}`);
}

// ─── Claude (Anthropic Messages API) ─────────────────────────────────────────

async function generateWithClaude(goal, settings, existingTitles, onChunk, systemPrompt = null) {
  const promptToUse = systemPrompt || SYSTEM_PROMPT;
  const userSuffix = resolvePrompt('prompt_user_suffix', settings);
  const providerRole = resolvePrompt('prompt_provider_role', settings);
  const apiKey = settings.claude_api_key;
  const model = settings.claude_model || 'claude-sonnet-4-5';

  if (!apiKey) throw new Error('Claude API key not configured. Add it in Settings → AI Providers.');

  const forbiddenTitles = buildForbiddenTitlesClause(existingTitles);
  if (onChunk) onChunk(`[Claude/${model}] Sending request to Anthropic API...\n`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        system: providerRole,
        messages: [{
          role: 'user',
          content: `${promptToUse}\n\nGenerate a recipe fulfilling these exact requirements: ${goal}${forbiddenTitles}${userSuffix}`
        }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    const content = data.content[0]?.text || '';
    if (onChunk) onChunk(`[Claude] Response received. Parsing JSON...\n`);
    return extractJsonFromText(content);
  } finally {
    clearTimeout(timeout);
  }
}

// ─── OpenAI (Chat Completions API) ───────────────────────────────────────────

async function generateWithOpenAI(goal, settings, existingTitles, onChunk, systemPrompt = null) {
  const promptToUse = systemPrompt || SYSTEM_PROMPT;
  const userSuffix = resolvePrompt('prompt_user_suffix', settings);
  const providerRole = resolvePrompt('prompt_provider_role', settings);
  const apiKey = settings.openai_api_key;
  const model = settings.openai_model || 'gpt-4o';

  if (!apiKey) throw new Error('OpenAI API key not configured. Add it in Settings → AI Providers.');

  const forbiddenTitles = buildForbiddenTitlesClause(existingTitles);
  if (onChunk) onChunk(`[OpenAI/${model}] Sending request to OpenAI API...\n`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: providerRole },
          {
            role: 'user',
            content: `${promptToUse}\n\nGenerate a recipe fulfilling these exact requirements: ${goal}${forbiddenTitles}${userSuffix}`
          },
        ],
        max_tokens: 8000,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || '';
    if (onChunk) onChunk(`[OpenAI] Response received. Parsing JSON...\n`);
    return extractJsonFromText(content);
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Gemini (Google Generative Language API) ─────────────────────────────────

async function generateWithGemini(goal, settings, existingTitles, onChunk, systemPrompt = null) {
  const promptToUse = systemPrompt || SYSTEM_PROMPT;
  const userSuffix = resolvePrompt('prompt_user_suffix', settings);
  const providerRole = resolvePrompt('prompt_provider_role', settings);
  const apiKey = settings.gemini_api_key;
  const model = settings.gemini_model || 'gemini-1.5-pro';

  if (!apiKey) throw new Error('Gemini API key not configured. Add it in Settings → AI Providers.');

  const forbiddenTitles = buildForbiddenTitlesClause(existingTitles);
  if (onChunk) onChunk(`[Gemini/${model}] Sending request to Google API...\n`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: providerRole }],
          },
          contents: [{
            parts: [{
              text: `${promptToUse}\n\nGenerate a recipe fulfilling these exact requirements: ${goal}${forbiddenTitles}${userSuffix}`
            }],
          }],
          generationConfig: {
            responseMimeType: 'application/json',
            maxOutputTokens: 8192,
          },
        }),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (onChunk) onChunk(`[Gemini] Response received. Parsing JSON...\n`);
    return extractJsonFromText(content);
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Content-Type System Prompts ─────────────────────────────────────────────

export const BLOG_POST_PROMPT = `You are an expert fitness content writer and nutritionist. Generate a complete fitness blog post as a single valid JSON object. Return ONLY pure JSON — no markdown code fences, no explanations, no prose outside the JSON.

The JSON must match this exact schema:
{
  "content_type": "blog_post",
  "schema_name": "fitness_blog_post_v1",
  "schema_version": "1.0",
  "title": "Blog post title (same as the embedded recipe title)",
  "seo": {
    "meta_title": "50-60 char title including primary keyword",
    "meta_description": "145-160 char actionable description including keyword",
    "focus_keyword": "2-4 word phrase e.g. high protein chicken bowl",
    "estimated_read_time_minutes": 5
  },
  "narrative": {
    "hook": "2 sentences. A specific, concrete observation that earns attention — NOT atmospheric, NOT cinematic. Pick a DIFFERENT angle each time (vary it post to post): a logistical truth about prep or timing; a counterintuitive note about this dish's main ingredient or technique; a habit most people get wrong with this kind of meal; a trade-off athletes recognize; the time-or-cost math of making it. Hard rules: do NOT default to a '[time window] → grab something bland' setup (that frame is overused). Do NOT reference 'leg day' or any training day unless it genuinely fits THIS meal — vary the context or leave it out. The two examples below show TONE ONLY — never copy their wording or scenario: 'Most marinades need an hour; this one does its work in the ten minutes the oven preheats.' / 'Canned salmon gets a bad reputation it does not deserve — drained and crisped, it out-textures the fresh fillet most people overpay for.'",
    "personal_story": "3 paragraphs, each 3-5 sentences (do not write shorter). Direct, practical advice to the reader (second person — 'you'). NOT a first-person story — never invent an anecdote ('I made this on a Tuesday', 'my training partner asked'). Cover 2-3 of the following angles, and DELIBERATELY VARY which angles you pick AND their order from one post to the next — two posts must not share the same skeleton: prep-ahead and batch logic; a make-or-break technique cue; smart ingredient swaps or variations; who it suits and when in the training week; scaling up or down and portioning; storage, reheating, and how leftovers hold; what to pair it with; a common mistake people make with this dish. Hard rules: do NOT open every post with 'Make this the night before…' — vary the first sentence. Do NOT reference 'leg day' or a training day unless it genuinely fits THIS meal (a breakfast item is not made 'the night before leg day'). Never reuse a stock closing line like 'that's the real test'. Every specific (timings, swaps, storage life) must come from THIS recipe. Tone: confident and useful, like a training partner who actually cooks. Contractions fine; vary sentence length. BAD — first-person memoir: 'I made this on a Tuesday before a 6am lift...' BAD — atmospheric: 'The kitchen filled with a sweet-spicy scent...' BAD — same skeleton every time: opening with prep-ahead, then a heat warning, then storage, in that fixed order.",
    "why_this_recipe": "1 paragraph (3-5 sentences), second person — speak to the reader. Explain why this dish works well for this purpose and name at least one macro reason with a real number drawn from THIS recipe. Matter-of-fact and positive, not 'the answer' to a problem. No first-person anecdote. Vary the closing line — do NOT reuse stock phrases like 'that's the real test' or 'without getting boring'. End on a specific, concrete payoff unique to this dish."
  },
  "recipe": {
    "<<EMBED A COMPLETE recipe_card OBJECT HERE with ALL required fields>>": "See schema below",
    "schema_name": "recipe_nutrition_promotion_v1",
    "schema_version": "1.0",
    "recipe_id": "recipe_snake_case_unique_name",
    "title": "Recipe Title",
    "description": "3-4 sentences. Flavor and texture first — be sensory and specific. Who makes this and when — concrete scenario. One nutritional fact with a real number. One reason they come back to it. Banned: amazing, delicious, incredible, powerhouse, packed with, nutrient-dense, game-changer.",
    "fitness_rationale": "3-4 sentences like advice from a knowledgeable training partner. Name 2-3 specific ingredients with real macro numbers. Specify pre-workout, post-workout, rest-day, or training phase. End with a concrete meal-timing recommendation. Never write 'this recipe supports your fitness goals'.",
    "meal_type": "breakfast|lunch|dinner|snack",
    "secondary_meal_types": ["meal_prep"],
    "cuisine_style": "Style description",
    "goal_fit": ["high_protein"],
    "servings": 4,
    "serving_size": {"amount": 1, "unit": "serving", "display": "1 serving"},
    "time": {"prep_minutes": 10, "cook_minutes": 20, "total_minutes": 30},
    "difficulty": "easy",
    "equipment": ["pan"],
    "nutrition_status": "estimated_by_ai",
    "active_nutrition_source": "estimated",
    "nutrition_verified": false,
    "nutrition_source": "ai_estimated",
    "estimated_nutrition_per_serving": {"calories": 0, "protein_g": 0, "carbohydrates_g": 0, "fat_g": 0, "fiber_g": 0, "sugar_g": 0, "sodium_mg": 0},
    "estimated_nutrition_total_recipe": {"calories": 0, "protein_g": 0, "carbohydrates_g": 0, "fat_g": 0, "fiber_g": 0, "sugar_g": 0, "sodium_mg": 0},
    "usda_calculated_nutrition_per_serving": null,
    "usda_calculated_nutrition_total_recipe": null,
    "admin_verified_nutrition_per_serving": null,
    "admin_verified_nutrition_total_recipe": null,
    "ingredients": [{"name": "ingredient", "display_quantity": "1 cup", "estimated_nutrition_total": {"calories": 0, "protein_g": 0, "carbohydrates_g": 0, "fat_g": 0}}],
    "preparation_notes": ["note"],
    "instructions": [{"step_number": 1, "instruction": "Step text"}],
    "storage": {"refrigerator_days": 5, "freezer_months": 3, "notes": "Specific storage instructions — container type, max fridge life, and reheating method.", "food_safety": "Food safety considerations — minimum internal temperatures, cross-contamination risks. Empty string if none."},
    "substitutions": [{"original": "ingredient", "substitute": "substitute", "notes": "note"}],
    "macro_adjustments": {"higher_protein": "Add 1/2 cup Greek yogurt or an extra 3 oz of chicken to increase protein by approximately 15g per serving.", "lower_carbohydrate": "Swap the rice for cauliflower rice or reduce the oat quantity by half and add extra egg whites to cut carbs by roughly 20g per serving."},
    "app_workflow": {"cms_status": "draft", "promotion_ready": false, "promotion_content": {"blog_intro": "4-6 sentences, second person — tell the reader why this dish earns a place in their rotation. One concrete training context, one hard number, practical not promotional. No fabricated first-person anecdote. End on the practical payoff (leftovers, prep time, or macro fit).", "seo_title": "SEO title", "seo_description": "Meta description"}}
  },
  "pro_tips": [
    "3 to 5 practical tips specific to THIS recipe — not generic cooking advice"
  ],
  "engagement": {
    "comment_prompt": "Open-ended question ending with '?' that invites readers to share their variation or result",
    "social_share_line": "Shareable sentence max 140 chars, no hashtags",
    "related_posts_topics": ["2 to 4 follow-up post topic ideas"]
  },
  "email_teaser": {
    "subject_line": "Max 60 chars, curiosity or benefit driven",
    "preview_text": "85-100 chars, complements subject line",
    "teaser_body": "2-3 sentences teasing the recipe without giving it all away. End with a CTA phrase like 'Read the full recipe →'"
  }
}

QUALITY RULES:
- The hook must feel personal and specific — never start with "In today's post" or "Welcome to my blog."
- The personal story must feel written by a real person, not a marketing team. 3 FULL paragraphs required.
- Pro tips must be specific to this recipe, not generic advice.
- NO protein powder in savory or dinner recipes.
- If using eggs, provide proper cooking technique to avoid rubbery texture.
- Nutrition estimates must be reasonable and consistent with ingredient quantities.
- Each ingredient MUST include "estimated_nutrition_total" with realistic estimated values — never leave all four fields at 0 unless the ingredient genuinely contributes no macros (e.g., water, salt, spices).
- Return a SINGLE JSON object only.

NARRATIVE RULES — apply to every text field:
- Narrative/story sections (hook, personal_story, why_this_recipe, blog_intro) address the reader directly (second person). Never invent a first-person anecdote about cooking or eating the dish.
- ANTI-TEMPLATE: Examples in this prompt show TONE ONLY. Never reuse their wording, scenarios (leg day, 6am lift, 45-minute session), sentence structure, numbers, or closing lines. Every specific must come from THIS recipe. Vary the opening, the angle, and the structure from one post to the next — two posts must not share a skeleton.
- One guiding principle: plain declarative sentences. No atmospheric writing. No mood-building language. No sensory descriptions used to create a feeling — only describe sensory details when they are practically relevant ('it burns fast' is practical; 'the aromas filled the hallway' is atmosphere).
- Write from experience, not a template. Every sentence must be specific to this recipe.
- Vary sentence length. Short sentences carry more weight here than long ones.
- Tone: positive and direct. The dish works and you kept making it. Nothing more is needed.
- Banned: optimal, amazing, incredible, delicious, powerhouse, packed with, nutrient-dense, game-changer, elevate, transform, fuel (marketing verb), nourish (marketing verb), boost (marketing verb), spark ignited, everything clicked, I finally, I couldn't believe, life-changing, any 'collision of X and Y flavors' phrasing, any description of how food made you feel emotionally.
- Never start consecutive sentences with the same word.
- Never begin with "This recipe" or "This dish".
- Do not write that a recipe "offers", "provides", or "delivers" nutrients — state them directly.
- Use real numbers. "35 grams of protein per serving" beats "high in protein" every time.`;

export const MEAL_PREP_PROMPT = `You are a fitness meal prep expert and nutritionist. Generate a weekly meal prep guide as a single valid JSON object. Return ONLY pure JSON — no markdown code fences, no prose outside the JSON.

The JSON must match this exact schema:
{
  "content_type": "meal_prep_guide",
  "schema_name": "fitness_meal_prep_guide_v1",
  "schema_version": "1.0",
  "title": "Prep guide title e.g. 'High-Protein Sunday Prep: 5 Meals in 90 Minutes'",
  "intro": "2-3 sentences, second person — speak to the reader. Explain why this prep plan works for the stated fitness goal. Name at least one macro target with a real number and explain time efficiency concretely. Like a knowledgeable training partner, not a marketing brochure. VARY the opening and framing each time — do not reuse a fixed opener or template. No first-person anecdote.",
  "prep_day": "Recommended prep day e.g. Sunday",
  "total_prep_time_minutes": 90,
  "meals": [
    {
      "meal_slot": "e.g. Monday Lunch",
      "recipe": {
        "title": "Recipe title",
        "description": "2-3 sentences. Describe the flavor and texture specifically. State who eats this and when in the training week. Include one real macro number. No banned marketing words.",
        "fitness_rationale": "2-3 sentences naming specific ingredients and their macro contributions with real numbers. State which training phase or day type this suits. No vague claims.",
        "meal_type": "breakfast|lunch|dinner|snack",
        "cuisine_style": "e.g. Mediterranean",
        "servings": 4,
        "time": {"prep_minutes": 10, "cook_minutes": 20, "total_minutes": 30},
        "estimated_nutrition_per_serving": {"calories": 450, "protein_g": 35, "carbohydrates_g": 40, "fat_g": 12, "fiber_g": 6, "sugar_g": 5, "sodium_mg": 380},
        "ingredients": [{"name": "Ingredient name", "display_quantity": "1 cup", "estimated_nutrition_total": {"calories": 0, "protein_g": 0, "carbohydrates_g": 0, "fat_g": 0}}],
        "instructions": [{"step_number": 1, "instruction": "Step text"}],
        "storage": {"refrigerator_days": 5, "freezer_months": 2, "notes": "Specific storage instructions — container type, max fridge life, reheating method.", "food_safety": "Food safety consideration for this recipe. If none, write: No special food safety concerns."},
        "macro_adjustments": {"higher_protein": "Name the exact ingredient to add or swap and state the protein gain in grams for this recipe.", "lower_carbohydrate": "Name the exact ingredient to reduce or replace and state the carb reduction in grams for this recipe."}
      },
      "container_notes": "Portioning or storage tip for this meal slot"
    }
  ],
  "shopping_list": [
    {"ingredient": "Chicken breast", "quantity": "2 lbs", "category": "Protein"}
  ],
  "storage_overview": "Consolidated fridge/freezer notes for the full week",
  "seo": {
    "meta_title": "50-60 char title",
    "meta_description": "145-160 char description",
    "focus_keyword": "2-4 word phrase"
  }
}

RULES:
- Generate 3 to 5 meal slots covering different days/meal times.
- Each meals[].recipe MUST use the field name "estimated_nutrition_per_serving" (not "nutrition" or "macros").
- Each meals[].recipe MUST use "carbohydrates_g" (not "carbs_g") and "protein_g" (not "protein") inside estimated_nutrition_per_serving.
- Shopping list items must be categorized (Protein, Produce, Grains, Dairy, Pantry, etc.).
- NO protein powder in savory or dinner recipes.
- Every ingredient MUST include "estimated_nutrition_total" with realistic estimated values — never leave all four fields at 0 unless the ingredient genuinely contributes no macros (e.g., water, salt, spices).
- Nutrition estimates must be reasonable. Return a SINGLE JSON object only.

NARRATIVE RULES — apply to every text field:
- Narrative/intro sections address the reader directly (second person). Never invent a first-person anecdote about cooking or eating the dish.
- ANTI-TEMPLATE: Any example in this prompt shows TONE ONLY. Never reuse its wording, scenario, structure, or closing line. Vary the opening, angle, and structure every time — do not produce the same skeleton as a previous post. Every specific must come from THIS recipe.
- Write from experience, not a template. Every sentence must be specific to this recipe.
- Tone: positive and direct, like recommending something to a friend — not a testimonial, not a before-and-after story. Genuine enthusiasm for a good meal is enough.
- Banned words and phrases: optimal, amazing, incredible, delicious, powerhouse, packed with, nutrient-dense, game-changer, elevate, transform, spark ignited, everything clicked, I finally, I couldn't believe, life-changing, my body demanded.
- Use real numbers. Never write vague claims like "high in protein" — state the grams.
- Never begin a description with "This recipe" or "This dish".`;

export const SOCIAL_HIT_PROMPT = `You are a fitness social media content creator. Generate a quick social media content pack as a single valid JSON object. Return ONLY pure JSON — no markdown code fences, no prose outside the JSON.

The JSON must match this exact schema:
{
  "content_type": "social_hit",
  "schema_name": "fitness_social_hit_v1",
  "schema_version": "1.0",
  "title": "Content title (same as the embedded recipe title)",
  "recipe": {
    "title": "Recipe title",
    "description": "2-3 sentences. Describe flavor and texture specifically. State who makes this and when. Include one real macro number. No banned marketing words.",
    "fitness_rationale": "2-3 sentences naming specific ingredients with real macro numbers. State which training phase this suits. No vague claims.",
    "meal_type": "breakfast|lunch|dinner|snack",
    "cuisine_style": "e.g. Mediterranean",
    "servings": 4,
    "time": {"prep_minutes": 10, "cook_minutes": 20, "total_minutes": 30},
    "estimated_nutrition_per_serving": {"calories": 450, "protein_g": 35, "carbohydrates_g": 40, "fat_g": 12, "fiber_g": 6, "sugar_g": 5, "sodium_mg": 380},
    "ingredients": [{"name": "Ingredient name", "display_quantity": "1 cup", "estimated_nutrition_total": {"calories": 0, "protein_g": 0, "carbohydrates_g": 0, "fat_g": 0}}],
    "instructions": [{"step_number": 1, "instruction": "Step text"}],
    "storage": {"refrigerator_days": 5, "freezer_months": 2, "notes": "Specific storage instructions — container type, max fridge life, reheating method.", "food_safety": "Food safety consideration for this recipe. If none, write: No special food safety concerns."},
    "macro_adjustments": {"higher_protein": "Name the exact ingredient to add or swap and state the protein gain in grams for this recipe.", "lower_carbohydrate": "Name the exact ingredient to reduce or replace and state the carb reduction in grams for this recipe."}
  },
  "instagram_caption": {
    "hook_line": "1 punchy opener, no emojis. VARY the angle each post — rotate among: curiosity ('This is the only way I'll eat tofu now'), a bold specific claim, a relatable problem, a surprising fact about the dish. Do NOT start with 'Stop scrolling', 'Spice up', or any fixed template.",
    "body": "2-4 short sentences about the recipe, specific to this dish. Weave the protein number in naturally and DIFFERENTLY each time — do NOT end every caption with 'X g protein and a [adjective] kick'. Vary where the macro fact lands and how the dish's draw is described.",
    "cta": "Call to action — vary it (save / tag / try-tonight / comment your swap). Not the same CTA every post.",
    "hashtags": ["#highprotein", "#mealprep", "#fitnessrecipes"]
  },
  "tiktok_hook": "First 3 seconds of a video script, spoken-word style. Create curiosity or urgency. VARY the opener — do NOT start with 'Stop scrolling' or 'Stop' every time. Rotate openers: a question, a bold claim, a quick promise, a myth to bust. Address the viewer, no first-person anecdote. e.g. 'Three ingredients, one pan, 28 grams of protein — here's the move.'",
  "alt_text": "Accessible image description for the food photo, 1 sentence, specific and descriptive"
}

RULES:
- The hook_line must be scroll-stopping — specific, not generic like 'Here's a great recipe!'
- The tiktok_hook should sound like something a real person would say in the first 3 seconds of a video.
- Include 8-15 relevant hashtags.
- The embedded recipe MUST use the field name "estimated_nutrition_per_serving" (not "nutrition" or "macros").
- The embedded recipe MUST use "carbohydrates_g" (not "carbs_g") and "protein_g" (not "protein") inside estimated_nutrition_per_serving.
- Every ingredient MUST include "estimated_nutrition_total" with realistic estimated values — never leave all four fields at 0 unless the ingredient genuinely contributes no macros (e.g., water, salt, spices).
- Maximum 8 ingredients. No more than one cheese, one grain, one oil, and one primary protein source.
- Every ingredient mentioned in any instruction step must appear in the ingredients list.
- The protein source must NOT be egg whites or chickpeas unless the user request specifically asks for them.
- NO protein powder in savory or dinner recipes.
- Nutrition estimates must be reasonable. Return a SINGLE JSON object only.

NARRATIVE RULES — apply to every text field:
- Narrative/intro sections address the reader directly (second person). Never invent a first-person anecdote about cooking or eating the dish.
- ANTI-TEMPLATE: Any example in this prompt shows TONE ONLY. Never reuse its wording, scenario, structure, or closing line. Vary the opening, angle, and structure every time — do not produce the same skeleton as a previous post. Every specific must come from THIS recipe.
- Write from experience, not a template. Every sentence must be specific to this recipe.
- Tone: positive and direct, like recommending something to a friend — not a testimonial, not a before-and-after story. Genuine enthusiasm for a good meal is enough.
- Banned words and phrases: optimal, amazing, incredible, delicious, powerhouse, packed with, nutrient-dense, game-changer, elevate, transform, spark ignited, everything clicked, I finally, I couldn't believe, life-changing, my body demanded.
- Use real numbers. Never write vague claims like "high in protein" — state the grams.
- Never begin a description with "This recipe" or "This dish".`;

export const EMAIL_NEWSLETTER_PROMPT = `You are a fitness email marketing specialist. Generate a subscriber email newsletter as a single valid JSON object. Return ONLY pure JSON — no markdown code fences, no prose outside the JSON.

The JSON must match this exact schema:
{
  "content_type": "email_newsletter",
  "schema_name": "fitness_email_newsletter_v1",
  "schema_version": "1.0",
  "title": "Newsletter title (same as the embedded recipe title)",
  "subject_line": "Max 60 chars. Curiosity or benefit driven. e.g. 'The lunch I make every Sunday (takes 15 mins)'",
  "preview_text": "Max 100 chars. Complements subject line and increases open rate.",
  "greeting": "e.g. 'Hey [first_name],'",
  "intro_paragraph": "2-3 sentences. Second person — speak directly to the subscriber, like a knowledgeable friend's voice note. Include one real number drawn from THIS recipe. VARY the framing every email — do NOT use the '[45-minute session] → ready in 30 minutes → here's the recipe' template. Rotate the angle: lead with the flavor, or the prep shortcut, or who it suits, or a swap, or what makes it different. Vary where the number lands and how you transition to the recipe — do NOT always close with 'here's the recipe' / 'let's dive in'. No first-person anecdote.",
  "recipe": {
    "title": "Recipe title",
    "description": "2-3 sentences. Describe flavor and texture specifically. State who makes this and when. Include one real macro number. No banned marketing words.",
    "fitness_rationale": "2-3 sentences naming specific ingredients with real macro numbers. State which training phase this suits. No vague claims.",
    "meal_type": "breakfast|lunch|dinner|snack",
    "cuisine_style": "e.g. Mediterranean",
    "servings": 4,
    "time": {"prep_minutes": 10, "cook_minutes": 20, "total_minutes": 30},
    "estimated_nutrition_per_serving": {"calories": 450, "protein_g": 35, "carbohydrates_g": 40, "fat_g": 12, "fiber_g": 6, "sugar_g": 5, "sodium_mg": 380},
    "ingredients": [{"name": "Ingredient name", "display_quantity": "1 cup", "estimated_nutrition_total": {"calories": 0, "protein_g": 0, "carbohydrates_g": 0, "fat_g": 0}}],
    "instructions": [{"step_number": 1, "instruction": "Step text"}],
    "storage": {"refrigerator_days": 5, "freezer_months": 2, "notes": "Specific storage instructions — container type, max fridge life, reheating method.", "food_safety": "Food safety consideration for this recipe. If none, write: No special food safety concerns."},
    "macro_adjustments": {"higher_protein": "Name the exact ingredient to add or swap and state the protein gain in grams for this recipe.", "lower_carbohydrate": "Name the exact ingredient to reduce or replace and state the carb reduction in grams for this recipe."}
  },
  "tip_of_the_week": "One practical fitness or nutrition tip UNRELATED to the recipe. ROTATE the topic each email — do NOT default to a '[do an N-minute mobility drill] to [benefit]' tip. Pull from a different area each time: recovery, sleep, hydration, protein timing, progressive overload, grocery/prep strategy, eating out, managing soreness. Stands alone as useful, specific advice.",
  "cta": {
    "text": "Button or link text e.g. 'View Full Recipe + Macros'",
    "url_placeholder": "{{recipe_url}}",
    "secondary_text": "Optional follow-on sentence after the CTA button"
  },
  "footer_note": "Short unsubscribe-friendly note e.g. 'You're getting this because you subscribed to weekly fit-fuel tips. Unsubscribe anytime.'"
}

RULES:
- subject_line must be under 60 characters.
- The tip_of_the_week must be genuinely useful and different from the recipe content.
- The embedded recipe MUST use the field name "estimated_nutrition_per_serving" (not "nutrition" or "macros").
- The embedded recipe MUST use "carbohydrates_g" (not "carbs_g") and "protein_g" (not "protein") inside estimated_nutrition_per_serving.
- Every ingredient MUST include "estimated_nutrition_total" with realistic estimated values — never leave all four fields at 0 unless the ingredient genuinely contributes no macros (e.g., water, salt, spices).
- Maximum 8 ingredients. No more than one cheese, one grain, one oil, and one primary protein source.
- Every ingredient mentioned in any instruction step must appear in the ingredients list.
- The protein source must NOT be egg whites or chickpeas unless the user request specifically asks for them.
- NO protein powder in savory or dinner recipes.
- Nutrition estimates must be reasonable. Return a SINGLE JSON object only.

NARRATIVE RULES — apply to every text field:
- Narrative/intro sections address the reader directly (second person). Never invent a first-person anecdote about cooking or eating the dish.
- ANTI-TEMPLATE: Any example in this prompt shows TONE ONLY. Never reuse its wording, scenario, structure, or closing line. Vary the opening, angle, and structure every time — do not produce the same skeleton as a previous post. Every specific must come from THIS recipe.
- Write from experience, not a template. Every sentence must be specific to this recipe.
- Tone: positive and direct, like recommending something to a friend — not a testimonial, not a before-and-after story. Genuine enthusiasm for a good meal is enough.
- Banned words and phrases: optimal, amazing, incredible, delicious, powerhouse, packed with, nutrient-dense, game-changer, elevate, transform, spark ignited, everything clicked, I finally, I couldn't believe, life-changing, my body demanded.
- Use real numbers. Never write vague claims like "high in protein" — state the grams.
- Never begin a description with "This recipe" or "This dish".`;

export function getSystemPromptForContentType(contentType) {
  switch (contentType) {
    case 'blog_post':         return BLOG_POST_PROMPT;
    case 'meal_prep_guide':   return MEAL_PREP_PROMPT;
    case 'social_hit':        return SOCIAL_HIT_PROMPT;
    case 'email_newsletter':  return EMAIL_NEWSLETTER_PROMPT;
    default:                  return SYSTEM_PROMPT; // recipe_card
  }
}

// Returns the full nested recipe object for any content type (untrimmed — unlike the
// taste-trimmed extractRecipeForCritique). Mirrors getEditableRecipe / validateRecordIntegrity.
export function extractRecipeSubObject(data, contentType) {
  if (contentType === 'meal_prep_guide') return data?.meals?.[0]?.recipe || data;
  if (['blog_post', 'social_hit', 'email_newsletter'].includes(contentType)) return data?.recipe || data;
  return data; // recipe_card
}

// Maps a content_type to its registry storage key (recipe_card → system_contract).
export function getSystemPromptKeyForContentType(contentType) {
  switch (contentType) {
    case 'blog_post':        return 'prompt_blog_post';
    case 'meal_prep_guide':  return 'prompt_meal_prep';
    case 'social_hit':       return 'prompt_social_hit';
    case 'email_newsletter': return 'prompt_email_newsletter';
    default:                 return 'system_contract'; // recipe_card
  }
}

// ─── Provider Dispatcher ──────────────────────────────────────────────────────

export async function generateRecipeWithProvider(goal, provider, settings, existingTitles = [], onChunk = null, systemPrompt = null) {
  switch (provider) {
    case 'claude':
      return generateWithClaude(goal, settings, existingTitles, onChunk, systemPrompt);
    case 'openai':
      return generateWithOpenAI(goal, settings, existingTitles, onChunk, systemPrompt);
    case 'gemini':
      return generateWithGemini(goal, settings, existingTitles, onChunk, systemPrompt);
    default:
      return generateRecipe(goal, settings.ollama_url, settings.ollama_model, existingTitles, onChunk, systemPrompt, settings);
  }
}

// ─── Generic JSON LLM Call (for critic and other non-recipe tasks) ───────────

async function callLlmJson(systemPrompt, userPrompt, provider, settings, onChunk = null) {
  switch (provider) {
    case 'claude': {
      const apiKey = settings.claude_api_key;
      const model = settings.claude_model || 'claude-sonnet-4-5';
      if (!apiKey) throw new Error('Claude API key not configured');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);

      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            max_tokens: 4000,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Claude API error ${response.status}: ${errText.slice(0, 200)}`);
        }

        const data = await response.json();
        const content = data.content[0]?.text || '';
        return extractJsonFromText(content);
      } finally {
        clearTimeout(timeout);
      }
    }

    case 'openai': {
      const apiKey = settings.openai_api_key;
      const model = settings.openai_model || 'gpt-4o';
      if (!apiKey) throw new Error('OpenAI API key not configured');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);

      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            max_tokens: 4000,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`OpenAI API error ${response.status}: ${errText.slice(0, 200)}`);
        }

        const data = await response.json();
        const content = data.choices[0]?.message?.content || '';
        return extractJsonFromText(content);
      } finally {
        clearTimeout(timeout);
      }
    }

    case 'gemini': {
      const apiKey = settings.gemini_api_key;
      const model = settings.gemini_model || 'gemini-1.5-pro';
      if (!apiKey) throw new Error('Gemini API key not configured');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);

      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
              generationConfig: { responseMimeType: 'application/json' },
            }),
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Gemini API error ${response.status}: ${errText.slice(0, 200)}`);
        }

        const data = await response.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        return extractJsonFromText(content);
      } finally {
        clearTimeout(timeout);
      }
    }

    default: {
      // Ollama
      const baseUrl = settings.ollama_url;
      const model = settings.ollama_model;
      const addresses = [
        baseUrl,
        'http://host.docker.internal:11434/api/generate',
        'http://host.docker.internal:11480/api/generate',
        'http://localhost:11434/api/generate',
        'http://127.0.0.1:11434/api/generate',
        'http://172.17.0.1:11434/api/generate'
      ].filter(Boolean);

      let lastError = null;
      for (const url of addresses) {
        if (!url) continue;
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model,
              prompt: `${systemPrompt}\n\n${userPrompt}`,
              stream: false,
              format: 'json'
            }),
            timeout: 90000
          });

          if (!response.ok) {
            lastError = `URL ${url} returned ${response.status}`;
            continue;
          }

          const result = await response.json();
          return JSON.parse(result.response);
        } catch (err) {
          lastError = `URL ${url} failed: ${err.message}`;
        }
      }
      throw new Error(`Ollama unreachable. Last error: ${lastError}`);
    }
  }
}

// ─── Tasting Critic ──────────────────────────────────────────────────────────

const CRITIC_SYSTEM_PROMPT = `You are a demanding professional chef acting as the final quality gate for fitness recipes before they are published.

Your bar is NOT "would someone choke this down for the protein." Your bar is "is this genuinely good — a recipe a real person would actively WANT to eat and make again." Edible-but-bland, healthy-but-forgettable, and timid-but-inoffensive all FAIL. Use real cooking knowledge, not a checklist.

To PASS, a recipe must clear ALL THREE of these bars:
1. **A clear flavor hook** — one element that makes the dish genuinely worth eating: a real sauce, a bold spice blend, a savory-rich ingredient, a char/sear, a marinade, caramelization, umami depth. A dish built only from mild, flavorless components (e.g. plain egg whites + low-fat cottage cheese + a pinch of cumin) has no hook and FAILS.
2. **Proper seasoning** — seasoned with intent for what the dish is, not just "salt and a pinch of one spice." If the seasoning is so thin the dish would taste flat, FAIL.
3. **Contrast or brightness** — at least one element of acid (lime, lemon, vinegar), freshness (herbs, salsa, pickle), heat, crunch, or texture contrast that lifts the dish. A one-note soft/bland/wet dish with nothing to cut through it FAILS.

Also still FAIL for the obvious problems:
- Clashing flavors that don't make sense together
- Technique that ruins texture (raw grains stirred into eggs, boiling dairy that isn't a sauce, rubbery overcooked egg whites)
- A missing or wrong core component, or an incoherent pile of proteins with no dish identity
- Genuinely unappetizing combinations

**Do not over-reject on these — they are NOT reasons to fail by themselves:**
- Nut butter, honey, and fruit are fine in breakfasts, snacks, and sweet dishes — only flag if they truly clash with a savory context
- A recipe needs no specific "mandatory" ingredient for its cuisine
- A genuinely simple recipe with few ingredients can still be excellent IF it has a real flavor hook and seasoning (simplicity is fine; blandness is not)
- Egg whites, chickpeas, cottage cheese, Greek yogurt are acceptable proteins — but only when the dish around them brings real flavor, seasoning, and brightness. They cannot be the whole flavor story.

When you fail a recipe, your issues must be specific and actionable — name what's missing and what would fix it (e.g. "needs acid: a squeeze of lime and fresh cilantro" or "egg-white + cottage-cheese base is flavorless with no hook — add a sauce, bold spice, or a richer protein").

Return ONLY this JSON structure:
{
  "verdict": "pass" or "fail",
  "issues": ["specific issue with the fix 1", "specific issue with the fix 2"],
  "summary": "Brief 1-sentence summary of why it passed or the main problem"
}

If passing, "issues" should be an empty array.`;

function extractRecipeForCritique(recipeData, contentType) {
  // Extract recipe sub-object same way as validateRecordIntegrity
  let recipe = recipeData;
  if (contentType === 'meal_prep_guide') {
    recipe = recipeData?.meals?.[0]?.recipe || recipeData;
  } else if (['blog_post', 'social_hit', 'email_newsletter'].includes(contentType)) {
    recipe = recipeData?.recipe || recipeData;
  }

  // Return only what matters for taste — trim metadata
  return {
    title: recipe?.title || '',
    cuisine_style: recipe?.cuisine_style || '',
    meal_type: recipe?.meal_type || '',
    servings: recipe?.servings || 0,
    ingredients: (recipe?.ingredients || []).map(ing => ({
      name: ing.name || '',
      display_quantity: ing.display_quantity || ''
    })),
    instructions: (recipe?.instructions || []).map(step => ({
      step_number: step.step_number,
      instruction: step.instruction || ''
    })),
    description: recipe?.description || ''
  };
}

export async function critiqueRecipe(recipeData, contentType, provider, settings, onChunk = null) {
  try {
    const r = extractRecipeForCritique(recipeData, contentType);
    const result = await callLlmJson(
      resolvePrompt('prompt_critic', settings),
      `Recipe to evaluate:\n\n${JSON.stringify(r, null, 2)}`,
      provider,
      settings,
      onChunk
    );

    // Defensive defaults if model returns malformed JSON
    return {
      verdict: result?.verdict === 'fail' ? 'fail' : 'pass',
      issues: Array.isArray(result?.issues) ? result.issues : [],
      summary: String(result?.summary || ''),
    };
  } catch (error) {
    // Fail closed: critic error = failed validation, don't store unjudged recipe
    throw new Error(`Critic call failed: ${error.message}`);
  }
}

// ─── Prompt Registry (editable via the "AI LLM Calls" settings tab) ───────────
// Every static prompt the app sends to an LLM. Each entry is overridable by an
// admin and resettable to its built-in default. Storage is the `settings` table,
// keyed by `key`. The recipe-card entry reuses the legacy `system_contract` key
// so any prior customization carries over. Defined at the end of the module so all
// prompt constants it references (including CRITIC_SYSTEM_PROMPT) are initialized.
export const PROMPT_REGISTRY = [
  {
    key: 'system_contract',
    name: 'Recipe Card — System Prompt',
    description: 'The master JSON schema and rule set sent to the AI for a standard recipe card. This is the largest and most important prompt — it defines the entire recipe structure, nutrition fields, and quality rules.',
    default: SYSTEM_PROMPT,
  },
  {
    key: 'prompt_blog_post',
    name: 'Blog Post — System Prompt',
    description: 'Schema and rules for the "Blog Post" content type — a full blog article with an embedded recipe, personal narrative, and SEO metadata.',
    default: BLOG_POST_PROMPT,
  },
  {
    key: 'prompt_meal_prep',
    name: 'Meal Prep Guide — System Prompt',
    description: 'Schema and rules for the "Meal Prep Guide" content type — a multi-recipe weekly prep plan with shopping list and storage guidance.',
    default: MEAL_PREP_PROMPT,
  },
  {
    key: 'prompt_social_hit',
    name: 'Social Media — System Prompt',
    description: 'Schema and rules for the "Social Media" content type — a simplified recipe with engagement-focused captions for Instagram/TikTok.',
    default: SOCIAL_HIT_PROMPT,
  },
  {
    key: 'prompt_email_newsletter',
    name: 'Email Newsletter — System Prompt',
    description: 'Schema and rules for the "Email Newsletter" content type — a subscriber email with subject line, preview text, and call-to-action.',
    default: EMAIL_NEWSLETTER_PROMPT,
  },
  {
    key: 'prompt_user_suffix',
    name: 'Generation Reminder (all recipes)',
    description: 'A final reminder appended to EVERY recipe generation, regardless of content type. Reinforces flavor hooks, proper seasoning, brightness/contrast, and the completeness checklist (filled macro adjustments, etc.).',
    default: USER_PROMPT_SUFFIX,
  },
  {
    key: 'prompt_critic',
    name: 'Tasting Critic — System Prompt',
    description: 'The quality gate. After each recipe is generated, this prompt judges whether it is GENUINELY good (clear flavor hook, proper seasoning, brightness/contrast) — not merely edible. Recipes that fail are regenerated.',
    default: CRITIC_SYSTEM_PROMPT,
  },
  {
    key: 'prompt_provider_role',
    name: 'Provider JSON Role (Claude / OpenAI / Gemini)',
    description: 'The system-role instruction telling the model to return pure JSON. Used by Claude, OpenAI, and Gemini only — Ollama embeds instructions in the main prompt. Warning: removing the "return ONLY valid JSON" intent here can break generation.',
    default: PROVIDER_JSON_ROLE,
  },
];

const PROMPT_DEFAULTS = Object.fromEntries(PROMPT_REGISTRY.map(p => [p.key, p.default]));

// Keys an admin is allowed to override / reset (single source of truth for the API).
export const PROMPT_KEYS = PROMPT_REGISTRY.map(p => p.key);

// Returns the override from settings if present and non-empty, else the built-in default.
export function resolvePrompt(key, settings = {}) {
  const v = settings?.[key];
  return (typeof v === 'string' && v.trim()) ? v : PROMPT_DEFAULTS[key];
}
