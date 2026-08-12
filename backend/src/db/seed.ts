import { nanoid } from "nanoid";
import { db } from "./client.js";
import { run as migrate } from "./migrate.js";
import * as s from "./schema.js";

function id(prefix: string) {
  return `${prefix}_${nanoid(12)}`;
}

// Deterministic PRNG for reproducible demo data
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CS2_TOPICS = [
  "players",
  "teams",
  "tournaments",
  "skins",
  "economy",
  "drama",
  "records",
  "stories",
  "unusual_facts",
  "controversies",
];

const CS2_TAXONOMY = [
  "NEWS",
  "DRAMA",
  "MONEY",
  "SKINS",
  "PLAYERS",
  "TEAMS",
  "RECORDS",
  "HISTORY",
  "FUNNY",
  "MYSTERY",
  "CONTROVERSY",
  "TACTICS",
  "OTHER",
];

const CS2_FORMATS = [
  { key: "shorts", name: "Short vertical", duration: 30, platform: "youtube" },
  { key: "tiktok", name: "TikTok vertical", duration: 20, platform: "tiktok" },
  { key: "reels", name: "Instagram Reels", duration: 25, platform: "instagram" },
  { key: "long", name: "Long format", duration: 480, platform: "youtube" },
];

const CS2_AUDIENCE = {
  segments: [
    { name: "core players", age: "16-28", interests: ["ranked", "majors", "skins"] },
    { name: "skin traders", age: "18-35", interests: ["market", "cases", "profit"] },
    { name: "casual fans", age: "20-35", interests: ["highlights", "drama"] },
  ],
};

const HOOK_LIBS: Record<string, string[]> = {
  contradiction: [
    "Лучший игрок мира промахнулся по пустому",
    "s1mple терял матчи, пока не сделал это",
    "Этот скин подорожал в 100 раз. Глупость — или гений?",
  ],
  money: [
    "Этот кейс стоил $0.01. Теперь он стоит $14,000",
    "Сколько зарабатывают про-игроки на самом деле",
    "Он продал скин за $100,000 за одну ночь",
  ],
  shock: [
    "Его команду сняли с мейджора за одну ошибку",
    "Они выиграли $1M, и сразу всё потеряли",
    "Это удаление: игрок №1 под подозрением",
  ],
  mystery: [
    "Почему этот скин никто не покупает",
    "Никто не знает, что сделал этот игрок в финале",
    "Скрытая механика, о которой молчат разработчики",
  ],
  question: [
    "Почему Natus Vincere больше не та команда?",
    "Фейк или правда: 128-тик точнее?",
    "Куда исчезла легендарная команда?",
  ],
  unfinished: [
    "Он почти победил. А потом случилось это…",
    "Проигранный финал, который изменил всё…",
    "Перед этим финалом он сказал одну фразу…",
  ],
};

const TITLES = [
  "Почему {p1} — лучший игрок в истории CS2",
  "{r1} игроков покупают скины. Вот что происходит с деньгами",
  "История команды {t1}: от аутсайдеров до чемпионов",
  "Как {p1} зарабатывает больше, чем вы думаете",
  "Самый дорогой скин в CS2 и его владелец",
  "Контракт {p1} — почему он стоит столько",
  "Рекорд, который держится уже {n1} лет",
  "Скандал: {t1} исключили из состава",
  "5 фактов о {p1}, которые вы не знали",
  "Экономика скинов: пузырь или золотая жила?",
  "Что происходит с ценами на кейсы в 2026",
  "Финал мейджора: разбор главного момента",
  "Почему {t1} проиграла {t2} в финале",
  "Самые дорогие киберспортсмены года",
  "Как {p1} тренируется: расписание легенды",
  "Читерство в CS2: правда, которую скрывают",
  "Взлёт и падение {p1}: полная история",
  "{n1} шокирующих фактов о скинах",
  "Когда выйдет новый кейс? Что известно",
  "Трейдинг скинов: стратегии 2026 года",
];

