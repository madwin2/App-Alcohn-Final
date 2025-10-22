import { useState } from 'react';
import { Sidebar } from '@/components/pedidos/Sidebar/Sidebar';
import { ProgramsHeader } from '@/components/programas/Header/ProgramsHeader';
import { ProgramsGrid } from '@/components/programas/Grid/ProgramsGrid';
import { NewProgramDialog } from '@/components/programas/NewProgram/NewProgramDialog';
import { Toaster } from '@/components/ui/toaster';
import { mockPrograms } from '@/lib/mocks/programs.mock';

export default function ProgramasPage() {
  const [showNewProgram, setShowNewProgram] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <Sidebar />
      
      {/* Main Content - Siempre con margen fijo para que el contenido no cambie de tamaño */}
      <div className="flex-1 flex flex-col ml-20">
        {/* Header */}
        <div className="border-b bg-background p-6">
          <ProgramsHeader
            onNewProgram={() => setShowNewProgram(true)}
          />
        </div>

        {/* Programs Grid */}
        <div className="flex-1 p-6 overflow-hidden">
          <ProgramsGrid programs={mockPrograms} />
        </div>
      </div>

      {/* Dialogs */}
      <NewProgramDialog
        open={showNewProgram}
        onOpenChange={setShowNewProgram}
      />

      {/* Toast notifications */}
      <Toaster />
    </div>
  );
}
