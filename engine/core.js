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

// ---------------------------------------------------------------------------
// Free-text parsing (sector + Swahili/English sales figures)
// ---------------------------------------------------------------------------

export function parseSwahiliNumber(text) {
  if (!text) return null;
  const cleanText = text.toLowerCase().replace(/,/g, '');

  const mMatch = cleanText.match(/(\d+(?:\.\d+)?)\s*(?:m|mln|million|milioni)\b/);
  if (mMatch) return Math.round(parseFloat(mMatch[1]) * 1000000);

  const lakhMatch = cleanText.match(/(\d+(?:\.\d+)?)\s*(?:laki|lakh|lkh)\b/) || cleanText.match(/(?:laki|lakh|lkh)\s*(\d+(?:\.\d+)?)/);
  if (lakhMatch) return Math.round(parseFloat(lakhMatch[1] || lakhMatch[2]) * 100000);

  const kMatch = cleanText.match(/(\d+(?:\.\d+)?)\s*(?:k|elfu|efu|elph)\b/) || cleanText.match(/(?:elfu|efu|elph)\s*(\d+(?:\.\d+)?)/);
  if (kMatch) return Math.round(parseFloat(kMatch[1] || kMatch[2]) * 1000);

  let multiplier = 1;
  if (/\b(milioni|million|mln)\b/.test(cleanText)) multiplier = 1000000;
  else if (/\b(laki|lakh|lkh)\b/.test(cleanText)) multiplier = 100000;
  else if (/\b(elfu|efu|elph|k)\b/.test(cleanText)) multiplier = 1000;

  const numDigits = cleanText.match(/\b\d+\b/g);
  if (numDigits && numDigits.length > 0) {
    const val = parseInt(numDigits[0], 10);
    return multiplier > 1 ? val * multiplier : val;
  }

  let wordVal = 0;
  for (const word of cleanText.split(/\s+/)) {
    if (NUMBER_UNITS[word]) wordVal += NUMBER_UNITS[word];
  }
  return wordVal > 0 ? wordVal * multiplier : null;
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

export function calculateTRAPresumptiveTax(dailyTurnover) {
  const annualTurnover = dailyTurnover * 365;
  let annualTax = 0;
  let bracketInfo = '';
  let isExempt = false;
  let isOverLimit = false;

  if (annualTurnover < 4000000) {
    annualTax = 0;
    bracketInfo = 'Chini ya TSh 4 Million (Inasamehewa Kodi)';
    isExempt = true;
  } else if (annualTurnover <= 7000000) {
    annualTax = 100000;
    bracketInfo = 'TSh 4M - 7M (Kiwango Maalum: TSh 100,000 kwa mwaka)';
  } else if (annualTurnover <= 11000000) {
    annualTax = 250000;
    bracketInfo = 'TSh 7M - 11M (Kiwango Maalum: TSh 250,000 kwa mwaka)';
  } else if (annualTurnover <= 100000000) {
    annualTax = Math.round(annualTurnover * 0.035);
    bracketInfo = 'TSh 11M - 100M (3.5% ya mauzo yote ya mwaka)';
  } else {
    annualTax = null;
    bracketInfo = 'Zaidi ya TSh 100M: Biashara haiko kwenye kundi la Presumptive Tax.';
    isOverLimit = true;
  }

  const quarterlyTax = annualTax !== null ? Math.round(annualTax / 4) : null;
  const efdRequired = annualTurnover >= 14000000;

  return { dailyTurnover, annualTurnover, annualTax, quarterlyTax, bracketInfo, isExempt, isOverLimit, efdRequired };
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
  oneToFive: 3000000,
  fiveToTwenty: 12000000,
  aboveTwenty: 36000000
};

function estimatedAnnualTurnover(profile) {
  return SALES_ANNUAL_ESTIMATE[profile.sales] ?? null;
}

function flags(profile) {
  const registrations = profile.registrations ?? [];
  const sector = profile.business && profile.business !== 'OTHER' ? SECTORS[profile.business] : null;
  const annualEstimate = estimatedAnnualTurnover(profile);
  return {
    hasTin: registrations.includes('tin'),
    hasBusinessRegistration: registrations.includes('businessRegistration'),
    hasLicence: registrations.includes('licence'),
    sector,
    isNew: profile.stage === 'mpya',
    efdLikelyRequired: (sector?.efdSensitive ?? true) && annualEstimate !== null && annualEstimate >= 14000000,
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
  if (profile.detail) completeness += 6;
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

  if (!f.hasTin) {
    score += 30;
    factors.push({ weight: 30, label: copy('Hakuna TIN iliyosajiliwa', 'No TIN registered on file') });
  }
  if (!f.hasBusinessRegistration) {
    score += 20;
    factors.push({ weight: 20, label: copy('Usajili wa biashara haujakamilika', 'Business registration incomplete') });
  }
  if (!f.hasLicence) {
    score += 15;
    factors.push({ weight: 15, label: copy('Leseni ya biashara haijathibitishwa', 'Business licence not confirmed') });
  }
  if (profile.records !== 'yes') {
    score += 10;
    factors.push({ weight: 10, label: copy('Hakuna kumbukumbu za mauzo/matumizi', 'No sales/expense records kept') });
  }
  if (!f.isNew && profile.filedReturn !== 'yes') {
    score += 10;
    factors.push({ weight: 10, label: copy('Bado hujawasilisha return', "Haven't filed a return yet") });
  }
  if (f.efdLikelyRequired && !f.hasTin) {
    score += 10;
    factors.push({ weight: 10, label: copy('Mauzo yanaonyesha huenda EFD inahitajika', 'Sales level suggests an EFD machine may be required') });
  }

  if (f.efdLikelyRequired) {
    notes.push(copy(
      'Kwa kiwango hiki cha mauzo, mashine ya EFD huenda inahitajika kisheria (kuanzia TSh Milioni 14/mwaka).',
      'At this sales level, an EFD machine is likely legally required (threshold: TSh 14 Million/year).'
    ));
  }

  score = Math.min(100, score);
  const level = score <= 25 ? 'low' : score <= 55 ? 'medium' : 'high';
  return { score, level, factors, notes };
}

// ---------------------------------------------------------------------------
// Next-best-action — an ordered queue, not just a single recommendation
// ---------------------------------------------------------------------------

export function getNextBestActions(profile) {
  const f = flags(profile);
  const queue = [];

  if (!f.hasTin) {
    queue.push({
      key: 'tin',
      title: copy('Pata TIN', 'Get a TIN'),
      time: copy('Takriban dakika 15', 'Around 15 minutes'),
      reason: copy('TIN ni hatua muhimu ya kuanza shughuli rasmi na kupata huduma zinazohusiana na biashara.', 'A TIN is an important step towards operating formally and accessing business services.')
    });
  }
  if (!f.hasBusinessRegistration) {
    queue.push({
      key: 'businessRegistration',
      title: copy('Kamilisha usajili wa biashara', 'Complete business registration'),
      time: copy('Muda hutegemea aina ya biashara', 'Time varies by business type'),
      reason: copy('Usajili sahihi husaidia biashara yako kutambuliwa na kufuata hatua zinazohitajika.', 'Correct registration helps your business become recognised and follow required steps.')
    });
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
      title: copy('Jifunze kama kuna return inayokuhusu', 'Learn whether a return applies to you'),
      time: copy('Dakika 10', '10 minutes'),
      reason: copy('Kuwasilisha return kwa wakati husaidia kuepuka adhabu na kudumisha hali nzuri na TRA.', 'Filing on time helps you avoid penalties and stay in good standing with TRA.')
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
    { key: 'businessRegistration', title: copy('Kamilisha usajili wa biashara', 'Complete business registration'), description: copy('Kulingana na aina ya biashara yako.', 'Based on your business type.'), done: f.hasBusinessRegistration },
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
  const lowSales = profile.sales === 'belowOne' || profile.sales === 'oneToFive';
  const highSales = profile.sales === 'fiveToTwenty' || profile.sales === 'aboveTwenty';

  const items = [
    {
      title: copy('Msamaha/kiwango maalum cha kodi ya makadirio', 'Presumptive tax exemption / flat rate'),
      description: copy('Biashara ndogo zenye mauzo chini ya TSh 4M/mwaka hazitozwi kodi; zile hadi TSh 100M hulipa kiwango kilichowekwa.', 'Small businesses under TSh 4M/year owe no tax; those up to TSh 100M pay a set simplified rate.'),
      status: profile.sales ? 'eligible' : 'explore'
    },
    {
      title: copy('Mwongozo wa usajili uliobinafsishwa', 'Personalised registration guidance'),
      description: copy('Pata hatua zinazoendana na aina na hatua ya biashara yako.', 'Get steps that match your business type and stage.'),
      status: 'eligible'
    },
    {
      title: copy('Fursa za biashara mpya (hatua za awali)', 'New-business support (early stage)'),
      description: copy('Baadhi ya taratibu rahisi na misaada ya mwanzo huweza kuwahusu wafanyabiashara wapya.', 'Some simplified procedures and early support may apply to first-time entrepreneurs.'),
      status: f.isNew && lowSales ? 'eligible' : f.isNew ? 'check' : 'not-yet'
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
  const growth = profile.sales === 'fiveToTwenty' || profile.sales === 'aboveTwenty';
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
          ? copy('Mauzo yanapokua, ni muhimu kukagua masharti ya usajili wa VAT na wajibu unaoweza kutokea.', 'As sales grow, it is important to check VAT registration conditions and any resulting obligations.')
          : copy('Endelea kufuatilia mauzo yako; mahitaji yanaweza kubadilika kadri biashara inavyokua.', 'Keep tracking sales; requirements can change as the business grows.'),
        action: copy('Kagua masharti rasmi ya VAT kabla ya kuchukua hatua.', 'Check official VAT conditions before acting.')
      },
      {
        icon: '▤',
        title: copy('EFD na kumbukumbu', 'EFD and records'),
        body: f.efdLikelyRequired
          ? copy('Kiwango chako cha mauzo kinakaribia/kimezidi TSh 14M — huenda mashine ya EFD inahitajika.', 'Your sales level is near/above TSh 14M — an EFD machine may be required.')
          : copy('Kumbukumbu husaidia kujua wajibu unaoweza kukuhusu na kuwasilisha taarifa kwa usahihi.', 'Records help you understand possible obligations and submit information accurately.'),
        action: copy('Anza na daftari la mauzo na matumizi.', 'Start with a sales and expense book.')
      }
    ]
  };
}

export function getNoticeGuidance(type) {
  return NOTICES[type] ?? NOTICES['Sina uhakika'];
}

// ---------------------------------------------------------------------------
// Assistant reply — routing fallback, memory-aware when a profile exists
// ---------------------------------------------------------------------------

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

  if (registrations.includes('tin')) completed.push(copy('TIN umeiweka kwenye wasifu', 'TIN recorded in your profile'));
  if (registrations.includes('businessRegistration')) completed.push(copy('Usajili wa biashara umewekwa', 'Business registration recorded'));
  if (registrations.includes('licence')) completed.push(copy('Leseni ya biashara umewekwa', 'Business licence recorded'));
  if (profile.records === 'yes') completed.push(copy('Unatunza kumbukumbu za biashara', 'You keep business records'));
  else improvements.push(copy('Anza kutunza kumbukumbu rahisi za mauzo na matumizi', 'Start keeping simple sales and expense records'));

  if (profile.filedReturn === 'yes') completed.push(copy('Umesema umewahi kuwasilisha return', 'You indicated having filed a return before'));
  else improvements.push(copy('Jifunze kama kuna return inayohusu hali yako', 'Learn whether a return applies to your situation'));

  return {
    readiness: advisor.complianceScore,
    risk: advisor.risk,
    completed: completed.length ? completed : [copy('Umeanza kufanya Business Checkup', 'Started the Business Checkup')],
    improvements,
    nextStep: advisor.actions[0]
  };
}
