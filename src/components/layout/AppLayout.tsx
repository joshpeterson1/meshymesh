import { NodeRail } from "./NodeRail";
import { Sidebar } from "./Sidebar";
import { ContentArea } from "./ContentArea";
import { StatusBar } from "./StatusBar";

export function AppLayout() {
  return (
    <div className="h-screen w-screen grid grid-cols-[52px_210px_1fr] grid-rows-[1fr_34px] bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* Rail - spans both rows */}
      <div className="row-span-2 bg-zinc-900 border-r border-zinc-800">
        <NodeRail />
      </div>

      {/* Sidebar - let grid size it, just fill the cell */}
      <div className="overflow-hidden">
        <Sidebar />
      </div>

      {/* Content - fill the cell */}
      <div className="overflow-hidden h-full">
        <ContentArea />
      </div>

      {/* Status bar - spans sidebar + content columns */}
      <div className="col-span-2">
        <StatusBar />
      </div>
    </div>
  );
}
