import { getYoutubeId, youtubeThumbnail } from "@/cms/core/youtube";
import { cn } from "../lib/utils";
import { Input } from "./ui/input";

type Props = {
  value?: string;
  placeholder?: string;
  onChange: (value: string) => void;
};

/**
 * URL input for a YouTube block sub-field that shows the video thumbnail once a
 * valid id can be parsed — mirrors ImagePicker's preview box. Stores the raw URL.
 */
export default function YoutubeField({ value = "", placeholder, onChange }: Props) {
  const id = getYoutubeId(value);

  return (
    <div className="space-y-3">
      <Input
        type="url"
        value={value}
        placeholder={placeholder ?? "Paste a YouTube URL"}
        onChange={(e) => onChange(e.target.value)}
      />

      {value &&
        (id ? (
          <a
            href={`https://www.youtube.com/watch?v=${id}`}
            target="_blank"
            rel="noreferrer"
            className="hover:border-foreground/50 block w-64 max-w-full overflow-hidden rounded-lg border"
          >
            <img src={youtubeThumbnail(id)} alt="" className="aspect-video w-full object-cover" />
          </a>
        ) : (
          <div
            className={cn(
              "bg-muted/30 text-muted-foreground flex aspect-video w-64 max-w-full items-center justify-center rounded-lg border px-4 text-center text-sm",
            )}
          >
            Not a recognized YouTube URL
          </div>
        ))}
    </div>
  );
}
