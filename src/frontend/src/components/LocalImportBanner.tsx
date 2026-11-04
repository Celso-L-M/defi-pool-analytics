import { Button } from "@/components/ui/button";
import { useLocalImportOffer } from "@/hooks/useLocalImport";
import { toast } from "@/utils/toast";
import { DownloadCloud, X } from "lucide-react";

/** Offers to move watchlist, wallets and positions saved on this device. */
export function LocalImportBanner() {
  const offer = useLocalImportOffer();
  if (!offer.shouldOffer) return null;

  return (
    <section
      data-ocid="import_banner"
      aria-label="Import saved data"
      className="flex flex-wrap items-center gap-3 border-b border-primary/30 bg-primary/10 px-4 py-2.5"
    >
      <DownloadCloud className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <p className="min-w-0 flex-1 text-xs sm:text-sm">
        Found {offer.count} saved {offer.count === 1 ? "item" : "items"} from
        the earlier version on this device. Import to keep them in your account.
        {offer.error && (
          <span className="ml-1 text-destructive">
            Import failed: {offer.error.message}
          </span>
        )}
      </p>
      <Button
        type="button"
        size="sm"
        data-ocid="import_banner.import_button"
        disabled={offer.isImporting}
        onClick={() =>
          offer.importNow((added) =>
            toast.success(
              `Imported ${added} ${added === 1 ? "item" : "items"}`,
            ),
          )
        }
      >
        {offer.isImporting ? "Importing…" : "Import"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        data-ocid="import_banner.dismiss_button"
        aria-label="Dismiss import offer"
        className="h-8 w-8"
        onClick={offer.dismiss}
      >
        <X className="h-4 w-4" />
      </Button>
    </section>
  );
}
