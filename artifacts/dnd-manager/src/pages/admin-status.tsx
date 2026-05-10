import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { AlertCircle, CheckCircle2, RefreshCw, ShieldAlert, Shield, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useGetMyMembership } from "@workspace/api-client-react";

const ADMIN_TOKEN_STORAGE_KEY = "delve.adminToken";

type SchemaCheckFailure = {
  check: string;
  error: string;
  code?: string;
};

type SchemaHealthResult = {
  ok: boolean;
  checkedAt: string;
  totalChecks: number;
  failures: SchemaCheckFailure[];
};

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "needs-token" }
  | { kind: "invalid-token" }
  | { kind: "not-configured"; message: string }
  | { kind: "error"; message: string }
  | { kind: "ok"; result: SchemaHealthResult };

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function AdminStatusPage() {
  const [, setLocation] = useLocation();
  const { data: membership, isLoading: membershipLoading } = useGetMyMembership();
  const isDm = membership?.role === "dm";

  if (membershipLoading) {
    return (
      <div
        className="flex min-h-[100dvh] items-center justify-center bg-[#09090B] px-4"
        data-testid="page-admin-status-loading"
      >
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isDm) {
    return (
      <div
        className="flex min-h-[100dvh] items-center justify-center bg-[#09090B] px-4"
        data-testid="page-admin-status-forbidden"
      >
        <div className="glass-panel max-w-md rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-8 text-center">
          <Lock className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
          <h1 className="mb-2 text-xl font-semibold text-foreground">
            Admins only
          </h1>
          <p className="mb-6 text-sm text-muted-foreground">
            Schema health is restricted to campaign DMs. If you need access,
            ask a DM to claim the role first.
          </p>
          <Button
            onClick={() => setLocation("/dashboard")}
            data-testid="button-back-to-dashboard"
          >
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return <AdminStatusContent onBack={() => setLocation("/dashboard")} />;
}

function AdminStatusContent({ onBack }: { onBack: () => void }) {
  const [adminToken, setAdminToken] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) ?? "";
  });
  const [tokenInput, setTokenInput] = useState<string>(adminToken);
  const [state, setState] = useState<LoadState>({ kind: "idle" });

  const fetchHealth = useCallback(
    async (token: string, refresh: boolean) => {
      if (!token.trim()) {
        setState({ kind: "needs-token" });
        return;
      }
      setState({ kind: "loading" });
      try {
        const url = `${import.meta.env.BASE_URL}api/admin/schema-health${refresh ? "?refresh=1" : ""}`;
        const res = await fetch(url, {
          headers: { "x-admin-token": token.trim() },
          credentials: "include",
        });
        if (res.status === 503) {
          const data = await res.json().catch(() => ({}));
          setState({
            kind: "not-configured",
            message:
              data.error ??
              "Admin token is not configured on the server. Set ADMIN_RESET_TOKEN in the API environment to enable this page.",
          });
          return;
        }
        if (res.status === 403) {
          setState({ kind: "invalid-token" });
          return;
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setState({
            kind: "error",
            message: data.error ?? `Request failed with status ${res.status}`,
          });
          return;
        }
        const result = (await res.json()) as SchemaHealthResult;
        setState({ kind: "ok", result });
      } catch (err) {
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "Network error",
        });
      }
    },
    [],
  );

  useEffect(() => {
    if (adminToken) {
      void fetchHealth(adminToken, false);
    } else {
      setState({ kind: "needs-token" });
    }
  }, [adminToken, fetchHealth]);

  const handleSaveToken = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = tokenInput.trim();
    if (!trimmed) return;
    window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, trimmed);
    setAdminToken(trimmed);
  };

  const handleClearToken = () => {
    window.localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    setAdminToken("");
    setTokenInput("");
    setState({ kind: "needs-token" });
  };

  const handleRerun = () => {
    if (adminToken) void fetchHealth(adminToken, true);
  };

  const showTokenForm =
    state.kind === "needs-token" || state.kind === "invalid-token";

  return (
    <div
      className="min-h-[100dvh] bg-[#09090B] px-4 py-12"
      data-testid="page-admin-status"
    >
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="h-7 w-7 text-primary" />
            <div>
              <h1 className="text-2xl font-semibold text-foreground">
                Schema Health
              </h1>
              <p className="text-sm text-muted-foreground">
                Verify the deployed database matches the application schema.
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            data-testid="button-back-to-dashboard"
          >
            Back to Dashboard
          </Button>
        </div>

        <div className="glass-panel rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-6">
          {showTokenForm && (
            <form onSubmit={handleSaveToken} className="space-y-4" data-testid="form-admin-token">
              {state.kind === "invalid-token" && (
                <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    The admin token was rejected. Double-check the value and try
                    again.
                  </span>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="admin-token">Admin token</Label>
                <Input
                  id="admin-token"
                  type="password"
                  autoComplete="off"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Paste the ADMIN_RESET_TOKEN value"
                  data-testid="input-admin-token"
                />
                <p className="text-xs text-muted-foreground">
                  Stored locally in your browser so you do not have to paste it
                  again.
                </p>
              </div>
              <Button
                type="submit"
                disabled={!tokenInput.trim()}
                data-testid="button-save-admin-token"
              >
                Check schema health
              </Button>
            </form>
          )}

          {state.kind === "loading" && (
            <div
              className="flex items-center gap-3 text-sm text-muted-foreground"
              data-testid="status-loading"
            >
              <RefreshCw className="h-4 w-4 animate-spin" />
              Running schema health check...
            </div>
          )}

          {state.kind === "not-configured" && (
            <div
              className="flex items-start gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100"
              data-testid="status-not-configured"
            >
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-medium">Admin endpoint is disabled</p>
                <p className="mt-1 text-amber-200/80">{state.message}</p>
              </div>
            </div>
          )}

          {state.kind === "error" && (
            <div className="space-y-3" data-testid="status-error">
              <div className="flex items-start gap-3 rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-medium">Could not load schema health</p>
                  <p className="mt-1 text-red-200/80">{state.message}</p>
                </div>
              </div>
              <Button
                variant="secondary"
                onClick={handleRerun}
                data-testid="button-retry"
              >
                Try again
              </Button>
            </div>
          )}

          {state.kind === "ok" && (
            <div className="space-y-6" data-testid="status-result">
              <div className="flex flex-wrap items-center justify-between gap-4">
                {state.result.ok ? (
                  <span
                    className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-sm font-medium text-emerald-200"
                    data-testid="badge-schema-pass"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Schema healthy
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-sm font-medium text-red-200"
                    data-testid="badge-schema-fail"
                  >
                    <ShieldAlert className="h-4 w-4" />
                    Schema drift detected
                  </span>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleRerun}
                  data-testid="button-rerun-check"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Re-run check
                </Button>
              </div>

              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">Last checked</dt>
                  <dd
                    className="text-foreground"
                    data-testid="text-checked-at"
                  >
                    {formatTimestamp(state.result.checkedAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Total checks</dt>
                  <dd
                    className="text-foreground"
                    data-testid="text-total-checks"
                  >
                    {state.result.totalChecks}
                  </dd>
                </div>
              </dl>

              {state.result.failures.length > 0 && (
                <div data-testid="list-failures">
                  <h2 className="mb-2 text-sm font-medium text-foreground">
                    Failing checks ({state.result.failures.length})
                  </h2>
                  <ul className="space-y-2">
                    {state.result.failures.map((f, idx) => (
                      <li
                        key={`${f.check}-${idx}`}
                        className="rounded-md border border-red-500/20 bg-red-500/5 p-3 text-sm"
                        data-testid={`failure-${idx}`}
                      >
                        <p className="font-mono text-red-200">{f.check}</p>
                        <p className="mt-1 text-red-100/80">{f.error}</p>
                        {f.code && (
                          <p className="mt-1 text-xs text-red-200/60">
                            Code: {f.code}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {adminToken && (
          <div className="mt-4 text-right">
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={handleClearToken}
              data-testid="button-clear-admin-token"
            >
              Clear saved admin token
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
