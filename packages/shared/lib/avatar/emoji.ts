// lib/avatar/emoji.ts
//
// Emoji avatar catalog for the CharacterBuilder emoji mode.
// Pure data — no runtime dependencies.
//
// To add more emoji: append entries to EMOJI_AVATARS with an emoji string,
// CLDR short name, category key matching EMOJI_CATEGORIES, and skinTone flag.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmojiOption {
  emoji: string;
  name: string;          // CLDR short name, human-readable
  category: string;      // key into EMOJI_CATEGORIES
  skinTone?: boolean;    // true if this emoji supports skin tone modifiers
}

export interface SkinTone {
  modifier: string;      // Unicode skin tone modifier character (empty for default)
  name: string;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const EMOJI_CATEGORIES = [
  { key: 'people', name: 'People' },
  { key: 'fantasy', name: 'Fantasy' },
  { key: 'occupation', name: 'Occupations' },
  { key: 'animal', name: 'Animals' },
  { key: 'activity', name: 'Activities' },
  { key: 'gesture', name: 'Gestures & Poses' },
  { key: 'face', name: 'Classic Smiley Emoji' },
  // { key: 'hand', name: 'Hand Signs' },
] as const;

// ---------------------------------------------------------------------------
// Skin tone modifiers (Fitzpatrick scale)
// ---------------------------------------------------------------------------

export const SKIN_TONES: SkinTone[] = [
  { modifier: '',         name: 'Default' },
  { modifier: '\u{1F3FB}', name: 'Light' },
  { modifier: '\u{1F3FC}', name: 'Medium-light' },
  { modifier: '\u{1F3FD}', name: 'Medium' },
  { modifier: '\u{1F3FE}', name: 'Medium-dark' },
  { modifier: '\u{1F3FF}', name: 'Dark' },
];

// ---------------------------------------------------------------------------
// Emoji catalog
// ---------------------------------------------------------------------------

export const EMOJI_AVATARS: EmojiOption[] = [
  // -----------------------------------------------------------------------
  // People — all support skin tone
  // -----------------------------------------------------------------------
  { emoji: '👶', name: 'baby',               category: 'people', skinTone: true },
  { emoji: '🧒', name: 'child',              category: 'people', skinTone: true },
  { emoji: '👦', name: 'boy',                category: 'people', skinTone: true },
  { emoji: '👧', name: 'girl',               category: 'people', skinTone: true },
  { emoji: '🧑', name: 'person',             category: 'people', skinTone: true },
  { emoji: '👩', name: 'woman',              category: 'people', skinTone: true },
  { emoji: '👨', name: 'man',                category: 'people', skinTone: true },
  { emoji: '🧓', name: 'older person',       category: 'people', skinTone: true },
  { emoji: '👴', name: 'old man',            category: 'people', skinTone: true },
  { emoji: '👵', name: 'old woman',          category: 'people', skinTone: true },
  { emoji: '🤴', name: 'prince',             category: 'people', skinTone: true },
  { emoji: '👸', name: 'princess',           category: 'people', skinTone: true },
  { emoji: '🫅', name: 'person with crown',  category: 'people', skinTone: true },
  { emoji: '🧔', name: 'person: beard',         category: 'people', skinTone: true },
  { emoji: '👱', name: 'person: blond hair',     category: 'people', skinTone: true },
  { emoji: '🧑\u200D🦰', name: 'person: red hair',    category: 'people', skinTone: true },
  { emoji: '🧑\u200D🦱', name: 'person: curly hair',  category: 'people', skinTone: true },
  { emoji: '🧑\u200D🦳', name: 'person: white hair',  category: 'people', skinTone: true },
  { emoji: '🧑\u200D🦲', name: 'person: bald',        category: 'people', skinTone: true },

  // -----------------------------------------------------------------------
  // Fantasy — some support skin tone, some don't
  // -----------------------------------------------------------------------
  { emoji: '🧙', name: 'mage',              category: 'fantasy', skinTone: true },
  { emoji: '🧝', name: 'elf',               category: 'fantasy', skinTone: true },
  { emoji: '🧛', name: 'vampire',           category: 'fantasy', skinTone: true },
  { emoji: '🧜', name: 'merperson',         category: 'fantasy', skinTone: true },
  { emoji: '🧚', name: 'fairy',             category: 'fantasy', skinTone: true },
  { emoji: '🦸', name: 'superhero',         category: 'fantasy', skinTone: true },
  { emoji: '🦹', name: 'supervillain',      category: 'fantasy', skinTone: true },
  { emoji: '🧞', name: 'genie',             category: 'fantasy' },
  { emoji: '🧟', name: 'zombie',            category: 'fantasy' },
  { emoji: '👻', name: 'ghost',             category: 'fantasy' },
  { emoji: '👽', name: 'alien',             category: 'fantasy' },
  { emoji: '🤖', name: 'robot',             category: 'fantasy' },
  { emoji: '💀', name: 'skull',             category: 'fantasy' },
  { emoji: '👼', name: 'baby angel',        category: 'fantasy', skinTone: true },
  { emoji: '🎅', name: 'Santa Claus',       category: 'fantasy', skinTone: true },
  { emoji: '🤶', name: 'Mrs. Claus',        category: 'fantasy', skinTone: true },
  { emoji: '🧑\u200D🎄', name: 'Mx Claus', category: 'fantasy', skinTone: true },
  { emoji: '🧌', name: 'troll',             category: 'fantasy' },
  { emoji: '👹', name: 'ogre',              category: 'fantasy' },
  { emoji: '👺', name: 'goblin',            category: 'fantasy' },
  { emoji: '👾', name: 'alien monster',      category: 'fantasy' },

  // -----------------------------------------------------------------------
  // Occupations — all support skin tone
  //   ZWJ sequences use 🧑 (gender-neutral person) as the base.
  //   Standalone person-role emoji listed after ZWJ sequences.
  // -----------------------------------------------------------------------

  // ZWJ occupation sequences (🧑 + ZWJ + object)
  { emoji: '🧑\u200D⚕\uFE0F', name: 'health worker',     category: 'occupation', skinTone: true },
  { emoji: '🧑\u200D🎓', name: 'student',                  category: 'occupation', skinTone: true },
  { emoji: '🧑\u200D🏫', name: 'teacher',                  category: 'occupation', skinTone: true },
  { emoji: '🧑\u200D⚖\uFE0F', name: 'judge',              category: 'occupation', skinTone: true },
  { emoji: '🧑\u200D🌾', name: 'farmer',                   category: 'occupation', skinTone: true },
  { emoji: '🧑\u200D🍳', name: 'cook',                     category: 'occupation', skinTone: true },
  { emoji: '🧑\u200D🔧', name: 'mechanic',                 category: 'occupation', skinTone: true },
  { emoji: '🧑\u200D🏭', name: 'factory worker',           category: 'occupation', skinTone: true },
  { emoji: '🧑\u200D💼', name: 'office worker',            category: 'occupation', skinTone: true },
  { emoji: '🧑\u200D🔬', name: 'scientist',                category: 'occupation', skinTone: true },
  { emoji: '🧑\u200D💻', name: 'technologist',             category: 'occupation', skinTone: true },
  { emoji: '🧑\u200D🎤', name: 'singer',                   category: 'occupation', skinTone: true },
  { emoji: '🧑\u200D🎨', name: 'artist',                   category: 'occupation', skinTone: true },
  { emoji: '🧑\u200D✈\uFE0F', name: 'pilot',              category: 'occupation', skinTone: true },
  { emoji: '🧑\u200D🚀', name: 'astronaut',                category: 'occupation', skinTone: true },
  { emoji: '🧑\u200D🚒', name: 'firefighter',              category: 'occupation', skinTone: true },

  // Standalone person-role emoji
  { emoji: '👮', name: 'police officer',                    category: 'occupation', skinTone: true },
  { emoji: '🕵️', name: 'detective',                         category: 'occupation', skinTone: true },
  { emoji: '💂', name: 'guard',                             category: 'occupation', skinTone: true },
  { emoji: '🥷', name: 'ninja',                             category: 'occupation', skinTone: true },
  { emoji: '👷', name: 'construction worker',               category: 'occupation', skinTone: true },
  { emoji: '🤵', name: 'person in tuxedo',                  category: 'occupation', skinTone: true },
  { emoji: '👰', name: 'person with veil',                  category: 'occupation', skinTone: true },

  // Accessibility role sequences
  { emoji: '🧑\u200D🦯', name: 'person with white cane',           category: 'occupation', skinTone: true },
  { emoji: '🧑\u200D🦼', name: 'person in motorized wheelchair',   category: 'occupation', skinTone: true },
  { emoji: '🧑\u200D🦽', name: 'person in manual wheelchair',      category: 'occupation', skinTone: true },
  { emoji: '🧑\u200D🩰', name: 'ballet dancer',                   category: 'occupation', skinTone: true },
  { emoji: '🤰', name: 'pregnant woman',                           category: 'occupation', skinTone: true },
  { emoji: '🫃', name: 'pregnant man',                             category: 'occupation', skinTone: true },
  { emoji: '🫄', name: 'pregnant person',                          category: 'occupation', skinTone: true },
  { emoji: '🧑\u200D🍼', name: 'person feeding baby',             category: 'occupation', skinTone: true },
  { emoji: '🤱', name: 'breast-feeding',                           category: 'occupation', skinTone: true },
  { emoji: '🕴\uFE0F', name: 'person in suit levitating',         category: 'occupation', skinTone: true },

  // -----------------------------------------------------------------------
  // Animals — none support skin tone
  // -----------------------------------------------------------------------

  // Mammals
  { emoji: '🐶', name: 'dog face',                 category: 'animal' },
  { emoji: '🐕', name: 'dog',                      category: 'animal' },
  { emoji: '🦮', name: 'guide dog',                category: 'animal' },
  { emoji: '🐕\u200D🦺', name: 'service dog',     category: 'animal' },
  { emoji: '🐩', name: 'poodle',                   category: 'animal' },
  { emoji: '🐺', name: 'wolf',                     category: 'animal' },
  { emoji: '🦊', name: 'fox',                      category: 'animal' },
  { emoji: '🦝', name: 'raccoon',                  category: 'animal' },
  { emoji: '🐱', name: 'cat face',                 category: 'animal' },
  { emoji: '🐈', name: 'cat',                      category: 'animal' },
  { emoji: '🐈\u200D⬛', name: 'black cat',        category: 'animal' },
  { emoji: '🦁', name: 'lion',                     category: 'animal' },
  { emoji: '🐯', name: 'tiger face',               category: 'animal' },
  { emoji: '🐅', name: 'tiger',                    category: 'animal' },
  { emoji: '🐆', name: 'leopard',                  category: 'animal' },
  { emoji: '🐴', name: 'horse face',               category: 'animal' },
  { emoji: '🐎', name: 'horse',                    category: 'animal' },
  { emoji: '🦄', name: 'unicorn',                  category: 'animal' },
  { emoji: '🦓', name: 'zebra',                    category: 'animal' },
  { emoji: '🫏', name: 'donkey',                   category: 'animal' },
  { emoji: '🦌', name: 'deer',                     category: 'animal' },
  { emoji: '🫎', name: 'moose',                    category: 'animal' },
  { emoji: '🦬', name: 'bison',                    category: 'animal' },
  { emoji: '🐮', name: 'cow face',                 category: 'animal' },
  { emoji: '🐂', name: 'ox',                       category: 'animal' },
  { emoji: '🐃', name: 'water buffalo',            category: 'animal' },
  { emoji: '🐄', name: 'cow',                      category: 'animal' },
  { emoji: '🐷', name: 'pig face',                 category: 'animal' },
  { emoji: '🐖', name: 'pig',                      category: 'animal' },
  { emoji: '🐗', name: 'boar',                     category: 'animal' },
  { emoji: '🐽', name: 'pig nose',                 category: 'animal' },
  { emoji: '🐏', name: 'ram',                      category: 'animal' },
  { emoji: '🐑', name: 'ewe',                      category: 'animal' },
  { emoji: '🐐', name: 'goat',                     category: 'animal' },
  { emoji: '🐪', name: 'camel',                    category: 'animal' },
  { emoji: '🐫', name: 'two-hump camel',           category: 'animal' },
  { emoji: '🦙', name: 'llama',                    category: 'animal' },
  { emoji: '🦒', name: 'giraffe',                  category: 'animal' },
  { emoji: '🐘', name: 'elephant',                 category: 'animal' },
  { emoji: '🦣', name: 'mammoth',                  category: 'animal' },
  { emoji: '🦏', name: 'rhinoceros',               category: 'animal' },
  { emoji: '🦛', name: 'hippopotamus',             category: 'animal' },
  { emoji: '🐭', name: 'mouse face',               category: 'animal' },
  { emoji: '🐁', name: 'mouse',                    category: 'animal' },
  { emoji: '🐀', name: 'rat',                      category: 'animal' },
  { emoji: '🐹', name: 'hamster',                  category: 'animal' },
  { emoji: '🐰', name: 'rabbit face',              category: 'animal' },
  { emoji: '🐇', name: 'rabbit',                   category: 'animal' },
  { emoji: '🐿️', name: 'chipmunk',                 category: 'animal' },
  { emoji: '🦫', name: 'beaver',                   category: 'animal' },
  { emoji: '🦔', name: 'hedgehog',                 category: 'animal' },
  { emoji: '🦇', name: 'bat',                      category: 'animal' },
  { emoji: '🐻', name: 'bear',                     category: 'animal' },
  { emoji: '🐻\u200D❄\uFE0F', name: 'polar bear', category: 'animal' },
  { emoji: '🐨', name: 'koala',                    category: 'animal' },
  { emoji: '🐼', name: 'panda',                    category: 'animal' },
  { emoji: '🦥', name: 'sloth',                    category: 'animal' },
  { emoji: '🦦', name: 'otter',                    category: 'animal' },
  { emoji: '🦨', name: 'skunk',                    category: 'animal' },
  { emoji: '🦘', name: 'kangaroo',                 category: 'animal' },
  { emoji: '🦡', name: 'badger',                   category: 'animal' },
  { emoji: '🐵', name: 'monkey face',              category: 'animal' },
  { emoji: '🐒', name: 'monkey',                   category: 'animal' },
  { emoji: '🦍', name: 'gorilla',                  category: 'animal' },
  { emoji: '🦧', name: 'orangutan',                category: 'animal' },

  // Birds
  { emoji: '🐔', name: 'chicken',                  category: 'animal' },
  { emoji: '🐓', name: 'rooster',                  category: 'animal' },
  { emoji: '🐣', name: 'hatching chick',           category: 'animal' },
  { emoji: '🐤', name: 'baby chick',               category: 'animal' },
  { emoji: '🐥', name: 'front-facing baby chick',  category: 'animal' },
  { emoji: '🐦', name: 'bird',                     category: 'animal' },
  { emoji: '🐧', name: 'penguin',                  category: 'animal' },
  { emoji: '🕊️', name: 'dove',                     category: 'animal' },
  { emoji: '🦅', name: 'eagle',                    category: 'animal' },
  { emoji: '🦆', name: 'duck',                     category: 'animal' },
  { emoji: '🦢', name: 'swan',                     category: 'animal' },
  { emoji: '🦉', name: 'owl',                      category: 'animal' },
  { emoji: '🦤', name: 'dodo',                     category: 'animal' },
  { emoji: '🪶', name: 'feather',                  category: 'animal' },
  { emoji: '🦩', name: 'flamingo',                 category: 'animal' },
  { emoji: '🦚', name: 'peacock',                  category: 'animal' },
  { emoji: '🦜', name: 'parrot',                   category: 'animal' },
  { emoji: '🪽', name: 'wing',                     category: 'animal' },
  { emoji: '🐦\u200D⬛', name: 'black bird',       category: 'animal' },
  { emoji: '🪿', name: 'goose',                    category: 'animal' },

  // Sea creatures
  { emoji: '🐳', name: 'spouting whale',           category: 'animal' },
  { emoji: '🐋', name: 'whale',                    category: 'animal' },
  { emoji: '🐬', name: 'dolphin',                  category: 'animal' },
  { emoji: '🦭', name: 'seal',                     category: 'animal' },
  { emoji: '🐟', name: 'fish',                     category: 'animal' },
  { emoji: '🐠', name: 'tropical fish',            category: 'animal' },
  { emoji: '🐡', name: 'blowfish',                 category: 'animal' },
  { emoji: '🦈', name: 'shark',                    category: 'animal' },
  { emoji: '🐙', name: 'octopus',                  category: 'animal' },
  { emoji: '🐚', name: 'spiral shell',             category: 'animal' },
  { emoji: '🪸', name: 'coral',                    category: 'animal' },
  { emoji: '🪼', name: 'jellyfish',                category: 'animal' },
  { emoji: '🦑', name: 'squid',                    category: 'animal' },
  { emoji: '🦞', name: 'lobster',                  category: 'animal' },
  { emoji: '🦀', name: 'crab',                     category: 'animal' },
  { emoji: '🦐', name: 'shrimp',                   category: 'animal' },

  // Reptiles & amphibians
  { emoji: '🐸', name: 'frog',                     category: 'animal' },
  { emoji: '🐊', name: 'crocodile',                category: 'animal' },
  { emoji: '🐢', name: 'turtle',                   category: 'animal' },
  { emoji: '🦎', name: 'lizard',                   category: 'animal' },
  { emoji: '🐍', name: 'snake',                    category: 'animal' },
  { emoji: '🐉', name: 'dragon',                   category: 'animal' },
  { emoji: '🐲', name: 'dragon face',              category: 'animal' },
  { emoji: '🦕', name: 'sauropod',                 category: 'animal' },
  { emoji: '🦖', name: 'T-Rex',                    category: 'animal' },

  // Bugs & insects
  { emoji: '🦋', name: 'butterfly',                category: 'animal' },
  { emoji: '🐛', name: 'bug',                      category: 'animal' },
  { emoji: '🐜', name: 'ant',                      category: 'animal' },
  { emoji: '🐝', name: 'honeybee',                 category: 'animal' },
  { emoji: '🪲', name: 'beetle',                   category: 'animal' },
  { emoji: '🐞', name: 'lady beetle',              category: 'animal' },
  { emoji: '🦗', name: 'cricket',                  category: 'animal' },
  { emoji: '🪳', name: 'cockroach',                category: 'animal' },
  { emoji: '🕷️', name: 'spider',                   category: 'animal' },
  { emoji: '🦂', name: 'scorpion',                 category: 'animal' },
  { emoji: '🐌', name: 'snail',                    category: 'animal' },
  { emoji: '🪱', name: 'worm',                     category: 'animal' },
  { emoji: '🕸\uFE0F', name: 'spider web',         category: 'animal' },
  { emoji: '🦟', name: 'mosquito',                  category: 'animal' },
  { emoji: '🪰', name: 'fly',                       category: 'animal' },
  { emoji: '🦠', name: 'microbe',                   category: 'animal' },

  // Other
  { emoji: '🐾', name: 'paw prints',               category: 'animal' },
  { emoji: '🦃', name: 'turkey',                    category: 'animal' },
  { emoji: '🐦\u200D🔥', name: 'phoenix',          category: 'animal' },
  { emoji: '🦪', name: 'oyster',                    category: 'animal' },

  // -----------------------------------------------------------------------
  // Activities — people doing sports/activities, all support skin tone
  // -----------------------------------------------------------------------
  { emoji: '🏇', name: 'horse racing',                              category: 'activity', skinTone: true },
  { emoji: '⛷️', name: 'skier',                                     category: 'activity' },
  { emoji: '🏂', name: 'snowboarder',                               category: 'activity', skinTone: true },
  { emoji: '🏋️', name: 'person lifting weights',                    category: 'activity', skinTone: true },
  { emoji: '🤸', name: 'person cartwheeling',                       category: 'activity', skinTone: true },
  { emoji: '🤼', name: 'people wrestling',                          category: 'activity' },
  { emoji: '🤽', name: 'person playing water polo',                 category: 'activity', skinTone: true },
  { emoji: '🤾', name: 'person playing handball',                   category: 'activity', skinTone: true },
  { emoji: '🤺', name: 'person fencing',                            category: 'activity' },
  { emoji: '⛹️', name: 'person bouncing ball',                      category: 'activity', skinTone: true },
  { emoji: '🧗', name: 'person climbing',                           category: 'activity', skinTone: true },
  { emoji: '🚴', name: 'person biking',                             category: 'activity', skinTone: true },
  { emoji: '🚵', name: 'person mountain biking',                    category: 'activity', skinTone: true },
  { emoji: '🏊', name: 'person swimming',                           category: 'activity', skinTone: true },
  { emoji: '🏄', name: 'person surfing',                            category: 'activity', skinTone: true },
  { emoji: '🤹', name: 'person juggling',                           category: 'activity', skinTone: true },
  { emoji: '🕺', name: 'man dancing',                               category: 'activity', skinTone: true },
  { emoji: '💃', name: 'woman dancing',                              category: 'activity', skinTone: true },
  { emoji: '🧘', name: 'person in lotus position',                  category: 'activity', skinTone: true },
  { emoji: '🏌️', name: 'person golfing',                            category: 'activity', skinTone: true },
  { emoji: '🏎️', name: 'racing car',                                category: 'activity' },
  { emoji: '🚣', name: 'person rowing boat',                        category: 'activity', skinTone: true },
  { emoji: '🧖', name: 'person in steamy room',                     category: 'activity', skinTone: true },
  { emoji: '👯', name: 'people with bunny ears',                    category: 'activity' },
  { emoji: '🛌', name: 'person in bed',                             category: 'activity', skinTone: true },

  // -----------------------------------------------------------------------
  // Gestures & Poses — people making gestures or in poses
  // -----------------------------------------------------------------------
  { emoji: '🧏', name: 'deaf person',                               category: 'gesture', skinTone: true },
  { emoji: '🙋', name: 'person raising hand',                       category: 'gesture', skinTone: true },
  { emoji: '🤷', name: 'person shrugging',                          category: 'gesture', skinTone: true },
  { emoji: '💁', name: 'person tipping hand',                       category: 'gesture', skinTone: true },
  { emoji: '🙇', name: 'person bowing',                             category: 'gesture', skinTone: true },
  { emoji: '🧎', name: 'person kneeling',                           category: 'gesture', skinTone: true },
  { emoji: '🧍', name: 'person standing',                           category: 'gesture', skinTone: true },
  { emoji: '🚶', name: 'person walking',                            category: 'gesture', skinTone: true },
  { emoji: '🏃', name: 'person running',                            category: 'gesture', skinTone: true },
  { emoji: '💆', name: 'person getting massage',                    category: 'gesture', skinTone: true },
  { emoji: '💇', name: 'person getting haircut',                    category: 'gesture', skinTone: true },
  { emoji: '🛀', name: 'person taking bath',                        category: 'gesture', skinTone: true },
  { emoji: '🙅', name: 'person gesturing NO',                       category: 'gesture', skinTone: true },
  { emoji: '🙆', name: 'person gesturing OK',                       category: 'gesture', skinTone: true },
  { emoji: '🤦', name: 'person facepalming',                        category: 'gesture', skinTone: true },
  { emoji: '🙍', name: 'person frowning',                           category: 'gesture', skinTone: true },
  { emoji: '🙎', name: 'person pouting',                            category: 'gesture', skinTone: true },
  { emoji: '👳', name: 'person wearing turban',                     category: 'gesture', skinTone: true },
  { emoji: '🧕', name: 'woman with headscarf',                      category: 'gesture', skinTone: true },
  { emoji: '👲', name: 'person with skullcap',                      category: 'gesture', skinTone: true },
  { emoji: '🫂', name: 'people hugging',                            category: 'gesture' },
  { emoji: '🙈', name: 'see-no-evil monkey',                        category: 'gesture' },
  { emoji: '🙉', name: 'hear-no-evil monkey',                       category: 'gesture' },
  { emoji: '🙊', name: 'speak-no-evil monkey',                      category: 'gesture' },

  // -----------------------------------------------------------------------
  // Faces & Expressions — smiley/emotion faces useful as character avatars
  // -----------------------------------------------------------------------
  { emoji: '😀', name: 'grinning face',                             category: 'face' },
  { emoji: '😃', name: 'grinning face with big eyes',               category: 'face' },
  { emoji: '😄', name: 'grinning face with smiling eyes',           category: 'face' },
  { emoji: '😁', name: 'beaming face with smiling eyes',            category: 'face' },
  { emoji: '😎', name: 'smiling face with sunglasses',              category: 'face' },
  { emoji: '🤓', name: 'nerd face',                                 category: 'face' },
  { emoji: '🧐', name: 'face with monocle',                         category: 'face' },
  { emoji: '🥸', name: 'disguised face',                            category: 'face' },
  { emoji: '🤠', name: 'cowboy hat face',                           category: 'face' },
  { emoji: '🥶', name: 'cold face',                                 category: 'face' },
  { emoji: '🥵', name: 'hot face',                                  category: 'face' },
  { emoji: '😈', name: 'smiling face with horns',                   category: 'face' },
  { emoji: '👿', name: 'angry face with horns',                     category: 'face' },
  { emoji: '🤡', name: 'clown face',                                category: 'face' },
  { emoji: '🎃', name: 'jack-o-lantern',                            category: 'face' },
  { emoji: '🫠', name: 'melting face',                              category: 'face' },
  { emoji: '🤑', name: 'money-mouth face',                          category: 'face' },
  { emoji: '🤫', name: 'shushing face',                             category: 'face' },
  { emoji: '🫡', name: 'saluting face',                             category: 'face' },
  { emoji: '🤔', name: 'thinking face',                             category: 'face' },
  { emoji: '🫣', name: 'face with peeking eye',                     category: 'face' },
  { emoji: '😏', name: 'smirking face',                             category: 'face' },
  { emoji: '🥺', name: 'pleading face',                             category: 'face' },
  { emoji: '🤥', name: 'lying face',                                category: 'face' },
  { emoji: '😶\u200D🌫\uFE0F', name: 'face in clouds',             category: 'face' },

  // Face — Smiling
  { emoji: '😆', name: 'grinning squinting face',                  category: 'face' },
  { emoji: '😅', name: 'grinning face with sweat',                 category: 'face' },
  { emoji: '🤣', name: 'rolling on the floor laughing',            category: 'face' },
  { emoji: '😂', name: 'face with tears of joy',                   category: 'face' },
  { emoji: '🙂', name: 'slightly smiling face',                    category: 'face' },
  { emoji: '🙃', name: 'upside-down face',                         category: 'face' },
  { emoji: '😉', name: 'winking face',                             category: 'face' },
  { emoji: '😊', name: 'smiling face with smiling eyes',           category: 'face' },
  { emoji: '😇', name: 'smiling face with halo',                   category: 'face' },

  // Face — Affection
  { emoji: '🥰', name: 'smiling face with hearts',                 category: 'face' },
  { emoji: '😍', name: 'smiling face with heart-eyes',             category: 'face' },
  { emoji: '🤩', name: 'star-struck',                              category: 'face' },
  { emoji: '😘', name: 'face blowing a kiss',                      category: 'face' },
  { emoji: '😗', name: 'kissing face',                             category: 'face' },
  { emoji: '☺\uFE0F', name: 'smiling face',                       category: 'face' },
  { emoji: '😚', name: 'kissing face with closed eyes',            category: 'face' },
  { emoji: '😙', name: 'kissing face with smiling eyes',           category: 'face' },
  { emoji: '🥲', name: 'smiling face with tear',                   category: 'face' },

  // Face — Tongue
  { emoji: '😋', name: 'face savoring food',                       category: 'face' },
  { emoji: '😛', name: 'face with tongue',                         category: 'face' },
  { emoji: '😜', name: 'winking face with tongue',                 category: 'face' },
  { emoji: '🤪', name: 'zany face',                                category: 'face' },
  { emoji: '😝', name: 'squinting face with tongue',               category: 'face' },

  // Face — Hand
  { emoji: '🤗', name: 'smiling face with open hands',             category: 'face' },
  { emoji: '🤭', name: 'face with hand over mouth',                category: 'face' },
  { emoji: '🫢', name: 'face with open eyes and hand over mouth',  category: 'face' },

  // Face — Neutral/Skeptical
  { emoji: '🤐', name: 'zipper-mouth face',                        category: 'face' },
  { emoji: '🤨', name: 'face with raised eyebrow',                 category: 'face' },
  { emoji: '😐', name: 'neutral face',                             category: 'face' },
  { emoji: '😑', name: 'expressionless face',                      category: 'face' },
  { emoji: '😶', name: 'face without mouth',                       category: 'face' },
  { emoji: '🫥', name: 'dotted line face',                         category: 'face' },
  { emoji: '😒', name: 'unamused face',                            category: 'face' },
  { emoji: '🙄', name: 'face with rolling eyes',                   category: 'face' },
  { emoji: '😬', name: 'grimacing face',                           category: 'face' },
  { emoji: '😮\u200D💨', name: 'face exhaling',                    category: 'face' },
  { emoji: '🫨', name: 'shaking face',                             category: 'face' },

  // Face — Sleepy
  { emoji: '😌', name: 'relieved face',                            category: 'face' },
  { emoji: '😔', name: 'pensive face',                             category: 'face' },
  { emoji: '😪', name: 'sleepy face',                              category: 'face' },
  { emoji: '🤤', name: 'drooling face',                            category: 'face' },
  { emoji: '😴', name: 'sleeping face',                            category: 'face' },

  // Face — Unwell
  { emoji: '😷', name: 'face with medical mask',                   category: 'face' },
  { emoji: '🤒', name: 'face with thermometer',                    category: 'face' },
  { emoji: '🤕', name: 'face with head-bandage',                   category: 'face' },
  { emoji: '🤢', name: 'nauseated face',                           category: 'face' },
  { emoji: '🤮', name: 'face vomiting',                            category: 'face' },
  { emoji: '🤧', name: 'sneezing face',                            category: 'face' },
  { emoji: '🥴', name: 'woozy face',                               category: 'face' },
  { emoji: '😵', name: 'face with crossed-out eyes',               category: 'face' },
  { emoji: '😵\u200D💫', name: 'face with spiral eyes',            category: 'face' },
  { emoji: '🤯', name: 'exploding head',                           category: 'face' },

  // Face — Concerned
  { emoji: '😕', name: 'confused face',                            category: 'face' },
  { emoji: '🫤', name: 'face with diagonal mouth',                 category: 'face' },
  { emoji: '😟', name: 'worried face',                             category: 'face' },
  { emoji: '🙁', name: 'slightly frowning face',                   category: 'face' },
  { emoji: '☹\uFE0F', name: 'frowning face',                      category: 'face' },
  { emoji: '😮', name: 'face with open mouth',                     category: 'face' },
  { emoji: '😯', name: 'hushed face',                              category: 'face' },
  { emoji: '😲', name: 'astonished face',                          category: 'face' },
  { emoji: '😳', name: 'flushed face',                             category: 'face' },
  { emoji: '🥹', name: 'face holding back tears',                  category: 'face' },
  { emoji: '😦', name: 'frowning face with open mouth',            category: 'face' },
  { emoji: '😧', name: 'anguished face',                           category: 'face' },
  { emoji: '😨', name: 'fearful face',                             category: 'face' },
  { emoji: '😰', name: 'anxious face with sweat',                  category: 'face' },
  { emoji: '😥', name: 'sad but relieved face',                    category: 'face' },
  { emoji: '😢', name: 'crying face',                              category: 'face' },
  { emoji: '😭', name: 'loudly crying face',                       category: 'face' },
  { emoji: '😱', name: 'face screaming in fear',                   category: 'face' },
  { emoji: '😖', name: 'confounded face',                          category: 'face' },
  { emoji: '😣', name: 'persevering face',                         category: 'face' },
  { emoji: '😞', name: 'disappointed face',                        category: 'face' },
  { emoji: '😓', name: 'downcast face with sweat',                 category: 'face' },
  { emoji: '😩', name: 'weary face',                               category: 'face' },
  { emoji: '😫', name: 'tired face',                               category: 'face' },
  { emoji: '🥱', name: 'yawning face',                             category: 'face' },

  // Face — Negative
  { emoji: '😤', name: 'face with steam from nose',                category: 'face' },
  { emoji: '😡', name: 'pouting face',                             category: 'face' },
  { emoji: '😠', name: 'angry face',                               category: 'face' },
  { emoji: '🤬', name: 'face with symbols on mouth',               category: 'face' },

  // Face — Costume
  { emoji: '💩', name: 'pile of poo',                              category: 'face' },

  // Cat faces
  { emoji: '😺', name: 'grinning cat',                              category: 'face' },
  { emoji: '😸', name: 'grinning cat with smiling eyes',            category: 'face' },
  { emoji: '😹', name: 'cat with tears of joy',                     category: 'face' },
  { emoji: '😻', name: 'smiling cat with heart-eyes',               category: 'face' },
  { emoji: '😼', name: 'cat with wry smile',                        category: 'face' },
  { emoji: '😽', name: 'kissing cat',                               category: 'face' },
  { emoji: '🙀', name: 'weary cat',                                 category: 'face' },
  { emoji: '😿', name: 'crying cat',                                category: 'face' },
  { emoji: '😾', name: 'pouting cat',                               category: 'face' },

  // -----------------------------------------------------------------------
  // Hand Signs — finger/hand emoji, most support skin tone
  // -----------------------------------------------------------------------
  { emoji: '👋', name: 'waving hand',                              category: 'hand', skinTone: true },
  { emoji: '🤚', name: 'raised back of hand',                      category: 'hand', skinTone: true },
  { emoji: '🖐\uFE0F', name: 'hand with fingers splayed',         category: 'hand', skinTone: true },
  { emoji: '✋', name: 'raised hand',                              category: 'hand', skinTone: true },
  { emoji: '🖖', name: 'vulcan salute',                            category: 'hand', skinTone: true },
  { emoji: '👌', name: 'OK hand',                                  category: 'hand', skinTone: true },
  { emoji: '🤌', name: 'pinched fingers',                          category: 'hand', skinTone: true },
  { emoji: '🤏', name: 'pinching hand',                            category: 'hand', skinTone: true },
  { emoji: '✌\uFE0F', name: 'victory hand',                       category: 'hand', skinTone: true },
  { emoji: '🤞', name: 'crossed fingers',                          category: 'hand', skinTone: true },
  { emoji: '🫰', name: 'hand with index finger and thumb crossed', category: 'hand', skinTone: true },
  { emoji: '🤟', name: 'love-you gesture',                         category: 'hand', skinTone: true },
  { emoji: '🤘', name: 'sign of the horns',                        category: 'hand', skinTone: true },
  { emoji: '🤙', name: 'call me hand',                             category: 'hand', skinTone: true },
  { emoji: '👈', name: 'backhand index pointing left',             category: 'hand', skinTone: true },
  { emoji: '👉', name: 'backhand index pointing right',            category: 'hand', skinTone: true },
  { emoji: '👆', name: 'backhand index pointing up',               category: 'hand', skinTone: true },
  { emoji: '👇', name: 'backhand index pointing down',             category: 'hand', skinTone: true },
  { emoji: '☝\uFE0F', name: 'index pointing up',                  category: 'hand', skinTone: true },
  { emoji: '🫵', name: 'index pointing at the viewer',             category: 'hand', skinTone: true },
  { emoji: '👍', name: 'thumbs up',                                category: 'hand', skinTone: true },
  { emoji: '👎', name: 'thumbs down',                              category: 'hand', skinTone: true },
  { emoji: '✊', name: 'raised fist',                              category: 'hand', skinTone: true },
  { emoji: '👊', name: 'oncoming fist',                            category: 'hand', skinTone: true },
  { emoji: '🤛', name: 'left-facing fist',                         category: 'hand', skinTone: true },
  { emoji: '🤜', name: 'right-facing fist',                        category: 'hand', skinTone: true },
  { emoji: '👏', name: 'clapping hands',                           category: 'hand', skinTone: true },
  { emoji: '🙌', name: 'raising hands',                            category: 'hand', skinTone: true },
  { emoji: '🫶', name: 'heart hands',                              category: 'hand', skinTone: true },
  { emoji: '👐', name: 'open hands',                               category: 'hand', skinTone: true },
  { emoji: '🤲', name: 'palms up together',                        category: 'hand', skinTone: true },
  { emoji: '🙏', name: 'folded hands',                             category: 'hand', skinTone: true },
  { emoji: '💪', name: 'flexed biceps',                            category: 'hand', skinTone: true },
  { emoji: '✍\uFE0F', name: 'writing hand',                       category: 'hand', skinTone: true },
  { emoji: '💅', name: 'nail polish',                              category: 'hand', skinTone: true },
  { emoji: '🤳', name: 'selfie',                                   category: 'hand', skinTone: true },
  { emoji: '🤝', name: 'handshake',                                category: 'hand' },
  { emoji: '🫷', name: 'leftwards pushing hand',                   category: 'hand', skinTone: true },
  { emoji: '🫸', name: 'rightwards pushing hand',                  category: 'hand', skinTone: true },
  { emoji: '🫱', name: 'rightwards hand',                          category: 'hand', skinTone: true },
  { emoji: '🫲', name: 'leftwards hand',                           category: 'hand', skinTone: true },
  { emoji: '🫳', name: 'palm down hand',                           category: 'hand', skinTone: true },
  { emoji: '🫴', name: 'palm up hand',                             category: 'hand', skinTone: true },
  { emoji: '🖕', name: 'middle finger',                            category: 'hand', skinTone: true },
];

/** Apply a skin tone modifier to an emoji (only works on human emoji). */
export function applySkinTone(emoji: string, modifier: string): string {
  if (!modifier) return emoji;
  // Strip any existing skin tone modifier before applying new one
  const stripped = emoji.replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '');
  // Insert modifier after the first code point (the base person emoji)
  const codePoints = [...stripped];
  if (codePoints.length === 0) return emoji;
  return codePoints[0] + modifier + codePoints.slice(1).join('');
}
