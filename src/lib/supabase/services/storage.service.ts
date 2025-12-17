import { supabase } from '../client';

export type BucketType = 'base' | 'vector' | 'foto';

/**
 * Sube un archivo a un bucket de Supabase Storage
 * @param bucket - Nombre del bucket ('base', 'vector', o 'foto')
 * @param file - Archivo a subir
 * @param path - Ruta dentro del bucket (ej: 'ordenes/123/sello-base.jpg')
 * @returns URL pública del archivo subido
 */
export const uploadFile = async (
  bucket: BucketType,
  file: File,
  path: string
): Promise<string> => {
  try {
    // Primero intentar eliminar el archivo si existe (para evitar conflictos)
    await supabase.storage
      .from(bucket)
      .remove([path])
      .catch(() => {
        // Ignorar errores si el archivo no existe
      });

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: true // Permitir sobrescribir archivos existentes
      });

    if (error) {
      console.error(`Supabase storage error:`, error);
      throw error;
    }

    if (!data) {
      throw new Error('No data returned from upload');
    }

    // Obtener la URL pública del archivo
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(data.path);

    return urlData.publicUrl;
  } catch (error) {
    console.error(`Error uploading file to ${bucket}:`, error);
    throw error;
  }
};

/**
 * Sube un archivo sobrescribiendo si ya existe
 * @param bucket - Nombre del bucket
 * @param file - Archivo a subir
 * @param path - Ruta dentro del bucket
 * @returns URL pública del archivo subido
 */
export const uploadFileOverwrite = async (
  bucket: BucketType,
  file: File,
  path: string
): Promise<string> => {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: true // Sobrescribir archivos existentes
      });

    if (error) throw error;

    // Obtener la URL pública del archivo
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(data.path);

    return urlData.publicUrl;
  } catch (error) {
    console.error(`Error uploading file to ${bucket}:`, error);
    throw error;
  }
};

/**
 * Elimina un archivo de un bucket
 * @param bucket - Nombre del bucket
 * @param path - Ruta del archivo a eliminar
 */
export const deleteFile = async (
  bucket: BucketType,
  path: string
): Promise<void> => {
  try {
    const { error } = await supabase.storage
      .from(bucket)
      .remove([path]);

    if (error) throw error;
  } catch (error) {
    console.error(`Error deleting file from ${bucket}:`, error);
    throw error;
  }
};

/**
 * Obtiene el path del archivo desde su URL pública
 * @param url - URL pública del archivo
 * @param bucket - Nombre del bucket
 * @returns Path del archivo en el bucket
 */
export const getFilePathFromUrl = (url: string, bucket: BucketType): string | null => {
  try {
    // La URL de Supabase Storage tiene el formato:
    // https://[project].supabase.co/storage/v1/object/public/[bucket]/[path]
    const urlPattern = new RegExp(`/storage/v1/object/public/${bucket}/(.+)$`);
    const match = url.match(urlPattern);
    return match ? decodeURIComponent(match[1]) : null;
  } catch (error) {
    console.error('Error extracting file path from URL:', error);
    return null;
  }
};

/**
 * Descarga un archivo desde su URL
 * @param url - URL del archivo a descargar
 * @param filename - Nombre del archivo para la descarga
 */
export const downloadFile = async (url: string, filename: string): Promise<void> => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Error al descargar el archivo');
    }
    
    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
  } catch (error) {
    console.error('Error downloading file:', error);
    throw error;
  }
};

/**
 * Obtiene la URL pública de un archivo
 * @param bucket - Nombre del bucket
 * @param path - Ruta del archivo
 * @returns URL pública del archivo
 */
export const getPublicUrl = (
  bucket: BucketType,
  path: string
): string => {
  const { data } = supabase.storage
    .from(bucket)
    .getPublicUrl(path);

  return data.publicUrl;
};

/**
 * Convierte un archivo EPS a PNG usando CloudConvert API v2
 * @param file - Archivo EPS a convertir
 * @returns Blob del PNG convertido
 */
