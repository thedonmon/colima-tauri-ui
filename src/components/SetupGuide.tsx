import { Terminal, Package, Cpu } from "lucide-react";

function CodeLine({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-2.5 bg-black/30 rounded-lg px-3.5 py-2.5 font-mono text-xs text-[#a0c4ff] border border-border-subtle">
      <span className="text-fg-faint select-none">$</span>
      <span>{children}</span>
    </div>
  );
}

function Step({
  num,
  icon,
  title,
  children,
}: {
  num: number;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2.5">
        <span className="flex items-center justify-center h-6 w-6 rounded-full bg-white/[0.06] text-xs font-bold text-fg-faint flex-shrink-0">
          {num}
        </span>
        <span className="text-fg-muted">{icon}</span>
        <span className="text-sm font-medium text-fg">{title}</span>
      </div>
      <div className="ml-8 space-y-2">{children}</div>
    </div>
  );
}

export function SetupGuide() {
  return (
    <div className="flex flex-col gap-5 px-5 py-5">
      {/* Header */}
      <div className="space-y-1.5">
        <p className="text-base font-semibold text-fg">Get started with Colima</p>
        <p className="text-sm text-fg-muted leading-relaxed">
          Colima wasn't found on your system. Run the commands below in Terminal, then relaunch
          this app.
        </p>
      </div>

      {/* Step 1: Install Colima */}
      <Step num={1} icon={<Package size={13} />} title="Install Colima">
        <CodeLine>brew install colima</CodeLine>
        <CodeLine>brew install docker</CodeLine>
      </Step>

      {/* Step 2: Basic usage */}
      <Step num={2} icon={<Terminal size={13} />} title="Start your first VM">
        <CodeLine>colima start</CodeLine>
        <p className="text-xs text-fg-muted leading-relaxed">
          Or with custom resources:{" "}
          <span className="font-mono text-fg-faint">colima start --cpu 4 --memory 8</span>
        </p>
      </Step>

      {/* Step 3: krunkit for AI */}
      <Step num={3} icon={<Cpu size={13} />} title="Optional: krunkit for AI models">
        <p className="text-xs text-fg-muted leading-relaxed mb-1.5">
          Required for GPU-accelerated AI models (Apple Silicon only):
        </p>
        <CodeLine>brew tap slp/krunkit</CodeLine>
        <CodeLine>brew install krunkit</CodeLine>
        <CodeLine>colima start --runtime docker --vm-type krunkit</CodeLine>
      </Step>

      {/* Divider */}
      <div className="border-t border-border-subtle" />

      {/* Help link hint */}
      <p className="text-xs text-fg-faint text-center">
        More options:{" "}
        <span className="font-mono text-fg-muted">colima start --help</span>
      </p>
    </div>
  );
}
