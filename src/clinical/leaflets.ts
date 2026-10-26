// Patient information sheets, given with prescriptions and visit summaries.
//
// CLINICAL SAFETY: each sheet must be approved by the medical director in the app before use
// (content_approvals, kind = 'leaflet'). Bump `version` whenever the text changes.

export interface Leaflet {
  slug: string;
  title: string;
  version: number;
  intro: string;
  sections: { heading: string; points: string[] }[];
  urgent: string[]; // "Come back or call 119 if…"
}

const EMERGENCY = 'In an emergency call 119 (ambulance) or 112, or go to the nearest hospital emergency department.';

export const LEAFLETS: Leaflet[] = [
  {
    slug: 'dengue',
    title: 'Dengue fever: caring for yourself at home',
    version: 1,
    intro: 'Dengue is a viral infection spread by daytime-biting Aedes mosquitoes. Most people recover in about a week, but some develop a serious form, usually around days 3–7, often just as the fever settles. This is why we may ask you to come back for check-ups and blood tests.',
    sections: [
      { heading: 'What to do', points: ['Rest and drink plenty: water, ORS, coconut water, soups. Aim for urine that is pale and regular.', 'Use paracetamol only for fever and pain.', 'Do NOT take ibuprofen, aspirin, diclofenac or other anti-inflammatories: they increase the risk of bleeding.', 'Use mosquito repellent and nets so mosquitoes do not spread it to others.'] },
      { heading: 'Follow-up', points: ['Come back for your blood test (platelets and haematocrit) on the days we have asked, even if you feel better.', 'The dangerous phase is usually the 1–2 days after the fever goes down.'] },
    ],
    urgent: ['Severe stomach pain or repeated vomiting', 'Bleeding gums or nose, blood in vomit, urine or stools, or new bruising', 'Feeling very drowsy, restless or confused', 'Cold, clammy hands and feet, or fainting', 'Passing little or no urine for 6 hours', 'Difficulty breathing'],
  },
  {
    slug: 'fever-child',
    title: 'Fever in children',
    version: 1,
    intro: "Fever is common in children and is usually caused by a viral infection. It is the body's way of fighting infection. How your child looks and behaves matters more than the number on the thermometer.",
    sections: [
      { heading: 'What to do', points: ['Offer frequent drinks; continue breastfeeding.', 'Dress your child in light clothing; do not bundle them up or sponge with cold water.', 'Paracetamol can help if your child is distressed. Follow the dose on the label for their weight.', 'Do not give ibuprofen if dengue is possible (ask us).', 'Check on your child during the night.'] },
    ],
    urgent: ['Your baby is under 3 months with a temperature of 38 °C or more', 'A rash that does not fade when you press a glass on it', 'Floppy, very drowsy or hard to wake, or a weak or high-pitched cry', 'Breathing fast, grunting or sucking in under the ribs', 'Not drinking, no wet nappy for 12 hours, or sunken eyes', 'A fit (seizure)', 'Fever lasting more than 5 days'],
  },
  {
    slug: 'travellers-diarrhoea',
    title: "Travellers' diarrhoea and gastro",
    version: 1,
    intro: 'Upset stomach is the most common illness for visitors to Lombok. It usually settles within 3–5 days. The most important thing is to keep drinking.',
    sections: [
      { heading: 'What to do', points: ['Drink ORS (oralit) after every loose stool, plus extra water.', 'Eat light foods when you feel ready: rice, bananas, toast, soup.', 'Wash hands well with soap, especially before eating and after the toilet.', 'Drink bottled or boiled water; avoid ice of unknown origin and uncooked food from street stalls while recovering.', 'Only use loperamide if there is no fever and no blood in your stools.'] },
    ],
    urgent: ['Blood or mucus in your stools', 'High fever', 'Unable to keep any fluids down', 'Very little urine, dizziness on standing, or feeling faint', 'Severe or constant stomach pain', 'Diarrhoea lasting more than 7 days'],
  },
  {
    slug: 'dehydration-child',
    title: 'Diarrhoea and vomiting in children: oral rehydration',
    version: 1,
    intro: 'Children can become dehydrated quickly. Oral rehydration solution (ORS) replaces the water and salts they lose and works for almost all children.',
    sections: [
      { heading: 'How to give ORS', points: ['Give small sips often: a teaspoon every 1–2 minutes if your child is vomiting.', 'After each loose stool: under 2 years 50–100 mL, 2–10 years 100–200 mL.', 'Keep breastfeeding. Restart normal food as soon as your child wants to eat.', 'Give the zinc tablets every day for 10–14 days if we prescribed them.'] },
    ],
    urgent: ['Very sleepy, floppy or irritable', 'Sunken eyes, dry mouth, no tears, or no wet nappy for 8 hours', 'Vomiting everything, or green vomit', 'Blood in the stools', 'Fast breathing'],
  },
  {
    slug: 'wound-care',
    title: 'Caring for your wound, coral cut or stitches',
    version: 1,
    intro: 'Wounds heal more slowly in heat, humidity and seawater, and reef and coral cuts often get infected. Good care in the first week makes a big difference.',
    sections: [
      { heading: 'Daily care', points: ['Keep the dressing clean and dry for the first 48 hours.', 'Then wash gently once a day with clean water and mild soap, pat dry and put on a fresh dressing.', 'Stay out of the sea, rivers and swimming pools until the wound has closed: usually at least 5–7 days.', 'Stitches out: face 5 days, scalp and arms 7–10 days, legs and feet 10–14 days (we will tell you).'] },
    ],
    urgent: ['Increasing redness, heat, swelling or pain after the first 2 days', 'Pus, a bad smell, or red streaks spreading up the limb', 'Fever or feeling unwell', 'Numbness or the wound reopening'],
  },
  {
    slug: 'road-rash',
    title: 'Road rash, grazes and motorbike exhaust burns',
    version: 1,
    intro: "Motorbike falls and exhaust-pipe burns are very common in Lombok. Grazes heal well if they are kept clean and moist, and burns need gentle care and patience.",
    sections: [
      { heading: 'Daily care', points: ['Change the dressing daily, or if it becomes wet or dirty.', 'Clean gently with clean water; remove any loose grit.', 'Use the non-stick dressings and cream we gave you; do not let large grazes dry out and scab.', 'Do not use toothpaste, butter, oil or traditional remedies on burns.', 'Stay out of the sea until healed, and protect healing skin from the sun for 6 months to prevent darkening.'] },
      { heading: 'Ride safely', points: ['Wear a helmet, closed shoes and long sleeves.', 'Get off the bike on the side away from the exhaust pipe.'] },
    ],
    urgent: ['Spreading redness, pus, fever or increasing pain', 'Any new headache, vomiting, drowsiness or confusion after a fall (see the head injury sheet)'],
  },
  {
    slug: 'head-injury',
    title: 'Head injury: advice for the next 48 hours',
    version: 1,
    intro: 'You have been checked and are safe to go home. Most people recover fully, but a small number develop problems later, so a responsible adult should stay with you for the next 24 hours.',
    sections: [
      { heading: 'What to do', points: ['Rest. Do not ride a motorbike, drive, surf, dive or drink alcohol for at least 24–48 hours.', 'Take paracetamol for headache. Avoid sleeping tablets.', 'It is normal to feel tired or have a mild headache for a few days.'] },
    ],
    urgent: ['Becoming very drowsy or hard to wake', 'Vomiting more than once', 'A headache that gets worse and is not helped by paracetamol', 'Confusion, strange behaviour, slurred speech, weakness or numbness', 'A fit (seizure)', 'Clear fluid or blood from the nose or ears', 'Problems with eyesight'],
  },
  {
    slug: 'burns',
    title: 'Caring for a burn',
    version: 1,
    intro: 'Most small burns heal within 2 weeks. Keeping the burn clean and covered prevents infection.',
    sections: [
      { heading: 'Daily care', points: ['Keep the dressing clean and dry, and change it as we advised.', 'Do not burst blisters.', 'Take paracetamol for pain.', 'Keep the healing skin out of the sun and moisturise it once healed.'] },
    ],
    urgent: ['Increasing pain, redness or swelling', 'A bad smell, pus or fever', 'The burn is not healing after 2 weeks'],
  },
  {
    slug: 'marine-stings',
    title: 'Jellyfish, sea urchin, stonefish and stingray injuries',
    version: 1,
    intro: 'Marine stings and spines are common around Lombok reefs and beaches. Most settle with the first aid below.',
    sections: [
      { heading: 'First aid for next time', points: ['Box jellyfish (a cube-shaped jellyfish with long tentacles): pour vinegar over the sting for at least 30 seconds, then remove tentacles.', 'Bluebottle and other jellyfish: rinse with seawater (not fresh water), remove tentacles, then soak in hot water (as hot as you can comfortably bear, about 45 °C) for 20 minutes.', 'Sea urchin, stonefish or stingray: soak the area in hot water (about 45 °C) for 30–90 minutes. Heat breaks down the venom.', 'Do not urinate on stings, rub with sand or apply ice to venomous fish stings.'] },
      { heading: 'Aftercare', points: ['Small urchin spines often work their way out over days to weeks. Watch for infection.', 'Stingray and stonefish wounds need checking for retained barbs and infection.'] },
    ],
    urgent: ['Severe pain, sweating, vomiting, chest pain or difficulty breathing after a jellyfish sting', 'Swelling of the face or throat', 'Spreading redness, pus or fever', 'A spine in or near a joint, or a stiff painful joint'],
  },
  {
    slug: 'animal-bite',
    title: 'Animal bites and rabies prevention',
    version: 1,
    intro: 'Rabies is present in parts of Indonesia. It is almost always fatal once symptoms start, but it is completely preventable with vaccination after a bite or scratch. Please complete every vaccine dose on the dates given.',
    sections: [
      { heading: 'What to do', points: ['Keep the wound clean; take any antibiotics as prescribed.', 'Come back on every vaccine date. Bring your vaccine record if you travel on.', 'If the animal was a dog or cat that can be watched, tell us if it becomes ill or dies within 10 days.', 'Avoid touching or feeding dogs, cats and monkeys.'] },
    ],
    urgent: ['Redness, swelling or pus at the bite', 'Fever', 'You have missed a vaccine dose: contact us straight away (do not restart the course)'],
  },
  {
    slug: 'surfers-ear',
    title: "Surfer's ear (outer ear infection)",
    version: 1,
    intro: "Outer ear infection is common in surfers and swimmers because water stays in the ear canal. Drops usually clear it in about a week.",
    sections: [
      { heading: 'What to do', points: ['Use the ear drops as prescribed for the full course.', 'Keep the ear completely dry: no surfing or swimming until it has healed. Use a cotton ball with petroleum jelly when showering.', 'Do not use cotton buds.', 'Next time: use well-fitting ear plugs and tilt your head to drain water after surfing.'] },
    ],
    urgent: ['Fever', 'Swelling or redness spreading to the face or behind the ear', 'Pain getting worse after 3 days of drops', 'Hearing loss or dizziness'],
  },
  {
    slug: 'cellulitis',
    title: 'Skin infection (cellulitis)',
    version: 1,
    intro: 'Cellulitis is an infection of the skin, often starting from a small cut, bite or blister. Antibiotics usually start working within 48 hours.',
    sections: [
      { heading: 'What to do', points: ['Take the antibiotic for the full course.', 'Rest and keep the affected arm or leg raised as much as possible.', 'We may draw around the red area with a pen so you can see if it is shrinking.', 'Keep the area out of the sea until it has healed.'] },
    ],
    urgent: ['Redness spreading beyond the pen line after 48 hours', 'Fever, shivering, or feeling very unwell', 'Severe pain, blistering or dark skin', 'Vomiting so you cannot take your tablets'],
  },
  {
    slug: 'allergy-anaphylaxis',
    title: 'After a severe allergic reaction',
    version: 1,
    intro: 'You have had a serious allergic reaction. Symptoms can sometimes come back within 24 hours, so stay with someone tonight.',
    sections: [
      { heading: 'What to do', points: ['Avoid the trigger. Tell every doctor, pharmacist and restaurant about your allergy.', 'Take the antihistamine and steroid tablets if prescribed.', 'Carry an adrenaline auto-injector if one is advised for you, and make sure your travel companions know how to use it.'] },
    ],
    urgent: ['Swelling of the lips, tongue or throat', 'Wheezing, difficulty breathing or a hoarse voice', 'Feeling faint or dizzy', `Call 119 immediately and use your adrenaline if you have one. ${EMERGENCY}`],
  },
  {
    slug: 'asthma',
    title: 'Asthma: after an attack',
    version: 1,
    intro: 'Your breathing has improved enough for you to go home. Take your treatment as prescribed and make sure you can get help quickly if it gets worse.',
    sections: [
      { heading: 'What to do', points: ['Use your salbutamol inhaler with a spacer as needed.', 'Take the full course of prednisolone tablets.', 'Avoid smoke, including clove cigarettes (kretek).', 'See a doctor within 2 days to review your asthma.'] },
    ],
    urgent: ['Needing your inhaler more often than every 4 hours', 'Too breathless to finish a sentence', 'Lips turning blue, or feeling drowsy or exhausted', `${EMERGENCY}`],
  },
  {
    slug: 'heat-sunburn',
    title: 'Heat illness and sunburn',
    version: 1,
    intro: 'Lombok is hot and humid and the sun is strong near the equator. Heat exhaustion and sunburn are common, especially in the first days of a holiday and after surfing or hiking (including Rinjani).',
    sections: [
      { heading: 'Recovering', points: ['Rest in the shade or air conditioning.', 'Drink water and ORS regularly, even if you are not thirsty.', 'For sunburn: cool showers, moisturiser or aloe vera, paracetamol for pain. Do not burst blisters.'] },
      { heading: 'Prevention', points: ['Avoid strenuous activity between 11 am and 3 pm.', 'Use SPF 50 sunscreen, a hat and a rash vest; reapply after the water.', 'Limit alcohol on hot days.'] },
    ],
    urgent: ['Confusion, fainting or a fit', 'Very high temperature with hot, dry skin', 'Vomiting and unable to drink', 'Large blistered areas of sunburn with fever or chills'],
  },
  {
    slug: 'methanol',
    title: 'Methanol poisoning from arak and illegal spirits: important warning',
    version: 1,
    intro: 'Locally made spirits (arak, tuak) and some cheap cocktails can contain methanol, which can cause blindness, brain damage or death. Symptoms often start 12–24 hours after drinking.',
    sections: [
      { heading: 'Stay safe', points: ['Only drink sealed, branded alcohol from reputable venues.', 'Avoid arak-based cocktails and buckets of unknown origin.', 'Look out for friends who drank the same thing.'] },
    ],
    urgent: ['Blurred vision, "snowfield" vision or loss of vision after drinking', 'Severe headache, stomach pain or vomiting after drinking', 'Fast or difficult breathing', 'Drowsiness or confusion', `This is an emergency: ${EMERGENCY}`],
  },
  {
    slug: 'uti',
    title: 'Bladder infection (UTI)',
    version: 1,
    intro: 'Bladder infections are more common in hot weather when you drink less. They usually clear within a few days of antibiotics.',
    sections: [
      { heading: 'What to do', points: ['Take the full course of antibiotics.', 'Drink plenty of water.', 'Paracetamol can help with discomfort.'] },
    ],
    urgent: ['Fever, shivering or back or side pain', 'Vomiting', 'Blood in the urine that does not settle', 'Symptoms not improving after 48 hours of antibiotics', 'You are pregnant'],
  },
  {
    slug: 'red-eye',
    title: 'Red eye and conjunctivitis',
    version: 1,
    intro: 'Conjunctivitis is a common, mild infection or irritation of the surface of the eye. It is often caused by a virus and gets better by itself within 1–2 weeks.',
    sections: [
      { heading: 'What to do', points: ['Clean away sticky discharge with cotton wool and cooled boiled water.', 'Use any drops as prescribed.', 'Do not share towels or pillows; wash hands often.', 'Do not wear contact lenses until fully better.'] },
    ],
    urgent: ['Eye pain (not just grittiness)', 'Blurred vision that does not clear when you blink', 'Sensitivity to light', 'You wear contact lenses and your eye is red and painful', 'Injury to the eye or something hit or entered the eye'],
  },
];

export const LEAFLETS_BY_SLUG = new Map(LEAFLETS.map((l) => [l.slug, l]));
export const EMERGENCY_LINE = EMERGENCY;
