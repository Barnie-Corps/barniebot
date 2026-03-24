import type { Guild } from "discord.js";

export type MonitorConfig = {
    guild_id: string;
    enabled: boolean;
    logs_channel: string;
    allow_actions: boolean;
    analyze_potentially: boolean;
    allow_investigation_tools: boolean;
    monitor_language: string;
    channel_whitelist_ids: string[];
    role_whitelist_ids: string[];
};

export type TriageResult = {
    suspicious: boolean;
    risk: "low" | "medium" | "high";
    summary: string;
    reason: string;
    confidence: number;
};

export type ActionType = "notify" | "delete_message" | "warn" | "timeout" | "kick" | "ban";

export type ReviewResult = {
    suspicious: boolean;
    risk: "low" | "medium" | "high";
    summary: string;
    reason: string;
    recommended_action?: ActionType;
    recommended_actions?: ActionType[];
    warning_message?: string;
    action_duration_ms?: number;
    confidence: number;
};

export type EntityStats = {
    riskScore: number;
    flagCount: number;
    actionCount: number;
    falsePositiveCount: number;
    lastFlagAt: number | null;
    lastActionAt: number | null;
};

export type QueuedMonitorEvent = {
    eventType: string;
    guild: Guild;
    data: any;
    context: {
        userId?: string | null;
        channelId?: string | null;
        messageId?: string | null;
    };
    configOverride?: MonitorConfig | null;
    enqueuedAt: number;
    resolve: () => void;
};
