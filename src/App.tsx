import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "./lib/tauri";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Plus } from "lucide-react";

import { useShallow } from "zustand/react/shallow";

import { useColimaStore } from "./store";
import { useSettingsStore } from "./store/settings";
import { Header } from "./components/Header";
import { TabBar } from "./components/TabBar";
import type { AppTab } from "./components/TabBar";
import { InstanceCard } from "./components/InstanceCard";
import { StartModal } from "./components/StartModal";
import { LogDrawer } from "./components/LogDrawer";
import { ConfigViewer } from "./components/ConfigViewer";
import { ContainerLogsDrawer } from "./components/ContainerLogsDrawer";
import { DockerDesktopSection } from "./components/DockerDesktopSection";
import { ModelSection } from "./components/ModelSection";
import { SetupGuide } from "./components/SetupGuide";
import { StaleProcessBanner } from "./components/StaleProcessBanner";
import { Settings } from "./components/Settings";
import { ContainerInspect } from "./components/ContainerInspect";
import type { ColimaInstance, DockerEvent, LogLine, ContainerLogsTarget } from "./types";

import "./index.css";

export default function App() {
  // Selected field-by-field rather than taking the whole store. Subscribing to
  // everything meant any `set()` re-rendered this component and the entire tree
  // beneath it — including `bumpDockerTick`, which fires on every Docker event
  // (health-check exec events alone are ~1/s). Nothing here reads
  // `dockerRefreshTick`, so App no longer re-renders on a tick at all.
  const {
    instances,
    isLoading,
    isRunningCommand,
    colimaInstalled,
    fetchInstances,
    setInstances,
    fetchVersion,
    fetchDockerContexts,
    addLog,
    bumpDockerTick,
    dockerContexts,
  } = useColimaStore(
    useShallow((s) => ({
      instances: s.instances,
      isLoading: s.isLoading,
      isRunningCommand: s.isRunningCommand,
      colimaInstalled: s.colimaInstalled,
      fetchInstances: s.fetchInstances,
      setInstances: s.setInstances,
      fetchVersion: s.fetchVersion,
      fetchDockerContexts: s.fetchDockerContexts,
      addLog: s.addLog,
      bumpDockerTick: s.bumpDockerTick,
      dockerContexts: s.dockerContexts,
    }))
  );

  const { hideOnFocusLoss, load: loadSettings } = useSettingsStore();

  const [showStartModal, setShowStartModal] = useState(false);
  const [startProfile, setStartProfile] = useState<string | undefined>();
  const [showLogs, setShowLogs] = useState(false);
  const [configProfile, setConfigProfile] = useState<string | null>(null);
  const [containerLogsTarget, setContainerLogsTarget] = useState<ContainerLogsTarget | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>("instances");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [inspectTarget, setInspectTarget] = useState<{
    profile: string;
    containerId: string;
    containerName: string;
  } | null>(null);

  // Track which profiles currently have an active docker-events watcher
  const watchingProfiles = useRef(new Set<string>());

  const syncWatchers = useCallback(async (currentInstances: ColimaInstance[]) => {
    const runningNow = new Set(
      currentInstances
        .filter((i) => i.status.toLowerCase() === "running")
        .map((i) => i.profile)
    );
    for (const profile of [...watchingProfiles.current]) {
      if (!runningNow.has(profile)) {
        invoke("stop_docker_watcher", { profile }).catch(() => {});
        watchingProfiles.current.delete(profile);
      }
    }
    for (const profile of runningNow) {
      if (!watchingProfiles.current.has(profile)) {
        invoke("start_docker_watcher", { profile }).catch(() => {});
        watchingProfiles.current.add(profile);
      }
    }
  }, []);

  useEffect(() => {
    // Load settings
    loadSettings();

    // Initial load
    fetchInstances().then(() => syncWatchers(useColimaStore.getState().instances));
    fetchVersion();
    fetchDockerContexts();

    invoke("start_colima_poller").catch(() => {});

    const unlistenColima = listen<ColimaInstance[]>("colima-status-changed", (e) => {
      setInstances(e.payload);
      syncWatchers(e.payload);
    });

    const unlistenDocker = listen<DockerEvent>("docker-event", (e) => {
      bumpDockerTick(e.payload.profile);
    });

    const unlistenLog = listen<LogLine>("log-line", (e) => addLog(e.payload));

    return () => {
      unlistenColima.then((f) => f());
      unlistenDocker.then((f) => f());
      unlistenLog.then((f) => f());
      for (const profile of watchingProfiles.current) {
        invoke("stop_docker_watcher", { profile }).catch(() => {});
      }
      invoke("stop_docker_watcher", { profile: "__poller__" }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Global ⌘K toggles the toolbar search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!searchOpen) setSearch("");
  }, [searchOpen]);

  // Auto-hide on focus loss (when setting is enabled)
  useEffect(() => {
    if (!hideOnFocusLoss) return;

    const appWindow = getCurrentWebviewWindow();
    const unlisten = appWindow.onFocusChanged(({ payload: focused }) => {
      if (!focused) {
        appWindow.hide();
      }
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, [hideOnFocusLoss]);

  useEffect(() => {
    if (isRunningCommand) {
      setContainerLogsTarget(null);
      setShowLogs(true);
    }
  }, [isRunningCommand]);

  const hasDesktopContext = dockerContexts.some(
    (c) => c.name === "desktop-linux" || c.name.startsWith("desktop-")
  );

  const openNewInstance = () => {
    setStartProfile(undefined);
    setActiveTab("instances");
    setShowStartModal(true);
  };

  const showSetupGuide = colimaInstalled === false;
  const searchTerm = searchOpen ? search : "";

  return (
    <div className="relative flex flex-col h-screen bg-app-bg/90 text-fg overflow-hidden">
      {/* Full-screen overlays */}
      {inspectTarget && (
        <ContainerInspect
          profile={inspectTarget.profile}
          containerId={inspectTarget.containerId}
          containerName={inspectTarget.containerName}
          onClose={() => setInspectTarget(null)}
        />
      )}
      {configProfile && (
        <ConfigViewer profile={configProfile} onClose={() => setConfigProfile(null)} />
      )}
      {showStartModal && (
        <StartModal
          initialProfile={startProfile}
          onClose={() => setShowStartModal(false)}
          onStarted={() => setShowLogs(true)}
        />
      )}

      {/* Content zone: scrolling content under the floating toolbar bands */}
      <div className="relative flex-1 min-h-0">
        <div className="absolute inset-0 overflow-y-auto">
          {showSetupGuide ? (
            <div className="pt-[52px]">
              <SetupGuide />
            </div>
          ) : (
            <div className="px-3 pt-[58px] pb-[70px] space-y-2">
              {activeTab === "instances" && (
                <>
                  {/* Shown before any start is attempted — leftovers from a host
                      crash are what make `colima start` hang, and the instance
                      looks plainly "Stopped" until you try. */}
                  <StaleProcessBanner
                    profile={instances[0]?.profile ?? "default"}
                    onViewLogs={() => setShowLogs(true)}
                  />
                  {isLoading && instances.length === 0 ? (
                    <p className="text-center text-sm text-fg-faint pt-8">Loading...</p>
                  ) : instances.length === 0 ? (
                    <EmptyState onNewInstance={openNewInstance} />
                  ) : (
                    /* Adaptive grid: one column at popover width, more as the
                       window is resized wider. */
                    <div className="grid gap-2 items-start [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
                      {instances.map((instance) => (
                        <InstanceCard
                          key={instance.profile}
                          instance={instance}
                          onStart={(p) => {
                            setStartProfile(p);
                            setShowStartModal(true);
                          }}
                          onViewConfig={(p) => setConfigProfile(p)}
                          onViewLogs={() => setShowLogs(true)}
                          onContainerLogsOpen={(target) => {
                            setShowLogs(false);
                            setContainerLogsTarget(target);
                          }}
                          onInspectContainer={(profile, containerId, containerName) => {
                            setInspectTarget({ profile, containerId, containerName });
                          }}
                          filter={searchTerm}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}

              {activeTab === "docker" && (
                <>
                  {hasDesktopContext ? (
                    <DockerDesktopSection
                      defaultOpen
                      filter={searchTerm}
                      onContainerLogsOpen={(target) => {
                        setShowLogs(false);
                        setContainerLogsTarget(target);
                      }}
                    />
                  ) : (
                    <DockerEmptyState />
                  )}
                </>
              )}

              {activeTab === "ai" && (
                <ModelSection defaultOpen onViewLogs={() => setShowLogs(true)} />
              )}

              {activeTab === "settings" && <Settings />}
            </div>
          )}
        </div>

        {/* Floating toolbar bands */}
        <Header
          onRefresh={fetchInstances}
          onNewInstance={openNewInstance}
          searchOpen={searchOpen}
          onSearchOpenChange={setSearchOpen}
          search={search}
          onSearchChange={setSearch}
        />
        {!showSetupGuide && (
          <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
        )}
      </div>

      {/* Bottom drawers */}
      {containerLogsTarget ? (
        <ContainerLogsDrawer
          target={containerLogsTarget}
          onClose={() => setContainerLogsTarget(null)}
        />
      ) : showLogs ? (
        <LogDrawer onClose={() => setShowLogs(false)} />
      ) : null}
    </div>
  );
}

function EmptyState({ onNewInstance }: { onNewInstance: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-44 gap-4">
      <p className="text-sm text-fg-faint">No Colima instances found</p>
      <button
        onClick={onNewInstance}
        className="flex items-center gap-2 rounded-full bg-blue-500/15 px-4 py-2.5 text-sm font-medium text-blue-400 hover:bg-blue-500/25 transition-all"
      >
        <Plus size={14} />
        Create your first instance
      </button>
    </div>
  );
}

function DockerEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-44 gap-2">
      <p className="text-sm text-fg-faint">No Docker Desktop context found</p>
      <p className="text-xs text-fg-faint">
        Start Docker Desktop to see containers here
      </p>
    </div>
  );
}
