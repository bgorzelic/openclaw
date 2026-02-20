import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

const execFileAsync = promisify(execFile);

// Resolve the dev-cockpit scripts directory.
// Bundled skills live alongside the codebase; adjust if the skill moves.
function resolveScriptsDir(): string {
  // Walk up from src/gateway/server-methods/ to repo root, then into skills/
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(thisDir, "../../..");
  return path.join(root, "skills", "dev-cockpit", "scripts");
}

const COCKPIT_DIR = path.join(process.env.HOME ?? "/tmp", ".openclaw", "cockpit");
const REGISTRY_PATH = path.join(COCKPIT_DIR, "projects.json");

async function runPythonScript(scriptName: string, args: string[]): Promise<unknown> {
  const scriptsDir = resolveScriptsDir();
  const scriptPath = path.join(scriptsDir, scriptName);

  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Script not found: ${scriptPath}`);
  }

  const { stdout } = await execFileAsync("python3", [scriptPath, ...args], {
    timeout: 30_000,
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
  });

  return JSON.parse(stdout);
}

export const projectsHandlers: GatewayRequestHandlers = {
  /**
   * List all projects from the registry.
   */
  "projects.list": async ({ respond }) => {
    try {
      if (!fs.existsSync(REGISTRY_PATH)) {
        respond(true, { projects: {}, message: "No registry found. Run projects.scan first." });
        return;
      }
      const raw = fs.readFileSync(REGISTRY_PATH, "utf-8");
      const registry = JSON.parse(raw);
      respond(true, registry);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * Get aggregated usage for all or a specific project.
   * Params: { days?: number, project?: string }
   */
  "projects.usage": async ({ respond, params }) => {
    try {
      const args = ["--format", "json"];
      if (typeof params?.days === "number") {
        args.push("--days", String(params.days));
      }
      if (typeof params?.project === "string") {
        args.push("--project", params.project);
      }
      const result = await runPythonScript("project_usage.py", args);
      respond(true, result);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * Trigger a re-scan of ~/dev for new projects.
   * Params: { roots?: string[] }
   */
  "projects.scan": async ({ respond, params }) => {
    try {
      const args = ["--output", REGISTRY_PATH];
      const roots = Array.isArray(params?.roots)
        ? (params.roots as string[])
        : [path.join(process.env.HOME ?? "/tmp", "dev")];
      for (const root of roots) {
        args.push("--root", root);
      }
      const result = await runPythonScript("project_scan.py", args);
      // Re-read the registry to return it
      if (fs.existsSync(REGISTRY_PATH)) {
        const raw = fs.readFileSync(REGISTRY_PATH, "utf-8");
        respond(true, JSON.parse(raw));
      } else {
        respond(true, result);
      }
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * Toggle a project enabled/disabled.
   * Params: { project: string, enabled: boolean }
   */
  "projects.toggle": async ({ respond, params }) => {
    const projectName = typeof params?.project === "string" ? params.project : null;
    const enabled = typeof params?.enabled === "boolean" ? params.enabled : null;

    if (!projectName || enabled === null) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "project (string) and enabled (boolean) required"),
      );
      return;
    }

    try {
      if (!fs.existsSync(REGISTRY_PATH)) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "No registry found"));
        return;
      }

      const raw = fs.readFileSync(REGISTRY_PATH, "utf-8");
      const registry = JSON.parse(raw);

      if (!registry.projects?.[projectName]) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Project not found: ${projectName}`),
        );
        return;
      }

      registry.projects[projectName].enabled = enabled;
      fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + "\n");
      respond(true, { project: projectName, enabled });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * Get git activity for projects.
   * Params: { days?: number, project?: string }
   */
  "projects.git": async ({ respond, params }) => {
    try {
      const args = ["--format", "json"];
      if (typeof params?.days === "number") {
        args.push("--days", String(params.days));
      }
      if (typeof params?.project === "string") {
        args.push("--project", params.project);
      }
      const result = await runPythonScript("git_activity.py", args);
      respond(true, result);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
};
