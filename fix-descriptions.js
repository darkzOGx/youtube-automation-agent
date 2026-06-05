const { Database } = require('./database/db');
const { CredentialManager } = require('./utils/credential-manager');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function fixDescriptions() {
  console.log('Starting LLM-powered description cleanup process (Retry)...');
  const db = new Database();
  await db.initialize();
  
  const credentialManager = new CredentialManager();
  await credentialManager.initialize();
  
  const rawCredentials = credentialManager.credentials;
  const geminiKey = rawCredentials?.gemini?.apiKey || process.env.GEMINI_API_KEY;
  
  if (!geminiKey) {
    console.error('No Gemini API key found. Cannot run LLM-powered cleanup.');
    return;
  }
  
  const genAI = new GoogleGenerativeAI(geminiKey);
  const gemini = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: 'You are a YouTube SEO specialist for Indonesian children\'s storytelling channels.'
  });
  
  // Get all scheduled items
  const scheduledItems = await db.getAllRows(`SELECT * FROM publish_schedule WHERE status = 'scheduled'`);
  console.log(`Found ${scheduledItems.length} scheduled items.`);
  
  for (const item of scheduledItems) {
    try {
      // ONLY process the one that failed
      if (item.title !== 'Si Ciko Kucing dan Tiko Tikus: Sahabat Pemberani') {
        continue;
      }
      
      const metadata = JSON.parse(item.metadata || '{}');
      
      if (!metadata.seo || !metadata.seo.description) {
        console.log(`Item ${item.title} has no SEO metadata description, skipping.`);
        continue;
      }
      
      let desc = metadata.seo.description;
      
      // Extract Topic if possible
      let topicMatch = desc.match(/kisah (?:manis )?tentang (.*?)!/);
      let topic = topicMatch ? topicMatch[1] : item.title;
      
      console.log(`\nProcessing: ${item.title} (Topic: ${topic})`);
      
      const prompt = `
Generate a YouTube description in Bahasa Indonesia.

Requirements:
- Target audience: parents with children aged 2-8 years.
- Tone: warm, educational, family-friendly.
- Length: 250-500 words.
- First 2 sentences must contain the most important search keywords naturally.
- Focus on search intent from Indonesian parents.

Important keywords that may be used naturally:
- dongeng anak
- cerita anak Indonesia
- dongeng sebelum tidur
- cerita moral anak
- animasi anak
- video edukasi anak
- cerita pengantar tidur
- dongeng bahasa Indonesia

Do NOT keyword stuff.
Do NOT sound robotic.
Do NOT repeat the title excessively.

Output format:
1. SEO opening paragraph
2. What children will learn
3. Moral lesson
4. Timestamp section (extract from old description below)
5. Soft subscribe CTA
6. Relevant hashtags

Story title:
${item.title}

Story topic:
${topic}

Story summary (extract context from here if needed):
${desc}
`;
      
      // Add retry logic
      let result;
      let retries = 3;
      while (retries > 0) {
        try {
          result = await gemini.generateContent(prompt);
          break;
        } catch (e) {
          if (e.status === 503 && retries > 1) {
            console.log('503 received, waiting 5 seconds before retry...');
            await new Promise(r => setTimeout(r, 5000));
            retries--;
          } else {
            throw e;
          }
        }
      }
      
      let newDesc = result.response.text();
      
      // Cleanup markdown code blocks if present
      newDesc = newDesc.replace(/^```[a-z]*\n/gm, '').replace(/```$/gm, '').trim();
      
      // Add standard links and footer
      const websiteUrl = process.env.WEBSITE_URL;
      const socialLinks = process.env.SOCIAL_LINKS;
      if (websiteUrl || socialLinks) {
        newDesc += '\n\n🔗 TAUTAN BERMANFAAT:\n';
        if (websiteUrl) newDesc += `• Situs Web: ${websiteUrl}\n`;
        if (socialLinks) newDesc += `• Media Sosial: ${socialLinks}\n`;
      }
      
      const businessEmail = process.env.BUSINESS_EMAIL;
      if (businessEmail) {
        newDesc += '\n📧 HUBUNGI KAMI / KERJASAMA:\n';
        newDesc += `${businessEmail}\n`;
      }
      
      newDesc += '\n---\n';
      newDesc += '🎵 Musik: YouTube Audio Library | © ' + new Date().getFullYear() + ' Hak Cipta Dilindungi\n';
      newDesc += '⚠️ Video ini bertujuan untuk hiburan edukatif dan merangsang imajinasi kreatif anak-anak.\n\n';
      
      // Build hashtags
      let hashtags = [`#${topic.replace(/[^a-zA-Z0-9]/g, '')}`, '#DongengAnak', '#CeritaAnakIndonesia', '#DongengSebelumTidur', '#AnimasiAnak'];
      newDesc += hashtags.join(' ') + '\n';
      
      metadata.seo.description = newDesc;
      metadata.seo.hashtags = hashtags;
      
      // Update publish_schedule in DB
      await db.executeQuery('UPDATE publish_schedule SET metadata = ? WHERE id = ?', [JSON.stringify(metadata), item.id]);
      
      console.log(`Successfully updated LLM description for: ${item.title}`);
      
    } catch (err) {
      console.error(`Error processing item ${item.title}:`, err);
    }
  }
  
  console.log('Cleanup complete!');
  await db.close();
}

fixDescriptions().catch(console.error);
