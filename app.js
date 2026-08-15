/**
 * Biashara Guide - Application Controller & Router
 *
 * Small hash router driving the guided journeys described in README.md:
 * Start a Business, I Have a Business, Compliance Advisor, Benefits &
 * Incentives, TRA Notices, Understand My Taxes, and Ask Anything.
 *
 * All guidance logic (scoring, risk, next-best-action, tax math) lives in
 * engine/core.js — a channel-agnostic module that also drives the text/USSD
 * demo in channels/text-adapter.js. This file only renders screens and
 * handles UI events. engine/memory.js persists just enough state so a
 * returning user is recognised.
 */

import {
  parseSwahiliNumber,
  extractSalesAmount,
  parseSector,
  calculateTRAPresumptiveTax,
  checkForFAQ,
  classifyChatTopic,
  getBenefits,
  getTaxGuidance,
  getNoticeGuidance,
  getAssistantReply,
  getComplianceAdvisor,
  getRecommendation,
  getBusinessCheckup
} from './engine/core.js';

import { SECTORS } from './engine/knowledge.js';
import { loadMemory, saveMemory, clearMemory, describeLastVisit } from './engine/memory.js';
import { sendGuidanceEvent, sendChatEvent } from './engine/telemetry.js';
import { brandMarkSvg } from './brand.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

function emptyProfile() {
  return {
    business: null,        // sector key, e.g. "CHAKULA"
    businessLabel: '',     // resolved bilingual-free sector name string
    detail: '',            // free text only when "Nyingine" is selected
    businessSubtype: null,
    businessSubtypeLabel: '',
    locationRegion: '',
    locationArea: '',
    locationOther: '',
    stage: null,           // "mpya" | "inaendelea" | "imara"
    sales: null,           // "belowOne" | "oneToFive" | "fiveToTwenty" | "aboveTwenty"
    legalForm: null,       // "individual" | "partnership" | "company"
    residentStatus: null,
    exclusiveBusinessIncome: null,
    firstBusinessTin: null,
    employees: null,       // "none" | "oneToNine" | "tenPlus"
    onlineSales: null,
    importsExports: null,
    registrations: [],     // subset of ["tin","businessRegistration","licence"]
    records: null,         // "yes" | "no"
    filedReturn: null,     // "yes" | "no"
    benefitStatus: null    // "notStarted" | "recent" | "established"
  };
}

const state = {
  lang: 'sw',
  profile: emptyProfile(),
  businesses: [],
  activeBusinessId: null,
  noticeType: null,
  noticeServedDate: '',
  taxEstimateDaily: null,
  returning: false,
  lastVisitAt: null,
  chat: { messages: [] }
};

let analysisTimer = null;

const BUSINESS_CATEGORIES = [
  { key: 'REJAREJA', emoji: '🛍️', label: { sw: 'Uuzaji wa bidhaa', en: 'Selling goods' } },
  { key: 'CHAKULA', emoji: '🍲', label: { sw: 'Chakula na vinywaji', en: 'Food & drinks' } },
  { key: 'UREMBO', emoji: '💇', label: { sw: 'Urembo na huduma binafsi', en: 'Beauty & personal care' } },
  { key: 'UFUNDI', emoji: '🔧', label: { sw: 'Ufundi na ujenzi', en: 'Trades & construction' } },
  { key: 'USAFIRI', emoji: '🛵', label: { sw: 'Usafiri na usafirishaji', en: 'Transport & delivery' } },
  { key: 'KILIMO', emoji: '🌱', label: { sw: 'Kilimo, mifugo na uvuvi', en: 'Farming, livestock & fishing' } },
  { key: 'UZALISHAJI', emoji: '🏭', label: { sw: 'Uzalishaji mdogo', en: 'Small-scale production' } },
  { key: 'WAKALA', emoji: '💳', label: { sw: 'Wakala wa fedha', en: 'Money agent' } },
  { key: 'HUDUMA', emoji: '🧰', label: { sw: 'Huduma nyingine', en: 'Other services' } }
];

const BUSINESS_SUBTYPES = {
  CHAKULA: [
    ['MAMA_LISHE', 'Mama lishe / kibanda cha chakula', 'Food stall'],
    ['MGAHAWA', 'Mgahawa / sehemu ya chakula', 'Restaurant / eatery'],
    ['CATERING', 'Huduma za chakula kwenye hafla', 'Catering'],
    ['BAKERY', 'Mikate, keki na vitafunwa', 'Bakery & snacks'],
    ['USINDIKAJI', 'Usindikaji wa vyakula', 'Food processing'],
    ['VINYWAJI', 'Vinywaji / juisi', 'Drinks / juice']
  ],
  USAFIRI: [
    ['BODABODA', 'Bodaboda', 'Motorcycle taxi'],
    ['BAJAJI', 'Bajaji', 'Three-wheeler taxi'],
    ['TAXI', 'Teksi / usafiri wa kukodi', 'Taxi / ride service'],
    ['ABIRIA', 'Daladala / basi la abiria', 'Passenger bus'],
    ['MIZIGO', 'Usafirishaji wa mizigo', 'Goods transport'],
    ['DELIVERY', 'Usafirishaji wa vifurushi / delivery', 'Courier / delivery']
  ],
  UREMBO: [
    ['SALON', 'Saluni ya nywele', 'Hair salon'],
    ['KINYOZI', 'Kinyozi', 'Barbershop'],
    ['KUSUKA', 'Kusuka / kutengeneza nywele', 'Braiding / hair styling'],
    ['KUCHAVYA', 'Kucha na mapambo', 'Nails & beauty'],
    ['MAKEUP', 'Vipodozi / make-up', 'Make-up services'],
    ['SPA', 'Spa / huduma za mwili', 'Spa / body care']
  ],
  UFUNDI: [
    ['SEREMALA', 'Useremala / samani', 'Carpentry / furniture'],
    ['CHUMA', 'Uchomeleaji / kazi za chuma', 'Welding / metal work'],
    ['MAGARI', 'Ufundi wa magari / pikipiki', 'Vehicle / motorcycle repair'],
    ['UJENZI', 'Ujenzi / uashi', 'Construction / masonry'],
    ['UMEME', 'Ufundi wa umeme', 'Electrical work'],
    ['MABOMBA', 'Ufundi wa mabomba', 'Plumbing']
  ],
  REJAREJA: [
    ['DUKA', 'Duka la vyakula na matumizi ya nyumbani', 'Groceries & household goods'],
    ['HARDWARE', 'Duka la vifaa vya ujenzi (hardware)', 'Hardware shop'],
    ['NGUO', 'Nguo, mitumba na viatu', 'Clothing, second-hand clothes & footwear'],
    ['SIMU', 'Simu na vifaa vyake', 'Phones & accessories'],
    ['VIPODOZI', 'Vipodozi na bidhaa za urembo', 'Cosmetics'],
    ['VIPURI', 'Vipuri vya magari / pikipiki', 'Vehicle / motorcycle spare parts'],
    ['STATIONERY', 'Stationery na vifaa vya ofisi', 'Stationery & office supplies'],
    ['SAMANI', 'Samani na vifaa vya nyumbani', 'Furniture & home goods'],
    ['SOKO', 'Kibanda / biashara ya sokoni', 'Market stall'],
    ['MTANDAONI', 'Uuzaji wa bidhaa mtandaoni', 'Online selling']
  ],
  KILIMO: [
    ['MAZAO', 'Mazao, mboga au matunda', 'Crops, vegetables or fruit'],
    ['KUKU', 'Kuku na mayai', 'Poultry & eggs'],
    ['MIFUGO', 'Mifugo na mazao ya mifugo', 'Livestock & livestock products'],
    ['UVUVI', 'Uvuvi / ufugaji wa samaki', 'Fishing / fish farming'],
    ['SAMAKI', 'Uuzaji au usindikaji wa samaki', 'Fish selling / processing']
  ],
  UZALISHAJI: [
    ['USHONAJI', 'Ushonaji / utengenezaji wa nguo', 'Tailoring / garment making'],
    ['SAMANI', 'Utengenezaji wa samani', 'Furniture making'],
    ['SABUNI', 'Utengenezaji wa sabuni na bidhaa za matumizi', 'Soap & household products'],
    ['CHAKULA', 'Usindikaji wa chakula / kusaga', 'Food processing / milling'],
    ['MIKONO', 'Bidhaa za mikono, ngozi au chuma', 'Handicrafts, leather or metal goods']
  ],
  WAKALA: [
    ['SIMU', 'Wakala wa mitandao ya simu', 'Mobile money agent'],
    ['SIMU_BENKI', 'Wakala wa mitandao ya simu na benki', 'Mobile money & bank agent']
  ],
  HUDUMA: [
    ['TEKNOLOJIA', 'Teknolojia, kompyuta au huduma za kidijitali', 'Technology, computer or digital services'],
    ['ELIMU', 'Mafunzo, tuition au huduma za elimu', 'Training, tuition or education services'],
    ['MATUKIO', 'Picha, video, mapambo au huduma za matukio', 'Photo, video, decor or event services'],
    ['MALAZI', 'Malazi, utalii au huduma kwa wageni', 'Accommodation, tourism or guest services'],
    ['USAJILI', 'Uhasibu, ushauri au huduma za kitaalamu', 'Bookkeeping, consulting or professional services'],
    ['USAFI', 'Usafi, kufua au huduma za nyumbani', 'Cleaning, laundry or household services']
  ]
};

const REGIONS = [
  'Arusha', 'Dar es Salaam', 'Dodoma', 'Geita', 'Iringa', 'Kagera', 'Katavi', 'Kigoma',
  'Kilimanjaro', 'Lindi', 'Manyara', 'Mara', 'Mbeya', 'Morogoro', 'Mtwara', 'Mwanza',
  'Njombe', 'Pwani', 'Rukwa', 'Ruvuma', 'Shinyanga', 'Simiyu', 'Singida', 'Songwe', 'Tabora', 'Tanga'
];

// Common district / municipal choices used only to make prototype location
// selection easier. Location stays on the citizen's device and is not sent
// to the Officer Console.
const LOCATION_AREAS = {
  'Arusha': ['Arusha Jiji', 'Arusha', 'Karatu', 'Longido', 'Meru', 'Monduli', 'Ngorongoro'],
  'Dar es Salaam': ['Ilala', 'Kinondoni', 'Temeke', 'Ubungo', 'Kigamboni'],
  'Dodoma': ['Dodoma Jiji', 'Bahi', 'Chamwino', 'Chemba', 'Kondoa', 'Kongwa', 'Mpwapwa'],
  'Geita': ['Geita', 'Bukombe', 'Chato', 'Mbogwe', "Nyang'hwale"],
  'Iringa': ['Iringa', 'Kilolo', 'Mufindi'],
  'Kagera': ['Bukoba', 'Biharamulo', 'Karagwe', 'Kyerwa', 'Missenyi', 'Muleba', 'Ngara'],
  'Katavi': ['Mpanda', 'Mlele', 'Nsimbo', 'Tanganyika'],
  'Kigoma': ['Kigoma', 'Buhigwe', 'Kakonko', 'Kasulu', 'Kibondo', 'Uvinza'],
  'Kilimanjaro': ['Moshi', 'Hai', 'Mwanga', 'Rombo', 'Same', 'Siha'],
  'Lindi': ['Lindi', 'Kilwa', 'Liwale', 'Nachingwea', 'Ruangwa'],
  'Manyara': ['Babati', "Hanang'", 'Kiteto', 'Mbulu', 'Simanjiro'],
  'Mara': ['Musoma', 'Bunda', 'Butiama', 'Rorya', 'Serengeti', 'Tarime'],
  'Mbeya': ['Mbeya', 'Busokelo', 'Chunya', 'Kyela', 'Mbarali', 'Rungwe'],
  'Morogoro': ['Morogoro', 'Gairo', 'Kilombero', 'Kilosa', 'Malinyi', 'Mvomero', 'Ulanga'],
  'Mtwara': ['Mtwara', 'Masasi', 'Nanyumbu', 'Newala', 'Tandahimba'],
  'Mwanza': ['Mwanza', 'Ilemela', 'Kwimba', 'Magu', 'Misungwi', 'Sengerema', 'Ukerewe'],
  'Njombe': ['Njombe', 'Ludewa', 'Makambako', 'Makete', "Wanging'ombe"],
  'Pwani': ['Kibaha', 'Bagamoyo', 'Chalinze', 'Kisarawe', 'Mafia', 'Mkuranga', 'Kibiti', 'Rufiji'],
  'Rukwa': ['Sumbawanga', 'Kalambo', 'Nkasi'],
  'Ruvuma': ['Songea', 'Mbinga', 'Madaba', 'Namtumbo', 'Nyasa', 'Tunduru'],
  'Shinyanga': ['Shinyanga', 'Kahama', 'Kishapu', 'Msalala', 'Ushetu'],
  'Simiyu': ['Bariadi', 'Busega', 'Itilima', 'Maswa', 'Meatu'],
  'Singida': ['Singida', 'Ikungi', 'Iramba', 'Manyoni', 'Mkalama'],
  'Songwe': ['Ileje', 'Mbozi', 'Momba', 'Songwe'],
  'Tabora': ['Tabora', 'Igunga', 'Kaliua', 'Nzega', 'Sikonge', 'Urambo', 'Uyui'],
  'Tanga': ['Tanga', 'Handeni', 'Kilindi', 'Korogwe', 'Lushoto', 'Mkinga', 'Muheza', 'Pangani']
};

