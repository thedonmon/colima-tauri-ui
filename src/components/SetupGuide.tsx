import { Terminal, Package, Cpu } from "lucide-react";

function CodeLine({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-2 bg-black/30 rounded-lg px-3 py-2 font-mono text-[10.5px] text-[#a0c4ff] border border-white/[0.06]">
      <span className="text-[#555] select-none">$</span>
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
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="flex items-center justify-center h-5 w-5 rounded-full bg-white/[0.06] text-[9.5px] font-bold text-[#555] flex-shrink-0">
          {num}
        </span>
        <span className="text-[#888]">{icon}</span>
        <span className="text-[11px] font-medium text-[#c0c1c4]">{title}</span>
      </div>
      <div className="ml-7 space-y-1.5">{children}</div>
    </div>
  );
}

export function SetupGuide() {
  return (
    <div className="flex flex-col gap-5 px-4 py-4">
      {/* Header */}
      <div className="space-y-1">
        <p className="text-[13px] font-semibold text-[#d0d1d4]">Get started with Colima</p>
        <p className="text-[10.5px] text-[#555] leading-relaxed">
          Colima wasn't found on your system. Run the commands below in Terminal, then relaunch
          this app.
        </p>
      </div>

      {/* Step 1: Install Colima */}
      <Step num={1} icon={<Package size={11} />} title="Install Colima">
        <CodeLine>brew install colima</CodeLine>
        <CodeLine>brew install docker</CodeLine>
      </Step>

      {/* Step 2: Basic usage */}
      <Step num={2} icon={<Terminal size={11} />} title="Start your first VM">
        <CodeLine>colima start</CodeLine>
        <p className="text-[9.5px] text-[#444] leading-relaxed">
          Or with custom resources:{" "}
          <span className="font-mono text-[#555]">colima start --cpu 4 --memory 8</span>
        </p>
      </Step>

      {/* Step 3: krunkit for AI */}
      <Step num={3} icon={<Cpu size={11} />} title="Optional: krunkit for AI models">
        <p className="text-[9.5px] text-[#444] leading-relaxed mb-1">
          Required for GPU-accelerated AI models (Apple Silicon only):
        </p>
        <CodeLine>brew tap slp/krunkit</CodeLine>
        <CodeLine>brew install krunkit</CodeLine>
        <CodeLine>colima start --runtime docker --vm-type krunkit</CodeLine>
      </Step>

      {/* Divider */}
      <div className="border-t border-white/[0.05]" />

      {/* Help link hint */}
      <p className="text-[9.5px] text-[#3a3b40] text-center">
        More options:{" "}
        <span className="font-mono text-[#484950]">colima start --help</span>
      </p>
    </div>
  );
}
