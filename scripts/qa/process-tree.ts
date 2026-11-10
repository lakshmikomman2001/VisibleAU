/**
 * Follow-ups from af8de42..d1eb5a1 (10 Nov), part 4 -- how much memory a process and everything under it holds
 * (the e2e server's `next dev` and its Turbopack loader workers), so scripts/qa/e2e-server.ts can log it and
 * stop the server before it takes the machine down. A standalone e2e server grew to 8 GB while idle (9 Nov),
 * and a crashed run once left 926 workers holding 42 GB (1 Nov).
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export interface ProcessInfo {
  pid: number;
  ppid: number;
  /** Resident memory, MB. */
  mb: number;
}

/** The pids of `root` and every process under it. */
export function descendants(processes: readonly ProcessInfo[], root: number): Set<number> {
  const tree = new Set([root]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of processes) {
      if (!tree.has(p.pid) && tree.has(p.ppid)) {
        tree.add(p.pid);
        grew = true;
      }
    }
  }
  return tree;
}

/** The memory `root` and its descendants hold, MB, and how many processes that is. */
export function treeMemory(
  processes: readonly ProcessInfo[],
  root: number,
): { mb: number; count: number } {
  const tree = descendants(processes, root);
  const members = processes.filter((p) => tree.has(p.pid));
  return { mb: Math.round(members.reduce((n, p) => n + p.mb, 0)), count: members.length };
}

/** "ProcessId,ParentProcessId,WorkingSetSize" CSV (PowerShell's ConvertTo-Csv), bytes -> MB. */
export function parseWindowsProcesses(csv: string): ProcessInfo[] {
  return csv
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.replace(/"/g, "").split(","))
    .filter((cells) => cells.length >= 3 && /^\d+$/.test(cells[0]))
    .map(([pid, ppid, bytes]) => ({
      pid: Number(pid),
      ppid: Number(ppid),
      mb: Number(bytes) / (1024 * 1024),
    }));
}

/** `ps -A -o pid=,ppid=,rss=` lines, KB -> MB. */
export function parsePosixProcesses(text: string): ProcessInfo[] {
  return text
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .filter((cells) => cells.length >= 3 && /^\d+$/.test(cells[0]))
    .map(([pid, ppid, kb]) => ({ pid: Number(pid), ppid: Number(ppid), mb: Number(kb) / 1024 }));
}

export async function listProcesses(): Promise<ProcessInfo[]> {
  if (process.platform === "win32") {
    const { stdout } = await run(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize | ConvertTo-Csv -NoTypeInformation",
      ],
      { maxBuffer: 1 << 24 },
    );
    return parseWindowsProcesses(stdout);
  }
  const { stdout } = await run("ps", ["-A", "-o", "pid=,ppid=,rss="], { maxBuffer: 1 << 24 });
  return parsePosixProcesses(stdout);
}

/** Over the cap: stop. A cap of 0 or less turns it off. */
export function overCap(mb: number, capMb: number): boolean {
  return capMb > 0 && mb > capMb;
}
