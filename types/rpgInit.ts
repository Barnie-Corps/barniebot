export interface EquipmentData {
    item_name: string;
    slot: string;
    required_level?: number;
    required_class?: string;
    strength_bonus?: number;
    defense_bonus?: number;
    agility_bonus?: number;
    intelligence_bonus?: number;
    luck_bonus?: number;
    mp_bonus?: number;
}

export interface ConsumableData {
    item_name: string;
    effect_type: string;
    effect_value: number;
}
