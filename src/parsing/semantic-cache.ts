import OpenAI from 'openai';
import { TradeIntent } from '../types';
import { config } from '../config';

interface SemanticCacheEntry {
  input: string;
  embedding: number[];
  intent: TradeIntent;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
}

interface SimilarityResult {
  entry: SemanticCacheEntry;
  similarity: number;
}

export class SemanticCacheService {
  private cache = new Map<string, SemanticCacheEntry>();
  private openai: OpenAI;
  private readonly SIMILARITY_THRESHOLD = 0.85;
  private readonly MAX_CACHE_SIZE = 1000;
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
  private readonly EMBEDDING_MODEL = 'text-embedding-3-small';
  
  // LRU eviction tracking
  private accessOrder: string[] = [];

  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openaiApiKey,
    });
  }

  /**
   * Get cached intent if semantic similarity is high enough
   */
  async getSemanticMatch(input: string): Promise<TradeIntent | null> {
    try {
      const startTime = Date.now();
      
      // Quick hash check first
      const quickMatch = this.getExactMatch(input);
      if (quickMatch) {
        this.updateAccessStats(quickMatch, startTime);
        return quickMatch.intent;
      }

      // Generate embedding for input
      const embedding = await this.getEmbedding(input);
      if (!embedding) return null;

      // Find best semantic match
      const bestMatch = this.findBestMatch(embedding);
      
      if (bestMatch && bestMatch.similarity >= this.SIMILARITY_THRESHOLD) {
        console.log(`🎯 Semantic cache hit: ${bestMatch.similarity.toFixed(3)} similarity`);
        this.updateAccessStats(bestMatch.entry, startTime);
        return bestMatch.entry.intent;
      }

      return null;
    } catch (error) {
      console.warn('Semantic cache lookup failed:', error);
      return null;
    }
  }

  /**
   * Cache intent with semantic embedding
   */
  async cacheWithEmbedding(input: string, intent: TradeIntent): Promise<void> {
    try {
      // Don't cache if we're at capacity and this is low-value
      if (this.cache.size >= this.MAX_CACHE_SIZE) {
        this.evictLeastUsed();
      }

      const embedding = await this.getEmbedding(input);
      if (!embedding) return;

      const cacheKey = this.createCacheKey(input);
      const entry: SemanticCacheEntry = {
        input,
        embedding,
        intent,
        timestamp: Date.now(),
        accessCount: 1,
        lastAccessed: Date.now()
      };

      this.cache.set(cacheKey, entry);
      this.updateAccessOrder(cacheKey);
      
      console.log(`💾 Cached semantic entry: "${input}" (cache size: ${this.cache.size})`);
    } catch (error) {
      console.warn('Failed to cache with embedding:', error);
    }
  }

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    averageSimilarity: number;
    oldestEntry: number;
    memoryUsage: number;
  } {
    if (this.cache.size === 0) {
      return {
        size: 0,
        maxSize: this.MAX_CACHE_SIZE,
        hitRate: 0,
        averageSimilarity: 0,
        oldestEntry: 0,
        memoryUsage: 0
      };
    }

    const entries = Array.from(this.cache.values());
    const totalAccess = entries.reduce((sum, entry) => sum + entry.accessCount, 0);
    const avgAccess = totalAccess / entries.length;
    const oldestTimestamp = Math.min(...entries.map(e => e.timestamp));
    
    // Estimate memory usage (rough calculation)
    const avgEmbeddingSize = 1536 * 4; // text-embedding-3-small is 1536 dimensions, 4 bytes per float
    const avgEntrySize = avgEmbeddingSize + 500; // embedding + metadata
    const memoryUsage = this.cache.size * avgEntrySize;

    return {
      size: this.cache.size,
      maxSize: this.MAX_CACHE_SIZE,
      hitRate: avgAccess > 1 ? (avgAccess - 1) / avgAccess : 0,
      averageSimilarity: this.calculateAverageSimilarity(),
      oldestEntry: Date.now() - oldestTimestamp,
      memoryUsage
    };
  }

  /**
   * Clear expired entries
   */
  clearExpired(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.CACHE_TTL) {
        this.cache.delete(key);
        this.removeFromAccessOrder(key);
        removed++;
      }
    }

    console.log(`🧹 Cleared ${removed} expired semantic cache entries`);
    return removed;
  }

  /**
   * Preload cache with common patterns
   */
  async warmCache(commonPatterns: Array<{input: string, intent: TradeIntent}>): Promise<void> {
    console.log(`🔥 Warming semantic cache with ${commonPatterns.length} patterns...`);
    
    const promises = commonPatterns.map(async (pattern) => {
      try {
        await this.cacheWithEmbedding(pattern.input, pattern.intent);
      } catch (error) {
        console.warn(`Failed to warm cache for: ${pattern.input}`, error);
      }
    });

    await Promise.allSettled(promises);
    console.log(`✅ Cache warming complete. Size: ${this.cache.size}`);
  }

  /**
   * Get similar cached entries for analysis
   */
  async findSimilarEntries(input: string, limit: number = 5): Promise<SimilarityResult[]> {
    const embedding = await this.getEmbedding(input);
    if (!embedding) return [];

    const similarities: SimilarityResult[] = [];
    
    for (const entry of this.cache.values()) {
      const similarity = this.cosineSimilarity(embedding, entry.embedding);
      similarities.push({ entry, similarity });
    }

    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  private async getEmbedding(text: string): Promise<number[] | null> {
    try {
      // Skip embedding for very short or very long inputs
      if (text.length < 3 || text.length > 1000) {
        return null;
      }

      const response = await this.openai.embeddings.create({
        model: this.EMBEDDING_MODEL,
        input: text.toLowerCase().trim(),
      });

      return response.data[0]?.embedding || null;
    } catch (error) {
      console.warn('Failed to generate embedding:', error);
      return null;
    }
  }

  private getExactMatch(input: string): SemanticCacheEntry | null {
    const cacheKey = this.createCacheKey(input);
    const entry = this.cache.get(cacheKey);
    
    if (entry && Date.now() - entry.timestamp < this.CACHE_TTL) {
      return entry;
    }
    
    if (entry) {
      // Remove expired entry
      this.cache.delete(cacheKey);
      this.removeFromAccessOrder(cacheKey);
    }
    
    return null;
  }

  private findBestMatch(embedding: number[]): SimilarityResult | null {
    let bestMatch: SimilarityResult | null = null;
    let highestSimilarity = 0;

    for (const entry of this.cache.values()) {
      // Skip expired entries
      if (Date.now() - entry.timestamp > this.CACHE_TTL) {
        continue;
      }

      const similarity = this.cosineSimilarity(embedding, entry.embedding);
      
      if (similarity > highestSimilarity) {
        highestSimilarity = similarity;
        bestMatch = { entry, similarity };
      }
    }

    return bestMatch;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      const aVal = a[i] ?? 0;
      const bVal = b[i] ?? 0;
      dotProduct += aVal * bVal;
      normA += aVal * aVal;
      normB += bVal * bVal;
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  private createCacheKey(input: string): string {
    // Normalize input for consistent keying
    return input.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  private updateAccessStats(entry: SemanticCacheEntry, startTime: number): void {
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    
    const cacheKey = this.createCacheKey(entry.input);
    this.updateAccessOrder(cacheKey);
    
    const lookupTime = Date.now() - startTime;
    console.log(`⚡ Semantic cache hit in ${lookupTime}ms (${entry.accessCount} accesses)`);
  }

  private updateAccessOrder(key: string): void {
    // Remove from current position if exists
    this.removeFromAccessOrder(key);
    
    // Add to front (most recently used)
    this.accessOrder.unshift(key);
  }

  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  private evictLeastUsed(): void {
    if (this.accessOrder.length === 0) return;

    // Remove least recently used (last in array)
    const lruKey = this.accessOrder.pop();
    if (lruKey && this.cache.has(lruKey)) {
      const evicted = this.cache.get(lruKey);
      this.cache.delete(lruKey);
      console.log(`🗑️ Evicted LRU entry: "${evicted?.input}" (${evicted?.accessCount} accesses)`);
    }
  }

  private calculateAverageSimilarity(): number {
    if (this.cache.size < 2) return 0;

    const entries = Array.from(this.cache.values());
    let totalSimilarity = 0;
    let comparisons = 0;

    // Sample a subset for performance
    const sampleSize = Math.min(50, entries.length);
    const sampledEntries = entries.slice(0, sampleSize);

    for (let i = 0; i < sampledEntries.length; i++) {
      for (let j = i + 1; j < sampledEntries.length; j++) {
        const similarity = this.cosineSimilarity(
          sampledEntries[i]?.embedding || [],
          sampledEntries[j]?.embedding || []
        );
        totalSimilarity += similarity;
        comparisons++;
      }
    }

    return comparisons > 0 ? totalSimilarity / comparisons : 0;
  }
}

// Global semantic cache instance
export const semanticCache = new SemanticCacheService();

// Auto-cleanup expired entries every 30 minutes
setInterval(() => {
  semanticCache.clearExpired();
}, 30 * 60 * 1000);