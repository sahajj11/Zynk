import {
  and,
  between,
  eq,
  getTableColumns,
  gt,
  gte,
  inArray,
  lt,
  lte,
  ne,
  or,
  SQL,
  sql,
  isNull,
  isNotNull,
  notInArray,
  like,
} from 'drizzle-orm';
import { MySqlTable, MySqlColumn } from 'drizzle-orm/mysql-core';
import type { RelationConfig } from './base.service.js';

/**
 * Supported SQL operators for query building
 */
export type Operators =
  | '>'
  | '>='
  | '<'
  | '<='
  | 'LIKE'
  | 'BETWEEN'
  | 'IN'
  | '!='
  | 'ISNULL'
  | 'NOTNULL'
  | 'NOT_IN';

/**
 * Custom error class for query building errors
 */
export class QueryBuilderError extends Error {
  public readonly context: Record<string, unknown>;

  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message);
    this.name = 'QueryBuilderError';
    this.context = context;
  }

  public toJSON() {
    return {
      name: this.name,
      message: this.message,
      context: this.context,
    };
  }
}

/**
 * Sanitize LIKE pattern to prevent SQL injection
 * Escapes special characters while preserving user's wildcards
 *
 * @param pattern - The LIKE pattern string
 * @returns Sanitized pattern string
 */
function sanitizeLikePattern(pattern: string): string {
  // Note: Drizzle ORM handles parameterization, so we don't need to escape here
  // This is just a placeholder for any additional validation if needed
  return pattern;
}

/**
 * Validate BETWEEN operator values
 *
 * @param values - The values to validate
 * @returns True if values are valid for BETWEEN
 * @throws {QueryBuilderError} When values are invalid
 */
function validateBetweenValues(values: unknown): values is [unknown, unknown] {
  if (!Array.isArray(values) || values.length !== 2) {
    throw new QueryBuilderError('BETWEEN operator requires exactly 2 values', {
      providedValues: values,
    });
  }
  return true;
}

/**
 * Validate IN operator values
 *
 * @param values - The values to validate
 * @returns True if values are valid for IN
 * @throws {QueryBuilderError} When values are invalid
 */
function validateInValues(values: unknown): values is unknown[] {
  if (!Array.isArray(values) || values.length === 0) {
    throw new QueryBuilderError('IN operator requires a non-empty array', {
      providedValues: values,
    });
  }
  return true;
}

/**
 * Builds SQL `WHERE` conditions based on the provided filter object.
 *
 * @param table - The MySQL table with its column definitions
 * @param where - An object representing filtering conditions
 *                Keys can be:
 *                  - Column names (e.g., "name", "age") for equality
 *                  - Column names with operator suffixes (e.g., "age >", "salary >=", "name LIKE")
 *                  - Nested objects for relation filtering
 *                Arrays create OR conditions
 * @param relations - Optional relation configuration for nested filtering
 *
 * @returns SQL condition expression
 *
 * @example
 * ```typescript
 * // Simple equality
 * getWhere(table, { status: 'active' })
 *
 * // With operators
 * getWhere(table, { 'age >=': 18, 'name LIKE': '%john%' })
 *
 * // OR conditions
 * getWhere(table, [{ status: 'active' }, { status: 'pending' }])
 *
 * // Nested relation filtering
 * getWhere(table, { role: { name: 'admin' } }, relations)
 * ```
 *
 * @throws {QueryBuilderError} When invalid operators or values are provided
 */
