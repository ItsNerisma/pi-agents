/**
 * `delegate` tool — delegates a task to a specialized agent
 *
 * Each agent runs in an isolated in-process SDK session (no subprocess).
 * The result includes consumption metrics (tokens, cost).
 */

import { Type } from "typebox";
import { Text } from "@earendil-works/pi-tui";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { discoverAgents, findAgent } from "./registry.js";
import { runAgent, formatDuration, formatTokens } from "./runner.js";
import type { AgentResult, DelegateDetails } from "./types.js";

const DelegateParams = Type.Object({
  agent: Type.String({ description: "Name of the agent to invoke" }),
  task: Type.String({ description: "Task to delegate, with all necessary context" }),
});

/**
 * Builds promptGuidelines dynamically from the discovered agents.
 */
function buildPromptGuidelines(agents: ReturnType<typeof discoverAgents>): string[] {
  const guidelines: string[] = [
    "Use delegate to hand off to specialized agents. Describe the CONCEPT or TASK to solve.",
  ];
  
  for (const agent of agents) {
    guidelines.push(`delegate ${agent.name} — ${agent.description}`);
  }
  
  return guidelines;
}

export function registerDelegateTool(
  pi: ExtensionAPI,
  getActiveAgentName: () => string | null,
): void {
  let cachedGuidelines: string[] | null = null;
  
  pi.registerTool({
    name: "delegate",
    label: "Delegate",
    description: [
      "Delegates a task to a specialized agent working in an isolated context.",
      "The agent receives the task, works autonomously, and returns its result.",
      "Use to break down complex requests into specialized sub-tasks.",
    ].join(" "),
    promptSnippet: "Delegate a task to a specialized agent that works in isolation and returns a targeted summary",
    promptGuidelines: (() => cachedGuidelines || [
      "Use delegate to hand off to specialized agents. Describe the CONCEPT or TASK to solve.",
    ]) as unknown as string[],
    parameters: DelegateParams,

    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      // Discover agents and cache the guidelines on the first call
      const agents = discoverAgents(ctx.cwd);
      if (!cachedGuidelines) {
        cachedGuidelines = buildPromptGuidelines(agents);
      }

      // ── Enforcement: if an active agent has a `delegate:` allow-list,
      //     only those targets are permitted. The prompt alone is advisory;
      //     this is the authoritative gate. ──
      const activeName = getActiveAgentName();
      if (activeName) {
        const activeAgent = findAgent(ctx.cwd, activeName);
        if (activeAgent?.delegate?.length) {
          const needle = params.agent.toLowerCase();
          const allowed = activeAgent.delegate.find((n) => n.toLowerCase() === needle);
          if (!allowed) {
            const available = activeAgent.delegate.join(", ");
            return {
              content: [{ type: "text", text: `Agent "${activeName}" cannot delegate to "${params.agent}". Allowed targets: ${available}` }],
              details: {
                agent: params.agent,
                task: params.task,
                exitCode: 1,
                usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
                errorMessage: `Delegation denied: "${params.agent}" is not in ${activeName}'s delegate allow-list.`,
              } as DelegateDetails,
            };
          }
        }
      }

      // Normalize case: the LLM may pass "EXPLORER" while the frontmatter
      // declares name: explorer. Match case-insensitively, then use the
      // canonical name from the frontmatter.
      const needle = params.agent.toLowerCase();
      const agent = agents.find((a) => a.name.toLowerCase() === needle);

      if (!agent) {
        const available = agents.map((a) => a.name).join(", ");
        return {
          content: [{ type: "text", text: `Unknown agent "${params.agent}". Available agents: ${available}` }],
          details: {
            agent: params.agent,
            task: params.task,
            exitCode: 1,
            usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
            errorMessage: `Unknown agent "${params.agent}".`,
          } as DelegateDetails,
        };
      }

      // Run the agent
      const result: AgentResult = await runAgent(
        ctx.cwd,
        agent,
        params.task,
        signal,
        onUpdate
          ? (progress) => {
              onUpdate({
                content: [{ type: "text", text: progress.transcript }],
                details: {
                  agent: agent.name,
                  task: params.task,
                  exitCode: 0,
                  usage: progress.usage,
                  actions: progress.actions,
                  activeTools: progress.activeTools,
                  durationMs: progress.durationMs,
                  toolCount: progress.toolCount,
                  toolFailCount: progress.toolFailCount,
                  thinkingPhases: progress.thinkingPhases,
                  thinkingText: progress.thinkingText,
                } as DelegateDetails,
              });
            }
          : undefined,
      );

      const details: DelegateDetails = {
        agent: result.agent,
        task: result.task,
        exitCode: result.exitCode,
        usage: result.usage,
        model: result.model,
        errorMessage: result.errorMessage,
        actions: result.actions,
        durationMs: result.durationMs,
        toolCount: result.toolCount,
        toolFailCount: result.toolFailCount,
        thinkingPhases: result.thinkingPhases,
        thinkingText: result.thinkingText,
      };

      // ── Error ──
      if (result.exitCode !== 0 || result.errorMessage) {
        const errMsg = result.errorMessage || result.stderr || result.output || "Unknown error";
        return {
          content: [{ type: "text", text: `FAILED: ${result.agent} — ${errMsg}` }],
          details,
          isError: true,
        };
      }

      // ── Success — the final assistant message is already in result.output ──
      const outputText = result.output || "(no output)";

      return {
        content: [{ type: "text", text: outputText }],
        details,
      };
    },

    // ── TUI rendering ──
    renderCall(args, theme, _context) {
      const agentName = args.agent || "?";
      const task = args.task || "";

      let text = theme.fg("toolTitle", theme.bold(`DELEGATE TO ${agentName}`));
      text += "\n" + theme.fg("dim", "PROMPT:");
      text += "\n" + theme.fg("toolOutput", task);
      return new Text(text, 0, 0);
    },

    renderResult(result, { isPartial }, theme, context) {
      const details = result.details as DelegateDetails | undefined;
      const output = result.content?.[0];
      const outputText = output?.type === "text" ? output.text : "";
      const isError = context.isError;

      const status = isPartial ? "RUNNING" : (isError ? "FAILED" : "DONE");
      const metricsLine = buildMetricsLine(details, "  ");

      // ── Live status ──
      if (isPartial) {
        let text = "\n" +
          theme.fg("toolTitle", theme.bold(`DELEGATE TO ${details?.agent ?? "?"}`)) +
          " " + theme.fg("dim", `[${status}]`) + "\n\n" +
          theme.fg("toolOutput", outputText || "  ...");

        if (details?.thinkingText) {
          const truncatedThinking = details.thinkingText.length > 500
            ? details.thinkingText.slice(0, 500) + "..."
            : details.thinkingText;
          text += "\n\n" + theme.fg("dim", `thinking: ${truncatedThinking}`);
        }
        text += "\n\n" + theme.fg("dim", metricsLine);
        return new Text(text, 0, 0);
      }

      // ── Final result ──
      let text = "\n" +
        theme.fg("toolTitle", theme.bold(`DELEGATE TO ${details?.agent ?? "?"}`)) +
        " " + theme.fg("dim", `[${status}]`);

      if (outputText) {
        text += "\n\n" + theme.fg("toolOutput", outputText);
      }

      if (details?.thinkingText) {
        const truncatedThinking = details.thinkingText.length > 500
          ? details.thinkingText.slice(0, 500) + "..."
          : details.thinkingText;
        text += "\n\n" + theme.fg("dim", `thinking: ${truncatedThinking}`);
      }
      text += "\n" + theme.fg("dim", metricsLine);
      return new Text(text, 0, 0);
    },
  });
}

function buildMetricsLine(details: DelegateDetails | undefined, prefix: string): string {
  if (!details?.usage) return "";
  const parts: string[] = [];
  parts.push("in: " + formatTokens(details.usage.input));
  parts.push("out: " + formatTokens(details.usage.output));
  parts.push("$" + (details.usage.cost || 0).toFixed(4));
  if (details.model) parts.push(details.model);
  if (details.toolCount) parts.push("tools: " + details.toolCount);
  if (details.toolFailCount) parts.push("fail: " + details.toolFailCount);
  if (details.thinkingPhases) parts.push("thinking: " + details.thinkingPhases);
  if (details.durationMs) parts.push(formatDuration(details.durationMs));
  return prefix + parts.join(" | ");
}
