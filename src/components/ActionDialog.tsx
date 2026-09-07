import { useEffect, useRef } from "react";
import { AlertTriangle, Info, X } from "lucide-react";
import "./ActionDialog.css";

export interface ActionDialogRequest {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: "danger" | "info";
  onConfirm: () => void | Promise<void>;
}

export function ActionDialog({
  request,
  onClose,
}: {
  request: ActionDialogRequest;
  onClose: () => void;
}) {
  const safeAction = useRef<HTMLButtonElement>(null);
  const tone = request.tone ?? "danger";

  useEffect(() => {
    safeAction.current?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onClose]);

  const completeAction = async () => {
    await request.onConfirm();
    onClose();
  };

  return (
    <div
      className="action-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={`action-dialog action-dialog-${tone}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="action-dialog-title"
        aria-describedby="action-dialog-message"
      >
        <header>
          <span className="action-dialog-icon">
            {tone === "danger" ? <AlertTriangle /> : <Info />}
          </span>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </header>
        <div className="action-dialog-copy">
          <h2 id="action-dialog-title">{request.title}</h2>
          <p id="action-dialog-message">{request.message}</p>
        </div>
        <footer>
          {tone === "danger" && (
            <button ref={safeAction} className="quiet" onClick={onClose}>
              Keep it
            </button>
          )}
          <button
            ref={tone === "info" ? safeAction : undefined}
            className={tone === "danger" ? "danger" : "primary"}
            onClick={() => void completeAction()}
          >
            {request.confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}
