"use client";

import { useState } from "react";
import Papa from "papaparse";
import { Button, Card, Input } from "@/components/ui";

export interface ExpectedColumn {
  key: string;
  label: string;
  required?: boolean;
}

interface SpreadsheetImporterProps {
  expectedColumns: ExpectedColumn[];
  onImport: (data: any[]) => Promise<void>;
  isImporting?: boolean;
}

export function SpreadsheetImporter({ expectedColumns, onImport, isImporting }: SpreadsheetImporterProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [url, setUrl] = useState("");
  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [parsedData, setParsedData] = useState<any[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const autoMap = (headers: string[]) => {
    const newMapping: Record<string, string> = {};
    const lowerHeaders = headers.map(h => h.toLowerCase().trim());
    expectedColumns.forEach(col => {
      const colLabel = col.label.toLowerCase().trim();
      const matchIdx = lowerHeaders.findIndex(h => h === colLabel || h.includes(colLabel) || colLabel.includes(h));
      if (matchIdx !== -1) {
        newMapping[col.key] = headers[matchIdx];
      }
    });
    setMapping(newMapping);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (!results.meta.fields || results.meta.fields.length === 0) {
          setError("Could not read columns from the file.");
          return;
        }
        setParsedHeaders(results.meta.fields);
        setParsedData(results.data);
        autoMap(results.meta.fields);
        setStep(2);
      },
      error: (err) => {
        setError(err.message);
      }
    });
  };

  const handleUrlSubmit = async () => {
    if (!url) return;
    setError("");
    try {
      let fetchUrl = url;
      // Convert Google Sheets URL to CSV export URL
      if (url.includes("docs.google.com/spreadsheets")) {
        const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (match && match[1]) {
          fetchUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv`;
        }
      }

      const res = await fetch(fetchUrl);
      if (!res.ok) throw new Error("Failed to fetch spreadsheet. Ensure it is public and accessible.");
      const csvText = await res.text();
      
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (!results.meta.fields || results.meta.fields.length === 0) {
            setError("Could not read columns from the URL.");
            return;
          }
          setParsedHeaders(results.meta.fields);
          setParsedData(results.data);
          autoMap(results.meta.fields);
          setStep(2);
        },
        error: (err: any) => {
          setError(err.message);
        }
      });
    } catch (err: any) {
      setError(err.message);
    }
  };

  const proceedToPreview = () => {
    // Validate required fields
    const missing = expectedColumns.filter(c => c.required && !mapping[c.key]);
    if (missing.length > 0) {
      setError(`Please map the following required columns: ${missing.map(m => m.label).join(", ")}`);
      return;
    }
    setError("");
    setStep(3);
  };

  const submitMappedData = async () => {
    // Transform parsedData based on mapping
    const finalData = parsedData.map(row => {
      const mappedRow: any = {};
      expectedColumns.forEach(col => {
        const sourceHeader = mapping[col.key];
        mappedRow[col.key] = sourceHeader ? row[sourceHeader] : "";
      });
      return mappedRow;
    });

    await onImport(finalData);
  };

  const reset = () => {
    setStep(1);
    setUrl("");
    setParsedHeaders([]);
    setParsedData([]);
    setMapping({});
    setError("");
  };

  return (
    <Card variant="bordered" className="shadow-sm">
      <div className="p-4 space-y-4">
        {step === 1 && (
          <div className="space-y-4">
            <h3 className="text-h3 font-bold">Import Data</h3>
            <p className="text-small text-text-muted">
              Upload a CSV file or paste a public Google Sheet URL.
            </p>

            <div className="space-y-2">
              <label className="text-small font-medium">Upload CSV File</label>
              <input 
                type="file" 
                accept=".csv" 
                onChange={handleFileUpload}
                className="block w-full text-small text-text-primary
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-sm file:border-0
                  file:text-small file:font-semibold
                  file:bg-primary file:text-surface
                  hover:file:bg-primary-dark cursor-pointer"
              />
            </div>

            <div className="relative flex items-center py-2">
              <div className="flex-grow border-t border-border-strong"></div>
              <span className="flex-shrink-0 mx-4 text-text-muted text-small">OR</span>
              <div className="flex-grow border-t border-border-strong"></div>
            </div>

            <div className="space-y-2">
              <Input 
                label="Public Google Sheet URL"
                placeholder="https://docs.google.com/spreadsheets/d/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <Button onClick={handleUrlSubmit} variant="secondary">Fetch URL</Button>
            </div>
            
            {error && <p className="text-small text-error">{error}</p>}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-h3 font-bold">Map Columns</h3>
              <Button variant="ghost" size="sm" onClick={reset}>Cancel</Button>
            </div>
            <p className="text-small text-text-muted">
              Match your spreadsheet's columns to the required fields. We've tried to auto-map them for you.
            </p>

            <div className="bg-surface border border-border-strong rounded-sm p-4 space-y-4">
              {expectedColumns.map(col => (
                <div key={col.key} className="flex flex-col tablet:flex-row tablet:items-center justify-between gap-2 border-b border-border-strong pb-3 last:border-0 last:pb-0">
                  <div className="flex flex-col">
                    <span className="text-small font-semibold">
                      {col.label} {col.required && <span className="text-error">*</span>}
                    </span>
                  </div>
                  <select
                    className="p-2 bg-bg border border-border-strong rounded-sm text-small w-full tablet:w-64 focus:ring-1 focus:ring-primary outline-none"
                    value={mapping[col.key] || ""}
                    onChange={(e) => setMapping({ ...mapping, [col.key]: e.target.value })}
                  >
                    <option value="">-- Ignore this field --</option>
                    {parsedHeaders.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {error && <p className="text-small text-error font-medium bg-error-bg p-2 rounded-sm">{error}</p>}

            <div className="flex justify-end gap-3">
              <Button onClick={proceedToPreview}>Preview Data</Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-h3 font-bold">Preview</h3>
              <Button variant="ghost" size="sm" onClick={() => setStep(2)}>Back</Button>
            </div>
            <p className="text-small text-text-muted">
              Here is a preview of the first few rows that will be imported ({parsedData.length} total rows found).
            </p>

            <div className="overflow-x-auto border border-border-strong rounded-sm">
              <table className="w-full text-left text-small">
                <thead className="bg-surface border-b border-border-strong">
                  <tr>
                    {expectedColumns.map(c => (
                      <th key={c.key} className="p-2 font-medium">{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsedData.slice(0, 3).map((row, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      {expectedColumns.map(c => {
                        const sourceHeader = mapping[c.key];
                        const val = sourceHeader ? row[sourceHeader] : "";
                        return <td key={c.key} className="p-2 truncate max-w-[200px]">{val || "-"}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={reset}>Cancel</Button>
              <Button onClick={submitMappedData} loading={isImporting}>
                Import {parsedData.length} Rows
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
