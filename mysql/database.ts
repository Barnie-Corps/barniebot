import data from "../data";
import Log from "../Log";
import { createPool } from "mysql";

const db = createPool({
    ...data.database,
    connectionLimit: 10,
    waitForConnections: true,
    queueLimit: 1000,
    connectTimeout: 10000,
    acquireTimeout: 10000,
    timeout: 60000
});

const rawQuery = require("util").promisify(db.query).bind(db);
(db as any).query = async (...args: any[]) => {
    const start = Date.now();
    try {
        return await rawQuery(...args);
    } finally {
        const elapsed = Date.now() - start;
        if (elapsed >= 500) {
            Log.warn("Slow MySQL query", { component: "Database", elapsedMs: elapsed });
        }
    }
};

db.on('error', (err) => {
    console.error('MySQL Pool Error:', err);
    if (err.code === 'PROTOCOL_CONNECTION_LOST') {
        console.error('Database connection was closed.');
    }
    if (err.code === 'ER_CON_COUNT_ERROR') {
        console.error('Database has too many connections.');
    }
    if (err.code === 'ECONNREFUSED') {
        console.error('Database connection was refused.');
    }
});

const promisify = (fn: any) => (...args: any[]) =>
    new Promise((resolve, reject) => fn(...args, (err: any, res: any) => (err ? reject(err) : resolve(res))));

export const withTransaction = async <T = void>(
    fn: (conn: { query: (sql: string, params?: any[]) => Promise<any> }) => Promise<T>
): Promise<T> => {
    const conn: any = await new Promise((resolve, reject) =>
        db.getConnection((err: any, c: any) => (err ? reject(err) : resolve(c)))
    );
    const query = promisify(conn.query.bind(conn));
    try {
        await promisify(conn.beginTransaction.bind(conn))();
        const result = await fn({ query });
        await promisify(conn.commit.bind(conn))();
        return result;
    } catch (error) {
        try {
            await promisify(conn.rollback.bind(conn))();
        } catch { }
        throw error;
    } finally {
        conn.release();
    }
};

export default db;