const STAGE_OPTIONS = [
  { key: 'mpya', label: { sw: 'Chini ya mwaka 1', en: 'Under 1 year' }, note: { sw: 'Ninaanza / nimeanza karibuni', en: 'Starting / recently started' } },
  { key: 'inaendelea', label: { sw: 'Miaka 1 hadi 3', en: '1 to 3 years' }, note: { sw: 'Biashara inaendelea', en: 'Business is operating' } },
  { key: 'imara', label: { sw: 'Zaidi ya miaka 3', en: 'More than 3 years' }, note: { sw: 'Biashara ina muda', en: 'Established business' } }
];

const SALES_BUCKETS = [
  { key: 'belowOne', label: { sw: 'Chini ya TSh Milioni 1 kwa mwaka', en: 'Below TSh 1 Million per year' }, representativeDaily: 2000 },
  { key: 'oneToFour', label: { sw: 'TSh Milioni 1 - 4 kwa mwaka', en: 'TSh 1M - 4M per year' }, representativeDaily: 7000 },
  { key: 'fourToSeven', label: { sw: 'Zaidi ya TSh 4M hadi 7M', en: 'Over TSh 4M up to 7M' }, representativeDaily: 15000 },
  { key: 'sevenToEleven', label: { sw: 'Zaidi ya TSh 7M hadi 11M', en: 'Over TSh 7M up to 11M' }, representativeDaily: 25000 },
  { key: 'elevenToTwenty', label: { sw: 'Zaidi ya TSh 11M hadi 20M', en: 'Over TSh 11M up to 20M' }, representativeDaily: 42000 },
  { key: 'twentyToHundred', label: { sw: 'Zaidi ya TSh 20M hadi 100M', en: 'Over TSh 20M up to 100M' }, representativeDaily: 165000 },
  { key: 'hundredToTwoHundred', label: { sw: 'Zaidi ya TSh 100M hadi 200M', en: 'Over TSh 100M up to 200M' }, representativeDaily: 410000 },
  { key: 'aboveTwoHundred', label: { sw: 'Zaidi ya TSh 200M kwa mwaka', en: 'Above TSh 200M per year' }, representativeDaily: 660000 }
];

const LEGAL_FORMS = [
  { key: 'individual', label: { sw: 'Mtu binafsi / biashara ya mtu mmoja', en: 'Individual / sole trader' }, note: { sw: 'Jina la biashara BRELA linaweza kuwa hiari; TIN bado inahitajika', en: 'A BRELA business name may be optional; a TIN is still required' } },
  { key: 'partnership', label: { sw: 'Ubia', en: 'Partnership' }, note: { sw: 'Hati ya ubia na usajili wa BRELA hutumika kabla ya TIN ya ubia', en: 'A partnership deed and BRELA registration precede partnership TIN' } },
  { key: 'company', label: { sw: 'Kampuni', en: 'Company' }, note: { sw: 'Cheti cha usajili wa kampuni BRELA kinahitajika kabla ya TIN ya kampuni', en: 'BRELA incorporation is required before a company TIN' } }
];

const REGISTRATION_OPTIONS = [
  { key: 'tin', label: { sw: 'Namba ya TIN', en: 'TIN Number' }, note: { sw: 'Namba ya utambulisho wa mlipakodi', en: 'Taxpayer identification number' } },
  { key: 'businessRegistration', label: { sw: 'Usajili wa biashara', en: 'Business registration' }, note: { sw: 'BRELA au mamlaka husika', en: 'BRELA or relevant authority' } },
  { key: 'licence', label: { sw: 'Leseni ya biashara', en: 'Business licence' }, note: { sw: 'Ikiwa inahitajika kwa aina ya biashara yako', en: 'If required for your business type' } }
];

function normalizeRegistrations(registrations = []) {
  const normalized = [...new Set(registrations)];
  // A valid business licence presupposes a TIN. Preserve old saved licence
  // answers by adding the implied TIN instead of leaving an impossible state.
  if (normalized.includes('licence') && !normalized.includes('tin')) normalized.push('tin');
  return normalized;
}

function registrationOptionsHtml() {
  const hasTin = state.profile.registrations.includes('tin');
  return REGISTRATION_OPTIONS.map(o => {
    const selected = state.profile.registrations.includes(o.key);
    const licenceLocked = o.key === 'licence' && !hasTin;
    const prerequisite = licenceLocked
      ? (state.lang === 'sw' ? 'Chagua TIN kwanza — leseni ya biashara haiwezi kupatikana bila TIN.' : 'Select TIN first — a business licence cannot be obtained without a TIN.')
      : t(o.note);
    return `
      <button class="option ${selected ? 'selected' : ''} ${licenceLocked ? 'prerequisite-locked' : ''}" data-toggle-reg="${o.key}" aria-pressed="${selected}" ${licenceLocked ? 'aria-disabled="true"' : ''}>
        <span class="checkbox">${selected ? '✓' : licenceLocked ? '🔒' : ''}</span>
        <span class="option-copy">${t(o.label)}<small>${prerequisite}</small></span>
      </button>`;
  }).join('');
}

const BENEFIT_STATUS_OPTIONS = [
  { key: 'notStarted', label: { sw: 'Bado sijaanza', en: 'Not started yet' } },
  { key: 'recent', label: { sw: 'Nimeanza hivi karibuni', en: 'Started recently' } },
  { key: 'established', label: { sw: 'Nina muda na biashara', en: 'Been running a while' } }
];

const NOTICE_TYPES = [
  { key: 'Kikumbusho', label: { sw: 'Kikumbusho', en: 'Reminder' } },
  { key: 'Taarifa ya adhabu', label: { sw: 'Taarifa ya adhabu', en: 'Penalty notice' } },
  { key: 'Taarifa ya ukadiriaji', label: { sw: 'Taarifa ya ukadiriaji', en: 'Assessment notice' } },
  { key: 'Kikumbusho cha return', label: { sw: 'Kikumbusho cha ritani ya kodi', en: 'Return reminder' } },
  { key: 'Kikumbusho cha malipo', label: { sw: 'Kikumbusho cha malipo', en: 'Payment reminder' } },
  { key: 'Sina uhakika', label: { sw: 'Sina uhakika', en: "I'm not sure" } }
];

const RISK_LABEL = {
  low: { sw: 'Inaendelea vizuri', en: 'On track' },
  medium: { sw: 'Hatua kadhaa zimebaki', en: 'Some steps remain' },
  high: { sw: 'Anza na hatua kuu', en: 'Start with the essentials' }
};

const OFFICIAL_SERVICES = {
  businessRegistration: {
    name: 'BRELA Business Online Services', url: 'https://bos.brela.go.tz/', icon: 'BRELA',
    title: { sw: 'Endelea na usajili wa BRELA', en: 'Continue with BRELA registration' },
    description: { sw: 'Sajili jina la biashara, ubia au kampuni kwenye mfumo rasmi wa BRELA kulingana na muundo uliochagua.', en: 'Register a business name, partnership or company in BRELA’s official system for the legal form you selected.' },
    checklist: { sw: ['Namba ya NIDA au kitambulisho kinachokubalika', 'Simu na barua pepe', 'Anwani ya biashara na makazi', 'Kwa ubia/kampuni: nyaraka za muundo husika'], en: ['NIDA number or accepted identification', 'Phone and email', 'Business and residential addresses', 'For a partnership/company: the relevant formation documents'] },
    button: { sw: 'Fungua BRELA BOS', en: 'Open BRELA BOS' }
  },
  tin: {
    name: 'TRA Taxpayer Portal / IDRAS',
    url: 'https://taxpayerportal.tra.go.tz/',
    icon: 'TRA',
    title: {
      sw: 'Endelea na ombi la TIN kwenye TRA',
      en: 'Continue your TIN application with TRA'
    },
    description: {
      sw: 'Biashara Guide imekusaidia kutambua hatua hii. Usajili na utoaji wa TIN unakamilishwa kwenye mfumo rasmi wa TRA.',
      en: 'Biashara Guide has identified this step. Registration and TIN issuance are completed in TRA’s official system.'
    },
    checklist: {
      sw: ['Namba ya NIDA au kitambulisho rasmi', 'Barua ya utambulisho ya Serikali ya Mtaa/Kijiji', 'Mkataba wa pango au hati ya eneo la biashara', 'Maelezo ya shughuli na eneo la biashara'],
      en: ['NIDA number or official identification', 'Local Government Authority introduction letter', 'Lease agreement or title deed for the business location', 'Business activity and location details']
    },
    button: { sw: 'Fungua TRA Taxpayer Portal', en: 'Open TRA Taxpayer Portal' }
  },
  licence: {
    name: 'TAUSI Taxpayer Portal',
    url: 'https://tausi.tamisemi.go.tz/',
    icon: 'LGA',
    title: {
      sw: 'Endelea na leseni kwenye TAUSI',
      en: 'Continue your licence application in TAUSI'
    },
    description: {
      sw: 'Biashara Guide imeandaa mwongozo wako. Maombi, uhuishaji na malipo ya leseni ya biashara yanafanyika kwenye mfumo rasmi wa TAUSI.',
      en: 'Biashara Guide has prepared your guidance. Business licence applications, renewals and payments are completed in the official TAUSI system.'
    },
    checklist: {
      sw: ['NIN na TIN iliyosasishwa kwenye wasifu', 'Aina ya biashara na Halmashauri husika', 'Nyaraka au vibali vinavyohitajika kwa shughuli yako'],
      en: ['NIN and TIN updated in your profile', 'Business type and relevant council', 'Documents or permits required for your activity']
    },
    button: { sw: 'Fungua TAUSI Portal', en: 'Open TAUSI Portal' }
  }
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function t(copyObj) {
  if (!copyObj) return '';
  return copyObj[state.lang] ?? copyObj.sw ?? '';
}

function esc(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function mdToHtml(text) {
  return esc(text)
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.*?)`/g, '<code>$1</code>');
}

function fmtTsh(n) {
  if (n === null || n === undefined) return '0';
  return Math.round(n).toLocaleString();
}

function officialHandoff(actionKey) {
  const service = OFFICIAL_SERVICES[actionKey];
  if (!service) return '';
  const place = state.profile.locationArea === 'OTHER' ? state.profile.locationOther : state.profile.locationArea;
  const context = [state.profile.businessSubtypeLabel, place, state.profile.locationRegion].filter(Boolean).map(esc).join(' · ');

  return `
    <div class="card official-handoff">
      <div class="official-service-head">
        <span class="official-service-mark">${service.icon}</span>
        <div>
          <span class="snapshot-label">${state.lang === 'sw' ? 'HUDUMA RASMI INAYOFUATA' : 'NEXT OFFICIAL SERVICE'}</span>
          <h3>${t(service.title)}</h3>
        </div>
      </div>
      <p>${t(service.description)}</p>
      ${context ? `<div class="handoff-context"><strong>${state.lang === 'sw' ? 'Muhtasari wako' : 'Your handover summary'}</strong><span>${context}</span></div>` : ''}
      <div class="handoff-checklist">
        <strong>${state.lang === 'sw' ? 'Andaa kabla ya kuendelea:' : 'Prepare before continuing:'}</strong>
        <ul>${service.checklist[state.lang].map(item => `<li>${esc(item)}</li>`).join('')}</ul>
      </div>
      <a class="btn btn-official" href="${service.url}" target="_blank" rel="noopener noreferrer" aria-label="${esc(t(service.button))} — ${service.name}">
        ${t(service.button)} <span aria-hidden="true">↗</span>
      </a>
      <small class="handoff-note">${state.lang === 'sw'
        ? 'Utahamia kwenye mfumo rasmi wa Serikali. Biashara Guide haitumi taarifa zako moja kwa moja bila muunganiko na idhini rasmi.'
        : 'You will move to an official government system. Biashara Guide does not send your information automatically without an approved integration and consent.'}</small>
    </div>`;
}

function officialHandoffs() {
  const registrations = state.profile.registrations || [];
  const needed = [];
  if (!registrations.includes('businessRegistration') && ['partnership', 'company'].includes(state.profile.legalForm)) needed.push('businessRegistration');
  if (!registrations.includes('tin')) needed.push('tin');
  if (registrations.includes('tin') && !registrations.includes('licence')) needed.push('licence');
  if (!needed.length) return '';

  return `
    <section class="official-sequence" aria-label="${state.lang === 'sw' ? 'Mifumo rasmi inayofuata' : 'Next official systems'}">
      <div class="official-sequence-label">
        <strong>${state.lang === 'sw' ? 'Kutoka mwongozo hadi huduma rasmi' : 'From guidance to official service'}</strong>
        <span>${state.lang === 'sw' ? 'Kwa ubia/kampuni: BRELA kwanza, kisha TRA kwa TIN, halafu TAUSI kwa leseni.' : 'For partnerships/companies: BRELA first, then TRA for TIN, then TAUSI for the licence.'}</span>
      </div>
      ${needed.map(officialHandoff).join('')}
    </section>`;
}

function brandMark(sizeClass = '') {
  return `<div class="brand-mark ${sizeClass}">${brandMarkSvg()}</div>`;
}

function nav(path) {
  location.hash = '#/' + path;
}

function newBusinessRecord(profile = emptyProfile(), chat = { messages: [] }) {
  return {
    id: `biz-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    profile,
    chat
  };
}

