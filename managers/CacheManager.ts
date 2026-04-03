import Log from "../Log";
import { createClient } from "redis";
import type { CacheEntry, RedisClient } from "../types/cache";

class CacheManager {
    private redisClient: RedisClient | null = null;
    private redisAvailable = false;
    private memoryCache = new Map<string, CacheEntry<any>>();
    private cleanupInterval: NodeJS.Timer | null = null;
    private readonly REDIS_CONNECT_TIMEOUT = 1200;
    private readonly REDIS_OP_TIMEOUT = 100;
    private readonly MEMORY_CLEANUP_INTERVAL = 60000;
    private readonly MAX_MEMORY_ENTRIES = 10000;

    async initialize(): Promise<void> {
        await this.initRedis();
        this.startMemoryCleanup();
    }

    private async initRedis(): Promise<void> {
        try {
            const redisUrl = process.env.REDIS_URL ?? `redis://${process.env.REDIS_HOST ?? "127.0.0.1"}:${process.env.REDIS_PORT ?? "6379"}`;
            const client: RedisClient = createClient({
                url: redisUrl,
                socket: {
                    connectTimeout: this.REDIS_CONNECT_TIMEOUT,
                    reconnectStrategy: () => false
                }
            }) as RedisClient;
            client.on("error", (error: any) => {
                this.redisAvailable = false;
                Log.warn("Redis cache disabled after error", { error: error?.message ?? error });
            });
            await Promise.race([
                client.connect(),
                new Promise<never>((_, reject) => setTimeout(() => reject(new Error("redis-connect-timeout")), this.REDIS_CONNECT_TIMEOUT))
            ]);
            this.redisClient = client;
            this.redisAvailable = true;
            Log.info("Redis cache enabled globally");
        }
        catch (error: any) {
            this.redisClient = null;
            this.redisAvailable = false;
            Log.info("Redis unavailable, using memory cache", { reason: error?.message ?? "unknown" });
        }
    }

    private startMemoryCleanup(): void {
        this.cleanupInterval = setInterval(() => {
            const now = Date.now();
            let expired = 0;
            for (const [key, entry] of this.memoryCache.entries()) {
                if (entry.expires > 0 && entry.expires <= now) {
                    this.memoryCache.delete(key);
                    expired++;
                }
            }
            if (this.memoryCache.size > this.MAX_MEMORY_ENTRIES) {
                const toDelete = this.memoryCache.size - this.MAX_MEMORY_ENTRIES;
                const keys = Array.from(this.memoryCache.keys()).slice(0, toDelete);
                keys.forEach(k => this.memoryCache.delete(k));
            }
        }, this.MEMORY_CLEANUP_INTERVAL);
    }

