Tablas que necesitamos:

CLIENTES:
-Nombre
-Apellido
-id cliente
-medio de contacto (Whatsapp, Facebook, Instagram, Mail)
-telefono
-dni
-mail
-direccion? no se si esto va. si hay que ponerle una referencia de que la direccion que tiene en la tabla direcciones. O si directamente se agrega en esa tabla.

DIRECCIONES:
-direccion id
-activa (bool)
-codigo postal
-provincia
-localidad
-cliente id ? Aca esta la duda, si se linkea aca con el cliente o en la tabla cientes se hace el link? o en ambos.
-domicilio
-nombre
-apellido
-telefono
-dni

ORDENES:
-cliente id
-empresa envio (Andreani, Correo Argentino, Via Cargo, Retiro)
-tipo de envio (Domicilio, Sucursal, Retiro)
-cantidad de sellos (Supabase tiene que hacer la cuenta automatica de todos los sellos que tienen asignados en esta orden)
-seña total (tiene que sumar el valor de seña de todos los sellos que estan asignados en esta orden)
-valor total (tiene que sumar el valor de todos los sellos que estan asignados en esta orden)
-restante (tiene que hacer la cuenta de el valor total - el valor total de la seña)
-seguimiento
-estado de orden (Señado, Hecho, Foto, Transferido, Hacer Etiqueta, Etiqueta Lista, Despachado, Seguimiento Enviado)
-fecha
-estado de envio (Sin envio, Hacer Etiqueta, Etiqueta Lista, Despachado, Seguimiento Enviado)

SELLOS:
-fecha
-tipo (Clasico, 3mm, Lacre, Alimento, ABC)
-seña
-fecha limite
-diseño
-nota
-valor
-restante
-estado de fabricacion (Sin Hacer, Haciendo, Hecho, Rehacer, Retocar, Prioridad, Verificar)
-estado de venta (Señado, Foto, Transferido)
-archivo base (link al bucket)
-foto sello (link al bucket)
-tipo de planchuela (100, 63, 38, 25, 19, 12)
-tiempo
-maquina (C, G, XL, ABC, Circular)
-largo real
-ancho real
-programa (programa que tiene linkeado)

PROGRAMA:
-fecha
-nombre
-cantidad de sellos (suma automaticamente todos los sellos linkeados al programa)
-maquina (C, G, XL, ABC, Circular)
-estado de fabricacion (Sin Hacer, Haciendo, Hecho, Verificado, Rehacer)
-tiempo maximo
-largo usado 63
-largo usado 38
-largo usado 25
-largo usado 19
-largo usado 12
-verificado (bool)

COSTOS DE ENVIO:
-empresa (Andreani, Correo Argentino, Via Cargo)
-servicio (Domicilio, Sucursal)
-costo
-activo desde
-id
-activo (bool)