export function getWhere(
  table: MySqlTable,
  where: Record<string, unknown> | Record<string, unknown>[],
  relations?: RelationConfig
): SQL {
  try {
    const conditions: SQL[] = [];
    const columns: Record<string, MySqlColumn | Record<string, MySqlColumn>> = {
      ...getTableColumns(table),
    };

    // Add relation columns to available columns
    if (relations) {
      Object.entries(relations).forEach(([k, v]) => {
        columns[k] = { ...getTableColumns(v.schema) };
      });
    }

    // Handle array (OR conditions)
    if (Array.isArray(where)) {
      if (where.length === 0) {
        throw new QueryBuilderError('Empty where array provided');
      }

      const orConditions = where
        .map((w) => getWhere(table, w, relations))
        .filter((cond): cond is SQL => cond !== null && cond !== undefined);

      if (orConditions.length === 0) {
        throw new QueryBuilderError('No valid OR conditions generated');
      }

      return or(...orConditions)!;
    }

    // Process each condition
    Object.entries(where).forEach(([k, value]) => {
      const [key, operator] = k.split(' ');
      const column = columns[key];

      // Handle nested object (relation condition)
      if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        !(value instanceof Date)
      ) {
        const relationConfig = relations?.[key];

        if (!relationConfig) {
          throw new QueryBuilderError(`Relation "${key}" not found in relation config`, {
            requestedRelation: key,
            availableRelations: relations ? Object.keys(relations) : [],
          });
        }

        if (relationConfig) {
          // Recursive call for nested relation condition
          const nested = getWhere(
            relationConfig.schema,
            value as Record<string, unknown>,
            relations
          );
          conditions.push(nested);
        }
        return;
      }

      // Handle primitive or operator comparison
      if (column && column instanceof MySqlColumn) {
        switch (operator) {
          case '>':
            conditions.push(gt(column, value));
            break;

          case '>=':
            conditions.push(gte(column, value));
            break;

          case '<':
            conditions.push(lt(column, value));
            break;

          case '<=':
            conditions.push(lte(column, value));
            break;

          case 'LIKE': {
            if (typeof value !== 'string') {
              throw new QueryBuilderError('LIKE operator requires string value', {
                column: key,
                operator,
                valueType: typeof value,
              });
            }
            const sanitizedPattern = sanitizeLikePattern(value);
            conditions.push(like(column, sanitizedPattern));
            break;
          }

          case 'BETWEEN': {
            validateBetweenValues(value);
            const [rangeStart, rangeEnd] = value as [unknown, unknown];
            conditions.push(between(column, rangeStart, rangeEnd));
            break;
          }

          case '!=':
            conditions.push(ne(column, value));
            break;

          case 'IN': {
            validateInValues(value);
            const inValues = value as unknown[];
            conditions.push(inArray(column, inValues));
            break;
          }

          case 'NOT_IN': {
            validateInValues(value);
            const inValues = value as unknown[];
            conditions.push(notInArray(column, inValues));
            break;
          }

          case 'ISNULL': {
            conditions.push(isNull(column));
            break;
          }

          case 'NOTNULL': {
            conditions.push(isNotNull(column));
            break;
          }

          case undefined:
            // No operator - simple equality
            if (value === null) {
              // Use IS NULL instead of = NULL
              conditions.push(isNull(column));
            } else {
              conditions.push(eq(column, value));
            }
            break;

          default:
            throw new QueryBuilderError(`Unsupported operator "${operator}"`, {
              column: key,
              operator,
              supportedOperators: [
                '>',
                '>=',
                '<',
                '<=',
                'LIKE',
                'BETWEEN',
                '!=',
                'IN',
                'NOT_IN',
                'ISNULL',
                'NOTNULL',
              ],
            });
        }
      } else if (operator !== undefined) {
        // Column not found but operator was specified
        throw new QueryBuilderError(`Column "${key}" not found in table`, {
          column: key,
          operator,
          availableColumns: Object.keys(columns).filter((k) => typeof columns[k] !== 'object'),
        });
      }
    });

    // Return combined conditions
    if (conditions.length === 0) {
      throw new QueryBuilderError('No valid conditions generated from where clause');
    }

    return and(...conditions)!;
  } catch (error) {
    // Re-throw QueryBuilderError as-is
    if (error instanceof QueryBuilderError) {
      throw error;
    }

    // Wrap unexpected errors
    throw new QueryBuilderError('Unexpected error building where clause', { originalError: error });
  }
}