/**
 * Follow-ups from af8de42..d1eb5a1 (10 Nov), part 4 -- the e2e server's memory cap (scripts/qa/e2e-server.ts)
 * counts the server and everything under it, and stops it past E2E_SERVER_MAX_MB.
 */
import { describe, expect, it } from "vitest";
import {
  descendants,
  overCap,
  parsePosixProcesses,
  parseWindowsProcesses,
  treeMemory,
} from "@/scripts/qa/process-tree";
import { sourceText } from "@/tests/helpers/source-files";

const PROCESSES = [
  { pid: 1, ppid: 0, mb: 50 },
  { pid: 100, ppid: 1, mb: 900 }, // the shell's next dev
  { pid: 101, ppid: 100, mb: 3000 }, // a Turbopack loader worker
  { pid: 102, ppid: 101, mb: 1200 }, // and its child
  { pid: 200, ppid: 1, mb: 800 }, // VS Code: not ours
];

describe("the server's process tree", () => {
  it("is the server and everything under it, nothing else", () => {
    expect([...descendants(PROCESSES, 100)].sort()).toEqual([100, 101, 102]);
    expect(treeMemory(PROCESSES, 100)).toEqual({ mb: 5100, count: 3 });
  });

  it("reads Windows' CSV (bytes) and ps (KB)", () => {
    const csv =
      '"ProcessId","ParentProcessId","WorkingSetSize"\r\n"100","1","1073741824"\r\n"101","100","536870912"\r\n';
    expect(parseWindowsProcesses(csv)).toEqual([
      { pid: 100, ppid: 1, mb: 1024 },
      { pid: 101, ppid: 100, mb: 512 },
    ]);
    expect(parsePosixProcesses("  100     1 1048576\n  101   100  524288\n")).toEqual([
      { pid: 100, ppid: 1, mb: 1024 },
      { pid: 101, ppid: 100, mb: 512 },
    ]);
  });

  it("stops past the cap, and a cap of 0 is off", () => {
    expect(overCap(6145, 6144)).toBe(true);
    expect(overCap(6144, 6144)).toBe(false);
    expect(overCap(99_999, 0)).toBe(false);
  });

  it("the server script uses it: logs each minute and stops the whole tree", () => {
    const script = sourceText("scripts/qa/e2e-server.ts");
    expect(script).toContain("E2E_SERVER_MAX_MB ?? 6144");
    expect(script).toContain("treeMemory(await listProcesses(), child.pid)");
    expect(script).toMatch(/taskkill", \["\/PID", String\(child\.pid\), "\/T", "\/F"\]/);
  });
});
