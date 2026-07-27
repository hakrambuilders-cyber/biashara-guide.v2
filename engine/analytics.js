/**
 * Analytics Engine (Module 10) — aggregate insight for TRA, never individual
 * surveillance. See docs/FUNCTIONAL_SPEC.md §7.1 and §9-10: this module may
 * only ever produce counts, percentages, and breakdowns — it must never
 * expose a single business's identity or raw profile. The UI that consumes
 * this (officer.js, the separate TRA Officer Console) enforces that by
 * design: it only ever renders the aggregates returned here, never the
 * underlying population.
 *
 * There is no real backend yet (see Functional Spec §3.2), so this module
 * generates a synthetic population and runs it through the exact same
 * engine/core.js functions that score a real citizen's profile — proving
 * the aggregate view is powered by the same brain, not a separate mocked-up
 * model. generateMockPopulation() takes a seed so the officer console can
 * regenerate a fresh-looking snapshot on demand (see officer.js's reset
 * control) without needing a real event-collection backend.
 */

import { copy, SECTORS } from './knowledge.js';
import { computeComplianceScore, computeRisk, getNextBestActions, getBenefits, SALES_ANNUAL_ESTIMATE } from './core.js';

// ---------------------------------------------------------------------------
// Deterministic synthetic population (stands in for real aggregated events
// until a backend exists to collect them for real)
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weightedPick(rng, items) {
  const total = items.reduce((sum, i) => sum + i.weight, 0);
  let r = rng() * total;
  for (const item of items) {
    if (r < item.weight) return item.value;
    r -= item.weight;
  }
  return items[items.length - 1].value;
}

const SECTOR_WEIGHTS = [
  { value: 'CHAKULA', weight: 28 },
  { value: 'REJAREJA', weight: 30 },
  { value: 'USAFIRI', weight: 16 },
  { value: 'UREMBO', weight: 14 },
  { value: 'UFUNDI', weight: 12 }
];
const STAGE_WEIGHTS = [
  { value: 'mpya', weight: 30 },
  { value: 'inaendelea', weight: 45 },
  { value: 'imara', weight: 25 }
];
const SALES_WEIGHTS = [
  { value: 'belowOne', weight: 38 },
  { value: 'oneToFive', weight: 32 },
  { value: 'fiveToTwenty', weight: 20 },
  { value: 'aboveTwenty', weight: 10 }
];
const REGION_WEIGHTS = [
  { value: 'Dar es Salaam', weight: 34 },
  { value: 'Mwanza', weight: 12 },
  { value: 'Arusha', weight: 11 },
  { value: 'Dodoma', weight: 9 },
  { value: 'Mbeya', weight: 9 },
  { value: 'Morogoro', weight: 8 },
  { value: 'Tanga', weight: 8 },
  { value: 'Zanzibar', weight: 9 }
];
const LANGUAGE_WEIGHTS = [
  { value: 'sw', weight: 82 },
  { value: 'en', weight: 18 }
];
const CHANNEL_WEIGHTS = [
  { value: 'web', weight: 55 },
  { value: 'ussd', weight: 30 },
  { value: 'whatsapp', weight: 15 }
];
const NOTICE_WEIGHTS = [
  { value: 'Kikumbusho', weight: 38 },
  { value: 'Kikumbusho cha return', weight: 20 },
  { value: 'Kikumbusho cha malipo', weight: 16 },
  { value: 'Taarifa ya ukadiriaji', weight: 14 },
  { value: 'Taarifa ya adhabu', weight: 12 }
];
const CHAT_TOPIC_WEIGHTS = [
  { value: 'tin', weight: 30 },
  { value: 'tax', weight: 26 },
  { value: 'notice', weight: 18 },
  { value: 'benefits', weight: 16 },
  { value: 'general', weight: 10 }
];

export function generateMockPopulation(n = 240, seed = 42) {
  const rng = mulberry32(seed);
  const population = [];

  for (let i = 0; i < n; i++) {
    const business = weightedPick(rng, SECTOR_WEIGHTS);
    const stage = weightedPick(rng, STAGE_WEIGHTS);
    const sales = weightedPick(rng, SALES_WEIGHTS);

    const registrations = [];
    if (rng() < 0.55) registrations.push('tin');
    if (rng() < 0.35) registrations.push('businessRegistration');
    if (rng() < 0.22) registrations.push('licence');

    const records = rng() < 0.4 ? 'yes' : 'no';
    const filedReturn = rng() < 0.32 ? 'yes' : 'no';
    const region = weightedPick(rng, REGION_WEIGHTS);
    const language = weightedPick(rng, LANGUAGE_WEIGHTS);
    const channel = weightedPick(rng, CHANNEL_WEIGHTS);
    const noticeType = rng() < 0.35 ? weightedPick(rng, NOTICE_WEIGHTS) : null;
    const chatTopic = rng() < 0.6 ? weightedPick(rng, CHAT_TOPIC_WEIGHTS) : null;

    // A small share of surveyed businesses turn out larger than their self-
    // reported bracket suggests (e.g. a formal wholesaler alongside informal
    // retailers in the same sector) — without this, every mock business
    // would fall under the presumptive-tax cap and that stat would read a
    // suspiciously flat 100%. This never touches `sales` (so engine/core.js
    // still scores compliance/risk normally); it only feeds the officer
    // console's turnover-based eligibility stat.
    const estimatedAnnualTurnover = rng() < 0.04
      ? Math.round(110000000 + rng() * 340000000)
      : SALES_ANNUAL_ESTIMATE[sales];

    population.push({
      profile: {
        business, stage, sales, registrations, records, filedReturn,
        detail: '', businessLabel: '', benefitStatus: stage === 'mpya' ? 'notStarted' : 'recent'
      },
      region, language, channel, noticeType, chatTopic, estimatedAnnualTurnover
    });
  }

  return population;
}

