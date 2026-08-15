/**
 * Compliance Advisor Engine — the "brain" behind Biashara Guide.
 *
 * This module is deliberately channel-agnostic: every export is a pure
 * function that takes plain data in and returns plain bilingual data out.
 * It has no DOM, no routing, and no storage calls, so the exact same
 * functions can drive the web UI (app.js), a WhatsApp/USSD-style text
 * channel (channels/text-adapter.js), or a future call-centre tool.
 *
 * Everything here is preliminary guidance, not a binding legal or tax
 * determination — see Module 4 (Knowledge Engine) rules in the spec.
 */

import { copy, SECTORS, NUMBER_UNITS, FAQS, NOTICES } from './knowledge.js';
import { currentRules } from './regulatory.js';

// ---------------------------------------------------------------------------
// Free-text parsing (sector + Swahili/English sales figures)
// ---------------------------------------------------------------------------

export function parseSwahiliNumber(text) {
  if (!text) return null;
  const cleanText = text.toLowerCase().replace(/,/g, '').replace(/\b(tsh|tzs|shilingi)\b/g, ' ').trim();
  const wordNumbers = { sifuri: 0, moja: 1, mbili: 2, tatu: 3, nne: 4, tano: 5, sita: 6, saba: 7, nane: 8, tisa: 9, kumi: 10, ishirini: 20, thelathini: 30, arobaini: 40, hamsini: 50, sitini: 60, sabini: 70, themanini: 80, tisini: 90 };
  const prefixUnit = /\b(milioni|million|mln|laki|lakh|lkh|elfu|efu|elph|mia|hundred)\s+(sifuri|moja|mbili|tatu|nne|tano|sita|saba|nane|tisa|kumi|ishirini|thelathini|arobaini|hamsini|sitini|sabini|themanini|tisini|\d+(?:\.\d+)?)/g;
  let prefixTotal = 0;
  let prefixMatches = 0;
  for (const match of cleanText.matchAll(prefixUnit)) {
    const amount = Number.isFinite(Number(match[2])) ? Number(match[2]) : wordNumbers[match[2]];
    const scale = /^(milioni|million|mln)$/.test(match[1]) ? 1_000_000 : /^(laki|lakh|lkh)$/.test(match[1]) ? 100_000 : /^(elfu|efu|elph)$/.test(match[1]) ? 1_000 : 100;
    prefixTotal += amount * scale;
    prefixMatches += 1;
  }
  if (prefixMatches) return Math.round(prefixTotal);

  const mMatch = cleanText.match(/(\d+(?:\.\d+)?)\s*(?:m|mln|million|milioni)\b/);
  if (mMatch) return Math.round(parseFloat(mMatch[1]) * 1000000);

  const lakhMatch = cleanText.match(/(\d+(?:\.\d+)?)\s*(?:laki|lakh|lkh)\b/) || cleanText.match(/(?:laki|lakh|lkh)\s*(\d+(?:\.\d+)?)/);
  if (lakhMatch) return Math.round(parseFloat(lakhMatch[1] || lakhMatch[2]) * 100000);

  const kMatch = cleanText.match(/(\d+(?:\.\d+)?)\s*(?:k|elfu|efu|elph)\b/) || cleanText.match(/(?:elfu|efu|elph)\s*(\d+(?:\.\d+)?)/);
  if (kMatch) return Math.round(parseFloat(kMatch[1] || kMatch[2]) * 1000);

  const tokens = cleanText.split(/\s+/).filter(Boolean);
  let total = 0;
  let current = 0;
  let foundUnit = false;
  for (const token of tokens) {
    if (token === 'na') continue;
    if (wordNumbers[token] !== undefined) { current += wordNumbers[token]; continue; }
    const digit = Number(token);
    if (Number.isFinite(digit)) { current += digit; continue; }
    const scale = /^(milioni|million|mln|m)$/.test(token) ? 1_000_000
      : /^(laki|lakh|lkh)$/.test(token) ? 100_000
      : /^(elfu|efu|elph|k)$/.test(token) ? 1_000
      : /^(mia|hundred)$/.test(token) ? 100 : null;
    if (scale) {
      foundUnit = true;
      total += Math.max(1, current) * scale;
      current = 0;
    }
  }
  if (foundUnit) return Math.round(total + current);

  const numDigits = cleanText.match(/\b\d+\b/g);
  if (numDigits && numDigits.length > 0) {
    return parseInt(numDigits[0], 10);
  }

  let wordVal = 0;
  for (const word of cleanText.split(/\s+/)) if (NUMBER_UNITS[word]) wordVal += NUMBER_UNITS[word];
  return wordVal > 0 ? wordVal : null;
}

