declare var jest: any;
declare var describe: any;
declare var test: any;
declare var expect: any;
declare var beforeEach: any;

jest.mock("../Workers", () => ({
  __esModule: true,
  default: {
    bulkCreateWorkers: jest.fn(),
    prewarmType: jest.fn().mockResolvedValue(undefined),
    getAvailableWorker: jest.fn(),
    createWorker: jest.fn(),
    AwaitAvailableWorker: jest.fn(),
    sendMessage: jest.fn(),
    postMessage: jest.fn(),
    awaitResponse: jest.fn()
  }
}));

jest.mock("../managers/StaffRanksManager", () => ({
  __esModule: true,
  default: {
    hasMinimumRank: jest.fn(() => false),
    getRankHierarchyByName: jest.fn(),
    getRankByHierarchy: jest.fn(),
    getRankByName: jest.fn(),
    hasPermission: jest.fn()
  }
}));

jest.mock("../mysql/database", () => ({
  __esModule: true,
  default: {
    query: jest.fn()
  }
}));

jest.mock("../NVIDIAModels", () => ({
  __esModule: true,
  default: {}
}));

jest.mock("../Log", () => ({
  __esModule: true,
  default: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    success: jest.fn()
  }
}));

jest.mock("../data", () => ({
  __esModule: true,
  default: {
    bot: {
      owners: ["owner-1"],
      staff_ranks: []
    }
  }
}));

jest.mock("../index", () => ({
  __esModule: true,
  default: {
    guilds: { fetch: jest.fn(), cache: new Map() },
    users: { fetch: jest.fn() }
  }
}));

jest.mock("../managers/CacheManager", () => ({
  __esModule: true,
  default: {
    getLocal: jest.fn(),
    setLocal: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    initialize: jest.fn(),
    isRedisAvailable: jest.fn()
  }
}));

import { PermissionFlagsBits } from "discord.js";
import db from "../mysql/database";
import client from "../index";
import utils from "../utils";

const tools: any = utils.AIFunctions;

const makeMember = (id: string, position: number, perms: bigint[]) => ({
  id,
  roles: { highest: { position, comparePositionTo: (other: any) => position - other.position } },
  permissions: { has: (perm: bigint) => perms.includes(perm) || perms.includes(PermissionFlagsBits.Administrator) },
  kick: jest.fn().mockResolvedValue(undefined)
});

const setupGuild = (members: Record<string, any>) => {
  const guild = {
    id: "guild-1",
    ownerId: "guild-owner",
    members: {
      fetch: jest.fn(async (id: string) => {
        if (members[id]) return members[id];
        throw new Error("Unknown member");
      }),
      me: makeMember("bot", 100, [PermissionFlagsBits.Administrator])
    }
  };
  (client as any).guilds.fetch.mockResolvedValue(guild);
  return guild;
};

beforeEach(() => {
  (db as any).query.mockResolvedValue([]);
});

describe("AI tool authorization", () => {
  test("send_dm refuses to DM another user for a non-privileged requester", async () => {
    const result = await tools.send_dm({ requesterId: "user-1", userId: "user-2", content: "hi" });
    expect(result.error).toBeDefined();
    expect((client as any).users.fetch).not.toHaveBeenCalled();
  });

  test("send_dm allows the requester to DM themselves", async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    (client as any).users.fetch.mockResolvedValue({ send });
    const result = await tools.send_dm({ requesterId: "user-1", userId: "user-1", content: "hi" });
    expect(result).toEqual({ success: true });
    expect(send).toHaveBeenCalledWith("hi");
  });

  test("kick_member requires Kick Members in the target guild", async () => {
    const target = makeMember("target", 1, []);
    setupGuild({ "user-1": makeMember("user-1", 5, []), target });
    const result = await tools.kick_member({ requesterId: "user-1", guildId: "guild-1", memberId: "target", reason: "x" });
    expect(result.error).toBeDefined();
    expect(target.kick).not.toHaveBeenCalled();
  });

  test("kick_member refuses targets with an equal or higher role", async () => {
    const target = makeMember("target", 5, []);
    setupGuild({ "user-1": makeMember("user-1", 5, [PermissionFlagsBits.KickMembers]), target });
    const result = await tools.kick_member({ requesterId: "user-1", guildId: "guild-1", memberId: "target", reason: "x" });
    expect(result.error).toBeDefined();
    expect(target.kick).not.toHaveBeenCalled();
  });

  test("kick_member kicks lower-ranked members for an authorized requester", async () => {
    const target = makeMember("target", 1, []);
    setupGuild({ "user-1": makeMember("user-1", 5, [PermissionFlagsBits.KickMembers]), target });
    const result = await tools.kick_member({ requesterId: "user-1", guildId: "guild-1", memberId: "target", reason: "x" });
    expect(result).toEqual({ success: true });
    expect(target.kick).toHaveBeenCalledWith("x");
  });
});
