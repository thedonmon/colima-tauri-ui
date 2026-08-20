import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { useSettingsStore } from "../store/settings";
import type { DefaultVmPreset } from "../store/settings";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { Toggle } from "./ui/Toggle";
import { Segmented } from "./ui/Segmented";
import { Button } from "./ui/Button";
import { Slider } from "./ui/Slider";
import { relaunch } from "@tauri-apps/plugin-process";

export function Settings() {
  const { hideOnFocusLoss, notifications, skipPruneConfirm, defaultVmPreset, update } =
    useSettingsStore();

  const updatePreset = (partial: Partial<DefaultVmPreset>) => {
    update({ defaultVmPreset: { ...defaultVmPreset, ...partial } });
  };

  const [appVersion, setAppVersion] = useState<string>("");
  const [updateAvailable, setUpdateAvailable] = useState<Update | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    getVersion().then(setAppVersion);
  }, []);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<string | null>(null);

  const handleCheckUpdate = async () => {
    setChecking(true);
    setChecked(false);
    setUpdateError(null);
    setUpdateAvailable(null);
    try {
      const update = await check();
      setUpdateAvailable(update);
      setChecked(true);
    } catch (e) {
      const msg = String(e);
      if (msg.includes("Could not fetch") || msg.includes("valid release JSON")) {
        setUpdateError("Could not reach update server. A new release may still be building — try again in a few minutes.");
      } else if (msg.includes("network") || msg.includes("fetch")) {
        setUpdateError("Network error — check your internet connection and try again.");
      } else {
        setUpdateError(msg);
      }
    } finally {
      setChecking(false);
    }
  };

  const handleInstallUpdate = async () => {
    if (!updateAvailable) return;
    setInstalling(true);
    setUpdateError(null);
    try {
      await updateAvailable.downloadAndInstall((progress) => {
        if (progress.event === "Started") {
          const len = progress.data.contentLength;
          setDownloadProgress(len ? `Downloading (${Math.round(len / 1024)} KB)...` : "Downloading...");
        } else if (progress.event === "Finished") {
          setDownloadProgress("Installing...");
        }
      });
      await relaunch();
    } catch (e) {
      setUpdateError(String(e));
      setInstalling(false);
      setDownloadProgress(null);
    }
  };

  return (
    <div className="px-4 py-4 space-y-4">
      <div>
        <p className="text-base font-semibold text-fg mb-1">Settings</p>
        <p className="text-xs text-fg-muted">
          Colima Manager{appVersion ? ` v${appVersion}` : ""}
        </p>
      </div>

      {/* Behavior */}
      <Section title="Behavior">
        <ToggleRow
          label="Hide window on focus loss"
          description="Auto-hide when you click outside (menu-bar popover style)"
          value={hideOnFocusLoss}
          onChange={(v) => update({ hideOnFocusLoss: v })}
        />
        <ToggleRow
          label="Desktop notifications"
          description="Notify when instances start, stop, or encounter errors"
          value={notifications}
          onChange={(v) => update({ notifications: v })}
        />
        <ToggleRow
          label="Skip prune confirmation"
          description="Don't show the confirmation dialog when pruning cached assets"
          value={skipPruneConfirm}
          onChange={(v) => update({ skipPruneConfirm: v })}
        />
      </Section>

      {/* Updates */}
      <Section title="Updates">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-fg">Check for updates</p>
              <p className="text-xs text-fg-muted leading-relaxed">
                {updateAvailable
                  ? `v${updateAvailable.version} is available`
                  : "Check if a newer version is available"}
              </p>
            </div>
            {!updateAvailable && (
              <Button tone="primary" onClick={handleCheckUpdate} disabled={checking}>
                {checking ? "Checking..." : "Check now"}
              </Button>
            )}
          </div>

          {updateError && (
            <p className="text-xs text-red-400/80">{updateError}</p>
          )}

          {checked && !updateAvailable && (
            <p className="text-xs text-emerald-400/80">You're on the latest version.</p>
          )}

          {updateAvailable && (
            <div className="rounded-ctl bg-blue-500/10 border border-blue-500/20 p-3 space-y-2">
              <p className="text-sm text-blue-400 font-medium">
                v{updateAvailable.version} is available!
              </p>
              {updateAvailable.body && (
                <p className="text-xs text-fg-muted leading-relaxed line-clamp-4 whitespace-pre-line">
                  {updateAvailable.body}
                </p>
              )}
              {downloadProgress && (
                <p className="text-xs text-fg-muted">{downloadProgress}</p>
              )}
              <Button tone="start" onClick={handleInstallUpdate} disabled={installing}>
                {installing ? (downloadProgress ?? "Installing...") : "Download & Install"}
              </Button>
            </div>
          )}
        </div>
      </Section>

      {/* Default VM Preset */}
      <Section title="Default VM Preset">
        <p className="text-xs text-fg-faint mb-3">
          Pre-fill these values when creating a new instance
        </p>

        <div className="space-y-3">
          <Slider
            label="CPU"
            value={defaultVmPreset.cpu}
            min={1}
            max={16}
            unit="cores"
            onChange={(v) => updatePreset({ cpu: v })}
          />
          <Slider
            label="Memory"
            value={defaultVmPreset.memory}
            min={2}
            max={64}
            unit="GiB"
            onChange={(v) => updatePreset({ memory: v })}
          />
          <Slider
            label="Disk"
            value={defaultVmPreset.disk}
            min={20}
            max={200}
            step={10}
            unit="GiB"
            onChange={(v) => updatePreset({ disk: v })}
          />

          <div className="flex items-center justify-between pt-1">
            <span className="text-sm text-fg-muted">VM Type</span>
            <Segmented
              size="sm"
              options={[
                { label: "VZ", value: "vz" },
                { label: "QEMU", value: "qemu" },
              ]}
              value={defaultVmPreset.vmType}
              onChange={(v) => updatePreset({ vmType: v })}
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-fg-muted">Runtime</span>
            <Segmented
              size="sm"
              options={[
                { label: "Docker", value: "docker" },
                { label: "containerd", value: "containerd" },
              ]}
              value={defaultVmPreset.runtime}
              onChange={(v) => updatePreset({ runtime: v })}
            />
          </div>

          {defaultVmPreset.vmType === "vz" && (
            <ToggleRow
              label="Rosetta"
              description="Enable x86 emulation (VZ only)"
              value={defaultVmPreset.rosetta}
              onChange={(v) => updatePreset({ rosetta: v })}
            />
          )}
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-border bg-surface overflow-hidden">
      <div className="px-4 py-3">
        <p className="text-sm font-medium text-fg-secondary mb-3">{title}</p>
        <div className="space-y-1">{children}</div>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="text-sm text-fg">{label}</p>
        <p className="text-xs text-fg-muted leading-relaxed">{description}</p>
      </div>
      <Toggle value={value} onChange={onChange} />
    </div>
  );
}