export function extractSalesAmount(text) {
  const clean = (text ?? '').toLowerCase();
  if (!/(mauzo|mapato|sales|turnover|kwa\s+siku|\/\s*siku|per\s+day)/.test(clean)) return null;
  return parseSwahiliNumber(clean);
}

export function parseSectorKey(text) {
  if (!text) return null;
  const cleanText = text.toLowerCase();
  for (const key in SECTORS) {
    if (SECTORS[key].keywords.some((kw) => cleanText.includes(kw))) return key;
  }
  return null;
}

export function parseSector(text) {
  const key = parseSectorKey(text);
  return key ? SECTORS[key].name : 'Biashara Ndogondogo / Rejareja (General Retail)';
}

export function sectorName(key) {
  return SECTORS[key]?.name ?? null;
}

// ---------------------------------------------------------------------------
// Presumptive tax calculator
// ---------------------------------------------------------------------------

export function assessPresumptiveEligibility(profile = {}) {
  const missing = [];
  if (!profile.legalForm) missing.push('legalForm');
  if (profile.legalForm === 'individual' && !profile.residentStatus) missing.push('residentStatus');
  if (profile.legalForm === 'individual' && !profile.exclusiveBusinessIncome) missing.push('exclusiveBusinessIncome');
  if (!profile.records) missing.push('records');
  if (profile.business === 'USAFIRI') missing.push('transportSchedule');
  if (profile.legalForm && profile.legalForm !== 'individual') return { status: 'ineligible', missing, reason: copy('Makadirio haya ni ya mtu binafsi anayeweza kutumia mfumo wa kodi ya makadirio; ubia na kampuni hutumia njia tofauti.', 'This estimate is for an individual who may use the presumptive regime; partnerships and companies use different routes.') };
  if (profile.residentStatus === 'no' || profile.exclusiveBusinessIncome === 'no') return { status: 'ineligible', missing, reason: copy('Majibu yako hayaendani na masharti ya mfumo wa kodi ya makadirio wa mtu binafsi.', 'Your answers do not match the conditions for the individual presumptive regime.') };
  if (profile.business === 'USAFIRI') return { status: 'transport', missing, reason: copy('Usafiri wa abiria au mizigo una jedwali maalumu la TRA; mauzo ya siku pekee hayatoshi kufanya makadirio salama.', 'Passenger or goods transport uses a separate TRA schedule; daily sales alone are not enough for a safe estimate.') };
  return { status: missing.length ? 'needs-info' : 'eligible', missing, reason: null };
}

export function calculateTRAPresumptiveTax(dailyTurnover, profile = {}) {
  const rules = currentRules();
  const bands = rules.presumptiveTax.bands;
  const annualTurnover = dailyTurnover * 365;
  const eligibility = assessPresumptiveEligibility(profile);
  let annualTax = 0;
  let bracketInfo = '';
  let isExempt = false;
  let isOverLimit = false;

  if (eligibility.status === 'transport' || eligibility.status === 'ineligible' || eligibility.status === 'needs-info') {
    annualTax = null;
    bracketInfo = eligibility.reason?.sw ?? 'Kamilisha muundo wa biashara, ukaazi, chanzo cha mapato na hali ya kumbukumbu kabla ya kuona mfano wa kodi.';
  } else if (annualTurnover <= bands[0].upTo) {
    annualTax = 0;
    bracketInfo = 'Chini ya TSh 4 Million (Inasamehewa Kodi)';
    isExempt = true;
  } else if (annualTurnover <= bands[1].upTo) {
    annualTax = profile.records === 'yes' ? Math.round((annualTurnover - 4_000_000) * 0.03) : bands[1].incompleteRecordsTax;
    bracketInfo = profile.records === 'yes' ? 'TSh 4M - 7M (3% ya mauzo yanayozidi TSh 4M kwa kumbukumbu kamili)' : 'TSh 4M - 7M (TSh 100,000 kwa kumbukumbu zisizokamilika)';
  } else if (annualTurnover <= bands[2].upTo) {
    annualTax = profile.records === 'yes' ? Math.round(90_000 + (annualTurnover - 7_000_000) * 0.03) : bands[2].incompleteRecordsTax;
    bracketInfo = profile.records === 'yes' ? 'TSh 7M - 11M (TSh 90,000 + 3% ya mauzo yanayozidi TSh 7M)' : 'TSh 7M - 11M (TSh 250,000 kwa kumbukumbu zisizokamilika)';
  } else if (annualTurnover <= rules.presumptiveTax.annualTurnoverCap) {
    annualTax = Math.round(annualTurnover * bands[3].incompleteRecordsRate);
    bracketInfo = 'TSh 11M - 200M (4% ya mauzo yote ya mwaka kwa kumbukumbu zisizokamilika)';
  } else {
    annualTax = null;
    bracketInfo = 'Zaidi ya TSh 200M: Biashara haiko kwenye kundi la Presumptive Tax.';
    isOverLimit = true;
  }

  const quarterlyTax = annualTax !== null ? Math.round(annualTax / 4) : null;
  const efdRequired = annualTurnover >= rules.efd.annualTurnoverThreshold;

  return { dailyTurnover, annualTurnover, annualTax, quarterlyTax, bracketInfo, isExempt, isOverLimit, efdRequired, eligibility, rulesetId: rules.id, rulesVerifiedAt: rules.appliesAsOf };
}

