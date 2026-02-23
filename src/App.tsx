import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Plus } from "lucide-react";

import { useColimaStore } from "./store";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import type { AppTab } from "./components/Sidebar";
import { InstanceCard } from "./components/InstanceCard";
import { StartModal } from "./components/StartModal";
import { LogDrawer } from "./components/LogDrawer";
import { ConfigViewer } from "./components/ConfigViewer";
import { ContainerLogsDrawer } from "./components/ContainerLogsDrawer";
import { DockerDesktopSection } from "./components/DockerDesktopSection";
import { ModelSection } from "./components/ModelSection";
import { SetupGuide } from "./components/SetupGuide";
import type { ColimaInstance, DockerEvent, LogLine, ContainerLogsTarget } from "./types";

import "./index.css";

export default function App() {
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
  } = useColimaStore();

  const [showStartModal, setShowStartModal] = useState(false);
  const [startProfile, setStartProfile] = useState<string | undefined>();
  const [showLogs, setShowLogs] = useState(false);
  const [configProfile, setConfigProfile] = useState<string | null>(null);
  const [containerLogsTarget, setContainerLogsTarget] = useState<ContainerLogsTarget | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>("instances");

  const showStartModalRef = useRef(showStartModal);
  const configProfileRef = useRef(configProfile);
  const containerLogsRef = useRef(containerLogsTarget);
  useEffect(() => { showStartModalRef.current = showStartModal; }, [showStartModal]);
  useEffect(() => { configProfileRef.current = configProfile; }, [configProfile]);
  useEffect(() => { containerLogsRef.current = containerLogsTarget; }, [containerLogsTarget]);

  // Track which profiles currently have an active docker-events watcher
  const watchingProfiles = useRef(new Set<string>());

  const syncWatchers = useCallback(async (currentInstances: ColimaInstance[]) => {
    const runningNow = new Set(
      currentInstances
        .filter((i) => i.status.toLowerCase() === "running")
        .map((i) => i.profile)
    );
    // Stop watchers for instances that are no longer running
    for (const profile of [...watchingProfiles.current]) {
      if (!runningNow.has(profile)) {
        invoke("stop_docker_watcher", { profile }).catch(() => {});
        watchingProfiles.current.delete(profile);
      }
    }
    // Start watchers for newly running instances
    for (const profile of runningNow) {
      if (!watchingProfiles.current.has(profile)) {
        invoke("start_docker_watcher", { profile }).catch(() => {});
        watchingProfiles.current.add(profile);
      }
    }
  }, []);

  useEffect(() => {
    // Initial load
    fetchInstances().then(() => syncWatchers(useColimaStore.getState().instances));
    fetchVersion();
    fetchDockerContexts();

    // Start the Colima status poller (replaces 20-second JS setInterval)
    invoke("start_colima_poller").catch(() => {});

    // Colima VM list changed → update store + sync watchers
    const unlistenColima = listen<ColimaInstance[]>("colima-status-changed", (e) => {
      setInstances(e.payload);
      syncWatchers(e.payload);
    });

    // Docker daemon event → bump the per-profile tick so open sections auto-refresh
    const unlistenDocker = listen<DockerEvent>("docker-event", (e) => {
      bumpDockerTick(e.payload.profile);
    });

    const unlistenLog = listen<LogLine>("log-line", (e) => addLog(e.payload));

    const appWindow = getCurrentWebviewWindow();
    const unlistenFocus = appWindow.onFocusChanged(({ payload: focused }) => {
      if (
        !focused &&
        !showStartModalRef.current &&
        configProfileRef.current === null &&
        containerLogsRef.current === null
      ) {
        appWindow.hide();
      }
    });

    return () => {
      unlistenColima.then((f) => f());
      unlistenDocker.then((f) => f());
      unlistenLog.then((f) => f());
      unlistenFocus.then((f) => f());
      // Clean up all active watchers
      for (const profile of watchingProfiles.current) {
        invoke("stop_docker_watcher", { profile }).catch(() => {});
      }
      invoke("stop_docker_watcher", { profile: "__poller__" }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Show setup guide when colima is definitely not installed
  const showSetupGuide = colimaInstalled === false;

  return (
    <div className="relative flex flex-col h-screen bg-[#18191e]/88 text-[#c1c2c5] overflow-hidden">
      {/* Full-screen overlays */}
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

      {/* Header */}
      <Header onRefresh={fetchInstances} onNewInstance={openNewInstance} />

      {/* Body */}
      <div className="flex flex-row flex-1 min-h-0">
        {/* Only show sidebar when colima is installed */}
        {!showSetupGuide && (
          <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {showSetupGuide ? (
            /* Colima not installed — show setup guide */
            <SetupGuide />
          ) : (
            <div className="px-3 py-3 space-y-2.5">
              {/* Instances tab */}
              {activeTab === "instances" && (
                <>
                  {isLoading && instances.length === 0 ? (
                    <p className="text-center text-[11px] text-[#555] pt-8">Loading…</p>
                  ) : instances.length === 0 ? (
                    <EmptyState onNewInstance={openNewInstance} />
                  ) : (
                    instances.map((instance) => (
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
                      />
                    ))
                  )}
                </>
              )}

              {/* Docker tab */}
              {activeTab === "docker" && (
                <>
                  {hasDesktopContext ? (
                    <DockerDesktopSection
                      defaultOpen
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

              {/* AI tab */}
              {activeTab === "ai" && (
                <ModelSection defaultOpen onViewLogs={() => setShowLogs(true)} />
              )}
            </div>
          )}
        </div>
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
    <div className="flex flex-col items-center justify-center h-36 gap-3">
      <p className="text-[11px] text-[#3a3b40]">No Colima instances found</p>
      <button
        onClick={onNewInstance}
        className="flex items-center gap-1.5 rounded-xl bg-blue-500/15 px-3.5 py-2 text-[11px] text-blue-400 hover:bg-blue-500/25 transition-all"
      >
        <Plus size={12} />
        Create your first instance
      </button>
    </div>
  );
}

function DockerEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-36 gap-2">
      <p className="text-[11px] text-[#3a3b40]">No Docker Desktop context found</p>
      <p className="text-[10px] text-[#2e2f35]">
        Start Docker Desktop to see containers here
      </p>
    </div>
  );
}
