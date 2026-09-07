import { useEffect, useState } from "react";
import { Check, History, RotateCcw, UploadCloud, X } from "lucide-react";
import type { Site } from "../types";
import { authenticatedFetch } from "../data/storage";
import "./PublishDialog.css";

interface Publication {
  id: number;
  register_version: number;
  release_note: string;
  published_at: string;
  published_by: string;
}

export function PublishDialog({
  site,
  version,
  canRestore,
  onClose,
  onRestored,
}: {
  site: Site;
  version: number;
  canRestore: boolean;
  onClose: () => void;
  onRestored: () => void;
}) {
  const [items, setItems] = useState<Publication[]>([]),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [published, setPublished] = useState(false);
  const load = async () => {
    const response = await authenticatedFetch(
      `/api/publications?siteId=${encodeURIComponent(site.id)}`,
    );
    const data = (await response.json()) as {
      publications?: Publication[];
      error?: string;
    };
    if (!response.ok)
      throw new Error(data.error || "Could not load publication history.");
    setItems(data.publications || []);
  };
  useEffect(() => {
    load().catch((cause) =>
      setError(
        cause instanceof Error ? cause.message : "Could not load history.",
      ),
    );
  }, [site.id]);
  const publish = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await authenticatedFetch("/api/publications", {
        method: "POST",
        body: JSON.stringify({
          siteId: site.id,
          version,
          releaseNote: note.trim(),
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(
          data.error === "conflict"
            ? "A newer draft exists. Close this window and try again."
            : data.error || "Could not publish.",
        );
      setPublished(true);
      setNote("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not publish.");
    } finally {
      setBusy(false);
    }
  };
  const restore = async (item: Publication) => {
    if (
      !window.confirm(
        `Restore “${site.name}” to the version published on ${new Date(item.published_at).toLocaleString("en-AU")}? This creates a new draft and does not erase history.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const response = await authenticatedFetch(
        `/api/publications/${item.id}/restore`,
        { method: "POST", body: "{}" },
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(data.error || "Could not restore this publication.");
      onRestored();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not restore.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="publish-dialog">
        <header>
          <div>
            <span className="eyebrow">Release checkpoint</span>
            <h2>Publish {site.name}</h2>
            <p>
              Draft changes already autosave. Publishing marks this version as
              an approved update.
            </p>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="publish-form">
          <label>
            <span>
              What changed? <small>Optional</small>
            </span>
            <textarea
              rows={3}
              maxLength={500}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Document the reason for this network update…"
            />
          </label>
          <button
            className="primary"
            disabled={busy}
            onClick={() => void publish()}
          >
            <UploadCloud size={16} />
            {busy ? "Working…" : "Publish current draft"}
          </button>
          {published && (
            <span className="publish-success">
              <Check size={15} /> Version {version} published
            </span>
          )}
          {error && <div className="account-error">{error}</div>}
        </div>
        <div className="publication-history">
          <h3>
            <History size={16} /> Publication history
          </h3>
          {items.length ? (
            items.map((item) => (
              <article key={item.id}>
                <div>
                  <b>Version {item.register_version}</b>
                  <span>
                    {new Date(item.published_at).toLocaleString("en-AU")} ·{" "}
                    {item.published_by}
                  </span>
                  <p>{item.release_note || "No release note."}</p>
                </div>
                {canRestore && (
                  <button
                    className="quiet"
                    disabled={busy}
                    onClick={() => void restore(item)}
                  >
                    <RotateCcw size={14} /> Restore
                  </button>
                )}
              </article>
            ))
          ) : (
            <p className="empty-history">No published versions yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
