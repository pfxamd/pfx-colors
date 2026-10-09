import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("PFx Colors root element missing");

async function start() {
  // Test branch only. Unflagged UI and the production main branch stay legacy.
  const useRust = new URLSearchParams(window.location.search).get("engine") === "rust";
  if (useRust) {
    const { loadExperimentalWorkspace } = await import("../rust-experiment/loader");
    const workspaceFactory = await loadExperimentalWorkspace();
    createRoot(root!).render(
      <StrictMode><App engine="rust" workspaceFactory={workspaceFactory} /></StrictMode>,
    );
  } else {
    createRoot(root!).render(<StrictMode><App /></StrictMode>);
  }
}

void start().catch(error => {
  // Never silently mislabel the legacy engine as Rust if WASM initialization fails.
  console.error("PFx Rust experiment failed to initialize", error);
  root!.textContent = "Rust experiment unavailable. Remove ?engine=rust to use the standard engine.";
});
