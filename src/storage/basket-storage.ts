import fs from 'fs/promises';
import path from 'path';
import { cacheService } from '../cache/cache-service';

export interface PortfolioBasket {
  id: string;
  name: string;
  description?: string | undefined;
  institution?: string | undefined;
  createdAt: string | Date;
  totalValue: number;
  allocations: Array<{
    symbol: string;
    companyName?: string | undefined;
    targetWeight: number;
    targetValue: number;
    actualShares?: number | undefined;
    actualValue?: number | undefined;
    orderId?: string | undefined;
  }>;
  metadata?: {
    source?: string | undefined;
    institution?: string | undefined;
    filingDate?: string | undefined;
    totalPositions?: number | undefined;
    rebalanceThreshold?: number | undefined;
  } | undefined;
  status?: 'pending' | 'executed' | 'partial' | 'failed' | undefined;
}

export interface StoredBasket extends PortfolioBasket {
  updatedAt: Date;
}

export class BasketStorageService {
  private readonly dataDir: string;
  private readonly basketsFile: string;
  private basketsCache: StoredBasket[] | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL = 60000; // 1 minute

  constructor() {
    this.dataDir = path.join(process.cwd(), 'data');
    this.basketsFile = path.join(this.dataDir, 'baskets.json');
  }

  /**
   * Initialize storage directory and file if they don't exist
   */
  async initialize(): Promise<void> {
    try {
      await fs.access(this.dataDir);
    } catch {
      await fs.mkdir(this.dataDir, { recursive: true });
    }

    try {
      await fs.access(this.basketsFile);
    } catch {
      await fs.writeFile(this.basketsFile, JSON.stringify([], null, 2));
    }
  }

  /**
   * Load all baskets from storage
   */
  async loadBaskets(): Promise<StoredBasket[]> {
    try {
      // Check in-memory cache first
      if (this.basketsCache && Date.now() - this.cacheTimestamp < this.CACHE_TTL) {
        return this.basketsCache;
      }

      const data = await fs.readFile(this.basketsFile, 'utf-8');
      const baskets = JSON.parse(data);
      
      // Convert date strings back to Date objects
      const parsedBaskets = baskets.map((basket: any) => ({
        ...basket,
        createdAt: new Date(basket.createdAt),
        updatedAt: new Date(basket.updatedAt)
      }));

      // Update cache
      this.basketsCache = parsedBaskets;
      this.cacheTimestamp = Date.now();
      
      return parsedBaskets;
    } catch (error) {
      console.error('Error loading baskets:', error);
      return [];
    }
  }

  /**
   * Save a basket to storage
   */
  async saveBasket(basket: PortfolioBasket): Promise<void> {
    try {
      const baskets = await this.loadBaskets();
      const existingIndex = baskets.findIndex(b => b.id === basket.id);
      
      const storedBasket: StoredBasket = {
        ...basket,
        createdAt: typeof basket.createdAt === 'string' ? new Date(basket.createdAt) : basket.createdAt,
        updatedAt: new Date()
      };

      if (existingIndex >= 0) {
        baskets[existingIndex] = storedBasket;
      } else {
        baskets.push(storedBasket);
      }

      // Write to file and update cache atomically
      await fs.writeFile(this.basketsFile, JSON.stringify(baskets, null, 2));
      
      // Update cache
      this.basketsCache = baskets;
      this.cacheTimestamp = Date.now();
    } catch (error) {
      console.error('Error saving basket:', error);
      throw new Error('Failed to save basket');
    }
  }

  /**
   * Update a specific basket
   */
  async updateBasket(basketId: string, updates: Partial<PortfolioBasket>): Promise<void> {
    try {
      const baskets = await this.loadBaskets();
      const basketIndex = baskets.findIndex(b => b.id === basketId);
      
      if (basketIndex === -1) {
        throw new Error(`Basket with ID ${basketId} not found`);
      }

      const currentBasket = baskets[basketIndex];
      if (!currentBasket) {
        throw new Error(`Basket with ID ${basketId} not found`);
      }
      
      const updatedBasket: StoredBasket = {
        id: currentBasket.id,
        name: updates.name !== undefined ? updates.name : currentBasket.name,
        description: updates.description !== undefined ? updates.description : currentBasket.description,
        institution: updates.institution !== undefined ? updates.institution : currentBasket.institution,
        createdAt: currentBasket.createdAt,
        totalValue: updates.totalValue !== undefined ? updates.totalValue : currentBasket.totalValue,
        allocations: updates.allocations !== undefined ? updates.allocations : currentBasket.allocations,
        metadata: updates.metadata !== undefined ? updates.metadata : currentBasket.metadata,
        status: updates.status !== undefined ? updates.status : currentBasket.status,
        updatedAt: new Date()
      };

      baskets[basketIndex] = updatedBasket;

      // Write to file and update cache atomically
      await fs.writeFile(this.basketsFile, JSON.stringify(baskets, null, 2));
      
      // Update cache
      this.basketsCache = baskets;
      this.cacheTimestamp = Date.now();
    } catch (error) {
      console.error('Error updating basket:', error);
      throw new Error('Failed to update basket');
    }
  }

