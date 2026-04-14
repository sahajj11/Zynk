import {
    eq,
    desc,
    isNull,
    and,
    getTableName,
    getTableColumns,
    inArray,
    count,
    sum,
    asc,
    avg,
    sql,
    or,
} from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { MySqlTable, MySqlColumn, MySqlSelectBase } from 'drizzle-orm/mysql-core';
import type { SQL } from 'drizzle-orm';
import { getWhere } from './utils.js';
import type { Ctx } from './types.js';

type Primitive = string | number | boolean | Date | undefined;

type OperatorFilters = Record<`${string} ${string}`, Primitive | Primitive[]>;

type AdvancedWhere<T> = {
    [K in keyof T]?: T[K] | T[K][] | AdvancedWhere<T[K]>;
} & Partial<OperatorFilters>;

type TrueOnlyWhere<T> = {
    [k in keyof T]?: boolean | TrueOnlyWhere<Partial<T[k]>>;
};

type SortRecord<T> = {
    [k in keyof T]: 'asc' | 'desc' | SortRecord<Partial<T[k]>>;
};

type GroupByColumn = MySqlColumn | SQL;
type SelectObject = Record<string, SQL | MySqlColumn>;

export interface HasDateFields {
    createdAt?: string | Date | null;
    updatedAt?: string | Date | null;
    deletedAt?: string | Date | null;
    publishedAt?: string | Date | null;
}

export type RelationType = 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';

export interface RelationDefinition {
    /** The related table schema */
    schema: MySqlTable;
    /** The foreign key column in the source table */
    field: MySqlColumn;
    /** The reference column in the related table (usually primary key) */
    reference: MySqlColumn;
    /** Optional: Type of relationship */
    type?: RelationType;
    /** Optional: Whether the relation can be null */
    nullable?: boolean;
}

export type RelationConfig = Record<string, RelationDefinition>;


/**
 * Custom error class for service-layer errors
 */
export class ServiceError extends Error {
    public readonly statusCode: number;
    public readonly code: string;
    public readonly details?: unknown;

    constructor(message: string, statusCode = 500, code?: string, details?: unknown) {
        super(message);
        this.name = 'ServiceError';
        this.statusCode = statusCode;
        this.code = code ?? 'INTERNAL_ERROR';
        this.details = details;
    }

    public toJSON() {
        return {
            name: this.name,
            message: this.message,
            statusCode: this.statusCode,
            code: this.code,
            details: this.details,
        };
    }
}

export function getTableQuery(ctx: Ctx, tableName: string) {
    const queryInterface = (
        ctx.db.query as Record<
            string,
            {
                findFirst: (config: unknown) => Promise<unknown>;
                findMany: (config: unknown) => Promise<unknown[]>;
            }
        >
    )[tableName];
    if (!queryInterface || typeof queryInterface.findFirst !== 'function') {
        throw new ServiceError('Error', 400, `Query interface missing for table: ${tableName}`);
    }
    return queryInterface;
}

/**
 * Convert date to MySQL UTC format
 */
function toMySqlUTCString(date: string | Date): string {
    if (typeof date === 'string') {
        return new Date(date).toISOString().slice(0, 19).replace('T', ' ');
    }
    return date.toISOString().slice(0, 19).replace('T', ' ');
}

export class BaseService<TInsert, TSelect> {
    protected ctx: Ctx;
    protected relations: RelationConfig;

    constructor(
        public schema: MySqlTable,
        ctx: Ctx,
        relations: RelationConfig = {}
    ) {
        this.ctx = ctx;
        this.relations = relations;
    }

    getTableName(): string {
        return getTableName(this.schema);
    }