function activeBusiness() {
  return state.businesses.find((b) => b.id === state.activeBusinessId) || null;
}

function businessName(record, index = 0) {
  const profile = record?.profile || emptyProfile();
  if (profile.detail?.trim()) return profile.detail.trim();
  if (profile.businessSubtypeLabel) return profile.businessSubtypeLabel;
  if (profile.businessLabel) return profile.businessLabel.split(' (')[0];
  return state.lang === 'sw' ? `Biashara ${index + 1}` : `Business ${index + 1}`;
}

function activateBusiness(id) {
  const record = state.businesses.find((b) => b.id === id);
  if (!record) return;
  state.activeBusinessId = record.id;
  state.profile = record.profile;
  state.chat = record.chat;
  state.taxEstimateDaily = null;
}

function addBusiness() {
  const record = newBusinessRecord();
  state.businesses.push(record);
  activateBusiness(record.id);
}

function profileHasAnswers(profile = state.profile) {
  return Boolean(
    profile.business ||
    profile.businessSubtype ||
    profile.detail ||
    profile.locationRegion ||
    profile.locationArea ||
    profile.stage ||
    profile.sales ||
    profile.registrations?.length ||
    profile.records ||
    profile.filedReturn ||
    profile.benefitStatus
  );
}

function startFreshBusinessJourney() {
  // A completed or partly completed business remains available in the
  // business switcher. The new journey receives its own completely blank
  // record so no answer can leak into the next citizen assessment.
  if (profileHasAnswers()) {
    addBusiness();
  } else {
    const blank = emptyProfile();
    const record = activeBusiness();
    if (record) {
      record.profile = blank;
      record.chat = { messages: [] };
      state.profile = record.profile;
      state.chat = record.chat;
    } else {
      addBusiness();
    }
  }
  state.noticeType = null;
  state.taxEstimateDaily = null;
  nav('category');
}

function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  return hash || 'splash';
}

function topbar(route) {
  const showBack = route !== 'splash' && route !== 'welcome' && route !== 'home';
  const record = activeBusiness();
  const idx = record ? state.businesses.indexOf(record) : -1;
  const context = record && record.profile.business
    ? `<button class="business-context" data-nav="businesses" aria-label="${state.lang === 'sw' ? 'Badili biashara' : 'Switch business'}">🏪 ${esc(businessName(record, idx))}</button>`
    : '';
  return `
    <div class="topbar">
      ${showBack ? `<button class="icon-btn" data-back="1" aria-label="${state.lang === 'sw' ? 'Rudi nyuma' : 'Back'}">←</button>` : brandMark('small')}
      ${context}
      <div class="topbar-actions">
        <button class="language-toggle" data-lang="${state.lang === 'sw' ? 'en' : 'sw'}" aria-label="${state.lang === 'sw' ? 'Change language to English' : 'Badili lugha kuwa Kiswahili'}">
          <span aria-hidden="true">🌐</span> ${state.lang === 'sw' ? 'English' : 'Kiswahili'}
        </button>
        <button class="help" data-nav="chat">${state.lang === 'sw' ? 'Msaada' : 'Help'}</button>
      </div>
    </div>`;
}

function langSwitch() {
  return `
    <div class="lang-switch" role="group" aria-label="Chagua lugha / Choose language">
      <button class="lang ${state.lang === 'sw' ? 'active' : ''}" data-lang="sw" lang="sw" aria-pressed="${state.lang === 'sw'}">Kiswahili</button>
      <button class="lang ${state.lang === 'en' ? 'active' : ''}" data-lang="en" lang="en" aria-pressed="${state.lang === 'en'}">English</button>
    </div>`;
}

function miniProgress(step, total) {
  let dots = '';
  for (let i = 1; i <= total; i++) dots += `<i class="${i <= step ? 'on' : ''}"></i>`;
  return `<div class="mini-progress">${dots}</div>`;
}

function legalNote() {
  return `<p class="legal-note">${state.lang === 'sw'
    ? 'Huu ni mwongozo wa awali tu; siyo uamuzi rasmi wa kisheria au kikodi. Thibitisha na TRA kabla ya kuchukua hatua.'
    : 'This is preliminary guidance only, not a binding legal or tax determination. Verify with TRA before acting.'}</p>`;
}

function screen(className, innerHtml) {
  return `<div class="screen ${className}">${innerHtml}</div>`;
}

