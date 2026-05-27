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
          this.logger.info('Invoking Google Gemini for script generation...');
          const prompt = `You are an expert Indonesian children's fairy tale writer. Create a complete, highly engaging children's story script in Indonesian (Bahasa Indonesia) based on this topic and angle:
Topic: "${strategy.topic}"
Angle: "${strategy.angle}"
Target Audience: Anak-anak Indonesia usia 3-8 tahun (balita dan anak SD)

IMPORTANT TITLE RULES:
- The title MUST be in natural Bahasa Indonesia
- It MUST sound like a real Indonesian children's story title
- Format examples: "Kancil dan Harimau yang Baik Hati", "Petualangan Seru Si Kura-Kura", "Bintang Kecil yang Berani"
- DO NOT use English words in the title
- DO NOT add "(2025)", "(2026)", or any year
- DO NOT use words like "Resmi", "Ultimate", "Secret", "Amazing", "Panduan", "Terbaik"
- Keep it simple, warm, and magical — like a real dongeng title

Provide the output in valid, raw JSON format (no markdown, no code blocks):
{
  "title": "Judul dongeng yang indah dan alami dalam Bahasa Indonesia",
  "hook": {
    "text": "A brief opening question or statement to hook the kids in Indonesian"
  },
  "introduction": {
    "greeting": "A warm greeting to the kids in Indonesian",
    "topicIntro": "Introduction of the characters or story world in Indonesian",
    "valueProposition": "A tease of what moral lesson or magic they will discover in Indonesian",
    "credibility": "A friendly storyteller statement in Indonesian"
  },
  "sections": [
    {
      "title": "Chapter 1: Title in Indonesian",
      "content": "A beautiful story paragraph of 3-4 sentences in Indonesian.",
      "duration": 45
    },
    {
      "title": "Chapter 2: Title in Indonesian",
      "content": "A beautiful story paragraph of 3-4 sentences in Indonesian.",
      "duration": 45
    },
    {
      "title": "Chapter 3: Title in Indonesian",
      "content": "A beautiful story paragraph of 3-4 sentences in Indonesian.",
      "duration": 45
    }
  ],
  "conclusion": {
    "recap": [
      "Summary of the moral lesson or story wrap-up in Indonesian"
    ],
    "finalThought": "A lovely final sweet dream or moral lesson statement in Indonesian"
  },
  "cta": {
    "subscribe": "Subscribe text in Indonesian",
    "like": "Like text in Indonesian",
    "comment": "Interactive question to ask the kids in the comments in Indonesian"
  }
}`;
          const result = await this.gemini.generateContent(prompt);
          let responseText = result.response.text().trim();
          
          // Strip any markdown code fence wrappers if present
          if (responseText.startsWith('```')) {
            responseText = responseText.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
          }

          const parsed = JSON.parse(responseText);
          
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
    const templates = [
      `${strategy.angle}`,
      `${strategy.topic}: The Complete Guide`,
      `Everything You Need to Know About ${strategy.topic}`,
      `${strategy.topic} in ${new Date().getFullYear()}: What's Changed?`,
      `The Truth About ${strategy.topic} (Shocking Results)`,
      `How to Master ${strategy.topic} in 30 Days`,
      `${strategy.topic}: Beginner to Expert Guide`
    ];

    // Select based on content type
    if (strategy.contentType === 'Tutorial') {
      return `How to ${strategy.topic}: Step-by-Step Guide`;
    } else if (strategy.contentType === 'List') {
      return `Top 10 ${strategy.topic} Tips You Need to Know`;
    } else if (strategy.contentType === 'Review') {
      return `${strategy.topic} Review: Is It Worth It?`;
    }

    return templates.at(Math.floor(Math.random() * templates.length));
  }

  async generateHook(strategy) {
    const hooks = [
      {
        type: 'question',
        text: `Have you ever wondered ${this.generateQuestionAbout(strategy.topic)}?`
      },
      {
        type: 'statistic',
        text: `Did you know that ${this.generateStatistic(strategy.topic)}?`
      },
      {
        type: 'statement',
        text: `${strategy.topic} is about to change everything, and here's why...`
      },
      {
        type: 'challenge',
        text: `Most people think they understand ${strategy.topic}, but they're completely wrong.`
      },
      {
        type: 'promise',
        text: `In the next few minutes, you'll learn exactly how to master ${strategy.topic}.`
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
      `why ${topic} is becoming so important`,
      `how ${topic} actually works`,
      `what makes ${topic} different from everything else`,
      `why experts are talking about ${topic}`,
      `how ${topic} could change your life`
    ];
    
    return questions.at(Math.floor(Math.random() * questions.length));
  }

  generateStatistic(topic) {
    const stats = [
      `90% of people don't understand ${topic} correctly`,
      `${topic} has grown by 300% in the last year alone`,
      `experts predict ${topic} will be worth billions by 2030`,
      `only 1 in 10 people are using ${topic} effectively`,
      `${topic} can save you hours every single day`
    ];
    
    return stats.at(Math.floor(Math.random() * stats.length));
  }

  async generateIntroduction(strategy) {
    return {
      greeting: "Hey everyone, welcome back to the channel!",
      topicIntro: `Today, we're diving deep into ${strategy.topic}.`,
      valueProposition: `By the end of this video, you'll understand exactly ${this.getValueProposition(strategy)}.`,
      credibility: this.getCredibilityStatement(strategy),
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

  async generateProblemSection(strategy) {
    return {
      type: 'problem',
      title: 'The Challenge',
      content: [
        `Many people struggle with ${strategy.topic}.`,
        `The main issues are:`,
        `1. Lack of clear information`,
        `2. Complexity and confusion`,
        `3. Not knowing where to start`,
        `But don't worry, we're going to solve all of these today.`
      ],
      visuals: ['Problem illustration', 'Statistics graphic'],
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
      title: 'The Solution',
      steps,
      duration: steps.length * 45
    };
  }

  generateStepTitle(topic, stepNumber) {
    const titles = [
      'Research and Preparation',
      'Setting Up the Foundation',
      'Implementation and Execution',
      'Testing and Optimization',
      'Scaling and Automation'
    ];
    
    return titles.at(stepNumber - 1) || `Advanced ${topic} Techniques`;
  }

  generateStepDescription(topic, stepNumber) {
    return `This step involves understanding the key aspects of ${topic} and how to apply them effectively. Pay special attention to the details here, as they make all the difference.`;
  }

  generateProTip(topic) {
    const tips = [
      `Pro tip: Start small and scale gradually`,
      `Remember: Consistency is more important than perfection`,
      `Quick tip: Document everything as you go`,
      `Expert advice: Focus on one aspect at a time`,
      `Insider secret: This works best when combined with regular practice`
    ];
    
    return tips.at(Math.floor(Math.random() * tips.length));
  }

  async generateDemonstration(strategy) {
    return {
      type: 'demonstration',
      title: 'Live Demo',
      content: [
        `Now let me show you exactly how this works.`,
        `[Screen recording or visual demonstration]`,
        `As you can see, the process is straightforward once you understand the basics.`,
        `The key is to follow the steps exactly as shown.`
      ],
      visuals: ['Screen recording', 'Step-by-step graphics'],
      duration: 120
    };
  }

  async generateExplanation(strategy) {
    return {
      type: 'explanation',
      title: 'Deep Dive',
      content: [
        `Let's break down ${strategy.topic} into its core components.`,
        `First, we need to understand the fundamental principles.`,
        `The science behind this is fascinating...`,
        `[Detailed explanation with visuals]`,
        `This is why ${strategy.topic} works so effectively.`
      ],
      visuals: ['Diagrams', 'Infographics', 'Charts'],
      duration: 90
    };
  }

  async generateExamples(strategy) {
    return {
      type: 'examples',
      title: 'Real-World Examples',
      content: [
        `Let's look at some real examples of ${strategy.topic} in action.`,
        `Example 1: [Specific case study]`,
        `Example 2: [Another relevant example]`,
        `Example 3: [Third compelling example]`,
        `These examples show the versatility and power of ${strategy.topic}.`
      ],
      visuals: ['Case study graphics', 'Before/after comparisons'],
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
      title: `Top ${numItems} Things About ${strategy.topic}`,
      items,
      duration: items.length * 30
    };
  }

  generateListItemTitle(topic, index) {
    const titles = [
      `The Hidden Power of ${topic}`,
      `Why ${topic} Matters More Than You Think`,
      `The Surprising Truth About ${topic}`,
      `How ${topic} Can Transform Your Approach`,
      `The ${topic} Secret Nobody Talks About`,
      `Mastering ${topic} in Record Time`,
      `The Ultimate ${topic} Hack`,
      `${topic}: The Game Changer`,
      `Breaking Down ${topic} Myths`,
      `The Future of ${topic}`
    ];
    
    return titles.at(index - 1) || `Advanced ${topic} Technique #${index}`;
  }

  generateListItemDescription(topic) {
    return `This aspect of ${topic} is crucial because it fundamentally changes how we approach the subject. Understanding this will give you a significant advantage.`;
  }

  generateImpactStatement() {
    const impacts = [
      'This alone can save you hours',
      'Game-changing for beginners',
      'Essential for long-term success',
      'Often overlooked but critical',
      'The difference between success and failure'
    ];
    
    return impacts.at(Math.floor(Math.random() * impacts.length));
  }

  async generatePros(strategy) {
    return {
      type: 'pros',
      title: 'The Benefits',
      points: [
        'Easy to get started',
        'Cost-effective solution',
        'Proven results',
        'Scalable approach',
        'Community support'
      ],
      duration: 45
    };
  }

  async generateCons(strategy) {
    return {
      type: 'cons',
      title: 'Things to Consider',
      points: [
        'Learning curve at the beginning',
        'Requires consistent effort',
        'Results may vary',
        'Some technical knowledge helpful'
      ],
      duration: 30
    };
  }

  async generateComparison(strategy) {
    return {
      type: 'comparison',
      title: 'How It Compares',
      content: `Compared to alternatives, ${strategy.topic} stands out because of its unique approach and proven effectiveness.`,
      comparisonPoints: [
        'More efficient than traditional methods',
        'Better ROI than competitors',
        'Easier to implement',
        'More sustainable long-term'
      ],
      duration: 60
    };
  }

  async generateImplications(strategy) {
    return {
      type: 'implications',
      title: 'What This Means',
      content: [
        `The implications of ${strategy.topic} are far-reaching.`,
        'This will change how we think about the industry.',
        'Early adopters will have a significant advantage.',
        'The potential for growth is enormous.'
      ],
      duration: 45
    };
  }

  generateGenericSection(sectionType, strategy) {
    return {
      type: sectionType,
      title: sectionType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      content: `This section covers important aspects of ${strategy.topic} that you need to know.`,
      duration: 60
    };
  }

  async generateConclusion(strategy) {
    return {
      type: 'conclusion',
      title: 'Wrapping Up',
      recap: [
        `So that's everything you need to know about ${strategy.topic}.`,
        'We covered the key points:',
        '- The fundamentals and why they matter',
        '- Practical steps to get started',
        '- Real-world applications and examples',
        '- Tips for long-term success'
      ],
      finalThought: `Remember, ${strategy.topic} is a journey, not a destination. Keep learning and improving!`,
      duration: '30 seconds'
    };
  }

  async generateCTA(strategy) {
    return {
      type: 'call_to_action',
      subscribe: "If you found this helpful, make sure to subscribe and hit the notification bell!",
      like: "Give this video a thumbs up if you learned something new.",
      comment: `Let me know in the comments: What's your experience with ${strategy.topic}?`,
      nextVideo: "Check out this related video for more insights.",
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