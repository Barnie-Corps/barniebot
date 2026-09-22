import { AI_WORKSPACE_ROOT, ALLOWED_SANDBOX_MODULES, MAX_ATTACHMENT_SIZE, MAX_DOWNLOAD_BYTES, MAX_FILE_SIZE_FOR_SEARCH, MAX_WORKSPACE_SCAN_RESULTS, assertPublicUrl, collectSearchMatches, ensureWorkspaceExists, execPromise, formatLogValue, isOwner, readDirectoryRecursive, resolveWorkspacePath, safeStat, truncate } from "../../utils";
import data from "../../data";
import path from "path";
import { promises as fs } from "fs";
import * as vm from "vm";

const workspaceFunctions = {
    list_workspace_files: async (args: { path?: string; recursive?: boolean; requesterId?: string } = {}): Promise<any> => {
      const userId = args.requesterId;
      await ensureWorkspaceExists(userId);
      const directoryPath = resolveWorkspacePath(args.path ?? ".", userId);
      const stats = await safeStat(directoryPath);
      if (!stats) return { error: "Path not found" };
      if (!stats.isDirectory()) return { error: "Target is not a directory" };
      const userWorkspace = userId ? path.join(AI_WORKSPACE_ROOT, userId) : AI_WORKSPACE_ROOT;
      if (args.recursive) {
        const entries = await readDirectoryRecursive(directoryPath, MAX_WORKSPACE_SCAN_RESULTS, [], path.relative(userWorkspace, directoryPath) || "");
        return { entries };
      }
      const items = await fs.readdir(directoryPath, { withFileTypes: true });
      return {
        entries: items.map(item => ({
          path: path.join(path.relative(userWorkspace, directoryPath), item.name).replace(/\\/g, "/"),
          type: item.isDirectory() ? "directory" : "file"
        }))
      };
    },
    read_workspace_file: async (args: { path: string; encoding?: BufferEncoding; requesterId?: string }): Promise<any> => {
      if (!args?.path) return { error: "Missing path parameter" };
      const userId = args.requesterId;
      const filePath = resolveWorkspacePath(args.path, userId);
      const stats = await safeStat(filePath);
      if (!stats) return { error: "File not found" };
      if (!stats.isFile()) return { error: "Path is not a file" };
      const encoding = args.encoding ?? "utf8";
      const content = await fs.readFile(filePath, encoding);
      return { content };
    },
    write_workspace_file: async (args: { path: string; content: string; overwrite?: boolean; requesterId?: string }): Promise<any> => {
      if (!args?.path) return { error: "Missing path parameter" };
      if (typeof args.content !== "string") return { error: "Missing content parameter" };
      const userId = args.requesterId;
      await ensureWorkspaceExists(userId);
      const filePath = resolveWorkspacePath(args.path, userId);
      const directory = path.dirname(filePath);
      await fs.mkdir(directory, { recursive: true });
      const stats = await safeStat(filePath);
      if (stats && !args.overwrite) return { error: "File already exists" };
      await fs.writeFile(filePath, args.content, "utf8");
      return { success: true };
    },
    append_workspace_file: async (args: { path: string; content: string; requesterId?: string }): Promise<any> => {
      if (!args?.path) return { error: "Missing path parameter" };
      if (typeof args.content !== "string") return { error: "Missing content parameter" };
      const userId = args.requesterId;
      await ensureWorkspaceExists(userId);
      const filePath = resolveWorkspacePath(args.path, userId);
      const directory = path.dirname(filePath);
      await fs.mkdir(directory, { recursive: true });
      await fs.appendFile(filePath, args.content, "utf8");
      return { success: true };
    },
    delete_workspace_entry: async (args: { path: string; recursive?: boolean; requesterId?: string }): Promise<any> => {
      if (!args?.path) return { error: "Missing path parameter" };
      const userId = args.requesterId;
      const targetPath = resolveWorkspacePath(args.path, userId);
      const stats = await safeStat(targetPath);
      if (!stats) return { error: "Path not found" };
      if (stats.isDirectory()) {
        if (!args.recursive) return { error: "Directory deletion requires recursive flag" };
        await fs.rm(targetPath, { recursive: true, force: true });
      } else {
        await fs.unlink(targetPath);
      }
      return { success: true };
    },
    move_workspace_entry: async (args: { from: string; to: string; overwrite?: boolean; requesterId?: string }): Promise<any> => {
      if (!args?.from || !args.to) return { error: "Missing path parameters" };
      const userId = args.requesterId;
      const source = resolveWorkspacePath(args.from, userId);
      const destination = resolveWorkspacePath(args.to, userId);
      const sourceStats = await safeStat(source);
      if (!sourceStats) return { error: "Source not found" };
      const destinationStats = await safeStat(destination);
      if (destinationStats) {
        if (!args.overwrite) return { error: "Destination already exists" };
        if (destinationStats.isDirectory()) {
          await fs.rm(destination, { recursive: true, force: true });
        } else {
          await fs.unlink(destination);
        }
      } else {
        await fs.mkdir(path.dirname(destination), { recursive: true });
      }
      await fs.rename(source, destination);
      return { success: true };
    },
    create_workspace_directory: async (args: { path: string; requesterId?: string }): Promise<any> => {
      if (!args?.path) return { error: "Missing path parameter" };
      const userId = args.requesterId;
      const directoryPath = resolveWorkspacePath(args.path, userId);
      await fs.mkdir(directoryPath, { recursive: true });
      return { success: true };
    },
    download_to_workspace: async (args: { url: string; path: string; overwrite?: boolean; requesterId?: string }): Promise<any> => {
      if (!args?.url || !args.path) return { error: "Missing parameters" };
      const userId = args.requesterId;
      await ensureWorkspaceExists(userId);
      try {
        await assertPublicUrl(args.url);
      } catch (error: any) {
        return { error: error?.message || "URL validation failed" };
      }
      let response: Response;
      try {
        response = await fetch(args.url);
      } catch (error: any) {
        return { error: `Download failed: ${error?.message || String(error)}` };
      }
      if (!response.ok) return { error: `Failed to download resource: ${response.status}` };
      try {
        await assertPublicUrl(args.url, response.url);
      } catch (error: any) {
        return { error: error?.message || "URL validation failed" };
      }
      const filePath = resolveWorkspacePath(args.path, userId);
      const stats = await safeStat(filePath);
      if (stats && !args.overwrite) return { error: "File already exists" };
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const body = response.body;
      if (!body) return { error: "Download failed: empty response body" };
      const reader = body.getReader();
      const parts: Buffer[] = [];
      let total = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > MAX_DOWNLOAD_BYTES) {
            return { error: `Download exceeds ${Math.floor(MAX_DOWNLOAD_BYTES / 1024 / 1024)}MB limit` };
          }
          parts.push(Buffer.from(value));
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      await fs.writeFile(filePath, Buffer.concat(parts));
      return { success: true, size: total };
    },
    search_workspace_text: async (args: { query: string; path?: string; maxResults?: number; requesterId?: string }): Promise<any> => {
      if (!args?.query) return { error: "Missing query parameter" };
      const userId = args.requesterId;
      await ensureWorkspaceExists(userId);
      const basePath = resolveWorkspacePath(args.path ?? ".", userId);
      const stats = await safeStat(basePath);
      if (!stats) return { error: "Path not found" };
      const maxResults = Math.max(1, Math.min(args.maxResults ?? MAX_WORKSPACE_SCAN_RESULTS, MAX_WORKSPACE_SCAN_RESULTS));
      const queue: string[] = [];
      if (stats.isDirectory()) {
        queue.push(basePath);
      } else if (stats.isFile()) {
        queue.push(basePath);
      } else {
        return { error: "Unsupported file type" };
      }
      const userWorkspace = userId ? path.join(AI_WORKSPACE_ROOT, userId) : AI_WORKSPACE_ROOT;
      const matches: { path: string; line: number; snippet: string }[] = [];
      while (queue.length > 0 && matches.length < maxResults) {
        const current = queue.shift() as string;
        const currentStats = await fs.stat(current);
        if (currentStats.isDirectory()) {
          const children = await fs.readdir(current);
          for (const child of children) {
            queue.push(path.join(current, child));
          }
        } else if (currentStats.isFile() && currentStats.size <= MAX_FILE_SIZE_FOR_SEARCH) {
          const fileMatches = await collectSearchMatches(current, args.query, maxResults - matches.length, userWorkspace);
          matches.push(...fileMatches);
        }
      }
      return { matches };
    },
    workspace_file_info: async (args: { path: string; requesterId?: string }): Promise<any> => {
      if (!args?.path) return { error: "Missing path parameter" };
      const userId = args.requesterId;
      const target = resolveWorkspacePath(args.path, userId);
      const stats = await safeStat(target);
      if (!stats) return { error: "Path not found" };
      return {
        info: {
          path: args.path.replace(/\\/g, "/"),
          size: stats.size,
          isDirectory: stats.isDirectory(),
          isFile: stats.isFile(),
          modified: stats.mtime.toISOString()
        }
      };
    },
    search_web: async (args: { query: string; numResults?: number; engineId?: string }): Promise<any> => {
      if (!args?.query) return { error: "Missing query parameter" };
      const apiKey = process.env.SEARCH_ENGINE_API_KEY;
      const engineId = args.engineId ?? process.env.SEARCH_ENGINE_CX;
      if (!apiKey || !engineId) return { error: "Search engine not configured" };
      const url = new URL("https://www.googleapis.com/customsearch/v1");
      url.searchParams.set("key", apiKey);
      url.searchParams.set("cx", engineId);
      url.searchParams.set("q", args.query);
      if (args.numResults) url.searchParams.set("num", String(Math.min(Math.max(args.numResults, 1), 10)));
      const response = await fetch(url.toString());
      if (!response.ok) return { error: `Search request failed: ${response.status}` };
      const data = await response.json() as any;
      if (!Array.isArray(data.items)) return { results: [] };
      return {
        results: data.items.map((item: any) => ({
          title: item.title,
          link: item.link,
          snippet: item.snippet
        }))
      };
    },
    attach_workspace_file: async (args: { path: string; requesterId?: string }): Promise<any> => {
      if (!args?.path) return { error: "Missing path parameter" };
      const userId = args.requesterId;
      await ensureWorkspaceExists(userId);
      const filePath = resolveWorkspacePath(args.path, userId);
      const stats = await safeStat(filePath);
      if (!stats) return { error: "File not found" };
      if (!stats.isFile()) return { error: "Path is not a file" };
      if (stats.size > MAX_ATTACHMENT_SIZE) {
        const limitMb = (MAX_ATTACHMENT_SIZE / (1024 * 1024)).toFixed(1);
        return { error: `File exceeds ${limitMb}MB limit` };
      }
      const userWorkspace = userId ? path.join(AI_WORKSPACE_ROOT, userId) : AI_WORKSPACE_ROOT;
      const relativePath = path.relative(userWorkspace, filePath).replace(/\\/g, "/");
      return {
        success: true,
        file: {
          path: relativePath,
          size: stats.size,
          name: path.basename(filePath)
        },
        __attachments: [
          {
            path: filePath,
            name: path.basename(filePath)
          }
        ]
      };
    },
    execute_js_code: async (args: { code: string; requesterId?: string }): Promise<any> => {
      if (!args?.code) return { error: "Missing code parameter" };
      if (!isOwner(args.requesterId)) return { error: "Requester is not authorized to execute code" };
      if (args.code.length > 5000) return { error: "Code is too long" };
      await ensureWorkspaceExists();
      const logs: string[] = [];
      const logLimit = 50;
      const pushLog = (...values: any[]) => {
        if (logs.length >= logLimit) return;
        logs.push(values.map(value => formatLogValue(value)).join(" "));
      };
      const workspaceAPI = {
        readFile: async (target: string) => {
          const resolved = resolveWorkspacePath(target);
          const fileStats = await safeStat(resolved);
          if (!fileStats) throw new Error("File not found");
          if (!fileStats.isFile()) throw new Error("Target is not a file");
          return fs.readFile(resolved, "utf8");
        },
        writeFile: async (target: string, content: string) => {
          if (typeof content !== "string") throw new Error("Content must be a string");
          const resolved = resolveWorkspacePath(target);
          await fs.mkdir(path.dirname(resolved), { recursive: true });
          await fs.writeFile(resolved, content, "utf8");
          return true;
        },
        appendFile: async (target: string, content: string) => {
          if (typeof content !== "string") throw new Error("Content must be a string");
          const resolved = resolveWorkspacePath(target);
          await fs.mkdir(path.dirname(resolved), { recursive: true });
          await fs.appendFile(resolved, content, "utf8");
          return true;
        },
        deleteFile: async (target: string) => {
          const resolved = resolveWorkspacePath(target);
          const fileStats = await safeStat(resolved);
          if (!fileStats) throw new Error("Path not found");
          if (!fileStats.isFile()) throw new Error("Target is not a file");
          await fs.unlink(resolved);
          return true;
        },
        list: async (target = ".") => {
          const resolved = resolveWorkspacePath(target);
          const dirStats = await safeStat(resolved);
          if (!dirStats) throw new Error("Path not found");
          if (!dirStats.isDirectory()) throw new Error("Target is not a directory");
          const entries = await fs.readdir(resolved, { withFileTypes: true });
          return entries.map(entry => ({
            name: entry.name,
            type: entry.isDirectory() ? "directory" : "file"
          }));
        }
      } as const;
      const moduleCache = new Map<string, unknown>();
      const safeRequire = (requested: unknown) => {
        if (typeof requested !== "string") throw new Error("Module name must be a string");
        const moduleName = requested.trim();
        if (!ALLOWED_SANDBOX_MODULES.has(moduleName)) throw new Error(`Module "${moduleName}" is not allowed`);
        if (!moduleCache.has(moduleName)) {
          moduleCache.set(moduleName, ALLOWED_SANDBOX_MODULES.get(moduleName));
        }
        return moduleCache.get(moduleName);
      };
      Object.defineProperties(safeRequire, {
        cache: { value: Object.freeze({}), writable: false, enumerable: false },
        main: { value: undefined, writable: false, enumerable: false },
        resolve: {
          value: () => {
            throw new Error("require.resolve is not available inside the sandbox");
          },
          writable: false,
          enumerable: false
        },
        extensions: { value: undefined, writable: false, enumerable: false }
      });
      const sandbox: Record<string, any> = {
        console: {
          log: (...values: any[]) => pushLog(...values)
        },
        workspace: workspaceAPI,
        Buffer,
        TextEncoder,
        TextDecoder,
        Date,
        Math,
        setTimeout,
        setInterval,
        clearTimeout,
        clearInterval
      };
      sandbox.global = sandbox;
      sandbox.globalThis = sandbox;
      sandbox.process = undefined;
      sandbox.require = safeRequire;
      sandbox.module = undefined;
      sandbox.exports = undefined;
      sandbox.__dirname = undefined;
      sandbox.__filename = undefined;
      try {
        const scriptSource = `(async () => {\n${args.code}\n})()`;
        const script = new vm.Script(scriptSource, { filename: "ai-workspace.js" });
        const context = vm.createContext(sandbox, { name: "ai-sandbox" });
        const timeoutMs = 5000;
        const resultPromise = script.runInContext(context, { timeout: timeoutMs });
        const executionResult = await Promise.race([
          resultPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error("Execution timed out")), timeoutMs))
        ]);
        const formattedResult = typeof executionResult === "undefined" ? "undefined" : formatLogValue(executionResult);
        return {
          success: true,
          logs,
          result: formattedResult
        };
      } catch (error: any) {
        return {
          error: error?.message ?? "Failed to execute code",
          logs
        };
      }
    },
    execute_command: async (args: { command: string; requesterId?: string }): Promise<any> => {
      if (!args?.command) return { error: "Missing command parameter" };
      if (!isOwner(args.requesterId)) return { error: "Requester is not authorized to execute commands" };
      const trimmedCommand = args.command.trim();
      if (!trimmedCommand) return { error: "Command cannot be empty" };
      if (trimmedCommand.length > 256) return { error: "Command is too long" };
      if (/[\r\n]/.test(trimmedCommand)) return { error: "Command cannot contain newline characters" };
      const userId = args.requesterId;
      await ensureWorkspaceExists(userId);
      const userWorkspace = userId ? path.join(AI_WORKSPACE_ROOT, userId) : AI_WORKSPACE_ROOT;
      try {
        const { stdout, stderr } = await execPromise(trimmedCommand, {
          cwd: userWorkspace,
          timeout: 10000,
          maxBuffer: 1024 * 1024,
          windowsHide: true
        });
        return {
          success: true,
          stdout: truncate(String(stdout ?? "").trim()),
          stderr: truncate(String(stderr ?? "").trim())
        };
      } catch (error: any) {
        return {
          error: error?.message ?? "Command execution failed",
          code: typeof error?.code === "number" ? error.code : null,
          stdout: truncate(String(error?.stdout ?? "").trim()),
          stderr: truncate(String(error?.stderr ?? "").trim())
        };
      }
    },
};

export default workspaceFunctions;