    #prepareData(
        data: Partial<TInsert>,
        {
            isCreate = false,
            autoUpdateUpdatedAt = false,
        }: { isCreate?: boolean; autoUpdateUpdatedAt?: boolean } = {}
    ): Partial<TInsert> {
        const columns = getTableColumns(this.schema);
        const preparedData: Record<string, unknown> = { ...data };

        if (isCreate && !preparedData.id && 'id' in columns) {
            preparedData.id = uuidv7();
        }

        // Validate Enums
        for (const column of Object.values(this.schema) as MySqlColumn[]) {
            if ('enumValues' in column && column.enumValues) {
                const fieldValue = preparedData[column.name];
                if (
                    fieldValue &&
                    typeof fieldValue === 'string' &&
                    !column.enumValues.includes(fieldValue)
                ) {
                    throw new ServiceError(
                        'Column Not Found',
                        400,
                        `Invalid value '${fieldValue}' for ${column.name}`
                    );
                }
            }
        }

        // Prepare Date fields
        const dateFields = ['createdAt', 'updatedAt', 'deletedAt', 'publishedAt'] as const;
        dateFields.forEach((field) => {
            if (
                field in columns &&
                preparedData[field] !== undefined &&
                preparedData[field] !== null &&
                (typeof preparedData[field] === 'string' || preparedData[field] instanceof Date)
            ) {
                preparedData[field] = toMySqlUTCString(preparedData[field] as string | Date);
            }
        });

        if (autoUpdateUpdatedAt && 'updatedAt' in columns) {
            preparedData.updatedAt = toMySqlUTCString(new Date());
        }

        return preparedData as Partial<TInsert>;
    }

    /**
     * Validate relation configuration
     */
    private validateRelation(key: string, relation: RelationDefinition): void {
        if (!relation.schema) {
            throw new ServiceError(
                `Relation "${key}" missing schema definition`,
                500,
                'INVALID_RELATION_CONFIG'
            );
        }
        if (!relation.field || !relation.reference) {
            throw new ServiceError(
                `Relation "${key}" missing field or reference column`,
                500,
                'INVALID_RELATION_CONFIG'
            );
        }
    }

    /**
     * Find by ID using getById internally
     */
    async findById(
        id: string | number,
        options?: { includeDeleted?: boolean }
    ): Promise<TSelect | null> {
        return this.getById(String(id), options?.includeDeleted ?? false);
    }

    /**
     * Get a record by ID
     */
    async getById(id: string, includeDeleted = false): Promise<TSelect | null> {
        const columns = getTableColumns(this.schema);

        if (!('id' in columns)) {
            throw new ServiceError(
                'Id Not In Column',
                400,
                "Schema does not have an 'id' field, cannot perform getById operation."
            );
        }

        const tableName = getTableName(this.schema);
        const tableQuery = getTableQuery(this.ctx, tableName);

        const conditions: SQL[] = [eq(columns.id as MySqlColumn, id)];

        if (!includeDeleted && 'deletedAt' in columns) {
            conditions.push(isNull(columns.deletedAt as MySqlColumn));
        }

        const record = await tableQuery.findFirst({
            where: and(...conditions),
        });

        return (record as TSelect) ?? null;
    }

    /**
     * Create a single record
     */
    async create(data: Omit<TInsert, 'id' | 'shortId'> & { id?: string }): Promise<TSelect> {
        const columns = getTableColumns(this.schema);
        const inputData = data as Record<string, unknown>;

        const currentDate = toMySqlUTCString(new Date());
        if ('createdAt' in columns && !inputData.createdAt) {
            inputData.createdAt = currentDate;
        }

        const finalData = this.#prepareData(inputData as Partial<TInsert>, {
            isCreate: true,
        }) as Record<string, unknown>;

        if ('id' in columns && !finalData.id) {
            finalData.id = uuidv7();
        }

        const insertedRows = await this.ctx.db
            .insert(this.schema)
            .values(finalData)
            .$returningId();

        if (!insertedRows || insertedRows.length === 0) {
            throw new ServiceError('Error Inserting', 500, 'Insertion failed: No rows returned.');
        }

        return insertedRows[0] as TSelect;
    }

    /**
     * Create multiple records
     */
    async createMany(data: Omit<TInsert, 'id'>[]): Promise<TSelect[]> {
        if (!data.length) {
            throw new ServiceError('Cannot Insert Empty Values', 400);
        }

        return Promise.all(
            data.map(async (row) => {
                const modified = this.#prepareData(row as TInsert, {
                    isCreate: true,
                });
                return await this.create(modified as TInsert & { id?: string });
            })
        );
    }

    /**
     * Update a single record by ID
     */
    async update(id: string, data: Partial<TInsert>): Promise<TSelect> {
        const columns = getTableColumns(this.schema);

        const finalData = this.#prepareData(data, { autoUpdateUpdatedAt: true });

        if (!('id' in columns)) {
            throw new ServiceError(
                'Id Not In Column',
                400,
                `Schema does not have an 'id' field, cannot update.`
            );
        }

        const updatedRows = await this.ctx.db
            .update(this.schema)
            .set(finalData)
            .where(eq(columns.id as MySqlColumn, id));

        if (!updatedRows || updatedRows[0].affectedRows === 0) {
            throw new ServiceError('Error Updating Row', 404, `No record found with ID: ${id}`);
        }

        // Fetch and return the updated record
        const updated = await this.getById(id, true);
        if (!updated) {
            throw new ServiceError('Error Fetching Updated Row', 500, `Could not fetch updated record`);
        }

        return updated;
    }

    /**
     * Bulk update multiple records
     */
    async bulkUpdate(updates: { id: string; data: Partial<TInsert> }[]): Promise<TSelect[]> {
        if (!updates.length) return [];

        updates.forEach(({ id, data }) => {
            if (!id) {
                throw new ServiceError(
                    'Id Not Found',
                    400,
                    'bulkUpdate error: Every update must include a valid ID.'
                );
            }
            if (typeof data !== 'object' || !data) {
                throw new ServiceError(
                    'Invalid Payload',
                    400,
                    `bulkUpdate error: Update data for ID ${id} is invalid.`
                );
            }
        });

        return Promise.all(updates.map(({ id, data }) => this.update(id, data)));
    }

    /**
     * Update many records (wrapper for bulkUpdate)
     */
    async updateMany(rows: ({ id: string | number } & Partial<TInsert>)[]): Promise<TSelect[]> {
        if (!rows.length) return [];

        return this.bulkUpdate(
            rows.map(({ id, ...data }) => ({
                id: String(id),
                data: data as Partial<TInsert>,
            }))
        );
    }

    /**
     * Delete a record (soft or permanent)
     */
    async delete(id: string, permanent = false): Promise<TSelect> {
        const columns = getTableColumns(this.schema);

        if (!('id' in columns)) {
            throw new ServiceError(
                'Id Not In Column',
                400,
                "Schema does not have an 'id' field, cannot perform delete operation."
            );
        }

        if (permanent) {
            // Permanent deletion
            const existingRecord = await this.getById(id, true);
            if (!existingRecord) {
                throw new ServiceError('Error Deleting Rows', 404, `No record found with ID: ${id}`);
            }

            await this.ctx.db
                .delete(this.schema)
                .where(eq(columns.id as MySqlColumn, id));

            return existingRecord;
        } else {
            // Soft deletion
            if (!('deletedAt' in columns)) {
                throw new ServiceError(
                    'Delete At Not In Column',
                    400,
                    "Schema does not have a 'deletedAt' field, cannot perform soft delete."
                );
            }

            const now = toMySqlUTCString(new Date());
            const result = await this.ctx.db
                .update(this.schema)
                .set({ deletedAt: now })
                .where(eq(columns.id as MySqlColumn, id));

            if (result[0].affectedRows === 0) {
                throw new ServiceError('Error Deleting Rows', 404, `No record found with ID: ${id}`);
            }

            return (await this.getById(id, true))!;
        }
    }

    /**
     * Soft delete a record
     */
    async softDelete(id: string | number): Promise<boolean> {
        const result = await this.delete(String(id));
        return !!result;
    }

    /**
     * Find multiple records with filtering, sorting, and relations
     */
    async findMany(options?: {
        where?: AdvancedWhere<TSelect> | AdvancedWhere<TSelect>[];
        sort?: Partial<SortRecord<TSelect>>;
        relations?: Record<string, 'inner' | 'left' | 'right'>;
        validatingCasing?: boolean;
        limit?: number;
        skip?: number;
    }): Promise<TSelect[]> {
        try {
            const sorting: SQL[] = [];
            const columns: Record<string, MySqlColumn | Record<string, MySqlColumn>> = {
                ...getTableColumns(this.schema),
            };

            // Add relation columns
            if (this.relations) {
                Object.entries(this.relations).forEach(([k, v]) => {
                    columns[k] = { ...getTableColumns(v.schema) };
                });
            }

            // Build sorting clauses
            if (options?.sort) {
                Object.entries(options.sort).forEach(([k, value]) => {
                    const col = columns[k];
                    if (
                        k &&
                        k in columns &&
                        col &&
                        col instanceof MySqlColumn &&
                        typeof value === 'string'
                    ) {
                        const colExpr = options.validatingCasing ? sql`${col} COLLATE utf8mb4_unicode_ci` : col;
                        sorting.push(value === 'asc' ? asc(colExpr) : desc(colExpr));
                    } else if (typeof value === 'object' && value !== null) {
                        Object.entries(value).forEach(([_k, _v]) => {
                            const childCols = columns[k] as Record<string, MySqlColumn>;
                            const childCol = childCols[_k];
                            if (childCol && childCol instanceof MySqlColumn) {
                                const colExpr = options.validatingCasing
                                    ? sql`${childCol} COLLATE utf8mb4_unicode_ci`
                                    : childCol;
                                sorting.push(_v === 'asc' ? asc(colExpr) : desc(colExpr));
                            }
                        });
                    }
                });
            }

            // Filter relations
            const relations =
                options?.relations && this.relations
                    ? Object.entries(options.relations).reduce((acc, [k]) => {
                        if (this.relations && k in this.relations) {
                            acc[k] = this.relations[k];
                        }
                        return acc;
                    }, {} as RelationConfig)
                    : undefined;

            // Build WHERE clause
            const where = options?.where ? getWhere(this.schema, options.where, relations) : undefined;

            // Start building query
            let results = this.ctx.db.select().from(this.schema);

            // Add joins
            if (options?.relations && this.relations) {
                Object.entries(options.relations).forEach(([key, joinType]) => {
                    if (!(key in this.relations!)) {
                        throw new ServiceError(
                            `Relation "${key}" not found. Available relations: ${Object.keys(this.relations!).join(', ')}`,
                            400,
                            'RELATION_NOT_FOUND'
                        );
                    }

                    const relation = this.relations[key];
                    this.validateRelation(key, relation);

                    const condition = eq(relation.field, relation.reference);

                    switch (joinType) {
                        case 'inner':
                            results.innerJoin(relation.schema, condition);
                            break;
                        case 'left':
                            results.leftJoin(relation.schema, condition);
                            break;
                        case 'right':
                            results.rightJoin(relation.schema, condition);
                            break;
                    }
                });
            }


            // Apply WHERE, ORDER BY, LIMIT, OFFSET
            if (where && !Array.isArray(where)) {
                results.where(where);
            }

            if (sorting.length > 0) {
                results.orderBy(...sorting);
            }

            results.limit(options?.limit ?? -1).offset(options?.skip ?? 0);

            console.log('[DEBUG SQL]', results.toSQL());

            // Execute query
            const queryResults = await results;
            const tableName = this.getTableName();

            // Map results
            return queryResults.map((row: any) => {
                const { [tableName]: baseRecord, ...relationData } = row;
                return {
                    ...(baseRecord as TSelect),
                    ...relationData,
                } as TSelect;
            });
        } catch (error) {
            if (error instanceof ServiceError) throw error;

            throw new ServiceError(
                `Failed to fetch records from ${this.getTableName()}`,
                500,
                'FETCH_MANY_ERROR',
                error
            );
        }
    }

    /**
     * Find one record
     */
    async findOne(options?: {
        where?: AdvancedWhere<TSelect> | AdvancedWhere<TSelect>[];
        sort?: Partial<SortRecord<TSelect>>;
        relations?: Record<string, 'inner' | 'left' | 'right'>;
    }): Promise<TSelect | null> {
        try {
            const result = await this.findMany({ ...options, limit: 1 });
            return result.length > 0 ? result[0] : null;
        } catch (error) {
            if (error instanceof ServiceError) throw error;

            throw new ServiceError(
                `Failed to fetch record from ${this.getTableName()}`,
                500,
                'FETCH_ONE_ERROR',
                error
            );
        }
    }

    /**
     * Count records
     */
    async count(options?: { includeDeleted?: boolean }): Promise<number> {
        try {
            const conditions: SQL[] = [];

            if (
                !options?.includeDeleted &&
                'deletedAt' in this.schema &&
                this.schema.deletedAt instanceof MySqlColumn
            ) {
                conditions.push(isNull(this.schema.deletedAt));
            }

            const query =
                conditions.length > 0
                    ? this.ctx.db
                        .select({ count: count() })
                        .from(this.schema)
                        .where(and(...conditions))
                    : this.ctx.db.select({ count: count() }).from(this.schema);

            const result = (await query) as { count: number }[];
            return result[0]?.count ?? 0;
        } catch (error) {
            throw new ServiceError(
                `Failed to count records in ${this.getTableName()}`,
                500,
                'COUNT_ERROR',
                error
            );
        }
    }

    /**
     * Soft delete many records with where conditions
     */
    async softDeleteMany(options?: {
        where?: AdvancedWhere<TSelect> | AdvancedWhere<TSelect>[];
    }): Promise<boolean> {
        try {
            if (!('id' in this.schema) || !(this.schema.id instanceof MySqlColumn)) {
                throw new Error('Invalid table without id');
            }

            const deletedAt =
                'deletedAt' in this.schema && this.schema.deletedAt instanceof MySqlColumn
                    ? this.schema.deletedAt
                    : null;

            const whereCondition = options?.where
                ? getWhere(this.schema, options.where, this.relations)
                : undefined;

            const finalWhere =
                deletedAt && whereCondition ? and(whereCondition, isNull(deletedAt)) : whereCondition;

            const result = await this.ctx.db
                .update(this.schema)
                .set({ deletedAt: toMySqlUTCString(new Date()) })
                .where(finalWhere);

            return result[0].affectedRows > 0;
        } catch (error) {
            throw new ServiceError(
                `Failed to soft delete records in ${this.getTableName()}`,
                500,
                'SOFT_DELETE_MANY_ERROR',
                error
            );
        }
    }

    /**
     * Count records with where conditions
     */
    async countWithWhere(options?: {
        where?: AdvancedWhere<TSelect> | AdvancedWhere<TSelect>[];
        relations?: Record<string, 'inner' | 'left' | 'right'>;
    }): Promise<number> {
        const relations =
            options?.relations && this.relations
                ? Object.entries(options.relations).reduce((acc, [k]) => {
                    if (this.relations && k in this.relations) {
                        acc[k] = this.relations[k];
                    }
                    return acc;
                }, {} as RelationConfig)
                : undefined;

        const where = options?.where ? getWhere(this.schema, options.where, relations) : undefined;

        let results = this.ctx.db.select({ totalCount: count() }).from(this.schema);

        if (options?.relations && this.relations) {
            Object.entries(options.relations).forEach(([key, joinType]) => {
                if (!(key in this.relations!)) {
                    throw new ServiceError(
                        `Relation "${key}" not found. Available relations: ${Object.keys(this.relations!).join(', ')}`,
                        400,
                        'RELATION_NOT_FOUND'
                    );
                }

                const relation = this.relations[key];
                this.validateRelation(key, relation);

                const condition = eq(relation.field, relation.reference);

                switch (joinType) {
                    case 'inner':
                        results.innerJoin(relation.schema, condition);
                        break;
                    case 'left':
                        results.leftJoin(relation.schema, condition);
                        break;
                    case 'right':
                        results.rightJoin(relation.schema, condition);
                        break;
                }
            });
        }

        if (where && !Array.isArray(where)) {
            results.where(where);
        }

        console.log('[DEBUG SQL]', results.toSQL());

        const result = (await results) as { totalCount: number }[];
        return result[0]?.totalCount ?? 0;
    }

}