// Clinic formulary and patient drug information sheets.
//
// CLINICAL SAFETY: doses are standard reference doses (BNF / WHO) written as prescribing
// prompts, not orders. Every entry must be reviewed and approved by the medical director in
// the app before use (content_approvals, kind = 'drug'); unapproved entries show a warning.
// Bump `version` whenever an entry's content changes so it needs re-approval.

export type AllergyClass =
  | 'penicillin'
  | 'cephalosporin'
  | 'macrolide'
  | 'quinolone'
  | 'tetracycline'
  | 'sulfonamide'
  | 'nsaid'
  | 'nitroimidazole'
  | 'opioid';

export interface Drug {
  code: string;
  name: string;
  version: number;
  classes: AllergyClass[];
  form: string;
  adultDose: string;
  childDose?: string;
  defaultRoute: string;
  defaultFrequency: string;
  defaultDuration?: string;
  clinicOnly?: boolean; // given in clinic, not dispensed to take home
  cautions: string[];
  sheet: {
    whatFor: string;
    howToTake: string[];
    sideEffects: string[];
    getHelp: string[];
    doNotTake: string[];
    alcohol?: string;
    pregnancy?: string;
  };
}

export const DRUGS: Drug[] = [
  {
    code: 'paracetamol',
    name: 'Paracetamol',
    version: 1,
    classes: [],
    form: '500 mg tablet; 120 mg/5 mL syrup',
    adultDose: '500 mg–1 g every 4–6 hours (max 4 g in 24 hours)',
    childDose: '15 mg/kg every 4–6 hours (max 4 doses in 24 hours)',
    defaultRoute: 'oral',
    defaultFrequency: 'every 6 hours if needed',
    defaultDuration: '3 days',
    cautions: ['Reduce maximum dose in liver disease, low body weight (<50 kg) or heavy alcohol use.'],
    sheet: {
      whatFor: 'Pain and fever. It is the safest choice for fever when dengue is possible.',
      howToTake: ['Take with or without food.', 'Leave at least 4 hours between doses.', 'Do not take more than the dose on your label in 24 hours.'],
      sideEffects: ['Side effects are rare at the right dose.'],
      getHelp: ['If you have taken too much, even if you feel well: liver damage can be delayed. Come back or go to hospital straight away.'],
      doNotTake: ['Other medicines that also contain paracetamol (many cold and flu remedies do).'],
      alcohol: 'Avoid heavy drinking while taking paracetamol.',
      pregnancy: 'Safe in pregnancy and breastfeeding at normal doses.',
    },
  },
  {
    code: 'ibuprofen',
    name: 'Ibuprofen',
    version: 1,
    classes: ['nsaid'],
    form: '200 mg / 400 mg tablet; 100 mg/5 mL syrup',
    adultDose: '200–400 mg every 6–8 hours with food (max 1.2 g/day without medical review)',
    childDose: '5–10 mg/kg every 6–8 hours with food (max 30 mg/kg/day)',
    defaultRoute: 'oral',
    defaultFrequency: 'every 8 hours with food if needed',
    defaultDuration: '3 days',
    cautions: [
      'Do NOT use if dengue is possible (bleeding risk). Use paracetamol instead.',
      'Avoid in dehydration, kidney disease, peptic ulcer, late pregnancy, and NSAID-sensitive asthma.',
    ],
    sheet: {
      whatFor: 'Pain, swelling and fever.',
      howToTake: ['Take with food or milk.', 'Use the lowest dose for the shortest time.'],
      sideEffects: ['Stomach upset or indigestion.'],
      getHelp: ['Black or bloody stools, or vomiting blood.', 'Wheezing or swelling of the face.'],
      doNotTake: ['If you might have dengue fever, are dehydrated, or have had a stomach ulcer, kidney problems or asthma made worse by anti-inflammatories.'],
      alcohol: 'Avoid alcohol: it increases the risk of stomach bleeding.',
      pregnancy: 'Avoid in pregnancy unless your doctor advises it. Safe while breastfeeding.',
    },
  },
  {
    code: 'amoxicillin',
    name: 'Amoxicillin',
    version: 1,
    classes: ['penicillin'],
    form: '500 mg capsule; 125 mg/5 mL or 250 mg/5 mL suspension',
    adultDose: '500 mg three times daily for 5 days (1 g three times daily for severe infection)',
    childDose: '15–30 mg/kg three times daily (max 1 g per dose)',
    defaultRoute: 'oral',
    defaultFrequency: 'three times daily',
    defaultDuration: '5 days',
    cautions: ['Penicillin allergy: do not prescribe.', 'Can cause a rash in glandular fever (EBV).'],
    sheet: {
      whatFor: 'Bacterial infections such as ear, chest and some throat infections.',
      howToTake: ['Space doses evenly through the day.', 'Finish the course even if you feel better.'],
      sideEffects: ['Diarrhoea, nausea, mild rash.'],
      getHelp: ['Swelling of the face or lips, difficulty breathing, or a widespread itchy rash: these may be an allergic reaction. Get help immediately.', 'Severe or bloody diarrhoea.'],
      doNotTake: ['If you are allergic to penicillin.'],
      pregnancy: 'Safe in pregnancy and breastfeeding.',
    },
  },
  {
    code: 'amox-clav',
    name: 'Amoxicillin–clavulanate (co-amoxiclav)',
    version: 1,
    classes: ['penicillin'],
    form: '500/125 mg tablet; suspension',
    adultDose: '500/125 mg three times daily for 5–7 days (bite prophylaxis 3–5 days)',
    childDose: '15–20 mg/kg (amoxicillin component) three times daily',
    defaultRoute: 'oral',
    defaultFrequency: 'three times daily with food',
    defaultDuration: '5 days',
    cautions: ['Penicillin allergy: do not prescribe.', 'Avoid if previous liver problems with co-amoxiclav.'],
    sheet: {
      whatFor: 'Bacterial infections, including infected bites and wounds.',
      howToTake: ['Take at the start of a meal.', 'Finish the course even if you feel better.'],
      sideEffects: ['Diarrhoea, nausea, thrush.'],
      getHelp: ['Allergic reaction (face swelling, breathing difficulty, widespread rash).', 'Yellow skin or eyes, or dark urine.', 'Severe or bloody diarrhoea.'],
      doNotTake: ['If you are allergic to penicillin.'],
      pregnancy: 'Generally safe in pregnancy and breastfeeding; tell your doctor if you are pregnant.',
    },
  },
  {
    code: 'cefalexin',
    name: 'Cefalexin',
    version: 1,
    classes: ['cephalosporin'],
    form: '250 mg / 500 mg capsule; suspension',
    adultDose: '500 mg four times daily for 5–7 days',
    childDose: '12.5 mg/kg four times daily (max 1 g per dose)',
    defaultRoute: 'oral',
    defaultFrequency: 'four times daily',
    defaultDuration: '7 days',
    cautions: ['Avoid if previous anaphylaxis to penicillin or a cephalosporin.'],
    sheet: {
      whatFor: 'Skin and soft-tissue infections such as cellulitis and infected wounds.',
      howToTake: ['Space doses evenly through the day.', 'Finish the course.'],
      sideEffects: ['Diarrhoea, nausea, thrush.'],
      getHelp: ['Allergic reaction (face swelling, breathing difficulty, widespread rash).', 'Spreading redness, fever or feeling very unwell despite treatment.'],
      doNotTake: ['If you have had a serious allergic reaction to penicillin or cefalexin.'],
      pregnancy: 'Safe in pregnancy and breastfeeding.',
    },
  },
  {
    code: 'azithromycin',
    name: 'Azithromycin',
    version: 1,
    classes: ['macrolide'],
    form: '250 mg / 500 mg tablet; 200 mg/5 mL suspension',
    adultDose: "Travellers' diarrhoea: 1 g once, or 500 mg once daily for 3 days",
    childDose: '10 mg/kg once daily for 3 days (max 500 mg)',
    defaultRoute: 'oral',
    defaultFrequency: 'once daily',
    defaultDuration: '3 days',
    cautions: ['Caution with QT-prolonging medicines and heart rhythm problems.'],
    sheet: {
      whatFor: "Bacterial infections, including moderate to severe travellers' diarrhoea and some chest infections.",
      howToTake: ['Take at the same time each day.'],
      sideEffects: ['Nausea, stomach cramps, diarrhoea.'],
      getHelp: ['Palpitations or fainting.', 'Allergic reaction (face swelling, breathing difficulty, rash).'],
      doNotTake: ['If you are allergic to azithromycin, erythromycin or clarithromycin.'],
      pregnancy: 'Tell your doctor if you are pregnant or breastfeeding.',
    },
  },
  {
    code: 'ciprofloxacin',
    name: 'Ciprofloxacin',
    version: 1,
    classes: ['quinolone'],
    form: '250 mg / 500 mg tablet',
    adultDose: '500 mg twice daily (duration per protocol)',
    defaultRoute: 'oral',
    defaultFrequency: 'twice daily',
    defaultDuration: '3 days',
    cautions: [
      'High resistance in Southeast Asia for gut infections: azithromycin is preferred for diarrhoea.',
      'Risk of tendon rupture; avoid in children, pregnancy, and with steroids where possible.',
    ],
    sheet: {
      whatFor: 'Certain bacterial infections, including some marine-acquired wound infections and urinary infections.',
      howToTake: ['Take 2 hours apart from milk, antacids, iron or zinc.', 'Drink plenty of water.'],
      sideEffects: ['Nausea, diarrhoea, dizziness, sun sensitivity.'],
      getHelp: ['Pain or swelling in a tendon (especially the heel): stop and seek advice.', 'Tingling or numbness, confusion, palpitations.'],
      doNotTake: ['If you are allergic to quinolone antibiotics, are pregnant, or are under 18 unless your doctor advises.'],
      pregnancy: 'Avoid in pregnancy.',
    },
  },
  {
    code: 'doxycycline',
    name: 'Doxycycline',
    version: 1,
    classes: ['tetracycline'],
    form: '100 mg capsule',
    adultDose: '100 mg twice daily (200 mg on day 1 for some indications); duration per protocol',
    childDose: 'Over 8 years: 2 mg/kg twice daily (max 100 mg per dose)',
    defaultRoute: 'oral',
    defaultFrequency: 'twice daily',
    defaultDuration: '7 days',
    cautions: ['Avoid under 8 years and in pregnancy.', 'Photosensitivity: strong sun protection needed in Lombok.'],
    sheet: {
      whatFor: 'Infections such as leptospirosis, rickettsial (scrub/murine typhus) infection and some marine-acquired wound infections.',
      howToTake: ['Swallow with a full glass of water while sitting or standing up.', 'Do not lie down for 30 minutes after a dose.', 'Take 2 hours apart from milk, antacids, iron or zinc.'],
      sideEffects: ['Nausea, sunburn more easily than usual, heartburn.'],
      getHelp: ['Pain on swallowing.', 'Severe headache with blurred vision.', 'Allergic reaction.'],
      doNotTake: ['If you are pregnant or breastfeeding, or for children under 8.'],
      pregnancy: 'Avoid in pregnancy and breastfeeding.',
    },
  },
  {
    code: 'metronidazole',
    name: 'Metronidazole',
    version: 1,
    classes: ['nitroimidazole'],
    form: '250 mg / 500 mg tablet',
    adultDose: '400–500 mg three times daily for 5–7 days',
    childDose: '7.5 mg/kg three times daily',
    defaultRoute: 'oral',
    defaultFrequency: 'three times daily',
    defaultDuration: '7 days',
    cautions: ['Interacts with alcohol and warfarin.'],
    sheet: {
      whatFor: 'Infections such as giardia, amoebic dysentery and some dental and vaginal infections.',
      howToTake: ['Take with or after food.'],
      sideEffects: ['Metallic taste, nausea, dark urine.'],
      getHelp: ['Numbness or tingling, confusion, or a seizure.'],
      doNotTake: ['If you are allergic to metronidazole or tinidazole.'],
      alcohol: 'Do NOT drink any alcohol during the course and for 48 hours after: it causes severe vomiting.',
      pregnancy: 'Tell your doctor if you are pregnant or breastfeeding.',
    },
  },
  {
    code: 'nitrofurantoin',
    name: 'Nitrofurantoin (modified-release)',
    version: 1,
    classes: [],
    form: '100 mg MR capsule',
    adultDose: '100 mg MR twice daily: 3 days (women), 7 days (men)',
    defaultRoute: 'oral',
    defaultFrequency: 'twice daily with food',
    defaultDuration: '3 days',
    cautions: ['Avoid if eGFR <45, at term in pregnancy, or for upper urinary tract infection (kidney infection).'],
    sheet: {
      whatFor: 'Bladder infections (cystitis).',
      howToTake: ['Take with food or milk.', 'Drink plenty of water.'],
      sideEffects: ['Nausea; urine may turn dark yellow or brown (harmless).'],
      getHelp: ['Fever, back or loin pain, or vomiting: this may be a kidney infection.', 'Cough or breathlessness.'],
      doNotTake: ['If you have kidney problems or are in the last weeks of pregnancy.'],
      pregnancy: 'Can be used earlier in pregnancy if your doctor advises; avoid near the due date.',
    },
  },
  {
    code: 'ors',
    name: 'Oral rehydration solution (ORS, oralit)',
    version: 1,
    classes: [],
    form: 'Sachet to dissolve in 200 mL clean water',
    adultDose: '200–400 mL after each loose stool, plus extra to drink',
    childDose: 'Under 2 years: 50–100 mL after each loose stool; 2–10 years: 100–200 mL. Some dehydration: 75 mL/kg over 4 hours',
    defaultRoute: 'oral',
    defaultFrequency: 'after each loose stool and sip often',
    cautions: ['Use correct dilution: too strong can worsen dehydration.'],
    sheet: {
      whatFor: 'Replacing water and salts lost through diarrhoea and vomiting.',
      howToTake: ['Mix one sachet with the amount of clean (bottled or boiled and cooled) water on the packet.', 'Sip small amounts often, especially if vomiting.', 'Make a fresh mix each day.'],
      sideEffects: ['None expected when mixed correctly.'],
      getHelp: ['Unable to keep fluids down, very little urine, drowsiness, or blood in stools.'],
      doNotTake: ['Do not mix with juice, milk or soft drinks.'],
      pregnancy: 'Safe in pregnancy and breastfeeding.',
    },
  },
  {
    code: 'zinc',
    name: 'Zinc (for children with diarrhoea)',
    version: 1,
    classes: [],
    form: '20 mg dispersible tablet',
    adultDose: 'Not routinely used in adults',
    childDose: 'Under 6 months: 10 mg once daily; 6 months and over: 20 mg once daily, for 10–14 days',
    defaultRoute: 'oral',
    defaultFrequency: 'once daily',
    defaultDuration: '10 days',
    cautions: [],
    sheet: {
      whatFor: "Helps children recover from diarrhoea faster and lowers the chance of it coming back (WHO recommendation).",
      howToTake: ['Dissolve the tablet in a little breast milk, ORS or clean water.', 'Give once a day for the full 10–14 days, even when the diarrhoea has stopped.'],
      sideEffects: ['Occasional vomiting soon after the dose: if so, give again.'],
      getHelp: ['Signs of dehydration: very little urine, very sleepy, sunken eyes.'],
      doNotTake: [],
    },
  },
  {
    code: 'ondansetron',
    name: 'Ondansetron',
    version: 1,
    classes: [],
    form: '4 mg tablet / orally dissolving tablet',
    adultDose: '4–8 mg every 8 hours if needed',
    childDose: '6 months and over: 0.15 mg/kg once (max 4 mg), to allow oral rehydration',
    defaultRoute: 'oral',
    defaultFrequency: 'every 8 hours if needed',
    defaultDuration: '2 days',
    cautions: ['QT prolongation: caution with heart rhythm problems.'],
    sheet: {
      whatFor: 'Nausea and vomiting, so you can keep fluids down.',
      howToTake: ['Let the dissolving tablet melt on your tongue.', 'Start sipping fluids 15–20 minutes later.'],
      sideEffects: ['Headache, constipation.'],
      getHelp: ['Palpitations or fainting.', 'Vomiting continues and you cannot keep fluids down.'],
      doNotTake: ['If you are allergic to ondansetron.'],
      pregnancy: 'Discuss with your doctor if you are pregnant.',
    },
  },
  {
    code: 'loperamide',
    name: 'Loperamide',
    version: 1,
    classes: [],
    form: '2 mg capsule',
    adultDose: '4 mg first, then 2 mg after each loose stool (max 16 mg/day)',
    defaultRoute: 'oral',
    defaultFrequency: 'after each loose stool',
    defaultDuration: '2 days',
    cautions: ['Do not use with fever or bloody diarrhoea (dysentery).', 'Not for children under 12.'],
    sheet: {
      whatFor: 'Short-term relief of watery diarrhoea in adults.',
      howToTake: ['Keep drinking fluids or ORS as well.', 'Stop when stools firm up or after 48 hours.'],
      sideEffects: ['Constipation, bloating.'],
      getHelp: ['Fever, blood in stools, or a swollen painful belly: stop loperamide and come back.'],
      doNotTake: ['If you have a fever or blood or mucus in your stools, or for children under 12.'],
    },
  },
  {
    code: 'cetirizine',
    name: 'Cetirizine',
    version: 1,
    classes: [],
    form: '10 mg tablet; 5 mg/5 mL syrup',
    adultDose: '10 mg once daily',
    childDose: '2–6 years: 2.5 mg twice daily; 6–12 years: 5 mg twice daily',
    defaultRoute: 'oral',
    defaultFrequency: 'once daily',
    defaultDuration: '5 days',
    cautions: [],
    sheet: {
      whatFor: 'Itching, hives, allergy symptoms and itchy stings or bites.',
      howToTake: ['Take once a day, with or without food.'],
      sideEffects: ['Mild drowsiness in some people.'],
      getHelp: ['Swelling of lips or tongue, or difficulty breathing: this is an emergency.'],
      doNotTake: ['If you are allergic to cetirizine.'],
      alcohol: 'Alcohol may increase drowsiness.',
    },
  },
  {
    code: 'chlorphenamine',
    name: 'Chlorphenamine (CTM)',
    version: 1,
    classes: [],
    form: '4 mg tablet',
    adultDose: '4 mg every 4–6 hours (max 24 mg/day)',
    childDose: '6–12 years: 2 mg every 4–6 hours',
    defaultRoute: 'oral',
    defaultFrequency: 'every 6 hours if needed',
    defaultDuration: '3 days',
    cautions: ['Sedating: no driving or riding a motorbike.'],
    sheet: {
      whatFor: 'Itching and allergy symptoms.',
      howToTake: ['Take only as needed.'],
      sideEffects: ['Drowsiness, dry mouth.'],
      getHelp: ['Swelling of lips or tongue, or difficulty breathing.'],
      doNotTake: ['Before riding a motorbike, driving or surfing.'],
      alcohol: 'Do not drink alcohol: it makes drowsiness much worse.',
    },
  },
  {
    code: 'prednisolone',
    name: 'Prednisolone',
    version: 1,
    classes: [],
    form: '5 mg tablet',
    adultDose: 'Asthma attack: 40–50 mg once daily for 5 days',
    childDose: '1–2 mg/kg once daily for 3 days (max 40 mg)',
    defaultRoute: 'oral',
    defaultFrequency: 'once daily in the morning with food',
    defaultDuration: '5 days',
    cautions: ['Raises blood sugar in diabetes.', 'Caution in active infection.'],
    sheet: {
      whatFor: 'Reducing inflammation in asthma attacks and severe allergic reactions.',
      howToTake: ['Take all tablets together in the morning with breakfast.', 'Short courses can be stopped without tapering.'],
      sideEffects: ['Indigestion, trouble sleeping, mood changes, increased appetite.'],
      getHelp: ['Black stools, severe stomach pain, or mood changes that worry you.'],
      doNotTake: ['If you have an untreated serious infection, unless your doctor advises.'],
    },
  },
  {
    code: 'salbutamol-inhaler',
    name: 'Salbutamol inhaler (100 micrograms/puff)',
    version: 1,
    classes: [],
    form: 'Metered-dose inhaler, use with spacer',
    adultDose: '2–4 puffs via spacer every 4 hours as needed (up to 10 puffs in an attack)',
    childDose: '2–6 puffs via spacer as needed (up to 10 in an attack)',
    defaultRoute: 'inhaled',
    defaultFrequency: 'every 4 hours as needed',
    cautions: [],
    sheet: {
      whatFor: 'Relieves wheeze and breathlessness by opening the airways.',
      howToTake: ['Shake, attach to the spacer, one puff at a time, breathe in and out 4–6 times per puff.', 'Rinse the spacer weekly and let it air dry.'],
      sideEffects: ['Shaky hands, fast heartbeat for a short while.'],
      getHelp: ['Needing it more than every 4 hours, or it is not helping: come back.', 'Too breathless to speak, blue lips, or drowsy: call 119 / go to hospital immediately.'],
      doNotTake: [],
    },
  },
  {
    code: 'omeprazole',
    name: 'Omeprazole',
    version: 1,
    classes: [],
    form: '20 mg capsule',
    adultDose: '20 mg once daily (40 mg for severe symptoms) for 2–4 weeks',
    defaultRoute: 'oral',
    defaultFrequency: 'once daily before breakfast',
    defaultDuration: '14 days',
    cautions: [],
    sheet: {
      whatFor: 'Heartburn, reflux and stomach ulcers.',
      howToTake: ['Take 30 minutes before breakfast.'],
      sideEffects: ['Headache, diarrhoea.'],
      getHelp: ['Black stools, vomiting blood, difficulty swallowing or weight loss.'],
      doNotTake: [],
    },
  },
  {
    code: 'ofloxacin-ear',
    name: 'Ofloxacin 0.3% ear drops',
    version: 1,
    classes: ['quinolone'],
    form: '5 mL bottle',
    adultDose: '10 drops into the affected ear once daily for 7 days',
    childDose: '6 months to 12 years: 5 drops once daily for 7 days',
    defaultRoute: 'ear',
    defaultFrequency: 'once daily',
    defaultDuration: '7 days',
    cautions: ['Clean debris from the canal first for best effect.'],
    sheet: {
      whatFor: "Outer ear infection (swimmer's / surfer's ear).",
      howToTake: ['Warm the bottle in your hand first.', 'Lie with the affected ear up, put in the drops, stay lying for 5 minutes.', 'Keep the ear dry: no surfing or swimming until it has healed (usually 7–10 days).'],
      sideEffects: ['Mild stinging or itch.'],
      getHelp: ['Fever, swelling behind the ear, or the pain is getting worse after 3 days.'],
      doNotTake: ['If you are allergic to ofloxacin or ciprofloxacin.'],
    },
  },
  {
    code: 'chloramphenicol-eye',
    name: 'Chloramphenicol 0.5% eye drops',
    version: 1,
    classes: [],
    form: '10 mL bottle',
    adultDose: '1 drop every 2 hours for 2 days, then 4 times daily to complete 5 days',
    childDose: 'As adult',
    defaultRoute: 'eye',
    defaultFrequency: 'every 2 hours for 2 days, then four times daily',
    defaultDuration: '5 days',
    cautions: ['Not for contact-lens-related red eye (refer: risk of keratitis).'],
    sheet: {
      whatFor: 'Bacterial conjunctivitis (sticky red eye).',
      howToTake: ['Wash hands, pull down the lower lid and drop into the pocket.', 'Do not let the bottle touch the eye.', 'Do not wear contact lenses until fully better.'],
      sideEffects: ['Brief stinging.'],
      getHelp: ['Pain in the eye, blurred vision, or sensitivity to light: come back the same day.'],
      doNotTake: ['If you are allergic to chloramphenicol.'],
    },
  },
  {
    code: 'fusidic-acid-cream',
    name: 'Fusidic acid 2% cream',
    version: 1,
    classes: [],
    form: '15 g tube',
    adultDose: 'Apply thinly three times daily for 7 days',
    childDose: 'As adult',
    defaultRoute: 'topical',
    defaultFrequency: 'three times daily',
    defaultDuration: '7 days',
    cautions: ['Use for 7 days maximum to limit resistance.'],
    sheet: {
      whatFor: 'Small areas of skin infection such as impetigo or infected scratches.',
      howToTake: ['Wash hands before and after.', 'Gently clean the area and pat dry before applying.'],
      sideEffects: ['Mild irritation.'],
      getHelp: ['Redness spreading, fever, or red streaks up the limb.'],
      doNotTake: [],
    },
  },
  {
    code: 'silver-sulfadiazine',
    name: 'Silver sulfadiazine 1% cream',
    version: 1,
    classes: ['sulfonamide'],
    form: '25 g tube',
    adultDose: 'Apply 3–5 mm layer under a non-stick dressing once daily',
    defaultRoute: 'topical',
    defaultFrequency: 'once daily with dressing change',
    defaultDuration: '7 days',
    cautions: ['Avoid in sulfonamide allergy, pregnancy at term and in babies under 2 months.', 'Not for the face.'],
    sheet: {
      whatFor: 'Preventing infection in burns, including exhaust-pipe burns.',
      howToTake: ['Clean the burn gently with clean water before each new application.', 'Keep covered with a non-stick dressing.'],
      sideEffects: ['Temporary grey discolouration of the burn.'],
      getHelp: ['Increasing pain, pus, a bad smell, spreading redness or fever.'],
      doNotTake: ['If you are allergic to sulfa medicines.'],
    },
  },
  {
    code: 'hydrocortisone-cream',
    name: 'Hydrocortisone 1% cream',
    version: 1,
    classes: [],
    form: '15 g tube',
    adultDose: 'Apply thinly once or twice daily for up to 7 days',
    childDose: 'As adult',
    defaultRoute: 'topical',
    defaultFrequency: 'twice daily',
    defaultDuration: '7 days',
    cautions: ['Not on infected skin.'],
    sheet: {
      whatFor: 'Itchy, inflamed skin from bites, stings, heat rash or mild eczema.',
      howToTake: ['Apply a thin layer and rub in gently.'],
      sideEffects: ['Rare with short courses.'],
      getHelp: ['The rash spreads, weeps or becomes painful.'],
      doNotTake: ['On broken or infected skin, unless your doctor advises.'],
    },
  },
  {
    code: 'clotrimazole-cream',
    name: 'Clotrimazole 1% cream',
    version: 1,
    classes: [],
    form: '20 g tube',
    adultDose: 'Apply two to three times daily, continue 2 weeks after the rash has cleared',
    childDose: 'As adult',
    defaultRoute: 'topical',
    defaultFrequency: 'twice daily',
    defaultDuration: '4 weeks',
    cautions: [],
    sheet: {
      whatFor: 'Fungal skin infections (tinea, ringworm, panu), common in the tropics.',
      howToTake: ['Dry the skin well after showering.', 'Keep using for 2 weeks after the rash goes.'],
      sideEffects: ['Mild burning or itch.'],
      getHelp: ['No improvement after 2 weeks.'],
      doNotTake: [],
    },
  },
  {
    code: 'adrenaline-im',
    name: 'Adrenaline (epinephrine) 1 mg/mL IM',
    version: 1,
    classes: [],
    form: '1 mg/mL ampoule (1:1000)',
    adultDose: '0.5 mg (0.5 mL) IM into the outer thigh; repeat after 5 minutes if no improvement',
    childDose: 'Under 6 months 0.1–0.15 mg; 6 months–6 years 0.15 mg; 6–12 years 0.3 mg; over 12 years 0.5 mg',
    defaultRoute: 'intramuscular',
    defaultFrequency: 'once, repeat after 5 minutes if needed',
    clinicOnly: true,
    cautions: ['Anaphylaxis: give first, before anything else. Call 119 and arrange transfer.'],
    sheet: {
      whatFor: 'Emergency treatment of a severe allergic reaction (anaphylaxis). Given in the clinic.',
      howToTake: ['Given by your clinician into the thigh muscle.'],
      sideEffects: ['Racing heart, shaking, anxiety, pale skin for a short while.'],
      getHelp: ['Any return of swelling, breathing difficulty or faintness after you leave: call 119 immediately.'],
      doNotTake: [],
    },
  },
  {
    code: 'tetanus-td',
    name: 'Tetanus–diphtheria vaccine (Td)',
    version: 1,
    classes: [],
    form: '0.5 mL IM injection',
    adultDose: '0.5 mL IM once',
    defaultRoute: 'intramuscular',
    defaultFrequency: 'once',
    clinicOnly: true,
    cautions: ['Clean minor wound: give if last dose >10 years ago. Other wounds: give if >5 years. Unknown or incomplete primary course: give and consider tetanus immunoglobulin for tetanus-prone wounds.'],
    sheet: {
      whatFor: 'Protects against tetanus after a wound. Given in the clinic.',
      howToTake: ['Single injection into the upper arm.'],
      sideEffects: ['Sore arm, mild fever for a day or two.'],
      getHelp: ['Facial swelling or breathing difficulty soon after the injection.'],
      doNotTake: [],
    },
  },
  {
    code: 'rabies-vaccine',
    name: 'Rabies vaccine (post-exposure)',
    version: 1,
    classes: [],
    form: 'Cell-culture vaccine, IM or intradermal',
    adultDose: 'WHO 2018: IM days 0, 3, 7 and 14–28; or intradermal 2 sites on days 0, 3 and 7. Previously vaccinated: days 0 and 3 only',
    childDose: 'Same as adult',
    defaultRoute: 'intramuscular',
    defaultFrequency: 'schedule as listed',
    clinicOnly: true,
    cautions: ['Category III exposure in an unvaccinated person also needs rabies immunoglobulin (RIG), which may only be available in Mataram or Bali.'],
    sheet: {
      whatFor: 'Prevents rabies after a bite or scratch from a dog, cat, monkey or bat. Rabies is fatal but completely preventable if the course is finished.',
      howToTake: ['Come back on every scheduled date. If you are travelling on, take your vaccine record and finish the course elsewhere.'],
      sideEffects: ['Sore arm, headache, mild fever.'],
      getHelp: ['If you miss a dose, contact us straight away: do not restart, just continue.'],
      doNotTake: [],
    },
  },
];

