import { toast } from "sonner";
import { Toaster } from "../ui/sonner";

function Toast() {
  return (
    <div className="contents" data-slot="toast-viewport">
      <Toaster closeButton position="bottom-right" visibleToasts={4} />
    </div>
  );
}

export { Toast, toast };
