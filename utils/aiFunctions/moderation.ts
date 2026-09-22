// AI-callable tool implementations: Global warnings, appeals, and global ban/mute status.
import utils from "../../utils";
import db from "../../mysql/database";

const moderationFunctions = {
    get_user_warnings: async (args: { userId: string }): Promise<any> => {
      if (!args.userId) return { error: "Missing userId parameter" };
      const warnings: any = await db.query("SELECT * FROM global_warnings WHERE userid = ? ORDER BY createdAt DESC", [args.userId]);
      return { warnings: Array.isArray(warnings) ? warnings : [] };
    },
    get_warning_details: async (args: { warningId: number }): Promise<any> => {
      if (!args.warningId) return { error: "Missing warningId parameter" };
      const warning: any = await db.query("SELECT * FROM global_warnings WHERE id = ?", [args.warningId]);
      if (!warning || !warning[0]) return { error: "Warning not found" };
      return { warning: warning[0] };
    },
    appeal_warning: async (args: { userId: string; warningId: number; reason: string }): Promise<any> => {
      if (!args.userId || !args.warningId || !args.reason) return { error: "Missing parameters" };
      const warning: any = await db.query("SELECT * FROM global_warnings WHERE id = ? AND userid = ?", [args.warningId, args.userId]);
      if (!warning || !warning[0]) return { error: "Warning not found or does not belong to user" };
      if (warning[0].appealed) return { error: "Warning has already been appealed" };
      await db.query("UPDATE global_warnings SET appealed = TRUE, appeal_status = 'pending', appeal_reason = ? WHERE id = ?", [args.reason, args.warningId]);
      return { success: true };
    },
    get_pending_appeals: async (args: { requesterId?: string }): Promise<any> => {
      if (!args?.requesterId) return { error: "Missing requesterId parameter" };
      if (!await utils.isStaff(args.requesterId)) return { error: "Requester is not authorized to view appeals" };
      const appeals: any = await db.query("SELECT * FROM global_warnings WHERE appeal_status = 'pending' ORDER BY createdAt DESC");
      return { appeals: Array.isArray(appeals) ? appeals : [] };
    },
    review_appeal: async (args: { requesterId?: string; warningId: number; approved: boolean; reviewNote?: string }): Promise<any> => {
      if (!args?.requesterId || !args.warningId || args.approved === undefined) return { error: "Missing parameters" };
      if (!await utils.isStaff(args.requesterId)) return { error: "Requester is not authorized to review appeals" };
      const warning: any = await db.query("SELECT * FROM global_warnings WHERE id = ?", [args.warningId]);
      if (!warning || !warning[0]) return { error: "Warning not found" };
      if (warning[0].appeal_status !== "pending") return { error: "Appeal is not pending review" };
      const status = args.approved ? "approved" : "rejected";
      const updates: any = {
        appeal_status: status,
        appeal_reviewed_by: args.requesterId,
        appeal_reviewed_at: Date.now()
      };
      if (args.approved) {
        updates.active = false;
      }
      await db.query("UPDATE global_warnings SET ? WHERE id = ?", [updates, args.warningId]);
      return { success: true, status };
    },
    global_ban_user: async (args: { requesterId?: string; userId: string; reason?: string }): Promise<any> => {
      if (!args?.requesterId || !args.userId) return { error: "Missing parameters" };
      if (!await utils.isStaff(args.requesterId)) return { error: "Requester is not authorized to ban users" };
      const existing: any = await db.query("SELECT * FROM global_bans WHERE id = ?", [args.userId]);
      if (existing && existing[0]) {
        await db.query("UPDATE global_bans SET active = TRUE, times = times + 1 WHERE id = ?", [args.userId]);
      } else {
        await db.query("INSERT INTO global_bans SET ?", [{ id: args.userId, active: true, times: 1 }]);
      }
      await db.query("INSERT INTO staff_audit_log SET ?", [{
        staff_id: args.requesterId,
        action_type: "global_ban",
        target_id: args.userId,
        details: args.reason ?? "No reason provided",
        created_at: Date.now()
      }]);
      return { success: true };
    },
    global_unban_user: async (args: { requesterId?: string; userId: string }): Promise<any> => {
      if (!args?.requesterId || !args.userId) return { error: "Missing parameters" };
      if (!await utils.isStaff(args.requesterId)) return { error: "Requester is not authorized to unban users" };
      await db.query("UPDATE global_bans SET active = FALSE WHERE id = ?", [args.userId]);
      await db.query("INSERT INTO staff_audit_log SET ?", [{
        staff_id: args.requesterId,
        action_type: "global_unban",
        target_id: args.userId,
        created_at: Date.now()
      }]);
      return { success: true };
    },
    global_mute_user: async (args: { requesterId?: string; userId: string; duration?: number; reason?: string }): Promise<any> => {
      if (!args?.requesterId || !args.userId) return { error: "Missing parameters" };
      if (!await utils.isStaff(args.requesterId)) return { error: "Requester is not authorized to mute users" };
      const until = args.duration ? Date.now() + args.duration : 0;
      const existing: any = await db.query("SELECT * FROM global_mutes WHERE id = ?", [args.userId]);
      if (existing && existing[0]) {
        await db.query("UPDATE global_mutes SET until = ?, reason = ? WHERE id = ?", [until, args.reason ?? "No reason provided", args.userId]);
      } else {
        await db.query("INSERT INTO global_mutes SET ?", [{
          id: args.userId,
          reason: args.reason ?? "No reason provided",
          authorid: args.requesterId,
          createdAt: Date.now(),
          until
        }]);
      }
      await db.query("INSERT INTO staff_audit_log SET ?", [{
        staff_id: args.requesterId,
        action_type: "global_mute",
        target_id: args.userId,
        details: args.reason ?? "No reason provided",
        metadata: JSON.stringify({ duration: args.duration, until }),
        created_at: Date.now()
      }]);
      return { success: true };
    },
    global_unmute_user: async (args: { requesterId?: string; userId: string }): Promise<any> => {
      if (!args?.requesterId || !args.userId) return { error: "Missing parameters" };
      if (!await utils.isStaff(args.requesterId)) return { error: "Requester is not authorized to unmute users" };
      await db.query("DELETE FROM global_mutes WHERE id = ?", [args.userId]);
      await db.query("INSERT INTO staff_audit_log SET ?", [{
        staff_id: args.requesterId,
        action_type: "global_unmute",
        target_id: args.userId,
        created_at: Date.now()
      }]);
      return { success: true };
    },
    get_global_ban_status: async (args: { userId: string }): Promise<any> => {
      if (!args.userId) return { error: "Missing userId parameter" };
      const banned = await utils.isUserBlacklisted(args.userId);
      if (!banned) return { banned: false };
      const ban: any = await db.query("SELECT * FROM global_bans WHERE id = ? AND active = TRUE", [args.userId]);
      return { banned: true, times: ban[0]?.times ?? 0 };
    },
    get_global_mute_status: async (args: { userId: string }): Promise<any> => {
      if (!args.userId) return { error: "Missing userId parameter" };
      const muted = await utils.isUserMuted(args.userId);
      if (!muted) return { muted: false };
      const mute: any = await db.query("SELECT * FROM global_mutes WHERE id = ?", [args.userId]);
      if (!mute || !mute[0]) return { muted: false };
      return {
        muted: true,
        reason: mute[0].reason,
        until: mute[0].until,
        permanent: !mute[0].until || mute[0].until === 0
      };
    },
};

export default moderationFunctions;
