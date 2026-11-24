// AI understanding for "Hey Siri, Sky …". Tries, in order, whichever is set up as a Supabase secret:
//   GROQ_API_KEY       → Groq free tier (GPT-OSS 120B), fast and free
//   ANTHROPIC_API_KEY  → Claude (paid)
// If none is set, or every call fails, index.ts falls back to the rules in intent.ts.
import Anthropic from 'npm:@anthropic-ai/sdk@1.10.0';

export type Action =
  | { type: 'water'; ml: number }
  | { type: 'habit_done'; habit_id: string }
  | { type: 'habit_skip'; habit_id: string }
  | { type: 'plan_done'; plan_id: string }
  | { type: 'plan'; title: string; day: 'today' | 'tomorrow'; start: string | null; duration_min: number | null }
  | { type: 'expense'; amount: number; category: string | null; note: string | null; mode: string | null; day: 'today' | 'yesterday' };

const key = Deno.env.get('ANTHROPIC_API_KEY');
const groqKey = Deno.env.get('GROQ_API_KEY');
// Siri gives up after a while, so keep it snappy: one retry, 15 s each.
const client = key ? new Anthropic({ apiKey: key, timeout: 15_000, maxRetries: 1 }) : null;
export const aiEnabled = !!client || !!groqKey;

const nullable = (t: object) => ({ anyOf: [t, { type: 'null' }] });
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['actions'],
  properties: {
    actions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'ml', 'habit_id', 'plan_id', 'title', 'day', 'start', 'duration_min', 'amount', 'category', 'note', 'mode'],
        properties: {
          type: { enum: ['water', 'habit_done', 'habit_skip', 'plan_done', 'plan', 'expense'] },
          ml: nullable({ type: 'integer' }),
          habit_id: nullable({ type: 'string' }),
          plan_id: nullable({ type: 'string' }),
          title: nullable({ type: 'string' }),
          day: nullable({ enum: ['today', 'tomorrow', 'yesterday'] }),
          start: nullable({ type: 'string', description: '24h "HH:MM"' }),
          duration_min: nullable({ type: 'integer' }),
          amount: nullable({ type: 'number' }),
          category: nullable({ type: 'string' }),
          note: nullable({ type: 'string' }),
          mode: nullable({ type: 'string' }),
        },
      },
    },
  },
};

// Groq's strict mode wants nullable fields as type unions.
const orNull = (t: string) => ({ type: [t, 'null'] });
const GROQ_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['actions'],
  properties: {
    actions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'ml', 'habit_id', 'plan_id', 'title', 'day', 'start', 'duration_min', 'amount', 'category', 'note', 'mode'],
        properties: {
          type: { type: 'string', enum: ['water', 'habit_done', 'habit_skip', 'plan_done', 'plan', 'expense'] },
          ml: orNull('integer'),
          habit_id: orNull('string'),
          plan_id: orNull('string'),
          title: orNull('string'),
          day: orNull('string'),
          start: orNull('string'),
          duration_min: orNull('integer'),
          amount: orNull('number'),
          category: orNull('string'),
          note: orNull('string'),
          mode: orNull('string'),
        },
      },
    },
  },
};

const SYSTEM = `You turn one thing a person said to Siri into actions in their habit and planning app, Sky.
The words come from dictation, so expect filler ("so", "okay", "like"), missing words and mis-heard words. Work out what they meant.

Action types:
- water: they drank water. ml = amount (1 glass = 250, 1 bottle = 500, "a litre" = 1000). If no amount is said, 250.
- habit_done: they did one of their habits (any tense or phrasing: "I meditated", "went to the gym", "finished reading"). habit_id must be one of the listed habit ids. Pick the closest habit by meaning, e.g. gym/exercise -> a workout habit. Not for water habits: use water instead.
- habit_skip: they are skipping a habit today on purpose (rest day, "skip X today").
- plan_done: they say they already did one of their open plans ("paid the gas bill"). plan_id must be one of the listed plan ids.
- expense: they spent money ("25 rupees groceries", "paid 475 on Blinkit via Amazon Pay", "200 auto"). amount in rupees ("1.5k" = 1500). category = one of the listed category ids that fits best, or null if you can't tell. note = the shop or item if they named one ("Blinkit"), else null. mode = how they paid if said (UPI for GPay/PhonePe/Paytm, Cash, Card, Amazon Pay), else null. day = "yesterday" if they said so, else "today". Several spends in one sentence = several expense actions.
- plan: something to do later. title = a short, clean task name in Title case, 2-6 words, without filler, dates or times ("so make a plan to meet my house owner at 7 pm" -> "Meet house owner"). day = "tomorrow" if they say tomorrow, otherwise "today". start = "HH:MM" 24h if they gave a time, else null; a bare hour like "at 7" means the next sensible time while awake (they wake at {WAKE}). duration_min if they said how long, else null.

Rules:
- One sentence can hold several actions ("I meditated and drank half a litre, and add gym tomorrow at 7" -> three actions). Return them in the order said.
- Only use ids from the lists. If they say they did something that matches no habit or open plan, ignore that part. Never invent habits.
- If nothing actionable was said, return an empty actions list.
- Set every field that doesn't apply to an action to null.
- day is "today" or "tomorrow" (expenses: "today" or "yesterday"); start is 24h "HH:MM".`;

