import { defineRailway, github, project, service } from "railway/iac";

// Railway infrastructure as code for the dedicated staging project.
// Generated with `railway config init` and adjusted to match the existing
// staging service by name (so plan shows in-place changes, never a
// create-and-destroy). The healthcheck points at the non-sensitive liveness
// endpoint. No secrets are declared here; environment configuration lives in
// the Railway dashboard.
export default defineRailway(() => {
  const web = service("get-me-this", {
    // checkSuites preserves the service's Wait-for-CI setting so the plan
    // never resets it; the type is ServiceSource.checkSuites (boolean).
    source: github("arjunw7/get-me-this", { checkSuites: true }),
    build: "pnpm run build",
    start: "next start",
    healthcheck: "/health",
  });

  return project("get-me-this", {
    resources: [web],
  });
});
