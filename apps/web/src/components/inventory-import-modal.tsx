"use client";

import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  X,
  Layers,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { parseInventoryExcel, type ParsedInventoryItem, type ExcelParseResult } from "@/lib/excel-importer";
import { createWebApiClient } from "@/lib/api";
import { formatInr } from "@/lib/format";
import { formatInventoryType } from "@skyarc/shared";
import { trackBusinessEvent } from "@/lib/clarity-telemetry";

interface InventoryImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultVendorName?: string;
}

export function InventoryImportModal({
  isOpen,
  onClose,
  defaultVendorName,
}: InventoryImportModalProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [vendorName, setVendorName] = useState(defaultVendorName || "");
  const [vendorEmail, setVendorEmail] = useState("");
  const [parseResult, setParseResult] = useState<ExcelParseResult | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [importSuccessMsg, setImportSuccessMsg] = useState("");
  const [createdVendorUser, setCreatedVendorUser] = useState<{
    name: string;
    email: string;
    tempPassword?: string;
  } | null>(null);
  const [importError, setImportError] = useState("");

  const importMutation = useMutation({
    mutationFn: async (items: ParsedInventoryItem[]) => {
      const client = createWebApiClient();
      return client.importInventoryBatch({
        vendorOrgName: vendorName.trim() || undefined,
        vendorAdminEmail: vendorEmail.trim() || undefined,
        items,
      });
    },
    onSuccess: async (res) => {
      trackBusinessEvent("inventory_excel_imported", {
        totalSites: res.data.total,
        createdSites: res.data.created,
        updatedSites: res.data.updated,
        vendor: vendorName || "unknown",
      });
      setImportSuccessMsg(
        `Successfully imported ${res.data.total} site(s) (${res.data.created} newly created, ${res.data.updated} updated rate cards).`
      );
      if (res.data.vendorUserCreated) {
        setCreatedVendorUser(res.data.vendorUserCreated);
      }
      await queryClient.invalidateQueries({ queryKey: ["locations"] });
      await queryClient.invalidateQueries({ queryKey: ["locations-map"] });
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
    },
    onError: (err) => {
      setImportError(err instanceof Error ? err.message : "Failed to import inventory batch.");
    },
  });

  if (!isOpen) return null;

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setIsParsing(true);
    setImportError("");
    setImportSuccessMsg("");

    try {
      const buffer = await selected.arrayBuffer();
      const result = await parseInventoryExcel(buffer);
      setParseResult(result);
      if (result.vendorOrgName && !vendorName) {
        setVendorName(result.vendorOrgName);
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Error parsing Excel workbook.");
    } finally {
      setIsParsing(false);
    }
  }

  function handleReset() {
    setFile(null);
    setParseResult(null);
    setImportError("");
    setImportSuccessMsg("");
    setCreatedVendorUser(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const items = parseResult?.items || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-violet-100 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Import Vendor Inventory via Excel
              </h2>
              <p className="text-xs text-muted">
                Supports standard availability & rate card sheets (Webpulse, Veda, Brandalyst formats)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {importSuccessMsg ? (
            <div className="p-8 text-center space-y-4">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Import Complete!</h3>
              <p className="text-sm text-slate-600 max-w-md mx-auto">{importSuccessMsg}</p>

              {createdVendorUser && (
                <div className="my-4 p-4 rounded-xl bg-violet-50/80 border border-violet-200 text-left max-w-lg mx-auto space-y-2">
                  <div className="flex items-center gap-2 text-primary font-bold text-sm">
                    <Sparkles className="w-4 h-4" />
                    <span>New Vendor Agency & Admin User Provisioned</span>
                  </div>
                  <p className="text-xs text-slate-600">
                    A dedicated portal user account was automatically configured for this agency so they can manage their inventory and rate cards:
                  </p>
                  <div className="p-3 bg-white border border-violet-100 rounded-lg text-xs font-mono space-y-1">
                    <p>Login Email: <strong className="text-primary">{createdVendorUser.email}</strong></p>
                    <p>Temporary Password: <strong className="text-slate-800">{createdVendorUser.tempPassword}</strong></p>
                  </div>
                  <p className="text-[11px] text-muted">
                    You can share these credentials with the vendor or send them an activation link. The vendor can change their email address anytime under Account settings.
                  </p>
                </div>
              )}

              <div className="pt-4 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    handleReset();
                  }}
                  className="btn-secondary"
                >
                  Import Another File
                </button>
                <button type="button" onClick={onClose} className="btn-primary">
                  View Updated Inventory
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* File Dropzone */}
              {!parseResult ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-violet-200 hover:border-primary bg-violet-50/30 hover:bg-violet-50/70 rounded-2xl p-10 text-center cursor-pointer transition-all space-y-3"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={handleFileSelected}
                  />
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto shadow-sm">
                    <Upload className="w-7 h-7" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 text-base">
                      {isParsing ? "Analyzing spreadsheet…" : "Click or drag your inventory Excel sheet here"}
                    </p>
                    <p className="text-xs text-muted mt-1">
                      Supports .xlsx / .xls format with media types, sizes, lighting, and card rates
                    </p>
                  </div>
                  <div className="inline-flex items-center gap-1.5 text-xs text-primary font-semibold bg-white border border-violet-100 px-3 py-1.5 rounded-full shadow-xs">
                    <Sparkles className="w-3.5 h-3.5" />
                    Auto-maps Rajkot locations, IIDs, SQFT & Rate Cards
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Summary Bar */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <span className="text-xs text-muted font-medium block">Spreadsheet Source</span>
                      <span className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                        {file?.name}
                      </span>
                    </div>

                    <div>
                      <span className="text-xs text-muted font-medium block">Total Valid Sites</span>
                      <span className="font-bold text-slate-900 text-sm">{items.length} locations</span>
                    </div>

                    <div className="flex-1 min-w-[200px]">
                      <span className="text-xs text-muted font-medium block">Vendor / Organization</span>
                      <input
                        type="text"
                        value={vendorName}
                        onChange={(e) => setVendorName(e.target.value)}
                        placeholder="Vendor Company Name"
                        className="w-full text-xs font-semibold px-2.5 py-1.5 border border-violet-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>

                    <div className="flex-1 min-w-[200px]">
                      <span className="text-xs text-muted font-medium block">
                        Vendor Admin Email <span className="text-slate-400 font-normal">(Optional)</span>
                      </span>
                      <input
                        type="email"
                        value={vendorEmail}
                        onChange={(e) => setVendorEmail(e.target.value)}
                        placeholder={`${(vendorName.toLowerCase().replace(/[^a-z0-9]/g, "") || "agency")}@skyarcads.com`}
                        className="w-full text-xs font-semibold px-2.5 py-1.5 border border-violet-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleReset}
                      className="text-xs text-slate-500 hover:text-red-600 underline"
                    >
                      Change file
                    </button>
                  </div>

                  {/* Parse Errors */}
                  {parseResult.errors.length > 0 && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <div>
                        {parseResult.errors.map((err, idx) => (
                          <p key={idx}>{err}</p>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Preview Table */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                    <div className="max-h-72 overflow-y-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-100/80 sticky top-0 border-b border-slate-200 text-slate-700 font-semibold">
                          <tr>
                            <th className="p-2.5">IID</th>
                            <th className="p-2.5">Area & Location</th>
                            <th className="p-2.5">Format</th>
                            <th className="p-2.5">Size / SQFT</th>
                            <th className="p-2.5">Lighting</th>
                            <th className="p-2.5">Card Rate (Monthly)</th>
                            <th className="p-2.5">Coordinates</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {items.slice(0, 15).map((item, idx) => (
                            <tr key={idx} className="hover:bg-violet-50/30 transition-colors">
                              <td className="p-2.5 font-bold text-primary font-mono">
                                {item.iid || `—`}
                              </td>
                              <td className="p-2.5 max-w-[220px]">
                                <span className="font-semibold text-slate-800 block truncate">
                                  {item.area}
                                </span>
                                <span className="text-[11px] text-muted block truncate">
                                  {item.locationDescription || item.name}
                                </span>
                              </td>
                              <td className="p-2.5">
                                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium text-[10px]">
                                  {formatInventoryType(item.mediaType)}
                                </span>
                              </td>
                              <td className="p-2.5">
                                {item.widthFt && item.heightFt ? (
                                  <span>
                                    {item.widthFt}x{item.heightFt} ({item.sqft} sqft)
                                  </span>
                                ) : (
                                  <span>{item.sqft ?? "—"} sqft</span>
                                )}
                              </td>
                              <td className="p-2.5 capitalize text-slate-600">
                                {item.lightingType || "—"}
                              </td>
                              <td className="p-2.5 font-bold text-slate-900">
                                {item.cardRateAmount ? formatInr(item.cardRateAmount) : "—"}
                              </td>
                              <td className="p-2.5 text-[10px] text-muted font-mono">
                                {item.latitude}, {item.longitude}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {items.length > 15 && (
                      <div className="p-2 text-center bg-slate-50 border-t border-slate-100 text-[11px] text-muted font-medium">
                        + {items.length - 15} more inventory sites ready for import
                      </div>
                    )}
                  </div>
                </div>
              )}

              {importError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <span>{importError}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        {!importSuccessMsg && (
          <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <button type="button" onClick={onClose} className="btn-secondary text-xs">
              Cancel
            </button>
            <button
              type="button"
              disabled={!parseResult || items.length === 0 || importMutation.isPending}
              onClick={() => importMutation.mutate(items)}
              className="btn-primary text-xs gap-2 py-2 px-5 disabled:opacity-50"
            >
              {importMutation.isPending ? (
                "Importing Inventory Batch…"
              ) : (
                <>
                  Confirm & Import {items.length} Sites
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
