import db from "../../mysql/database";

const rpgFunctions = {
    get_rpg_character: async (args: { userId: string; accountId?: number }): Promise<any> => {
      if (!args.userId) return { error: "Missing userId parameter" };
      let character: any;
      if (args.accountId) {
        character = await db.query("SELECT * FROM rpg_characters WHERE account_id = ?", [args.accountId]);
      } else {
        character = await db.query("SELECT * FROM rpg_characters WHERE uid = ? ORDER BY created_at DESC LIMIT 1", [args.userId]);
      }
      if (!character || !character[0]) return { error: "Character not found" };
      return { character: character[0] };
    },
    get_rpg_inventory: async (args: { characterId: number }): Promise<any> => {
      if (!args.characterId) return { error: "Missing characterId parameter" };
      const inventory: any = await db.query(`
        SELECT i.*, item.name, item.description, item.type, item.rarity
        FROM rpg_inventory i
        JOIN rpg_items item ON i.item_id = item.id
        WHERE i.character_id = ?
        ORDER BY item.rarity, item.name
      `, [args.characterId]);
      return { inventory: Array.isArray(inventory) ? inventory : [] };
    },
    get_rpg_equipment: async (args: { characterId: number }): Promise<any> => {
      if (!args.characterId) return { error: "Missing characterId parameter" };
      const equipment: any = await db.query(`
        SELECT eq.*, ei.equipped_at
        FROM rpg_equipped_items ei
        JOIN rpg_equipment eq ON ei.item_id = eq.item_id
        WHERE ei.character_id = ?
      `, [args.characterId]);
      return { equipment: Array.isArray(equipment) ? equipment : [] };
    },
    get_rpg_session: async (args: { userId: string }): Promise<any> => {
      if (!args.userId) return { error: "Missing userId parameter" };
      const session: any = await db.query("SELECT * FROM rpg_sessions WHERE uid = ? AND active = TRUE", [args.userId]);
      if (!session || !session[0]) return { active: false };
      return { active: true, session: session[0] };
    },
    get_rpg_account_status: async (args: { accountId: number }): Promise<any> => {
      if (!args.accountId) return { error: "Missing accountId parameter" };
      const status: any = await db.query("SELECT * FROM rpg_account_status WHERE account_id = ?", [args.accountId]);
      if (!status || !status[0]) return { frozen: false, banned: false };
      return { status: status[0] };
    },
};

export default rpgFunctions;
