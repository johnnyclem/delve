import { useEffect, useRef } from "react";
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
    colorPrimary: "#9333ea",
    colorForeground: "#e8e0d2",
    colorMutedForeground: "#8b8078",
    colorDanger: "#ef4444",
    colorBackground: "#16151a",
    colorInput: "#1e1d24",
    colorInputForeground: "#e8e0d2",
    colorNeutral: "#2d2c34",
    fontFamily: "'Inter', system-ui, sans-serif",
    borderRadius: "0.625rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[#1a1920] rounded-2xl w-[440px] max-w-full overflow-hidden border border-[#2d2c34]",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#e8e0d2] font-serif",
    headerSubtitle: "text-[#8b8078]",
    socialButtonsBlockButtonText: "text-[#e8e0d2]",
    formFieldLabel: "text-[#c0b8ad]",
    footerActionLink: "text-[#9333ea] hover:text-[#a855f7]",
    footerActionText: "text-[#8b8078]",
    dividerText: "text-[#6b6560]",
    identityPreviewEditButton: "text-[#9333ea]",
    formFieldSuccessText: "text-emerald-400",
    alertText: "text-[#e8e0d2]",
    logoBox: "mb-4",
    logoImage: "h-10 w-10",
    socialButtonsBlockButton: "border-[#2d2c34] bg-[#16151a] hover:bg-[#222128]",
    formButtonPrimary: "bg-[#9333ea] hover:bg-[#7e22ce] text-white",
    formFieldInput: "bg-[#16151a] border-[#2d2c34] text-[#e8e0d2]",
    footerAction: "justify-center",
    dividerLine: "bg-[#2d2c34]",
    alert: "bg-[#16151a] border-[#2d2c34]",
    otpCodeFieldInput: "bg-[#16151a] border-[#2d2c34] text-[#e8e0d2]",
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
            title: "Return to the Tavern",
            subtitle: "Sign in to continue your adventure",
          },
        },
        signUp: {
          start: {
            title: "Join the Party",
            subtitle: "Create your account to begin",
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
            <Route path="/dashboard">{() => <ProtectedRoute component={DashboardPage} />}</Route>
            <Route component={NotFound} />
          </Switch>
          <Toaster />
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
