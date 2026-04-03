import type { RPGDungeon } from "./interfaces";

export type DungeonRunRow = RPGDungeon & {
    stage: number;
    status: string;
    started_at: number;
    completed_at?: number | null;
    rewards_claimed?: boolean;
    dungeon_id: number;
    reward_gold_min: number;
    reward_gold_max: number;
    reward_exp_min: number;
    reward_exp_max: number;
    required_level: number;
};

export type CharacterMaterialRow = {
    id: number;
    character_id: number;
    material_id: number;
    quantity: number;
};

export type DungeonStatusRow = {
    stage: number;
    stages: number;
    name: string;
    started_at: number;
    status: string;
};

export type DungeonHistoryRow = {
    name: string;
    status: string;
    stage: number;
    completed_at: number;
};
