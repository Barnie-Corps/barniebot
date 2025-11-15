import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import utils from "../utils";
import data from "../data";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";

// Simple high-rank check; adjust ranks list if project uses different naming
const HIGH_RANKS = ["owner", "admin", "lead", "manager"];

export default {
  data: new SlashCommandBuilder()
    .setName("backupdb")
    .setDescription("Create an on-demand MySQL database backup (restricted)")
    .addBooleanOption(o => o.setName("public").setDescription("Make the result message public (default: no)")),
  ephemeral: true,
  async execute(interaction: ChatInputCommandInteraction) {
    const rank = await utils.getUserStaffRank(interaction.user.id);
    if (!rank || !HIGH_RANKS.includes(rank.toLowerCase())) {
      return interaction.editReply("You do not have permission to run database backups.");
    }

    const makePublic = interaction.options.getBoolean("public") || false;
    if (makePublic) {
      // If user wants public visibility override ephemeral (Discord.js loader sets this elsewhere)
      // We'll just follow up publicly afterwards.
    }

    await interaction.editReply("Starting backup... This may take a moment.");

  const backupDir = path.join(process.cwd(), "database_backups");
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const stamp = new Date();
    const ts = stamp.toISOString().replace(/[:.]/g, "-");
    const fileName = `backup_${ts}.sql`;
    const filePath = path.join(backupDir, fileName);

    // Spawn mysqldump; we stream stdout to file for scalability.
    const out = fs.createWriteStream(filePath);
    const args = ["-u", data.database.user, `-p${data.database.password}`, data.database.database];
    let stderrBuf = "";
    let toolMissing = false;
    const sendResult = async (ok: boolean, details: string) => {
      const embed = new EmbedBuilder()
        .setColor(ok ? 0x4caf50 : 0xff5252)
        .setTitle(ok ? "Database Backup Successful" : "Database Backup Failed")
        .setDescription(details)
        .addFields({ name: "File", value: ok ? fileName : "--" })
        .setTimestamp();
      if (makePublic) {
        await interaction.followUp({ embeds: [embed] });
      } else {
        await interaction.editReply({ content: "", embeds: [embed] });
      }
    };

    try {
      const dump = spawn("mysqldump", args);
      dump.stdout.pipe(out);
      dump.stderr.on("data", d => { stderrBuf += d.toString(); });
      dump.on("error", err => {
        toolMissing = true;
        stderrBuf += err.message;
      });
      dump.on("close", async (code) => {
        out.close();
        if (toolMissing) {
          return sendResult(false, `mysqldump not found. Install MySQL client tools on the host. Error: ${stderrBuf.slice(0,500)}`);
        }
        if (code !== 0) {
          return sendResult(false, `mysqldump exited with code ${code}. ${stderrBuf.slice(0,500)}`);
        }
        // Get file size
        let size = 0;
        try { size = fs.statSync(filePath).size; } catch {}

        // Retention: keep latest 10 backups
        try {
          const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.sql'));
          if (files.length > 10) {
            const sorted = files.map(f => ({ f, t: fs.statSync(path.join(backupDir,f)).mtimeMs }))
              .sort((a,b) => a.t - b.t);
            const toDelete = sorted.slice(0, files.length - 10);
            for (const del of toDelete) {
              try { fs.unlinkSync(path.join(backupDir, del.f)); } catch {}
            }
          }
        } catch {}

        sendResult(true, `Backup completed. File size: ${Math.round(size/1024)} KB`);
      });
    } catch (e: any) {
      return sendResult(false, `Unexpected error spawning mysqldump: ${e.message}`);
    }
  }
};
