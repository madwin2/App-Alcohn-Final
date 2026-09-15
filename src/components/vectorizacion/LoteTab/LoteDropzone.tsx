import { useRef, useState } from 'react';

interface Props {
  onFiles: (files: File[]) => void;
  accept?: string;
  label: string;
  hint?: string;
}

export function LoteDropzone({ onFiles, accept = 'image/*', label, hint }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const take = (list: FileList | File[]) => {
    onFiles(Array.from(list));
  };

  return (
    <div
      className={`flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition ${
        over ? 'border-primary bg-primary/5' : 'border-muted-foreground/30'
      }`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (e.dataTransfer.files.length) take(e.dataTransfer.files);
      }}
    >
      <p className="font-medium">{label}</p>
      {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        multiple
        accept={accept}
        onChange={(e) => {
          if (e.target.files?.length) take(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
