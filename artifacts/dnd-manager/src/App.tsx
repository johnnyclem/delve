import { useEffect, useRef } from "react";
import { ScanlineOverlay } from "@/components/ui/scanline-overlay";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useUser } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { dark } from "@clerk/themes";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import DashboardPage from "@/pages/dashboard";
import MapsPage from "@/pages/maps";
import MapEditorPage from "@/pages/map-editor";
import HouseRulesSharePage from "@/pages/house-rules-share";
import AdminStatusPage from "@/pages/admin-status";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in .env file");
}

const clerkAppearance = {
  baseTheme: dark,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(45, 84%, 63%)",
    colorForeground: "hsl(255, 100%, 94%)",
    colorMutedForeground: "hsl(249, 32%, 70%)",
    colorDanger: "hsl(348, 70%, 56%)",
    colorBackground: "hsl(240, 43%, 6%)",
    colorInput: "hsl(247, 35%, 18%)",
    colorInputForeground: "hsl(255, 100%, 94%)",
    colorNeutral: "hsl(250, 27%, 27%)",
    fontFamily: "'Inter', system-ui, sans-serif",
    borderRadius: "2px",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "glass-panel w-[440px] max-w-full overflow-hidden",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-foreground font-display",
    headerSubtitle: "text-muted-foreground",
    socialButtonsBlockButtonText: "text-foreground",
    formFieldLabel: "text-foreground/80",
    footerActionLink: "text-primary hover:text-[hsl(45,84%,75%)]",
    footerActionText: "text-muted-foreground",
    dividerText: "text-muted-foreground",
    identityPreviewEditButton: "text-primary",
    formFieldSuccessText: "text-emerald-400",
    alertText: "text-foreground",
    logoBox: "mb-4",
    logoImage: "h-10 w-10 pixelated",
    socialButtonsBlockButton: "border-border bg-input hover:bg-muted",
    formButtonPrimary: "bg-primary text-primary-foreground hover:bg-[hsl(45,84%,55%)]",
    formFieldInput: "bg-input border-border text-foreground",
    footerAction: "justify-center",
    dividerLine: "bg-border",
    alert: "bg-input border-border",
    otpCodeFieldInput: "bg-input border-border text-foreground",
    formFieldRow: "mb-1",
    main: "gap-4",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4" data-testid="page-sign-in">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4" data-testid="page-sign-up">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <>
      <Show when="signed-in">
        <Component />
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      signInFallbackRedirectUrl={`${basePath}/dashboard`}
      signUpFallbackRedirectUrl={`${basePath}/dashboard`}
      localization={{
        signIn: {
          start: {
            title: "Welcome to Delve",
            subtitle: "Sign in to continue your campaign",
          },
        },
        signUp: {
          start: {
            title: "Join Delve",
            subtitle: "Create your account to get started",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Switch>
            <Route path="/" component={HomeRedirect} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route path="/share/house-rules/:token" component={HouseRulesSharePage} />
            <Route path="/dashboard">{() => <ProtectedRoute component={DashboardPage} />}</Route>
            <Route path="/maps">{() => <ProtectedRoute component={MapsPage} />}</Route>
            <Route path="/maps/:id">{() => <ProtectedRoute component={MapEditorPage} />}</Route>
            <Route path="/admin/status">{() => <ProtectedRoute component={AdminStatusPage} />}</Route>
            <Route component={NotFound} />
          </Switch>
          <Toaster />
          <ScanlineOverlay />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
