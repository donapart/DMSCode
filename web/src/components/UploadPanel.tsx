"use client";

import { AlertCircle, Camera, Check, Upload, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";

interface UploadPanelProps {
  onUploadComplete?: () => void;
}

interface UploadFile {
  file: File;
  status: "pending" | "uploading" | "success" | "error";
  progress: number;
  error?: string;
}

export function UploadPanel({ onUploadComplete }: UploadPanelProps) {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [folder, setFolder] = useState("");
  const [tags, setTags] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    addFiles(droppedFiles);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const addFiles = (newFiles: File[]) => {
    const uploadFiles: UploadFile[] = newFiles.map((file) => ({
      file,
      status: "pending",
      progress: 0,
    }));
    setFiles((prev) => [...prev, ...uploadFiles]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadFile = async (uploadFile: UploadFile, index: number) => {
    setFiles((prev) =>
      prev.map((f, i) => (i === index ? { ...f, status: "uploading" } : f)),
    );

    try {
      const formData = new FormData();
      formData.append("file", uploadFile.file);

      const params = new URLSearchParams();
      if (folder) params.set("folder", folder);
      if (tags) params.set("tags", tags);

      const response = await fetch(
        `/api/storage/objects?${params.toString()}`,
        {
          method: "POST",
          body: formData,
        },
      );

      if (!response.ok) throw new Error("Upload fehlgeschlagen");

      setFiles((prev) =>
        prev.map((f, i) =>
          i === index ? { ...f, status: "success", progress: 100 } : f,
        ),
      );
    } catch (err) {
      setFiles((prev) =>
        prev.map((f, i) =>
          i === index
            ? {
                ...f,
                status: "error",
                error:
                  err instanceof Error ? err.message : "Unbekannter Fehler",
              }
            : f,
        ),
      );
    }
  };

  const uploadAllFiles = async () => {
    const pendingFiles = files.filter((f) => f.status === "pending");
    for (let i = 0; i < files.length; i++) {
      if (files[i].status === "pending") {
        await uploadFile(files[i], i);
      }
    }
    onUploadComplete?.();
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const pendingCount = files.filter((f) => f.status === "pending").length;
  const successCount = files.filter((f) => f.status === "success").length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-dms-dark flex items-center gap-2">
          <Upload className="w-7 h-7 text-dms-primary" />
          Dokumente hochladen
        </h1>
        <p className="text-dms-secondary mt-1">
          Ziehen Sie Dateien hierher oder wählen Sie sie aus
        </p>
      </div>

      {/* Options */}
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-dms-dark mb-1">
            Zielordner (optional)
          </label>
          <input
            type="text"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            placeholder="z.B. Rechnungen/2024"
            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-dms-primary focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-dms-dark mb-1">
            Tags (kommagetrennt)
          </label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="z.B. Rechnung, Wichtig, 2024"
            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-dms-primary focus:border-transparent"
          />
        </div>
      </div>

      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          border-2 border-dashed rounded-xl p-12
          flex flex-col items-center justify-center
          transition-all duration-200
          ${
            isDragging
              ? "border-dms-primary bg-dms-primary/5"
              : "border-gray-300 hover:border-dms-primary"
          }
        `}
      >
        <Upload
          className={`w-12 h-12 mb-4 ${isDragging ? "text-dms-primary" : "text-gray-400"}`}
        />
        <p className="text-dms-dark font-medium text-lg mb-2">
          Dateien hier ablegen
        </p>
        <p className="text-dms-secondary text-sm mb-4">
          PDF, Bilder, Word, Excel – bis zu 50 MB pro Datei
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-6 py-2 bg-dms-primary text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Dateien auswählen
          </button>
          <button
            onClick={() => cameraInputRef.current?.click()}
            className="px-6 py-2 bg-dms-secondary text-white rounded-lg hover:bg-slate-600 transition-colors flex items-center gap-2 md:hidden"
          >
            <Camera className="w-5 h-5" />
            Kamera
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.gif,.doc,.docx,.xls,.xlsx"
          className="hidden"
          onChange={(e) => addFiles(Array.from(e.target.files || []))}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => addFiles(Array.from(e.target.files || []))}
        />
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-dms-dark font-medium">
              {files.length} {files.length === 1 ? "Datei" : "Dateien"}{" "}
              ausgewählt
              {successCount > 0 && (
                <span className="text-dms-success ml-2">
                  ({successCount} hochgeladen)
                </span>
              )}
            </p>
            {pendingCount > 0 && (
              <button
                onClick={uploadAllFiles}
                className="px-6 py-2 bg-dms-success text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2"
              >
                <Upload className="w-5 h-5" />
                Alle hochladen ({pendingCount})
              </button>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm divide-y">
            {files.map((uploadFile, index) => (
              <div key={index} className="p-4 flex items-center gap-4">
                <div className="text-2xl">
                  {uploadFile.file.type.includes("pdf")
                    ? "📄"
                    : uploadFile.file.type.includes("image")
                      ? "🖼️"
                      : "📁"}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-dms-dark truncate">
                    {uploadFile.file.name}
                  </p>
                  <p className="text-sm text-dms-secondary">
                    {formatBytes(uploadFile.file.size)}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {uploadFile.status === "pending" && (
                    <>
                      <button
                        onClick={() =>
                          uploadFile &&
                          uploadFile.file &&
                          uploadFile &&
                          uploadFile &&
                          uploadFile &&
                          index !== undefined &&
                          uploadFile &&
                          uploadFile &&
                          uploadFile &&
                          uploadFile &&
                          uploadFile &&
                          uploadFile &&
                          uploadFile &&
                          uploadFile &&
                          uploadFile &&
                          uploadFile &&
                          uploadFile &&
                          uploadFile &&
                          uploadFile &&
                          uploadFile &&
                          uploadFile &&
                          uploadFile &&
                          uploadFile &&
                          uploadFile &&
                          uploadFile &&
                          uploadFile &&
                          uploadFile &&
                          uploadFile &&
                          uploadFile &&
                          uploadFile &&
                          uploadFile &&
                          uploadFile &&
                          removeFile(index)
                        }
                        className="p-2 hover:bg-gray-100 rounded-lg text-dms-secondary"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </>
                  )}
                  {uploadFile.status === "uploading" && (
                    <div className="w-8 h-8 border-2 border-dms-primary border-t-transparent rounded-full animate-spin" />
                  )}
                  {uploadFile.status === "success" && (
                    <div className="w-8 h-8 bg-dms-success rounded-full flex items-center justify-center">
                      <Check className="w-5 h-5 text-white" />
                    </div>
                  )}
                  {uploadFile.status === "error" && (
                    <div className="flex items-center gap-2 text-dms-danger">
                      <AlertCircle className="w-5 h-5" />
                      <span className="text-sm">{uploadFile.error}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
