import { useCallback, useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@workspace/ui";
import { Button } from "@workspace/ui";
import { Slider } from "@workspace/ui";
import { Label } from "@workspace/ui";
import { useToast } from "@workspace/ui";

interface PortraitCropperDialogProps {
  open: boolean;
  imageSrc: string | null;
  fileName: string;
  mimeType: string;
  onCancel: () => void;
  onCropped: (file: File) => void;
}

const OUTPUT_SIZE = 512;

async function getCroppedImage(
  imageSrc: string,
  area: Area,
  fileName: string,
  mimeType: string,
): Promise<File> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = imageSrc;
  });

  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas-context");

  ctx.drawImage(
    image,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE,
  );

  const outputType = mimeType === "image/png" ? "image/png" : "image/jpeg";
  const quality = outputType === "image/jpeg" ? 0.92 : undefined;

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("canvas-blob"))),
      outputType,
      quality,
    );
  });

  const ext = outputType === "image/png" ? "png" : "jpg";
  const baseName = fileName.replace(/\.[^.]+$/, "") || "portrait";
  return new File([blob], `${baseName}-cropped.${ext}`, { type: outputType });
}

export function PortraitCropperDialog({
  open,
  imageSrc,
  fileName,
  mimeType,
  onCancel,
  onCropped,
}: PortraitCropperDialogProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setBusy(false);
    }
  }, [open, imageSrc]);

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const handleSave = async () => {
    if (!imageSrc || !croppedAreaPixels) return;
    setBusy(true);
    try {
      const file = await getCroppedImage(imageSrc, croppedAreaPixels, fileName, mimeType);
      await onCropped(file);
    } catch {
      toast({ title: "Could not crop image", variant: "destructive" });
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !busy) onCancel(); }}>
      <DialogContent className="max-w-lg" data-testid="dialog-portrait-cropper">
        <DialogHeader>
          <DialogTitle>Crop your portrait</DialogTitle>
          <DialogDescription>
            Drag to reposition and use the slider to zoom. The square area will be saved.
          </DialogDescription>
        </DialogHeader>
        <div className="relative h-72 w-full bg-black/60 rounded-lg overflow-hidden" data-testid="portrait-cropper-canvas">
          {imageSrc && (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="rect"
              showGrid
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="portrait-zoom">Zoom</Label>
          <Slider
            id="portrait-zoom"
            min={1}
            max={4}
            step={0.01}
            value={[zoom]}
            onValueChange={(v) => setZoom(v[0] ?? 1)}
            data-testid="slider-portrait-zoom"
          />
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={busy}
            data-testid="button-cancel-crop"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={busy || !croppedAreaPixels}
            data-testid="button-save-crop"
          >
            {busy ? "Saving…" : "Save crop"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
