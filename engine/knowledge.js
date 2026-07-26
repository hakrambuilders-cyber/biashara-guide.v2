/**
 * Knowledge Engine — static bilingual reference data only.
 *
 * No logic lives here. Every fact quoted to a user must be traceable to
 * this file (or a future official-source connector that replaces it),
 * per the Functional Specification's Knowledge Engine rule.
 */

export const copy = (sw, en) => ({ sw, en });

// ---------------------------------------------------------------------------
// Sectors — includes sector-specific licensing/obligation hints used by the
// risk and next-best-action logic in engine/core.js.
// ---------------------------------------------------------------------------

export const SECTORS = {
  CHAKULA: {
    name: 'Chakula na Lishe (Food & Catering)',
    keywords: ['mama lishe', 'chakula', 'mgahawa', 'mkahawa', 'chippy', 'mshikaki', 'migahawa', 'usindikaji'],
    licenceNote: copy(
      'Biashara za chakula mara nyingi huhitaji cheti cha afya/usafi pamoja na leseni ya biashara.',
      'Food businesses typically need a health/hygiene certificate in addition to a business licence.'
    ),
    efdSensitive: true
  },
  USAFIRI: {
    name: 'Usafiri na Uchukuzi (Transportation)',
    keywords: ['boda', 'bodaboda', 'bajaji', 'daladala', 'usafiri', 'taxi', 'tax', 'lori', 'pikipiki'],
    licenceNote: copy(
      'Huduma za usafiri kwa kawaida huhitaji leseni ya safari/ruhusa ya mamlaka ya usafirishaji.',
      'Transport services typically require a route permit or transport-authority licence.'
    ),
    efdSensitive: true
  },
  UREMBO: {
    name: 'Urembo na Saluni (Beauty & Personal Care)',
    keywords: ['kinyozi', 'saluni', 'nywele', 'kusuka', 'urembo', 'barber', 'spa'],
    licenceNote: copy(
      'Saluni na vinyozi kwa kawaida huhitaji leseni ya biashara ya kawaida na usajili wa eneo.',
      'Salons and barbershops typically need a standard business licence and premises registration.'
    ),
    efdSensitive: false
  },
  UFUNDI: {
    name: 'Ufundi na Uzalishaji (Crafts & Manufacturing)',
    keywords: ['mbao', 'samani', 'ufundi', 'ujenzi', 'chuma', 'welding', 'fremu', 'shughuli za ujenzi', 'bomba'],
    licenceNote: copy(
      'Shughuli za uzalishaji zinaweza kuhitaji kibali cha eneo la kazi na tahadhari za usalama kazini.',
      'Manufacturing/workshop activity may need a workplace permit and workplace-safety considerations.'
    ),
    efdSensitive: true
  },
  REJAREJA: {
    name: 'Biashara Ndogondogo / Rejareja (Retail & General Trade)',
    keywords: ['duka', 'rejareja', 'machinga', 'nguo', 'madawa', 'kioski', 'genge', 'duka la nguo', 'mali kauli'],
    licenceNote: copy(
      'Maduka na biashara za rejareja kwa kawaida huhitaji leseni ya biashara ya kawaida.',
      'Retail shops typically need a standard business licence.'
    ),
    efdSensitive: true
  }
};

export const NUMBER_UNITS = {
  moja: 1, mbili: 2, tatu: 3, nne: 4, tano: 5,
  sita: 6, saba: 7, nane: 8, tisa: 9, kumi: 10,
  ishirini: 20, thelatini: 30, arobaini: 40, hamsini: 50,
  sitini: 60, sabini: 70, themanini: 80, tisini: 90, mia: 100
};

