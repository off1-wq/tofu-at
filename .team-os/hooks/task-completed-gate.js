#!/usr/bin/env node
/**
 * TaskCompleted Hook - task-completed-gate.js
 *
 * Design principle: FAIL-OPEN. This gate must never stall a team. A "block"
 * decision is only emitted when a field is KNOWN to be present in the hook
 * payload AND holds a KNOWN-bad value. Missing fields, parse errors, or absent
 * data always result in "allow". The worst case for new code here is a no-op,
 * never a team stall.
 *
 * What it does:
 * 1. Updates the agent's row in TEAM_PROGRESS.md (column-aware, tolerant to
 *    header reordering).
 * 2. If — and only if — the payload explicitly carries
 *    quality_gates.required_outputs, verifies those files exist (opt-in block).
 *
 * Referenced by: .claude/settings.local.json hooks.TaskCompleted
 */

const fs = require("fs");
const path = require("path");

const PROGRESS_PATH = path.join(
  process.cwd(),
  ".team-os",
  "artifacts",
  "TEAM_PROGRESS.md"
);

// Update the agent's row in TEAM_PROGRESS.md using header-based column mapping.
// Falls back to best-effort regex if the Status Board header can't be located.
function updateProgressFile(agentName) {
  if (!fs.existsSync(PROGRESS_PATH)) return;

  const content = fs.readFileSync(PROGRESS_PATH, "utf8");
  const lines = content.split("\n");
  const now = new Date().toISOString().slice(0, 16).replace("T", " ");

  // Locate the Status Board header to map columns by name.
  let progIdx = -1;
  let updIdx = -1;
  let noteIdx = -1;
  for (const line of lines) {
    if (line.includes("|") && /\bprogress\b/i.test(line)) {
      const headers = line.split("|").map((h) => h.trim().toLowerCase());
      progIdx = headers.findIndex((h) => /progress/.test(h));
      updIdx = headers.findIndex((h) => /updated|time|date/.test(h));
      noteIdx = headers.findIndex((h) => /note|status/.test(h));
      break;
    }
  }

  const updated = lines.map((line) => {
    const isAgentRow =
      line.includes(`@${agentName}`) || line.includes(`| ${agentName} |`);
    if (!isAgentRow) return line;

    // Column-aware update (preferred): split on "|" so the leading empty cell
    // aligns header index N with cells[N].
    if (progIdx >= 0) {
      const cells = line.split("|");
      if (cells[progIdx] !== undefined) cells[progIdx] = " 100% ";
      if (updIdx >= 0 && cells[updIdx] !== undefined) cells[updIdx] = ` ${now} `;
      if (noteIdx >= 0 && cells[noteIdx] !== undefined) cells[noteIdx] = " completed ";
      return cells.join("|");
    }

    // Fallback: best-effort regex (header row not found).
    return line
      .replace(/\d+%/, "100%")
      .replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/, now);
  });

  fs.writeFileSync(PROGRESS_PATH, updated.join("\n"), "utf8");
}

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});

process.stdin.on("end", () => {
  try {
    const hookData = JSON.parse(input);
    const taskId = hookData.task_id || "unknown";
    const agentName =
      hookData.agent_name || hookData.teammate_name || "unknown";

    updateProgressFile(agentName);

    // Opt-in validation: only when the payload explicitly provides a list of
    // required outputs do we verify them. This is the single blocking path, and
    // it requires BOTH a known field (required_outputs present) AND a known-bad
    // value (a listed file missing). If the field is absent, this is a no-op.
    const requiredOutputs = hookData.quality_gates?.required_outputs;
    if (Array.isArray(requiredOutputs) && requiredOutputs.length > 0) {
      const missing = requiredOutputs.filter((f) => {
        try {
          return !fs.existsSync(path.resolve(process.cwd(), f));
        } catch {
          return false; // can't check → don't block
        }
      });
      if (missing.length > 0) {
        console.error(
          `[task-completed-gate] BLOCKED: ${agentName} missing required outputs: ${missing.join(", ")}`
        );
        console.log(
          JSON.stringify({
            decision: "block",
            reason: `Task ${taskId} missing required output(s): ${missing.join(", ")}`,
          })
        );
        process.exit(2);
      }
    }

    console.log(
      JSON.stringify({
        decision: "allow",
        reason: `Task ${taskId} by ${agentName} completed`,
      })
    );
    process.exit(0);
  } catch (err) {
    // Fail-open: never block on hook processing errors.
    console.error(`[task-completed-gate] Error: ${err.message}`);
    process.exit(0);
  }
});
