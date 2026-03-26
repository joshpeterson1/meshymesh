import { Toaster } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { useMeshtasticEvents } from "@/hooks/useMeshtasticEvents";

function App() {
  useMeshtasticEvents();
  return (
    <>
      <AppLayout />
      <Toaster
        position="bottom-right"
        theme="dark"
        toastOptions={{
          style: {
            background: "#18181b",
            border: "1px solid #27272a",
            color: "#e4e4e7",
            fontSize: "12px",
          },
        }}
      />
    </>
  );
}

export default App;
