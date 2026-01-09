import { Collection } from "discord.js";
export interface DataType {
    database: {
        host: string;
        user: string;
        password: string;
        port?: number;
        database: string;
        charset?: string;
    };
    bot: {
        owners: string[];
        emojis: BotEmoji[];
        loadingEmoji: {
            id: string;
            mention: string;
            name: string;
        };
        token: string;
        commands: Collection<string, any>;
        encryption_key: string;
        log_channel: string;
        home_guild: string;
        support_category: string;
        transcripts_channel: string;
    }
}
export interface BotEmoji {
    emoji: string;
    name: string;
    id: string;
}

export interface ChatManagerOptions {
    ratelimit_time: number;
    messages_limit: number;
    time: number
}
export interface Ratelimit {
    id: string;
    time: number;
    messages: number;
}

export interface DiscordUser {
    id: string;
    username: string;
    discriminator?: string;
}

export interface UserLanguage {
    userid: string;
    lang: string;
}

export interface RPGSession {
    id: number;
    uid: string;
    account_id: number;
    active: boolean;
    username?: string;
    created_at?: number;
}

export interface RPGCharacter {
    id: number;
    account_id: number;
    name: string;
    class: string;
    level: number;
    experience: number;
    gold: number;
    hp: number;
    mp: number;
    max_hp: number;
    max_mp: number;
    strength: number;
    defense: number;
    agility: number;
    intelligence: number;
    luck: number;
    stat_points: number;
    created_at?: number;
    last_action?: number;
}

export interface RPGItem {
    id: number;
    name: string;
    emoji?: string;
    rarity?: string;
    type?: string;
    description?: string;
    base_value?: number;
    stackable?: boolean;
    tradeable?: boolean;
}

export interface RPGInventoryItem {
    id: number;
    character_id: number;
    item_id: number;
    quantity: number;
}

export interface RPGEquippedItem {
    id: number;
    character_id: number;
    inventory_id: number;
    item_id: number;
    slot: string;
}

export interface RPGEquipment {
    id: number;
    item_id: number;
    armor_class?: number;
    str_bonus?: number;
    def_bonus?: number;
    agi_bonus?: number;
    int_bonus?: number;
}

export interface RPGDungeon {
    id: number;
    name: string;
    emoji: string;
    description: string;
    required_level: number;
    difficulty: string;
    rewards_exp: number;
    rewards_gold_min: number;
    rewards_gold_max: number;
    stages: number;
    boss_name?: string | null;
    reward_gold_min: number;
    reward_gold_max: number;
    reward_exp_min: number;
    reward_exp_max: number;
}

export interface RPGDungeonRun {
    id: number;
    character_id: number;
    dungeon_id: number;
    status: "active" | "completed" | "failed";
    progress: number;
    current_room: number;
    started_at: number;
    completed_at?: number;
}

export interface RPGCraftingMaterial {
    id: number;
    name: string;
    emoji: string;
    rarity: string;
}

export interface RPGCraftingRecipe {
    id: number;
    name: string;
    material_1_id: number;
    material_2_id?: number;
    material_3_id?: number;
    result_item_id: number;
}

export interface RPGAchievement {
    id: number;
    name: string;
    description: string;
    emoji: string;
    hidden: boolean;
    category: string;
    requirement_type: string;
    requirement_value: number;
    reward_gold: number;
    reward_experience: number;
    reward_item_id?: number | null;
    icon: string;
}

export interface RPGPet {
    id: number;
    name: string;
    emoji: string;
    rarity: string;
}

export interface RPGGuild {
    id: number;
    name: string;
    founder_id: number;
    level: number;
    experience: number;
    exp?: number;
    gold: number;
    bank_gold?: number;
    created_at: number;
    description?: string;
    emblem_icon?: string;
    member_capacity?: number;
}

export interface RPGGuildMember {
    id: number;
    character_id: number;
    guild_id: number;
    role: string;
    joined_at?: number;
    contribution_points?: number;
}

export interface GlobalChat {
    id: number;
    guild: string;
    channel: string;
    enabled: boolean;
}

export interface CustomResponse {
    id: number;
    guild: string;
    trigger: string;
    response: string;
}

export interface FilterConfig {
    id: number;
    guild: string;
    enabled: boolean;
}

export interface FilterWord {
    id: number;
    guild: string;
    content: string;
    protected: boolean;
    single: boolean;
}

export interface GlobalWarning {
    id: number;
    userid: string;
    authorid: string;
    reason: string;
    category: string;
    points: number;
    createdAt: number;
    expires_at: number;
    active: boolean;
    appealed: boolean;
    appeal_status?: string;
    appeal_reason?: string;
}

export interface GlobalBan {
    id: string;
    active: boolean;
    times: number;
}

export interface SupportTicket {
    id: number;
    user_id: string;
    status: "open" | "closed" | "resolved";
    title: string;
    created_at: number;
    guild_id?: string | null;
    guild_name?: string | null;
    initial_message?: string;
    channel_id?: string | null;
    message_id?: string | null;
}

export interface SupportMessage {
    id: number;
    ticket_id: number;
    user_id: string;
    message: string;
    timestamp: number;
    is_staff?: boolean;
    staff_rank?: string | null;
    username?: string;
    content?: string;
}

export interface StaffNote {
    id: number;
    user_id: string;
    note: string;
    created_at: number;
}

export interface RegisteredAccount {
    id: number;
    username: string;
    email: string;
    password: string;
    verified: boolean;
    verification_code?: number;
    created_at: number;
}

export interface RPGDailyReward {
    id: number;
    character_id: number;
    last_claim: number;
    streak: number;
    total_claims: number;
}

export interface RPGTrade {
    id: number;
    initiator_id: number;
    responder_id: number;
    status: "pending" | "accepted" | "rejected";
}

export interface RPGAccountStatus {
    account_id: number;
    frozen: boolean;
    blacklisted: boolean;
    muted: boolean;
}

export interface StaffMember {
    uid: string;
    rank: string;
}

export interface AIMemory {
    id: number;
    uid: string;
    memory: string;
    created_at: number;
}

export interface MessageCount {
    id: number;
    user_id: string;
    count: number;
    uid?: string;
}

export interface CountResult {
    count: number;
}

export interface LastInsertIdResult {
    id: number;
}
export interface ExecutedCommand {
    id: number;
    uid: string;
    command: string;
    is_last: boolean;
    at?: number;
}