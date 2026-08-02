"use client";

import { useRef, useState } from "react";
import { Button, Card } from "@/components/ui";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onProcessed: (results: any) => void;
  classId: string;
  subjectId: string;
  termId: string;
}

export function AiImportModal({ isOpen, onClose, onProcessed, classId, subjectId, termId }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    setFiles(prev => [...prev, ...selected]);
    setError("");
  };

  const removeFile = (i: number) => setFiles(prev => prev.filter((_, idx) => idx !== i));

  const handleProcess = async () => {
    if (!files.length) { setError("Please select at least one image"); return; }
    setUploading(true);
    setProgress("Uploading and processing...");
    setError("");

    const fd = new FormData();
    fd.append("class_id", classId);
    fd.append("subject_id", subjectId);
    fd.append("term_id", termId);
    files.forEach(f => fd.append("images", f));

    try {
      const res = await fetch("/api/teacher/ai-import", { method: "POST", body: fd });
      if (!res.ok) { const d = await res.json(); setError(d.error || "Processing failed"); setUploading(false); return; }
      const data = await res.json();
      setProgress("Done!");
      setTimeout(() => { onProcessed(data); onClose(); }, 500);
    } catch {
      setError("Network error. Please try again.");
    }
    setUploading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <Card variant="default" className="relative max-w-md w-full shadow-lg space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-h3 font-bold">📷 AI Score Import</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>✕</Button>
        </div>

        <p className="text-small text-text-muted">Upload photos of your assessment sheets. The AI will extract student names and scores.</p>

        {/* Drop zone */}
        <div
          className="border-2 border-dashed border-border rounded-sm p-6 text-center cursor-pointer hover:border-primary transition-colors"
          onClick={() => fileRef.current?.click()}
        >
          <p className="text-2xl mb-2">📄</p>
          <p className="text-small text-text-muted">Click to select photos</p>
          <p className="text-caption text-text-muted mt-1">JPG, PNG, HEIC — max 10MB each</p>
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" />
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {files.map((f, i) => (
              <div key={i} className="flex items-center justify-between text-small bg-bg px-3 py-1 rounded-sm">
                <span className="truncate">{f.name}</span>
                <button onClick={() => removeFile(i)} className="text-error hover:underline text-caption">Remove</button>
              </div>
            ))}
          </div>
        )}

        {progress && <p className="text-small text-primary font-medium text-center">{progress}</p>}
        {error && <div className="bg-error-bg border border-error rounded-sm px-3 py-2"><p className="text-small text-error">{error}</p></div>}

        <div className="flex gap-3 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={uploading}>Cancel</Button>
          <Button size="sm" onClick={handleProcess} loading={uploading} disabled={!files.length}>
            {uploading ? "Processing..." : "Process Images"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
