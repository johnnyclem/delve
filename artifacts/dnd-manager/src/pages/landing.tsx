import { useLocation } from "wouter";
import { Sword, BookOpen, Dice5, Calendar, Users, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const features = [
  { icon: Users, title: "Party Management", desc: "Track your party, characters, and roles in one place." },
  { icon: BookOpen, title: "Character Sheets", desc: "Full 5e sheets with stats, spells, inventory, and more." },
  { icon: Dice5, title: "Dice Roller", desc: "Roll any dice combo with a shared log the whole party can see." },
  { icon: Calendar, title: "Session Scheduling", desc: "Propose dates, RSVP, and keep everyone on the same page." },
  { icon: Sparkles, title: "AI Session Recaps", desc: "Turn your DM notes into vivid narrative recaps with AI." },
  { icon: Sword, title: "Campaign Memory", desc: "A living record of every session, every decision, every crit." },
];

export default function LandingPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-[100dvh] bg-background" data-testid="page-landing">
      <header className="border-b border-border/40 backdrop-blur-sm sticky top-0 z-50 bg-background/80">
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="Logo" className="h-8 w-8" />
            <span className="font-serif text-lg font-semibold text-foreground">Campaign Manager</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => setLocation("/sign-in")} data-testid="button-sign-in">
              Sign In
            </Button>
            <Button onClick={() => setLocation("/sign-up")} data-testid="button-sign-up">
              Join Campaign
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="py-20 md:py-32">
          <div className="container mx-auto px-4 text-center">
            <div className="inline-block mb-4 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium">
              D&D 5e Campaign Tool
            </div>
            <h1 className="font-serif text-4xl md:text-6xl font-bold text-foreground mb-4 leading-tight">
              Every Session<br />Remembered
            </h1>
            <p className="text-muted-foreground text-lg md:text-xl max-w-2xl mx-auto mb-8">
              Character sheets, dice rolls, session recaps, and scheduling — everything your party needs, in one place.
            </p>
            <div className="flex gap-3 justify-center">
              <Button size="lg" onClick={() => setLocation("/sign-up")} data-testid="button-get-started">
                Get Started
              </Button>
              <Button size="lg" variant="outline" onClick={() => setLocation("/sign-in")} data-testid="button-sign-in-hero">
                Sign In
              </Button>
            </div>
          </div>
        </section>

        <section className="py-16 border-t border-border/30">
          <div className="container mx-auto px-4">
            <h2 className="font-serif text-2xl md:text-3xl font-semibold text-center text-foreground mb-12">
              Tools for Your Table
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {features.map((f) => (
                <div key={f.title} className="group rounded-xl border border-border/50 bg-card p-6 transition-colors hover:border-primary/30 hover:bg-card/80">
                  <f.icon className="h-8 w-8 text-primary mb-3" />
                  <h3 className="font-semibold text-foreground mb-1">{f.title}</h3>
                  <p className="text-sm text-muted-foreground">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/30 py-6">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          Built for adventurers, by adventurers.
        </div>
      </footer>
    </div>
  );
}
