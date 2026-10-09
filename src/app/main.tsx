import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("PFx Colors root element missing");

async function start() {
  // The isolated staging artifact defaults to Rust. The normal build and
  // published main branch remain legacy; explicit query overrides either.
  const staged = (window as Window & { __PFX_RUST_STAGING__?: boolean })
    .__PFX_RUST_STAGING__ === true;
  const requested = new URLSearchParams(window.location.search).get("engine");
  const useRust = requested === "rust" || (staged && requested !== "legacy");
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
  root!.textContent = "Rust experiment unavailable. Use ?engine=legacy to open the standard engine.";
});