export const DRUGS_BY_CODE = new Map(DRUGS.map((d) => [d.code, d]));

// Allergy matching: patient allergy text → classes it implies.
const ALLERGY_KEYWORDS: { pattern: RegExp; classes: AllergyClass[] }[] = [
  { pattern: /penicillin|amoxi|augmentin|co-?amoxiclav|ampicillin|flucloxacillin|benzylpenicillin/i, classes: ['penicillin'] },
  { pattern: /cephal|cef|kefle/i, classes: ['cephalosporin'] },
  { pattern: /macrolide|azithro|erythro|clarithro/i, classes: ['macrolide'] },
  { pattern: /quinolone|cipro|levoflox|oflox|moxiflox/i, classes: ['quinolone'] },
  { pattern: /tetracycline|doxy|minocycline/i, classes: ['tetracycline'] },
  { pattern: /sulfa|sulpha|sulfonamide|co-?trimoxazole|bactrim|septrin/i, classes: ['sulfonamide'] },
  { pattern: /nsaid|ibuprofen|aspirin|diclofenac|naproxen|mefenamic|ketorolac|anti-?inflammator/i, classes: ['nsaid'] },
  { pattern: /metronidazole|tinidazole|flagyl/i, classes: ['nitroimidazole'] },
  { pattern: /codeine|morphine|tramadol|opioid|opiate/i, classes: ['opioid'] },
];

