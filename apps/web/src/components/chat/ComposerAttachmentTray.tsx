import { CircleAlertIcon, XIcon } from "lucide-react";

import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { type ChatComposerController } from "./useChatComposerController";

interface ComposerAttachmentTrayProps {
  attachments: ChatComposerController["attachments"];
}

export function ComposerAttachmentTray({ attachments }: ComposerAttachmentTrayProps) {
  if (attachments.images.length === 0) {
    return null;
  }

  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {attachments.images.map((image) => (
        <div
          key={image.id}
          className="relative h-16 w-16 overflow-hidden rounded-lg border border-border/80 bg-background"
        >
          {image.previewUrl ? (
            <button
              type="button"
              className="h-full w-full cursor-zoom-in"
              aria-label={`Preview ${image.name}`}
              onClick={() => {
                attachments.onPreviewImage(image.id);
              }}
            >
              <img
                src={image.previewUrl}
                alt={image.name}
                className="h-full w-full object-cover"
              />
            </button>
          ) : (
            <div className="flex h-full w-full items-center justify-center px-1 text-center text-[10px] text-muted-foreground/70">
              {image.name}
            </div>
          )}
          {attachments.nonPersistedImageIdSet.has(image.id) ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    role="img"
                    aria-label="Draft attachment may not persist"
                    className="absolute left-1 top-1 inline-flex items-center justify-center rounded bg-background/85 p-0.5 text-amber-600"
                  >
                    <CircleAlertIcon className="size-3" />
                  </span>
                }
              />
              <TooltipPopup side="top" className="max-w-64 whitespace-normal leading-tight">
                Draft attachment could not be saved locally and may be lost on navigation.
              </TooltipPopup>
            </Tooltip>
          ) : null}
          <Button
            variant="ghost"
            size="icon-xs"
            className="absolute right-1 top-1 bg-background/80 hover:bg-background/90"
            onClick={() => attachments.onRemoveImage(image.id)}
            aria-label={`Remove ${image.name}`}
          >
            <XIcon />
          </Button>
        </div>
      ))}
    </div>
  );
}
