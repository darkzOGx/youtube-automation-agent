const { Logger } = require('../utils/logger');
const { GoogleGenerativeAI } = require('@google/generative-ai');

class ScriptWriterAgent {
  constructor(db, credentials) {
    this.db = db;
    this.credentials = credentials;
    this.logger = new Logger('ScriptWriter');
    this.templates = this.loadTemplates();

    // Support either raw credentials JSON or the CredentialManager instance
    const rawCredentials = credentials.credentials || credentials;

    // Initialize Gemini AI
    const geminiKey = rawCredentials.gemini?.apiKey || process.env.GEMINI_API_KEY;
    if (geminiKey) {
      try {
        const genAI = new GoogleGenerativeAI(geminiKey);
        this.gemini = genAI.getGenerativeModel({
          model: 'gemini-2.5-flash',
          systemInstruction: 'You are an expert Indonesian children\'s fairy tale writer. You create wholesome, safe, educational stories for kids aged 3-8 in Bahasa Indonesia. Always produce valid JSON output only. Never include violent, scary, or inappropriate content.'
        });
        this.logger.info('Google Gemini service initialized for ScriptWriter');
      } catch (error) {
        this.logger.error('Failed to initialize Google Gemini for ScriptWriter:', error);
      }
    }
  }

  async initialize() {
    this.logger.info('Initializing Script Writer Agent...');
    return true;
  }

  loadTemplates() {
    return {
      tutorial: {
        structure: ['hook', 'introduction', 'problem', 'solution_steps', 'demonstration', 'recap', 'cta'],
        tone: 'educational',
        pacing: 'moderate'
      },
      explainer: {
        structure: ['hook', 'question', 'background', 'explanation', 'examples', 'implications', 'summary', 'cta'],
        tone: 'informative',
        pacing: 'steady'
      },
      list: {
        structure: ['hook', 'introduction', 'list_items', 'bonus_item', 'summary', 'cta'],
        tone: 'engaging',
        pacing: 'quick'
      },
      review: {
        structure: ['hook', 'introduction', 'overview', 'pros', 'cons', 'comparison', 'verdict', 'cta'],
        tone: 'analytical',
        pacing: 'detailed'
      },
      story: {
        structure: ['hook', 'setup', 'conflict', 'journey', 'climax', 'resolution', 'lesson', 'cta'],
        tone: 'narrative',
        pacing: 'dynamic'
      }
    };
  }

