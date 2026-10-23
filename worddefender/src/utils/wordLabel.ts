import { WordItem } from '../types/game';

const POS_ABBR: Record<string, string> = {
  noun: 'n',
  verb: 'v',
  adjective: 'adj',
  adverb: 'adv',
  pronoun: 'pron',
  preposition: 'prep',
  conjunction: 'conj',
  auxiliary: 'aux',
  particle: 'part',
  determiner: 'det',
  interjection: 'interj',
  phrase: 'phr',
};

/** Nhãn dưới viên gạch: loại từ viết tắt tiếng Anh (n, v, adj, adv...) và nghĩa tiếng Việt, không có phiên âm. */
export const posLabel = (word: WordItem) => (word.partOfSpeech ? POS_ABBR[word.partOfSpeech] ?? word.partOfSpeech : '');
