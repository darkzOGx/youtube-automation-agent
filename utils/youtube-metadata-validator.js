const MAX_TITLE_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_TAGS_LENGTH = 450;

function removeControlCharacters(value, replacement = '') {
  return Array.from(String(value ?? '')).map(character => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127 ? replacement : character;
  }).join('');
}

function cleanText(value) {
  return removeControlCharacters(value, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeTags(input) {
  const values = Array.isArray(input) ? input : String(input || '').split(',');
  const unique = [];
  const seen = new Set();
  let totalLength = 0;

  for (const value of values) {
    const tag = cleanText(value).replace(/^#+/, '').replaceAll('"', '').slice(0, 100).trim();
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    const nextLength = totalLength + tag.length + (unique.length ? 1 : 0);
    if (nextLength > MAX_TAGS_LENGTH || unique.length >= 30) break;
    unique.push(tag);
    seen.add(key);
    totalLength = nextLength;
  }

  return unique;
}

function normalizeYouTubeMetadata(metadata = {}) {
  const snippet = metadata.snippet || metadata.seo || metadata;
  return {
    title: cleanText(snippet.title).slice(0, MAX_TITLE_LENGTH),
    description: removeControlCharacters(snippet.description).slice(0, MAX_DESCRIPTION_LENGTH).trim(),
    tags: normalizeTags(snippet.tags),
    categoryId: String(snippet.categoryId ?? snippet.metadata?.category ?? '22').trim(),
    defaultLanguage: String(snippet.defaultLanguage ?? snippet.metadata?.language ?? 'en').trim(),
    defaultAudioLanguage: String(snippet.defaultAudioLanguage ?? snippet.metadata?.language ?? 'en').trim()
  };
}

function validateYouTubeMetadata(metadata = {}) {
  const value = normalizeYouTubeMetadata(metadata);
  const errors = [];
  const warnings = [];

  if (!value.title) errors.push('A video title is required.');
  if (value.title.length > MAX_TITLE_LENGTH) errors.push(`Title exceeds ${MAX_TITLE_LENGTH} characters.`);
  if (!value.description) warnings.push('The video description is empty.');
  if (value.description.length > MAX_DESCRIPTION_LENGTH) errors.push(`Description exceeds ${MAX_DESCRIPTION_LENGTH} characters.`);
  if (!/^\d{1,3}$/.test(value.categoryId)) errors.push('YouTube category must be a numeric category ID.');
  if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value.defaultLanguage)) errors.push('Default language must be a valid language code.');
  if (value.tags.length < 3) warnings.push('Fewer than three usable tags remain after validation.');

  return { valid: errors.length === 0, errors, warnings, value };
}

function assertValidYouTubeMetadata(metadata = {}) {
  const result = validateYouTubeMetadata(metadata);
  if (!result.valid) {
    const error = new Error(`YouTube metadata is invalid: ${result.errors.join(' ')}`);
    error.code = 'INVALID_YOUTUBE_METADATA';
    error.validation = result;
    throw error;
  }
  return result;
}

module.exports = {
  MAX_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_TAGS_LENGTH,
  normalizeTags,
  normalizeYouTubeMetadata,
  validateYouTubeMetadata,
  assertValidYouTubeMetadata
};