type Ctx = {
  habits: { id: string; name: string }[];
  plans: { id: string; title: string; day: string }[];
  categories: { id: string; name: string }[];
  now: string;
  wake: string;
};

export async function understand(text: string, ctx: Ctx): Promise<Action[] | null> {
  if (!groqKey && !client) return null;
  const context = [
    `Now: ${ctx.now}`,
    `Habits:\n${ctx.habits.map((h) => `- ${h.id}: ${h.name}`).join('\n') || '(none)'}`,
    `Open plans:\n${ctx.plans.map((p) => `- ${p.id}: ${p.title} (${p.day})`).join('\n') || '(none)'}`,
    `Expense categories:\n${ctx.categories.map((c) => `- ${c.id}: ${c.name}`).join('\n')}`,
  ].join('\n\n');
  const system = SYSTEM.replace('{WAKE}', ctx.wake);
  const user = `${context}\n\nThey said: "${text}"`;
  for (const ask of [groqKey ? askGroq : null, client ? askClaude : null]) {
    if (!ask) continue;
    try {
      const out = await ask(system, user);
      if (out === null) continue;
      const parsed = JSON.parse(out) as { actions: Record<string, unknown>[] };
      return clean(parsed.actions, ctx);
    } catch (e) {
      console.error('AI understanding failed:', e instanceof Error ? e.message : e);
    }
  }
  return null;
}

/** Groq free tier, OpenAI-compatible chat completions. Returns the JSON text, or null. */
async function askGroq(system: string, user: string): Promise<string | null> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(12_000),
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      reasoning_effort: 'low',
      include_reasoning: false,
      temperature: 0,
      max_completion_tokens: 2000,
      response_format: { type: 'json_schema', json_schema: { name: 'sky_actions', strict: true, schema: GROQ_SCHEMA } },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) {
    console.error('Groq error', res.status, (await res.text()).slice(0, 300));
    return null;
  }
  const data = await res.json();
  const choice = data?.choices?.[0];
  if (choice?.finish_reason === 'length') return null;
  return typeof choice?.message?.content === 'string' ? choice.message.content : null;
}

/** Claude (paid), structured outputs. Returns the JSON text, or null. */
async function askClaude(system: string, user: string): Promise<string | null> {
  const res = await client!.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 2000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system,
    messages: [{ role: 'user', content: user }],
  });
  const msg = res as unknown as { stop_reason: string; content: { type: string; text?: string }[] };
  if (msg.stop_reason === 'refusal' || msg.stop_reason === 'max_tokens') return null;
  return msg.content.find((b) => b.type === 'text')?.text ?? null;
}

/** Trust nothing: keep only actions that point at real habits/plans and have sane values. */
function clean(raw: Record<string, unknown>[], ctx: { habits: { id: string }[]; plans: { id: string }[]; categories: { id: string }[] }): Action[] {
  const catIds = new Set(ctx.categories.map((c) => c.id));
  const habitIds = new Set(ctx.habits.map((h) => h.id));
  const planIds = new Set(ctx.plans.map((p) => p.id));
  const out: Action[] = [];
  for (const a of raw ?? []) {
    if (a.type === 'water' && typeof a.ml === 'number' && a.ml > 0 && a.ml <= 5000) out.push({ type: 'water', ml: Math.round(a.ml) });
    else if ((a.type === 'habit_done' || a.type === 'habit_skip') && habitIds.has(String(a.habit_id))) out.push({ type: a.type === 'habit_skip' ? 'habit_skip' : 'habit_done', habit_id: String(a.habit_id) });
    else if (a.type === 'plan_done' && planIds.has(String(a.plan_id))) out.push({ type: 'plan_done', plan_id: String(a.plan_id) });
    else if (a.type === 'expense' && typeof a.amount === 'number' && a.amount > 0 && a.amount < 10_000_000)
      out.push({
        type: 'expense',
        amount: Math.round(a.amount * 100) / 100,
        category: typeof a.category === 'string' && catIds.has(a.category) ? a.category : null,
        note: typeof a.note === 'string' && a.note.trim() ? a.note.trim().slice(0, 60) : null,
        mode: typeof a.mode === 'string' && a.mode.trim() ? a.mode.trim().slice(0, 30) : null,
        day: a.day === 'yesterday' ? 'yesterday' : 'today',
      });
    else if (a.type === 'plan' && typeof a.title === 'string' && a.title.trim()) {
      const start = typeof a.start === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(a.start) ? a.start : null;
      const dur = typeof a.duration_min === 'number' && a.duration_min >= 5 && a.duration_min <= 720 ? Math.round(a.duration_min) : null;
      out.push({ type: 'plan', title: a.title.trim().slice(0, 80), day: a.day === 'tomorrow' ? 'tomorrow' : 'today', start, duration_min: dur });
    }
  }
  return out;
}
