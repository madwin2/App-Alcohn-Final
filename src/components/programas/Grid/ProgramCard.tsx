import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Edit, Trash2, Eye } from 'lucide-react';
import { Program } from '@/lib/types/index';

interface ProgramCardProps {
  program: Program;
}

// Tarjeta individual para mostrar información de un programa
export function ProgramCard({ program }: ProgramCardProps) {
  return (
    <Card className="hover:shadow-lg transition-shadow duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <CardTitle className="text-lg font-semibold line-clamp-2">
            {program.name}
          </CardTitle>
          <Badge variant={program.status === 'active' ? 'default' : 'secondary'}>
            {program.status === 'active' ? 'Activo' : 'Inactivo'}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground line-clamp-2">
            {program.description}
          </p>
          
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Versión:</span>
            <span className="font-medium">{program.version}</span>
          </div>
          
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Última actualización:</span>
            <span className="font-medium">{program.lastUpdated}</span>
          </div>
        </div>
        
        <div className="flex gap-2 pt-2">
          <Button variant="outline" size="sm" className="flex-1">
            <Eye className="h-4 w-4 mr-1" />
            Ver
          </Button>
          <Button variant="outline" size="sm">
            <Edit className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
