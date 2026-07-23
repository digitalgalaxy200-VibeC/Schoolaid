"use client";
import { useEffect, useRef, useState } from "react";
import { Button, Card, Input } from "@/components/ui";

const selectClass = "w-full px-4 py-[10px] text-body bg-surface border border-border-strong rounded-sm";

export default function StudentProfilePage() {
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [className, setClassName] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/student/profile")
      .then((r) => r.json())
      .then((d) => {
        setUsername(d.username || "");
        setFullName(d.full_name || "");
        setClassName(d.class_name || "");
        setPhotoUrl(d.photo_url || null);
        setDob(d.date_of_birth || "");
        setGender(d.gender || "");
      })
      .finally(() => setLoading(false));
  }, []);

  const showMsg = (type: "success" | "error", text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 3000);
  };

  const handlePhotoPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/student/upload-avatar", { method: "POST", body: formData });
      const d = await res.json();
      if (!res.ok) { showMsg("error", d.error || "Upload failed"); return; }
      setPhotoUrl(d.url);
    } catch {
      showMsg("error", "Upload failed");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/student/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo_url: photoUrl, date_of_birth: dob || null, gender: gender || null }),
      });
      const d = await res.json();
      if (!res.ok) { showMsg("error", d.error || "Save failed"); return; }
      showMsg("success", "Profile updated");
    } catch {
      showMsg("error", "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin h-6 w-6 border-2 border-success border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-md">
      <div>
        <h1 className="text-h1 font-bold">My Profile</h1>
        <p className="text-small text-text-muted mt-1">Update your photo and basic information.</p>
      </div>

      <Card variant="bordered" className="shadow-sm">
        <div className="p-5 space-y-5">
          <div className="flex items-center gap-4">
            {photoUrl ? (
              <img src={photoUrl} alt="" className="w-20 h-20 rounded-full object-cover border border-border" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-bg border border-border flex items-center justify-center text-h2 text-text-muted">
                {fullName.charAt(0) || "?"}
              </div>
            )}
            <div>
              <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={handlePhotoPick} />
              <Button variant="secondary" size="sm" loading={uploading} onClick={() => fileInput.current?.click()}>
                Change Photo
              </Button>
            </div>
          </div>

          <div>
            <p className="text-small font-semibold text-text-secondary mb-1">Full Name</p>
            <p className="text-body text-text-primary">{fullName}</p>
          </div>
          <div>
            <p className="text-small font-semibold text-text-secondary mb-1">Class</p>
            <p className="text-body text-text-primary">{className || "—"}</p>
          </div>
          <Input label="Username" value={username} disabled hint="Your username cannot be changed." />
          <Input label="Date of Birth" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
          <div className="space-y-1">
            <label className="text-small font-semibold text-text-secondary">Gender</label>
            <select className={selectClass} value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">Select Gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>

          {msg && (
            <div className={`rounded-sm px-4 py-2 border ${msg.type === "error" ? "bg-error-bg border-error" : "bg-success-bg border-success"}`}>
              <p className={`text-small font-medium ${msg.type === "error" ? "text-error" : "text-success"}`}>{msg.text}</p>
            </div>
          )}

          <Button onClick={handleSave} loading={saving} fullWidth>Save Changes</Button>
        </div>
      </Card>
    </div>
  );
}
