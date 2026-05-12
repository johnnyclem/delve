import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  BookOpen,
  Compass,
  Database,
  GitCompare,
  LogOut,
  ScrollText,
  Settings,
  Shield,
  Skull,
} from "lucide-react";
import type { Role } from "../nav";

interface MoreScreenProps {
  role: Role;
  onToggleRole: () => void;
}

export function MoreScreen({ role, onToggleRole }: MoreScreenProps) {
  return (
    <div className="space-y-4 px-4 py-4">
      <section>
        <h2 className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          Reference
        </h2>
        <Card className="bg-card/60">
          <CardContent className="p-0">
            <Row icon={BookOpen} label="Rules Lookup" />
            <Row icon={Skull} label="Bestiary" />
            <Row icon={ScrollText} label="House Rules" />
          </CardContent>
        </Card>
      </section>

      {role === "dm" ? (
        <section>
          <h2 className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            DM tools
          </h2>
          <Card className="bg-card/60">
            <CardContent className="p-0">
              <Row icon={GitCompare} label="Compare Editions (2014 vs 2024)" hint="Was buried in profile" />
              <Row icon={Database} label="Seed starter SRD content" hint="Was buried in World scroll" />
              <Row icon={Shield} label="Admin status" />
            </CardContent>
          </Card>
        </section>
      ) : null}

      <section>
        <h2 className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          Account
        </h2>
        <Card className="bg-card/60">
          <CardContent className="p-0">
            <Row icon={Settings} label="Settings" hint="Timezone, recap emails, invite code" />
            <ToggleRow
              icon={Compass}
              label="DM mode"
              checked={role === "dm"}
              onChange={onToggleRole}
            />
            <Row icon={LogOut} label="Sign out" />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 border-b border-border px-3 py-3 text-left last:border-b-0 hover:bg-muted/40"
    >
      <Icon className="h-4 w-4 text-primary" />
      <span className="flex-1">
        <span className="block text-sm">{label}</span>
        {hint ? <span className="block text-[10px] text-muted-foreground">{hint}</span> : null}
      </span>
    </button>
  );
}

function ToggleRow({
  icon: Icon,
  label,
  checked,
  onChange,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex w-full items-center gap-3 border-b border-border px-3 py-3 last:border-b-0">
      <Icon className="h-4 w-4 text-primary" />
      <span className="flex-1 text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