function conceptBanner() {
  const label = state.lang === 'sw'
    ? '🧪 MFANO WA DHANA — Inaonyesha jinsi mwongozo huu unavyoweza kuishi ndani ya njia zilizopo za TRA'
    : '🧪 UNOFFICIAL CONCEPT PROTOTYPE — not affiliated with or endorsed by TRA';
  return `<div class="concept-banner">${label}</div>`;
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

function screenSplash() {
  return screen('splash', `
    ${brandMark()}
    <p class="eyebrow" style="margin-top:18px;">${state.lang === 'sw' ? 'HUDUMA ZA KIDIJITALI • DHANA' : 'DIGITAL SERVICES • CONCEPT'}</p>
    <h1 style="margin-top:8px;">Biashara Guide</h1>
    <div class="splash-language">
      <strong>Chagua lugha / Choose language</strong>
      ${langSwitch()}
    </div>
    <p class="lead">${state.lang === 'sw'
      ? 'Mwongozo mmoja unaoweza kufikiwa kupitia njia ambazo mwananchi tayari anatumia — bila kulazimika kusakinisha app nyingine.'
      : 'One guidance layer that can be reached through channels people already use — without requiring another app.'}</p>
    <div class="channel-strip" aria-label="${state.lang === 'sw' ? 'Njia zinazoweza kutumia mwongozo huu' : 'Channels that could use this guidance'}">
      <span>Web</span><span>USSD</span><span>WhatsApp</span><span>MyTRA*</span>
    </div>
    <p class="prototype-footnote">${state.lang === 'sw' ? '*Mfano wa namna ya kuunganishwa; si huduma rasmi ya TRA.' : '*Illustrative integration only; not an official TRA service.'}</p>
    <div class="actions" style="margin-top:32px; width:100%;">
      <button class="btn btn-primary" data-start-fresh="1">${state.lang === 'sw' ? 'Jua biashara yako inahitaji nini · Dakika 2' : 'See what your business may need · 2 min'}</button>
      <button class="btn btn-dark-ghost" data-nav="home">${state.lang === 'sw' ? 'Angalia huduma nyingine' : 'Explore other guidance'}</button>
    </div>
  `);
}

function screenWelcome() {
  return screen('', `
    ${topbar('welcome')}
    <div class="content">
      <p class="eyebrow">Biashara Guide</p>
      <h1 style="margin-top:8px;">${state.lang === 'sw' ? 'Karibu' : 'Welcome'}</h1>
      <div class="hero card">
        <h2>${state.lang === 'sw' ? 'Tunakusaidia kuelewa, siyo kukukagua' : 'We help you understand, not inspect you'}</h2>
        <p>${state.lang === 'sw'
          ? 'Pata mwongozo wa haki zako, fursa zinazoweza kukuhusu, na hatua rahisi za kufuata — kwa lugha rahisi.'
          : 'Get guidance on your rights, opportunities that may apply to you, and simple next steps — in plain language.'}</p>
      </div>
      ${langSwitch()}
    </div>
    <div class="actions">
      <button class="btn btn-primary" data-nav="home">${state.lang === 'sw' ? 'Endelea' : 'Continue'}</button>
    </div>
  `);
}

function screenHome() {
  const actions = [
    { icon: '🚀', route: 'category', fresh: true, title: { sw: 'Anzisha biashara mpya', en: 'Start a new business' }, desc: { sw: 'Anza na majibu matupu', en: 'Begin with blank answers' } },
    { icon: '🧭', route: 'advisor', title: { sw: 'Mwongozo wa masharti', en: 'Requirements guide' }, desc: { sw: 'Jua kinachoweza kukuhusu na hatua inayofuata', en: 'See what may apply and your next step' } },
    { icon: '🏪', route: 'checkup-stage', title: { sw: 'Kagua biashara yako', en: 'Check your business' }, desc: { sw: 'Angalia ulichokamilisha na kinachofuata', en: 'See what is in place and what comes next' } },
    { icon: '🎁', route: 'benefits-intro', title: { sw: 'Fursa na Vivutio', en: 'Benefits & Incentives' }, desc: { sw: 'Chunguza fursa zako', en: 'Explore what may apply' } },
    { icon: '✉️', route: 'notices-intro', title: { sw: 'Taarifa za TRA', en: 'TRA Notices' }, desc: { sw: 'Elewa taarifa ulizopokea', en: 'Understand a notice you received' } },
    { icon: '📊', route: 'taxes-intro', title: { sw: 'Fahamu kodi zinazoweza kukuhusu', en: 'Understand My Taxes' }, desc: { sw: 'Maelezo ya kodi kwa lugha rahisi', en: 'An educational tax summary' } },
    { icon: '💬', route: 'chat', title: { sw: 'Uliza Chochote', en: 'Ask Anything' }, desc: { sw: 'Zungumza na msaidizi', en: 'Talk to the assistant' } }
  ];

  const showResume = state.returning && state.profile.business;
  const resumeBanner = showResume ? `
    <div class="card resume-card" data-nav="advisor">
      <span class="snapshot-label">${state.lang === 'sw' ? 'Karibu tena' : 'Welcome back'}</span>
      <strong>${esc((state.profile.businessLabel || '').split(' (')[0])}</strong>
      <p>${state.lang === 'sw'
        ? `Ulitembelea: ${describeLastVisit(state.lastVisitAt, state.lang)}. Gusa kuona hatua yako inayofuata.`
        : `Last visit: ${describeLastVisit(state.lastVisitAt, state.lang)}. Tap to see your next step.`}</p>
    </div>` : '';

  return screen('', `
    ${topbar('home')}
    <div class="content">
      <div class="home-header">
        ${brandMark('small')}
        <div><span class="service-kicker">${state.lang === 'sw' ? 'Mwongozo ndani ya njia zilizopo' : 'Guidance inside existing channels'}</span><h2>${state.lang === 'sw' ? 'Unahitaji msaada gani?' : 'What do you need help with?'}</h2></div>
      </div>
      <div class="business-switcher-card">
        <div>
          <span class="snapshot-label">${state.lang === 'sw' ? 'BIASHARA INAYOTUMIKA' : 'CURRENT BUSINESS'}</span>
          <strong>${esc(businessName(activeBusiness(), Math.max(0, state.businesses.findIndex(b => b.id === state.activeBusinessId))))}</strong>
          <small>${state.lang === 'sw' ? 'Kila biashara huhifadhi majibu na mwongozo wake tofauti.' : 'Each business keeps separate answers and guidance.'}</small>
        </div>
        <button class="mini-action" data-nav="businesses">${state.lang === 'sw' ? 'Badili / Ongeza' : 'Switch / Add'}</button>
      </div>
      ${resumeBanner}
      <button class="primary-journey" data-start-fresh="1">
        <span class="primary-journey-icon">🧭</span>
        <span><b>${state.lang === 'sw' ? 'Jua biashara yako inahitaji nini' : 'See what your business may need'}</b><small>${state.lang === 'sw' ? 'Jibu maswali 7 mafupi · takriban dakika 3' : 'Answer 7 short questions · about 3 minutes'}</small></span>
        <span class="primary-journey-arrow">→</span>
      </button>
      <p class="home-secondary-label">${state.lang === 'sw' ? 'Au chagua mwongozo mwingine' : 'Or choose another guide'}</p>
      <div class="home-grid">
        ${actions.map(a => `
          <button class="action-card" ${a.fresh ? 'data-start-fresh="1"' : `data-nav="${a.route}"`}>
            <div class="action-icon">${a.icon}</div>
            <div>
              <strong>${t(a.title)}</strong>
              <span>${t(a.desc)}</span>
            </div>
          </button>
        `).join('')}
      </div>
      <div class="support-promise">
        <span>🤝</span>
        <div>
          <strong>${state.lang === 'sw' ? 'Ahadi yetu' : 'Our promise'}</strong>
          <p>${state.lang === 'sw'
            ? 'Tunakusaidia kuelewa, siyo kukukagua. Tunatoa mwongozo tu — hatuchukui hatua kwa niaba yako.'
            : "We only provide guidance — we don't take action on your behalf or inspect your business."}</p>
        </div>
      </div>
      <div class="privacy-inline">🔒 ${state.lang === 'sw' ? 'Wasifu huhifadhiwa kwenye kifaa hiki kwa siku 30. Mazungumzo ya chat hayahifadhiwi baada ya kufunga ukurasa. Unaweza kufuta biashara moja au taarifa zote wakati wowote.' : 'Profiles stay on this device for 30 days. Chat messages are not retained after you close the page. You may delete one business or all saved data at any time.'}</div>
      <button class="link-btn" data-forget="1">${state.lang === 'sw' ? 'Futa taarifa zangu zilizohifadhiwa' : 'Forget my saved data'}</button>
    </div>
  `);
}

function screenBusinesses() {
  return screen('', `
    ${topbar('businesses')}
    <div class="content">
      <p class="eyebrow">${state.lang === 'sw' ? 'BILA AKAUNTI MPYA' : 'NO NEW ACCOUNT'}</p>
      <h2>${state.lang === 'sw' ? 'Biashara zako' : 'Your businesses'}</h2>
      <p class="lead">${state.lang === 'sw'
        ? 'Chagua biashara unayotaka kuifanyia mwongozo. Majibu ya biashara moja hayachanganywi na nyingine kwenye kifaa hiki.'
        : 'Choose the business you want guidance for. Answers for one business stay separate from the others on this device.'}</p>
      <div class="business-list">
        ${state.businesses.map((record, index) => {
          const selected = record.id === state.activeBusinessId;
          const profile = record.profile;
          const status = profile.business
            ? (state.lang === 'sw' ? 'Mwongozo umeanza' : 'Guidance started')
            : (state.lang === 'sw' ? 'Bado haijajazwa' : 'Not filled in yet');
          return `<div class="business-row-wrap"><button class="business-row ${selected ? 'selected' : ''}" data-switch-business="${esc(record.id)}">
            <span class="business-avatar">${profile.business ? '🏪' : '＋'}</span>
            <span><strong>${esc(businessName(record, index))}</strong><small>${status}${selected ? (state.lang === 'sw' ? ' · Inatumika sasa' : ' · Current') : ''}</small></span>
            <span class="business-row-arrow">→</span>
          </button><button class="delete-business" data-delete-business="${esc(record.id)}" aria-label="${state.lang === 'sw' ? 'Futa biashara hii' : 'Delete this business'}">×</button></div>`;
        }).join('')}
      </div>
      <div class="privacy-inline">🔒 ${state.lang === 'sw'
        ? 'Huhitaji akaunti. Wasifu huhifadhiwa kwenye kifaa hiki kwa siku 30; ujumbe wa chat hauhifadhiwi.'
        : 'No account is required. Profiles stay on this device for 30 days; chat messages are not retained.'}</div>
    </div>
    <div class="actions">
      <button class="btn btn-primary" data-add-business="1">${state.lang === 'sw' ? '+ Ongeza biashara nyingine' : '+ Add another business'}</button>
      <button class="btn btn-secondary" data-nav="home">${state.lang === 'sw' ? 'Rudi Nyumbani' : 'Back Home'}</button>
    </div>
  `);
}

// --- Start a Business ------------------------------------------------------

function screenCategory() {
  return screen('', `
    ${topbar('category')}
    <div class="content">
      <p class="eyebrow">${state.lang === 'sw' ? 'Hatua ya 1 kati ya 7' : 'Step 1 of 7'}</p>
      ${miniProgress(1, 7)}
      <h2>${state.lang === 'sw' ? 'Biashara yako ni ya aina gani?' : 'What kind of business is it?'}</h2>
      <p class="question-note">${state.lang === 'sw' ? 'Chagua kundi linalokaribiana zaidi na biashara yako.' : 'Choose the category closest to your business.'}</p>
      <div class="business-grid">
        ${BUSINESS_CATEGORIES.map(c => `
          <button class="business-card ${state.profile.business === c.key ? 'selected' : ''}" data-select-category="${c.key}">
            <span class="emoji">${c.emoji}</span>
            ${t(c.label)}
          </button>
        `).join('')}
        <button class="business-card ${state.profile.business === 'OTHER' ? 'selected' : ''}" data-select-category="OTHER">
          <span class="emoji">🧾</span>
          ${state.lang === 'sw' ? 'Nyingine' : 'Other'}
        </button>
      </div>
    </div>
    <div class="actions">
      <button class="btn btn-primary" data-nav="details" ${state.profile.business ? '' : 'disabled'}>${state.lang === 'sw' ? 'Endelea' : 'Continue'}</button>
    </div>
  `);
}

function screenDetails() {
  const subtypeOptions = BUSINESS_SUBTYPES[state.profile.business] || [];
  const needsOtherText = state.profile.business === 'OTHER' || state.profile.businessSubtype === 'OTHER';
  const areas = LOCATION_AREAS[state.profile.locationRegion] || [];
  const ready = Boolean(
    (state.profile.business === 'OTHER' ? state.profile.detail?.trim() : state.profile.businessSubtype) &&
    (!needsOtherText || state.profile.detail?.trim()) &&
    state.profile.locationRegion && state.profile.locationArea &&
    (state.profile.locationArea !== 'OTHER' || state.profile.locationOther?.trim())
  );
  return screen('', `
    ${topbar('details')}
    <div class="content">
      <p class="eyebrow">${state.lang === 'sw' ? 'Hatua ya 2 kati ya 7' : 'Step 2 of 7'}</p>
      ${miniProgress(2, 7)}
      <h2>${state.lang === 'sw' ? 'Biashara yako hasa ni ipi?' : 'What exactly does your business do?'}</h2>
      <p class="question-note">${state.lang === 'sw'
        ? 'Chagua jibu linalokaribiana zaidi. Utaandika tu ukichagua “Nyingine”.'
        : 'Choose the closest answer. You only need to type if you select “Other”.'}</p>

      ${state.profile.business !== 'OTHER' ? `
        <div class="guided-section">
          <h3>${state.lang === 'sw' ? 'Chagua aina ya biashara' : 'Choose the business type'}</h3>
          <div class="stack compact-stack">
            ${subtypeOptions.map(([key, sw, en]) => `
              <button class="option ${state.profile.businessSubtype === key ? 'selected' : ''}" data-select-subtype="${key}" data-subtype-sw="${esc(sw)}" data-subtype-en="${esc(en)}">
                <span class="radio"></span><span class="option-copy">${state.lang === 'sw' ? sw : en}</span>
              </button>`).join('')}
            <button class="option ${state.profile.businessSubtype === 'OTHER' ? 'selected' : ''}" data-select-subtype="OTHER">
              <span class="radio"></span><span class="option-copy">${state.lang === 'sw' ? 'Nyingine' : 'Other'}</span>
            </button>
          </div>
        </div>` : ''}

      ${needsOtherText ? `
        <div class="guided-section other-detail">
          <label for="detailInput">${state.lang === 'sw' ? 'Andika aina ya biashara yako' : 'Describe your type of business'}</label>
          <input type="text" id="detailInput" class="guided-input" placeholder="${state.lang === 'sw' ? 'Mfano: Uuzaji wa vifaa vya kilimo' : 'e.g. Farm supplies shop'}" value="${esc(state.profile.detail)}" />
        </div>` : ''}

      <div class="guided-section location-section">
        <h3>${state.lang === 'sw' ? 'Biashara yako ipo wapi?' : 'Where is the business located?'}</h3>
        <p class="field-help">${state.lang === 'sw' ? 'Eneo hutusaidia kukupa mwongozo unaolingana na biashara yako.' : 'Location helps us make the guidance more relevant to your business.'}</p>
        <label for="regionSelect">${state.lang === 'sw' ? 'Mkoa' : 'Region'}</label>
        <select id="regionSelect" class="guided-select">
          <option value="">${state.lang === 'sw' ? 'Chagua mkoa' : 'Select region'}</option>
          ${REGIONS.map(region => `<option value="${esc(region)}" ${state.profile.locationRegion === region ? 'selected' : ''}>${region}</option>`).join('')}
        </select>
        <label for="areaSelect">${state.lang === 'sw' ? 'Wilaya / manispaa' : 'District / municipality'}</label>
        <select id="areaSelect" class="guided-select" ${state.profile.locationRegion ? '' : 'disabled'}>
          <option value="">${state.lang === 'sw' ? 'Chagua eneo' : 'Select area'}</option>
          ${areas.map(area => `<option value="${esc(area)}" ${state.profile.locationArea === area ? 'selected' : ''}>${area}</option>`).join('')}
          <option value="OTHER" ${state.profile.locationArea === 'OTHER' ? 'selected' : ''}>${state.lang === 'sw' ? 'Eneo jingine' : 'Other area'}</option>
        </select>
        ${state.profile.locationArea === 'OTHER' ? `
          <label for="locationOtherInput">${state.lang === 'sw' ? 'Andika wilaya, manispaa au eneo lako' : 'Enter your district, municipality or area'}</label>
          <input type="text" id="locationOtherInput" class="guided-input" placeholder="${state.lang === 'sw' ? 'Mfano: Mji au wilaya' : 'e.g. Town or district'}" value="${esc(state.profile.locationOther)}" />
        ` : ''}
      </div>
    </div>
    <div class="actions">
      <button class="btn btn-primary" data-nav="stage" data-save-detail="1" ${ready ? '' : 'disabled'}>${state.lang === 'sw' ? 'Endelea' : 'Continue'}</button>
    </div>
  `);
}

function screenStage() {
  return screen('', `
    ${topbar('stage')}
    <div class="content">
      <p class="eyebrow">${state.lang === 'sw' ? 'Hatua ya 3 kati ya 7' : 'Step 3 of 7'}</p>
      ${miniProgress(3, 7)}
      <h2>${state.lang === 'sw' ? 'Biashara hii imekuwa ikifanya kazi kwa muda gani?' : 'How long has this business been operating?'}</h2>
      <div class="stack">
        ${STAGE_OPTIONS.map(o => `
          <button class="option ${state.profile.stage === o.key ? 'selected' : ''}" data-select-stage="${o.key}">
            <span class="radio"></span>
            <span class="option-copy">${t(o.label)}<small>${t(o.note)}</small></span>
          </button>
        `).join('')}
      </div>
    </div>
    <div class="actions">
      <button class="btn btn-primary" data-nav="sales" ${state.profile.stage ? '' : 'disabled'}>${state.lang === 'sw' ? 'Endelea' : 'Continue'}</button>
    </div>
  `);
}

function screenSales(nextRoute) {
  return screen('', `
    ${topbar('sales')}
    <div class="content">
      <p class="eyebrow">${state.lang === 'sw' ? 'Hatua ya 4 kati ya 7' : 'Step 4 of 7'}</p>
      ${miniProgress(4, 7)}
      <h2>${state.lang === 'sw' ? 'Kwa makadirio, mauzo ya biashara yako kwa mwaka ni kiasi gani?' : 'What are your approximate annual sales?'}</h2>
      <p class="question-note">${state.lang === 'sw' ? 'Si lazima iwe hesabu kamili—chagua kiwango kinachokaribiana zaidi.' : 'It does not need to be exact—choose the closest range.'}</p>
      <div class="stack">
        ${SALES_BUCKETS.map(o => `
          <button class="option ${state.profile.sales === o.key ? 'selected' : ''}" data-select-sales="${o.key}">
            <span class="radio"></span>
            <span class="option-copy">${t(o.label)}</span>
          </button>
        `).join('')}
      </div>
    </div>
    <div class="actions">
      <button class="btn btn-primary" data-nav="${nextRoute}" ${state.profile.sales ? '' : 'disabled'}>${state.lang === 'sw' ? 'Endelea' : 'Continue'}</button>
    </div>
  `);
}

function screenLegalForm() {
  return screen('', `
    ${topbar('legal-form')}
    <div class="content">
      <p class="eyebrow">${state.lang === 'sw' ? 'Hatua ya 5 kati ya 7' : 'Step 5 of 7'}</p>
      ${miniProgress(5, 7)}
      <h2>${state.lang === 'sw' ? 'Biashara ina muundo gani kisheria?' : 'What is the business legal form?'}</h2>
      <p class="question-note">${state.lang === 'sw' ? 'Hili hubadilisha mpangilio wa BRELA na TRA.' : 'This changes the correct BRELA and TRA sequence.'}</p>
      <div class="stack">${LEGAL_FORMS.map(o => `
        <button class="option ${state.profile.legalForm === o.key ? 'selected' : ''}" data-select-legal-form="${o.key}" aria-pressed="${state.profile.legalForm === o.key}">
          <span class="radio"></span><span class="option-copy">${t(o.label)}<small>${t(o.note)}</small></span>
        </button>`).join('')}</div>
    </div>
    <div class="actions"><button class="btn btn-primary" data-nav="registration" ${state.profile.legalForm ? '' : 'disabled'}>${state.lang === 'sw' ? 'Endelea' : 'Continue'}</button></div>
  `);
}

function screenComplianceChecks() {
  const individual = state.profile.legalForm === 'individual';
  const ready = state.profile.records && state.profile.employees && (!individual || (state.profile.residentStatus && state.profile.exclusiveBusinessIncome && state.profile.firstBusinessTin));
  const choice = (key, value, label) => `<button class="mini-choice ${state.profile[key] === value ? 'selected' : ''}" data-profile-choice="${key}:${value}" aria-pressed="${state.profile[key] === value}">${label}</button>`;
  return screen('', `
    ${topbar('compliance-checks')}
    <div class="content">
      <p class="eyebrow">${state.lang === 'sw' ? 'Hatua ya 7 kati ya 7' : 'Step 7 of 7'}</p>
      ${miniProgress(7, 7)}
      <h2>${state.lang === 'sw' ? 'Ukaguzi mfupi wa masharti' : 'Quick eligibility checks'}</h2>
      ${individual ? `<div class="card check-card"><strong>${state.lang === 'sw' ? 'Je, wewe ni mkazi wa Tanzania kwa mwaka huu wa mapato?' : 'Are you a resident for this year of income?'}</strong><div class="choice-row">${choice('residentStatus','yes',state.lang === 'sw'?'Ndiyo':'Yes')}${choice('residentStatus','no',state.lang === 'sw'?'Hapana':'No')}</div></div>
      <div class="card check-card"><strong>${state.lang === 'sw' ? 'Mapato yako ya mwaka ni ya biashara ya Tanzania pekee?' : 'Is your annual income exclusively from a Tanzania-source business?'}</strong><div class="choice-row">${choice('exclusiveBusinessIncome','yes',state.lang === 'sw'?'Ndiyo':'Yes')}${choice('exclusiveBusinessIncome','no',state.lang === 'sw'?'Hapana':'No')}</div></div>
      <div class="card check-card"><strong>${state.lang === 'sw' ? 'Hii ni mara yako ya kwanza kupata TIN kwa kuanza biashara?' : 'Is this your first business TIN application?'}</strong><div class="choice-row">${choice('firstBusinessTin','yes',state.lang === 'sw'?'Ndiyo':'Yes')}${choice('firstBusinessTin','no',state.lang === 'sw'?'Hapana':'No')}${choice('firstBusinessTin','unsure',state.lang === 'sw'?'Sina uhakika':'Not sure')}</div></div>` : ''}
      <div class="card check-card"><strong>${state.lang === 'sw' ? 'Unatunza kumbukumbu kamili za mauzo na matumizi?' : 'Do you keep complete sales and expense records?'}</strong><div class="choice-row">${choice('records','yes',state.lang === 'sw'?'Ndiyo':'Yes')}${choice('records','no',state.lang === 'sw'?'Hapana':'No')}</div></div>
      <div class="card check-card"><strong>${state.lang === 'sw' ? 'Una wafanyakazi wangapi?' : 'How many employees do you have?'}</strong><div class="choice-row">${choice('employees','none',state.lang === 'sw'?'Hakuna':'None')}${choice('employees','oneToNine','1–9')}${choice('employees','tenPlus','10+')}</div></div>
      <div class="card check-card"><strong>${state.lang === 'sw' ? 'Njia nyingine za biashara' : 'Other business channels'}</strong><div class="choice-row">${choice('onlineSales','yes',state.lang === 'sw'?'Nauza mtandaoni':'Online sales')}${choice('importsExports','yes',state.lang === 'sw'?'Ninaagiza/nasafirisha nje':'Import/export')}${choice('onlineSales','no',state.lang === 'sw'?'Hakuna kati ya hizo':'None')}</div></div>
    </div>
    <div class="actions"><button class="btn btn-primary" data-nav="analysis" ${ready ? '' : 'disabled'}>${state.lang === 'sw' ? 'Tengeneza mwongozo wangu' : 'Build my guide'}</button></div>
  `);
}

function screenRegistration(nextRoute) {
  return screen('', `
    ${topbar('registration')}
    <div class="content">
      <p class="eyebrow">${state.lang === 'sw' ? 'Hatua ya 6 kati ya 7' : 'Step 6 of 7'}</p>
      ${miniProgress(6, 7)}
      <h2>${state.lang === 'sw' ? 'Ni mambo gani kati ya haya ambayo tayari umekamilisha?' : 'Which of these have you already completed?'}</h2>
      <p class="question-note">${state.lang === 'sw' ? 'Chagua yote ambayo tayari unayo. Kama huna hata moja, endelea bila kuchagua.' : 'Select everything you already have. If none apply, continue without selecting.'}</p>
      <div class="stack">
        ${registrationOptionsHtml()}
      </div>
    </div>
    <div class="actions">
      <button class="btn btn-primary" data-nav="${nextRoute}">${state.lang === 'sw' ? 'Endelea' : 'Continue'}</button>
    </div>
  `);
}

function screenAnalysis(nextRoute) {
  if (analysisTimer) clearTimeout(analysisTimer);
  analysisTimer = setTimeout(() => { analysisTimer = null; nav(nextRoute); }, 1400);

  const items = state.lang === 'sw'
    ? ['Inachanganua maelezo ya biashara yako', 'Inatambua hatari na hatua inayofuata', 'Inakamilisha muhtasari wako']
    : ['Reviewing your business details', 'Identifying risk and next step', 'Preparing your summary'];

  return screen('analysis', `
    ${brandMark('small')}
    <h2 style="margin-top:20px;">${state.lang === 'sw' ? 'Tunachanganua...' : 'Analysing...'}</h2>
    <div class="analysis-box" style="width:100%;">
      ${items.map((label, i) => `
        <div class="analysis-item">
          <span class="check">${i === items.length - 1 ? '…' : '✓'}</span>
          ${label}
        </div>
      `).join('')}
    </div>
  `);
}

function screenSnapshot() {
  const rec = getRecommendation(state.profile);
  const advisor = getComplianceAdvisor(state.profile);
  const record = activeBusiness();
  const recordIndex = Math.max(0, state.businesses.findIndex(b => b.id === state.activeBusinessId));
  return screen('', `
    ${topbar('snapshot')}
    <div class="content">
      <p class="eyebrow">${state.lang === 'sw' ? 'KWA TAARIFA ULIZOTUPA' : 'BASED ON WHAT YOU TOLD US'}</p>
      <h2>${state.lang === 'sw' ? `Mwongozo wa ${esc(businessName(record, recordIndex))}` : `Guidance for ${esc(businessName(record, recordIndex))}`}</h2>
      <p class="lead">${state.lang === 'sw' ? 'Haya ni mapendekezo ya biashara hii pekee; biashara nyingine inaweza kupata hatua tofauti.' : 'These recommendations are for this business only; another business may receive different next steps.'}</p>
      ${state.profile.locationArea ? `<p class="profile-context">📍 ${esc(state.profile.locationArea === 'OTHER' ? state.profile.locationOther : state.profile.locationArea)}, ${esc(state.profile.locationRegion)}${state.profile.businessSubtypeLabel ? ` · ${esc(state.profile.businessSubtypeLabel)}` : ''}</p>` : ''}
      <div class="card readiness-card" style="margin-top:20px;">
        <div>
          <span class="snapshot-label">${state.lang === 'sw' ? 'Muhtasari wa maandalizi' : 'Preparation snapshot'}</span>
          <div class="readiness-number">${rec.readiness}%</div>
        </div>
        <span class="chip">✓ ${esc((state.profile.businessLabel || '').split(' (')[0])}</span>
        <div class="readiness-track" style="margin-top:6px;"><i style="width:${rec.readiness}%;"></i></div>
      </div>
      <div class="card next-step" style="margin-top:14px;">
        <span class="snapshot-label">${state.lang === 'sw' ? 'HATUA MOJA INAYOFUATA' : 'ONE NEXT STEP'}</span>
        <div class="snapshot-value">${t(rec.nextStep.title)}</div>
        <p class="step-time">${t(rec.nextStep.time)}</p>
        <div class="divider"></div>
        <p style="color:#354453; font-size:14px; line-height:1.5;">${t(rec.nextStep.reason)}</p>
      </div>
      ${officialHandoffs()}
      <div class="card guidance-summary" style="margin-top:14px;">
        <span class="snapshot-label">${state.lang === 'sw' ? 'KINACHOWEZA KUHITAJI KUANGALIWA' : 'WHAT MAY NEED ATTENTION'}</span>
        ${advisor.actions.slice(0, 3).map((a, i) => `<div class="guidance-line ${i === 0 ? 'priority' : ''}">
          <span>${i === 0 ? '→' : '!'}</span>
          <div><strong>${t(a.title)}</strong><small>${t(a.reason)}</small></div>
        </div>`).join('') || `<div class="guidance-line good"><span>✓</span><div><strong>${state.lang === 'sw' ? 'Hakuna hatua kubwa iliyobainika sasa' : 'No major action identified right now'}</strong></div></div>`}
      </div>
      <div class="card" style="margin-top:14px;">
        <span class="snapshot-label">${state.lang === 'sw' ? 'Fursa za kuchunguza' : 'Opportunities to explore'}</span>
        ${rec.opportunities.map(o => `<div class="benefit"><b>+</b> ${t(o)}</div>`).join('')}
      </div>
      ${legalNote()}
    </div>
    <div class="actions">
      <button class="btn btn-primary" data-nav="advisor">${state.lang === 'sw' ? 'Ona mwongozo wa masharti' : 'See requirements guide'}</button>
      <button class="btn btn-secondary" data-nav="journey">${state.lang === 'sw' ? 'Ona Safari Yangu' : 'See My Journey'}</button>
      <button class="btn btn-secondary" data-start-fresh="1">${state.lang === 'sw' ? 'Anza mwongozo wa biashara mpya' : 'Start a new business guide'}</button>
      <button class="btn btn-secondary" data-nav="home">${state.lang === 'sw' ? 'Rudi Nyumbani' : 'Back Home'}</button>
    </div>
  `);
}

function screenJourney() {
  const rec = getRecommendation(state.profile);
  return screen('', `
    ${topbar('journey')}
    <div class="content">
      <h2>${state.lang === 'sw' ? 'Hatua za biashara yako' : 'Your Business Journey'}</h2>
      <div class="card journey-card">
        ${rec.journey.map(step => `
          <div class="journey-step ${step.status}">
            <span class="step-dot">${step.status === 'done' ? '✓' : ''}</span>
            <div>
              <strong>${t(step.title)}</strong>
              <span>${t(step.description)}</span>
            </div>
          </div>
        `).join('')}
      </div>
      ${legalNote()}
    </div>
    <div class="actions">
      <button class="btn btn-primary" data-nav="home">${state.lang === 'sw' ? 'Rudi Nyumbani' : 'Back Home'}</button>
    </div>
  `);
}

// --- I Have a Business (Business Checkup) ----------------------------------

function screenCheckupStage() {
  return screen('', `
    ${topbar('checkup-stage')}
    <div class="content">
      <p class="eyebrow">${state.lang === 'sw' ? 'Hali ya biashara — Hatua ya 1 kati ya 4' : 'Business Checkup — Step 1 of 4'}</p>
      ${miniProgress(1, 4)}
      <h2>${state.lang === 'sw' ? 'Biashara yako ina muda gani?' : 'How long has your business been running?'}</h2>
      <div class="stack">
        ${STAGE_OPTIONS.map(o => `
          <button class="option ${state.profile.stage === o.key ? 'selected' : ''}" data-select-stage="${o.key}">
            <span class="radio"></span>
            <span class="option-copy">${t(o.label)}<small>${t(o.note)}</small></span>
          </button>
        `).join('')}
      </div>
    </div>
    <div class="actions">
      <button class="btn btn-primary" data-nav="checkup-registration" ${state.profile.stage ? '' : 'disabled'}>${state.lang === 'sw' ? 'Endelea' : 'Continue'}</button>
    </div>
  `);
}

function screenCheckupRegistration() {
  return screen('', `
    ${topbar('checkup-registration')}
    <div class="content">
      <p class="eyebrow">${state.lang === 'sw' ? 'Hali ya biashara — Hatua ya 2 kati ya 4' : 'Business Checkup — Step 2 of 4'}</p>
      ${miniProgress(2, 4)}
      <h2>${state.lang === 'sw' ? 'Una vipi kati ya hivi?' : 'Which of these do you already have?'}</h2>
      <div class="stack">
        ${registrationOptionsHtml()}
      </div>
    </div>
    <div class="actions">
      <button class="btn btn-primary" data-nav="checkup-records">${state.lang === 'sw' ? 'Endelea' : 'Continue'}</button>
    </div>
  `);
}

function yesNoScreen(route, step, question, saveKey, nextRoute) {
  return screen('', `
    ${topbar(route)}
    <div class="content">
      <p class="eyebrow">${state.lang === 'sw' ? `Hali ya biashara — Hatua ya ${step} kati ya 4` : `Business Checkup — Step ${step} of 4`}</p>
      ${miniProgress(step, 4)}
      <h2>${t(question)}</h2>
      <div class="stack">
        <button class="option ${state.profile[saveKey] === 'yes' ? 'selected' : ''}" data-save-yesno="${saveKey}:yes">
          <span class="radio"></span><span class="option-copy">${state.lang === 'sw' ? 'Ndiyo' : 'Yes'}</span>
        </button>
        <button class="option ${state.profile[saveKey] === 'no' ? 'selected' : ''}" data-save-yesno="${saveKey}:no">
          <span class="radio"></span><span class="option-copy">${state.lang === 'sw' ? 'Hapana' : 'No'}</span>
        </button>
      </div>
    </div>
    <div class="actions">
      <button class="btn btn-primary" data-nav="${nextRoute}" ${state.profile[saveKey] ? '' : 'disabled'}>${state.lang === 'sw' ? 'Endelea' : 'Continue'}</button>
    </div>
  `);
}

function screenCheckupResult() {
  const result = getBusinessCheckup(state.profile);
  return screen('', `
    ${topbar('checkup-result')}
    <div class="content">
      <h2>${state.lang === 'sw' ? 'Matokeo ya ukaguzi wa biashara yako' : 'Your business check results'}</h2>
      <div class="card readiness-card" style="margin-top:20px;">
        <div>
          <span class="snapshot-label">${state.lang === 'sw' ? 'Utayari' : 'Readiness'}</span>
          <div class="readiness-number">${result.readiness}%</div>
        </div>
        <span class="chip risk-chip risk-${result.risk.level}">${t(RISK_LABEL[result.risk.level])}</span>
        <div class="readiness-track" style="margin-top:6px; width:100%;"><i style="width:${result.readiness}%;"></i></div>
      </div>
      <div class="card" style="margin-top:14px;">
        <span class="snapshot-label">${state.lang === 'sw' ? 'Ulichokamilisha' : "What's in place"}</span>
        ${result.completed.map(c => `<div class="analysis-item" style="border-bottom:0; padding:10px 0;"><span class="check">✓</span>${t(c)}</div>`).join('')}
      </div>
      ${result.improvements.length ? `
        <div class="card attention-card" style="margin-top:14px;">
          <span class="snapshot-label">${state.lang === 'sw' ? 'Maeneo ya kuboresha' : 'Areas to improve'}</span>
          ${result.improvements.map(i => `<div class="benefit"><b>!</b> ${t(i)}</div>`).join('')}
        </div>` : ''}
      <div class="card next-step" style="margin-top:14px;">
        <span class="snapshot-label">${state.lang === 'sw' ? 'Hatua inayofuata' : 'Next step'}</span>
        <div class="snapshot-value">${t(result.nextStep.title)}</div>
        <p class="step-time">${t(result.nextStep.time)}</p>
      </div>
      ${officialHandoffs()}
      ${legalNote()}
    </div>
    <div class="actions">
      <button class="btn btn-primary" data-nav="advisor">${state.lang === 'sw' ? 'Ona mwongozo wa masharti' : 'See requirements guide'}</button>
      <button class="btn btn-secondary" data-start-fresh="1">${state.lang === 'sw' ? 'Anza mwongozo wa biashara mpya' : 'Start a new business guide'}</button>
      <button class="btn btn-secondary" data-nav="home">${state.lang === 'sw' ? 'Rudi Nyumbani' : 'Back Home'}</button>
    </div>
  `);
}

// --- Compliance Advisor Dashboard ------------------------------------------

function screenAdvisor() {
  if (!state.profile.business) {
    return screen('', `
      ${topbar('advisor')}
      <div class="content intro-content">
        <div class="intro-icon">🧭</div>
        <h2>${state.lang === 'sw' ? 'Tukupe mwongozo unaoendana na biashara yako' : 'Get guidance that fits your business'}</h2>
        <p class="lead">${state.lang === 'sw'
          ? 'Jibu maswali 7 mafupi ili tuonyeshe masharti yanayoweza kukuhusu na hatua moja ya kuanzia. Huhitaji kujua istilahi za kodi kabla ya kuanza.'
          : 'Answer 7 short questions so we can show what may apply and one useful next step. You do not need tax knowledge to begin.'}</p>
      </div>
      <div class="actions">
        <button class="btn btn-primary" data-nav="category">${state.lang === 'sw' ? 'Jibu maswali 7 · Dakika 3' : 'Answer 7 questions · 3 min'}</button>
        <button class="btn btn-secondary" data-nav="checkup-stage">${state.lang === 'sw' ? 'Nina biashara tayari — ikague' : 'I already trade — check my business'}</button>
      </div>
    `);
  }

  const advisor = getComplianceAdvisor(state.profile);

  return screen('', `
    ${topbar('advisor')}
    <div class="content">
      <h2>${state.lang === 'sw' ? 'Mwongozo wa Masharti ya Biashara' : 'Business Requirements Guide'}</h2>
      <div class="card readiness-card" style="margin-top:16px;">
        <div>
          <span class="snapshot-label">${state.lang === 'sw' ? 'Hali ya maandalizi' : 'Guidance readiness'}</span>
          <div class="readiness-number">${advisor.complianceScore}%</div>
        </div>
        <span class="chip risk-chip risk-${advisor.risk.level}">${t(RISK_LABEL[advisor.risk.level])}</span>
        <div class="readiness-track" style="margin-top:6px;"><i style="width:${advisor.complianceScore}%;"></i></div>
      </div>

      ${advisor.risk.factors.length ? `
        <div class="card attention-card" style="margin-top:14px;">
          <span class="snapshot-label">${state.lang === 'sw' ? 'Mambo yanayohitaji kuangaliwa' : 'Why risk is elevated'}</span>
          ${advisor.risk.factors.map(f => `<div class="benefit"><b>!</b> ${t(f.label)}</div>`).join('')}
          ${advisor.risk.notes.map(n => `<div class="benefit note"><b>i</b> ${t(n)}</div>`).join('')}
        </div>` : `
        <div class="card" style="margin-top:14px;">
          <p style="line-height:1.5;">${state.lang === 'sw' ? 'Kwa sasa hakuna jambo kubwa linalohitaji uangalizi. Endelea kutunza taarifa za biashara yako vizuri.' : 'No major risk detected right now. Keep it up!'}</p>
        </div>`}

      <div class="card" style="margin-top:14px;">
        <span class="snapshot-label">${state.lang === 'sw' ? 'Hatua zako zinazofuata' : 'Your next best actions'}</span>
        ${advisor.actions.map(a => `
          <div class="next-action urgency-${a.urgency}">
            <span class="urgency-dot"></span>
            <div>
              <strong>${t(a.title)}</strong>
              <span class="step-time">${t(a.time)}</span>
              <p>${t(a.reason)}</p>
            </div>
          </div>
        `).join('')}
      </div>

      ${officialHandoffs()}

      <div class="card journey-card" style="margin-top:14px;">
        <span class="snapshot-label">${state.lang === 'sw' ? 'Safari yako' : 'Your journey'}</span>
        ${advisor.journey.map(step => `
          <div class="journey-step ${step.status}">
            <span class="step-dot">${step.status === 'done' ? '✓' : ''}</span>
            <div>
              <strong>${t(step.title)}</strong>
              <span>${t(step.description)}</span>
            </div>
          </div>
        `).join('')}
      </div>

      <div class="card" style="margin-top:14px;">
        <span class="snapshot-label">${t(advisor.benefits.headline)}</span>
        ${advisor.benefits.items.map(item => `
          <div class="benefit-row">
            <span class="benefit-status status-${item.status}">${item.status === 'eligible' ? '✓' : item.status === 'check' ? '?' : '—'}</span>
            <div>
              <strong>${t(item.title)}</strong>
              <p>${t(item.description)}</p>
            </div>
          </div>
        `).join('')}
        <p class="legal-note">${t(advisor.benefits.disclaimer)}</p>
      </div>
      ${legalNote()}
    </div>
    <div class="actions">
      <button class="btn btn-primary" data-nav="chat">${state.lang === 'sw' ? 'Uliza Zaidi' : 'Ask More'}</button>
      <button class="btn btn-secondary" data-nav="home">${state.lang === 'sw' ? 'Rudi Nyumbani' : 'Back Home'}</button>
    </div>
  `);
}

// --- Benefits & Incentives --------------------------------------------------

function screenBenefitsIntro() {
  return screen('', `
    ${topbar('benefits-intro')}
    <div class="content intro-content">
      <div class="intro-icon">🎁</div>
      <h2>${state.lang === 'sw' ? 'Fursa na Vivutio' : 'Benefits & Incentives'}</h2>
      <p class="lead">${state.lang === 'sw' ? 'Biashara yako iko wapi kwa sasa?' : 'Where is your business right now?'}</p>
      <div class="stack">
        ${BENEFIT_STATUS_OPTIONS.map(o => `
          <button class="option ${state.profile.benefitStatus === o.key ? 'selected' : ''}" data-select-benefit="${o.key}">
            <span class="radio"></span><span class="option-copy">${t(o.label)}</span>
          </button>
        `).join('')}
      </div>
    </div>
    <div class="actions">
      <button class="btn btn-primary" data-nav="benefits" ${state.profile.benefitStatus ? '' : 'disabled'}>${state.lang === 'sw' ? 'Endelea' : 'Continue'}</button>
    </div>
  `);
}

function screenBenefits() {
  const b = getBenefits(state.profile);
  return screen('', `
    ${topbar('benefits')}
    <div class="content">
      <h2>${t(b.headline)}</h2>
      <div class="stack">
        ${b.items.map(item => `
          <div class="card opportunity-card">
            <div class="opportunity-icon status-${item.status}">${item.status === 'eligible' ? '✓' : item.status === 'check' ? '?' : '—'}</div>
            <strong>${t(item.title)}</strong>
            <p style="color:var(--muted); font-size:14px; margin-top:6px; line-height:1.45;">${t(item.description)}</p>
          </div>
        `).join('')}
      </div>
      <p class="legal-note">${t(b.disclaimer)}</p>
    </div>
    <div class="actions">
      <button class="btn btn-primary" data-nav="home">${state.lang === 'sw' ? 'Rudi Nyumbani' : 'Back Home'}</button>
    </div>
  `);
}

// --- TRA Notices -------------------------------------------------------------

function screenNoticesIntro() {
  const deadlineType = ['Taarifa ya adhabu', 'Taarifa ya ukadiriaji'].includes(state.noticeType);
  return screen('', `
    ${topbar('notices-intro')}
    <div class="content intro-content">
      <div class="intro-icon">✉️</div>
      <h2>${state.lang === 'sw' ? 'Umepokea taarifa gani?' : 'What kind of notice did you receive?'}</h2>
      <div class="stack">
        ${NOTICE_TYPES.map(n => `
          <button class="option ${state.noticeType === n.key ? 'selected' : ''}" data-select-notice="${n.key}">
            <span class="radio"></span><span class="option-copy">${t(n.label)}</span>
          </button>
        `).join('')}
      </div>
      ${deadlineType ? `<label class="field-label" for="noticeServedDate">${state.lang === 'sw' ? 'Tarehe uliyokabidhiwa taarifa' : 'Date the notice was served on you'}</label><input class="option date-field" id="noticeServedDate" type="date" value="${esc(state.noticeServedDate)}"><p class="question-note">${state.lang === 'sw' ? 'Tarehe hii hutumika kuonyesha kikomo cha siku 30 cha pingamizi.' : 'This date is used to show the 30-day objection window.'}</p>` : ''}
    </div>
    <div class="actions">
      <button class="btn btn-primary" data-nav="notices-result" ${state.noticeType && (!deadlineType || state.noticeServedDate) ? '' : 'disabled'}>${state.lang === 'sw' ? 'Endelea' : 'Continue'}</button>
    </div>
  `);
}

function screenNoticesResult() {
  const g = getNoticeGuidance(state.noticeType || 'Sina uhakika');
  const deadlineType = ['Taarifa ya adhabu', 'Taarifa ya ukadiriaji'].includes(state.noticeType);
  const deadline = deadlineType && state.noticeServedDate ? new Date(`${state.noticeServedDate}T12:00:00`) : null;
  if (deadline) deadline.setDate(deadline.getDate() + 30);
  const deadlineLabel = deadline ? new Intl.DateTimeFormat(state.lang === 'sw' ? 'sw-TZ' : 'en-TZ', { dateStyle: 'long' }).format(deadline) : '';
  return screen('', `
    ${topbar('notices-result')}
    <div class="content">
      <span class="status-pill warning">${t(g.status)}</span>
      <h2 style="margin-top:14px;">${esc(state.noticeType || (state.lang === 'sw' ? 'Sina uhakika' : "I'm not sure"))}</h2>
      <div class="card" style="margin-top:18px;">
        <span class="snapshot-label">${state.lang === 'sw' ? 'Maana yake' : 'What it may mean'}</span>
        <p style="margin-top:8px; line-height:1.5;">${t(g.meaning)}</p>
      </div>
      <div class="card" style="margin-top:14px;">
        <span class="snapshot-label">${state.lang === 'sw' ? 'Hatua inayopendekezwa' : 'Suggested action'}</span>
        <p class="tax-action">${t(g.action)}</p>
      </div>
      ${deadline ? `<div class="card deadline-card"><span class="snapshot-label">${state.lang === 'sw' ? 'KIKOMO CHA SIKU 30' : '30-DAY WINDOW'}</span><div class="snapshot-value">${esc(deadlineLabel)}</div><p>${state.lang === 'sw' ? 'TRA inaonyesha pingamizi la uamuzi wa kodi liwasilishwe kwa maandishi ndani ya siku 30 tangu kukabidhiwa. Kwa pingamizi la makadirio, sheria pia ina masharti ya kulipa kodi isiyobishaniwa au theluthi moja ya kodi iliyokadiriwa—kiasi kilicho kikubwa—isipokuwa TRA ipunguze au isamehe kiasi hicho. Usitumie tarehe hii pekee bila kukagua taarifa yako.' : 'TRA states that a written objection to a tax decision should be filed within 30 days of service. For an assessment objection, the law also has payment conditions involving the undisputed tax or one-third of assessed tax—whichever is greater—unless TRA reduces or waives that amount. Do not rely on this date alone; check your notice.'}</p></div>` : ''}
      <div class="card support-card"><strong>${state.lang === 'sw' ? 'Msaada rasmi wa TRA' : 'Official TRA support'}</strong><p>0800 750 075 · 0800 780 078 · 0800 110 016<br>WhatsApp: 0744 233 333 · services@tra.go.tz</p><a class="btn btn-secondary" href="https://www.tra.go.tz/contact-us" target="_blank" rel="noopener noreferrer">${state.lang === 'sw' ? 'Fungua mawasiliano ya TRA' : 'Open TRA contacts'} ↗</a></div>
      ${legalNote()}
    </div>
    <div class="actions">
      <button class="btn btn-primary" data-nav="chat">${state.lang === 'sw' ? 'Uliza Zaidi' : 'Ask More'}</button>
      <button class="btn btn-secondary" data-nav="home">${state.lang === 'sw' ? 'Rudi Nyumbani' : 'Back Home'}</button>
    </div>
  `);
}

// --- Understand My Taxes -----------------------------------------------------

function screenTaxesIntro() {
  return screen('', `
    ${topbar('taxes-intro')}
    <div class="content intro-content">
      <div class="intro-icon">📊</div>
      <h2>${state.lang === 'sw' ? 'Mauzo yako ni kiasi gani?' : 'What are your approximate sales?'}</h2>
      <p class="lead">${state.lang === 'sw' ? 'Hii itatusaidia kuonesha muhtasari unaoendana na biashara yako.' : 'This helps us show a summary that fits your business.'}</p>
      <div class="stack">
        ${SALES_BUCKETS.map(o => `
          <button class="option ${state.profile.sales === o.key ? 'selected' : ''}" data-select-sales="${o.key}">
            <span class="radio"></span><span class="option-copy">${t(o.label)}</span>
          </button>
        `).join('')}
      </div>
    </div>
    <div class="actions">
      <button class="btn btn-primary" data-nav="taxes" ${state.profile.sales ? '' : 'disabled'}>${state.lang === 'sw' ? 'Endelea' : 'Continue'}</button>
    </div>
  `);
}

function screenTaxes() {
  const guidance = getTaxGuidance(state.profile);
  const bucket = SALES_BUCKETS.find(b => b.key === state.profile.sales) || SALES_BUCKETS[0];
  const daily = state.taxEstimateDaily ?? bucket.representativeDaily;
  const estimate = calculateTRAPresumptiveTax(daily, state.profile);

  return screen('', `
    ${topbar('taxes')}
    <div class="content">
      <h2>${state.lang === 'sw' ? 'Fahamu kodi zinazoweza kukuhusu' : 'Understand My Taxes'}</h2>
      <p class="lead">${t(guidance.summary)}</p>
      <div class="stack">
        ${guidance.cards.map(c => `
          <div class="card tax-card">
            <div class="tax-icon">${c.icon}</div>
            <div>
              <strong>${t(c.title)}</strong>
              <p style="color:var(--muted); font-size:14px; margin-top:4px; line-height:1.45;">${t(c.body)}</p>
              <p class="tax-action">${t(c.action)}</p>
            </div>
          </div>
        `).join('')}
      </div>

      <div class="card" style="margin-top:16px;">
        <span class="snapshot-label">${state.lang === 'sw' ? 'Mfano wa makadirio ya kodi kwa mfanyabiashara mdogo' : 'Illustrative Presumptive Tax estimate'}</span>
        <p class="question-note" style="margin-top:6px;">${state.lang === 'sw'
          ? 'Kadirio hili linatumia mauzo ya wastani ya kiwango ulichochagua. Weka mauzo yako ya siku kwa usahihi zaidi (hiari):'
          : 'This estimate uses a representative daily figure for your chosen range. Enter your own daily sales for a closer estimate (optional):'}</p>
        <div class="stack" style="margin-top:10px;">
          <label class="field-label" for="taxDailyInput">${state.lang === 'sw' ? 'Mauzo ya siku' : 'Daily sales'}</label><input type="text" id="taxDailyInput" class="option" style="min-height:52px;" inputmode="numeric" placeholder="${state.lang === 'sw' ? 'Mfano: 25000 au laki mbili' : 'e.g. 25000 or 200k'}" />
        </div>
        <button class="btn btn-secondary" id="taxEstimateBtn" style="margin-top:10px; width:100%;">${state.lang === 'sw' ? 'Kadiria' : 'Estimate'}</button>
        <div class="divider"></div>
        <div class="snapshot-value">${state.lang === 'sw' ? 'Mauzo/Siku' : 'Sales/Day'}: TSh ${fmtTsh(estimate.dailyTurnover)}</div>
        <div class="snapshot-value">${state.lang === 'sw' ? 'Mauzo/Mwaka' : 'Sales/Year'}: TSh ${fmtTsh(estimate.annualTurnover)}</div>
        <div class="snapshot-value" style="color:#a84600;">${state.lang === 'sw' ? 'Makadirio ya Kodi/Mwaka' : 'Estimated Tax/Year'}: ${estimate.annualTax !== null ? `TSh ${fmtTsh(estimate.annualTax)}` : '—'}</div>
        <p class="tax-action">${estimate.bracketInfo}</p>
        <p class="question-note">${state.lang === 'sw'
          ? `Kadirio hili limetumia jibu lako kuhusu kumbukumbu. ${estimate.eligibility.status === 'needs-info' ? 'Bado kuna masharti ya ustahiki ambayo hayajathibitishwa.' : ''} Viwango vilihakikiwa kwenye ukurasa wa sasa wa TRA tarehe 12 Agosti 2026.`
          : `This estimate uses your records answer. ${estimate.eligibility.status === 'needs-info' ? 'Some eligibility conditions are still unverified.' : ''} Rates were checked against TRA’s current page on 12 August 2026.`}</p>
        ${estimate.eligibility.reason ? `<p class="tax-action">${t(estimate.eligibility.reason)}</p>` : ''}
        ${estimate.efdRequired ? `<p class="tax-action" style="color:#a84600;">${state.lang === 'sw' ? '⚠️ Kiwango hiki huenda kikahitaji EFD/VFD.' : '⚠️ This level may require an EFD/VFD.'}</p>` : ''}
      </div>
      ${legalNote()}
    </div>
    <div class="actions">
      <button class="btn btn-primary" data-nav="home">${state.lang === 'sw' ? 'Rudi Nyumbani' : 'Back Home'}</button>
    </div>
  `);
}

// --- Ask Anything (Chat) ------------------------------------------------------

const QUICK_PROMPTS = [
  { sw: 'Mama lishe mauzo 30000 kwa siku', en: 'Mama lishe mauzo 30000 kwa siku' },
  { sw: 'Duka la nguo mauzo laki 2 kwa siku', en: 'Duka la nguo mauzo laki 2 kwa siku' },
  { sw: 'Nataka kupata TIN', en: 'Nataka kupata TIN' }
];

function screenChat() {
  const record = activeBusiness();
  const recordIndex = Math.max(0, state.businesses.findIndex(b => b.id === state.activeBusinessId));
  const opening = state.lang === 'sw'
    ? `Habari! Maswali hapa yanaendelea ndani ya muktadha wa ${businessName(record, recordIndex)}. Niulize kuhusu TIN, EFD, taarifa za TRA au kodi.`
    : `Hi! Questions here stay in the context of ${businessName(record, recordIndex)}. Ask about TIN, EFD, TRA notices or tax.`;

  const rows = [{ sender: 'bot', text: opening }, ...state.chat.messages];

  return screen('chat-screen', `
    ${topbar('chat')}
    <div class="content">
      <h2>${state.lang === 'sw' ? 'Msaidizi wa Biashara' : 'Business Assistant'}</h2>
      <div class="chat-log" id="chatLog">
        ${rows.map(renderChatRow).join('')}
      </div>
      <div class="quick-prompts">
        ${QUICK_PROMPTS.map(p => `<button class="quick-prompt" data-quick-prompt="${esc(t(p))}">${esc(t(p))}</button>`).join('')}
      </div>
      ${state.chat.pendingSales ? `<div class="card confirmation-card"><strong>${state.lang === 'sw' ? `Ulimaanisha TSh ${fmtTsh(state.chat.pendingSales)} kwa siku?` : `Did you mean TSh ${fmtTsh(state.chat.pendingSales)} per day?`}</strong><div class="choice-row"><button class="mini-choice selected" data-confirm-sales="yes">${state.lang === 'sw' ? 'Ndiyo, kadiria' : 'Yes, estimate'}</button><button class="mini-choice" data-confirm-sales="no">${state.lang === 'sw' ? 'Hapana, andika tena' : 'No, try again'}</button></div></div>` : ''}
    </div>
    <form class="chat-form" id="chatForm">
      <label class="sr-only" for="chatInput">${state.lang === 'sw' ? 'Swali lako' : 'Your question'}</label><input type="text" id="chatInput" placeholder="${state.lang === 'sw' ? 'Andika hapa...' : 'Type here...'}" autocomplete="off" />
      <button type="submit" class="send-btn" aria-label="${state.lang === 'sw' ? 'Tuma' : 'Send'}">➤</button>
    </form>
  `);
}

function renderChatRow(msg) {
  const bubble = `
    <div class="chat-row ${msg.sender === 'user' ? 'user' : ''}">
      <div class="chat-bubble">${mdToHtml(msg.text)}</div>
    </div>`;
  const link = msg.link ? `<button class="chat-link" data-nav="${msg.link.route}">${esc(msg.link.label)} →</button>` : '';
  return bubble + link;
}

function handleChatSubmit(text, confirmedAmount = null) {
  text = text.trim();
  if (!text && confirmedAmount === null) return;

  if (text) state.chat.messages.push({ sender: 'user', text });

  // Anonymized topic-only signal for the officer console's "Topics Causing
  // the Most Confusion" card — never the message text itself. A sales
  // figure is itself a tax question regardless of what other words appear.
  const chatTopic = confirmedAmount !== null || extractSalesAmount(text) !== null ? 'tax' : classifyChatTopic(text);
  sendChatEvent(chatTopic, state.lang);

  const faq = confirmedAmount === null ? checkForFAQ(text) : null;
  if (faq) {
    state.chat.messages.push({ sender: 'bot', text: t(faq) });
    render();
    return;
  }

  const dailySales = confirmedAmount ?? extractSalesAmount(text);
  if (dailySales !== null) {
    if (confirmedAmount === null) {
      state.chat.pendingSales = dailySales;
      state.chat.messages.push({ sender: 'bot', text: state.lang === 'sw' ? `Nimeona kiasi cha TSh ${fmtTsh(dailySales)}. Thibitisha kuwa ni mauzo ya siku kabla sijakadiria.` : `I found TSh ${fmtTsh(dailySales)}. Please confirm this is daily sales before I estimate.` });
      render(); return;
    }
    state.chat.pendingSales = null;
    const sector = parseSector(text);
    const tax = calculateTRAPresumptiveTax(dailySales, state.profile);
    const ctrlText = tax.isExempt
      ? (state.lang === 'sw' ? 'ℹ️ Mauzo yako ya mwaka ni chini ya TSh 4 Milioni (Hautakiwi kulipa kodi).' : "ℹ️ Your annual sales are below TSh 4 Million (No tax due).")
      : (state.lang === 'sw' ? '📌 Wasiliana na TRA kupata namba rasmi ya malipo (Control Number).' : '📌 Contact TRA to obtain an official Control Number.');
    const efdText = tax.efdRequired
      ? (state.lang === 'sw' ? '\n⚠️ Kiwango hiki huenda kikahitaji EFD/VFD.' : '\n⚠️ This level may require an EFD/VFD.')
      : '';
    const basisText = state.lang === 'sw'
      ? '\nℹ️ Mfano huu unatumia viwango vya kumbukumbu zisizokamilika; hali ya kumbukumbu na masharti mengine yanahitaji uthibitisho.'
      : '\nℹ️ This illustration uses incomplete-record rates; record status and other conditions still need verification.';
    const reply = (state.lang === 'sw'
      ? `✅ **Mchanganuo wa Kodi (${sector})**\n• Mauzo/Siku: TSh ${fmtTsh(dailySales)}\n• Mauzo/Mwaka: TSh ${fmtTsh(tax.annualTurnover)}\n• **Makadirio ya Kodi (Mwaka):** TSh ${tax.annualTax !== null ? fmtTsh(tax.annualTax) : '0'}\n${tax.bracketInfo}\n${ctrlText}${efdText}${basisText}`
      : `✅ **Tax breakdown (${sector})**\n• Sales/Day: TSh ${fmtTsh(dailySales)}\n• Sales/Year: TSh ${fmtTsh(tax.annualTurnover)}\n• **Estimated Tax (Year):** TSh ${tax.annualTax !== null ? fmtTsh(tax.annualTax) : '0'}\n${tax.bracketInfo}\n${ctrlText}${efdText}${basisText}`);
    state.chat.messages.push({ sender: 'bot', text: reply, link: { route: 'taxes-intro', label: state.lang === 'sw' ? 'Ona muhtasari kamili wa kodi' : 'See the full tax summary' } });
    render();
    return;
  }

  const assistant = getAssistantReply(text, state.profile);
  state.chat.messages.push({
    sender: 'bot',
    text: t(assistant.answer),
    link: { route: assistant.route, label: state.lang === 'sw' ? 'Fungua safari hii' : 'Open this journey' }
  });
  render();
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

function render() {
  const route = currentRoute();
  if (route !== 'analysis' && analysisTimer) {
    clearTimeout(analysisTimer);
    analysisTimer = null;
  }

  document.documentElement.lang = state.lang;

  let html;
  switch (route) {
    case 'splash': html = screenSplash(); break;
    case 'welcome': html = screenWelcome(); break;
    case 'home': html = screenHome(); break;
    case 'businesses': html = screenBusinesses(); break;

    case 'category': html = screenCategory(); break;
    case 'details': html = screenDetails(); break;
    case 'stage': html = screenStage(); break;
    case 'sales': html = screenSales('legal-form'); break;
    case 'legal-form': html = screenLegalForm(); break;
    case 'registration': html = screenRegistration('compliance-checks'); break;
    case 'compliance-checks': html = screenComplianceChecks(); break;
    case 'analysis': html = screenAnalysis('snapshot'); break;
    case 'snapshot': html = screenSnapshot(); break;
    case 'journey': html = screenJourney(); break;

    case 'checkup-stage': html = screenCheckupStage(); break;
    case 'checkup-registration': html = screenCheckupRegistration(); break;
    case 'checkup-records': html = yesNoScreen('checkup-records', 3, { sw: 'Je, unatunza kumbukumbu za mauzo na matumizi?', en: 'Do you keep sales and expense records?' }, 'records', 'checkup-returns'); break;
    case 'checkup-returns': html = yesNoScreen('checkup-returns', 4, { sw: 'Je, umewahi kuwasilisha ritani ya kodi (tax return)?', en: 'Have you filed a return before?' }, 'filedReturn', 'checkup-result'); break;
    case 'checkup-result': html = screenCheckupResult(); break;

    case 'advisor': html = screenAdvisor(); break;

    case 'benefits-intro': html = screenBenefitsIntro(); break;
    case 'benefits': html = screenBenefits(); break;

    case 'notices-intro': html = screenNoticesIntro(); break;
    case 'notices-result': html = screenNoticesResult(); break;

    case 'taxes-intro': html = screenTaxesIntro(); break;
    case 'taxes': html = screenTaxes(); break;

    case 'chat': html = screenChat(); break;

    default: html = screenHome(); break;
  }

  const app = document.getElementById('app');
  app.innerHTML = `<div class="app-shell">${conceptBanner()}${html}</div>`;

  const chatLog = document.getElementById('chatLog');
  if (chatLog) chatLog.scrollTop = chatLog.scrollHeight;

  const detailInput = document.getElementById('detailInput');
  if (detailInput) detailInput.focus({ preventScroll: true });

  saveMemory({ businesses: state.businesses, activeBusinessId: state.activeBusinessId, profile: state.profile, lang: state.lang, noticeType: state.noticeType });

  if (['snapshot', 'checkup-result', 'advisor'].includes(route) && state.profile.business) {
    sendGuidanceEvent(state.profile, getComplianceAdvisor(state.profile), state.lang, state.activeBusinessId || 'default');
  }
}

// ---------------------------------------------------------------------------
// Event delegation
// ---------------------------------------------------------------------------

function attachEvents() {
  document.addEventListener('click', (e) => {
    const backBtn = e.target.closest('[data-back]');
    if (backBtn) { history.back(); return; }

    const langBtn = e.target.closest('[data-lang]');
    if (langBtn) { state.lang = langBtn.getAttribute('data-lang'); render(); return; }

    const switchBusinessBtn = e.target.closest('[data-switch-business]');
    if (switchBusinessBtn) {
      activateBusiness(switchBusinessBtn.getAttribute('data-switch-business'));
      nav(state.profile.business ? 'home' : 'category');
      return;
    }

    const addBusinessBtn = e.target.closest('[data-add-business]');
    if (addBusinessBtn) {
      addBusiness();
      nav('category');
      return;
    }

    const deleteBusinessBtn = e.target.closest('[data-delete-business]');
    if (deleteBusinessBtn) {
      const id = deleteBusinessBtn.getAttribute('data-delete-business');
      state.businesses = state.businesses.filter(b => b.id !== id);
      if (!state.businesses.length) addBusiness();
      else if (state.activeBusinessId === id) activateBusiness(state.businesses[0].id);
      render(); return;
    }

    const startFreshBtn = e.target.closest('[data-start-fresh]');
    if (startFreshBtn) {
      startFreshBusinessJourney();
      return;
    }

    const categoryBtn = e.target.closest('[data-select-category]');
    if (categoryBtn) {
      const key = categoryBtn.getAttribute('data-select-category');
      state.profile.business = key;
      state.profile.businessLabel = key === 'OTHER'
        ? (state.lang === 'sw' ? 'Nyingine' : 'Other')
        : SECTORS[key].name;
      state.profile.businessSubtype = null;
      state.profile.businessSubtypeLabel = '';
      state.profile.detail = '';
      render();
      return;
    }

    const subtypeBtn = e.target.closest('[data-select-subtype]');
    if (subtypeBtn) {
      const key = subtypeBtn.getAttribute('data-select-subtype');
      state.profile.businessSubtype = key;
      state.profile.businessSubtypeLabel = key === 'OTHER'
        ? ''
        : (state.lang === 'sw' ? subtypeBtn.getAttribute('data-subtype-sw') : subtypeBtn.getAttribute('data-subtype-en'));
      if (key !== 'OTHER') state.profile.detail = '';
      render();
      return;
    }

    const stageBtn = e.target.closest('[data-select-stage]');
    if (stageBtn) { state.profile.stage = stageBtn.getAttribute('data-select-stage'); render(); return; }

    const salesBtn = e.target.closest('[data-select-sales]');
    if (salesBtn) { state.profile.sales = salesBtn.getAttribute('data-select-sales'); state.taxEstimateDaily = null; render(); return; }

    const legalFormBtn = e.target.closest('[data-select-legal-form]');
    if (legalFormBtn) { state.profile.legalForm = legalFormBtn.getAttribute('data-select-legal-form'); render(); return; }

    const profileChoiceBtn = e.target.closest('[data-profile-choice]');
    if (profileChoiceBtn) {
      const [key, val] = profileChoiceBtn.getAttribute('data-profile-choice').split(':');
      state.profile[key] = val;
      if (key === 'onlineSales' && val === 'no') state.profile.importsExports = 'no';
      render(); return;
    }

    const regBtn = e.target.closest('[data-toggle-reg]');
    if (regBtn) {
      const key = regBtn.getAttribute('data-toggle-reg');
      const idx = state.profile.registrations.indexOf(key);
      if (idx >= 0) {
        state.profile.registrations.splice(idx, 1);
        // Removing TIN must also remove the dependent licence answer.
        if (key === 'tin') {
          state.profile.registrations = state.profile.registrations.filter(item => item !== 'licence');
        }
      } else {
        if (key === 'licence' && !state.profile.registrations.includes('tin')) {
          window.alert(state.lang === 'sw' ? 'TIN inahitajika kabla ya leseni ya biashara. Chagua TIN ikiwa tayari unayo, au fuata TRA kwanza.' : 'A TIN is required before a business licence. Select TIN if you already have it, or complete TRA first.');
          return;
        }
        state.profile.registrations.push(key);
      }
      render();
      return;
    }

    const yesNoBtn = e.target.closest('[data-save-yesno]');
    if (yesNoBtn) {
      const [key, val] = yesNoBtn.getAttribute('data-save-yesno').split(':');
      state.profile[key] = val;
      render();
      return;
    }

    const benefitBtn = e.target.closest('[data-select-benefit]');
    if (benefitBtn) { state.profile.benefitStatus = benefitBtn.getAttribute('data-select-benefit'); render(); return; }

    const noticeBtn = e.target.closest('[data-select-notice]');
    if (noticeBtn) { state.noticeType = noticeBtn.getAttribute('data-select-notice'); render(); return; }

    const quickPromptBtn = e.target.closest('[data-quick-prompt]');
    if (quickPromptBtn) { handleChatSubmit(quickPromptBtn.getAttribute('data-quick-prompt')); return; }

    const confirmSalesBtn = e.target.closest('[data-confirm-sales]');
    if (confirmSalesBtn) {
      const amount = state.chat.pendingSales;
      if (confirmSalesBtn.getAttribute('data-confirm-sales') === 'yes' && amount) handleChatSubmit('', amount);
      else { state.chat.pendingSales = null; render(); }
      return;
    }

    const estimateBtn = e.target.closest('#taxEstimateBtn');
    if (estimateBtn) {
      const input = document.getElementById('taxDailyInput');
      const val = input ? parseSwahiliNumber(input.value) : null;
      if (val !== null) state.taxEstimateDaily = val;
      render();
      return;
    }

    const saveDetailBtn = e.target.closest('[data-save-detail]');
    if (saveDetailBtn) {
      const input = document.getElementById('detailInput');
      if (input) state.profile.detail = input.value.trim();
    }

    const forgetBtn = e.target.closest('[data-forget]');
    if (forgetBtn) {
      clearMemory();
      state.businesses = [];
      addBusiness();
      state.noticeType = null;
      state.returning = false;
      state.lastVisitAt = null;
      render();
      return;
    }

    const navBtn = e.target.closest('[data-nav]');
    if (navBtn) { nav(navBtn.getAttribute('data-nav')); return; }
  });

  document.addEventListener('submit', (e) => {
    if (e.target && e.target.id === 'chatForm') {
      e.preventDefault();
      const input = document.getElementById('chatInput');
      if (!input) return;
      const text = input.value;
      input.value = '';
      handleChatSubmit(text);
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target?.id === 'noticeServedDate') { state.noticeServedDate = e.target.value; render(); return; }
    if (e.target?.id === 'regionSelect') {
      state.profile.locationRegion = e.target.value;
      state.profile.locationArea = '';
      state.profile.locationOther = '';
      render();
      return;
    }
    if (e.target?.id === 'areaSelect') {
      state.profile.locationArea = e.target.value;
      if (e.target.value !== 'OTHER') state.profile.locationOther = '';
      render();
    }
  });

  document.addEventListener('input', (e) => {
    if (!['detailInput', 'locationOtherInput'].includes(e.target?.id)) return;
    if (e.target.id === 'detailInput') state.profile.detail = e.target.value;
    if (e.target.id === 'locationOtherInput') state.profile.locationOther = e.target.value;
    const continueBtn = document.querySelector('[data-save-detail]');
    if (!continueBtn) return;
    const subtypeReady = state.profile.business === 'OTHER'
      ? Boolean(state.profile.detail.trim())
      : Boolean(state.profile.businessSubtype && (state.profile.businessSubtype !== 'OTHER' || state.profile.detail.trim()));
    const locationReady = Boolean(
      state.profile.locationRegion &&
      state.profile.locationArea &&
      (state.profile.locationArea !== 'OTHER' || state.profile.locationOther.trim())
    );
    continueBtn.disabled = !(subtypeReady && locationReady);
  });
}

function initApp() {
  const mem = loadMemory();
  if (mem) {
    if (Array.isArray(mem.businesses) && mem.businesses.length) {
      state.businesses = mem.businesses.map((b) => ({
        ...b,
        profile: { ...emptyProfile(), ...(b.profile || {}), registrations: normalizeRegistrations(b.profile?.registrations ?? []) },
        chat: b.chat || { messages: [] }
      }));
      activateBusiness(mem.activeBusinessId || state.businesses[0].id);
      if (!activeBusiness()) activateBusiness(state.businesses[0].id);
    } else {
      const migrated = newBusinessRecord({ ...emptyProfile(), ...mem.profile, registrations: normalizeRegistrations(mem.profile?.registrations ?? []) });
      state.businesses = [migrated];
      activateBusiness(migrated.id);
    }
    state.lang = mem.lang ?? state.lang;
    state.noticeType = mem.noticeType ?? null;
    state.lastVisitAt = mem.savedAt ?? null;
    state.returning = true;
  } else {
    addBusiness();
  }

  attachEvents();
  if (!location.hash) location.replace('#/splash');
  window.addEventListener('hashchange', render);
  render();
}

document.addEventListener('DOMContentLoaded', initApp);
