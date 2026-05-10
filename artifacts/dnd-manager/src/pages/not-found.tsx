import { useLocation } from "wouter";
import { AlertCircle } from "@/components/ui/pixel-icons";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4" data-testid="page-not-found">
      <div className="text-center">
        <AlertCircle className="h-12 w-12 text-primary mx-auto mb-4" />
        <h1 className="text-3xl font-semibold text-foreground mb-2">Lost in the Void</h1>
        <p className="text-muted-foreground mb-6">This path leads nowhere. The page you seek doesn't exist.</p>
        <Button onClick={() => setLocation("/")} data-testid="button-go-home">
          Return to Delve
        </Button>
      </div>
    </div>
  );
}
