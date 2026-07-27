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
    detail: '',
    stage: null,           // "mpya" | "inaendelea" | "imara"
    sales: null,           // "belowOne" | "oneToFive" | "fiveToTwenty" | "aboveTwenty"
    registrations: [],     // subset of ["tin","businessRegistration","licence"]
    records: null,         // "yes" | "no"
    filedReturn: null,     // "yes" | "no"
    benefitStatus: null    // "notStarted" | "recent" | "established"
  };
}

const state = {
  lang: 'sw',
  profile: emptyProfile(),
  noticeType: null,
  taxEstimateDaily: null,
  returning: false,
  lastVisitAt: null,
  chat: { messages: [] }
};

let analysisTimer = null;

const BUSINESS_CATEGORIES = [
  { key: 'CHAKULA', emoji: '🍲' },
  { key: 'USAFIRI', emoji: '🚖' },
  { key: 'UREMBO', emoji: '💇' },
  { key: 'UFUNDI', emoji: '🔨' },
  { key: 'REJAREJA', emoji: '🛍️' }
];

const STAGE_OPTIONS = [
  { key: 'mpya', label: { sw: 'Mpya', en: 'New' }, note: { sw: 'Chini ya mwaka mmoja', en: 'Under one year' } },
  { key: 'inaendelea', label: { sw: 'Inaendelea', en: 'Operating' }, note: { sw: 'Miaka 1 - 3', en: '1 - 3 years' } },
  { key: 'imara', label: { sw: 'Imara', en: 'Established' }, note: { sw: 'Zaidi ya miaka 3', en: '3+ years' } }
];

const SALES_BUCKETS = [
  { key: 'belowOne', label: { sw: 'Chini ya TSh Milioni 1 kwa mwaka', en: 'Below TSh 1 Million per year' }, representativeDaily: 2000 },
  { key: 'oneToFive', label: { sw: 'TSh Milioni 1 - 5 kwa mwaka', en: 'TSh 1M - 5M per year' }, representativeDaily: 8000 },
  { key: 'fiveToTwenty', label: { sw: 'TSh Milioni 5 - 20 kwa mwaka', en: 'TSh 5M - 20M per year' }, representativeDaily: 34000 },
  { key: 'aboveTwenty', label: { sw: 'Zaidi ya TSh Milioni 20 kwa mwaka', en: 'Above TSh 20 Million per year' }, representativeDaily: 100000 }
];

const REGISTRATION_OPTIONS = [
  { key: 'tin', label: { sw: 'TIN Number', en: 'TIN Number' }, note: { sw: 'Namba ya utambulisho wa mlipakodi', en: 'Taxpayer identification number' } },
  { key: 'businessRegistration', label: { sw: 'Usajili wa biashara', en: 'Business registration' }, note: { sw: 'BRELA au mamlaka husika', en: 'BRELA or relevant authority' } },
  { key: 'licence', label: { sw: 'Leseni ya biashara', en: 'Business licence' }, note: { sw: 'Kama inahitajika kwa sekta yako', en: 'If required for your sector' } }
];

const BENEFIT_STATUS_OPTIONS = [
  { key: 'notStarted', label: { sw: 'Bado sijaanza', en: 'Not started yet' } },
  { key: 'recent', label: { sw: 'Nimeanza hivi karibuni', en: 'Started recently' } },
  { key: 'established', label: { sw: 'Nina muda na biashara', en: 'Been running a while' } }
];

const NOTICE_TYPES = [
  { key: 'Kikumbusho', label: { sw: 'Kikumbusho', en: 'Reminder' } },
  { key: 'Taarifa ya adhabu', label: { sw: 'Taarifa ya adhabu', en: 'Penalty notice' } },
  { key: 'Taarifa ya ukadiriaji', label: { sw: 'Taarifa ya ukadiriaji', en: 'Assessment notice' } },
  { key: 'Kikumbusho cha return', label: { sw: 'Kikumbusho cha return', en: 'Return reminder' } },
  { key: 'Kikumbusho cha malipo', label: { sw: 'Kikumbusho cha malipo', en: 'Payment reminder' } },
  { key: 'Sina uhakika', label: { sw: 'Sina uhakika', en: "I'm not sure" } }
];

