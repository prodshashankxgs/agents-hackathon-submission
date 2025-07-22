// ============================================================================
// IN-MEMORY EVENT BUS - INFRASTRUCTURE LAYER
// ============================================================================

import {
  IEventBus,
  DomainEvent,
  EventHandler,
  InfrastructureError,
  ILogger
} from '../../core/interfaces';

export class InMemoryEventBus implements IEventBus {
  private handlers = new Map<string, Set<EventHandler<any>>>();
  private eventHistory: DomainEvent[] = [];
  private readonly MAX_HISTORY = 1000;

  constructor(private logger: ILogger) {
    this.logger.info('InMemoryEventBus initialized');
  }

  async publish(event: DomainEvent): Promise<void> {
    this.logger.debug('Publishing event', { 
      eventType: event.type, 
      eventId: event.id,
      aggregateId: event.aggregateId 
    });

    try {
      // Add to history
      this.eventHistory.push(event);
      if (this.eventHistory.length > this.MAX_HISTORY) {
        this.eventHistory = this.eventHistory.slice(-this.MAX_HISTORY);
      }

      // Get handlers for this event type
      const eventHandlers = this.handlers.get(event.type);
      
      if (!eventHandlers || eventHandlers.size === 0) {
        this.logger.debug('No handlers registered for event type', { eventType: event.type });
        return;
      }

      // Execute all handlers concurrently
      const handlerPromises = Array.from(eventHandlers).map(async (handler) => {
        try {
          await handler(event);
          this.logger.debug('Event handler executed successfully', { 
            eventType: event.type,
            eventId: event.id 
          });
        } catch (error) {
          this.logger.error('Event handler failed', error as Error, { 
            eventType: event.type,
            eventId: event.id 
          });
          // Don't rethrow - we don't want one handler failure to stop others
        }
      });

      await Promise.all(handlerPromises);

      this.logger.info('Event published successfully', { 
        eventType: event.type,
        eventId: event.id,
        handlerCount: eventHandlers.size 
      });

    } catch (error) {
      this.logger.error('Event publishing failed', error as Error, { 
        eventType: event.type,
        eventId: event.id 
      });
      
      throw new InfrastructureError(
        `Failed to publish event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'EVENT_PUBLISH_FAILED',
        'InMemoryEventBus',
        { event, originalError: error }
      );
    }
  }

  subscribe<T extends DomainEvent>(eventType: string, handler: EventHandler<T>): void {
    this.logger.debug('Subscribing to event type', { eventType });

    try {
      if (!this.handlers.has(eventType)) {
        this.handlers.set(eventType, new Set());
      }

      const eventHandlers = this.handlers.get(eventType)!;
      eventHandlers.add(handler);

      this.logger.info('Event handler subscribed', { 
        eventType,
        handlerCount: eventHandlers.size 
      });

    } catch (error) {
      this.logger.error('Event subscription failed', error as Error, { eventType });
      
      throw new InfrastructureError(
        `Failed to subscribe to event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'EVENT_SUBSCRIBE_FAILED',
        'InMemoryEventBus',
        { eventType, originalError: error }
      );
    }
  }

  unsubscribe(eventType: string, handler: EventHandler<any>): void {
    this.logger.debug('Unsubscribing from event type', { eventType });

    try {
      const eventHandlers = this.handlers.get(eventType);
      
      if (eventHandlers) {
        eventHandlers.delete(handler);
        
        // Clean up empty handler sets
        if (eventHandlers.size === 0) {
          this.handlers.delete(eventType);
        }

        this.logger.info('Event handler unsubscribed', { 
          eventType,
          remainingHandlers: eventHandlers.size 
        });
      }

    } catch (error) {
      this.logger.error('Event unsubscription failed', error as Error, { eventType });
      
      throw new InfrastructureError(
        `Failed to unsubscribe from event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'EVENT_UNSUBSCRIBE_FAILED',
        'InMemoryEventBus',
        { eventType, originalError: error }
      );
    }
  }

  // ===== ADDITIONAL UTILITY METHODS =====

  /**
   * Get all registered event types
   */
  getEventTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Get handler count for an event type
   */
  getHandlerCount(eventType: string): number {
    const handlers = this.handlers.get(eventType);
    return handlers ? handlers.size : 0;
  }

  /**
   * Get recent event history
   */
  getEventHistory(limit?: number): DomainEvent[] {
    const events = [...this.eventHistory];
    return limit ? events.slice(-limit) : events;
  }

  /**
   * Get events by type from history
   */
  getEventsByType(eventType: string, limit?: number): DomainEvent[] {
    const filteredEvents = this.eventHistory.filter(e => e.type === eventType);
    return limit ? filteredEvents.slice(-limit) : filteredEvents;
  }

  /**
   * Get events by aggregate from history
   */
  getEventsByAggregate(aggregateType: string, aggregateId: string, limit?: number): DomainEvent[] {
    const filteredEvents = this.eventHistory.filter(e => 
      e.aggregateType === aggregateType && e.aggregateId === aggregateId
    );
    return limit ? filteredEvents.slice(-limit) : filteredEvents;
  }

  /**
   * Clear event history
   */
  clearHistory(): void {
    const eventCount = this.eventHistory.length;
    this.eventHistory = [];
    
    this.logger.info('Event history cleared', { clearedEvents: eventCount });
  }

  /**
   * Get event bus statistics
   */
  getStats(): EventBusStats {
    const stats: EventBusStats = {
      totalEventTypes: this.handlers.size,
      totalHandlers: 0,
      eventHistory: this.eventHistory.length,
      eventTypes: []
    };

    for (const [eventType, handlers] of this.handlers) {
      stats.totalHandlers += handlers.size;
      stats.eventTypes.push({
        type: eventType,
        handlerCount: handlers.size
      });
    }

    return stats;
  }

  /**
   * Remove all handlers and clear history
   */
  clear(): void {
    const handlerCount = this.handlers.size;
    const eventCount = this.eventHistory.length;
    
    this.handlers.clear();
    this.eventHistory = [];
    
    this.logger.info('Event bus cleared', { 
      clearedHandlerTypes: handlerCount,
      clearedEvents: eventCount 
    });
  }
}

// ===== SUPPORTING TYPES =====

export interface EventBusStats {
  totalEventTypes: number;
  totalHandlers: number;
  eventHistory: number;
  eventTypes: Array<{
    type: string;
    handlerCount: number;
  }>;
}