export function checkForFAQ(text) {
  if (!text) return null;
  const cleanText = text.toLowerCase();
  for (const faq of FAQS) {
    if (faq.keywords.some((kw) => cleanText.includes(kw))) return faq.response;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Shared profile helpers
// ---------------------------------------------------------------------------

export const SALES_ANNUAL_ESTIMATE = {
  belowOne: 700000,
  oneToFour: 2_500_000,
  fourToSeven: 5_500_000,
  sevenToEleven: 9_000_000,
  elevenToTwenty: 15_000_000,
  twentyToHundred: 60_000_000,
  hundredToTwoHundred: 150_000_000,
  aboveTwoHundred: 240_000_000,
  oneToFive: 3_000_000,
  fiveToTwenty: 12_000_000,
  aboveTwenty: 36_000_000
};

function estimatedAnnualTurnover(profile) {
  return SALES_ANNUAL_ESTIMATE[profile.sales] ?? null;
}

function flags(profile) {
  const rules = currentRules();
  const registrations = profile.registrations ?? [];
  const sector = profile.business && profile.business !== 'OTHER' ? SECTORS[profile.business] : null;
  const annualEstimate = estimatedAnnualTurnover(profile);
  return {
    hasTin: registrations.includes('tin'),
    hasBusinessRegistration: registrations.includes('businessRegistration'),
    hasLicence: registrations.includes('licence') && registrations.includes('tin'),
    sector,
    isNew: profile.stage === 'mpya',
    efdLikelyRequired: (sector?.efdSensitive ?? true) && annualEstimate !== null && annualEstimate >= rules.efd.annualTurnoverThreshold,
    annualEstimate
  };
}

// ---------------------------------------------------------------------------
// Compliance score — how formally "set up" the business is (0-96)
// ---------------------------------------------------------------------------

export function computeComplianceScore(profile) {
  const f = flags(profile);
  let completeness = 0;
  if (profile.business) completeness += 10;
  if (profile.businessSubtype || profile.detail) completeness += 4;
  if (profile.locationRegion && profile.locationArea) completeness += 2;
  if (profile.stage) completeness += 8;
  if (profile.sales) completeness += 8;

  let formality = 0;
  if (f.hasTin) formality += 18;
  if (f.hasBusinessRegistration) formality += 16;
  if (f.hasLicence) formality += 14;
  if (profile.records === 'yes') formality += 10;
  if (profile.filedReturn === 'yes') formality += 6;

  return Math.min(96, 20 + completeness + formality);
}

// ---------------------------------------------------------------------------
// Risk engine — surfaces *why* a business might be exposed, never scary tone
// ---------------------------------------------------------------------------

export function computeRisk(profile) {
  const f = flags(profile);
  const factors = [];
  const notes = [];
  let score = 0;

  if (!f.isNew && !f.hasTin) {
    score += 30;
    factors.push({ weight: 30, label: copy('Hakuna TIN iliyosajiliwa', 'No TIN registered on file') });
  }
  if (!f.isNew && profile.legalForm !== 'individual' && !f.hasBusinessRegistration) {
    score += 20;
    factors.push({ weight: 20, label: copy('Usajili wa biashara haujakamilika', 'Business registration incomplete') });
  }
  if (!f.isNew && !f.hasLicence) {
    score += 15;
    factors.push({ weight: 15, label: copy('Leseni ya biashara haijathibitishwa', 'Business licence not confirmed') });
  }
  if (!f.isNew && profile.records === 'no') {
    score += 10;
    factors.push({ weight: 10, label: copy('Hakuna kumbukumbu za mauzo/matumizi', 'No sales/expense records kept') });
  }
  if (!f.isNew && profile.filedReturn !== 'yes') {
    score += 10;
    factors.push({ weight: 10, label: copy('Bado hujawasilisha ritani ya kodi', "Haven't filed a return yet") });
  }
  if (f.efdLikelyRequired && !f.hasTin) {
    score += 10;
    factors.push({ weight: 10, label: copy('Mauzo yanaonyesha huenda EFD inahitajika', 'Sales level suggests an EFD machine may be required') });
  }

  if (f.efdLikelyRequired) {
    notes.push(copy(
      'Kwa kiwango hiki cha mauzo, mashine ya EFD/VFD huenda inahitajika (kiwango cha sasa kinachoonyeshwa na TRA: TSh Milioni 11 kwa mwaka).',
      'At this sales level, an EFD/VFD may be required (current threshold shown by TRA: TSh 11 Million/year).'
    ));
  }

  score = Math.min(100, score);
  const level = score <= 25 ? 'low' : score <= 55 ? 'medium' : 'high';
  return { score, level, factors, notes, mode: f.isNew ? 'setup' : 'risk' };
}

// ---------------------------------------------------------------------------
// Next-best-action — an ordered queue, not just a single recommendation
// ---------------------------------------------------------------------------

export function getNextBestActions(profile) {
  const f = flags(profile);
  const queue = [];

  if (!f.hasBusinessRegistration && ['partnership', 'company'].includes(profile.legalForm)) {
    queue.push({
      key: 'businessRegistration',
      title: profile.legalForm === 'company' ? copy('Sajili kampuni BRELA', 'Incorporate the company with BRELA') : copy('Sajili ubia BRELA', 'Register the partnership with BRELA'),
      time: copy('Muda hutegemea muundo na uhakiki wa BRELA', 'Timing depends on the structure and BRELA verification'),
      reason: copy('Cheti cha BRELA na nyaraka za muundo hutumika kabla ya kuomba TIN ya taasisi.', 'The BRELA certificate and formation documents come before the entity TIN application.')
    });
  }

  if (!f.hasTin) {
    queue.push({
      key: 'tin',
      title: copy('Pata TIN', 'Get a TIN'),
      time: copy('Muda hutegemea uhakiki wa TRA', 'Timing depends on TRA verification'),
      reason: copy('TIN ni hatua muhimu ya kuanza shughuli rasmi na kupata huduma zinazohusiana na biashara.', 'A TIN is an important step towards operating formally and accessing business services.')
    });
  }
  if (!f.hasBusinessRegistration && profile.legalForm !== 'individual' && !['partnership', 'company'].includes(profile.legalForm)) {
    queue.push({
      key: 'businessRegistration',
      title: copy('Kamilisha usajili wa biashara', 'Complete business registration'),
      time: copy('Muda hutegemea aina ya biashara', 'Time varies by business type'),
      reason: copy('Usajili sahihi husaidia biashara yako kutambuliwa na kufuata hatua zinazohitajika.', 'Correct registration helps your business become recognised and follow required steps.')
    });
  }
  if (!f.hasBusinessRegistration && profile.legalForm === 'individual') {
    queue.push({ key: 'businessRegistration', title: copy('Fikiria kusajili jina la biashara BRELA', 'Consider a BRELA business name'), time: copy('Hiari kwa jina la biashara la mtu binafsi', 'Optional for an individual business name'), reason: copy('Mtu binafsi anaweza kupata TIN bila kusajili jina la biashara, lakini jina la biashara linaweza kusaidia utambulisho rasmi.', 'An individual may obtain a TIN without a business name, but a registered name can support formal identity.') });
  }
  if (!f.hasLicence) {
    queue.push({
      key: 'licence',
      title: copy('Angalia leseni inayohitajika', 'Check the required licence'),
      time: copy('Hutegemea eneo na aina ya biashara', 'Depends on location and business type'),
      reason: f.sector?.licenceNote ?? copy('Baadhi ya biashara huhitaji leseni au kibali maalumu kabla ya kuanza au kuendelea kufanya kazi.', 'Some businesses require a licence or sector permit before operating.')
    });
  }
  if (f.efdLikelyRequired) {
    queue.push({
      key: 'efd',
      title: copy('Kagua uhitaji wa mashine ya EFD', 'Check whether an EFD machine is required'),
      time: copy('Takriban dakika 10', 'Around 10 minutes'),
      reason: copy('Mauzo yako yanaonyesha huenda umefikia kiwango kinachohitaji mashine ya EFD.', 'Your sales suggest you may have reached the level that requires an EFD machine.')
    });
  }
  if (profile.records !== 'yes') {
    queue.push({
      key: 'records',
      title: copy('Anza kutunza kumbukumbu rahisi', 'Start keeping simple records'),
      time: copy('Dakika 10 za kuanza', '10 minutes to get started'),
      reason: copy('Kumbukumbu za mauzo na matumizi husaidia kujua hali ya biashara na kutimiza wajibu kwa usahihi.', 'Sales and expense records help you understand your business and meet responsibilities accurately.')
    });
  }
  if (!f.isNew && profile.filedReturn !== 'yes') {
    queue.push({
      key: 'filedReturn',
      title: copy('Angalia kama unatakiwa kuwasilisha ritani ya kodi', 'Learn whether a return applies to you'),
      time: copy('Dakika 10', '10 minutes'),
      reason: copy('Kuwasilisha ritani ya kodi kwa wakati, inapohitajika, husaidia kuepuka adhabu na kutimiza wajibu wako kwa usahihi.', 'Filing on time helps you avoid penalties and stay in good standing with TRA.')
    });
  }

  if (queue.length === 0) {
    queue.push({
      key: 'maintain',
      title: copy('Endelea kudumisha hali yako nzuri', 'Keep maintaining your good standing'),
      time: copy('Dakika 5 kwa mwezi', '5 minutes a month'),
      reason: copy('Umekamilisha misingi muhimu — endelea kusasisha kumbukumbu na kuchunguza fursa mpya.', "You've completed the core essentials — keep records current and keep exploring new opportunities.")
    });
  }

  return queue.map((item, i) => ({ ...item, urgency: i === 0 ? 'high' : i === 1 ? 'medium' : 'low' }));
}

// ---------------------------------------------------------------------------
// Journey — visual progress ladder derived from the same action queue
// ---------------------------------------------------------------------------

export function getJourney(profile) {
  const f = flags(profile);
  const actions = getNextBestActions(profile);
  const currentKey = actions[0]?.key;

  const steps = [
    { key: 'profile', title: copy('Biashara imetambuliwa', 'Business identified'), description: copy('Umetoa maelezo ya msingi.', 'You shared essential details.'), done: true },
    { key: 'tin', title: copy('Pata TIN', 'Get a TIN'), description: copy('Hatua ya kuanza shughuli rasmi.', 'A step towards operating formally.'), done: f.hasTin },
    { key: 'businessRegistration', title: profile.legalForm === 'individual' ? copy('Jina la biashara BRELA (hiari)', 'BRELA business name (optional)') : copy('Kamilisha usajili BRELA', 'Complete BRELA registration'), description: copy('Kulingana na muundo wa biashara yako.', 'Based on your legal form.'), done: f.hasBusinessRegistration || profile.legalForm === 'individual' },
    { key: 'licence', title: copy('Angalia leseni inayohitajika', 'Check required licence'), description: copy('Baadhi ya biashara zinahitaji kibali maalumu.', 'Some businesses require a sector permit.'), done: f.hasLicence }
  ];
  if (f.efdLikelyRequired) {
    steps.push({ key: 'efd', title: copy('Kagua mashine ya EFD', 'Check EFD machine'), description: copy('Kwa kiwango cha mauzo ulichonacho.', 'Based on your sales level.'), done: false });
  }
  steps.push({ key: 'records', title: copy('Anza kutunza kumbukumbu', 'Start keeping records'), description: copy('Tumia kumbukumbu za mauzo na matumizi.', 'Use sales and expense records.'), done: profile.records === 'yes' });

  return steps.map((s) => ({ ...s, status: s.done ? 'done' : s.key === currentKey ? 'current' : 'pending' }));
}

// ---------------------------------------------------------------------------
// Benefits engine — eligibility-aware, not just a static list
// ---------------------------------------------------------------------------

export function getBenefits(profile) {
  const f = flags(profile);
  const lowSales = ['belowOne','oneToFour','oneToFive'].includes(profile.sales);
  const highSales = ['twentyToHundred','hundredToTwoHundred','aboveTwoHundred','aboveTwenty'].includes(profile.sales);

  const items = [
    {
      title: copy('Msamaha/kiwango maalum cha kodi ya makadirio', 'Presumptive tax exemption / flat rate'),
      description: copy('Biashara ndogo zenye mauzo chini ya TSh 4M/mwaka hazitozwi kodi; biashara zinazostahili hadi TSh 200M hutumia viwango vya mfumo wa kodi ya makadirio vinavyoonyeshwa na TRA.', 'Small businesses under TSh 4M/year owe no tax; qualifying businesses up to TSh 200M use the presumptive-tax rates currently shown by TRA.'),
      status: profile.sales ? 'check' : 'explore'
    },
    {
      title: copy('Mwongozo wa usajili uliobinafsishwa', 'Personalised registration guidance'),
      description: copy('Pata hatua zinazoendana na aina na hatua ya biashara yako.', 'Get steps that match your business type and stage.'),
      status: 'eligible'
    },
    {
      title: copy('Fursa za biashara mpya (hatua za awali)', 'New-business support (early stage)'),
      description: copy('Kuanzia 1 Julai 2026, mtu anayepata TIN kwa biashara kwa mara ya kwanza anaweza kuomba msamaha wa mwaka mmoja ikiwa makadirio ya mauzo yako ndani ya mfumo wa kodi ya makadirio na biashara itatumia mfumo huo pekee. TRA ndiyo huthibitisha.', 'From 1 July 2026, a first-time business TIN applicant may apply for one-year relief if projected turnover remains within the presumptive regime and the business operates exclusively under it. TRA makes the final decision.'),
      status: f.isNew && lowSales && profile.firstBusinessTin === 'yes' ? 'check' : f.isNew ? 'explore' : 'not-yet'
    },
    {
      title: copy('Rasilimali za ukuaji wa biashara', 'Business growth resources'),
      description: copy('Kwa biashara zinazokua, kuna programu na rasilimali za kuongeza uwezo.', 'Growing businesses may access programmes and resources to build capacity.'),
      status: highSales || profile.stage === 'imara' ? 'check' : 'not-yet'
    }
  ];

  return {
    headline: f.isNew
      ? copy('Fursa za kuanza kwa uelewa', 'Opportunities to start informed')
      : copy('Fursa za kukuza biashara kwa uelewa', 'Opportunities to grow informed'),
    items,
    disclaimer: copy('Haya ni maeneo ya kuchunguza; ustahiki wa mwisho huthibitishwa kwa masharti rasmi.', 'These are areas to explore; final eligibility is confirmed against official conditions.')
  };
}

// ---------------------------------------------------------------------------
// Tax guidance (educational summary shown in "Understand My Taxes")
// ---------------------------------------------------------------------------

export function getTaxGuidance(profile) {
  const f = flags(profile);
  const growth = ['twentyToHundred','hundredToTwoHundred','aboveTwoHundred','aboveTwenty'].includes(profile.sales);
  return {
    summary: copy(
      'Huu ni muhtasari wa elimu wa kodi zinazoweza kuwa muhimu kwa biashara yako. Tathmini ya mwisho hutegemea hali halisi na sheria zinazotumika.',
      'This is an educational summary of taxes that may matter to your business. A final assessment depends on actual circumstances and applicable law.'
    ),
    cards: [
      {
        icon: '◒',
        title: copy('Kodi ya mapato', 'Income tax'),
        body: copy('Inaweza kuhusiana na mapato yanayotozwa ya biashara. Kumbukumbu sahihi husaidia kuelewa hali yako.', 'It may relate to taxable business income. Accurate records help you understand your position.'),
        action: copy('Jifunze kutofautisha mauzo, gharama na faida.', 'Learn the difference between sales, expenses, and profit.')
      },
      {
        icon: '◇',
        title: copy('VAT', 'VAT'),
        body: growth
          ? copy('Fuatilia kiwango rasmi: zaidi ya TSh 200M ndani ya miezi 12 au TSh 100M ndani ya miezi 6. Watoa huduma za kitaalamu, shughuli za Serikali na wafanyabiashara wanaokusudia kuanza wana masharti ya ziada yanayoweza kutotegemea viwango hivyo.', 'Track the official thresholds: over TSh 200M in 12 months or TSh 100M in 6 months. Professional services, government economic activity and intending traders have additional conditions that may apply regardless of those thresholds.')
          : copy('Endelea kufuatilia mauzo ya miezi 6 na 12; VAT pia ina masharti maalumu kwa baadhi ya shughuli hata kabla ya kiwango cha kawaida.', 'Keep tracking 6- and 12-month sales; VAT also has special conditions for some activities before the general threshold.'),
        action: copy('Kagua masharti rasmi ya VAT kabla ya kuchukua hatua.', 'Check official VAT conditions before acting.')
      },
      {
        icon: '▤',
        title: copy('EFD na kumbukumbu', 'EFD and records'),
        body: f.efdLikelyRequired
          ? copy('Kiwango chako cha mauzo kinakaribia/kimezidi TSh 11M — huenda EFD/VFD inahitajika; baadhi ya shughuli au maeneo yana masharti bila kutegemea kiwango hiki.', 'Your sales level is near/above TSh 11M — an EFD/VFD may be required; some activities or prime areas may have requirements regardless of this threshold.')
          : copy('Kumbukumbu husaidia kujua wajibu unaoweza kukuhusu na kuwasilisha taarifa kwa usahihi.', 'Records help you understand possible obligations and submit information accurately.'),
        action: copy('Anza na daftari la mauzo na matumizi.', 'Start with a sales and expense book.')
      }
    ].concat(profile.business === 'WAKALA' ? [{ icon: '%', title: copy('Makato ya kamisheni ya wakala', 'Agent commission withholding'), body: copy('TRA inaonyesha kiwango cha 10% kwa kamisheni za wakala wa huduma za fedha kwa simu zinazostahili.', 'TRA lists 10% withholding on qualifying mobile-money agent commissions.'), action: copy('Linganisha taarifa ya kamisheni na makato yaliyofanywa.', 'Compare your commission statement with tax withheld.') }] : [])
      .concat(profile.employees === 'tenPlus' ? [{ icon: '👥', title: copy('PAYE na SDL', 'PAYE and SDL'), body: copy('Waajiri wanaweza kuwa na wajibu wa PAYE; TRA inaonyesha SDL ya 3.5% kwa mwajiri mwenye wafanyakazi 10 au zaidi, kulingana na masharti.', 'Employers may have PAYE duties; TRA shows SDL at 3.5% for an employer with 10 or more employees, subject to the rules.'), action: copy('Thibitisha mishahara, idadi ya wafanyakazi na tarehe za malipo.', 'Confirm payroll, employee count and payment dates.') }] : [])
  };
}

export function getNoticeGuidance(type) {
  return NOTICES[type] ?? NOTICES['Sina uhakika'];
}

// ---------------------------------------------------------------------------
// Assistant reply — routing fallback, memory-aware when a profile exists
// ---------------------------------------------------------------------------

// Classifies a free-text chat message into one of a small fixed set of
// topics, independent of which reply path answers it (FAQ, tax-figure
// parse, or the fallback router below). Used both for routing and — see
// engine/telemetry.js — for anonymized topic-only analytics (never the
// message text itself).
export function classifyChatTopic(text) {
  const q = (text ?? '').toLowerCase();
  if (q.includes('tin')) return 'tin';
  if (q.includes('notice') || q.includes('taarifa') || q.includes('barua')) return 'notice';
  if (q.includes('vat') || q.includes('kodi') || q.includes('tax')) return 'tax';
  if (q.includes('benefit') || q.includes('fursa') || q.includes('incentive') || q.includes('msamaha')) return 'benefits';
  return 'general';
}

export function getAssistantReply(question, profile = {}) {
  const q = question.toLowerCase();
  if (q.includes('tin')) return { answer: copy('TIN ni namba ya utambulisho wa mlipakodi. Kwa mwongozo binafsi, chagua \'Anzisha biashara\' au \'Nina biashara tayari\' ili tuanze na hali yako.', "A TIN is a taxpayer identification number. For tailored guidance, choose 'Start a Business' or 'I Have a Business' so we can begin with your situation."), route: 'category' };
  if (q.includes('notice') || q.includes('taarifa') || q.includes('barua')) return { answer: copy('Naweza kukusaidia kuielewa kwa lugha rahisi. Chagua aina ya taarifa uliyopokea au tumia nakala yake kupata ufafanuzi rasmi.', 'I can help explain it in simple language. Choose the type of notice you received or use a copy of it to get official clarification.'), route: 'notices-intro' };
  if (q.includes('vat') || q.includes('kodi') || q.includes('tax')) return { answer: copy('Kodi inayoweza kuhusika hutegemea aina, ukubwa, mauzo na hali ya usajili wa biashara. Hebu tupitie muhtasari wa elimu unaoendana na biashara yako.', "Taxes that may matter depend on the business type, size, sales, and registration status. Let's review an educational summary that fits your business."), route: 'taxes-intro' };
  if (q.includes('benefit') || q.includes('fursa') || q.includes('incentive') || q.includes('msamaha')) return { answer: copy('Vivutio na taratibu rahisi hutegemea masharti rasmi. Naweza kukuongoza kuchunguza fursa zinazoweza kuendana na biashara yako.', 'Incentives and simplified procedures depend on official conditions. I can guide you to explore opportunities that may fit your business.'), route: 'benefits-intro' };

  if (profile.business) {
    const [action] = getNextBestActions(profile);
    return {
      answer: copy(
        `Nakumbuka biashara yako. Hatua yako inayofuata ni: ${action.reason.sw}`,
        `I remember your business. Your next step is: ${action.reason.en}`
      ),
      route: 'advisor'
    };
  }
  return { answer: copy('Nimekupata. Ili nikuelekeze vizuri, niambie aina ya biashara yako au chagua mojawapo ya safari zilizo hapa chini.', 'I understand. To guide you well, tell me your business type or choose one of the journeys below.'), route: 'home' };
}

// ---------------------------------------------------------------------------
// Compliance Advisor — the unifying object behind the Advisor Dashboard
// ---------------------------------------------------------------------------

export function getComplianceAdvisor(profile) {
  return {
    complianceScore: computeComplianceScore(profile),
    risk: computeRisk(profile),
    actions: getNextBestActions(profile),
    journey: getJourney(profile),
    benefits: getBenefits(profile)
  };
}

// Backwards-shaped helpers kept for the two existing screen flows -----------

export function getRecommendation(profile = {}) {
  const advisor = getComplianceAdvisor(profile);
  return {
    readiness: advisor.complianceScore,
    nextStep: advisor.actions[0],
    opportunities: advisor.benefits.items.filter((i) => i.status !== 'not-yet').slice(0, 3).map((i) => i.title),
    journey: advisor.journey
  };
}

export function getBusinessCheckup(profile = {}) {
  const advisor = getComplianceAdvisor(profile);
  const completed = [];
  const improvements = [];
  const registrations = profile.registrations ?? [];

  if (registrations.includes('tin')) completed.push(copy('Umesema tayari una namba ya TIN', 'TIN recorded in your profile'));
  if (registrations.includes('businessRegistration')) completed.push(copy('Usajili wa biashara umewekwa', 'Business registration recorded'));
  if (registrations.includes('licence')) completed.push(copy('Leseni ya biashara umewekwa', 'Business licence recorded'));
  if (profile.records === 'yes') completed.push(copy('Unatunza kumbukumbu za biashara', 'You keep business records'));
  else improvements.push(copy('Anza kutunza kumbukumbu rahisi za mauzo na matumizi', 'Start keeping simple sales and expense records'));

  if (profile.filedReturn === 'yes') completed.push(copy('Umesema umewahi kuwasilisha ritani ya kodi', 'You indicated having filed a return before'));
  else improvements.push(copy('Angalia kama unatakiwa kuwasilisha ritani ya kodi', 'Learn whether a return applies to your situation'));

  return {
    readiness: advisor.complianceScore,
    risk: advisor.risk,
    completed: completed.length ? completed : [copy('Umeanza kuangalia hali ya biashara yako', 'Started the Business Checkup')],
    improvements,
    nextStep: advisor.actions[0]
  };
}
