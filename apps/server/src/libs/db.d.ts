import type { Env } from './env';
import * as fullSchema from '../schemas';
export type Database = ReturnType<typeof createDrizzle>['db'];
type DrizzleEnv = Pick<Env, 'DATABASE_URL' | 'DB_POOL_MAX' | 'DB_POOL_IDLE_TIMEOUT_MS' | 'DB_POOL_CONNECTION_TIMEOUT_MS' | 'DB_POOL_KEEPALIVE_INITIAL_DELAY_MS'>;
export declare function createDrizzle(env: DrizzleEnv): {
    db: import("drizzle-orm/node-postgres").NodePgDatabase<typeof fullSchema> & {
        $client: import("pg").Pool;
    };
    pool: import("pg").Pool;
};
export declare function migrateDatabase(db: Database): Promise<void>;