  parseJsonFromText(text) {
    try {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end >= start) {
        return JSON.parse(text.substring(start, end + 1));
      }
      return JSON.parse(text);
    } catch (e) {
      this.logger.error(`JSON Parse Error. Raw text: ${text}`);
      throw e;
    }
  }

  async generateOutline(strategy) {
    this.logger.info('Step 1: Generating Outline...');
    const prompt = `You are an expert Indonesian children's fairy tale writer. Create a story outline strictly in Bahasa Indonesia based on this topic and angle:
Topic: "${strategy.topic}"
Angle: "${strategy.angle}"

CRITICAL RULES:
1. ALL TEXT MUST BE IN BAHASA INDONESIA. Do not use English.
2. The title MUST be natural Bahasa Indonesia, like a real dongeng title.
3. DO NOT add years or words like "Resmi", "Ultimate", "Terbaik".

Provide the output in valid JSON format:
{
  "title": "Judul dongeng",
  "chapters": [
    {"chapterNumber": 1, "description": "Story beat 1 dalam Bahasa Indonesia"},
    {"chapterNumber": 2, "description": "Story beat 2 dalam Bahasa Indonesia"}
  ],
  "moralLesson": "Pesan moral cerita"
}`;
    const result = await this.gemini.generateContent(prompt);
    return this.parseJsonFromText(result.response.text());
  }

  async writeDraft(outline, strategy) {
    this.logger.info('Step 2: Writing Draft...');
    const prompt = `You are an expert Indonesian children's fairy tale writer. Write a full story draft STRICTLY in Bahasa Indonesia based on this outline:
Title: ${outline.title}
Chapters: ${JSON.stringify(outline.chapters)}

CRITICAL RULE: ALL DIALOGUE AND NARRATION MUST BE IN BAHASA INDONESIA.

Provide the output in valid JSON format:
{
  "hook": "Kalimat pembuka yang menarik untuk anak-anak (Bahasa Indonesia)",
  "introduction": "Sapaan hangat (misal: Halo adik-adik!) dan perkenalan dunia",
  "sections": [
    {
      "title": "Judul Bab 1",
      "content": "Satu paragraf cerita yang indah (3-4 kalimat dalam Bahasa Indonesia)."
    }
  ],
  "conclusion": "Ringkasan pesan moral cerita"
}`;
    const result = await this.gemini.generateContent(prompt);
    return this.parseJsonFromText(result.response.text());
  }

  async polishForKids(draft, outline) {
    this.logger.info('Step 3: Polishing for Kids & Formatting...');
    const prompt = `You are a child psychologist and editor. Review and polish this story draft for kids aged 3-8 in Bahasa Indonesia. Ensure language is simple, engaging, and safe.
Draft: ${JSON.stringify(draft)}

CRITICAL RULES:
1. ALL TEXT MUST BE IN BAHASA INDONESIA. Do not use English.
2. Provide EXACTLY 1-3 English keywords for sound effects in the "sfx_keywords" array.

Provide the final output in valid JSON format EXACTLY matching this structure:
{
  "title": "${outline.title}",
  "hook": {
    "text": "Kalimat pembuka yang sudah disempurnakan (Bahasa Indonesia)"
  },
  "introduction": {
    "greeting": "Halo Adik-adik hebat!",
    "topicIntro": "Pengenalan topik yang menarik",
    "valueProposition": "Pesan kenapa cerita ini seru",
    "credibility": "Kalimat pendongeng (Misal: Bersama Kakak, mari kita...)"
  },
  "sections": [
    {
      "title": "Judul Bab",
      "content": "Satu paragraf cerita yang sudah disempurnakan.",
      "duration": 45,
      "sfx_keywords": ["MANDATORY: 1-3 English keywords, e.g., 'magic', 'wind', 'laugh', 'birds', 'footsteps']
    }
  ],
  "conclusion": {
    "recap": ["Poin ringkasan 1", "Poin ringkasan 2"],
    "finalThought": "Pesan terakhir"
  },
  "cta": {
    "subscribe": "Jangan lupa subscribe ya!",
    "like": "Tekan tombol like jika kalian suka!",
    "comment": "Pertanyaan interaktif untuk dijawab di komentar"
  }
}`;
    const result = await this.gemini.generateContent(prompt);
    return this.parseJsonFromText(result.response.text());
  }

  async generateScript(strategy) {
    try {
      this.logger.info(`Generating script for: ${strategy.topic}`);

      const contentTypeKey = strategy.contentType.toLowerCase();
      const allowedTypes = Object.keys(this.templates);
      const template = allowedTypes.includes(contentTypeKey) ? this.templates[contentTypeKey] : this.templates.explainer;

      let hook, introduction, mainContent, conclusion, cta, title;
      let generatedViaGemini = false;

      if (this.gemini) {
        try {
          this.logger.info('Invoking Google Gemini Multi-Agent Pipeline for script generation...');

          const outline = await this.generateOutline(strategy);
          const draft = await this.writeDraft(outline, strategy);
          const parsed = await this.polishForKids(draft, outline);

          title = parsed.title;
          hook = {
            type: 'statement',
            text: parsed.hook.text,
            duration: '0:00-0:05'
          };
          introduction = {
            greeting: parsed.introduction.greeting,
            topicIntro: parsed.introduction.topicIntro,
            valueProposition: parsed.introduction.valueProposition,
            credibility: parsed.introduction.credibility,
            duration: '0:05-0:20'
          };
          mainContent = {
            sections: parsed.sections,
            totalDuration: parsed.sections.reduce((t, s) => t + (s.duration || 45), 0)
          };
          conclusion = {
            type: 'conclusion',
            title: 'Wrapping Up',
            recap: parsed.conclusion.recap,
            finalThought: parsed.conclusion.finalThought,
            duration: '30 seconds'
          };
          cta = {
            type: 'call_to_action',
            subscribe: parsed.cta.subscribe,
            like: parsed.cta.like,
            comment: parsed.cta.comment,
            nextVideo: 'Tonton video dongeng seru lainnya ya!',
            duration: '15 seconds'
          };

          generatedViaGemini = true;
          this.logger.info('Gemini script generation and parsing successful');
        } catch (err) {
          this.logger.error('Gemini script generation failed, falling back to static templates:', err);
        }
      }

      if (!generatedViaGemini) {
        // Fallback to static templates
        title = await this.generateTitle(strategy);
        hook = await this.generateHook(strategy);
        introduction = await this.generateIntroduction(strategy);
        mainContent = await this.generateMainContent(strategy, template);
        conclusion = await this.generateConclusion(strategy);
        cta = await this.generateCTA(strategy);
      }

      // Assemble complete script
      const script = {
        title,
        hook,
        introduction,
        mainContent,
        conclusion,
        callToAction: cta,
        duration: this.estimateDuration(mainContent),
        tone: template.tone,
        pacing: template.pacing,
        keywords: strategy.keywords,
        metadata: {
          strategy: strategy,
          generatedAt: new Date().toISOString(),
          version: '1.0',
          aiGenerated: generatedViaGemini
        }
      };

      // Format for readability
      script.fullScript = this.formatFullScript(script);

      // Save to database
      await this.db.saveScript(script);

      this.logger.info(`Script generated: ${script.title}`);
      return script;
    } catch (error) {
      this.logger.error('Failed to generate script:', error);
      throw error;
    }
  }

  async generateTitle(strategy) {
    const types = {
      explainer: `Apa itu ${strategy.topic}? (Penjelasan Lengkap)`,
      tutorial: `Cara Mudah ${strategy.topic} Untuk Anak`,
      review: `Review Menarik tentang ${strategy.topic}`,
      story: `Dongeng Seru: ${strategy.topic}`
    };

    const typeKey = (strategy.contentType || 'story').toLowerCase();
    return types[typeKey] || types.story;
  }

  async generateHook(strategy) {
    const hooks = [
      {
        type: 'question',
        text: `Pernahkah kalian membayangkan ${this.generateQuestionAbout(strategy.topic)}?`
      },
      {
        type: 'statistic',
        text: `Tahukah kalian bahwa ${this.generateStatistic(strategy.topic)}?`
      },
      {
        type: 'statement',
        text: `${strategy.topic} akan membawamu ke petualangan seru, ini alasannya...`
      },
      {
        type: 'challenge',
        text: `Banyak yang belum tahu rahasia di balik ${strategy.topic}...`
      },
      {
        type: 'promise',
        text: `Hari ini, kita akan masuk ke dunia ajaib ${strategy.topic}.`
      }
    ];

    const selected = hooks.at(Math.floor(Math.random() * hooks.length));

    return {
      type: selected.type,
      text: selected.text,
      duration: '0:00-0:05'
    };
  }

  generateQuestionAbout(topic) {
    const questions = [
      `apa rahasia di balik cerita ini`,
      `bagaimana keajaiban itu terjadi`,
      `siapa pahlawan sebenarnya di kisah ini`,
      `mengapa tempat ini sangat misterius`,
      `bagaimana akhir dari petualangan seru ini`
    ];

    return questions.at(Math.floor(Math.random() * questions.length));
  }

  generateStatistic(topic) {
    const stats = [
      `ada banyak keajaiban yang tersembunyi di sini`,
      `cerita ini sudah diceritakan turun temurun`,
      `banyak anak hebat yang menyukai cerita ini`,
      `petualangan ini sangat mendebarkan`,
      `kisah ini menyimpan pesan rahasia yang luar biasa`
    ];

    return stats.at(Math.floor(Math.random() * stats.length));
  }

  async generateIntroduction(strategy) {
    return {
      greeting: "Halo Adik-adik hebat! Selamat datang di cerita hari ini!",
      topicIntro: `Hari ini, Kakak akan mendongengkan kisah seru tentang ${strategy.topic}.`,
      valueProposition: `Setelah mendengar cerita ini, kalian pasti akan belajar hal baru yang luar biasa.`,
      credibility: `Bersama Kakak, mari kita jelajahi dunia penuh keajaiban!`,
      duration: '0:05-0:20'
    };
  }

  getValueProposition(strategy) {
    const propositionsMap = new Map([
      ['Tutorial', `how to implement ${strategy.topic} step by step`],
      ['Explainer', `what ${strategy.topic} is and why it matters`],
      ['List', `the most important things about ${strategy.topic}`],
      ['Review', `whether ${strategy.topic} is right for you`],
      ['Story', `the incredible journey of ${strategy.topic}`]
    ]);

    return propositionsMap.get(strategy.contentType) || `everything about ${strategy.topic}`;
  }

  getCredibilityStatement(strategy) {
    const statements = [
      "I've spent months researching this topic",
      "After working with hundreds of people on this",
      "Based on the latest research and data",
      "Drawing from real-world experience",
      "Using proven methods and strategies"
    ];

    return statements.at(Math.floor(Math.random() * statements.length));
  }

  async generateMainContent(strategy, template) {
    const sections = [];

    for (const section of template.structure) {
      if (!['hook', 'introduction', 'cta'].includes(section)) {
        sections.push(await this.generateSection(section, strategy));
      }
    }

    return {
      sections,
      totalDuration: this.calculateSectionsDuration(sections)
    };
  }

  async generateSection(sectionType, strategy) {
    const generatorsMap = new Map([
      ['hook', () => this.generateHook(strategy)],
      ['introduction', () => this.generateIntroduction(strategy)],
      ['problem', () => this.generateProblem(strategy)],
      ['solution_steps', () => this.generateSolutionSteps(strategy)],
      ['demonstration', () => this.generateDemonstration(strategy)],
      ['recap', () => this.generateRecap(strategy)],
      ['cta', () => this.generateCTA(strategy)],
      ['question', () => this.generateQuestion(strategy)],
      ['background', () => this.generateBackground(strategy)],
      ['explanation', () => this.generateExplanation(strategy)],
      ['examples', () => this.generateExamples(strategy)],
      ['summary', () => this.generateSummary(strategy)],
      ['list_items', () => this.generateListItems(strategy)],
      ['pros', () => this.generatePros(strategy)],
      ['cons', () => this.generateCons(strategy)],
      ['comparison', () => this.generateComparison(strategy)],
      ['implications', () => this.generateImplications(strategy)]
    ]);

    const generator = generatorsMap.get(sectionType) || null;

    if (generator) {
      return await generator();
    }

    return this.generateGenericSection(sectionType, strategy);
  }

  async generateProblem(strategy) {
    return this.generateProblemSection(strategy);
  }

  async generateQuestion(strategy) {
    return {
      type: 'question',
      title: 'Pertanyaan Seru untuk Teman-Teman',
      content: `Nah, apakah teman-teman hebat pernah bermimpi indah tentang ${strategy.topic} atau melakukan kebaikan hari ini? Ceritakan pengalaman seru kalian di kolom komentar di bawah ya! Kakak sangat ingin membacanya!`,
      duration: 30
    };
  }

  async generateBackground(strategy) {
    return {
      type: 'background',
      title: `Awal Mula Kisah ${strategy.topic}`,
      content: `Dahulu kala, di sebuah hutan yang sangat indah dan penuh keajaiban, hiduplah dunia dongeng ${strategy.topic}. Semua makhluk di sana hidup dengan rukun, saling berbagi senyuman, kehangatan, dan cinta kasih setiap harinya.`,
      duration: 60
    };
  }

  async generateRecap(strategy) {
    return {
      type: 'recap',
      title: 'Pesan Indah Dongeng Hari Ini',
      content: `Mari kita ingat kembali pesan indah hari ini, anak-anak pintar. Melalui petualangan tentang ${strategy.topic}, kita belajar bahwa kebaikan hati, keberanian, dan suka menolong adalah harta yang paling berharga di dunia ini.`,
      duration: 45
    };
  }

  async generateSummary(strategy) {
    return {
      type: 'summary',
      title: 'Pelukan Hangat Penutup Cerita',
      content: `Singkatnya, kisah tentang ${strategy.topic} mengajarkan kita untuk selalu menjadi anak yang baik, jujur, dan berani. Sekarang, saatnya memejamkan mata indahmu, tersenyum manis, dan bersiap untuk petualangan mimpi yang indah. Selamat tidur, sayang.`,
      duration: 45
    };
  }

  async generateProblemSection(strategy) {
    return {
      type: 'problem',
      title: 'Tantangan Kecil Sahabat Kita',
      content: [
        `Terkadang, sahabat kecil kita mengalami sedikit kesulitan tentang ${strategy.topic}.`,
        `Beberapa rintangan yang mereka hadapi adalah:`,
        `1. Rasa takut atau ragu untuk mencoba hal baru`,
        `2. Bingung dan tidak tahu harus meminta bantuan kepada siapa`,
        `3. Tersesat di tengah petualangan yang menantang`,
        `Namun jangan khawatir, dengan keberanian dan persahabatan, kita pasti bisa melewati semua ini bersama-sama!`
      ],
      visuals: ['Ilustrasi tantangan karakter', 'Ekspresi petualangan yang seru'],
      duration: 30
    };
  }

  async generateSolutionSteps(strategy) {
    const steps = [];
    const numSteps = 3 + Math.floor(Math.random() * 3); // 3-5 steps

    for (let i = 1; i <= numSteps; i++) {
      steps.push({
        number: i,
        title: `Step ${i}: ${this.generateStepTitle(strategy.topic, i)}`,
        description: this.generateStepDescription(strategy.topic, i),
        tip: this.generateProTip(strategy.topic)
      });
    }

    return {
      type: 'solution_steps',
      title: 'Solusinya',
      steps,
      duration: steps.length * 45
    };
  }

  generateStepTitle(topic, stepNumber) {
    const titles = [
      'Memulai Petualangan Indah',
      'Menemukan Sahabat Baru',
      'Menghadapi Rintangan Bersama',
      'Menemukan Kunci Keajaiban',
      'Merayakan Kebaikan Hati'
    ];

    return titles.at(stepNumber - 1) || `Bagian Indah Kisah ${topic}`;
  }

  generateStepDescription(topic, stepNumber) {
    return `Langkah petualangan indah ini mengajarkan kita tentang bagaimana memahami makna ${topic} yang sesungguhnya. Mari kita amati baik-baik bagaimana sahabat kecil kita menyebarkan kasih sayang kepada sekitarnya.`;
  }

  generateProTip(topic) {
    const tips = [
      `Tips Kebaikan: Mulailah dari hal kecil, seperti tersenyum manis kepada ibumu hari ini.`,
      `Ingat ya sayang: Selalu berbagi adalah cara terbaik untuk melipatgandakan kebahagiaan.`,
      `Pesan Indah: Berbicara dengan sopan dan lembut akan membuat hatimu terasa sangat damai.`,
      `Saran Kakak: Fokuslah membantu satu sahabatmu hari ini, itu sudah sangat berharga.`,
      `Rahasia Ajaib: Doa dan senyuman tulus adalah sihir terindah yang ada di dunia ini.`
    ];

    return tips.at(Math.floor(Math.random() * tips.length));
  }

  async generateDemonstration(strategy) {
    return {
      type: 'demonstration',
      title: 'Mari Bermain Bersama',
      content: [
        `Sekarang, mari kita lihat bagaimana indahnya keajaiban ini bekerja dalam dunia nyata.`,
        `[Ilustrasi karakter tersenyum hangat dan menari gembira]`,
        `Seperti yang bisa teman-teman lihat, melakukan kebaikan itu sangatlah mudah dan membuat hati kita gembira.`,
        `Kuncinya adalah selalu peduli dan menyayangi sesama makhluk hidup.`
      ],
      visuals: ['Tarian kebaikan karakter', 'Animasi pelangi yang indah'],
      duration: 120
    };
  }

  async generateExplanation(strategy) {
    return {
      type: 'explanation',
      title: 'Menyelami Rahasia Keajaiban',
      content: [
        `Mari kita intip bersama apa saja rahasia indah di balik ${strategy.topic}.`,
        `Pertama, kita harus tahu bahwa segalanya berawal dari hati yang tulus.`,
        `Mengapa keajaiban ini begitu luar biasa? Karena kasih sayang memiliki kekuatan besar...`,
        `[Visual peri kecil menyebarkan serbuk bintang emas]`,
        `Itulah mengapa kisah ${strategy.topic} terasa sangat hangat dan memeluk hati kita.`
      ],
      visuals: ['Diagram bintang ajaib', 'Visualisasi mimpi indah', 'Peta hutan dongeng'],
      duration: 90
    };
  }

  async generateExamples(strategy) {
    return {
      type: 'examples',
      title: 'Kisah Kebaikan Nyata',
      content: [
        `Mari kita dengarkan beberapa cerita pendek kebaikan tentang ${strategy.topic} dalam kehidupan sehari-hari.`,
        `Cerita 1: [Si kelinci yang membagikan wortelnya kepada burung pipit yang lapar]`,
        `Cerita 2: [Si gajah yang menyeberangkan semut kecil melewati genangan air]`,
        `Cerita 3: [Kucing kecil yang memeluk temannya saat sedang bersedih]`,
        `Semua kisah manis ini membuktikan bahwa ${strategy.topic} membuat dunia menjadi tempat yang sangat indah.`
      ],
      visuals: ['Gambar hewan lucu bertolong-tolongan', 'Ilustrasi senyuman penuh kasih'],
      duration: 75
    };
  }

  async generateListItems(strategy) {
    const items = [];
    const numItems = 5 + Math.floor(Math.random() * 6); // 5-10 items

    for (let i = 1; i <= numItems; i++) {
      items.push({
        number: numItems - i + 1, // Countdown for engagement
        title: this.generateListItemTitle(strategy.topic, i),
        description: this.generateListItemDescription(strategy.topic),
        impact: this.generateImpactStatement()
      });
    }

    return {
      type: 'list_items',
      title: `Hal Terbaik Tentang ${strategy.topic}`,
      items,
      duration: items.length * 30
    };
  }

  generateListItemTitle(topic, index) {
    const titles = [
      `Kekuatan Rahasia Kebaikan ${topic}`,
      `Mengapa ${topic} Begitu Istimewa Bagi Sahabat Hutan`,
      `Kejutan Manis di Balik Rahasia ${topic}`,
      `Bagaimana ${topic} Mengubah Hari yang Sedih Menjadi Ceria`,
      `Bisikan Ajaib ${topic} yang Belum Pernah Terdengar`,
      `Menjadi Sahabat Sejati dengan ${topic}`,
      `Sihir Kasih Sayang Terbesar dari ${topic}`,
      `Bagaimana ${topic} Membawa Kebahagiaan bagi Kita`,
      `Menepis Rasa Takut Bersama Misteri ${topic}`,
      `Masa Depan Hutan Dongeng yang Penuh Warna Bersama ${topic}`
    ];

    return titles.at(index - 1) || `Teknik Kebaikan Ajaib #${index} dari ${topic}`;
  }

  generateListItemDescription(topic) {
    return `Bagian indah tentang ${topic} ini sangat istimewa karena memberikan pelukan hangat bagi siapa saja yang mendengarnya. Memahami hal ini akan membuat hatimu dipenuhi dengan kebahagiaan yang melimpah.`;
  }

  generateImpactStatement() {
    const impacts = [
      'Hal sederhana ini bisa membuat senyuman terindah di wajah ibumu',
      'Sangat ajaib untuk membuat malam tidurmu menjadi sangat nyenyak',
      'Penting sekali agar mimpi indah selalu hadir menemanimu',
      'Sering terlupakan, padahal pelukan hangat sangatlah berharga',
      'Ini adalah kunci ajaib untuk membuka pintu taman kebahagiaan'
    ];

    return impacts.at(Math.floor(Math.random() * impacts.length));
  }

  async generatePros(strategy) {
    return {
      type: 'pros',
      title: 'Manfaat Senyuman dan Kebaikan',
      points: [
        'Membuat hati terasa sangat gembira dan damai',
        'Mendapatkan banyak sahabat baru yang baik hati',
        'Mimpi indah yang nyenyak setiap malam',
        'Menyebarkan kehangatan ke seluruh penjuru rumah',
        'Mendapatkan pelukan manis dari orang tersayang'
      ],
      duration: 45
    };
  }

  async generateCons(strategy) {
    return {
      type: 'cons',
      title: 'Apa yang Terjadi Jika Kita Cemberut',
      points: [
        'Hari terasa sepi dan kurang berwarna',
        'Sahabat kecil kita merasa sedikit sedih',
        'Bunga-bunga ajaib layu kekurangan kasih sayang',
        'Pelangi enggan muncul menampakkan diri',
        'Mimpi indah tertunda karena hati sedang gelisah'
      ],
      duration: 45
    };
  }

  async generateComparison(strategy) {
    return {
      type: 'comparison',
      title: 'Dua Sisi Hati yang Hangat',
      content: `Mari kita bandingkan indahnya hati yang suka menolong dengan hati yang sedang merajuk. Hati yang menolong bagaikan taman bunga yang mekar di pagi hari, sedangkan hati yang merajuk seperti malam yang gelap tanpa bintang. Kita tentu ingin menjadi taman bunga yang indah, bukan?`,
      duration: 45
    };
  }

  async generateImplications(strategy) {
    return {
      type: 'implications',
      title: 'Keajaiban Masa Depan Kita',
      content: `Ketika kita memilih menyebarkan ${strategy.topic} hari ini, seluruh dunia dongeng akan bersinar semakin terang. Pohon-pohon akan bernyanyi merdu, burung-burung berkicau riang, dan pelukan hangat akan selalu menunggumu di rumah.`,
      duration: 45
    };
  }

  generateGenericSection(sectionType, strategy) {
    const textMap = {
      'setup': [
        `Pada suatu hari yang cerah, dimulailah kisah menakjubkan tentang ${strategy.topic}. Semua tampak tenang dan damai, siap untuk sebuah petualangan baru.`,
        `Di sebuah tempat yang jauh dan ajaib, dimulailah kisah ${strategy.topic}. Mari kita ikuti awal mula cerita yang seru ini!`,
        `Kisah kita kali ini bercerita tentang ${strategy.topic}. Matahari bersinar cerah menyambut hari yang penuh dengan keajaiban.`
      ],
      'conflict': [
        `Namun, tiba-tiba ada sesuatu yang tidak biasa terjadi. Sahabat kita dihadapkan pada sebuah tantangan yang membutuhkan keberanian.`,
        `Oh tidak! Sebuah rintangan tak terduga muncul di tengah jalan. Saatnya mengumpulkan semua semangat dan keberanian!`,
        `Tiba-tiba, suasana berubah. Ada ujian kecil yang harus dilewati oleh para pahlawan kita dalam kisah ${strategy.topic} ini.`
      ],
      'journey': [
        `Dengan hati yang teguh, perjalanan pun dimulai. Setiap langkah dalam petualangan ${strategy.topic} ini membawa banyak kejutan berharga.`,
        `Bersama-sama, mereka melangkah maju tanpa ragu. Perjalanan ini dipenuhi dengan pemandangan indah dan hal-hal baru.`,
        `Meski jalan terasa panjang, semangat mereka tidak pernah padam. Mereka terus berjalan menyusuri petualangan yang mendebarkan.`
      ],
      'climax': [
        `Tantangan terbesar akhirnya datang! Ini adalah saat yang paling mendebarkan. Akankah semua berhasil dilalui dengan hati yang tulus?`,
        `Puncak petualangan telah tiba! Jantung berdebar kencang menunggu apa yang akan terjadi selanjutnya dalam kisah ${strategy.topic} ini.`,
        `Ini dia momen yang paling menegangkan! Semua keberanian dan persahabatan akan diuji sekarang juga.`
      ],
      'resolution': [
        `Hore! Berkat kebaikan hati dan kerja sama, rintangan pun berhasil dilewati. Semuanya kembali dipenuhi dengan tawa bahagia.`,
        `Syukurlah, semuanya berakhir dengan indah. Masalah telah teratasi dan senyuman kembali menghiasi wajah mereka.`,
        `Akhirnya, awan gelap pun berlalu. Kemenangan kecil ini dirayakan dengan penuh sukacita oleh semua orang.`
      ],
      'lesson': [
        `Dari petualangan ${strategy.topic} hari ini, kita belajar bahwa keberanian dan cinta kasih selalu bisa mengalahkan rintangan apa pun.`,
        `Kisah ini mengajarkan kita sebuah rahasia penting: bersikap baik kepada sesama adalah keajaiban yang paling hebat.`,
        `Pesan manis dari cerita ini adalah selalu percaya pada diri sendiri dan jangan pernah takut untuk berbuat kebaikan.`
      ]
    };

    const defaultTexts = [
      `Kisah ${strategy.topic} ini membawa pesan manis tentang indahnya berbagi kebaikan dengan sesama.`,
      `Petualangan ${strategy.topic} ini penuh dengan keajaiban yang tak terduga.`,
      `Mari kita terus mengingat pelajaran berharga dari kisah ${strategy.topic} hari ini.`
    ];
    
    const options = textMap[sectionType] || defaultTexts;
    const selectedContent = options[Math.floor(Math.random() * options.length)];
    
    return {
      type: sectionType,
      title: sectionType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      content: selectedContent,
      duration: 60
    };
  }

  async generateConclusion(strategy) {
    return {
      type: 'conclusion',
      title: 'Pesan Terakhir',
      recap: [
        `Ingat selalu ya pesan dari ${strategy.topic}`,
        `Jadilah anak yang pemberani dan baik hati.`
      ],
      finalThought: 'Sampai jumpa di cerita seru berikutnya!',
      duration: '30 seconds'
    };
  }

  async generateCTA(strategy) {
    return {
      type: 'call_to_action',
      subscribe: "Jangan lupa subscribe dan nyalakan loncengnya ya!",
      like: "Klik tombol like jika cerita hari ini membuatmu tersenyum.",
      comment: `Tuliskan pesan atau pengalamanmu tentang ${strategy.topic} di kolom komentar ya!`,
      nextVideo: "Tonton video dongeng seru lainnya, sampai jumpa!",
      duration: '15 seconds'
    };
  }

  formatFullScript(script) {
    let fullScript = '';

    // Title
    fullScript += `TITLE: ${script.title}\n\n`;
    fullScript += '═'.repeat(50) + '\n\n';

    // Hook
    fullScript += `[${script.hook.duration}] HOOK\n`;
    fullScript += `${script.hook.text}\n\n`;

    // Introduction
    fullScript += `[${script.introduction.duration}] INTRODUCTION\n`;
    fullScript += `${script.introduction.greeting}\n`;
    fullScript += `${script.introduction.topicIntro}\n`;
    fullScript += `${script.introduction.valueProposition}\n`;
    fullScript += `${script.introduction.credibility}\n\n`;

    // Main Content
    fullScript += 'MAIN CONTENT\n';
    fullScript += '─'.repeat(30) + '\n\n';

    for (const section of script.mainContent.sections) {
      fullScript += `[${this.formatDuration(section.duration)}] ${section.title.toUpperCase()}\n`;

      if (Array.isArray(section.content)) {
        section.content.forEach(line => {
          fullScript += `${line}\n`;
        });
      } else if (section.steps) {
        section.steps.forEach(step => {
          fullScript += `\n${step.title}\n`;
          fullScript += `${step.description}\n`;
          fullScript += `💡 ${step.tip}\n`;
        });
      } else if (section.items) {
        section.items.forEach(item => {
          fullScript += `\n#${item.number}: ${item.title}\n`;
          fullScript += `${item.description}\n`;
          fullScript += `Impact: ${item.impact}\n`;
        });
      } else if (section.points) {
        section.points.forEach(point => {
          fullScript += `• ${point}\n`;
        });
      } else {
        fullScript += `${section.content}\n`;
      }

      if (section.visuals) {
        fullScript += `\n[VISUALS: ${section.visuals.join(', ')}]\n`;
      }

      fullScript += '\n';
    }

    // Conclusion
    fullScript += `[${script.conclusion.duration}] CONCLUSION\n`;
    script.conclusion.recap.forEach(line => {
      fullScript += `${line}\n`;
    });
    fullScript += `\n${script.conclusion.finalThought}\n\n`;

    // Call to Action
    fullScript += `[${script.callToAction.duration}] CALL TO ACTION\n`;
    fullScript += `${script.callToAction.subscribe}\n`;
    fullScript += `${script.callToAction.like}\n`;
    fullScript += `${script.callToAction.comment}\n`;
    fullScript += `${script.callToAction.nextVideo}\n\n`;

    // Metadata
    fullScript += '═'.repeat(50) + '\n';
    fullScript += `ESTIMATED DURATION: ${script.duration}\n`;
    fullScript += `TONE: ${script.tone}\n`;
    fullScript += `PACING: ${script.pacing}\n`;
    fullScript += `KEYWORDS: ${script.keywords.join(', ')}\n`;

    return fullScript;
  }

  estimateDuration(mainContent) {
    const totalSeconds = mainContent.sections.reduce((total, section) => {
      return total + (section.duration || 60);
    }, 0);

    // Add hook, intro, conclusion, CTA
    const fullDuration = totalSeconds + 5 + 15 + 30 + 15;

    return this.formatDuration(fullDuration);
  }

  formatDuration(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  calculateSectionsDuration(sections) {
    return sections.reduce((total, section) => total + (section.duration || 60), 0);
  }
}

module.exports = { ScriptWriterAgent };