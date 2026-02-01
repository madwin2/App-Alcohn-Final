import * as React from "react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { Calendar as CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { CustomCalendar } from "@/components/ui/custom-calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { parseOrderDateLocal } from "@/lib/utils/format"

interface DatePickerProps {
  date?: Date
  onDateChange?: (date: Date | undefined) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function DatePicker({
  date,
  onDateChange,
  placeholder = "Seleccionar fecha",
  disabled = false,
  className
}: DatePickerProps) {
  const validDate = React.useMemo(() => {
    if (date == null) return undefined;
    if (date instanceof Date && !isNaN(date.getTime())) return date;
    if (typeof date === 'string') {
      const d = parseOrderDateLocal(date);
      return !isNaN(d.getTime()) ? d : undefined;
    }
    return undefined;
  }, [date]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "w-auto justify-start text-left font-normal h-auto p-0 border-none bg-transparent hover:bg-transparent",
            !validDate && "text-muted-foreground",
            className
          )}
          disabled={disabled}
        >
          {validDate ? format(validDate, "dd/MM/yy", { locale: es }) : <span className="text-gray-400">{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 bg-card border-border" align="start">
        <CustomCalendar
          selected={validDate}
          onSelect={onDateChange}
          defaultMonth={validDate}
          className="bg-card"
        />
      </PopoverContent>
    </Popover>
  )
}
