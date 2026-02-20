import { html, nothing } from "lit";
import type {
  GitActivityResult,
  GitProjectEntry,
  ProjectEntry,
  ProjectRegistry,
  ProjectUsageEntry,
  ProjectUsageResult,
} from "../controllers/projects.ts";

export type ProjectsProps = {
  loading: boolean;
  scanning: boolean;
  registry: ProjectRegistry | null;
  usage: ProjectUsageResult | null;
  git: GitActivityResult | null;
  error: string | null;
  days: number;
  onRefresh: () => void;
  onScan: () => void;
  onDaysChange: (days: number) => void;
  onToggle: (project: string, enabled: boolean) => void;
};

function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return String(tokens);
}

function formatHours(hours: number): string {
  if (hours < 1) {
    return `${Math.round(hours * 60)}m`;
  }
  return `${hours.toFixed(1)}h`;
}

function renderProjectCard(
  name: string,
  proj: ProjectEntry,
  usage: ProjectUsageEntry | undefined,
  git: GitProjectEntry | undefined,
  onToggle: (project: string, enabled: boolean) => void,
) {
  const cost = usage ? formatCost(usage.estimatedCostUSD) : "$0";
  const sessions = usage?.sessions ?? 0;
  const tokens = usage ? formatTokens(usage.totalTokens) : "0";
  const activeTime = usage ? formatHours(usage.activeTimeHours) : "0m";
  const commits = git?.commits ?? 0;
  const gitHours = git ? formatHours(git.estimatedHours) : "0m";
  const langBadge = proj.language !== "unknown" ? proj.language : null;

  return html`
    <div class="card" style="margin-bottom: 12px; opacity: ${proj.enabled ? 1 : 0.5}">
      <div class="row" style="justify-content: space-between; align-items: flex-start;">
        <div style="flex: 1;">
          <div class="row" style="gap: 8px; align-items: center;">
            <div class="card-title" style="margin: 0;">${name}</div>
            ${langBadge ? html`<span class="pill">${langBadge}</span>` : nothing}
            ${proj.tags.map((tag) => html`<span class="pill muted">${tag}</span>`)}
          </div>
          ${proj.description ? html`<div class="card-sub">${proj.description}</div>` : nothing}
          <div class="card-sub mono" style="font-size: 11px;">${proj.path}</div>
        </div>
        <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
          <input
            type="checkbox"
            .checked=${proj.enabled}
            @change=${(e: Event) => onToggle(name, (e.target as HTMLInputElement).checked)}
          />
          <span class="muted" style="font-size: 12px;">Tracked</span>
        </label>
      </div>

      <div class="grid grid-cols-4" style="margin-top: 12px; gap: 12px;">
        <div>
          <div class="muted" style="font-size: 11px;">Cost</div>
          <div style="font-size: 18px; font-weight: 600;">${cost}</div>
        </div>
        <div>
          <div class="muted" style="font-size: 11px;">Sessions</div>
          <div style="font-size: 18px; font-weight: 600;">${sessions}</div>
        </div>
        <div>
          <div class="muted" style="font-size: 11px;">Tokens</div>
          <div style="font-size: 18px; font-weight: 600;">${tokens}</div>
        </div>
        <div>
          <div class="muted" style="font-size: 11px;">Agent Time</div>
          <div style="font-size: 18px; font-weight: 600;">${activeTime}</div>
        </div>
      </div>

      ${
        commits > 0
          ? html`
            <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border);">
              <div class="row" style="gap: 16px;">
                <span class="muted" style="font-size: 12px;">
                  <strong>${commits}</strong> commits · ~${gitHours} coding
                </span>
                ${
                  proj.lastCommit
                    ? html`<span class="muted" style="font-size: 12px;">
                        Last: ${proj.lastCommit}
                      </span>`
                    : nothing
                }
              </div>
              ${
                git?.recentCommits?.length
                  ? html`
                    <div style="margin-top: 6px;">
                      ${git.recentCommits.slice(0, 2).map(
                        (c) => html`
                          <div class="mono muted" style="font-size: 11px; margin-top: 2px;">
                            ${c.date} ${c.subject.slice(0, 60)}
                          </div>
                        `,
                      )}
                    </div>
                  `
                  : nothing
              }
            </div>
          `
          : nothing
      }

      ${
        usage?.models && Object.keys(usage.models).length > 0
          ? html`
            <div style="margin-top: 8px;">
              ${Object.entries(usage.models).map(
                ([model, data]) => html`
                  <span class="pill" style="font-size: 11px; margin-right: 4px;">
                    ${model}: ${formatCost(data.costUSD)}
                  </span>
                `,
              )}
            </div>
          `
          : nothing
      }
    </div>
  `;
}