export const FAQS = [
  {
    keywords: ['presumptive', 'kodi ya makadirio', 'makadirio ni nini', 'inafanya kazi vipi'],
    response: copy(
      '**Kodi ya Makadirio (Presumptive Tax)** ni mfumo rahisi wa kodi uliowekwa na TRA kwa ajili ya wafanyabiashara wadogo wenye mauzo yasiyozidi TSh Milioni 100 kwa mwaka.',
      '**Presumptive Tax** is a simplified tax regime set by TRA for small businesses with annual sales up to TSh 100 Million.'
    )
  },
  {
    keywords: ['tin', 'usajili', 'kupata tin', 'namba ya tin'],
    response: copy(
      'Kupata **TIN Number** ni bure kabisa! Unatakiwa kuwa na Kitambulisho cha NIDA, namba ya simu iliyosajiliwa, na eneo la biashara.',
      'Getting a **TIN Number** is completely free! You need a NIDA ID, a registered phone number, and your business location.'
    )
  },
  {
    keywords: ['efd', 'mashine ya efd', 'efd machine'],
    response: copy(
      'Mashine ya **EFD** inatakiwa kisheria kwa mfanyabiashara yeyote mwenye mauzo yanayofikia au kuzidi **TSh Milioni 14 kwa mwaka**.',
      'An **EFD** machine is legally required once a business reaches or exceeds **TSh 14 Million in annual sales**.'
    )
  }
];

export const NOTICES = {
  Kikumbusho: {
    status: copy('Inahitaji uangalizi', 'Needs attention'),
    meaning: copy('Kikumbusho kwa kawaida huomba uchukue au uthibitishe hatua fulani.', 'A reminder normally asks you to take or confirm a specific step.'),
    action: copy('Soma tarehe, jambo linalotajwa na maelekezo kwenye taarifa.', 'Read the date, issue mentioned, and instructions on the notice.')
  },
  'Taarifa ya adhabu': {
    status: copy('Hatua inahitajika', 'Action required'),
    meaning: copy('Taarifa ya adhabu inaweza kuonyesha TRA inaona wajibu fulani haukutimizwa kwa wakati au kwa namna ilivyohitajika.', 'A penalty notice may indicate TRA considers that an obligation was not met on time or as required.'),
    action: copy('Kagua taarifa, thibitisha rekodi zako, kisha tafuta msaada rasmi ikiwa kuna makosa au huielewi.', 'Review the notice, confirm your records, then seek official support if there is an error or you do not understand it.')
  },
  'Taarifa ya ukadiriaji': {
    status: copy('Hatua inahitajika', 'Action required'),
    meaning: copy('Taarifa ya ukadiriaji inaweza kueleza maamuzi au kiasi kilichokadiriwa kulingana na taarifa zilizopo.', 'An assessment notice may set out a decision or estimated amount based on information available.'),
    action: copy('Soma maelezo na tarehe zake kwa makini; weka rekodi zako tayari kabla ya kuomba ufafanuzi rasmi.', 'Read the details and dates carefully; have your records ready before requesting official clarification.')
  },
  'Kikumbusho cha return': {
    status: copy('Hatua inahitajika', 'Action required'),
    meaning: copy('Kikumbusho kinaweza kuhusiana na taarifa au return inayotakiwa kuwasilishwa.', 'The reminder may relate to information or a return that needs to be submitted.'),
    action: copy('Thibitisha kama return tayari ilitumwa; kama haikutumwa, fuata njia rasmi ya kuwasilisha.', 'Confirm whether the return was already submitted; if not, use the official filing route.')
  },
  'Kikumbusho cha malipo': {
    status: copy('Hatua inahitajika', 'Action required'),
    meaning: copy('Kikumbusho cha malipo kinaweza kuomba uthibitishe au ukamilishe malipo yaliyotajwa.', 'A payment reminder may ask you to confirm or complete a payment mentioned.'),
    action: copy('Linganisheni taarifa na rekodi zako za malipo, kisha fuata maelekezo rasmi yaliyo kwenye taarifa.', 'Compare the notice with your payment records, then follow the official instructions on it.')
  },
  'Sina uhakika': {
    status: copy("Tuanze kwa kuielewa", "Let's understand it first"),
    meaning: copy('Usijali—anza kwa kusoma kichwa cha taarifa, tarehe na jambo linalotajwa.', "Don't worry—start by reading the notice heading, date, and issue mentioned."),
    action: copy('Tumia picha au nakala ya taarifa kupata ufafanuzi rasmi wa aina yake.', 'Use a photo or copy of the notice to obtain official clarification of its type.')
  }
};
