/**
 * AI-Powered Note Summarization Service
 *
 * Uses Anthropic Claude API to generate intelligent summaries of caregiver notes,
 * progress reports, and other clinical documentation.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  NoteType,
  SummarizationStrategy,
  SentimentCategory,
  SummarizeNoteRequest,
  SummarizedNote,
  BatchSummarizeRequest,
  BatchSummarizeResult,
  DailySummaryRequest,
  DailySummary,
  KeywordExtractionResult,
  AIServiceConfig,
  NoteAutofillInput,
  NoteAutofillSuggestions,
  NoteContextRecord,
} from '../types/ai-types.js';

/**
 * Service for AI-powered note summarization
 */
export class NoteSummarizationService {
  private client: Anthropic;
  private config: AIServiceConfig;
  private summaryCache: Map<string, SummarizedNote>;

  constructor(config: AIServiceConfig) {
    this.config = config;
    this.client = new Anthropic({
      apiKey: config.anthropicApiKey,
    });
    this.summaryCache = new Map();
  }

  /**
   * Summarize a single note using Claude API
   */
  async summarizeNote(request: SummarizeNoteRequest): Promise<SummarizedNote> {
    const startTime = Date.now();
    const strategy = request.strategy || 'STANDARD';

    // Check cache first
    if (this.config.enableCaching) {
      const cacheKey = this.getCacheKey(request.noteId, strategy);
      const cached = this.summaryCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Build prompt based on strategy
    const prompt = this.buildSummarizationPrompt(
      request.content,
      request.noteType,
      strategy,
      request.includeSentiment,
      request.includeKeywords
    );

    // Call Claude API
    const message = await this.client.messages.create({
      model: this.config.defaultModel === 'claude-haiku' ? 'claude-3-5-haiku-20241022' : 'claude-sonnet-4-5-20250929',
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Parse response
    const firstContentBlock = message.content[0];
    const responseText = firstContentBlock && firstContentBlock.type === 'text' ? firstContentBlock.text : '';
    const parsed = this.parseAIResponse(responseText, request.includeSentiment, request.includeKeywords);

    const summarized: SummarizedNote = {
      noteId: request.noteId,
      noteType: request.noteType,
      originalLength: request.content.length,
      summary: parsed.summary,
      summaryLength: parsed.summary.length,
      strategy,
      sentiment: parsed.sentiment,
      sentimentScore: parsed.sentimentScore,
      keywords: parsed.keywords,
      summarizedAt: new Date().toISOString(),
      summarizedBy: this.config.defaultModel === 'claude-haiku' ? 'CLAUDE_HAIKU' : 'CLAUDE_SONNET_4',
      processingTimeMs: Date.now() - startTime,
    };

    // Cache result
    if (this.config.enableCaching) {
      const cacheKey = this.getCacheKey(request.noteId, strategy);
      this.summaryCache.set(cacheKey, summarized);

      // Auto-expire cache
      setTimeout(() => {
        this.summaryCache.delete(cacheKey);
      }, this.config.cacheTTLSeconds * 1000);
    }

    return summarized;
  }

  /**
   * Summarize multiple notes in batch
   */
  async batchSummarize(request: BatchSummarizeRequest): Promise<BatchSummarizeResult> {
    const startTime = Date.now();
    const results: SummarizedNote[] = [];
    let failed = 0;

    // Process notes in parallel (with concurrency limit)
    const CONCURRENCY_LIMIT = 5;
    for (let i = 0; i < request.notes.length; i += CONCURRENCY_LIMIT) {
      const batch = request.notes.slice(i, i + CONCURRENCY_LIMIT);
      const promises = batch.map(async (note) => {
        try {
          return await this.summarizeNote({
            noteId: note.noteId,
            noteType: note.noteType,
            content: note.content,
            strategy: request.strategy,
            includeSentiment: request.includeSentiment,
            includeKeywords: request.includeKeywords,
          });
        } catch (error) {
          console.error(`Failed to summarize note ${note.noteId}:`, error);
          failed++;
          return null;
        }
      });

      const batchResults = await Promise.all(promises);
      results.push(...batchResults.filter((r): r is SummarizedNote => r !== null));
    }

    return {
      summaries: results,
      totalProcessed: results.length,
      totalFailed: failed,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Generate a daily summary for a client
   */
  async generateDailySummary(_request: DailySummaryRequest): Promise<DailySummary> {
    // This would fetch all notes/activities for the client on the given date
    // For now, returning a structured response that shows the pattern
    throw new Error('Not implemented: generateDailySummary requires database integration');
  }

  /**
   * Extract keywords from a note
   */
  async extractKeywords(content: string): Promise<KeywordExtractionResult> {
    const prompt = `Extract key medical terms, activities, and entities from this care note. Return a JSON object with:
- keywords: array of important terms
- topics: array of main topics discussed
- entities: array of {name, type} where type is PERSON, MEDICATION, CONDITION, ACTIVITY, or OTHER

Note content:
${content}

Return ONLY the JSON object, no additional text.`;

    const message = await this.client.messages.create({
      model: 'claude-3-5-haiku-20241022', // Use fast model for extraction
      max_tokens: 1024,
      temperature: 0.0, // Deterministic
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const firstBlock = message.content[0];
    const responseText = firstBlock && firstBlock.type === 'text' ? firstBlock.text : '{}';
    try {
      return JSON.parse(responseText) as KeywordExtractionResult;
    } catch {
      return {
        keywords: [],
        topics: [],
        entities: [],
      };
    }
  }

  /**
   * Build prompt for Claude based on summarization strategy
   */
  private buildSummarizationPrompt(
    content: string,
    noteType: NoteType,
    strategy: SummarizationStrategy,
    includeSentiment: boolean = false,
    includeKeywords: boolean = false
  ): string {
    let lengthGuidance: string;
    switch (strategy) {
      case 'BRIEF':
        lengthGuidance = '1-2 sentences highlighting only the most critical information';
        break;
      case 'DETAILED':
        lengthGuidance = '2-3 paragraphs with comprehensive details';
        break;
      case 'BULLET_POINTS':
        lengthGuidance = 'a structured bullet-point list of key points';
        break;
      case 'STANDARD':
      default:
        lengthGuidance = '1 paragraph (3-5 sentences) with balanced detail';
    }

    let prompt = `You are a healthcare documentation assistant helping caregivers and coordinators quickly understand care notes.

Summarize the following ${noteType.toLowerCase().replace('_', ' ')} in ${lengthGuidance}. Focus on:
- Key activities performed
- Client status and observations
- Any concerns or issues noted
- Important changes or updates

Note content:
${content}

`;

    if (includeSentiment || includeKeywords) {
      prompt += `\nReturn your response as a JSON object with these fields:
- summary: string (the summary text)`;

      if (includeSentiment) {
        prompt += `
- sentiment: "POSITIVE" | "NEUTRAL" | "CONCERNING" | "CRITICAL"
- sentimentScore: number (0-100, where 100 is most positive)`;
      }

      if (includeKeywords) {
        prompt += `
- keywords: string[] (5-10 key terms from the note)`;
      }

      prompt += `\n\nReturn ONLY the JSON object, no additional text.`;
    } else {
      prompt += `\nReturn ONLY the summary text, no JSON or formatting.`;
    }

    return prompt;
  }

  /**
   * Parse AI response into structured data
   */
  private parseAIResponse(
    responseText: string,
    includeSentiment: boolean = false,
    includeKeywords: boolean = false
  ): {
    summary: string;
    sentiment?: SentimentCategory;
    sentimentScore?: number;
    keywords?: string[];
  } {
    // If JSON requested, parse it
    if (includeSentiment || includeKeywords) {
      try {
        const parsed = JSON.parse(responseText);
        return {
          summary: parsed.summary || responseText,
          sentiment: parsed.sentiment as SentimentCategory | undefined,
          sentimentScore: parsed.sentimentScore,
          keywords: parsed.keywords,
        };
      } catch {
        // JSON parsing failed, treat as plain text
        return { summary: responseText };
      }
    }

    // Plain text response
    return { summary: responseText.trim() };
  }

  /**
   * Generate cache key for a summarization request
   */
  private getCacheKey(noteId: string, strategy: SummarizationStrategy): string {
    return `${noteId}:${strategy}`;
  }

  /**
   * Clear the summary cache
   */
  clearCache(): void {
    this.summaryCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxAge: number } {
    return {
      size: this.summaryCache.size,
      maxAge: this.config.cacheTTLSeconds,
    };
  }

  /**
   * Generate note autofill suggestions based on previous notes and visit context
   */
  async generateAutofillSuggestions(input: NoteAutofillInput): Promise<NoteAutofillSuggestions> {
    const previousNotes = input.previousNotes ?? [];
    const analyzedCount = previousNotes.length;
    const nowIso = new Date().toISOString();

    const fromDate = (previousNotes.length > 0 && previousNotes[previousNotes.length - 1]?.createdAt !== undefined && previousNotes[previousNotes.length - 1]?.createdAt !== '')
      ? (previousNotes[previousNotes.length - 1]?.createdAt ?? nowIso)
      : nowIso;
    const toDate = (previousNotes.length > 0 && previousNotes[0]?.createdAt !== undefined && previousNotes[0]?.createdAt !== '')
      ? (previousNotes[0]?.createdAt ?? nowIso)
      : nowIso;

    // Collect historical activities
    const activityCounts = new Map<string, number>();
    const moodCounts = new Map<string, number>();

    for (const note of previousNotes) {
      if (Array.isArray(note.activitiesPerformed)) {
        for (const act of note.activitiesPerformed) {
          if (typeof act === 'string' && act.trim() !== '') {
            activityCounts.set(act.trim(), (activityCounts.get(act.trim()) ?? 0) + 1);
          }
        }
      }
      if (typeof note.clientMood === 'string' && note.clientMood.trim() !== '') {
        moodCounts.set(note.clientMood.trim(), (moodCounts.get(note.clientMood.trim()) ?? 0) + 1);
      }
    }

    const sortedActivities = Array.from(activityCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([act]) => act);

    let mostCommonMood: string | undefined = undefined;
    let maxMoodCount = 0;
    for (const [mood, count] of moodCounts.entries()) {
      if (count > maxMoodCount) {
        maxMoodCount = count;
        mostCommonMood = mood;
      }
    }

    // Default activity templates by service type
    const serviceType = (input.serviceTypeName ?? '').toLowerCase();
    let defaultActivities: string[] = [
      'Assisted with morning hygiene and grooming',
      'Assisted with meal preparation and hydration',
      'Mobility and transfer assistance provided',
      'Light housekeeping and safety check completed',
    ];

    if (serviceType.includes('nurs') || serviceType.includes('sn')) {
      defaultActivities = [
        'Vital signs measured and documented within baseline',
        'Medication administration and compliance verified',
        'Physical assessment and wound evaluation performed',
        'Client and caregiver education provided on care plan',
      ];
    } else if (serviceType.includes('phys') || serviceType.includes('pt')) {
      defaultActivities = [
        'Gait and balance exercises completed',
        'Active and passive range of motion performed',
        'Therapeutic exercise program completed',
        'Home mobility and fall prevention evaluated',
      ];
    } else if (serviceType.includes('occup') || serviceType.includes('ot')) {
      defaultActivities = [
        'Activities of daily living (ADL) adaptive training',
        'Fine motor and upper extremity exercises completed',
        'Adaptive equipment usage review and guidance',
        'Energy conservation techniques reviewed',
      ];
    } else if (serviceType.includes('speech') || serviceType.includes('st')) {
      defaultActivities = [
        'Swallow safety and aspiration precautions reviewed',
        'Speech articulation and vocal production exercises',
        'Cognitive-linguistic rehabilitation tasks performed',
        'Caregiver communication strategies provided',
      ];
    } else if (serviceType.includes('aide') || serviceType.includes('hha')) {
      defaultActivities = [
        'Personal hygiene, bathing, and grooming assistance',
        'Skin integrity inspection and pressure relief positioning',
        'Nutritional support and meal assistance completed',
        'Safe ambulation assistance with assistive device',
      ];
    }

    const suggestedActivities = sortedActivities.length > 0
      ? Array.from(new Set([...sortedActivities, ...defaultActivities])).slice(0, 6)
      : defaultActivities;

    const commonPhrases = [
      'Client was alert, oriented, and receptive to care.',
      'Care plan interventions completed without incident.',
      'Client tolerated all scheduled care activities well.',
      'Living environment inspected; no safety hazards observed.',
      'Vital signs and general condition remained stable throughout visit.',
    ];

    const clientDisplayName = (input.clientName != null && input.clientName !== '') ? input.clientName : 'Client';
    const noteStarter = `Arrived for scheduled visit with ${clientDisplayName}. Client was comfortable and greeted caregiver warmly. Care plan tasks initiated promptly.`;

    // Try Claude AI if API key is provided and not empty
    if (this.config.anthropicApiKey !== '' && this.config.anthropicApiKey !== 'mock' && previousNotes.length > 0) {
      try {
        const notesSummary = previousNotes.slice(0, 5).map((n: NoteContextRecord, i: number) =>
          `Note ${i + 1} (${n.createdAt ?? 'recent'}): ${n.noteText ?? ''} [Activities: ${(n.activitiesPerformed ?? []).join(', ')}] [Mood: ${n.clientMood ?? 'unknown'}]`
        ).join('\n');

        const prompt = `You are a clinical documentation assistant for a home healthcare agency.
Analyze these recent visit notes for client "${clientDisplayName}" and generate autofill suggestions for the upcoming visit note.
Service Type: ${input.serviceTypeName ?? 'Home Care'}
Date: ${input.scheduledDate ?? 'Today'}

Recent Notes:
${notesSummary}

Return a valid JSON object matching:
{
  "suggestedActivities": string[],
  "suggestedMood": string,
  "commonPhrases": string[],
  "noteStarter": string
}
Return JSON ONLY, without markdown fences or additional commentary.`;

        const message = await this.client.messages.create({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 512,
          temperature: 0.2,
          messages: [{ role: 'user', content: prompt }],
        });

        const firstBlock = message.content[0];
        const responseText = firstBlock != null && firstBlock.type === 'text' ? firstBlock.text.trim() : '{}';
        const cleaned = responseText.replace(/^```json/i, '').replace(/```$/i, '').trim();
        const parsed = JSON.parse(cleaned) as Partial<NoteAutofillSuggestions>;

        if (Array.isArray(parsed.suggestedActivities) && parsed.suggestedActivities.length > 0) {
          return {
            suggestedActivities: parsed.suggestedActivities,
            suggestedMood: (typeof parsed.suggestedMood === 'string' && parsed.suggestedMood !== '')
              ? parsed.suggestedMood
              : (mostCommonMood ?? 'Pleasant & cooperative'),
            commonPhrases: (Array.isArray(parsed.commonPhrases) && parsed.commonPhrases.length > 0)
              ? parsed.commonPhrases
              : commonPhrases,
            noteStarter: (typeof parsed.noteStarter === 'string' && parsed.noteStarter !== '')
              ? parsed.noteStarter
              : noteStarter,
            analyzedNotesCount: analyzedCount,
            dateRange: {
              from: fromDate,
              to: toDate,
            },
            generatedAt: nowIso,
          };
        }
      } catch (aiErr) {
        console.warn('AI suggestions generation fell back to heuristic aggregation:', aiErr);
      }
    }

    return {
      suggestedActivities,
      suggestedMood: mostCommonMood ?? 'Pleasant & cooperative',
      commonPhrases,
      noteStarter,
      analyzedNotesCount: analyzedCount,
      dateRange: {
        from: fromDate,
        to: toDate,
      },
      generatedAt: nowIso,
    };
  }
}
