/**
 * ArtifactBundleStrip — compact artifact bundle for a completed run.
 *
 * Design spec (HM, 2026-08-23): sits at the BOTTOM-LEFT corner below the
 * output, sized ~1:2 relative to the text-output block (i.e. visually
 * subordinate), and acts as ONE clickable bundle: clicking downloads ALL
 * artifacts of the run.
 *
 * Implementation note: Supabase Storage has no server-side zip endpoint on
 * the JS client, so "download all" fetches each artifact via its signed URL
 * and saves them individually (browser may ask permission for multiple
 * downloads). The count is shown up front so the user knows what will land.
 */
import { useCallback, useEffect, useState } from "react";
import { FolderDown, Loader2, Package } from "lucide-react";
import { toast } from "sonner";
import {
  getRunArtifacts,
  signedArtifactUrl,
  type RunArtifact,
} from "@/lib/runs";

export function ArtifactBundleStrip({ runId }: { runId: string }) {
  const [artifacts, setArtifacts] = useState<RunArtifact[] | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getRunArtifacts(runId)
      .then((a) => { if (!cancelled) setArtifacts(a); })
      .catch(() => { if (!cancelled) setArtifacts([]); });
    return () => { cancelled = true; };
  }, [runId]);

  const downloadAll = useCallback(async () => {
    if (!artifacts?.length || downloading) return;
    setDownloading(true);
    try {
      // Sequential with a small gap — browsers throttle parallel programmatic
      // downloads and silently drop some when fired simultaneously.
      for (const a of artifacts) {
        const url = await signedArtifactUrl(a.storage_path, 120);
        if (!url) continue;
        const name = a.storage_path.split("/").pop() || `artifact-${a.id}`;
        const res = await fetch(url);
        if (!res.ok) continue;
        const blob = await res.blob();
        const objUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objUrl;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(objUrl);
        await new Promise((r) => setTimeout(r, 350));
      }
      toast.success(`${artifacts.length} artifact${artifacts.length > 1 ? "s" : ""} downloaded`);
    } catch {
      toast.error("Some artifacts failed to download — try the full run view");
    } finally {
      setDownloading(false);
    }
  }, [artifacts, downloading]);

  if (!artifacts || artifacts.length === 0) return null;

  return (
    <button
      type="button"
      onClick={downloadAll}
      disabled={downloading}
      className={cnStrip()}
      aria-label={`Download all ${artifacts.length} artifacts`}
      title="Download every artifact this run produced"
    >
      {downloading ? (
        <Loader2 className="h-3 w-3 animate-spin text-primary" />
      ) : (
        <FolderDown className="h-3 w-3 text-primary" />
      )}
      <span className="font-medium">Artifact bundle</span>
      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-elevated px-1.5 py-px font-mono text-[10px]">
        <Package className="h-2.5 w-2.5" />
        {artifacts.length}
      </span>
    </button>
  );
}

/** Compact pill — deliberately small vs the output block above it. */
function cnStrip(): string {
  return [
    "mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-card/80",
    "px-2.5 py-1.5 text-[11px] text-muted-foreground transition",
    "hover:border-primary/40 hover:text-foreground hover:bg-elevated",
    "disabled:cursor-not-allowed disabled:opacity-60",
  ].join(" ");
}