const EVENTS = ["Major Shanghai", "Major Austin", "IEM Katowice", "Blast Premier", "ESL Pro League"];
const PLAYERS = ["s1mple", "ZywOo", "donk", "m0NESY", "device", "NiKo", "sh1ro", "frozen", "jame", "HooXi"];
const TEAMS = ["Natus Vincere", "FaZe", "G2", "Spirit", "Vitality", "Cloud9", "MOUZ", "Heroic", "Astralis", "Liquid"];
const LANGUAGES = ["ru", "en"];
const FORMAT_KEYS = ["shorts", "tiktok", "reels", "long"];

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function baseViews(rng: () => number, format: string) {
  if (format === "long") return 5000 + rng() * 80000;
  return 2000 + rng() * 40000;
}

function avgPercentageViewed(rng: () => number, views: number) {
  // bigger videos (viral) get worse overall % retention but that's fine
  const base = 30 + rng() * 40;
  return Math.min(90, base);
}

export async function seedDemo(force = false) {
  migrate();

  const existing = db.select().from(s.workspaces).all();
  if (existing.length > 0 && !force) {
    console.log("[seed] workspace exists, skipping. Use force to reseed.");
    return { seeded: false };
  }
  if (force) {
    if (existing.length > 0) {
      db.delete(s.settings);
      db.delete(s.workspaces);
      // cascade deletes everything else
    }
  }

  const rng = mulberry32(20260812);
  const workspaceId = id("ws");
  const networkId = id("net");
  const nicheId = id("nc");
  const now = new Date().toISOString();

  db.insert(s.workspaces).values({ id: workspaceId, name: "My Media Network", description: "AI Media Network OS — demo workspace" }).run();
  db.insert(s.networks).values({ id: networkId, workspace_id: workspaceId, name: "My Media Network", description: "Network #1" }).run();

  db.insert(s.niches).values({
    id: nicheId,
    network_id: networkId,
    name: "CS2",
    slug: "cs2",
    description: "Counter-Strike 2 / esports content niche",
    languages: LANGUAGES,
    geos: ["CIS", "Global"],
    taxonomy: CS2_TAXONOMY,
    content_formats: CS2_FORMATS,
    research_sources: [
      { name: "HLTV", url: "https://www.hltv.org", type: "news/stats" },
      { name: "Liquipedia CS", url: "https://liquipedia.net/counterstrike", type: "wiki" },
      { name: "hlbtv stats", url: "https://csstats.gg", type: "stats" },
      { name: "Reddit r/GlobalOffensive", url: "https://reddit.com/r/GlobalOffensive", type: "community" },
      { name: "Skin market data", url: "https://steamcommunity.com/market", type: "market" },
    ],
    audience_profile: CS2_AUDIENCE,
    monetization_categories: ["ads", "affiliate", "sponsors", "telegram"],
    is_demo: true,
  }).run();

  const taxonomyTopicIds: Record<string, string> = {};
  for (const cat of CS2_TAXONOMY) {
    const tid = id("tp");
    taxonomyTopicIds[cat] = tid;
    db.insert(s.topics).values({
      id: tid,
      niche_id: nicheId,
      name: cat.replace(/_/g, " ").toLowerCase(),
      category: cat,
    }).run();
  }

  const brandsStub: Record<string, string> = {};
  const channelsStub: { id: string; brandId: string; platform: string; name: string }[] = [];

  const brandRuId = id("br");
  const brandEnId = id("br");
  brandsStub["ru"] = brandRuId;
  brandsStub["en"] = brandEnId;

  db.insert(s.brands).values([
    { id: brandRuId, niche_id: nicheId, name: "CS2 RU", language: "ru", geo: "CIS" },
    { id: brandEnId, niche_id: nicheId, name: "CS2 EN", language: "en", geo: "Global" },
  ]).run();

  for (const platformKey of ["youtube", "tiktok", "instagram"]) {
    const pid = id("pf");
    db.insert(s.platforms).values({
      id: pid,
      key: platformKey,
      name: platformKey === "youtube" ? "YouTube" : platformKey === "tiktok" ? "TikTok" : "Instagram",
      config: { focus: ["shorts", "reels", "tiktok"].includes(platformKey) },
    }).run();

    if (platformKey !== "instagram" || true) {
      for (const lang of ["ru", "en"]) {
        const chId = id("ch");
        db.insert(s.channels).values({
          id: chId,
          brand_id: brandsStub[lang],
          platform_id: pid,
          name: `CS2 ${lang.toUpperCase()} ${platformKey}`,
          handle: `@cs2_${lang}_${platformKey}`,
          status: "active",
          config: { format: platformKey },
        }).run();
        channelsStub.push({ id: chId, brandId: brandsStub[lang], platform: platformKey, name: `CS2 ${lang.toUpperCase()} ${platformKey}` });
      }
    }
  }
  // telegram channel
  const tgPid = id("pf");
  db.insert(s.platforms).values({ id: tgPid, key: "telegram", name: "Telegram", config: { focus: ["community"] } }).run();
  const tgChId = id("ch");
  db.insert(s.channels).values({
    id: tgChId,
    brand_id: brandsStub["ru"],
    platform_id: tgPid,
    name: "CS2 RU Telegram",
    handle: "@cs2_ru_tg",
    status: "active",
    config: { format: "community" },
  }).run();
  channelsStub.push({ id: tgChId, brandId: brandsStub["ru"], platform: "telegram", name: "CS2 RU Telegram" });

  // demo videos
  const demoVideos: typeof s.videos.$inferInsert[] = [];
  const demoMetrics: typeof s.metrics.$inferInsert[] = [];
  const demoHooks: typeof s.hooks.$inferInsert[] = [];

  const N = 100;
  for (let i = 0; i < N; i++) {
    const format = pick(rng, FORMAT_KEYS);
    const lang = rng() < 0.55 ? "ru" : "en";
    const ch = pick(rng, channelsStub.filter((c) => c.platform !== "telegram"));
    const vs = baseViews(rng, format);
    const likes = Math.floor(vs * (0.02 + rng() * 0.06));
    const comments = Math.floor(vs * (0.004 + rng() * 0.02));
    const shares = Math.floor(vs * (0.003 + rng() * 0.015));
    const saves = Math.floor(vs * (0.005 + rng() * 0.02));
    const followersGained = Math.floor(vs * (0.002 + rng() * 0.008));
    const ctr = 3 + rng() * 7;
    const apv = avgPercentageViewed(rng, vs);
    const dur = format === "long" ? 300 + Math.floor(rng() * 400) : 15 + Math.floor(rng() * 30);
    const watchTime = vs * dur * 0.5; // avg seconds watched
    const publishedDaysAgo = Math.floor(rng() * 90);
    const publishedAt = new Date(Date.now() - publishedDaysAgo * 86400000).toISOString();
    const topic = pick(rng, CS2_TOPICS);
    const hLib = pick(rng, Object.keys(HOOK_LIBS));
    const hook = pick(rng, HOOK_LIBS[hLib]);
    const title = pick(rng, TITLES)
      .replace("{p1}", pick(rng, PLAYERS))
      .replace("{p1}", pick(rng, PLAYERS))
      .replace("{t1}", pick(rng, TEAMS))
      .replace("{t2}", pick(rng, TEAMS))
      .replace("{n1}", String(3 + Math.floor(rng() * 8)));
    const isBigEvent = rng() < 0.15;
    const viralFactor = isBigEvent ? 3 + rng() * 6 : 1;
    const finalViews = Math.floor(vs * viralFactor);

    const vid = id("vd");
    db.insert(s.videos).values({
      id: vid,
      channel_id: ch.id,
      brand_id: ch.brandId,
      niche_id: nicheId,
      title,
      topic,
      hook,
      format,
      language: lang,
      geo: lang === "ru" ? "CIS" : "Global",
      status: "published",
      duration_seconds: dur,
      published_at: publishedAt,
      tags: [topic, format],
      source: "demo",
      is_demo: true,
    }).run();

    const retention = format === "long" ? 20 + rng() * 25 : 30 + rng() * 40;
    db.insert(s.metrics).values({
      id: id("mt"),
      video_id: vid,
      date: publishedAt.slice(0, 10),
      views: finalViews,
      likes,
      comments,
      shares,
      saves,
      followers_gained: followersGained,
      avg_watch_time_sec: Math.round(dur * (retention / 100)),
      avg_percentage_viewed: retention,
      retention_0_3: 55 + rng() * 38,
      retention_10: retention - 5,
      retention_30: retention,
      retention_60: format === "long" ? retention * 0.55 : retention * 0.4,
      ctr,
      traffic_source: { foryou: Math.floor(40 + rng() * 50), search: Math.floor(rng() * 25), subs: Math.floor(rng() * 30) },
      returning_viewers: Math.floor(finalViews * (0.1 + rng() * 0.3)),
      watch_time_hours: Math.round(watchTime / 3600),
      rpm: format === "long" ? 1.5 + rng() * 2.5 : 0.3 + rng() * 0.8,
      revenue: 0,
      clicks: Math.floor(finalViews * 0.001),
      conversions: Math.floor(finalViews * 0.0001),
      source: "demo",
    }).run();

    db.insert(s.hooks).values({
      id: id("hk"),
      niche_id: nicheId,
      video_id: vid,
      text: hook,
      type: hLib,
      performance: { views: finalViews, apv: retention },
      source: "demo",
    }).run();
  }

  // demo ideas with viral score
  const ideaRows: typeof s.ideas.$inferInsert[] = [];
  const demoIdeas: { title: string; topic: string; hooks: string[]; score: number; evidence: Record<string, unknown> }[] = [
    {
      title: "Экономика кейсов: почему одни скины растут в цене",
      topic: "skins",
      hooks: [
        "Этот кейс стоил $0.01. Теперь $14,000.",
        "Доходность скинов выше, чем у акций.",
      ],
      score: 88,
      evidence: { sample: 6, medianViews: 38000, correlation: "money topics outperform median by 64%" },
    },
    {
      title: "Самые дорогие киберспортсмены 2026 — сколько они реально зарабатывают",
      topic: "players",
      hooks: ["Вы думали, s1mple беден? Вот его реальный доход."],
      score: 82,
      evidence: { sample: 4, medianViews: 31000 },
    },
    {
      title: "Финал мейджора: одна ошибка на 10 секунд, которая стоила $1,000,000",
      topic: "tournaments",
      hooks: ["10 секунд, которые стоили миллион."],
      score: 91,
      evidence: { sample: 3, highEventCorrelation: true },
    },
    {
      title: "История скина, который считался мусором и стал легендой",
      topic: "skins",
      hooks: ["Все выбросили. Он стал бесценным."],
      score: 79,
      evidence: { sample: 5, medianViews: 29000 },
    },
    {
      title: "Почему Natus Vincere больше не выигрывают мейджоры",
      topic: "teams",
      hooks: ["Пять лет назад они были непобедимы."],
      score: 74,
      evidence: { sample: 4, medianViews: 24000 },
    },
    {
      title: "7 фактов о CS2, о которых молчат стримеры",
      topic: "unusual_facts",
      hooks: ["Стримеры не хотят, чтобы вы это знали."],
      score: 71,
      evidence: { sample: 7, medianViews: 22000 },
    },
  ];

  for (const idea of demoIdeas) {
    db.insert(s.ideas).values({
      id: id("id"),
      niche_id: nicheId,
      title: idea.title,
      topic: idea.topic,
      description: "Demo idea",
      hooks: idea.hooks,
      viral_score: idea.score,
      score_breakdown: { curiosity: 20, conflict: 18, audience: 18, story: 17, share: 15 },
      evidence: idea.evidence,
      status: "ready",
      language: "ru",
      source: "demo",
      is_demo: true,
    }).run();
  }

  // demo experiment
  db.insert(s.experiments).values({
    id: id("xp"),
    niche_id: nicheId,
    name: "Hook length < 8 words",
    hypothesis: "shorter hooks increase first-3s retention",
    change: "hooks <= 8 words",
    sample_size: 5,
    expected_result: "+10% first-3s retention",
    success_metric: "retention_0_3",
    status: "active",
    start_date: new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10),
    decision: "MORE_DATA",
  }).run();

  // demo monetization opportunities (explicitly UNVERIFIED)
  db.insert(s.monetization_opportunities).values([
    {
      id: id("mo"),
      niche_id: nicheId,
      company: "Steam Market / CS2 case opening platforms",
      website: "steamcommunity.com",
      product: "CS2 case affiliate",
      geo: "Global",
      format: "short video",
      program_type: "affiliate",
      commission: "RANGE — vary by operator, verify each",
      requirements: "verify official affiliate terms per operator",
      verification_status: "UNVERIFIED",
      risk: "medium — some operators unreliable",
      notes: "Must verify each operator's terms; do not assume rates.",
    },
    {
      id: id("mo"),
      niche_id: nicheId,
      company: "YouTube Shorts ads",
      website: "youtube.com",
      product: "Ad revenue",
      geo: "Global",
      format: "shorts",
      program_type: "ads",
      commission: "RANGE — depends on RPM/region",
      requirements: "YouTube Partner Program",
      verification_status: "UNVERIFIED",
      risk: "low",
    },
  ]).run();

  // demo research
  db.insert(s.research).values([
    {
      id: id("rs"),
      niche_id: nicheId,
      title: "CS2 skin market trends sample (demo)",
      url: "https://steamcommunity.com/market",
      source_type: "web",
      source: "demo seed",
      content: "Synthetic demo research record.",
      confidence: "low",
      retrieved_at: now,
      tags: ["skins", "market"],
    },
  ]).run();

  // agents
  const agentDefs = [
    {
      key: "director",
      name: "AI Director",
      role: "command & strategy",
      description: "Видит всю сеть. Ставит приоритеты, управляет агентами, принимает решения KILL/KEEP/TEST/SCALE.",
      system_prompt: `You are the AI DIRECTOR of a media network. You see all networks, niches, brands, channels, videos, metrics, experiments, monetization, revenue and AI usage. Your job: analyze the system, find problems, set priorities, order the acting agents, give strategy, map the direct next actions. Always separate OBSERVATION, EVIDENCE, INTERPRETATION, ACTION. Separating CORRELATION from CAUSATION. Be brutally honest. If data insufficient, say "INSUFFICIENT DATA". Top priorities output format: numbered list: TOP PRIORITY | WHY | EVIDENCE | ACTION.`,
      model_config: { capability: "strong_reasoning" },
    },
    {
      key: "analyst",
      name: "ANALYST",
      role: "data analyst",
      description: "Работает с реальными данными. Анализирует winners/losers, hook, retention, duration, topic, correlation. Различает average и median.",
      system_prompt: `You are the ANALYST. You work with real video statistics. Find winners and losers. Compare to average AND median (median is more robust). Analyze topic, hook, length, structure, emotion, timing, platform, language. Look for repeatable patterns. ONE video is NOT a pattern. Report with CLAIM, EVIDENCE, SAMPLE SIZE, CONFIDENCE. Never invent data. If data insufficient, say "INSUFFICIENT DATA".`,
      model_config: { capability: "analytical" },
    },
    {
      key: "scriptwriter",
      name: "SCRIPTWRITER",
      role: "viral content strategist",
      description: "Пишет сценарии от аналитики. VIRAL SCORE /100. 5+ hooks. Retention map по сегментам.",
      system_prompt: `You are the SCRIPTWRITER. Write scripts from analytics, not from imagination. Use: best topics, best hooks, best retention, best-performing formats, audience, platform, language. Score each idea: VIRAL SCORE /100 using Freshness, Curiosity, Emotional intensity, Conflict, Surprise, Relatability, Visual potential, Story potential, Comment potential, Share potential, Audience fit, Competition. Provide at least 5 hooks per idea (contradiction, shock, question, unfinished story, unexpected fact, money, conflict, mystery). Build retention map for 0-2s, 2-5s, 5-10s, 10-20s, 20-30s, 30-45s, 45-60s with VOICE, VISUAL, TEXT, SOUND, NEXT CURIOSITY. Add open loops only if useful.`,
      model_config: { capability: "creative" },
    },
    {
      key: "monetization",
      name: "MONETIZATION",
      role: "monetization strategist",
      description: "Revenue ladder, affiliate/CPA/sponsors, risk scoring, first revenue actions.",
      system_prompt: `You are the MONETIZATION strategist. Work from statistics first. Revenue ladder: 0 -> 1k -> 5k -> 10k -> 25k -> 50k -> 100k+ followers and 10k->100k->500k->1M->5M->10M monthly views. For each level say: what to do, who to contact, what to sell, which affiliates, which sponsors, when to build media kit. IMPORTANT: never invent commissions, requirements, contacts, rates, minimum audience. Mark every unverified opportunity as UNVERIFIED. Never recommend scams, phishing, illegal gambling, KYC/GEO/sanctions bypasses.`,
      model_config: { capability: "analytical" },
    },
  ];
  for (const a of agentDefs) {
    db.insert(s.agents).values({ id: id("ag"), ...a }).run();
  }

  // model providers
  const ollamaId = id("mp");
  db.insert(s.model_providers).values({
    id: ollamaId,
    key: "ollama",
    name: "Ollama (локальный)",
    kind: "local",
    base_url: "http://127.0.0.1:11434",
    env_key: "",
    enabled: true,
    config: {},
  }).run();
  db.insert(s.models).values({
    id: id("mdl"),
    provider_id: ollamaId,
    model_id: "qwen2.5:7b",
    name: "Qwen2.5 7B",
    context_size: 32768,
    cost_in: 0,
    cost_out: 0,
    reasoning: false,
    capability: "general",
    availability: "free",
    enabled: true,
    priority: 1,
    notes: "локальная модель, бесплатно, работает через GPU/CPU",
  }).run();

  const openrouterId = id("mp");
  db.insert(s.model_providers).values({
    id: openrouterId,
    key: "openrouter",
    name: "OpenRouter (облако)",
    kind: "remote",
    base_url: "https://openrouter.ai/api/v1",
    env_key: "OPENROUTER_API_KEY",
    enabled: true,
    config: {},
  }).run();
  db.insert(s.models).values([
    {
      id: id("mdl"),
      provider_id: openrouterId,
      model_id: "deepseek/deepseek-chat:free",
      name: "DeepSeek Chat (free)",
      context_size: 16384,
      cost_in: 0,
      cost_out: 0,
      reasoning: false,
      capability: "general",
      availability: "free",
      enabled: true,
      priority: 4,
      notes: "бесплатная ($0) модель через OpenRouter",
    },
    {
      id: id("mdl"),
      provider_id: openrouterId,
      model_id: "google/gemini-flash-1.5-8b:free",
      name: "Gemini Flash 8B (free)",
      context_size: 16384,
      cost_in: 0,
      cost_out: 0,
      reasoning: false,
      capability: "fast",
      availability: "free",
      enabled: true,
      priority: 4,
      notes: "бесплатная ($0) модель через OpenRouter",
    },
    {
      id: id("mdl"),
      provider_id: openrouterId,
      model_id: "qwen/qwen-2.5-72b-instruct",
      name: "Qwen2.5 72B",
      context_size: 32768,
      cost_in: 0,
      cost_out: 0,
      reasoning: false,
      capability: "analytical",
      availability: "free",
      enabled: true,
      priority: 4,
      notes: "бесплатная сильная модель на OpenRouter",
    },
    {
      id: id("mdl"),
      provider_id: openrouterId,
      model_id: "meta-llama/llama-3-8b-instruct:free",
      name: "Llama 3 8B Instruct (free)",
      context_size: 8192,
      cost_in: 0,
      cost_out: 0,
      reasoning: false,
      capability: "fast",
      availability: "free",
      enabled: true,
      priority: 5,
      notes: "бесплатная быстрая модель",
    },
    {
      id: id("mdl"),
      provider_id: openrouterId,
      model_id: "mistralai/mistral-7b-instruct:free",
      name: "Mistral 7B Instruct (free)",
      context_size: 8192,
      cost_in: 0,
      cost_out: 0,
      reasoning: false,
      capability: "fast",
      availability: "free",
      enabled: true,
      priority: 5,
      notes: "бесплатная быстрая модель",
    },
    {
      id: id("mdl"),
      provider_id: ollamaId,
      model_id: "llama3.2:3b",
      name: "Llama 3.2 3B",
      context_size: 32768,
      cost_in: 0,
      cost_out: 0,
      reasoning: false,
      capability: "fast",
      availability: "free",
      enabled: true,
      priority: 2,
      notes: "быстрая маленькая локальная",
    },
  ]).run();

  const geminiId = id("mp");
  db.insert(s.model_providers).values({
    id: geminiId,
    key: "gemini",
    name: "Gemini (облако, Free Tier)",
    kind: "remote",
    base_url: "https://generativelanguage.googleapis.com",
    env_key: "GEMINI_API_KEY",
    enabled: true,
    config: {},
    notes: "Бесплатный тариф: 15 запросов/мин. Отлично для аналитики.",
  }).run();
  db.insert(s.models).values([
    {
      id: id("mdl"),
      provider_id: geminiId,
      model_id: "gemini-2.5-flash",
      name: "Gemini 2.5 Flash (free)",
      context_size: 1048576,
      cost_in: 0,
      cost_out: 0,
      reasoning: false,
      capability: "fast",
      availability: "free",
      enabled: true,
      priority: 3,
      notes: "бесплатный облачный fallback (Gemini API Free Tier)",
    },
    {
      id: id("mdl"),
      provider_id: geminiId,
      model_id: "gemini-2.5-flash-lite",
      name: "Gemini 2.5 Flash Lite (free)",
      context_size: 1048576,
      cost_in: 0,
      cost_out: 0,
      reasoning: false,
      capability: "analytical",
      availability: "free",
      enabled: true,
      priority: 3,
      notes: "бесплатный облачный fallback (Gemini API Free Tier)",
    },
    {
      id: id("mdl"),
      provider_id: geminiId,
      model_id: "gemini-1.5-pro",
      name: "Gemini 1.5 Pro (free tier)",
      context_size: 2097152,
      cost_in: 0,
      cost_out: 0,
      reasoning: true,
      capability: "strong_reasoning",
      availability: "free",
      enabled: true,
      priority: 2,
      notes: "Мощная модель с большим контекстом. Бесплатно до лимита.",
    },
  ]).run();

  // Groq - быстрые бесплатные модели
  const groqId = id("mp");
  db.insert(s.model_providers).values({
    id: groqId,
    key: "groq",
    name: "Groq Cloud (бесплатный tier)",
    kind: "remote",
    base_url: "https://api.groq.com/openai/v1",
    env_key: "GROQ_API_KEY",
    enabled: true,
    config: {},
    notes: "Очень быстрые inference. Бесплатный лимит: ~30 запросов/мин.",
  }).run();
  db.insert(s.models).values([
    {
      id: id("mdl"),
      provider_id: groqId,
      model_id: "llama-3.3-70b-versatile",
      name: "Llama 3.3 70B (Groq)",
      context_size: 12288,
      cost_in: 0,
      cost_out: 0,
      reasoning: false,
      capability: "analytical",
      availability: "free",
      enabled: true,
      priority: 2,
      notes: "Быстрая мощная модель. Отлично для аналитики.",
    },
    {
      id: id("mdl"),
      provider_id: groqId,
      model_id: "llama-3.1-8b-instant",
      name: "Llama 3.1 8B Instant (Groq)",
      context_size: 8192,
      cost_in: 0,
      cost_out: 0,
      reasoning: false,
      capability: "fast",
      availability: "free",
      enabled: true,
      priority: 1,
      notes: "Самая быстрая модель для простых задач.",
    },
    {
      id: id("mdl"),
      provider_id: groqId,
      model_id: "gemma2-9b-it",
      name: "Gemma2 9B (Groq)",
      context_size: 8192,
      cost_in: 0,
      cost_out: 0,
      reasoning: false,
      capability: "creative",
      availability: "free",
      enabled: true,
      priority: 3,
      notes: "Хороша для креативных задач.",
    },
  ]).run();

  // Hugging Face Inference API (бесплатный tier)
  const hfId = id("mp");
  db.insert(s.model_providers).values({
    id: hfId,
    key: "huggingface",
    name: "Hugging Face Inference API",
    kind: "remote",
    base_url: "https://api-inference.huggingface.co/models",
    env_key: "HF_API_KEY",
    enabled: true,
    config: {},
    notes: "Бесплатный доступ к множеству моделей. Может быть медленно.",
  }).run();
  db.insert(s.models).values([
    {
      id: id("mdl"),
      provider_id: hfId,
      model_id: "mistralai/Mistral-Nemo-Instruct-2407",
      name: "Mistral Nemo Instruct (HF)",
      context_size: 128000,
      cost_in: 0,
      cost_out: 0,
      reasoning: false,
      capability: "general",
      availability: "free",
      enabled: true,
      priority: 5,
      notes: "Бесплатная модель через HF Inference API.",
    },
    {
      id: id("mdl"),
      provider_id: hfId,
      model_id: "Qwen/Qwen2.5-Coder-32B-Instruct",
      name: "Qwen2.5 Coder 32B (HF)",
      context_size: 32768,
      cost_in: 0,
      cost_out: 0,
      reasoning: false,
      capability: "analytical",
      availability: "free",
      enabled: true,
      priority: 5,
      notes: "Хороша для структурированных данных.",
    },
  ]).run();

  // Together AI (бесплатные модели)
  const togetherId = id("mp");
  db.insert(s.model_providers).values({
    id: togetherId,
    key: "together",
    name: "Together AI (free tier)",
    kind: "remote",
    base_url: "https://api.together.xyz/v1",
    env_key: "TOGETHER_API_KEY",
    enabled: true,
    config: {},
    notes: "Бесплатный кредит $25 при регистрации. Много открытых моделей.",
  }).run();
  db.insert(s.models).values([
    {
      id: id("mdl"),
      provider_id: togetherId,
      model_id: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      name: "Llama 3.3 70B Turbo (Together)",
      context_size: 128000,
      cost_in: 0,
      cost_out: 0,
      reasoning: true,
      capability: "strong_reasoning",
      availability: "free",
      enabled: true,
      priority: 2,
      notes: "Мощная модель с бесплатным кредитом.",
    },
    {
      id: id("mdl"),
      provider_id: togetherId,
      model_id: "Qwen/Qwen2.5-72B-Instruct-Turbo",
      name: "Qwen2.5 72B Turbo (Together)",
      context_size: 32768,
      cost_in: 0,
      cost_out: 0,
      reasoning: false,
      capability: "analytical",
      availability: "free",
      enabled: true,
      priority: 2,
      notes: "Отличная аналитическая модель.",
    },
  ]).run();

  // DeepSeek API (очень дешёвые / бесплатные тарифы)
  const deepseekId = id("mp");
  db.insert(s.model_providers).values({
    id: deepseekId,
    key: "deepseek",
    name: "DeepSeek API",
    kind: "remote",
    base_url: "https://api.deepseek.com/v1",
    env_key: "DEEPSEEK_API_KEY",
    enabled: true,
    config: {},
    notes: "Очень низкие цены. Иногда бесплатные промо.",
  }).run();
  db.insert(s.models).values([
    {
      id: id("mdl"),
      provider_id: deepseekId,
      model_id: "deepseek-chat",
      name: "DeepSeek Chat",
      context_size: 128000,
      cost_in: 0.00027,
      cost_out: 0.0011,
      reasoning: false,
      capability: "analytical",
      availability: "paid",
      enabled: false,
      priority: 10,
      notes: "Очень дёшево. ~$0.27/1M tokens input.",
    },
    {
      id: id("mdl"),
      provider_id: deepseekId,
      model_id: "deepseek-reasoner",
      name: "DeepSeek Reasoner",
      context_size: 64000,
      cost_in: 0.00055,
      cost_out: 0.0022,
      reasoning: true,
      capability: "strong_reasoning",
      availability: "paid",
      enabled: false,
      priority: 10,
      notes: "Модель для сложного мышления. Недорого.",
    },
  ]).run();

  // LM Studio (локальный сервер, совместимый с OpenAI API)
  const lmstudioId = id("mp");
  db.insert(s.model_providers).values({
    id: lmstudioId,
    key: "lmstudio",
    name: "LM Studio (локальный)",
    kind: "local",
    base_url: "http://127.0.0.1:1234/v1",
    env_key: "",
    enabled: false,
    config: {},
    notes: "Запустите LM Studio локально. Любые GGUF модели бесплатно.",
  }).run();
  db.insert(s.models).values([
    {
      id: id("mdl"),
      provider_id: lmstudioId,
      model_id: "local-model",
      name: "Local Model (LM Studio)",
      context_size: 8192,
      cost_in: 0,
      cost_out: 0,
      reasoning: false,
      capability: "general",
      availability: "local",
      enabled: false,
      priority: 1,
      notes: "Модель загружается в LM Studio. Полностью бесплатно.",
    },
  ]).run();

  // settings
  db.insert(s.settings).values([
    { key: "demo_mode", value: true },
    { key: "default_niche", value: nicheId },
    { key: "report_currency", value: "USD" },
  ]).run();

  console.log(`[seed] demo data seeded: workspace=${workspaceId} niche=${nicheId} videos=${N}`);

  // вторая demo-ниша MMA (проверка многонишевости)
  const { seedMma } = await import("./seed-mma.js");
  await seedMma(false);

  return { seeded: true, workspaceId, networkId, nicheId };
}

if (process.argv[1] && process.argv[1].includes("seed")) {
  const force = process.argv.includes("--force");
  seedDemo(force).then(() => process.exit(0));
}