// ---------------------------------------------------------------------------
// Aggregation helpers
// ---------------------------------------------------------------------------

function groupBy(arr, keyFn) {
  const map = new Map();
  for (const item of arr) {
    const k = keyFn(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return Array.from(map.entries());
}

function avg(nums) {
  return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0;
}

function pct(count, total) {
  return total ? Math.round((100 * count) / total) : 0;
}

const GAP_LABELS = {
  tin: copy('Hawana TIN', 'No TIN'),
  businessRegistration: copy('Hawajasajili biashara', 'No business registration'),
  licence: copy('Hawana leseni', 'No licence'),
  records: copy('Hawatunzi kumbukumbu', 'No records kept'),
  filedReturn: copy('Hawajawasilisha return', 'Have not filed a return')
};

function registrationGapCounts(items) {
  return {
    tin: items.filter((i) => !i.profile.registrations.includes('tin')).length,
    businessRegistration: items.filter((i) => !i.profile.registrations.includes('businessRegistration')).length,
    licence: items.filter((i) => !i.profile.registrations.includes('licence')).length,
    records: items.filter((i) => i.profile.records !== 'yes').length,
    filedReturn: items.filter((i) => i.profile.filedReturn !== 'yes').length
  };
}

// ---------------------------------------------------------------------------
// Public entry point: aggregate-only insights for the TRA Officer view
// ---------------------------------------------------------------------------

export function buildTRAInsights(population) {
  const n = population.length;

  // Score every entry with the exact same engine that guides a real citizen —
  // the aggregate view is the same brain, viewed from a different angle.
  const scored = population.map((p) => ({
    ...p,
    score: computeComplianceScore(p.profile),
    risk: computeRisk(p.profile),
    action: getNextBestActions(p.profile)[0],
    benefits: getBenefits(p.profile)
  }));

  const chatters = scored.filter((s) => s.chatTopic);
  const escalated = chatters.filter((s) => s.chatTopic === 'notice' || s.chatTopic === 'tax');

  const overview = {
    total: n,
    avgComplianceScore: avg(scored.map((s) => s.score)),
    highRiskShare: pct(scored.filter((s) => s.risk.level === 'high').length, n),
    escalationRate: pct(escalated.length, chatters.length)
  };

  const riskBreakdown = ['low', 'medium', 'high'].map((level) => {
    const count = scored.filter((s) => s.risk.level === level).length;
    return { level, count, pct: pct(count, n) };
  });

  const sectorBreakdown = groupBy(scored, (s) => s.profile.business)
    .map(([key, items]) => ({
      key,
      name: SECTORS[key]?.name.split(' (')[0] ?? key,
      count: items.length,
      pct: pct(items.length, n),
      avgScore: avg(items.map((i) => i.score))
    }))
    .sort((a, b) => b.count - a.count);

  const regionBreakdown = groupBy(scored, (s) => s.region)
    .map(([region, items]) => {
      const gaps = registrationGapCounts(items);
      const [topGapKey] = Object.entries(gaps).sort((a, b) => b[1] - a[1])[0];
      return {
        region,
        count: items.length,
        pct: pct(items.length, n),
        avgScore: avg(items.map((i) => i.score)),
        topGap: GAP_LABELS[topGapKey]
      };
    })
    .sort((a, b) => b.count - a.count);

  const registrationGaps = Object.entries(registrationGapCounts(scored))
    .map(([key, missing]) => ({ key, label: GAP_LABELS[key], missing, pct: pct(missing, n) }))
    .sort((a, b) => b.pct - a.pct);

  const topNextActions = groupBy(scored, (s) => s.action.key)
    .map(([key, items]) => ({ key, title: items[0].action.title, count: items.length, pct: pct(items.length, n) }))
    .sort((a, b) => b.count - a.count);

  const noticedScored = scored.filter((s) => s.noticeType);
  const noticeBreakdown = groupBy(noticedScored, (s) => s.noticeType)
    .map(([type, items]) => ({ type, count: items.length, pct: pct(items.length, noticedScored.length) }))
    .sort((a, b) => b.count - a.count);

  const languageSplit = groupBy(scored, (s) => s.language)
    .map(([lang, items]) => ({ lang, count: items.length, pct: pct(items.length, n) }))
    .sort((a, b) => b.count - a.count);

  const channelSplit = groupBy(scored, (s) => s.channel)
    .map(([channel, items]) => ({ channel, count: items.length, pct: pct(items.length, n) }))
    .sort((a, b) => b.count - a.count);

  const chatTopicBreakdown = groupBy(chatters, (s) => s.chatTopic)
    .map(([topic, items]) => ({ topic, count: items.length, pct: pct(items.length, chatters.length) }))
    .sort((a, b) => b.count - a.count);

  // getBenefits() item [3] (growth resources) is still the right source for
  // that stat; presumptive-tax eligibility is computed independently here
  // from estimated turnover so the rare above-cap outliers (see
  // generateMockPopulation) actually show up instead of a flat 100%.
  const benefitsSnapshot = {
    presumptiveEligiblePct: pct(scored.filter((s) => s.estimatedAnnualTurnover <= 100000000).length, n),
    growthCheckPct: pct(scored.filter((s) => s.benefits.items[3].status === 'check').length, n)
  };

  return {
    generatedAt: Date.now(),
    overview,
    riskBreakdown,
    sectorBreakdown,
    regionBreakdown,
    registrationGaps,
    topNextActions,
    noticeBreakdown,
    languageSplit,
    channelSplit,
    chatTopicBreakdown,
    benefitsSnapshot
  };
}
