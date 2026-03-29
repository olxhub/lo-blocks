// lib/character/dimensions.ts
//
// Character dimension catalog and stat presets for the CharacterBuilder.
//
// This is the runtime representation of docs/character-dimensions.yaml.
// Types, dimension data, stat presets, and random-roll distributions
// all live here.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DimensionExample {
  character: string;
  detail: string;
}

export type DimensionCategory =
  | 'identity'
  | 'personality'
  | 'voice'
  | 'relationships'
  | 'narrative'
  | 'rules';

export interface Dimension {
  key: string;
  name: string;
  category: DimensionCategory;
  type: 'text' | 'scale' | 'enum' | 'list' | 'relationship';
  description: string;
  prompt: string;
  examples?: DimensionExample[];
  guidance?: string;
  scale?: { min: number; max: number };
  options?: string[];
}

export interface UnitOption {
  unit: string;
  fromBase: (v: number) => number;  // convert base-unit value → this unit
  toBase: (v: number) => number;    // convert this-unit value → base unit
  min: number;
  max: number;
  step: number;
}

export interface StatDef {
  key: string;
  name: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  roll: () => number;
  currency?: boolean;               // use Intl.NumberFormat for display; unit is ISO 4217 code
  feetInches?: boolean;             // display inches as ft'in" (e.g., 65 → 5'5")
  altUnits?: UnitOption[];          // alternative unit systems (e.g., cm for height)
}

export interface StatPreset {
  key: string;
  name: string;
  description: string;
  stats: StatDef[];
}

// ---------------------------------------------------------------------------
// Random distributions
// ---------------------------------------------------------------------------

/** Roll NdS (N dice with S sides), return sum. */
function rollNdS(n: number, s: number): number {
  let total = 0;
  for (let i = 0; i < n; i++) total += Math.floor(Math.random() * s) + 1;
  return total;
}

/** D&D 4d6-drop-lowest. Range 3–18, mean ~12.24. */
function roll4d6DropLowest(): number {
  const rolls = Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1);
  rolls.sort((a, b) => a - b);
  return rolls[1] + rolls[2] + rolls[3];
}

/** Normal distribution via Box-Muller. */
function normalRandom(mean: number, stddev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stddev;
}

/** Lognormal distribution — useful for income, wealth, etc. */
function lognormalRandom(medianLog: number, sigma: number): number {
  return Math.exp(normalRandom(medianLog, sigma));
}

/** Clamp and round to step. */
function clampRound(value: number, min: number, max: number, step: number): number {
  const clamped = Math.max(min, Math.min(max, value));
  return Math.round(clamped / step) * step;
}

// ---------------------------------------------------------------------------
// Stat presets
// ---------------------------------------------------------------------------

