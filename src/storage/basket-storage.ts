import fs from 'fs/promises';
import path from 'path';
import { PortfolioBasket } from '../services/thirteenth-f-service';

export interface StoredBasket extends PortfolioBasket {
  updatedAt: Date;
}

export class BasketStorageService {
  private readonly dataDir: string;
  private readonly basketsFile: string;

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
      const data = await fs.readFile(this.basketsFile, 'utf-8');
      const baskets = JSON.parse(data);
      
      // Convert date strings back to Date objects
      return baskets.map((basket: any) => ({
        ...basket,
        createdAt: new Date(basket.createdAt),
        updatedAt: new Date(basket.updatedAt)
      }));
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
      
      // @ts-ignore - TypeScript has trouble inferring the spread type here
      const storedBasket: StoredBasket = {
        ...basket,
        updatedAt: new Date()
      };

      if (existingIndex >= 0) {
        baskets[existingIndex] = storedBasket;
      } else {
        baskets.push(storedBasket);
      }

      await fs.writeFile(this.basketsFile, JSON.stringify(baskets, null, 2));
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

      // @ts-ignore - TypeScript has trouble inferring the spread type here
      const updatedBasket: StoredBasket = {
        ...baskets[basketIndex],
        ...updates,
        updatedAt: new Date()
      };

      baskets[basketIndex] = updatedBasket;

      await fs.writeFile(this.basketsFile, JSON.stringify(baskets, null, 2));
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

      await fs.writeFile(this.basketsFile, JSON.stringify(filteredBaskets, null, 2));
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

      const holdingIndex = basket.holdings.findIndex(h => h.symbol === symbol);
      
      if (holdingIndex === -1) {
        throw new Error(`Holding ${symbol} not found in basket ${basketId}`);
      }

      const existingHolding = basket.holdings[holdingIndex];
      if (!existingHolding) {
        throw new Error(`Holding ${symbol} not found in basket ${basketId}`);
      }

      basket.holdings[holdingIndex] = {
        symbol: existingHolding.symbol,
        targetWeight: existingHolding.targetWeight,
        actualShares,
        actualValue,
        orderId
      };

      // Update basket status based on execution progress
      const totalExecuted = basket.holdings.filter(h => h.orderId).length;
      const totalHoldings = basket.holdings.length;
      
      if (totalExecuted === totalHoldings) {
        basket.status = 'executed';
      } else if (totalExecuted > 0) {
        basket.status = 'partial';
      }

      basket.updatedAt = new Date();
      
      await fs.writeFile(this.basketsFile, JSON.stringify(baskets, null, 2));
    } catch (error) {
      console.error('Error updating basket execution:', error);
      throw new Error('Failed to update basket execution');
    }
  }

  /**
   * Get baskets with optional filtering
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
          b.institution.toLowerCase().includes(filters.institution!.toLowerCase())
        );
      }
      
      // Sort by creation date (newest first)
      baskets.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      
      // Apply limit
      if (filters?.limit) {
        baskets = baskets.slice(0, filters.limit);
      }
      
      return baskets;
    } catch (error) {
      console.error('Error getting baskets with filters:', error);
      return [];
    }
  }
} 