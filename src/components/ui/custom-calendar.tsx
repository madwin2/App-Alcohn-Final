import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, addMonths, subMonths } from "date-fns"
import { es } from "date-fns/locale"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface CustomCalendarProps {
  selected?: Date
  onSelect?: (date: Date | undefined) => void
  defaultMonth?: Date
  className?: string
}

export function CustomCalendar({
  selected,
  onSelect,
  defaultMonth = new Date(),
  className
}: CustomCalendarProps) {
  const [currentMonth, setCurrentMonth] = React.useState(defaultMonth)

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(monthStart)
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 })
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 })

  const dateFormat = "d"
  const rows = []

  let days = []
  let day = startDate

  const daysOfWeek = ['lu', 'ma', 'mi', 'ju', 'vi', 'sá', 'do']

  while (day <= endDate) {
    for (let i = 0; i < 7; i++) {
      const cloneDay = day
      days.push(
        <div
          key={day.toString()}
          className={cn(
            "h-9 w-9 flex items-center justify-center text-sm cursor-pointer rounded-md hover:bg-accent hover:text-accent-foreground",
            !isSameMonth(day, monthStart) && "text-muted-foreground opacity-50",
            isSameDay(day, selected || new Date()) && "bg-primary text-primary-foreground",
            isSameDay(day, new Date()) && !isSameDay(day, selected || new Date()) && "bg-accent text-accent-foreground"
          )}
          onClick={() => onSelect?.(cloneDay)}
        >
          {format(day, dateFormat)}
        </div>
      )
      day = addDays(day, 1)
    }
    rows.push(
      <div key={day.toString()} className="flex w-full">
        {days}
      </div>
    )
    days = []
  }

  const nextMonth = () => {
    setCurrentMonth(addMonths(currentMonth, 1))
  }

  const prevMonth = () => {
    setCurrentMonth(subMonths(currentMonth, 1))
  }

  return (
    <div className={cn("p-3", className)}>
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="outline"
          size="sm"
          onClick={prevMonth}
          className="h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-sm font-medium">
          {format(currentMonth, "MMMM yyyy", { locale: es })}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={nextMonth}
          className="h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      
      <div className="w-full">
        {/* Días de la semana */}
        <div className="flex w-full mb-2">
          {daysOfWeek.map((day) => (
            <div key={day} className="w-9 text-center text-xs text-muted-foreground font-normal">
              {day}
            </div>
          ))}
        </div>
        
        {/* Fechas */}
        <div className="space-y-1">
          {rows}
        </div>
      </div>
    </div>
  )
}
