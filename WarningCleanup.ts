import db from "./mysql/database";
import Log from "./Log";

/**
 * Warning Expiry Cleanup System
 * Automatically marks expired warnings as inactive
 */

// Run cleanup every hour
const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour

export async function cleanupExpiredWarnings(): Promise<void> {
    try {
        const now = Date.now();
        
        // Find all active warnings that have expired
        const expiredWarnings: any = await db.query(
            "SELECT id, userid FROM global_warnings WHERE active = TRUE AND expires_at <= ?",
            [now]
        );
        
        if (expiredWarnings.length > 0) {
            // Mark them as inactive
            await db.query("UPDATE global_warnings SET active = FALSE WHERE active = TRUE AND expires_at <= ?", [now]);
            
            Log.info("Warning expiry cleanup completed", {
                component: "WarningSystem",
                expiredCount: expiredWarnings.length
            });
        }
    } catch (error: any) {
        Log.error("Failed to cleanup expired warnings", new Error(error.message || error));
    }
}

export function startWarningCleanupScheduler(): void {
    // Run immediately on startup
    cleanupExpiredWarnings();
    
    // Schedule periodic cleanup
    setInterval(cleanupExpiredWarnings, CLEANUP_INTERVAL);
    
    Log.info("Warning cleanup scheduler started", {
        component: "WarningSystem",
        interval: `${CLEANUP_INTERVAL / 1000 / 60} minutes`
    });
}

export default {
    cleanupExpiredWarnings,
    startWarningCleanupScheduler
};
