import type { RPGGuild, RPGGuildMember } from "./interfaces";

export type GuildWithCounts = RPGGuild & { member_count?: number };
export type GuildCountRow = { count: number };
export type GuildInsertResult = { insertId: number };
export type GuildMemberRow = RPGGuildMember & { name: string; level: number; class: string };
