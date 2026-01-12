import db from "../mysql/database";
import data from "../data";
import type { StaffRank } from "../types/interfaces";

class StaffRanksManager {
    private static instance: StaffRanksManager;
    private defaultPermissions: Record<string, string[]> = {
        "Support": ["view_tickets", "respond_to_tickets"],
        "Intern": ["view_tickets", "respond_to_tickets", "assign_tickets"],
        "Trial Moderator": ["view_tickets", "respond_to_tickets", "assign_tickets", "warn_users", "mute_users"],
        "Moderator": ["view_tickets", "respond_to_tickets", "assign_tickets", "warn_users", "mute_users", "kick_users", "view_audit_log"],
        "Senior Moderator": ["view_tickets", "respond_to_tickets", "assign_tickets", "warn_users", "mute_users", "kick_users", "ban_users", "view_audit_log", "manage_warnings"],
        "Chief of Moderation": ["view_tickets", "respond_to_tickets", "assign_tickets", "warn_users", "mute_users", "kick_users", "ban_users", "view_audit_log", "manage_warnings", "manage_staff", "close_tickets"],
        "Probationary Administrator": ["view_tickets", "respond_to_tickets", "assign_tickets", "warn_users", "mute_users", "kick_users", "ban_users", "view_audit_log", "manage_warnings", "manage_staff", "close_tickets", "manage_guild", "view_staff_notes"],
        "Administrator": ["view_tickets", "respond_to_tickets", "assign_tickets", "warn_users", "mute_users", "kick_users", "ban_users", "view_audit_log", "manage_warnings", "manage_staff", "close_tickets", "manage_guild", "view_staff_notes", "manage_rpg", "send_global_notifications"],
        "Head Administrator": ["view_tickets", "respond_to_tickets", "assign_tickets", "warn_users", "mute_users", "kick_users", "ban_users", "view_audit_log", "manage_warnings", "manage_staff", "close_tickets", "manage_guild", "view_staff_notes", "manage_rpg", "send_global_notifications", "modify_staff_ranks"],
        "Chief of Staff": ["view_tickets", "respond_to_tickets", "assign_tickets", "warn_users", "mute_users", "kick_users", "ban_users", "view_audit_log", "manage_warnings", "manage_staff", "close_tickets", "manage_guild", "view_staff_notes", "manage_rpg", "send_global_notifications", "modify_staff_ranks", "execute_code"],
        "Co-Owner": ["view_tickets", "respond_to_tickets", "assign_tickets", "warn_users", "mute_users", "kick_users", "ban_users", "view_audit_log", "manage_warnings", "manage_staff", "close_tickets", "manage_guild", "view_staff_notes", "manage_rpg", "send_global_notifications", "modify_staff_ranks", "execute_code", "backup_database"],
        "Owner": ["view_tickets", "respond_to_tickets", "assign_tickets", "warn_users", "mute_users", "kick_users", "ban_users", "view_audit_log", "manage_warnings", "manage_staff", "close_tickets", "manage_guild", "view_staff_notes", "manage_rpg", "send_global_notifications", "modify_staff_ranks", "execute_code", "backup_database", "manage_system"]
    };

    private defaultRanks: Array<{ name: string; hierarchy_position: number }> = [
        { name: "Trial Support", hierarchy_position: 0 },
        { name: "Support", hierarchy_position: 1 },
        { name: "Intern", hierarchy_position: 2 },
        { name: "Trial Moderator", hierarchy_position: 3 },
        { name: "Moderator", hierarchy_position: 4 },
        { name: "Senior Moderator", hierarchy_position: 5 },
        { name: "Chief of Moderation", hierarchy_position: 6 },
        { name: "Probationary Administrator", hierarchy_position: 7 },
        { name: "Administrator", hierarchy_position: 8 },
        { name: "Head Administrator", hierarchy_position: 9 },
        { name: "Chief of Staff", hierarchy_position: 10 },
        { name: "Co-Owner", hierarchy_position: 11 },
        { name: "Owner", hierarchy_position: 12 }
    ];

    private constructor() { }

    static getInstance(): StaffRanksManager {
        if (!StaffRanksManager.instance) {
            StaffRanksManager.instance = new StaffRanksManager();
        }
        return StaffRanksManager.instance;
    }

    async initialize(): Promise<void> {
        const existing: any = await db.query("SELECT COUNT(*) as count FROM staff_ranks");
        const count = existing[0]?.count || 0;

        if (count === 0) {
            for (const rank of this.defaultRanks) {
                const permissions = this.defaultPermissions[rank.name] || [];
                await db.query("INSERT INTO staff_ranks SET ?", [{
                    name: rank.name,
                    hierarchy_position: rank.hierarchy_position,
                    permissions: JSON.stringify(permissions),
                    created_at: Date.now()
                }]);
            }
        }

        await this.loadRanksIntoData();
    }

    private async loadRanksIntoData(): Promise<void> {
        const ranks: any = await db.query("SELECT * FROM staff_ranks ORDER BY hierarchy_position ASC");
        if (Array.isArray(ranks)) {
            data.bot.staff_ranks.push(...ranks.map((r: any) => ({
                id: r.id,
                name: r.name,
                hierarchy_position: r.hierarchy_position,
                permissions: typeof r.permissions === "string" ? JSON.parse(r.permissions) : (r.permissions || []),
                created_at: r.created_at
            })))
        }
    }

    getRankByHierarchy(hierarchy_position: number): StaffRank | undefined {
        return data.bot.staff_ranks.find(r => r.hierarchy_position === hierarchy_position);
    }

    getRankByName(name: string): StaffRank | undefined {
        return data.bot.staff_ranks.find(r => r.name.toLowerCase() === name.toLowerCase());
    }

    getRankHierarchyByName(name: string | null): number {
        if (!name) return -1;
        const rank = this.getRankByName(name);
        return rank ? rank.hierarchy_position : -1;
    }

    hasPermission(rank: string | null, permission: string): boolean {
        if (!rank) return false;
        const rankData = this.getRankByName(rank);
        if (!rankData) return false;
        return rankData.permissions.includes(permission);
    }

    hasMinimumRank(userRank: string | null, minimumRank: string): boolean {
        const userHierarchy = this.getRankHierarchyByName(userRank);
        const minHierarchy = this.getRankHierarchyByName(minimumRank);
        return userHierarchy >= 0 && userHierarchy >= minHierarchy;
    }

    getAllRanks(): StaffRank[] {
        return [...data.bot.staff_ranks];
    }
}

export default StaffRanksManager.getInstance();
