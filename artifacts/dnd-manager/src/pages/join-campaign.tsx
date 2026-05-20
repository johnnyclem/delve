import { useState } from "react";
import { LogOut } from "lucide-react";
import { useClerk } from "@clerk/react";
import { Button } from "@workspace/ui";
import { Input } from "@workspace/ui";
import { useToast } from "@workspace/ui";

export default function JoinCampaignPage() {
  const [inviteCode, setInviteCode] = useState("");
  const [adminToken, setAdminToken] = useState("");
  const [joining, setJoining] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [claimError, setClaimError] = useState("");
  const { toast } = useToast();
  const { signOut } = useClerk();

  const handleJoin = async () => {
    if (!inviteCode.trim()) return;
    setJoining(true);
    setJoinError("");

    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/members/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ inviteCode: inviteCode.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed to join" }));
        setJoinError(data.error ?? "Failed to join");
        return;
      }

      toast({ title: "Welcome to the campaign!" });
      window.location.reload();
    } catch {
      setJoinError("Network error");
    } finally {
      setJoining(false);
    }
  };

  const handleClaimDm = async () => {
    if (!adminToken.trim()) return;
    setClaiming(true);
    setClaimError("");

    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/admin/claim-dm`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": adminToken.trim() },
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed to claim DM" }));
        setClaimError(data.error ?? "Failed to claim DM");
        return;
      }

      toast({ title: "You are now a DM!" });
      window.location.reload();
    } catch {
      setClaimError("Network error");
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="dark min-h-[100dvh] bg-background flex items-center justify-center px-4 py-8" data-testid="page-join">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="Delve" className="h-16 w-16 mx-auto mb-4 pixelated" />
          <h1 className="text-3xl font-semibold text-foreground">Join the Campaign</h1>
          <p className="text-muted-foreground mt-2">Enter the invite code from your DM, or use an admin token to start as DM.</p>
        </div>

        <div className="rounded-2xl glass-panel p-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Invite Code</label>
            <Input
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              placeholder="e.g. A1B2C3D4"
              className="font-mono text-center text-lg tracking-widest"
              maxLength={8}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              data-testid="input-invite-code"
            />
          </div>
          {joinError && (
            <p className="text-sm text-destructive" data-testid="text-join-error">{joinError}</p>
          )}
          <Button className="w-full" onClick={handleJoin} disabled={joining || !inviteCode.trim()} data-testid="button-join">
            {joining ? "Joining..." : "Join Campaign"}
          </Button>
        </div>

        <div className="rounded-2xl glass-panel p-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Admin Token (DM)</label>
            <p className="text-xs text-muted-foreground mb-2">Have an admin token? Become a DM of the campaign.</p>
            <Input
              type="password"
              value={adminToken}
              onChange={(e) => setAdminToken(e.target.value)}
              placeholder="Paste admin token"
              className="font-mono"
              onKeyDown={(e) => e.key === "Enter" && handleClaimDm()}
              data-testid="input-admin-token"
            />
          </div>
          {claimError && (
            <p className="text-sm text-destructive" data-testid="text-claim-error">{claimError}</p>
          )}
          <Button variant="secondary" className="w-full" onClick={handleClaimDm} disabled={claiming || !adminToken.trim()} data-testid="button-claim-dm">
            {claiming ? "Claiming..." : "Become DM"}
          </Button>
        </div>

        <div className="text-center">
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => signOut()}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}