export const STAT_PRESETS: StatPreset[] = [
  {
    key: 'dnd',
    name: 'D&D Classic',
    description: 'Strength, Dexterity, Constitution, Intelligence, Wisdom, Charisma. Rolled 4d6-drop-lowest.',
    stats: [
      { key: 'STR', name: 'Strength',     unit: '', min: 3, max: 18, step: 1, roll: roll4d6DropLowest },
      { key: 'DEX', name: 'Dexterity',    unit: '', min: 3, max: 18, step: 1, roll: roll4d6DropLowest },
      { key: 'CON', name: 'Constitution', unit: '', min: 3, max: 18, step: 1, roll: roll4d6DropLowest },
      { key: 'INT', name: 'Intelligence', unit: '', min: 3, max: 18, step: 1, roll: roll4d6DropLowest },
      { key: 'WIS', name: 'Wisdom',       unit: '', min: 3, max: 18, step: 1, roll: roll4d6DropLowest },
      { key: 'CHA', name: 'Charisma',     unit: '', min: 3, max: 18, step: 1, roll: roll4d6DropLowest },
    ],
  },
  {
    key: 'demographics',
    name: 'Demographics',
    description: 'Age, height, weight, income, IQ. Real units with realistic distributions.',
    stats: [
      {
        key: 'age', name: 'Age', unit: '', min: 0, max: 120, step: 1,
        roll: () => clampRound(normalRandom(30, 12), 18, 80, 1),
      },
      {
        key: 'height', name: 'Height', unit: 'in', min: 48, max: 84, step: 1,
        feetInches: true,
        roll: () => clampRound(normalRandom(67, 4), 48, 84, 1), // US adult mean ~67in, SD ~4in
        altUnits: [
          { unit: 'cm', fromBase: v => v * 2.54, toBase: v => v / 2.54, min: 122, max: 213, step: 1 },
        ],
      },
      {
        key: 'weight', name: 'Weight', unit: 'lb', min: 80, max: 350, step: 5,
        roll: () => clampRound(normalRandom(170, 35), 80, 350, 5),
        altUnits: [
          { unit: 'kg', fromBase: v => v * 0.4536, toBase: v => v / 0.4536, min: 36, max: 159, step: 1 },
        ],
      },
      {
        key: 'income', name: 'Income', unit: 'EUR', min: 0, max: 1_000_000, step: 1000,
        currency: true,
        // Median ~$56k, lognormal with wide tail
        roll: () => clampRound(lognormalRandom(Math.log(56_000), 0.8), 0, 1_000_000, 1000),
      },
      {
        key: 'iq', name: 'IQ', unit: 'points', min: 60, max: 200, step: 1,
        roll: () => clampRound(normalRandom(100, 15), 60, 200, 1),
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Category metadata (for UI grouping)
// ---------------------------------------------------------------------------

export const DIMENSION_CATEGORIES: { key: DimensionCategory; name: string }[] = [
  { key: 'identity',      name: 'Identity' },
  { key: 'personality',   name: 'Personality' },
  { key: 'voice',         name: 'Voice' },
  { key: 'relationships', name: 'Relationships' },
  { key: 'narrative',     name: 'Narrative' },
  { key: 'rules',         name: 'Rules' },
];

// ---------------------------------------------------------------------------
// Dimension catalog
// ---------------------------------------------------------------------------

export const DIMENSIONS: Dimension[] = [
  // ── Identity ──
  {
    key: 'placeOfOrigin',
    name: 'Place of Origin',
    category: 'identity',
    type: 'text',
    description: 'Where someone grew up shapes everything \u2014 accent, worldview, assumptions about what\u2019s normal, what they\u2019re homesick for. This isn\u2019t just a map pin. It\u2019s a lens on the world.',
    prompt: 'Where did this character grow up, and how does that place live inside them now?',
    examples: [
      {
        character: 'Chekov (Star Trek)',
        detail: 'Chekov\u2019s Russian origins aren\u2019t background trivia \u2014 they\u2019re a running thread. "In Russia, we invented it" is comedy, but underneath it is genuine pride and a touch of homesickness. His nationalism is endearing because it\u2019s clearly compensating for being young and far from home on a ship full of more experienced officers. Place of origin becomes a personality engine.',
      },
      {
        character: 'Marge Gunderson (Fargo)',
        detail: 'Marge\u2019s Minnesota is inseparable from who she is. Her politeness isn\u2019t an affectation \u2014 it\u2019s the water she swims in. When she says "oh, ya" while investigating a triple homicide, the collision between her warmth and the violence around her is the entire movie. Remove Minnesota and Marge stops working.',
      },
    ],
    guidance: 'Think about what your character misses, what they take for granted, what surprises them about other places. A character from rural Mississippi and one from downtown Seoul will have different default assumptions about community, privacy, and what counts as rude \u2014 and those differences create natural friction in group scenarios.',
  },
  {
    key: 'familyBackground',
    name: 'Family Background',
    category: 'identity',
    type: 'text',
    description: 'Parents\u2019 jobs, siblings, family dynamics, socioeconomic class. These shape a character\u2019s relationship to money, authority, education, and ambition \u2014 often invisibly.',
    prompt: 'What was the dinner table like when this character was growing up? What did their parents worry about?',
    examples: [
      {
        character: 'Will Hunting (Good Will Hunting)',
        detail: 'Will is a genius, but his foster-care background and working-class South Boston identity aren\u2019t incidental to his genius \u2014 they\u2019re in constant tension with it. He self-sabotages because success feels like betrayal of where he comes from. His family background doesn\u2019t just explain his behavior; it *is* the story.',
      },
      {
        character: 'Lisa Simpson (The Simpsons)',
        detail: 'Lisa is brilliant and ambitious in a family that is neither. Her isolation isn\u2019t about being smart \u2014 it\u2019s about being smart in *that house*. She loves her family and is embarrassed by them, sometimes in the same scene. The tension between who she is and where she comes from generates thirty years of stories.',
      },
    ],
    guidance: 'Family background often surfaces as assumptions. A character whose parents were professors might treat education as the default path; one whose parents ran a restaurant might value practical skills over credentials. These assumptions create interesting collisions in team scenarios where characters from different backgrounds have to solve problems together.',
  },
  {
    key: 'gender',
    name: 'Gender',
    category: 'identity',
    type: 'text',
    description: 'Gender shapes how a character moves through the world \u2014 how they\u2019re perceived, what\u2019s expected of them, what they expect of themselves. It can be the loudest thing about a character or the quietest. In some worlds it\u2019s the primary axis of power; in others it\u2019s background noise. This isn\u2019t a demographic checkbox \u2014 it\u2019s a force that shapes voice, confidence, relationships, and what a character is allowed to want.',
    prompt: 'Does this character follow, break, exaggerate, or bend the gender norms of their world? How does that shape their voice, their behavior, and how others respond to them?',
    examples: [
      {
        character: 'Emperor Georgiou (Star Trek: Discovery)',
        detail: 'Georgiou\u2019s personality is ultra-masculine \u2014 ruthless, dominating, physically aggressive, sexually predatory. She performs power in a register that\u2019s culturally coded male, and she does it so completely that other characters stop gendering her reactions. But the audience notices. Putting hyper-masculine dominance in a woman\u2019s body without ever commenting on the incongruity IS the gender statement. She doesn\u2019t break gender norms so much as annihilate them through sheer force of personality.',
      },
      {
        character: 'Alvy Singer (Annie Hall)',
        detail: 'Alvy\u2019s masculinity is entirely cerebral. He\u2019s not physical, not commanding, not traditionally \u201cmasculine\u201d by any measure except verbal dominance. His gender manifests as intellectual competitiveness, neurotic self-awareness, and anxiety about inadequacy. His relationships with women are shaped by simultaneous attraction and condescension \u2014 he wants Annie to grow, but only in the directions he approves. His gender isn\u2019t a label; it\u2019s a psychological landscape that drives his voice, his humor, and his inability to sustain intimacy.',
      },
      {
        character: 'Brienne of Tarth (Game of Thrones)',
        detail: 'Brienne is a knight in a world that says women can\u2019t be knights. Every interaction is shaped by the gap between who she is and what others expect. Some mock her, some underestimate her, a few respect her \u2014 and she has to push through that first reaction in every scene. Her gender doesn\u2019t define her identity, but it defines everyone else\u2019s first response to her. The tension between her competence and the world\u2019s refusal to see it is the engine of her entire character.',
      },
    ],
    guidance: 'The key question is how a character relates to the gender norms of their world. Every setting has expectations \u2014 a 1960s ad agency, a religious community, a military unit, a Silicon Valley startup \u2014 and every character follows, breaks, exaggerates, or bends those expectations in their own way. Georgiou annihilates norms through force. Alvy Singer performs an anxious, cerebral masculinity that compensates for physical inadequacy. Brienne pushes against a world that won\u2019t see her competence. Nomi in Showgirls navigates a system that reduces her to her body. Ripley in Alien operates in a gender-neutral role where it simply doesn\u2019t come up. In team scenarios, the contrast between characters\u2019 relationships to gender \u2014 one who conforms, one who resists, one who doesn\u2019t notice \u2014 creates realistic friction without anyone having to be wrong.',
  },
  {
    key: 'education',
    name: 'Education',
    category: 'identity',
    type: 'text',
    description: 'Not just degrees \u2014 what they studied, how they felt about it, what they retained, and what gaps they carry. Education shapes both competence and confidence.',
    prompt: 'What did this character learn in school, and what do they wish they\u2019d learned instead?',
    examples: [
      {
        character: 'Hermione Granger (Harry Potter)',
        detail: 'Hermione\u2019s education isn\u2019t just "she read the books." Her identity is built on academic achievement in a world where her blood status marks her as an outsider. She over-prepares because she feels she has to prove she belongs. Her knowledge is both her superpower and her defense mechanism.',
      },
      {
        character: 'Mike Ehrmantraut (Breaking Bad)',
        detail: 'Mike is a former cop with no advanced degree, but his practical education \u2014 in people, in systems, in how things go wrong \u2014 makes him the most competent person in any room. He\u2019s dismissive of formal credentials and trusts experience over theory. When he says "I\u2019ve seen this before," it carries more weight than any analysis.',
      },
    ],
    guidance: 'In professional scenarios, education determines not just what a character knows but how they approach problems. A statistics major and a sociology major looking at the same dropout data will ask different first questions. Make those differences specific.',
  },
  {
    key: 'professionalExperience',
    name: 'Professional Experience',
    category: 'identity',
    type: 'text',
    description: 'What they\u2019ve done for work, how long, and what it taught them. Professional experience shapes instincts \u2014 what feels routine, what triggers alarm bells, what they dismiss as "not my problem."',
    prompt: 'What has this character\u2019s work taught them that school didn\u2019t? What mistake did they make early that they\u2019ll never make again?',
    examples: [
      {
        character: 'Miranda Priestly (The Devil Wears Prada)',
        detail: 'Miranda\u2019s decades in fashion aren\u2019t just expertise \u2014 they\u2019ve made her intolerant of anyone who hasn\u2019t earned their opinions through similar immersion. She doesn\u2019t explain herself because, in her experience, people who need explanations aren\u2019t worth explaining to. Her professional experience has become a worldview.',
      },
      {
        character: 'Doc Hudson (Cars)',
        detail: 'Doc\u2019s racing career ended in a crash and a world that moved on without him. His professional experience isn\u2019t a resume bullet \u2014 it\u2019s a wound. He mentors Lightning McQueen not because he\u2019s generous but because he sees his own mistakes about to repeat.',
      },
    ],
    guidance: 'First professional experiences are particularly formative. An intern\u2019s first week shapes their assumptions about how workplaces function. Did they have a good mentor or a terrible one? Were they thrown in the deep end or carefully onboarded? These early impressions persist.',
  },

  // ── Personality ──
  {
    key: 'coreTraits',
    name: 'Core Personality Traits',
    category: 'personality',
    type: 'list',
    description: 'The two or three traits that define how this character meets the world. Not a full personality inventory \u2014 just the traits that an author needs to hold in mind for every scene.',
    prompt: 'If a stranger spent five minutes with this character, what two or three words would they use to describe them?',
    examples: [
      {
        character: 'Leslie Knope (Parks and Recreation)',
        detail: 'Relentlessly optimistic, obsessively organized, and genuinely caring \u2014 sometimes to a fault. Leslie\u2019s optimism isn\u2019t naive; she knows the system is broken. She just believes in working within it anyway. Her caring manifests as over-involvement: she plans your birthday party whether you want one or not. These three traits interact to generate nearly every plotline she\u2019s in.',
      },
      {
        character: 'Ron Swanson (Parks and Recreation)',
        detail: 'Libertarian, stoic, competent. Ron\u2019s libertarianism isn\u2019t a political position \u2014 it\u2019s a personality. He distrusts institutions, values self-reliance, and expresses affection through acts of craftsmanship rather than words. Put him next to Leslie and their contrasting traits create comedy without either being wrong.',
      },
    ],
    guidance: 'Traits should be specific enough to be actionable. "Nice" tells an author nothing. "Genuinely caring but expresses it through over-involvement" tells them exactly how to write this character helping a colleague.',
  },
  {
    key: 'confidenceLevel',
    name: 'Confidence Level',
    category: 'personality',
    type: 'scale',
    scale: { min: 1, max: 10 },
    description: 'How much this character trusts their own judgment. This isn\u2019t fixed \u2014 it may vary by domain (confident about code, insecure about presentations) \u2014 but the baseline matters for every interaction.',
    prompt: 'When this character has an opinion in a meeting, do they state it directly, hedge, wait for someone else to say it first, or stay quiet?',
    examples: [
      {
        character: 'Ty (Comm360 SBA)',
        detail: 'Ty starts the course at about a 3. He knows his statistics but doesn\u2019t trust that knowledge in a professional setting. He hedges \u2014 "I think maybe the data suggests..." \u2014 even when he\u2019s right. By the end of the course he\u2019s a 6 or 7: still thoughtful, but willing to state conclusions. His growth from 3 to 7 is the semester arc.',
      },
    ],
    guidance: 'A character\u2019s confidence level directly shapes dialogue. A confident character (8+) states conclusions. A moderately confident one (5-6) presents evidence and lets others draw conclusions. An uncertain one (2-3) asks questions instead of making statements. This is one of the most useful dimensions for LLM dialogue generation.',
  },
  {
    key: 'reactionToStress',
    name: 'Reaction to Stress',
    category: 'personality',
    type: 'text',
    description: 'What this character does when things go wrong. Flight, fight, freeze, or something more specific. Stress responses reveal character more than anything else.',
    prompt: 'The project deadline just moved up by a week. What does this character do in the first five minutes?',
    examples: [
      {
        character: 'Chidi Anagonye (The Good Place)',
        detail: 'Chidi\u2019s stress response is paralysis by analysis. He doesn\u2019t panic \u2014 he overthinks. Faced with a moral dilemma, he\u2019ll draft a 4,000-word pros-and-cons list instead of deciding. His stomachache is his stress tell. It\u2019s funny, but it\u2019s also genuinely debilitating, and the show treats it as both.',
      },
      {
        character: 'Molly Weasley (Harry Potter)',
        detail: 'Molly fusses. Her stress response is to feed people, clean things, and make sure everyone is warm and accounted for. It looks like calm competence but it\u2019s actually anxiety channeled into caretaking. When the danger is real enough to overwhelm even that coping mechanism, the contrast is devastating \u2014 which is why "NOT MY DAUGHTER" lands so hard.',
      },
    ],
    guidance: 'Stress responses are especially important in SBA scenarios because scenarios are built around problems. When the team discovers their analysis has a flaw, how each character reacts defines the next scene. Make sure different characters in the same scenario have *different* stress responses \u2014 that contrast drives interesting group dynamics.',
  },
  {
    key: 'emotionalRange',
    name: 'Emotional Range',
    category: 'personality',
    type: 'text',
    description: 'Not all characters express the full spectrum. Some are emotionally expressive; others operate in a narrow band. This affects how other characters (and students) read them.',
    prompt: 'What emotions does this character show freely? What emotions do they suppress or disguise as something else?',
    examples: [
      {
        character: 'Spock (Star Trek)',
        detail: 'Spock\u2019s emotional range is famously narrow on the surface \u2014 but that\u2019s the point. When emotion does break through, it carries enormous weight precisely because it\u2019s rare. His suppressed emotionality isn\u2019t absence of feeling; it\u2019s discipline over feeling. The audience learns to read his micro-expressions because the big ones almost never come.',
      },
      {
        character: 'Jake Peralta (Brooklyn Nine-Nine)',
        detail: 'Jake wears every emotion on his sleeve \u2014 except vulnerability, which he covers with jokes. His range is wide but strategically incomplete. He\u2019ll be openly excited, angry, silly, proud. But when he\u2019s hurt or scared, he deflects. That gap in his emotional range is where his character growth happens.',
      },
    ],
    guidance: 'In a team scenario, emotional range determines how misunderstandings happen. A character who hides frustration behind cheerfulness will be misread by teammates. A character who expresses everything will dominate group dynamics. Mix ranges to create realistic team friction.',
  },

  // ── Voice ──
  {
    key: 'speechPatterns',
    name: 'Speech Patterns',
    category: 'voice',
    type: 'text',
    description: 'Word choice, sentence length, formality, verbal tics. This is what makes dialogue sound like a specific person rather than "generic character." It\u2019s also the most directly useful dimension for LLM-generated dialogue.',
    prompt: 'Read two lines of this character\u2019s dialogue out loud. Would a listener be able to tell who\u2019s speaking without being told?',
    examples: [
      {
        character: 'Yoda (Star Wars)',
        detail: 'Object-subject-verb. "Strong with the Force, you are." Yoda\u2019s inverted syntax does triple duty: it marks him as alien, it forces the listener to pay attention (you can\u2019t half-listen to Yoda), and it gives his pronouncements a weight that normal syntax wouldn\u2019t carry. It\u2019s also *consistent* \u2014 even casual lines use it.',
      },
      {
        character: 'Raymond Holt (Brooklyn Nine-Nine)',
        detail: 'Formal, precise, devoid of contractions. "I am feeling what I believe is called \u2018excitement.\u2019" Holt speaks like a legal document that occasionally attempts humor. His formality is both a personality trait and a cultural signal \u2014 as a Black gay man who rose through the NYPD, he learned that precision is armor.',
      },
    ],
    guidance: 'Speech patterns are the single most important dimension for distinguishing characters in dialogue-heavy scenarios like Chat blocks. Vary them deliberately across a cast: one character speaks in short declarative sentences, another qualifies everything, a third uses metaphors from their field. Students should be able to tell who\u2019s speaking from voice alone.',
  },
  {
    key: 'vocabularyLevel',
    name: 'Vocabulary and Jargon',
    category: 'voice',
    type: 'text',
    description: 'What words does this character reach for? Technical jargon, colloquialisms, formal language, slang? Vocabulary signals expertise, background, and social positioning.',
    prompt: 'This character is explaining a complicated idea to a non-expert. What words do they use? Do they simplify or expect the listener to keep up?',
    examples: [
      {
        character: 'The Doctor (Doctor Who)',
        detail: 'The Doctor uses technical terms freely but explains them through wild analogies \u2014 "It\u2019s like a big ball of wibbly-wobbly, timey-wimey stuff." The vocabulary is simultaneously expert and accessible, which signals both intelligence and a desire to be understood. Different incarnations shift the register: Tennant is enthusiastic, Capaldi is impatient, Whittaker is encouraging.',
      },
      {
        character: 'Omar Little (The Wire)',
        detail: 'Omar speaks street vernacular with surprising precision. "A man got to have a code." His vocabulary is plain but his meaning is always exact. He doesn\u2019t use ten words when three will do. The simplicity of his language contrasts with the complexity of his moral reasoning, which makes him one of the most quotable characters in television.',
      },
    ],
    guidance: 'In professional scenarios, jargon use signals belonging. A new intern who says "let\u2019s do a regression" is performing competence. A veteran who says "let\u2019s look at the numbers" has nothing to prove. Match vocabulary to where the character is in their career and how secure they feel.',
  },
  {
    key: 'humorStyle',
    name: 'Humor Style',
    category: 'voice',
    type: 'text',
    description: 'Whether and how this character uses humor. Dry, slapstick, self-deprecating, sarcastic, pun-based, dark, or absent. Humor is a social tool \u2014 how someone uses it reveals how they relate to others.',
    prompt: 'Something goes wrong in a meeting. Does this character make a joke? What kind? Or do they find the joke-maker annoying?',
    examples: [
      {
        character: 'Chandler Bing (Friends)',
        detail: 'Sarcasm as defense mechanism. Chandler makes jokes when he\u2019s uncomfortable, which is most of the time. His humor is deflection \u2014 if he\u2019s laughing, he doesn\u2019t have to be vulnerable. The moments when he drops the sarcasm (usually with Monica) are the emotional peaks of his storylines.',
      },
      {
        character: 'Drax (Guardians of the Galaxy)',
        detail: 'Drax is unintentionally funny. He takes everything literally, doesn\u2019t understand metaphor, and states obvious things with complete sincerity. His humor comes from the gap between his self-perception (deadly serious warrior) and how others experience him. He never tries to be funny, which makes him the funniest character in the room.',
      },
    ],
    guidance: 'Humor style is especially important in team scenarios because it affects group dynamics. A sarcastic character and a literal one will miscommunicate productively. A self-deprecating character might use humor to avoid taking credit. A character with no humor style can be the straight man who grounds the group.',
  },

  // ── Relationships ──
  {
    key: 'relationshipToAuthority',
    name: 'Relationship to Authority',
    category: 'relationships',
    type: 'text',
    description: 'How this character deals with bosses, professors, institutions. Deferential, rebellious, strategic, anxious, dismissive. This shapes every scene involving a power differential.',
    prompt: 'This character\u2019s boss asks them to do something they think is wrong. Not illegal \u2014 just a bad idea. What do they do?',
    examples: [
      {
        character: 'Hermione Granger (Harry Potter)',
        detail: 'Hermione respects authority as a default \u2014 she loves teachers, follows rules, earns points. But her respect is conditional on the authority being competent. She\u2019ll break rules for a good reason and openly defy an incompetent teacher (Umbridge). Her relationship to authority is nuanced: she trusts the institution but not blindly.',
      },
      {
        character: 'Ferris Bueller (Ferris Bueller\u2019s Day Off)',
        detail: 'Ferris treats authority as an obstacle to route around, not a force to resist. He\u2019s not rebellious \u2014 that would imply taking authority seriously enough to oppose it. He simply operates as if the rules don\u2019t apply to him, and his confidence makes it work. His relationship to authority is absence of a relationship.',
      },
    ],
    guidance: 'In workplace SBAs, relationship to authority drives the most important scenes: disagreeing with a supervisor, receiving critical feedback, navigating competing priorities from different managers. Make this dimension specific to the power dynamics in your scenario.',
  },
  {
    key: 'teamRole',
    name: 'Natural Team Role',
    category: 'relationships',
    type: 'text',
    description: 'What role this character naturally falls into in a group. Leader, mediator, devil\u2019s advocate, quiet executor, idea generator, social glue. Not their assigned role \u2014 their instinctive one.',
    prompt: 'Five people are in a room trying to make a decision. Where does this character sit and what do they do?',
    examples: [
      {
        character: 'Samwise Gamgee (Lord of the Rings)',
        detail: 'Sam\u2019s team role is supporter. Not follower \u2014 supporter. He doesn\u2019t wait for orders; he anticipates needs. He carries the supplies, manages morale, and speaks up when he sees danger. He\u2019ll never lead the group, but the group falls apart without him. His loyalty isn\u2019t passivity; it\u2019s the most active thing in the story.',
      },
      {
        character: 'Tony Stark (Marvel)',
        detail: 'Tony assumes he\u2019s leading, whether or not anyone asked. He talks first, decides fast, and starts building before the plan is finalized. His team role is "the person who\u2019s already three steps ahead and irritated that everyone else is still on step one." It makes him effective and insufferable in roughly equal measure.',
      },
    ],
    guidance: 'Scenario teams should include characters with different natural roles. If everyone\u2019s a leader, you get conflict. If everyone\u2019s a supporter, you get paralysis. The interplay between roles is where realistic team dynamics come from.',
  },
  {
    key: 'keyRelationship',
    name: 'Key Relationships',
    category: 'relationships',
    type: 'relationship',
    description: 'Specific relationships with other named characters. Not just "supervisor" or "friend" \u2014 the dynamic, the history, the tension. Relationships are where characters come alive.',
    prompt: 'Pick the two most important people in this character\u2019s professional life. What would each of them say about this character behind their back?',
    examples: [
      {
        character: 'Woody and Buzz (Toy Story)',
        detail: 'Rivals who become partners. Woody resents Buzz because Buzz threatens his status without even trying. Buzz is oblivious to the rivalry because he doesn\u2019t understand the social system he\u2019s disrupted. The relationship works because both characters are sympathetic \u2014 neither is the villain. Their complementary strengths (loyalty vs. boldness) eventually make them a better team than either alone.',
      },
      {
        character: 'Sherlock and Watson (Sherlock Holmes)',
        detail: 'Not equals. Watson admires Sherlock but isn\u2019t awed \u2014 he sees the loneliness behind the brilliance. Sherlock needs Watson not as an assistant but as a translator: Watson makes Sherlock\u2019s insights legible to normal people. The relationship is symbiotic but asymmetric, and both of them know it.',
      },
    ],
    guidance: 'Define at least one relationship with real texture for each character. "Ty reports to Lianne" is org chart. "Ty respects Lianne\u2019s competence but finds her directness intimidating, and overcompensates by over-preparing for every meeting with her" is a relationship. The second version generates scenes. The first one doesn\u2019t.',
  },

  // ── Narrative ──
  {
    key: 'storyArc',
    name: 'Story Arc',
    category: 'narrative',
    type: 'text',
    description: 'The planned trajectory of this character across the course. Where they start, where they end, and what changes them. This is the load-bearing structure of the character \u2014 get it wrong and the pedagogy suffers.',
    prompt: 'Describe this character on day one of the course and on the last day. What\u2019s different? What specific experience caused the change?',
    examples: [
      {
        character: 'Walter White (Breaking Bad)',
        detail: 'Mild-mannered chemistry teacher to drug kingpin. Walter\u2019s arc is mapped to precise turning points: the diagnosis, the first cook, the first lie to his family, the first murder. Each step is small enough to be plausible and large enough to be irreversible. The audience watches someone become unrecognizable, one reasonable-seeming decision at a time.',
      },
      {
        character: 'Zuko (Avatar: The Last Airbender)',
        detail: 'Angry exile to redeemed hero, but not in a straight line. Zuko\u2019s arc includes backsliding \u2014 he makes the right choice, then unmakes it, then slowly comes back. The non-linearity makes it feel real. His arc isn\u2019t "learns to be good" but "learns what honor actually means when it conflicts with loyalty."',
      },
    ],
    guidance: 'In a semester-long SBA, the character\u2019s arc should parallel the learning arc. If students are learning to think critically about data, the character might move from "trusts numbers blindly" to "understands what numbers can and can\u2019t tell you." Make the arc specific enough to plan scenes around.',
  },
  {
    key: 'definingMoment',
    name: 'Defining Moments',
    category: 'narrative',
    type: 'list',
    description: 'Specific past or planned events that shape who this character is. These are the stories they tell about themselves (or the ones they never tell anyone).',
    prompt: 'What happened to this character that they still think about at 2am?',
    examples: [
      {
        character: 'Carl Fredricksen (Up)',
        detail: 'Ellie\u2019s death. Everything Carl does in the film \u2014 the house, the balloons, the stubbornness, the adventure \u2014 traces back to one loss. A single defining moment generates an entire character. The brilliance of the opening montage is that it gives the audience the defining moment before the story starts, so everything Carl does makes immediate emotional sense.',
      },
      {
        character: 'Neville Longbottom (Harry Potter)',
        detail: 'His parents\u2019 torture. Neville is clumsy, forgetful, seemingly weak \u2014 until you realize he\u2019s been carrying this weight since childhood. His defining moment isn\u2019t a source of rage (like Harry\u2019s); it\u2019s a source of quiet determination. The scene at St. Mungo\u2019s, where he pockets his mother\u2019s candy wrapper, is the most devastating moment in the series precisely because Neville doesn\u2019t make a scene about it.',
      },
    ],
    guidance: 'Every character should have at least one defining moment that the author knows, even if students never learn about it directly. It grounds the character and gives the author a touchstone for "would this character do this?" decisions.',
  },

  // ── Rules ──
  {
    key: 'behavioralRules',
    name: 'Behavioral Rules',
    category: 'rules',
    type: 'list',
    description: 'Things this character will always do, or never do. These are the load-bearing constraints \u2014 violate one and the character breaks. Rules are testable, which makes them particularly valuable for LLM-generated content.',
    prompt: 'Complete these sentences: "This character would never ___." "This character always ___." "If ___ happened, this character would definitely ___."',
    examples: [
      {
        character: 'The Road Runner (Looney Tunes)',
        detail: 'Six rules, generating decades of stories. The Road Runner cannot harm the Coyote except by going "beep-beep." Only the Coyote\u2019s own ineptitude or failed Acme products can hurt him. No dialogue except "beep-beep." The Road Runner stays on the road. The setting is always the Southwest desert. The Coyote is driven by obsession. These rules are absolute \u2014 they\u2019re what makes a Road Runner cartoon a Road Runner cartoon and not just a chase scene.',
      },
      {
        character: 'Atticus Finch (To Kill a Mockingbird)',
        detail: 'Atticus will always treat people with dignity, even people he opposes. He will never use physical force except in genuine defense. He will always explain his reasoning to his children honestly. He will never publicly lose his temper. These rules make his character legible and trustworthy \u2014 readers know what to expect, and the rare moments when a rule is tested (the confrontation with Bob Ewell) carry enormous weight.',
      },
    ],
    guidance: 'Rules are the most useful dimension for consistency checking. "Ty never speaks with authority about organizational politics" is a rule an LLM can check against. "Jacque uses humor to deflect serious questions" is a rule that generates specific dialogue. Keep rules concrete and testable. "Ty is a good person" is not a rule. "Ty always credits his teammates\u2019 work, even when he did most of it" is.',
  },
  {
    key: 'hiddenMotivations',
    name: 'Hidden Motivations',
    category: 'rules',
    type: 'text',
    description: 'What drives this character that they don\u2019t say out loud \u2014 and that students may never learn directly. The author needs to know this; the student sees only the effects.',
    prompt: 'What does this character want that they would never admit in a professional setting?',
    examples: [
      {
        character: 'Severus Snape (Harry Potter)',
        detail: 'Everything Snape does \u2014 the cruelty, the protectiveness, the double-agent role \u2014 traces to an unrequited love he never speaks of. Students of the series spend six books reading him as a villain before discovering the hidden motivation that recontextualizes everything. The gap between what the audience sees (hostility) and what\u2019s really happening (protection) is the engine of his character.',
      },
      {
        character: 'Michael Scott (The Office)',
        detail: 'Michael wants to be loved. Not respected, not obeyed \u2014 loved. Every bizarre management decision, every inappropriate joke, every awkward personal disclosure is an attempt to make his employees his family. He\u2019d never say this, and if confronted he\u2019d deny it. But it explains everything.',
      },
    ],
    guidance: 'In SBA scenarios, hidden motivations create the gap between what a character says and what they actually want. Ty might argue against a particular analysis method not because of the statistics but because Jacque proposed it. The student sees professional disagreement; the author knows it\u2019s personal. That layering makes scenarios feel real.',
  },

  // ── Additional dimensions (briefer, for expansion) ──
  {
    key: 'copingMechanisms',
    name: 'Coping Mechanisms',
    category: 'personality',
    type: 'text',
    description: 'How this character self-soothes. Humor, exercise, isolation, overwork, substances, denial. Often the first thing to surface under pressure.',
    prompt: 'After a terrible day, what does this character do?',
  },
  {
    key: 'decisionMakingStyle',
    name: 'Decision-Making Style',
    category: 'personality',
    type: 'enum',
    options: ['analytical', 'intuitive', 'consultative', 'impulsive', 'avoidant'],
    description: 'Does this character gather data, trust their gut, ask everyone, decide instantly, or avoid deciding?',
    prompt: 'A decision must be made by end of day with incomplete information. How does this character approach it?',
  },
  {
    key: 'moralFramework',
    name: 'Moral Framework',
    category: 'personality',
    type: 'text',
    description: 'Not good/evil \u2014 the lens through which they judge right and wrong. Utilitarian, duty-based, care-based, justice-oriented, pragmatic.',
    prompt: 'Two team members are in conflict. What principle does this character use to decide who\u2019s right?',
  },
  {
    key: 'catchphrases',
    name: 'Catchphrases and Verbal Tics',
    category: 'voice',
    type: 'list',
    description: 'Repeated phrases, filler words, sentence starters. "The data doesn\u2019t lie." "Well, actually..." "Here\u2019s the thing." Small patterns that make dialogue instantly recognizable.',
    prompt: 'What phrase does this character overuse without realizing it?',
  },
  {
    key: 'formality',
    name: 'Formality Level',
    category: 'voice',
    type: 'scale',
    scale: { min: 1, max: 10 },
    description: 'How formally this character speaks in professional settings. 1 is "yo, check this out." 10 is "I would like to draw your attention to the following observation."',
    prompt: 'How does this character start an email to their boss?',
  },
  {
    key: 'conflictStyle',
    name: 'Conflict Style',
    category: 'relationships',
    type: 'enum',
    options: ['confrontational', 'avoidant', 'diplomatic', 'passive-aggressive', 'collaborative'],
    description: 'How this character handles disagreement. Does the same for interpersonal dynamics that speech patterns do for dialogue.',
    prompt: 'A colleague takes credit for this character\u2019s work in a meeting. What happens next?',
  },
  {
    key: 'mentorInfluence',
    name: 'Key Mentor or Influence',
    category: 'relationships',
    type: 'text',
    description: 'A specific person (real or fictional within the scenario) who shaped how this character thinks. Often invoked in internal monologue: "What would Dr. Kim say about this?"',
    prompt: 'Whose voice does this character hear in their head when they\u2019re trying to make a hard decision?',
  },
  {
    key: 'recurringJoke',
    name: 'Running Joke',
    category: 'narrative',
    type: 'text',
    description: 'A repeated motif that accumulates meaning. Can start as comedy and become poignant, or vice versa.',
    prompt: 'What\u2019s the thing about this character that their colleagues would affectionately tease them about at a going-away party?',
  },
  {
    key: 'blindSpots',
    name: 'Blind Spots',
    category: 'narrative',
    type: 'list',
    description: 'What this character doesn\u2019t see about themselves or the world. Blind spots drive both character growth and interesting errors in judgment.',
    prompt: 'What\u2019s the thing everyone else can see about this character that they can\u2019t see about themselves?',
  },
  {
    key: 'culturalTouchstones',
    name: 'Cultural Touchstones',
    category: 'identity',
    type: 'list',
    description: 'Movies they quote, music they listen to, sports teams they follow, foods they cook. The cultural fabric of daily life that signals belonging and creates connection (or distance) between characters.',
    prompt: 'What\u2019s on this character\u2019s phone? What do they put on when they cook dinner?',
  },
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/** Map from dimension key to dimension. */
export const DIMENSIONS_BY_KEY: Record<string, Dimension> = Object.fromEntries(
  DIMENSIONS.map(d => [d.key, d]),
);

/** Dimensions grouped by category, preserving catalog order. */
export const DIMENSIONS_BY_CATEGORY: Record<DimensionCategory, Dimension[]> =
  DIMENSIONS.reduce((acc, d) => {
    (acc[d.category] ??= []).push(d);
    return acc;
  }, {} as Record<DimensionCategory, Dimension[]>);

/** Map from stat preset key to preset. */
export const STAT_PRESETS_BY_KEY: Record<string, StatPreset> = Object.fromEntries(
  STAT_PRESETS.map(p => [p.key, p]),
);
