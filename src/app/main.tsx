import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("PFx Colors root element missing");
const root = createRoot(rootElement);

function useLegacy() {
  root.render(<StrictMode><App engine="legacy" /></StrictMode>);
}

async function start() {
  // Rust is the default engine. ?engine=legacy is the explicit, preserved
  // rollback path and loads no Rust WebAssembly.
  const requested = new URLSearchParams(window.location.search).get("engine");
  if (requested === "legacy") {
    useLegacy();
    return;
  }
  try {
    const { loadExperimentalWorkspace } = await import("../rust-experiment/loader");
    const workspaceFactory = await loadExperimentalWorkspace();
    root.render(
      <StrictMode><App engine="rust" workspaceFactory={workspaceFactory} /></StrictMode>,
    );
  } catch (error) {
    // Avoid a blank production tool when WebAssembly fetch/compilation fails.
    // Never pretend the fallback is still Rust.
    console.error("PFx Colors Rust startup failed; using the original engine", error);
    const reason = error instanceof Error ? error.message : String(error);
    document.documentElement.dataset.pfxEngineFallback = "legacy";
    document.documentElement.dataset.pfxEngineError = reason.slice(0, 160);
    useLegacy();
  }
}

void start();
