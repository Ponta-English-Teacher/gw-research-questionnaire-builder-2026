import { useRef } from "react";

interface Props {
  onSave: () => void;
  onOpenFile: (file: File) => void;
  onNewProject: () => void;
}

export default function ProjectToolbar({ onSave, onOpenFile, onNewProject }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onOpenFile(file);
    e.target.value = "";
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onNewProject}
        className="rounded-md border px-3 py-1.5 text-sm font-medium bg-white hover:bg-gray-50"
      >
        New Project
      </button>
      <button
        type="button"
        onClick={onSave}
        className="rounded-md border px-3 py-1.5 text-sm font-medium bg-white hover:bg-gray-50"
      >
        Save Project (JSON)
      </button>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="rounded-md border px-3 py-1.5 text-sm font-medium bg-white hover:bg-gray-50"
      >
        Open Project (JSON)
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
