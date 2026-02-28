import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import utils from "../utils";
import data from "../data";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import os from "os";

const HIGH_RANKS = ["owner", "admin", "lead", "manager"];
const MAX_ATTACHMENT_SIZE = 8 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const idx = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, idx);
  return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

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
  category: "Admin",
  ephemeral: true,
  async execute(interaction: ChatInputCommandInteraction) {
    const rank = await utils.getUserStaffRank(interaction.user.id);
    if (!rank || !HIGH_RANKS.includes(rank.toLowerCase())) {
      return utils.safeInteractionRespond(interaction, "You do not have permission to run database backups.");
    }

    const makePublic = interaction.options.getBoolean("public") || false;

    await utils.safeInteractionRespond(interaction, "Starting backup... This may take a moment.");

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
      return utils.safeInteractionRespond(interaction, { content: "", embeds: [embed] });
    }

    const dbHost = String(data.database.host || "localhost").trim() || "localhost";
    const fallbackHost = dbHost.toLowerCase() === "localhost" ? "127.0.0.1" : null;
    const dumpHosts = fallbackHost && fallbackHost !== dbHost ? [dbHost, fallbackHost] : [dbHost];
    const dbPort = Number(data.database.port);
    const usePort = Number.isFinite(dbPort) && dbPort > 0 ? dbPort : undefined;
    const baseArgs: string[] = [
      "--single-transaction",
      "--quick",
      "--routines",
      "--events",
      "--triggers",
      "--default-character-set=utf8mb4",
      "--protocol=TCP",
      "-u", data.database.user,
      "-p" + String(process.env.DB_PASSWORD)
    ];

    const sendResult = async (ok: boolean, details: string, fileSize?: number) => {
      const embed = new EmbedBuilder()
        .setColor(ok ? 0x4caf50 : 0xff5252)
        .setTitle(ok ? "Database Backup Successful" : "Database Backup Failed")
        .setDescription(details)
        .addFields({ name: "File", value: ok ? fileName : "--" })
        .setTimestamp();
      if (!makePublic) return utils.safeInteractionRespond(interaction, { content: "", embeds: [embed] });
      const canAttach = ok && typeof fileSize === "number" && fileSize > 0 && fileSize <= MAX_ATTACHMENT_SIZE;
      const files = canAttach ? [{ attachment: filePath, name: fileName }] : [];
      if (ok && (!fileSize || fileSize <= 0)) embed.addFields({ name: "Note", value: "Backup file was empty." });
      if (ok && fileSize && fileSize > MAX_ATTACHMENT_SIZE) {
        embed.addFields({ name: "Note", value: `Backup file is ${formatBytes(fileSize)} and exceeds the attachment limit.` });
      }
      await interaction.followUp({ embeds: [embed], files });
    };

    const runDumpAttempt = async (host: string): Promise<{ code: number; stderr: string; toolMissing: boolean; writeFailed: boolean }> => {
      const env = { ...process.env, MYSQL_PWD: data.database.password };
      const args = [...baseArgs, "-h", host];
      if (usePort) args.push("-P", String(usePort));
      args.push(data.database.database);
      let stderr = "";
      let toolMissing = false;
      let writeFailed = false;
      return await new Promise((resolve) => {
        const out = fs.createWriteStream(filePath, { flags: "w" });
        out.on("error", err => {
          writeFailed = true;
          stderr += ` ${err.message}`;
        });
        let dump;
        try {
          dump = spawn(mysqldumpCmd, args, { env });
        } catch (err: any) {
          resolve({ code: 1, stderr: err?.message || "spawn failed", toolMissing: true, writeFailed });
          return;
        }
        dump.stdout.pipe(out);
        dump.stderr.on("data", d => { stderr += d.toString(); });
        dump.on("error", err => {
          toolMissing = true;
          stderr += err.message;
        });
        dump.on("close", (code) => {
          out.end(() => resolve({ code: typeof code === "number" ? code : 1, stderr, toolMissing, writeFailed }));
        });
      });
    };

    let selectedHost = dumpHosts[0];
    let lastAttempt: { code: number; stderr: string; toolMissing: boolean; writeFailed: boolean } | null = null;
    for (const host of dumpHosts) {
      const attempt = await runDumpAttempt(host);
      lastAttempt = attempt;
      selectedHost = host;
      if (attempt.toolMissing || attempt.writeFailed || attempt.code === 0) break;
    }

    if (!lastAttempt) {
      return sendResult(false, "Backup failed before mysqldump could start.");
    }
    if (lastAttempt.writeFailed) {
      return sendResult(false, `Failed to write backup file. ${lastAttempt.stderr.slice(0, 500)}`);
    }
    if (lastAttempt.toolMissing) {
      return sendResult(false, `mysqldump not found or failed to execute. Error: ${lastAttempt.stderr.slice(0, 500)}`);
    }
    if (lastAttempt.code !== 0) {
      return sendResult(false, `mysqldump exited with code ${lastAttempt.code} on host ${selectedHost}. ${lastAttempt.stderr.slice(0, 500)}`);
    }

    let size = 0;
    try { size = fs.statSync(filePath).size; } catch { }
    if (size <= 0) {
      return sendResult(false, "Backup completed but file is empty.", size);
    }

    try {
      const files = fs.readdirSync(backupDir).filter(f => f.endsWith(".sql"));
      if (files.length > 10) {
        const sorted = files.map(f => ({ f, t: fs.statSync(path.join(backupDir, f)).mtimeMs }))
          .sort((a, b) => a.t - b.t);
        const toDelete = sorted.slice(0, files.length - 10);
        for (const del of toDelete) {
          try { fs.unlinkSync(path.join(backupDir, del.f)); } catch { }
        }
      }
    } catch { }

    return sendResult(true, `Backup completed from host ${selectedHost}. File size: ${formatBytes(size)}`, size);
  }
};