export interface AllergyWarning {
  severity: 'block' | 'caution';
  message: string;
}

/** Checks a drug against the patient's free-text allergy record. */
export function allergyWarnings(drugName: string, drugCode: string | null, allergyText: string | null): AllergyWarning[] {
  if (!allergyText?.trim()) return [];
  const warnings: AllergyWarning[] = [];
  const drug = drugCode ? DRUGS_BY_CODE.get(drugCode) : undefined;
  const patientClasses = new Set<AllergyClass>();
  for (const k of ALLERGY_KEYWORDS) if (k.pattern.test(allergyText)) k.classes.forEach((c) => patientClasses.add(c));

  // Direct name match (works for free-text drugs too).
  const firstWord = drugName.toLowerCase().split(/[\s(–-]/)[0];
  if (firstWord.length > 3 && allergyText.toLowerCase().includes(firstWord)) {
    warnings.push({ severity: 'block', message: `Recorded allergy mentions ${drugName}.` });
  }
  for (const c of drug?.classes ?? []) {
    if (patientClasses.has(c)) warnings.push({ severity: 'block', message: `${drugName} is a ${c} and the patient has a recorded ${c} allergy.` });
  }
  // Cross-reactivity: penicillin allergy and cephalosporins.
  if (drug?.classes.includes('cephalosporin') && patientClasses.has('penicillin') && !patientClasses.has('cephalosporin')) {
    warnings.push({ severity: 'caution', message: 'Penicillin allergy recorded: avoid cephalosporins if the reaction was anaphylaxis or severe.' });
  }
  return warnings;
}
