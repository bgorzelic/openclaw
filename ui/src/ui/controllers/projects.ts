import type { GatewayBrowserClient } from "../gateway.ts";

export type ProjectEntry = {
  path: string;
  enabled: boolean;
  tags: string[];
  language: string;
  discovered: string;
  description: string;
  lastCommit: string | null;
};

export type ProjectRegistry = {
  version: number;
  scannedAt: string;
  scanRoots: string[];
  projects: Record<string, ProjectEntry>;
};

export type ProjectUsageEntry = {
  sessions: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUSD: number;
  activeTimeHours: number;
  models: Record<
    string,
    {
      tokens: number;
      costUSD: number;
      sessions: number;
    }
  >;
};

export type ProjectUsageResult = {
  generatedAt: string;
  days: number | null;
  projectFilter: string | null;
  totalProjects: number;
  projects: Record<string, ProjectUsageEntry>;
  totals: {
    sessions: number;
    totalTokens: number;
    estimatedCostUSD: number;
  };
};

export type GitProjectEntry = {
  name: string;
  path: string;
  commits: number;
  activeDays: number;
  estimatedHours: number;
  recentCommits: Array<{ date: string; subject: string }>;
  dailyBreakdown: Record<string, number>;
};

export type GitActivityResult = {
  generatedAt: string;
  days: number | null;
  totals: {
    commits: number;
    estimatedHours: number;
    activeProjects: number;
  };
  projects: GitProjectEntry[];
};

export type ProjectsState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  projectsLoading: boolean;
  projectsRegistry: ProjectRegistry | null;
  projectsUsage: ProjectUsageResult | null;
  projectsGit: GitActivityResult | null;
  projectsError: string | null;
  projectsDays: number;
  projectsScanning: boolean;
};

export async function loadProjects(state: ProjectsState) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.projectsLoading) {
    return;
  }
  state.projectsLoading = true;
  state.projectsError = null;
  try {
    const [registryRes, usageRes, gitRes] = await Promise.all([
      state.client.request("projects.list", {}),
      state.client.request("projects.usage", { days: state.projectsDays }),
      state.client.request("projects.git", { days: state.projectsDays }),
    ]);
    if (registryRes) {
      state.projectsRegistry = registryRes as ProjectRegistry;
    }
    if (usageRes) {
      state.projectsUsage = usageRes as ProjectUsageResult;
    }
    if (gitRes) {
      state.projectsGit = gitRes as GitActivityResult;
    }
  } catch (err) {
    state.projectsError = String(err);
  } finally {
    state.projectsLoading = false;
  }
}

export async function scanProjects(state: ProjectsState) {
  if (!state.client || !state.connected) {
    return;
  }
  state.projectsScanning = true;
  try {
    const res = await state.client.request("projects.scan", {});
    if (res) {
      state.projectsRegistry = res as ProjectRegistry;
    }
    // Reload usage after scan
    await loadProjects(state);
  } catch (err) {
    state.projectsError = String(err);
  } finally {
    state.projectsScanning = false;
  }
}

export async function toggleProject(state: ProjectsState, projectName: string, enabled: boolean) {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    await state.client.request("projects.toggle", {
      project: projectName,
      enabled,
    });
    // Update local state
    if (state.projectsRegistry?.projects?.[projectName]) {
      state.projectsRegistry.projects[projectName].enabled = enabled;
    }
  } catch (err) {
    state.projectsError = String(err);
  }
}
