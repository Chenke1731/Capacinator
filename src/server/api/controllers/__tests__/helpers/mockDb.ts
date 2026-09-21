/**
 * Mock database helper for testing controllers that use Knex.
 *
 * This creates a mock that mimics Knex query builder behavior:
 * - Chainable: methods return the builder for chaining
 * - Thenable: can be awaited like a real query
 * - Configurable: tests can set what data to return
 *
 * @example
 * ```typescript
 * import { createMockDb } from './helpers/mockDb';
 *
 * const mockDb = createMockDb();
 * mockDb._setQueryResult([{ id: 1, name: 'Test' }]);
 * mockDb._setCountResult(1);
 *
 * // Controller uses it:
 * const results = await this.db('table').where('id', 1);
 * // Returns: [{ id: 1, name: 'Test' }]
 * ```
 */
export function createMockDb() {
  // Storage for mock data that tests can configure
  let queryResult: any[] = [];
  let firstResult: any = null;
  let countResult = { count: 0 };
  let insertResult: any[] = [];
  let updateResult: any[] = [];
  let deleteResult = 0;

  // Queue storage for sequential different responses
  let queryResultQueue: any[][] = [];
  let firstResultQueue: any[] = [];
  let insertResultQueue: any[][] = [];
  let updateResultQueue: any[][] = [];

  // Storage for errors to throw
  let errorQueue: Error[] = [];

  // Storage for tracking method calls
  let whereCalls: any[][] = [];

  // Track if count() was called in the current chain
  let countWasCalled = false;

  // Main mock function - calling it returns itself for chaining
  const mock: any = jest.fn(() => {
    // Reset count flag when starting a new chain
    countWasCalled = false;
    return mock;
  });

  // Query building methods (all return self for chaining)
  mock.where = jest.fn().mockImplementation((...args) => {
    whereCalls.push(args);
    return mock;
  });
  mock.andWhere = jest.fn().mockReturnValue(mock);
  mock.orWhere = jest.fn().mockReturnValue(mock);
  mock.whereIn = jest.fn().mockReturnValue(mock);
  mock.whereNotIn = jest.fn().mockReturnValue(mock);
  mock.whereNull = jest.fn().mockReturnValue(mock);
  mock.whereNotNull = jest.fn().mockReturnValue(mock);
  mock.whereBetween = jest.fn().mockReturnValue(mock);
  mock.whereNotBetween = jest.fn().mockReturnValue(mock);
  mock.whereRaw = jest.fn().mockReturnValue(mock);
  mock.andWhereRaw = jest.fn().mockReturnValue(mock);
  mock.whereExists = jest.fn().mockReturnValue(mock);
  mock.whereNotExists = jest.fn().mockReturnValue(mock);
  mock.join = jest.fn().mockReturnValue(mock);
  mock.leftJoin = jest.fn().mockReturnValue(mock);
  mock.rightJoin = jest.fn().mockReturnValue(mock);
  mock.innerJoin = jest.fn().mockReturnValue(mock);
  mock.outerJoin = jest.fn().mockReturnValue(mock);
  mock.crossJoin = jest.fn().mockReturnValue(mock);
  mock.select = jest.fn().mockReturnValue(mock);
  mock.orderBy = jest.fn().mockReturnValue(mock);
  mock.groupBy = jest.fn().mockReturnValue(mock);
  mock.having = jest.fn().mockReturnValue(mock);
  mock.limit = jest.fn().mockReturnValue(mock);
  mock.offset = jest.fn().mockReturnValue(mock);
  mock.sum = jest.fn().mockReturnValue(mock);
  mock.avg = jest.fn().mockReturnValue(mock);
  mock.min = jest.fn().mockReturnValue(mock);
  mock.max = jest.fn().mockReturnValue(mock);
  mock.count = jest.fn().mockReturnValue(mock);
  mock.returning = jest.fn().mockReturnValue(mock);
  mock.distinct = jest.fn().mockReturnValue(mock);
  mock.distinctOn = jest.fn().mockReturnValue(mock);
  mock.as = jest.fn().mockReturnValue(mock);

  // Make the mock thenable (so it can be awaited)
  // This is what allows: await db('table').where(...)
  // Return a proper Promise that resolves with queryResult
  // Check queue first for sequential different responses
  mock.then = jest.fn((onFulfilled, onRejected) => {
    // Check if there's a queued query result first (priority over errors)
    // This allows specific queries to succeed before hitting a queued error
    if (queryResultQueue.length > 0) {
      const data = queryResultQueue.shift();
      return new Promise((resolve, reject) => {
        queueMicrotask(() => {
          try {
            const result = onFulfilled ? onFulfilled(data) : data;
            resolve(result);
          } catch (error) {
            reject(error);
          }
        });
      });
    }

    // Check if there's an error to throw (only if no queued result)
    if (errorQueue.length > 0) {
      const error = errorQueue.shift();
      return Promise.reject(error).then(onFulfilled, onRejected);
    }

    // Fall back to global queryResult
    return new Promise((resolve, reject) => {
      queueMicrotask(() => {
        try {
          const result = onFulfilled ? onFulfilled(queryResult) : queryResult;
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    });
  });
  mock.catch = jest.fn((reject) => {
    return Promise.resolve(queryResult).catch(reject);
  });

  // Terminal query methods (these execute the query)

  /**
   * Mock for .first() - returns a single record
   * Checks queue first for sequential different responses
   * If .count() was called before .first(), returns countResult (unless queue has a value)
   */
  mock.first = jest.fn().mockImplementation(() => {
    // Capture data ONCE when .first() is called (not when then/catch are called)
    // This prevents the queue from being shifted multiple times
    let data;
    if (countWasCalled) {
      // If there's a queued first result, use that even if count was called
      // This allows tests to override the default count result
      if (firstResultQueue.length > 0) {
        data = firstResultQueue.shift();
      } else {
        // Otherwise use count result
        data = countResult;
      }
      countWasCalled = false; // Reset flag after use
    } else {
      // Normal first() behavior when count wasn't called
      data = firstResultQueue.length > 0 ? firstResultQueue.shift() : firstResult;
    }

    return {
      then: (resolve: any) => {
        return Promise.resolve(data).then(resolve);
      },
      catch: (reject: any) => {
        return Promise.resolve(data).catch(reject);
      }
    };
  });

  /**
   * Mock for .insert() - returns inserted records
   * Checks queue first for sequential different responses
   */
  mock.insert = jest.fn().mockImplementation((_data) => {
    // Capture result ONCE when .insert() is called
    const result = insertResultQueue.length > 0 ? insertResultQueue.shift() : insertResult;

    return {
      then: (resolve: any) => {
        return Promise.resolve(result).then(resolve);
      },
      catch: (reject: any) => {
        return Promise.resolve(result).catch(reject);
      },
      returning: jest.fn().mockImplementation(() => {
        // Use the same result captured above
        return {
          then: (resolve: any) => {
            return Promise.resolve(result).then(resolve);
          },
          catch: (reject: any) => {
            return Promise.resolve(result).catch(reject);
          }
        };
      })
    };
  });

  /**
   * Mock for .update() - returns updated records
   * Checks queue first for sequential different responses
   */
  mock.update = jest.fn().mockImplementation((_data) => {
    // Capture result ONCE when .update() is called
    const result = updateResultQueue.length > 0 ? updateResultQueue.shift() : updateResult;

    return {
      then: (resolve: any) => {
        return Promise.resolve(result).then(resolve);
      },
      catch: (reject: any) => {
        return Promise.resolve(result).catch(reject);
      },
      returning: jest.fn().mockImplementation(() => {
        // Use the same result captured above
        return {
          then: (resolve: any) => {
            return Promise.resolve(result).then(resolve);
          },
          catch: (reject: any) => {
            return Promise.resolve(result).catch(reject);
          }
        };
      })
    };
  });

  /**
   * Mock for .del() / .delete() - returns number of deleted records
   */
  mock.del = jest.fn().mockImplementation(() => {
    return {
      then: (resolve: any) => Promise.resolve(deleteResult).then(resolve),
      catch: (reject: any) => Promise.resolve(deleteResult).catch(reject)
    };
  });

  // Knex supports both .del() and .delete()
  mock.delete = mock.del;

  /**
   * Mock for .count() - returns count result
   * Note: Knex count returns an array with a single object containing the count
   * Returns mock for chaining (to support .count().where().first())
   */
  mock.count = jest.fn().mockImplementation(() => {
    countWasCalled = true;
    return mock;
  });

  /**
   * Mock for .countDistinct() - like count but for distinct values
   * Returns mock for chaining (to support .countDistinct().where().first())
   */
  mock.countDistinct = jest.fn().mockImplementation(() => {
    countWasCalled = true;
    return mock;
  });

  /**
   * Mock for raw SQL queries
   * Returns a mock raw object that can be used in select/where clauses
   */
  mock.raw = jest.fn().mockImplementation((sql: string) => {
    // Return an object that represents the raw SQL
    // Knex internally uses this, but for mocking we just return a simple object
    return { sql, bindings: [] };
  });

  /**
   * Mock for transactions
   */
  mock.transaction = jest.fn().mockImplementation(async (callback) => {
    // Create a transaction mock that behaves like the main mock
    const trx = createMockDb();
    await callback(trx);
    return trx;
  });

  /**
   * Mock for schema operations
   */
  mock.schema = {
    hasTable: jest.fn().mockResolvedValue(true),
    createTable: jest.fn().mockReturnThis(),
    dropTable: jest.fn().mockReturnThis(),
    table: jest.fn().mockReturnThis()
  };

  // Helper methods for tests to configure what data the mock returns

  /**
   * Set the data that will be returned by query operations (select, etc.)
   * @param data Array of records to return
   */
  mock._setQueryResult = (data: any[]) => {
    queryResult = data;
  };

  /**
   * Set the data that will be returned by .first()
   * @param data Single record to return, or null
   */
  mock._setFirstResult = (data: any) => {
    firstResult = data;
  };

  /**
   * Set the count that will be returned by .count()
   * @param count Number to return as count
   */
  mock._setCountResult = (count: number) => {
    countResult = { count };
  };

  /**
   * Set the data that will be returned by .insert()
   * @param data Array of inserted records to return
   */
  mock._setInsertResult = (data: any[]) => {
    insertResult = data;
  };

  /**
   * Set the data that will be returned by .update()
   * @param data Array of updated records to return
   */
  mock._setUpdateResult = (data: any[]) => {
    updateResult = data;
  };

  /**
   * Set the number that will be returned by .delete() / .del()
   * @param count Number of records deleted
   */
  mock._setDeleteResult = (count: number) => {
    deleteResult = count;
  };

  // Queue methods for sequential different responses

  /**
   * Queue data to be returned by the next query operation
   * Use this when you need different results for sequential queries
   * @param data Array of records to return for the next query
   */
  mock._queueQueryResult = (data: any[]) => {
    queryResultQueue.push(data);
  };

  /**
   * Queue data to be returned by the next .first() call
   * Use this when you need different results for sequential .first() calls
   * @param data Single record to return for the next .first() call
   */
  mock._queueFirstResult = (data: any) => {
    firstResultQueue.push(data);
    if (process.env.DEBUG_MOCK) {
      console.log(`[mockDb._queueFirstResult] Queued:`, data, `Queue length now: ${firstResultQueue.length}`);
    }
  };

  /**
   * Queue data to be returned by the next .insert() call
   * @param data Array of inserted records to return
   */
  mock._queueInsertResult = (data: any[]) => {
    insertResultQueue.push(data);
  };

  /**
   * Queue data to be returned by the next .update() call
   * @param data Array of updated records to return
   */
  mock._queueUpdateResult = (data: any[]) => {
    updateResultQueue.push(data);
  };

  /**
   * Queue an error to be thrown on the next query operation
   * Use this to test error handling
   * @param error Error to throw
   */
  mock._queueError = (error: Error) => {
    errorQueue.push(error);
  };

  /**
   * Get all where clause calls that have been made
   * Returns an array of argument arrays
   * @returns Array of where clause call arguments
   */
  mock._getWhereCalls = () => {
    return whereCalls;
  };

  /**
   * Reset all mock data to empty/default values
   * Clears both global values and queues
   */
  mock._reset = () => {
    queryResult = [];
    firstResult = null;
    countResult = { count: 0 };
    insertResult = [];
    updateResult = [];
    deleteResult = 0;

    // Clear all queues
    queryResultQueue = [];
    firstResultQueue = [];
    insertResultQueue = [];
    updateResultQueue = [];
    errorQueue = [];

    // Clear tracking
    whereCalls = [];
  };

  return mock;
}

/**
 * Type definition for the mock database
 * Use this to properly type your mock in tests
 */
export type MockDb = ReturnType<typeof createMockDb>;

/**
 * Wait for all pending async operations to complete.
 * This is necessary when using queue methods because our thenable Promises
 * resolve asynchronously on the microtask queue.
 *
 * Call this after any controller method that uses queued mock data:
 * ```typescript
 * await controller.someMethod();
 * await flushPromises(); // Wait for all async operations to complete
 * expect(...).toBe(...);  // Now safe to check results
 * ```
 */
export async function flushPromises(): Promise<void> {
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
}
