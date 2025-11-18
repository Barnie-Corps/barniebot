import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import utils from "../utils";
import data from "../data";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import os from "os";

const HIGH_RANKS = ["owner", "admin", "lead", "manager"];


function findMysqldump(): string | null {
  const platform = os.platform();

  const commonPaths = [
    "mysqldump",
    "mariadb-dump",
  ];

  if (platform === "win32") {
    commonPaths.push(
      "C:\\xampp\\mysql\\bin\\mysqldump.exe",
      "C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe",
      "C:\\Program Files\\MySQL\\MySQL Server 5.7\\bin\\mysqldump.exe",
      "C:\\Program Files\\MariaDB 10.11\\bin\\mariadb-dump.exe",
      "C:\\Program Files\\MariaDB 10.6\\bin\\mariadb-dump.exe"
    );
  } else if (platform === "darwin") {
    commonPaths.push(
      "/usr/local/bin/mysqldump",
      "/opt/homebrew/bin/mysqldump",
      "/usr/local/mysql/bin/mysqldump"
    );
  } else {
    // Linux and others
    commonPaths.push(
      "/usr/bin/mysqldump",
      "/usr/local/bin/mysqldump",
      "/opt/mysql/bin/mysqldump"
    );
  }


  for (const cmdPath of commonPaths) {
    try {
      if (fs.existsSync(cmdPath)) {
        return cmdPath;
      }
    } catch { }
  }

  return "mysqldump";
}

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
    if (makePublic) { };

    await interaction.editReply("Starting backup... This may take a moment.");

    const backupDir = path.join(process.cwd(), "database_backups");
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const stamp = new Date();
    const ts = stamp.toISOString().replace(/[:.]/g, "-");
    const fileName = `backup_${ts}.sql`;
    const filePath = path.join(backupDir, fileName);

    const mysqldumpCmd = findMysqldump();
    if (!mysqldumpCmd) {
      const embed = new EmbedBuilder()
        .setColor(0xff5252)
        .setTitle("Database Backup Failed")
        .setDescription("mysqldump executable not found. Please install MySQL/MariaDB client tools.")
        .addFields({ name: "Platform", value: os.platform() })
        .setTimestamp();
      return interaction.editReply({ content: "", embeds: [embed] });
    }

    const args: string[] = [
      "-h", data.database.host || "localhost",
      "-u", data.database.user,
      data.database.database
    ];

    if (data.database.port) {
      args.unshift("-P", String(data.database.port));
    }

    const out = fs.createWriteStream(filePath);
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
      const env = { ...process.env, MYSQL_PWD: data.database.password };
      const dump = spawn(mysqldumpCmd, args, { env });

      dump.stdout.pipe(out);
      dump.stderr.on("data", d => { stderrBuf += d.toString(); });
      dump.on("error", err => {
        toolMissing = true;
        stderrBuf += err.message;
      });
      dump.on("close", async (code) => {
        out.close();
        if (toolMissing) {
          return sendResult(false, `mysqldump not found or failed to execute. Error: ${stderrBuf.slice(0, 500)}`);
        }
        if (code !== 0) {
          return sendResult(false, `mysqldump exited with code ${code}. ${stderrBuf.slice(0, 500)}`);
        }
        let size = 0;
        try { size = fs.statSync(filePath).size; } catch { }

        try {
          const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.sql'));
          if (files.length > 10) {
            const sorted = files.map(f => ({ f, t: fs.statSync(path.join(backupDir, f)).mtimeMs }))
              .sort((a, b) => a.t - b.t);
            const toDelete = sorted.slice(0, files.length - 10);
            for (const del of toDelete) {
              try { fs.unlinkSync(path.join(backupDir, del.f)); } catch { }
            }
          }
        } catch { }

        sendResult(true, `Backup completed. File size: ${Math.round(size / 1024)} KB`);
      });
    } catch (e: any) {
      return sendResult(false, `Unexpected error spawning mysqldump: ${e.message}`);
    }
  }
};