  /**
   * Delete a basket
   */
  async deleteBasket(basketId: string): Promise<void> {
    try {
      const baskets = await this.loadBaskets();
      const filteredBaskets = baskets.filter(b => b.id !== basketId);
      
      if (baskets.length === filteredBaskets.length) {
        throw new Error(`Basket with ID ${basketId} not found`);
      }

      // Write to file and update cache atomically
      await fs.writeFile(this.basketsFile, JSON.stringify(filteredBaskets, null, 2));
      
      // Update cache
      this.basketsCache = filteredBaskets;
      this.cacheTimestamp = Date.now();
    } catch (error) {
      console.error('Error deleting basket:', error);
      throw new Error('Failed to delete basket');
    }
  }

  /**
   * Get a specific basket by ID
   */
  async getBasket(basketId: string): Promise<StoredBasket | null> {
    try {
      const baskets = await this.loadBaskets();
      return baskets.find(b => b.id === basketId) || null;
    } catch (error) {
      console.error('Error getting basket:', error);
      return null;
    }
  }

  /**
   * Clear in-memory cache
   */
  clearCache(): void {
    this.basketsCache = null;
    this.cacheTimestamp = 0;
  }

  /**
   * Update basket execution details for a specific holding
   */
  async updateBasketExecution(
    basketId: string, 
    symbol: string, 
    actualShares: number, 
    actualValue: number, 
    orderId: string
  ): Promise<void> {
    try {
      const baskets = await this.loadBaskets();
      const basketIndex = baskets.findIndex(b => b.id === basketId);
      
      if (basketIndex === -1) {
        throw new Error(`Basket with ID ${basketId} not found`);
      }

      const basket = baskets[basketIndex];
      if (!basket) {
        throw new Error(`Basket with ID ${basketId} not found`);
      }

      const holdingIndex = basket.allocations.findIndex((h: any) => h.symbol === symbol);
      
      if (holdingIndex === -1) {
        throw new Error(`Holding ${symbol} not found in basket ${basketId}`);
      }

      const existingHolding = basket.allocations[holdingIndex];
      if (!existingHolding) {
        throw new Error(`Holding ${symbol} not found in basket ${basketId}`);
      }

      basket.allocations[holdingIndex] = {
        symbol: existingHolding.symbol,
        companyName: existingHolding.companyName,
        targetWeight: existingHolding.targetWeight,
        targetValue: existingHolding.targetValue,
        actualShares,
        actualValue,
        orderId
      };

      // Update basket status based on execution progress
      const totalExecuted = basket.allocations.filter((h: any) => h.orderId).length;
      const totalHoldings = basket.allocations.length;
      
      if (totalExecuted === totalHoldings) {
        basket.status = 'executed';
      } else if (totalExecuted > 0) {
        basket.status = 'partial';
      }

      // Save updated basket
      await this.updateBasket(basketId, basket);
    } catch (error) {
      console.error('Error updating basket execution:', error);
      throw new Error('Failed to update basket execution');
    }
  }

  /**
   * Get all baskets with optional filtering
   */
  async getBaskets(filters?: {
    status?: string;
    institution?: string;
    limit?: number;
  }): Promise<StoredBasket[]> {
    try {
      let baskets = await this.loadBaskets();
      
      // Apply filters
      if (filters?.status) {
        baskets = baskets.filter(b => b.status === filters.status);
      }
      
      if (filters?.institution) {
        baskets = baskets.filter(b => 
          b.institution?.toLowerCase().includes(filters.institution!.toLowerCase())
        );
      }
      
      // Sort by creation date (newest first)
      baskets.sort((a, b) => {
        const aDate = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
        const bDate = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
        return bDate.getTime() - aDate.getTime();
      });
      
      // Apply limit
      if (filters?.limit) {
        baskets = baskets.slice(0, filters.limit);
      }
      
      return baskets;
    } catch (error) {
      console.error('Error getting baskets:', error);
      return [];
    }
  }
} 