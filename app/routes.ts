import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("dashboard", "routes/home.tsx", { id: "routes/dashboard" }),
  route("healthz", "routes/healthz.ts"),
  route("api/auth/*", "routes/api.auth.ts"),
  route("register", "routes/register.tsx"),
  route("login", "routes/login.tsx"),
  route("forgot-password", "routes/forgot-password.tsx"),
  route("reset-password/:token", "routes/reset-password.$token.tsx"),
  route("legal/terms", "routes/legal.terms.tsx"),
  route("legal/privacy", "routes/legal.privacy.tsx"),
  route("onboarding", "routes/onboarding.tsx"),
  route("academic-terms", "routes/academic-terms._index.tsx"),
  route("academic-terms/:termId", "routes/academic-terms.$termId.tsx"),
] satisfies RouteConfig;
