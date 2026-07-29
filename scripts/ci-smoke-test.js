// ci-smoke-test.js
// A lightweight check for continuous integration (CI). It does NOT call any
// external API — it just proves that:
//   1. The AI-powered agents load without errors.
//   2. With no GEMINI_API_KEY set, they fall back cleanly and still produce
//      a valid script and valid SEO metadata (nothing crashes).
//
// Exits with code 0 if everything is fine, or 1 if any check fails, which is
// what tells GitHub Actions to show a green tick or a red cross.

const { ScriptWriterAgent } = require('../agents/script-writer-agent');
const { SEOOptimizerAgent } = require('../agents/seo-optimizer-agent');

// Tiny fake database so the agents can run on their own.
const fakeDb = {
  saveScript: async () => {},
  getKeywordHistory: async () => [],
  saveSEOData: async () => {}
};

const strategy = {
  topic: 'Indoor Hydroponic Gardening',
  angle: 'Beginner Guide to Hydroponics',
  contentType: 'Explainer',
  targetAudience: 'Beginners',
  keywords: ['hydroponics', 'indoor gardening', 'grow food at home']
};

// Small helper: throw (fail the test) if a condition isn't true.
function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  // Make sure no AI keys are present, so we are truly testing the fallback path.
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;

  console.log('Smoke test: Script Writer (no AI key → templates)...');
  const writer = new ScriptWriterAgent(fakeDb, {});
  await writer.initialize();
  const script = await writer.generateScript(strategy);

  assert(script && typeof script.title === 'string' && script.title.length > 0, 'script.title missing');
  assert(Array.isArray(script.mainContent.sections) && script.mainContent.sections.length > 0, 'script sections missing');
  assert(script.metadata.generatedBy === 'templates', 'expected template fallback for script');

  console.log('Smoke test: SEO Optimizer (no AI key → rule-based)...');
  const seo = new SEOOptimizerAgent(fakeDb, {});
  await seo.initialize();
  const seoData = await seo.optimize(script, strategy);

  assert(typeof seoData.title === 'string' && seoData.title.length <= 100, 'SEO title invalid or too long');
  assert(typeof seoData.description === 'string' && seoData.description.length <= 5000, 'SEO description invalid or too long');
  assert(Array.isArray(seoData.tags) && seoData.tags.length > 0, 'SEO tags missing');
  assert(seoData.tags.join(',').length <= 500, 'SEO tags exceed 500 characters');

  console.log('\n✅ Smoke test passed — agents load and fall back safely.');
}

main().catch(error => {
  console.error('\n❌ Smoke test failed:', error.message);
  process.exit(1);
});
