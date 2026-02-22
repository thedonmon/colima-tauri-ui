import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Plus } from "lucide-react";

import { useColimaStore } from "./store";
import { Header } from "./components/Header";
import { InstanceCard } from "./components/InstanceCard";
import { StartModal } from "./components/StartModal";
import { LogDrawer } from "./components/LogDrawer";
import { ConfigViewer } from "./components/ConfigViewer";
import { ContainerLogsDrawer } from "./components/ContainerLogsDrawer";
import { DockerDesktopSection } from "./components/DockerDesktopSection";
import { ModelSection } from "./components/ModelSection";
import type { LogLine, ContainerLogsTarget } from "./types";

import "./index.css";

export default function App() {
  const {
    instances,
    isLoading,
    isRunningCommand,
    fetchInstances,
    fetchVersion,
    fetchDockerContexts,
    addLog,
  } = useColimaStore();

  const [showStartModal, setShowStartModal] = useState(false);
  const [startProfile, setStartProfile] = useState<string | undefined>();
  const [showLogs, setShowLogs] = useState(false);
  const [configProfile, setConfigProfile] = useState<string | null>(null);
  const [containerLogsTarget, setContainerLogsTarget] = useState<ContainerLogsTarget | null>(null);

  // Refs so focus-hide guard always sees latest modal state without re-subscribing
  const showStartModalRef = useRef(showStartModal);
  const configProfileRef = useRef(configProfile);
  const containerLogsRef = useRef(containerLogsTarget);
  useEffect(() => { showStartModalRef.current = showStartModal; }, [showStartModal]);
  useEffect(() => { configProfileRef.current = configProfile; }, [configProfile]);
  useEffect(() => { containerLogsRef.current = containerLogsTarget; }, [containerLogsTarget]);

  useEffect(() => {
    fetchInstances();
    fetchVersion();
    fetchDockerContexts();

    const unlistenLog = listen<LogLine>("log-line", (e) => addLog(e.payload));

    // Hide window on focus loss, but not while a modal/drawer is open
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

    const interval = setInterval(fetchInstances, 20_000);

    return () => {
      unlistenLog.then((f) => f());
      unlistenFocus.then((f) => f());
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isRunningCommand) {
      setContainerLogsTarget(null); // close container logs if a VM command starts
      setShowLogs(true);
    }
  }, [isRunningCommand]);

  return (
    <div className="relative flex flex-col h-screen bg-[#1c1d20]/85 text-[#c1c2c5] overflow-hidden">
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
      <Header
        onRefresh={fetchInstances}
        onNewInstance={() => {
          setStartProfile(undefined);
          setShowStartModal(true);
        }}
      />

      {/* Instance list */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-0">
        {isLoading && instances.length === 0 ? (
          <p className="text-center text-[11px] text-[#777] pt-8">Loading…</p>
        ) : instances.length === 0 ? (
          <EmptyState
            onNewInstance={() => {
              setStartProfile(undefined);
              setShowStartModal(true);
            }}
          />
        ) : (
          <>
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
              />
            ))}
            <DockerDesktopSection
              onContainerLogsOpen={(target) => {
                setShowLogs(false);
                setContainerLogsTarget(target);
              }}
            />
            <ModelSection />
          </>
        )}
      </div>

      {/* Bottom drawers — mutually exclusive */}
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
    <div className="flex flex-col items-center justify-center h-32 gap-3">
      <p className="text-[11px] text-[#444]">No Colima instances found</p>
      <button
        onClick={onNewInstance}
        className="flex items-center gap-1.5 rounded-lg bg-blue-500/20 px-3 py-1.5 text-[11px] text-blue-300 hover:bg-blue-500/30 transition-all"
      >
        <Plus size={12} />
        Create your first instance
      </button>
    </div>
  );
}
