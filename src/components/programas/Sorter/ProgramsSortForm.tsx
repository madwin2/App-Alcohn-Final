import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useProgramsStore } from '@/lib/state/programs.store';

interface ProgramsSortFormProps {
  onApply: () => void;
}

// Formulario para ordenar programas
export function ProgramsSortForm({ onApply }: ProgramsSortFormProps) {
  const { 
    viewMode, 
    sortField, 
    sortDirection, 
    setViewMode, 
    setSortField, 
    setSortDirection 
  } = useProgramsStore();

  const handleApply = () => {
    onApply();
  };

  const handleReset = () => {
    setSortField('name');
    setSortDirection('asc');
    setViewMode('grid');
    onApply();
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {/* Orden por campo */}
        <div className="space-y-2">
          <Label htmlFor="sortField">Ordenar por</Label>
          <Select value={sortField} onValueChange={setSortField}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar campo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Nombre</SelectItem>
              <SelectItem value="date">Fecha de producción</SelectItem>
              <SelectItem value="stampCount">Cantidad de sellos</SelectItem>
              <SelectItem value="machine">Máquina</SelectItem>
              <SelectItem value="fabricationState">Estado de Fabricación</SelectItem>
              <SelectItem value="verified">Verificación</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Dirección del orden */}
        <div className="space-y-2">
          <Label htmlFor="sortDirection">Dirección</Label>
          <Select value={sortDirection} onValueChange={(value: 'asc' | 'desc') => setSortDirection(value)}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar dirección" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="asc">Ascendente (A-Z, 1-9)</SelectItem>
              <SelectItem value="desc">Descendente (Z-A, 9-1)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Vista */}
        <div className="space-y-2">
          <Label htmlFor="viewMode">Vista</Label>
          <Select value={viewMode} onValueChange={(value: 'grid' | 'list') => setViewMode(value)}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar vista" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="grid">Grid (Tarjetas)</SelectItem>
              <SelectItem value="list">Lista</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={handleReset}>
          Restablecer
        </Button>
        <Button onClick={handleApply}>
          Aplicar Orden
        </Button>
      </div>
    </div>
  );
}
