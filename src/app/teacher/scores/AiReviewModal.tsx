"use client";

import { useState } from "react";
import { Button, Card, Badge } from "@/components/ui";

interface ScoreEntry {
  component_id: string; component_name: string; score_raw: string;
  score_parsed: number | null; confidence: number; has_existing_score: boolean;
}

interface StudentResult {
  student_id: string | null; student_name_raw: string;
  student_match_confidence: number; student_match_status: "matched" | "ambiguous" | "unmatched";
  scores: ScoreEntry[];
}

interface Props {
  isOpen: boolean; onClose: () => void;
  onImport: (entries: { student_id: string; component_id: string; score: string }[]) => void;
  results: StudentResult[]; components: { id: string; name: string; max_score: number }[];
}

function confidenceBadge(c: number) {
  if (c >= 0.9) return { variant: "success" as const, label: "🟢 High" };
  if (c >= 0.7) return { variant: "warning" as const, label: "🟡 Medium" };
  return { variant: "error" as const, label: "🔴 Low" };
}

export function AiReviewModal({ isOpen, onClose, onImport, results, components }: Props) {
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  if (!isOpen) return null;

  const toggleSkip = (key: string) => {
    const next = new Set(skipped);
    next.has(key) ? next.delete(key) : next.add(key);
    setSkipped(next);
  };

  const handleImport = () => {
    const entries: { student_id: string; component_id: string; score: string }[] = [];
    for (const r of results) {
      if (!r.student_id) continue;
      for (const s of r.scores) {
        if (s.has_existing_score) continue;
        const key = `${r.student_id}|${s.component_id}`;
        if (skipped.has(key)) continue;
        const val = edits[key] !== undefined ? edits[key] : (s.score_parsed !== null ? String(s.score_parsed) : "");
        if (val === "") continue;
        entries.push({ student_id: r.student_id, component_id: s.component_id, score: val });
      }
    }
    onImport(entries);
    onClose();
  };

  const totalCells = results.reduce((s, r) => s + r.scores.length, 0);
  const skippedCount = skipped.size;
  const existingSkipped = results.reduce((s, r) => s + r.scores.filter(sc => sc.has_existing_score).length, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <Card variant="default" className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-lg space-y-4">
        <div className="flex items-center justify-between sticky top-0 bg-bg z-10 pb-2 border-b border-border">
          <div>
            <h2 className="text-h3 font-bold">📷 Review Imported Scores</h2>
            <p className="text-caption text-text-muted">{results.length} students · {totalCells} scores extracted</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>✕</Button>
        </div>

        <div className="flex gap-4 text-caption flex-wrap">
          <span><Badge variant="success">🟢 High</Badge> ≥90%</span>
          <span><Badge variant="warning">🟡 Med</Badge> 70-89%</span>
          <span><Badge variant="error">🔴 Low</Badge> &lt;70%</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-small">
            <thead>
              <tr className="bg-bg text-left text-caption text-text-muted uppercase">
                <th className="px-2 py-1.5">Student</th>
                {components.map(c => <th key={c.id} className="px-2 py-1.5 text-center">{c.name}<br /><span className="font-normal">/{c.max_score}</span></th>)}
              </tr>
            </thead>
            <tbody>
              {results.map((r, ri) => (
                <tr key={ri} className="border-t border-border">
                  <td className="px-2 py-1.5">
                    <div className="font-semibold">{r.student_name_raw}</div>
                    {r.student_match_status !== "matched" && <Badge variant="warning">⚠ Review</Badge>}
                  </td>
                  {components.map(c => {
                    const score = r.scores.find(s => s.component_id === c.id);
                    if (!score) return <td key={c.id} className="px-2 py-1.5 text-center text-text-muted">—</td>;
                    const cellKey = `${r.student_id}|${c.id}`;
                    const isCellSkipped = skipped.has(cellKey);
                    const badge = confidenceBadge(score.confidence);
                    if (score.has_existing_score) {
                      return <td key={c.id} className="px-2 py-1.5 text-center"><span className="text-caption text-text-muted">Existing</span></td>;
                    }
                    return (
                      <td key={c.id} className={`px-1 py-1 text-center ${isCellSkipped ? "opacity-30" : ""}`}>
                        <input
                          type="text" inputMode="decimal"
                          value={edits[cellKey] ?? (score.score_parsed !== null ? String(score.score_parsed) : "")}
                          onChange={e => setEdits(prev => ({ ...prev, [cellKey]: e.target.value }))}
                          disabled={isCellSkipped}
                          className={`w-14 text-center px-1 py-1 rounded-sm border text-small ${badge.variant === "success" ? "border-success bg-success-bg/20" : badge.variant === "warning" ? "border-warning bg-warning-bg/20" : "border-error bg-error-bg/20"}`}
                        />
                        <div className="text-[8px]">
                          <label className="cursor-pointer text-text-muted">
                            <input type="checkbox" checked={isCellSkipped} onChange={() => toggleSkip(cellKey)} className="w-3 h-3 mr-0.5" />
                            {badge.label}
                          </label>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="text-caption text-text-muted border-t border-border pt-2">
          {totalCells - skippedCount - existingSkipped} scores will be imported. {existingSkipped} existing preserved. {skippedCount} skipped.
        </div>

        <div className="flex gap-3 justify-end sticky bottom-0 bg-bg pt-2 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleImport}>Import {totalCells - skippedCount - existingSkipped} Scores</Button>
        </div>
      </Card>
    </div>
  );
}
