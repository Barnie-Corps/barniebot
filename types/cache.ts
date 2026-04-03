export type RedisClient = {
    connect: () => Promise<unknown>;
    on: (event: string, listener: (...args: any[]) => void) => unknown;
    isOpen?: boolean;
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string, options?: { PX?: number; EX?: number; NX?: boolean }) => Promise<unknown>;
    del: (key: string | string[]) => Promise<number>;
    incr: (key: string) => Promise<number>;
    pTTL: (key: string) => Promise<number>;
    pExpire: (key: string, milliseconds: number) => Promise<number>;
    disconnect: () => Promise<void>;
};

export type CacheEntry<T> = {
    value: T;
    expires: number;
};