const RISK_LABEL = {
  low: { sw: 'Hatari ndogo', en: 'Low risk' },
  medium: { sw: 'Hatari ya kati', en: 'Medium risk' },
  high: { sw: 'Hatari kubwa', en: 'High risk' }
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

function brandMark(sizeClass = '') {
  return `<div class="brand-mark ${sizeClass}">${brandMarkSvg()}</div>`;
}

function nav(path) {
  location.hash = '#/' + path;
}

function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  return hash || 'splash';
}

function topbar(route) {
  const showBack = route !== 'splash' && route !== 'welcome' && route !== 'home';
  return `
    <div class="topbar">
      ${showBack ? `<button class="icon-btn" data-back="1" aria-label="Back">←</button>` : brandMark('small')}
      <button class="help" data-nav="chat">${state.lang === 'sw' ? 'Msaada' : 'Help'}</button>
    </div>`;
}

function langSwitch() {
  return `
    <div class="lang-switch">
      <button class="lang ${state.lang === 'sw' ? 'active' : ''}" data-lang="sw">Kiswahili</button>
      <button class="lang ${state.lang === 'en' ? 'active' : ''}" data-lang="en">English</button>
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
    ? '🧪 MFANO WA DHANA — Sio huduma rasmi ya TRA'
    : '🧪 UNOFFICIAL CONCEPT PROTOTYPE — not affiliated with or endorsed by TRA';
  return `<div class="concept-banner">${label}</div>`;
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

function screenSplash() {
  return screen('splash', `
    ${brandMark()}
    <p class="eyebrow" style="margin-top:18px;">🇹🇿 TRA</p>
    <h1 style="margin-top:8px;">Biashara Guide</h1>
    <p class="lead">${state.lang === 'sw'
      ? 'Mwongozo rahisi wa haki, fursa na hatua zinazofuata kwa biashara yako.'
      : 'Simple guidance on rights, opportunities, and next steps for your business.'}</p>
    <div class="actions" style="margin-top:32px; width:100%;">
      <button class="btn btn-primary" data-nav="welcome">${state.lang === 'sw' ? 'Anza' : 'Get started'}</button>
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
    { icon: '🚀', route: 'category', title: { sw: 'Anzisha Biashara', en: 'Start a Business' }, desc: { sw: 'Pata hatua zako za mwanzo', en: 'Get your first steps' } },
    { icon: '🧭', route: 'advisor', title: { sw: 'Kiongozi wa Utii', en: 'Compliance Advisor' }, desc: { sw: 'Alama, hatari na hatua zinazofuata', en: 'Score, risk & next best actions' } },
    { icon: '🏪', route: 'checkup-stage', title: { sw: 'Nina Biashara Tayari', en: 'I Have a Business' }, desc: { sw: 'Fanya Business Checkup', en: 'Run a Business Checkup' } },
    { icon: '🎁', route: 'benefits-intro', title: { sw: 'Fursa na Vivutio', en: 'Benefits & Incentives' }, desc: { sw: 'Chunguza fursa zako', en: 'Explore what may apply' } },
    { icon: '✉️', route: 'notices-intro', title: { sw: 'Taarifa za TRA', en: 'TRA Notices' }, desc: { sw: 'Elewa taarifa ulizopokea', en: 'Understand a notice you received' } },
    { icon: '📊', route: 'taxes-intro', title: { sw: 'Elewa Kodi Zangu', en: 'Understand My Taxes' }, desc: { sw: 'Muhtasari wa elimu ya kodi', en: 'An educational tax summary' } },
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
        <h2>${state.lang === 'sw' ? 'Nianze wapi?' : 'Where should I start?'}</h2>
      </div>
      ${resumeBanner}
      <div class="home-grid">
        ${actions.map(a => `
          <button class="action-card" data-nav="${a.route}">
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
            ? 'Tunatoa mwongozo tu — hatuchukui hatua kwa niaba yako wala kukagua biashara yako.'
            : "We only provide guidance — we don't take action on your behalf or inspect your business."}</p>
        </div>
      </div>
      <button class="link-btn" data-forget="1">${state.lang === 'sw' ? 'Futa taarifa zangu zilizohifadhiwa' : 'Forget my saved data'}</button>
    </div>
  `);
}

// --- Start a Business ------------------------------------------------------

function screenCategory() {
  return screen('', `
    ${topbar('category')}
    <div class="content">
      <p class="eyebrow">${state.lang === 'sw' ? 'Hatua ya 1 kati ya 5' : 'Step 1 of 5'}</p>
      ${miniProgress(1, 5)}
      <h2>${state.lang === 'sw' ? 'Biashara yako ni ya aina gani?' : 'What kind of business is it?'}</h2>
      <div class="business-grid">
        ${BUSINESS_CATEGORIES.map(c => `
          <button class="business-card ${state.profile.business === c.key ? 'selected' : ''}" data-select-category="${c.key}">
            <span class="emoji">${c.emoji}</span>
            ${SECTORS[c.key].name.split(' (')[0]}
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
  return screen('', `
    ${topbar('details')}
    <div class="content">
      <p class="eyebrow">${state.lang === 'sw' ? 'Hatua ya 2 kati ya 5' : 'Step 2 of 5'}</p>
      ${miniProgress(2, 5)}
      <h2>${state.lang === 'sw' ? 'Tuambie kidogo zaidi' : 'Tell us a bit more'}</h2>
      <p class="question-note">${state.lang === 'sw'
        ? 'Andika jina la biashara au maelezo mafupi (mfano: eneo, bidhaa kuu).'
        : 'Write your business name or a short description (e.g. location, main products).'}</p>
      <div class="stack">
        <input type="text" id="detailInput" class="option" style="min-height:56px;" placeholder="${state.lang === 'sw' ? 'Mfano: Duka la nguo, Kariakoo' : 'e.g. Clothing shop, Kariakoo'}" value="${esc(state.profile.detail)}" />
      </div>
    </div>
    <div class="actions">
      <button class="btn btn-primary" data-nav="stage" data-save-detail="1">${state.lang === 'sw' ? 'Endelea' : 'Continue'}</button>
    </div>
  `);
}

function screenStage() {
  return screen('', `
    ${topbar('stage')}
    <div class="content">
      <p class="eyebrow">${state.lang === 'sw' ? 'Hatua ya 3 kati ya 5' : 'Step 3 of 5'}</p>
      ${miniProgress(3, 5)}
      <h2>${state.lang === 'sw' ? 'Biashara yako iko hatua gani?' : 'What stage is your business at?'}</h2>
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
      <p class="eyebrow">${state.lang === 'sw' ? 'Hatua ya 4 kati ya 5' : 'Step 4 of 5'}</p>
      ${miniProgress(4, 5)}
      <h2>${state.lang === 'sw' ? 'Mauzo yako ni kiasi gani?' : 'What are your approximate sales?'}</h2>
      <p class="question-note">${state.lang === 'sw' ? 'Chagua kiwango kinachokaribiana zaidi.' : 'Choose the closest range.'}</p>
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

function screenRegistration(nextRoute) {
  return screen('', `
    ${topbar('registration')}
    <div class="content">
      <p class="eyebrow">${state.lang === 'sw' ? 'Hatua ya 5 kati ya 5' : 'Step 5 of 5'}</p>
      ${miniProgress(5, 5)}
      <h2>${state.lang === 'sw' ? 'Una vipi kati ya hivi?' : 'Which of these do you already have?'}</h2>
      <p class="question-note">${state.lang === 'sw' ? 'Chagua zote zinazokuhusu.' : 'Select all that apply.'}</p>
      <div class="stack">
        ${REGISTRATION_OPTIONS.map(o => `
          <button class="option ${state.profile.registrations.includes(o.key) ? 'selected' : ''}" data-toggle-reg="${o.key}">
            <span class="checkbox">${state.profile.registrations.includes(o.key) ? '✓' : ''}</span>
            <span class="option-copy">${t(o.label)}<small>${t(o.note)}</small></span>
          </button>
        `).join('')}
      </div>
    </div>
    <div class="actions">
      <button class="btn btn-primary" data-nav="${nextRoute}">${state.lang === 'sw' ? 'Kamilisha' : 'Finish'}</button>
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
  return screen('', `
    ${topbar('snapshot')}
    <div class="content">
      <h2>${state.lang === 'sw' ? 'Muhtasari wa Biashara Yako' : 'Your Business Snapshot'}</h2>
      <div class="card readiness-card" style="margin-top:20px;">
        <div>
          <span class="snapshot-label">${state.lang === 'sw' ? 'Utayari' : 'Readiness'}</span>
          <div class="readiness-number">${rec.readiness}%</div>
        </div>
        <span class="chip">✓ ${esc((state.profile.businessLabel || '').split(' (')[0])}</span>
        <div class="readiness-track" style="margin-top:6px;"><i style="width:${rec.readiness}%;"></i></div>
      </div>
      <div class="card next-step" style="margin-top:14px;">
        <span class="snapshot-label">${state.lang === 'sw' ? 'Hatua inayofuata' : 'Next step'}</span>
        <div class="snapshot-value">${t(rec.nextStep.title)}</div>
        <p class="step-time">${t(rec.nextStep.time)}</p>
        <div class="divider"></div>
        <p style="color:#354453; font-size:14px; line-height:1.5;">${t(rec.nextStep.reason)}</p>
      </div>
      <div class="card" style="margin-top:14px;">
        <span class="snapshot-label">${state.lang === 'sw' ? 'Fursa za kuchunguza' : 'Opportunities to explore'}</span>
        ${rec.opportunities.map(o => `<div class="benefit"><b>+</b> ${t(o)}</div>`).join('')}
      </div>
      ${legalNote()}
    </div>
    <div class="actions">
      <button class="btn btn-primary" data-nav="advisor">${state.lang === 'sw' ? 'Ona Kiongozi wa Utii Kamili' : 'See Full Compliance Advisor'}</button>
      <button class="btn btn-secondary" data-nav="journey">${state.lang === 'sw' ? 'Ona Safari Yangu' : 'See My Journey'}</button>
      <button class="btn btn-secondary" data-nav="home">${state.lang === 'sw' ? 'Rudi Nyumbani' : 'Back Home'}</button>
    </div>
  `);
}

function screenJourney() {
  const rec = getRecommendation(state.profile);
  return screen('', `
    ${topbar('journey')}
    <div class="content">
      <h2>${state.lang === 'sw' ? 'Safari ya Biashara Yako' : 'Your Business Journey'}</h2>
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
      <p class="eyebrow">${state.lang === 'sw' ? 'Business Checkup — Hatua ya 1 kati ya 4' : 'Business Checkup — Step 1 of 4'}</p>
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
      <p class="eyebrow">${state.lang === 'sw' ? 'Business Checkup — Hatua ya 2 kati ya 4' : 'Business Checkup — Step 2 of 4'}</p>
      ${miniProgress(2, 4)}
      <h2>${state.lang === 'sw' ? 'Una vipi kati ya hivi?' : 'Which of these do you already have?'}</h2>
      <div class="stack">
        ${REGISTRATION_OPTIONS.map(o => `
          <button class="option ${state.profile.registrations.includes(o.key) ? 'selected' : ''}" data-toggle-reg="${o.key}">
            <span class="checkbox">${state.profile.registrations.includes(o.key) ? '✓' : ''}</span>
            <span class="option-copy">${t(o.label)}<small>${t(o.note)}</small></span>
          </button>
        `).join('')}
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
      <p class="eyebrow">${state.lang === 'sw' ? `Business Checkup — Hatua ya ${step} kati ya 4` : `Business Checkup — Step ${step} of 4`}</p>
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
      <h2>${state.lang === 'sw' ? 'Matokeo ya Business Checkup' : 'Your Business Checkup Results'}</h2>
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
      ${legalNote()}
    </div>
    <div class="actions">
      <button class="btn btn-primary" data-nav="advisor">${state.lang === 'sw' ? 'Ona Kiongozi wa Utii Kamili' : 'See Full Compliance Advisor'}</button>
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
        <h2>${state.lang === 'sw' ? 'Bado hatuna taarifa za biashara yako' : "We don't have your business details yet"}</h2>
        <p class="lead">${state.lang === 'sw'
          ? "Anza kwa 'Anzisha Biashara' au 'Nina Biashara Tayari' ili tupate mwongozo unaokufaa."
          : "Start with 'Start a Business' or 'I Have a Business' so we can tailor guidance for you."}</p>
      </div>
      <div class="actions">
        <button class="btn btn-primary" data-nav="category">${state.lang === 'sw' ? 'Anzisha Biashara' : 'Start a Business'}</button>
        <button class="btn btn-secondary" data-nav="checkup-stage">${state.lang === 'sw' ? 'Nina Biashara Tayari' : 'I Have a Business'}</button>
      </div>
    `);
  }

  const advisor = getComplianceAdvisor(state.profile);

  return screen('', `
    ${topbar('advisor')}
    <div class="content">
      <h2>${state.lang === 'sw' ? 'Kiongozi wa Utii wa Kikodi' : 'Compliance Advisor'}</h2>
      <div class="card readiness-card" style="margin-top:16px;">
        <div>
          <span class="snapshot-label">${state.lang === 'sw' ? 'Alama ya Utii' : 'Compliance Score'}</span>
          <div class="readiness-number">${advisor.complianceScore}%</div>
        </div>
        <span class="chip risk-chip risk-${advisor.risk.level}">${t(RISK_LABEL[advisor.risk.level])}</span>
        <div class="readiness-track" style="margin-top:6px;"><i style="width:${advisor.complianceScore}%;"></i></div>
      </div>

      ${advisor.risk.factors.length ? `
        <div class="card attention-card" style="margin-top:14px;">
          <span class="snapshot-label">${state.lang === 'sw' ? 'Kwa nini hatari ipo' : 'Why risk is elevated'}</span>
          ${advisor.risk.factors.map(f => `<div class="benefit"><b>!</b> ${t(f.label)}</div>`).join('')}
          ${advisor.risk.notes.map(n => `<div class="benefit note"><b>i</b> ${t(n)}</div>`).join('')}
        </div>` : `
        <div class="card" style="margin-top:14px;">
          <p style="line-height:1.5;">${state.lang === 'sw' ? 'Hakuna hatari kubwa iliyobainika kwa sasa. Endelea vizuri!' : 'No major risk detected right now. Keep it up!'}</p>
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
    </div>
    <div class="actions">
      <button class="btn btn-primary" data-nav="notices-result" ${state.noticeType ? '' : 'disabled'}>${state.lang === 'sw' ? 'Endelea' : 'Continue'}</button>
    </div>
  `);
}

function screenNoticesResult() {
  const g = getNoticeGuidance(state.noticeType || 'Sina uhakika');
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
  const estimate = calculateTRAPresumptiveTax(daily);

  return screen('', `
    ${topbar('taxes')}
    <div class="content">
      <h2>${state.lang === 'sw' ? 'Elewa Kodi Zangu' : 'Understand My Taxes'}</h2>
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
        <span class="snapshot-label">${state.lang === 'sw' ? 'Kadirio la Kodi ya Makadirio (Presumptive Tax)' : 'Illustrative Presumptive Tax estimate'}</span>
        <p class="question-note" style="margin-top:6px;">${state.lang === 'sw'
          ? 'Kadirio hili linatumia mauzo ya wastani ya kiwango ulichochagua. Weka mauzo yako ya siku kwa usahihi zaidi (hiari):'
          : 'This estimate uses a representative daily figure for your chosen range. Enter your own daily sales for a closer estimate (optional):'}</p>
        <div class="stack" style="margin-top:10px;">
          <input type="text" id="taxDailyInput" class="option" style="min-height:52px;" placeholder="${state.lang === 'sw' ? 'Mfano: 25000 au laki mbili' : 'e.g. 25000 or 200k'}" />
        </div>
        <button class="btn btn-secondary" id="taxEstimateBtn" style="margin-top:10px; width:100%;">${state.lang === 'sw' ? 'Kadiria' : 'Estimate'}</button>
        <div class="divider"></div>
        <div class="snapshot-value">${state.lang === 'sw' ? 'Mauzo/Siku' : 'Sales/Day'}: TSh ${fmtTsh(estimate.dailyTurnover)}</div>
        <div class="snapshot-value">${state.lang === 'sw' ? 'Mauzo/Mwaka' : 'Sales/Year'}: TSh ${fmtTsh(estimate.annualTurnover)}</div>
        <div class="snapshot-value" style="color:#a84600;">${state.lang === 'sw' ? 'Makadirio ya Kodi/Mwaka' : 'Estimated Tax/Year'}: TSh ${estimate.annualTax !== null ? fmtTsh(estimate.annualTax) : '—'}</div>
        <p class="tax-action">${estimate.bracketInfo}</p>
        ${estimate.efdRequired ? `<p class="tax-action" style="color:#a84600;">${state.lang === 'sw' ? '⚠️ Kiwango hiki huenda kinahitaji mashine ya EFD.' : '⚠️ This level likely requires an EFD machine.'}</p>` : ''}
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
  const opening = state.lang === 'sw'
    ? 'Habari! Niambie biashara yako na mauzo yako kwa siku (mfano: Nna saluni mauzo laki 2 kwa siku), au niulize chochote kuhusu TIN, EFD, taarifa za TRA au kodi.'
    : "Hi! Tell me about your business and daily sales (e.g. I run a salon, sales 200k a day), or ask me anything about TIN, EFD, TRA notices, or tax.";

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
    </div>
    <form class="chat-form" id="chatForm">
      <input type="text" id="chatInput" placeholder="${state.lang === 'sw' ? 'Andika hapa...' : 'Type here...'}" autocomplete="off" />
      <button type="submit" class="send-btn" aria-label="Send">➤</button>
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

function handleChatSubmit(text) {
  text = text.trim();
  if (!text) return;

  state.chat.messages.push({ sender: 'user', text });

  // Anonymized topic-only signal for the officer console's "Topics Causing
  // the Most Confusion" card — never the message text itself. A sales
  // figure is itself a tax question regardless of what other words appear.
  const chatTopic = parseSwahiliNumber(text) !== null ? 'tax' : classifyChatTopic(text);
  sendChatEvent(chatTopic, state.lang);

  const faq = checkForFAQ(text);
  if (faq) {
    state.chat.messages.push({ sender: 'bot', text: t(faq) });
    render();
    return;
  }

  const dailySales = parseSwahiliNumber(text);
  if (dailySales !== null) {
    const sector = parseSector(text);
    const tax = calculateTRAPresumptiveTax(dailySales);
    const ctrlText = tax.isExempt
      ? (state.lang === 'sw' ? 'ℹ️ Mauzo yako ya mwaka ni chini ya TSh 4 Milioni (Hautakiwi kulipa kodi).' : "ℹ️ Your annual sales are below TSh 4 Million (No tax due).")
      : (state.lang === 'sw' ? '📌 Wasiliana na TRA kupata Control Number rasmi.' : '📌 Contact TRA to obtain an official Control Number.');
    const efdText = tax.efdRequired
      ? (state.lang === 'sw' ? '\n⚠️ Kiwango hiki huenda kinahitaji mashine ya EFD.' : '\n⚠️ This level likely requires an EFD machine.')
      : '';
    const reply = (state.lang === 'sw'
      ? `✅ **Mchanganuo wa Kodi (${sector})**\n• Mauzo/Siku: TSh ${fmtTsh(dailySales)}\n• Mauzo/Mwaka: TSh ${fmtTsh(tax.annualTurnover)}\n• **Makadirio ya Kodi (Mwaka):** TSh ${tax.annualTax !== null ? fmtTsh(tax.annualTax) : '0'}\n${tax.bracketInfo}\n${ctrlText}${efdText}`
      : `✅ **Tax breakdown (${sector})**\n• Sales/Day: TSh ${fmtTsh(dailySales)}\n• Sales/Year: TSh ${fmtTsh(tax.annualTurnover)}\n• **Estimated Tax (Year):** TSh ${tax.annualTax !== null ? fmtTsh(tax.annualTax) : '0'}\n${tax.bracketInfo}\n${ctrlText}${efdText}`);
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

    case 'category': html = screenCategory(); break;
    case 'details': html = screenDetails(); break;
    case 'stage': html = screenStage(); break;
    case 'sales': html = screenSales('registration'); break;
    case 'registration': html = screenRegistration('analysis'); break;
    case 'analysis': html = screenAnalysis('snapshot'); break;
    case 'snapshot': html = screenSnapshot(); break;
    case 'journey': html = screenJourney(); break;

    case 'checkup-stage': html = screenCheckupStage(); break;
    case 'checkup-registration': html = screenCheckupRegistration(); break;
    case 'checkup-records': html = yesNoScreen('checkup-records', 3, { sw: 'Je, unatunza kumbukumbu za mauzo na matumizi?', en: 'Do you keep sales and expense records?' }, 'records', 'checkup-returns'); break;
    case 'checkup-returns': html = yesNoScreen('checkup-returns', 4, { sw: 'Je, umewahi kuwasilisha return?', en: 'Have you filed a return before?' }, 'filedReturn', 'checkup-result'); break;
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

  saveMemory({ profile: state.profile, lang: state.lang, noticeType: state.noticeType });

  if (['snapshot', 'checkup-result', 'advisor'].includes(route) && state.profile.business) {
    sendGuidanceEvent(state.profile, getComplianceAdvisor(state.profile), state.lang);
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

    const categoryBtn = e.target.closest('[data-select-category]');
    if (categoryBtn) {
      const key = categoryBtn.getAttribute('data-select-category');
      state.profile.business = key;
      state.profile.businessLabel = key === 'OTHER'
        ? (state.lang === 'sw' ? 'Nyingine' : 'Other')
        : SECTORS[key].name;
      render();
      return;
    }

    const stageBtn = e.target.closest('[data-select-stage]');
    if (stageBtn) { state.profile.stage = stageBtn.getAttribute('data-select-stage'); render(); return; }

    const salesBtn = e.target.closest('[data-select-sales]');
    if (salesBtn) { state.profile.sales = salesBtn.getAttribute('data-select-sales'); state.taxEstimateDaily = null; render(); return; }

    const regBtn = e.target.closest('[data-toggle-reg]');
    if (regBtn) {
      const key = regBtn.getAttribute('data-toggle-reg');
      const idx = state.profile.registrations.indexOf(key);
      if (idx >= 0) state.profile.registrations.splice(idx, 1);
      else state.profile.registrations.push(key);
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
      state.profile = emptyProfile();
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
}

function initApp() {
  const mem = loadMemory();
  if (mem) {
    state.profile = { ...emptyProfile(), ...mem.profile, registrations: mem.profile?.registrations ?? [] };
    state.lang = mem.lang ?? state.lang;
    state.noticeType = mem.noticeType ?? null;
    state.lastVisitAt = mem.savedAt ?? null;
    state.returning = true;
  }

  attachEvents();
  if (!location.hash) location.replace('#/splash');
  window.addEventListener('hashchange', render);
  render();
}

document.addEventListener('DOMContentLoaded', initApp);