const convertEpsToPng = async (file: File): Promise<Blob> => {
  const CLOUDCONVERT_API_KEY = import.meta.env.VITE_CLOUDCONVERT_API_KEY || '';
  
  if (!CLOUDCONVERT_API_KEY) {
    throw new Error('CloudConvert API key no configurada');
  }

  try {
    // Paso 1: Crear job de conversión con la estructura correcta de API v2
    const createJobResponse = await fetch('https://api.cloudconvert.com/v2/jobs', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CLOUDCONVERT_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tasks: {
          'import-1': {
            operation: 'import/upload',
            filename: file.name,
          },
          'task-1': {
            operation: 'convert',
            input: 'import-1',
            output_format: 'png',
            options: {
              quality: 90,
              density: 300,
            },
          },
          'export-1': {
            operation: 'export/url',
            input: 'task-1',
          },
        },
      }),
    });

    if (!createJobResponse.ok) {
      const errorText = await createJobResponse.text();
      let errorMessage = 'Error desconocido';
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.message || errorData.error?.message || errorText;
        
        // Mensaje más específico para errores de scope
        if (errorMessage.includes('scope') || errorMessage.includes('Invalid scope')) {
          errorMessage = 'La API key de CloudConvert no tiene los permisos necesarios. Por favor, verifica que la API key tenga acceso a operaciones de conversión.';
        }
      } catch {
        errorMessage = errorText;
      }
      throw new Error(`Error creando job: ${errorMessage}`);
    }

    const jobData = await createJobResponse.json();
    
    if (!jobData.data || !jobData.data.id) {
      throw new Error('Respuesta inválida de CloudConvert');
    }

    const jobId = jobData.data.id;
    
    // Paso 2: Obtener la URL de upload
    const importTask = jobData.data.tasks.find((t: any) => t.name === 'import-1');
    if (!importTask || !importTask.result || !importTask.result.form) {
      throw new Error('No se pudo obtener la información de upload');
    }

    const uploadUrl = importTask.result.form.url;
    const uploadParams = importTask.result.form.parameters;

    // Paso 3: Subir el archivo
    const uploadFormData = new FormData();
    Object.keys(uploadParams).forEach(key => {
      uploadFormData.append(key, uploadParams[key]);
    });
    uploadFormData.append('file', file);

    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      body: uploadFormData,
    });

    if (!uploadResponse.ok) {
      throw new Error('Error subiendo archivo a CloudConvert');
    }

    // Paso 4: Esperar a que termine la conversión (polling)
    let jobStatus = jobData.data;
    let attempts = 0;
    const maxAttempts = 60; // Máximo 60 segundos de espera

    while ((jobStatus.status === 'waiting' || jobStatus.status === 'processing') && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
      
      const statusResponse = await fetch(`https://api.cloudconvert.com/v2/jobs/${jobId}`, {
        headers: {
          'Authorization': `Bearer ${CLOUDCONVERT_API_KEY}`,
        },
      });

      if (!statusResponse.ok) {
        const errorText = await statusResponse.text();
        throw new Error(`Error consultando estado: ${errorText}`);
      }

      const statusData = await statusResponse.json();
      jobStatus = statusData.data;
    }

    if (jobStatus.status !== 'finished') {
      throw new Error(`La conversión falló con estado: ${jobStatus.status}`);
    }

    // Paso 5: Obtener la URL del archivo convertido
    const exportTask = jobStatus.tasks.find((t: any) => t.name === 'export-1');
    if (!exportTask || !exportTask.result || !exportTask.result.files || exportTask.result.files.length === 0) {
      throw new Error('No se pudo obtener la URL del archivo convertido');
    }

    const exportUrl = exportTask.result.files[0].url;
    
    if (!exportUrl) {
      throw new Error('URL de exportación no disponible');
    }

    // Paso 6: Descargar el PNG convertido
    const pngResponse = await fetch(exportUrl);
    if (!pngResponse.ok) {
      throw new Error('Error descargando el PNG convertido');
    }

    return await pngResponse.blob();
  } catch (error) {
    console.error('Error en convertEpsToPng:', error);
    throw error;
  }
};

/**
 * Sube un archivo vector y genera preview PNG si es EPS
 * @param bucket - Nombre del bucket
 * @param file - Archivo a subir
 * @param path - Ruta dentro del bucket
 * @returns Objeto con URL del archivo original y preview (si aplica)
 */
export const uploadVectorFileWithPreview = async (
  bucket: BucketType,
  file: File,
  path: string
): Promise<{ originalUrl: string; previewUrl?: string }> => {
  // Subir archivo original
  const originalUrl = await uploadFile(bucket, file, path);

  // Si es EPS, generar preview PNG
  const isEps = file.name.toLowerCase().endsWith('.eps');
  let previewUrl: string | undefined;

  if (isEps) {
    try {
      const pngBlob = await convertEpsToPng(file);
      const pngFile = new File([pngBlob], file.name.replace(/\.eps$/i, '.png'), { type: 'image/png' });
      const previewPath = path.replace(/\.eps$/i, '_preview.png');
      previewUrl = await uploadFile(bucket, pngFile, previewPath);
    } catch (error) {
      console.error('Error generando preview EPS:', error);
      // Continuar sin preview si falla la conversión
    }
  }

  return { originalUrl, previewUrl };
};

/**
 * Genera un nombre de archivo único basado en el ID de la orden y el tipo
 * @param orderId - ID de la orden
 * @param stampId - ID del sello (opcional)
 * @param type - Tipo de archivo ('base', 'vector', 'foto')
 * @param originalFileName - Nombre original del archivo
 * @returns Ruta completa para el archivo
 */
export const generateFilePath = (
  orderId: string,
  type: BucketType,
  originalFileName: string,
  stampId?: string
): string => {
  const timestamp = Date.now();
  const extension = originalFileName.split('.').pop() || 'bin';
  const baseName = originalFileName.split('.').slice(0, -1).join('.') || 'file';
  const sanitizedName = baseName.replace(/[^a-zA-Z0-9]/g, '_');
  
  if (stampId) {
    return `ordenes/${orderId}/sellos/${stampId}/${type}_${sanitizedName}_${timestamp}.${extension}`;
  }
  
  return `ordenes/${orderId}/${type}_${sanitizedName}_${timestamp}.${extension}`;
};

