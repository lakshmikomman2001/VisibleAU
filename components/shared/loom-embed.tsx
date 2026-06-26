import { PlayCircle } from "lucide-react";

export function LoomEmbed({
  loomId,
  title,
  placeholder = true,
}: {
  loomId?: string;
  title: string;
  placeholder?: boolean;
}) {
  if (!loomId || placeholder) {
    return (
      <div className="aspect-video bg-muted rounded-xl flex flex-col items-center justify-center gap-2 border border-dashed">
        <PlayCircle className="w-12 h-12 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {title} — demo coming soon
        </p>
      </div>
    );
  }

  return (
    <div className="aspect-video rounded-xl overflow-hidden">
      <iframe
        src={`https://www.loom.com/embed/${loomId}?hide_owner=true&hide_share=true`}
        allowFullScreen
        className="w-full h-full"
        title={title}
      />
    </div>
  );
}