export function renderProjects(props: ProjectsProps) {
  const projects = props.registry?.projects ?? {};
  const projectNames = Object.keys(projects).toSorted((a, b) => {
    // Sort by cost (highest first), then alphabetically
    const costA = props.usage?.projects?.[a]?.estimatedCostUSD ?? 0;
    const costB = props.usage?.projects?.[b]?.estimatedCostUSD ?? 0;
    if (costB !== costA) {
      return costB - costA;
    }
    return a.localeCompare(b);
  });

  const totals = props.usage?.totals;
  const gitTotals = props.git?.totals;
  const gitByName = new Map((props.git?.projects ?? []).map((p) => [p.name, p]));

  // Also show unmatched/hook entries from usage
  const usageOnlyKeys = Object.keys(props.usage?.projects ?? {}).filter(
    (k) => k.startsWith("_") && !projects[k],
  );

  return html`
    <div class="row" style="justify-content: space-between; align-items: center; margin-bottom: 16px;">
      <div class="row" style="gap: 8px;">
        <select
          @change=${(e: Event) => props.onDaysChange(Number((e.target as HTMLSelectElement).value))}
        >
          <option value="7" ?selected=${props.days === 7}>7 days</option>
          <option value="14" ?selected=${props.days === 14}>14 days</option>
          <option value="30" ?selected=${props.days === 30}>30 days</option>
          <option value="90" ?selected=${props.days === 90}>90 days</option>
        </select>
      </div>
      <div class="row" style="gap: 8px;">
        <button
          class="btn"
          ?disabled=${props.scanning}
          @click=${props.onScan}
        >
          ${props.scanning ? "Scanning..." : "Rescan"}
        </button>
        <button
          class="btn"
          ?disabled=${props.loading}
          @click=${props.onRefresh}
        >
          ${props.loading ? "Loading..." : "Refresh"}
        </button>
      </div>
    </div>

    ${
      props.error
        ? html`<div class="callout danger" style="margin-bottom: 16px;">${props.error}</div>`
        : nothing
    }

    ${
      totals
        ? html`
          <section class="card" style="margin-bottom: 16px;">
            <div class="grid grid-cols-4" style="gap: 12px;">
              <div>
                <div class="muted" style="font-size: 11px;">Total Cost</div>
                <div style="font-size: 24px; font-weight: 600;">
                  ${formatCost(totals.estimatedCostUSD)}
                </div>
              </div>
              <div>
                <div class="muted" style="font-size: 11px;">Sessions</div>
                <div style="font-size: 24px; font-weight: 600;">${totals.sessions}</div>
              </div>
              <div>
                <div class="muted" style="font-size: 11px;">Tokens</div>
                <div style="font-size: 24px; font-weight: 600;">
                  ${formatTokens(totals.totalTokens)}
                </div>
              </div>
              <div>
                <div class="muted" style="font-size: 11px;">Git Commits</div>
                <div style="font-size: 24px; font-weight: 600;">
                  ${gitTotals?.commits ?? 0}
                </div>
              </div>
            </div>
            <div class="card-sub" style="margin-top: 8px;">
              ${projectNames.length} projects tracked
              ${props.registry?.scannedAt ? ` · Last scan: ${new Date(props.registry.scannedAt).toLocaleDateString()}` : ""}
            </div>
          </section>
        `
        : nothing
    }

    ${
      props.loading && !props.registry
        ? html`
            <div class="muted" style="text-align: center; padding: 32px">Loading projects...</div>
          `
        : nothing
    }

    ${projectNames.map((name) =>
      renderProjectCard(
        name,
        projects[name],
        props.usage?.projects?.[name],
        gitByName.get(name),
        props.onToggle,
      ),
    )}

    ${
      usageOnlyKeys.length > 0
        ? html`
          <div class="card-title" style="margin-top: 24px; margin-bottom: 12px;">Other Activity</div>
          ${usageOnlyKeys.map((key) => {
            const usage = props.usage!.projects[key];
            const label = key.replace(/^_hook:/, "Hook: ").replace(/^_/, "");
            return html`
              <div class="card" style="margin-bottom: 8px;">
                <div class="row" style="justify-content: space-between;">
                  <div>
                    <div class="card-title" style="margin: 0;">${label}</div>
                  </div>
                  <div class="row" style="gap: 16px;">
                    <span>${usage.sessions} sessions</span>
                    <span>${formatCost(usage.estimatedCostUSD)}</span>
                    <span>${formatTokens(usage.totalTokens)} tokens</span>
                  </div>
                </div>
              </div>
            `;
          })}
        `
        : nothing
    }
  `;
}