    private async withTimeout<T>(task: Promise<T>, timeoutMs: number): Promise<T | null> {
        try {
            return await Promise.race([
                task,
                new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))
            ]);
        }
        catch {
            return null;
        }
    }

    private getMemoryValue<T>(key: string): T | null {
        const entry = this.memoryCache.get(key);
        if (!entry) return null;
        if (entry.expires > 0 && entry.expires <= Date.now()) {
            this.memoryCache.delete(key);
            return null;
        }
        return entry.value as T;
    }

    private setMemoryValue<T>(key: string, value: T, ttlMs?: number): void {
        const expires = ttlMs ? Date.now() + ttlMs : 0;
        this.memoryCache.set(key, { value, expires });
    }

    async get<T>(key: string): Promise<T | null> {
        if (this.redisAvailable && this.redisClient) {
            try {
                const raw = await this.withTimeout(this.redisClient.get(key), this.REDIS_OP_TIMEOUT);
                if (raw) {
                    try {
                        return JSON.parse(raw) as T;
                    }
                    catch {
                        return raw as any;
                    }
                }
            }
            catch {
                this.redisAvailable = false;
            }
        }
        return this.getMemoryValue<T>(key);
    }

    async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
        const payload = typeof value === "string" ? value : JSON.stringify(value);
        if (this.redisAvailable && this.redisClient) {
            try {
                const opts = ttlMs ? { PX: ttlMs } : undefined;
                await this.withTimeout(this.redisClient.set(key, payload, opts), this.REDIS_OP_TIMEOUT);
            }
            catch {
                this.redisAvailable = false;
            }
        }
        this.setMemoryValue(key, value, ttlMs);
    }

    async delete(key: string | string[]): Promise<void> {
        const keys = Array.isArray(key) ? key : [key];
        if (this.redisAvailable && this.redisClient) {
            try {
                await this.withTimeout(this.redisClient.del(keys), this.REDIS_OP_TIMEOUT);
            }
            catch {
                this.redisAvailable = false;
            }
        }
        keys.forEach(k => this.memoryCache.delete(k));
    }

    async has(key: string): Promise<boolean> {
        const value = await this.get(key);
        return value !== null;
    }

    async increment(key: string, ttlMs?: number): Promise<number | null> {
        if (this.redisAvailable && this.redisClient) {
            try {
                const value = await this.withTimeout(this.redisClient.incr(key), this.REDIS_OP_TIMEOUT);
                if (value === null) return null;
                if (ttlMs && value === 1) {
                    await this.withTimeout(this.redisClient.pExpire(key, ttlMs), this.REDIS_OP_TIMEOUT);
                }
                return value;
            }
            catch {
                this.redisAvailable = false;
            }
        }
        const now = Date.now();
        const existing = this.memoryCache.get(key);
        if (!existing || (existing.expires > 0 && existing.expires <= now)) {
            const expires = ttlMs ? now + ttlMs : 0;
            this.memoryCache.set(key, { value: 1, expires });
            return 1;
        }
        const nextValue = Number(existing.value) + 1;
        this.memoryCache.set(key, { value: nextValue, expires: existing.expires });
        return nextValue;
    }

    async getTtlMs(key: string): Promise<number> {
        if (this.redisAvailable && this.redisClient) {
            try {
                const ttl = await this.withTimeout(this.redisClient.pTTL(key), this.REDIS_OP_TIMEOUT);
                if (typeof ttl === "number") return ttl;
            }
            catch {
                this.redisAvailable = false;
            }
        }
        const entry = this.memoryCache.get(key);
        if (!entry) return -2;
        if (entry.expires <= 0) return -1;
        return Math.max(0, entry.expires - Date.now());
    }

    async setIfNotExists<T>(key: string, value: T, ttlMs?: number): Promise<boolean> {
        const payload = typeof value === "string" ? value : JSON.stringify(value);
        if (this.redisAvailable && this.redisClient) {
            try {
                const opts = ttlMs ? { PX: ttlMs, NX: true } : { NX: true };
                const result = await this.withTimeout(this.redisClient.set(key, payload, opts), this.REDIS_OP_TIMEOUT);
                if (result === "OK") {
                    this.setMemoryValue(key, value, ttlMs);
                    return true;
                }
                return false;
            }
            catch {
                this.redisAvailable = false;
            }
        }
        const now = Date.now();
        const existing = this.memoryCache.get(key);
        if (existing && (existing.expires <= 0 || existing.expires > now)) return false;
        this.setMemoryValue(key, value, ttlMs);
        return true;
    }

    getLocal<T>(key: string): T | null {
        return this.getMemoryValue<T>(key);
    }

    setLocal<T>(key: string, value: T, ttlMs?: number): void {
        this.setMemoryValue(key, value, ttlMs);
    }

    deleteLocal(key: string | string[]): void {
        const keys = Array.isArray(key) ? key : [key];
        keys.forEach(k => this.memoryCache.delete(k));
    }

    deleteLocalByPrefix(prefix: string): number {
        let deleted = 0;
        for (const key of this.memoryCache.keys()) {
            if (!key.startsWith(prefix)) continue;
            this.memoryCache.delete(key);
            deleted++;
        }
        return deleted;
    }

    countLocalByPrefix(prefix: string): number {
        let count = 0;
        for (const key of this.memoryCache.keys()) {
            if (key.startsWith(prefix) && this.getMemoryValue(key) !== null) count++;
        }
        return count;
    }

    hasLocal(key: string): boolean {
        return this.getMemoryValue(key) !== null;
    }

    async remember<T>(key: string, ttlMs: number, resolver: () => Promise<T>): Promise<T> {
        const cached = await this.get<T>(key);
        if (cached !== null) return cached;
        const value = await resolver();
        await this.set(key, value, ttlMs);
        return value;
    }

    rememberLocal<T>(key: string, ttlMs: number, resolver: () => T): T {
        const cached = this.getLocal<T>(key);
        if (cached !== null) return cached;
        const value = resolver();
        this.setLocal(key, value, ttlMs);
        return value;
    }

    isRedisAvailable(): boolean {
        return this.redisAvailable;
    }

    getStats() {
        return {
            redisAvailable: this.redisAvailable,
            memoryCacheSize: this.memoryCache.size,
            maxMemoryEntries: this.MAX_MEMORY_ENTRIES
        };
    }

    async shutdown(): Promise<void> {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval as any);
            this.cleanupInterval = null;
        }
        if (this.redisClient) {
            try {
                await this.redisClient.disconnect();
            }
            catch {}
            this.redisClient = null;
        }
        this.memoryCache.clear();
    }
}

const cacheManager = new CacheManager();
export default cacheManager;
