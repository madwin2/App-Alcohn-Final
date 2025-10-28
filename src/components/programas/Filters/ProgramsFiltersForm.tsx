import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useProgramsStore } from '@/lib/state/programs.store';
import { MachineType, FabricationState } from '@/lib/types/index';

interface ProgramsFiltersFormProps {
  onApply: () => void;
}

// Formulario de filtros para programas
export function ProgramsFiltersForm({ onApply }: ProgramsFiltersFormProps) {
  const {
    selectedMachine,
    selectedFabricationState,
    showVerifiedOnly,
    showUnverifiedOnly,
    dateFilterType,
    specificDate,
    selectedMonth,
    selectedYear,
    setSelectedMachine,
    setSelectedFabricationState,
    setShowVerifiedOnly,
    setShowUnverifiedOnly,
    setDateFilterType,
    setSpecificDate,
    setSelectedMonth,
    setSelectedYear,
    resetFilters
  } = useProgramsStore();

  const handleApply = () => {
    onApply();
  };

  const handleReset = () => {
    resetFilters();
    onApply();
  };

  const handleVerifiedChange = (checked: boolean) => {
    setShowVerifiedOnly(checked);
    if (checked) {
      setShowUnverifiedOnly(false);
    }
  };

  const handleUnverifiedChange = (checked: boolean) => {
    setShowUnverifiedOnly(checked);
    if (checked) {
      setShowVerifiedOnly(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {/* Filtro por tipo de máquina */}
        <div className="space-y-2">
          <Label htmlFor="machine">Tipo de Máquina</Label>
          <Select value={selectedMachine} onValueChange={setSelectedMachine}>
            <SelectTrigger>
              <SelectValue placeholder="Todas las máquinas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas las máquinas</SelectItem>
              <SelectItem value="C">Máquina Chica (C)</SelectItem>
              <SelectItem value="G">Máquina Grande (G)</SelectItem>
              <SelectItem value="XL">Máquina XL</SelectItem>
              <SelectItem value="ABC">Máquina ABC</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Filtro por estado de fabricación */}
        <div className="space-y-2">
          <Label htmlFor="fabricationState">Estado de Fabricación</Label>
          <Select value={selectedFabricationState} onValueChange={setSelectedFabricationState}>
            <SelectTrigger>
              <SelectValue placeholder="Todos los estados" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los estados</SelectItem>
              <SelectItem value="SIN_HACER">Sin Hacer</SelectItem>
              <SelectItem value="HACIENDO">Haciendo</SelectItem>
              <SelectItem value="VERIFICAR">Verificar</SelectItem>
              <SelectItem value="HECHO">Hecho</SelectItem>
              <SelectItem value="REHACER">Rehacer</SelectItem>
              <SelectItem value="RETOCAR">Retocar</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Filtro por fecha */}
        <div className="space-y-2">
          <Label htmlFor="dateFilterType">Filtro por Fecha</Label>
          <Select value={dateFilterType} onValueChange={setDateFilterType}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar tipo de filtro" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas las fechas</SelectItem>
              <SelectItem value="SPECIFIC">Fecha específica</SelectItem>
              <SelectItem value="MONTH">Por mes</SelectItem>
            </SelectContent>
          </Select>
          
          {/* Fecha específica */}
          {dateFilterType === 'SPECIFIC' && (
            <div className="space-y-2">
              <Label htmlFor="specificDate">Fecha específica</Label>
              <Input
                id="specificDate"
                type="date"
                value={specificDate}
                onChange={(e) => setSpecificDate(e.target.value)}
                className="w-full"
              />
            </div>
          )}
          
          {/* Filtro por mes */}
          {dateFilterType === 'MONTH' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="month">Mes</Label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar mes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Enero</SelectItem>
                    <SelectItem value="2">Febrero</SelectItem>
                    <SelectItem value="3">Marzo</SelectItem>
                    <SelectItem value="4">Abril</SelectItem>
                    <SelectItem value="5">Mayo</SelectItem>
                    <SelectItem value="6">Junio</SelectItem>
                    <SelectItem value="7">Julio</SelectItem>
                    <SelectItem value="8">Agosto</SelectItem>
                    <SelectItem value="9">Septiembre</SelectItem>
                    <SelectItem value="10">Octubre</SelectItem>
                    <SelectItem value="11">Noviembre</SelectItem>
                    <SelectItem value="12">Diciembre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="year">Año</Label>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar año" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 5 }, (_, i) => {
                      const year = new Date().getFullYear() - i;
                      return (
                        <SelectItem key={year} value={year.toString()}>
                          {year}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>

        {/* Filtro por verificación */}
        <div className="space-y-2">
          <Label>Verificación</Label>
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="verified" 
                checked={showVerifiedOnly}
                onCheckedChange={handleVerifiedChange}
              />
              <Label htmlFor="verified" className="text-sm">
                Solo verificados
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="unverified" 
                checked={showUnverifiedOnly}
                onCheckedChange={handleUnverifiedChange}
              />
              <Label htmlFor="unverified" className="text-sm">
                Solo no verificados
              </Label>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={handleReset}>
          Limpiar
        </Button>
        <Button onClick={handleApply}>
          Aplicar Filtros
        </Button>
      </div>
    </div>
  );
}
