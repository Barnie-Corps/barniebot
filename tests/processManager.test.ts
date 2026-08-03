declare var jest: any;
declare var describe: any;
declare var test: any;
declare var it: any;
declare var expect: any;

jest.mock("figlet", () => ({
  __esModule: true,
  default: { textSync: jest.fn(() => "") }
}));

import ProcessManager, { pickRunner, classifyCrash, isFatalPattern, decideRestart } from "../ProcessManager";

describe("pickRunner", () => {
  test("prefers ts-node over tsx when both available", () => {
    const runner = pickRunner("index.ts", () => true, (cmd, args) => args[1] === "ts-node");
    expect(runner).toEqual({ cmd: "npx", args: ["ts-node", "index.ts"] });
  });

  test("falls back to tsx when ts-node unavailable", () => {
    const runner = pickRunner("index.ts", () => true, (cmd, args) => args[1] === "tsx");
    expect(runner).toEqual({ cmd: "npx", args: ["tsx", "index.ts"] });
  });

  test("falls back to node for js file when no ts runner available", () => {
    const runner = pickRunner("index.ts", (p) => p === "index.js", () => false);
    expect(runner).toEqual({ cmd: "node", args: ["index.js"] });
  });

  test("returns null when no runner or file exists", () => {
    const runner = pickRunner("index.ts", () => false, () => false);
    expect(runner).toBeNull();
  });

  test("uses ts-node availability check via status, not exceptions", () => {
    let checked = 0;
    const runner = pickRunner("index.ts", (p) => p === "index.ts", () => {
      checked++;
      return false;
    });
    expect(runner).toBeNull();
    expect(checked).toBe(2);
  });
});

describe("classifyCrash", () => {
  test("clean exit code 0 is clean", () => {
    expect(classifyCrash(0, null)).toBe("clean");
  });

  test("non-zero exit code is a crash", () => {
    expect(classifyCrash(1, null)).toBe("crash");
  });

  test("any signal is a crash even with code 0", () => {
    expect(classifyCrash(0, "SIGTERM")).toBe("crash");
  });
});

describe("isFatalPattern", () => {
  test("detects fatal patterns", () => {
    expect(isFatalPattern("FATAL ERROR: Out of memory")).toBe(true);
    expect(isFatalPattern("Cannot enqueue after fatal error")).toBe(true);
    expect(isFatalPattern("Segmentation fault")).toBe(true);
  });

  test("ignores non-fatal patterns", () => {
    expect(isFatalPattern("ECONNREFUSED")).toBe(false);
    expect(isFatalPattern("MODULE_NOT_FOUND")).toBe(false);
  });
});

describe("decideRestart", () => {
  const base = {
    code: 1,
    signal: null,
    isShuttingDown: false,
    autoRestart: true,
    stopOnCleanExit: true,
    restartCount: 0,
    maxRestarts: 5,
    elapsedSinceLastCrash: 1000,
    restartWindowMs: 3600000
  };

  test("restarts on crash", () => {
    const d = decideRestart(base);
    expect(d.restart).toBe(true);
    expect(d.resetCount).toBe(false);
  });

  test("does not restart on clean exit", () => {
    const d = decideRestart({ ...base, code: 0 });
    expect(d.restart).toBe(false);
    expect(d.reason).toBe("clean exit");
  });

  test("restarts on clean exit when stopOnCleanExit is false", () => {
    const d = decideRestart({ ...base, code: 0, stopOnCleanExit: false });
    expect(d.restart).toBe(true);
  });

  test("does not restart while shutting down", () => {
    const d = decideRestart({ ...base, isShuttingDown: true });
    expect(d.restart).toBe(false);
    expect(d.reason).toBe("disabled");
  });

  test("does not restart when autoRestart disabled", () => {
    const d = decideRestart({ ...base, autoRestart: false });
    expect(d.restart).toBe(false);
    expect(d.reason).toBe("disabled");
  });

  test("stops after max restarts", () => {
    const d = decideRestart({ ...base, restartCount: 5 });
    expect(d.restart).toBe(false);
    expect(d.reason).toBe("max restarts");
  });

  test("resets count after long quiet window", () => {
    const d = decideRestart({ ...base, elapsedSinceLastCrash: 3600001 });
    expect(d.restart).toBe(true);
    expect(d.resetCount).toBe(true);
  });
});
