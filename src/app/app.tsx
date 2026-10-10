import { useCallback, useEffect, useRef, useState } from "react";
import type { ColorInput } from "@pfx/color-core";
import { PfxColorsWorkspace, type WorkspaceState } from "@pfx/color-core";
import type { WorkspaceFactory } from "../rust/loader";
import { WorkspaceShell, TOOLS, type ToolId } from "./workspace-shell";
import { useTheme } from "./use-theme";
import { useColorLibrary, type SavedGradient } from "./use-color-library";
import { useStoredState } from "./workspace-state";
import { readGradientDraft, saveGradientDraft, clearGradientDraft } from "./gradient-session";
import { Home } from "./home";
import { Explore } from "./explore";
import { Collections } from "./collections";
import { Picker } from "./picker";
import { Harmony } from "./harmony";
import { Gradient } from "./gradient";
import { ImagePalette } from "./image-palette";
import { Contrast } from "./contrast";

const validTool = (value: unknown): value is ToolId =>
  typeof value === "string" && TOOLS.some(tool => tool.id === value);

function useWorkspace(workspaceFactory?: WorkspaceFactory) {
  const ref = useRef<PfxColorsWorkspace | null>(null);
  if (!ref.current) {
    let initial = "#ff0014";
    try { initial = localStorage.getItem("pfx-colors.current") ?? initial; }
    catch { /* Private browsing */ }
    ref.current = workspaceFactory ? workspaceFactory(initial) : new PfxColorsWorkspace(initial);
    const saved = readGradientDraft(typeof window === "undefined" ? null : window.localStorage);
    if (saved) {
      try {
        ref.current.createGradient(saved.stops, {
          type: saved.type, angle: saved.angle,
          centerX: saved.centerX, centerY: saved.centerY,
          interpolationSpace: saved.interpolationSpace,
          hue: "shorter",
        });
      } catch { /* Ignore stale engine-incompatible drafts. */ }
    }
  }
  const workspace = ref.current;
  const [state, setState] = useState<WorkspaceState>(() => workspace.getState());
  const sync = useCallback((next?: WorkspaceState) => setState(next ?? workspace.getState()), [workspace]);
  return { workspace, state, sync };
}

export function App({ workspaceFactory, engine = "legacy" }: {
  workspaceFactory?: WorkspaceFactory;
  engine?: "legacy" | "rust";
} = {}) {
  const { workspace, state, sync } = useWorkspace(workspaceFactory);
  const [activeTool, setActiveTool] = useStoredState<ToolId>(
    "pfx-colors.active-tool.v2", "home", validTool);
  const [gradientRequest, setGradientRequest] = useState(0);
  useEffect(() => {
    // Migrate users who last visited the now-merged Tones page.
    try {
      if (localStorage.getItem("pfx-colors.active-tool.v2") === "tones") setActiveTool("picker");
    } catch { /* Storage may be unavailable */ }
  }, [setActiveTool]);
  const { theme, preference, setPreference } = useTheme();
  const library = useColorLibrary();

  useEffect(() => {
    if (state.gradient) saveGradientDraft(state.gradient);
    else clearGradientDraft();
  }, [state.gradient]);

  const commitColor = useCallback((input: ColorInput) => {
    const next = workspace.setColor(input);
    try { localStorage.setItem("pfx-colors.current", next.color.hex); }
    catch { /* Storage unavailable */ }
    library.addRecent(next.color.hex);
    sync(next);
  }, [sync, workspace, library.addRecent]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "SELECT" ||
        target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (!typing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        sync(event.shiftKey ? workspace.redo() : workspace.undo());
        return;
      }
      if (!typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const match = TOOLS.find(item => item.key === event.key);
        if (match) setActiveTool(match.id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sync, workspace, setActiveTool]);

  const clearGradientRequest = useCallback(() => setGradientRequest(0), []);
  const openGradientFromTool = () => {
    setGradientRequest(value => value + 1);
    setActiveTool("gradient");
  };
  const openGradientFromImage = (colors: readonly string[]) => {
    if (colors.length < 2) return;
    const stops = colors.map((hex, index) => ({
      color: hex, position: index / (colors.length - 1),
    }));
    sync(workspace.createGradient(stops, {
      type: "linear", angle: 90, centerX: 0.5, centerY: 0.5,
      interpolationSpace: "oklch", hue: "shorter",
    }));
    setGradientRequest(value => value + 1);
    setActiveTool("gradient");
  };
  const openSavedGradient = (saved: SavedGradient) => {
    const draft = saved.gradient;
    sync(workspace.createGradient(draft.stops, {
      type: draft.type, angle: draft.angle,
      centerX: draft.centerX, centerY: draft.centerY,
      interpolationSpace: draft.interpolationSpace, hue: "shorter",
    }));
    setGradientRequest(value => value + 1);
    setActiveTool("gradient");
  };
  const openTones = (hex: string) => {
    commitColor(hex);
    setActiveTool("picker");
  };

  return (
    <WorkspaceShell
      engine={engine}
      activeTool={activeTool}
      navigate={setActiveTool}
      theme={theme}
      preference={preference}
      setPreference={setPreference}
      currentHex={state.color.hex}
      setColor={commitColor}
      gamut={state.color.gamut}
      canUndo={workspace.canUndo()}
      canRedo={workspace.canRedo()}
      undo={() => {
        const next = workspace.undo();
        try { localStorage.setItem("pfx-colors.current", next.color.hex); }
        catch { /* Storage unavailable */ }
        sync(next);
      }}
      redo={() => {
        const next = workspace.redo();
        try { localStorage.setItem("pfx-colors.current", next.color.hex); }
        catch { /* Storage unavailable */ }
        sync(next);
      }}
    >
      {activeTool === "home" && (
        <Home state={state} commitColor={commitColor} />
      )}
      {activeTool === "explore" && (
        <Explore activeHex={state.color.hex} select={commitColor} />
      )}
      {activeTool === "picker" && (
        <Picker state={state} workspace={workspace} sync={sync}
          commitColor={commitColor} openGradient={openGradientFromTool}
          favorite={library.favorites.includes(state.color.hex.toLowerCase())}
          toggleFavorite={library.toggleFavorite} />
      )}
      {activeTool === "harmony" && (
        <Harmony state={state} workspace={workspace} sync={sync}
          commitColor={commitColor} openGradient={openGradientFromTool}
          saveSet={library.saveSet} favorites={library.favorites}
          toggleFavorite={library.toggleFavorite} />
      )}
      {activeTool === "gradient" && (
        <Gradient state={state} workspace={workspace} sync={sync}
          commitColor={commitColor} saveSet={library.saveSet}
          saveGradient={library.saveGradient}
          requestVersion={gradientRequest} onRequestApplied={clearGradientRequest} />
      )}
      {activeTool === "image" && (
        <ImagePalette select={commitColor} saveSet={library.saveSet}
          openGradient={openGradientFromImage} />
      )}
      {activeTool === "contrast" && (
        <Contrast currentHex={state.color.hex} />
      )}
      {activeTool === "collections" && (
        <Collections currentHex={state.color.hex} favorites={library.favorites}
          recent={library.recent} sets={library.sets} removeSet={library.removeSet}
          gradients={library.gradients} removeGradient={library.removeGradient}
          openGradient={openSavedGradient} restoreBackup={library.restoreBackup}
          select={commitColor} openTones={openTones}
          toggleFavorite={library.toggleFavorite} clearRecent={library.clearRecent} />
      )}
    </WorkspaceShell>
  );
}

