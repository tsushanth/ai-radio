/**
 * Email addresses and phone numbers in free text a listener submits. A suggestion can become a public topic name, so these are refused.
 * Same rules as the radio's audexa-radio/orchestrator/pii.py.
 */
const EMAIL = /[^\s@]+@[^\s@]+/;
const SPOKEN_EMAIL =
  /[\w.+-]+\s*(?:\(at\)|\[at\]|\bat\b)\s*(?!(?:the|a|an|this|that)\b)[\w-]+(?:\s*(?:\(dot\)|\[dot\]|\bdot\b|\.)\s*[\w-]+)*?\s*(?:\(dot\)|\[dot\]|\bdot\b)\s*(?:com|net|org|edu|gov|io|co|in|uk|au|ca|de|fr|es|app|ai|me)\b/i;
/** Nine digits or more with phone-style separators, so years and ranges ("2024-2025") pass. */
const NUMBER_RUN = /\+?\d(?:[\s().-]{0,2}\d){8,}/;

export const containsContactDetails = (text: string): boolean => [EMAIL, SPOKEN_EMAIL, NUMBER_RUN].some((p) => p.test(text));
