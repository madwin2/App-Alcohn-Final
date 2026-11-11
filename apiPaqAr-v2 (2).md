

Correo Argentino – Plataforma de Integración – Api 2.0  Manual de Usuario
## _________________________________________________________________________
## 1                                                          Abril  2023


Correo Argentino-Plataforma de Integración-
## API 2.0



## Índice
## Índice 1
## Introducción 2
## Objetivo 2
Historial de Cambios 2
## Acceso Inicial 2
Descripción de los servicios 3
Validar credenciales - Autenticación 3
Alta de orden o pedido 6
Cancelación orden o pedido 18
Obtener rótulo de orden o pedido 21
Consultar historial de una orden o pedido 28
Consulta sucursales de Correo Argentino 33












Correo Argentino – Plataforma de Integración – Api 2.0  Manual de Usuario
## _________________________________________________________________________
## 2                                                          Abril  2023


## Introducción

El presente documento describe los servicios disponibilizados para los clientes de Correo
Argentino a través de la Api Paq.ar

Consumiendo los servicios de Correo Argentino el cliente podrá integrar su proceso
de venta online resolviendo la logística del comercio electrónico. Podrá  tanto generar
acciones  (alta  de  una  orden,  cancelarla,  etc.)  como  hacer  consultas  (historial  de
pedidos, listado de sucursales y otras).

## Objetivo
Presentar la documentación detallada de cada uno de los servicios.

Historial de Cambios

## Versión Fecha Modificación
1.0 Enero 2023 Emisión inicial
1.1 Febrero 2023 Inclusión versión en la URL
1.2 Abril 2023 Inclusión URL PROD y TEST exteriorizadas

## Acceso Inicial

URL Producción: https://***

URL Test: https://***



Correo Argentino – Plataforma de Integración – Api 2.0  Manual de Usuario
## _________________________________________________________________________
## 3                                                          Abril  2023

Descripción de los servicios

Validar credenciales - Autenticación
Para  poder  utilizar  cualquier  endpoint de  esta  API  debes verificarse primero  si se
cuenta con credenciales válidas ejecutando este servicio.
Las credenciales se componen de id de agreement (código de acuerdo comercial) y
API-Key.
La gestión de estas se hace previamente con el área Comercial de Correo Argentino.
URLs exteriorizadas:

URL Test:                    https://apitest.correoargentino.com.ar/paqar/v1/<endpoint>
URL Producción:       https://api.correoargentino.com.ar/paqar/v1/<endpoint>

Método: GET
Pre-Requisitos
- Tener acceso a los servicios de la plataforma
- Tener id de agreement (acuerdo comercial) y API-Key
















Correo Argentino – Plataforma de Integración – Api 2.0  Manual de Usuario
## _________________________________________________________________________
## 4                                                          Abril  2023


Validar credenciales - Autenticación
Validar credenciales de acceso al gateway
endpoint
## <host>/v1/auth
header
"authorization”: “Apikey <Key>"
## "agreement": "string"
metodo GET
## Posibles
responses
## 204 - Ok
400 - Bad request
## 401 - Unauthorized
## Ejemplo Error
responses
## 401 - Unauthorized.
## {
"timestamp": "2022-06-05T18:54:07Z",
## "status": 401,
"error": "Account not found by apiKey",
"message": "Account not found by apiKey",
## "path": "/v1/auth"
## }
400 - Bad request.
## {
"timestamp": "2021-09-13T12:52:48-3:00",
## "status": 400,
"error": "Bad request",
## "message":"<message>",
## "path": "/v1/auth"
## }
Donde el campo ‘message’ puede ser vacío en caso que el código de
error sea lo suficientemente descriptivo.

Ejemplo de llamada




Correo Argentino – Plataforma de Integración – Api 2.0  Manual de Usuario
## _________________________________________________________________________
## 5                                                          Abril  2023

Validar credenciales - Autenticación
Validar credenciales de acceso al gateway
endpoint localhost:8080/v1/auth
header
"authorization”: “Apikey <Key>"
## "agreement": “18017"
método GET
Ejemplo de respuesta
Success response: Status 204



Correo Argentino – Plataforma de Integración – Api 2.0  Manual de Usuario
## _________________________________________________________________________
## 6                                                          Abril  2023

Alta de orden o pedido

Las órdenes son pedidos a Correo Argentino para hacer entregas de productos de
clientes.
Deben asignarse a una sucursal válida de Correo Argentino.
Endpoint utilizado  para  generar  el  alta  de  una  nueva  orden  o  pedido  que  debe
gestionar Correo Argentino para distribuir los productos del cliente.

Pre-Requisitos
- Tener acceso a los servicios de la plataforma
- Tener agreement y V1-Key validos
URL Producción: https://***
URL QA: https://***

Método: POST


AltaOrden
Put para dar de alta order
endpoint <host>/v1/orders
header
"Authorization": "Apikey <Key>",
## “agreement”: “string”
método POST

Correo Argentino – Plataforma de Integración – Api 2.0  Manual de Usuario
## _________________________________________________________________________
## 7                                                          Abril  2023

## Data

## {
"sellerId": "string",
"trackingNumber":"string",
## "order":{
"senderData":{
## "id": "string",
"businessName":"string",
"areaCodePhone":"string",
"phoneNumber":"string",
"areaCodeCellphone":"string",
"cellphoneNumber":"string",
## "email":"string",
## "observation":"string",
## "address":{
"streetName":"string",
"streetNumber":"string",
"cityName":"string",
## "floor":"string",
## "department":"string",
## "state":"string",
"zipCode":"string"
## }
## },
"shippingData":{
## "name":"string",
"areaCodePhone":"string",
"phoneNumber":"string",
"areaCodeCellphone":"string",
"cellphoneNumber":"string",
## "email":"string",
## "observation":"string",
## "address":{
"streetName":"string",
"streetNumber":"string",
"cityName":"string",
## "floor":"string",
## "department":"string",
## "state":"string",
"zipCode":"string"
## }
## },
## "parcels": [
## {
## "dimensions": {
## "height": "string",
## "width": "string",
## "depth": "string"
## },
"productWeight": "string",
"productCategory": "string",
"declaredValue": "string"
## },
## ],
"deliveryType":"string",

Correo Argentino – Plataforma de Integración – Api 2.0  Manual de Usuario
## _________________________________________________________________________
## 8                                                          Abril  2023

"agencyId": "string",
"saleDate":"string",
"shipmentClientId": "string",
"serviceType": "string",
## }
## }

Ejemplo de llamada
AltaOrden
Put para dar de alta order
endpoint localhost:8080/v1/orders
header
"Authorization": "Apikey <Key>",
## “agreement”: “18017”
método POST



Correo Argentino – Plataforma de Integración – Api 2.0  Manual de Usuario
## _________________________________________________________________________
## 9                                                          Abril  2023

## Success
response:
## Ejemplo
## {
"idSeller": "1",
"trackingNumber":"3333007773",
"senderData":{
## "id": 5,
"businessName":"string",
"areaCodePhone":"miarea_tel",
"phoneNumber":"mitelef",
"areaCodeCellphone":"miarea_telefono_celular",
"cellphoneNumber":"micelular",
"email":"Suemail",
"observation":"Suobservacion",
## "address":{
"streetName":"Sucalle",
"streetNumber":"Sualtura",
"cityName":"Su localidad",
"floor":"Supiso",
"department":"Sudepartamento",
"state":"Suprovincia",
"zipCode":"codigoPostal",
## }
## },
"shippingData":{
"name":"Comprador",
"areaCodePhone":"miarea_tel",
"phoneNumber":"mitelef",
"areaCodeCellphone":"miarea_telefono_celular",
"cellphoneNumber":"micelular",
## "email":"mimail@gmail.com",
"observation":"esto es una observacion de
ejemplo",
## "address":{
"streetName":"micalle",
"streetNumber":"mialtura",
"cityName":"milocalidad",
## "floor":"mipiso",
## "department":"midepto",
## "state":"miprov",
"zipCode":"codigoPostal",
## }
## },

## "parcels": [
## {

## "dimensions": {
## "height": "100",
## "width": "40",
## "depth": "60"
## },
"productWeight": "2000",
"productCategory": "categoria ejemplo",
"declaredValue": "8000"
## },

Correo Argentino – Plataforma de Integración – Api 2.0  Manual de Usuario
## _________________________________________________________________________
## 10                                                          Abril  2023

## ],
"deliveryType":"homeDelivery",
"agencyId": "",
"saleDate":"2021-05-31T21:14:11-03:00",
"serviceType": "CP",
"shipmentClientId": "",
## }
## }

## Posibles
## Responses
## 200 - Ok
400 - Bad request
## 401 - Unauthorized
## 403 - Forbidden

Correo Argentino – Plataforma de Integración – Api 2.0  Manual de Usuario
## _________________________________________________________________________
## 11                                                          Abril  2023

## Ejemplo Error
## Responses
## 403 - Forbidden
## {
"timestamp": "2022-06-06T13:09:07Z",
## "status": 403,
"error": "Forbidden",
"message": "Access Denied",
## "path": "/v1/agencies"
## }

## 401 - Unauthorized
## {
"timestamp": "2021-09-13T12:52:48-3:00",
## "status": 401,
"error": "Unauthorized",
## "message":"<message>",
## "path": "/v1/orders"
## }

400 - Bad request
## {
"timestamp": "2021-09-13T13:51:45-3:00",
## "status": 400,
"error": "Bad request",
## "message":"<message>",
## "path": "/v1/orders"
## }
Donde el campo ‘message’ puede ser vacio en caso que el codigo de error
sea lo suficientemente descriptivo
Ejemplo error:

## {
"timestamp": "2021-09-13T13:51:45-3:00",
## "status": 400,
"error": "Bad request",
"message":"Conversion failed when converting the
varchar value '10d00' to data type int",
## "path": "/v1/orders"
## }


Correo Argentino – Plataforma de Integración – Api 2.0  Manual de Usuario
## _________________________________________________________________________
## 12                                                          Abril  2023


Códigos de provincia
## Código Nombre
## A
## Salta
## B
Provincia de Buenos Aires
## C
Ciudad Autónoma de Buenos Aires
## D
## San Luis
## E
## Entre Ríos
## F
## La Rioja
## G
Santiago del Estero
## H
## Chaco
## J
## San Juan
## K
## Catamarca
## L
## La Pampa
## M
## Mendoza
## N
## Misiones
## P
## Formosa
## Q
## Neuquén
## R
## Río Negro
## S
## Santa Fe
## T
## Tucumán
## U
## Chubut
## V
Tierra del Fuego
## W
## Corrientes
## X
## Córdoba
## Y
## Jujuy
## Z
## Santa Cruz


Correo Argentino – Plataforma de Integración – Api 2.0  Manual de Usuario
## _________________________________________________________________________
## 13                                                          Abril  2023

idCliente/acuerdo → agreement
## Contexto:
Identificador del acuerdo del cliente Vendedor que quiere dar de alta una orden o pedido.
Este campo define qué acuerdo maneja el cliente con Correo Argentino, el servicio
ofrecido, facturación, etc
ej:. "agreement": 18018,
- Dato obligatorio

sellerId
Contexto: está relacionado directamente con el idCliente y está relacionado con los clientes
tipo marketplace que a su vez tienen otro código seller interno.
- No es obligatoria su carga pero en caso que no se lo cargue se debe completar con
idCliente, acuerdo o agreement
- Acepta todo tipo de caracteres
- Acepta un máximo de 30 caracteres, ignorando el excedente
trackingNumber
## Contexto:
Identificador UNICO (TN) que se le da al paquete, puede ser generado por Correo
Argentino para algunos clientes o lo envía el cliente seller en un formato/longitud
específico previamente definido.
- No es obligatoria su carga pero en caso que no se cargue el servicio se encargará de
generar uno y lo informará en la respuesta del servicio (siempre que se genere una
orden satisfactoriamente se informará su TN en la respuesta del servicio)
- Acepta un máximo de 30 caracteres, ignorando el excedente
- Los TN son únicos y no pueden duplicarse
- Acepta todo tipo de caracteres
senderData
## Contexto:
Todos los datos del remitente del producto, son datos del cliente del primer campo de esta
lista (Un cliente puede tener más de un remitente).

Correo Argentino – Plataforma de Integración – Api 2.0  Manual de Usuario
## _________________________________________________________________________
## 14                                                          Abril  2023

Los datos de senderData no tienen longitudes definidas
- Nombre → name
o obligatorio.
- celular → cellphoneNumber,
o No obligatorio
- ‘areaCelular' → areaCodeCellphone, código de área para el teléfono celular, este
campo se va a concatenar al campo ‘celular’
o No obligatorio
- areaTelefono → areaCodePhone,
o No obligatorio
- telefono → phoneNumber,
o No obligatorio
- Email → email,
o No obligatorio
- Observacion → observation,
o No obligatorio
- codigoPostal → zipCode,
o Obligatorio. Se valida con el código de provincia.
- calle → streetName,
o Obligatorio
- altura → streetNumber,
o Obligatorio
- localidad → cityName
o Obligatorio
- provincia → state, (Código provincia, ver tabla para valores validos.)
o Obligatorio
- Piso → floor,
o No obligatorio
- departamento → department,
o No obligatorio
shippingData
## Contexto:
Todos los datos del destinatario / Cliente comprador
Los datos de shippingData no tienen definido máximos de caracteres
- En caso de que sea un deliveryType diferente a ‘homeDelivery’ solo es requerido
que se completen los datos personales del destinatario. Estos son Nombre, apellido,
(Estos datos siempre son requeridos).
- Nombre → name
o Obligatorio.
- celular → cellphoneNumber

Correo Argentino – Plataforma de Integración – Api 2.0  Manual de Usuario
## _________________________________________________________________________
## 15                                                          Abril  2023

o No obligatorio
- ‘areaCelular' → areaCodeCellphone, Se concatena al celular
‘areaCelular’ + ‘celular’ → ‘celular’
o No obligatorio
- areaTelefono → areaCodePhone,
o No obligatorio
- telefono → phoneNumber,
o No obligatorio
- Email → email,
o No obligatorio
- Observacion → observation,
o No obligatorio
- codigoPostal → zipCode,
o Obligatorio. Se valida con el dato de provincia.
- calle → streetName,
o Obligatorio
- altura → streetNumber,
o Obligatorio
- localidad → cityName
o Obligatorio
- provincia → state, (Código provincia, ver tabla para valores válidos.)
o Obligatorio
- Piso → floor,
o No obligatorio
- departamento → department,
o No obligatorio
Array de productos ‘parcels’
IMPORTANTE: Solo tomará un producto, en caso de cargar más de uno en este
array solo se toma y transforma el primero recibido en el array y se ignoran los
siguientes.

productWeight
## Contexto:
Espacio para agregar el peso de los productos
- Acepta un máximo de 5 dígitos numéricos (99999), Corresponde al valor de peso en
gramos
- Depende del cliente el peso aceptado puede ser menor al máximo de dígitos Ej.:
para cliente 18018 el máximo es 25000
## • Obligatorio

Correo Argentino – Plataforma de Integración – Api 2.0  Manual de Usuario
## _________________________________________________________________________
## 16                                                          Abril  2023


dimensions
## Contexto
Información de las dimensiones de los paquetes enviados
- Algunos clientes solo aceptan valores menores a 255 cm
- Alto → height
o Obligatorio
o Solo valores numéricos
o Máximo 3 caracteres
- Ancho → width, ancho del producto
o Obligatorio
o Solo valores numéricos
o Máximo 3 caracteres
- Largo → depth, largo del producto
o Obligatorio
o Solo valores numéricos
o Máximo 3 caracteres
declaredValue
## Contexto:
Brinda la posibilidad al cliente vendedor de declarar en valor de su venta en la order
## • Es Obligatorio
- Solo valores numéricos
deliveryType
## Contexto:
Campo para informar que tipo de entrega usa el cliente para con el cliente comprador, retiro
en sucursal, retiro en locker o retiro en domicilio.
## • Obligatorio
El input acepta la palabra completa para que sea más descriptivo para el cliente. Se valida
que el cliente vendedor cargue específicamente los siguientes datos, caso contrario se
recibirá un mensaje de error - tipoEntrega invalido.
Solo acepta los siguientes valores:

Correo Argentino – Plataforma de Integración – Api 2.0  Manual de Usuario
## _________________________________________________________________________
## 17                                                          Abril  2023

- ‘agency’ - 'S' en el servicio soap de paq.ar
- ‘locker' - 'B' en el servicio soap de paq.ar
- ‘homeDelivery’ - 'D' en el servicio soap de paq.ar
agencyId
## Contexto:
Información de Sucursal o locker donde el paquete será enviado para que el cliente
comprador lo retire
- Se envía código de sucursal (Planta) obtenido de otro servicio. Cada cliente tiene
que hacer la consulta porque no todos tienen todas las sucursales habilitadas.
- Se valida que dicha sucursal este habilitada al momento del alta de la order.
- No obligatorio/requerido cuando deliveryType es ‘homeDelivery’
saleDate
## Contexto:
Fecha en la que el cliente Vendedor realizó la venta.
## • Obligatorio
- Se valida que tenga formato de fecha, Formato: "YYYY-MM-DDTHH:mm:ss-03:00”
serviceType
## Contexto:
El tipo de producto es la calidad de servicio solicitado, existe distintos niveles de calidad de
servicio a solicitar y se informan en este campo.
## • Obligatorio
- String de dos letras(2) máximo,
idPiezaCliente → shipmentClientId
## Contexto:
Este campo debe identificar a la orden de solicitud de forma univoca, desde la perspectiva
del cliente
## Detalle:
- No obligatorio

Correo Argentino – Plataforma de Integración – Api 2.0  Manual de Usuario
## _________________________________________________________________________
## 18                                                          Abril  2023

- Dato no funcional en la versión inicial del servicio debido a que es un wrapper del
servicio soap de paq.ar

Cancelación orden o pedido
Endpoint para dar de baja una orden o pedido generado en la plataforma de Correo
## Argentino.
Pre-Requisitos
- Tener acceso a los servicios de la plataforma
- Tener agreement y API-Key validos
- Tener preimposicion dada de alta
URL Producción: https://***
URL QA: https://***

Método: PATCH

cancelarOrder
Servicio para cancelar una preimposicion
endpoint
<host>/v1/orders/{trackingNumber}/cancel
header
"Authorization": "Apikey <Key>",
## “agreement”: “string”
variables en url
"trackingNumber":"string"
metodo PATCH
body
## Success
response
200 - ok
{"codigo" :200, "mensaje" : "Tracking Number: 12 –
Description: Pedido Cancelado - No fue impuesto"}


Correo Argentino – Plataforma de Integración – Api 2.0  Manual de Usuario
## _________________________________________________________________________
## 19                                                          Abril  2023

## Posibles
responses
## 200 - Ok
400 - Bad request
## 401 - Unauthorized
## 403 - Forbidden
## Ejemplo Error
## Responses
## 403 - Forbidden
## {
"timestamp": "2022-06-06T14:29:18Z",
## "status": 403,
"error": "Forbidden",
"message": "Access Denied",
## "path": "/v1/orders/{tn}/cancel"
## }
## 401 - Unauthorized
## {
"timestamp": "2021-09-13T12:52:48-3:00",
## "status": 401,
"error": "Unauthorized",
## "message":"<message>",
## "path": "/v1/order{tn}/cancel"
## }
400 - Bad request
## {
"timestamp": "2021-09-13T13:51:45-3:00",
## "status": 400,
"error": "Bad request",
## "message":"<message>",
## "path": "/v1/order{tn}/cancel"
## }
Donde el campo ‘message’ puede ser vacío en caso que el código de error
sea lo suficientemente descriptivo
Ejemplo error:

## {
"timestamp": "2021-09-13T13:51:45-3:00",
## "status": 400,
"error": "Bad request",
"message":"Datos Invalidos Campo Codigo Cliente se
encuentra vacio",
## "path": "/v1/order{tn}/cancel"
## }


Correo Argentino – Plataforma de Integración – Api 2.0  Manual de Usuario
## _________________________________________________________________________
## 20                                                          Abril  2023

Validaciones y definiciones

agreement
- Dato obligatorio
trackingNumber
-  Se requiere que el trackingNumber sea válido (Exista una orden o pedido
previamente generado con su respectivo trackingNumber y el valor informado en el
trackingNumber ingresado en el servicio deben corresponderse para ser válido).
- Dato obligatorio
Ejemplo de llamada
## Cancelar Orden
Servicio para cancelar una preimposición
endpoint localhost:8080/v1/orders/:trackingNumber/cancel
header
"Authorization": "Apikey <Key>",
## “agreement”: “18017”
método PATCH
variables en url
"trackingNumber":"1801740CPTLEL9A501"
Ejemplo de respuesta
## Success
response
200 - ok
{"codigo" :200, "mensaje" : "Tracking Number: 12 –
Description: Pedido Cancelado - No fue impuesto"}








Correo Argentino – Plataforma de Integración – Api 2.0  Manual de Usuario
## _________________________________________________________________________
## 21                                                          Abril  2023


Obtener rótulo de orden o pedido

Este  endpoint permite  obtener  el  rótulo  de  un  determinado  Tracking  Number  en
formato .pdf
Pre-Requisitos

- Tener acceso a los servicios de la plataforma
- Tener agreement y API-Key validos
- Tener orden dada de alta
- Tener el TN (Tracking Number) para informarlo en el servicio

URL Producción: https://***
URL QA: https://***

Método: POST

obtenerRotulo
Servicio para obtener rotulo de un pedido / trackingNumber
endpoint <host>/v1/labels
header
"Authorization": "Apikey <Key>",
## “agreement”: “string”
parametros
"labelFormat": “10x15”
metodo POST (Cambio a partir de la version 1.3, antes GET)

Correo Argentino – Plataforma de Integración – Api 2.0  Manual de Usuario
## _________________________________________________________________________
## 22                                                          Abril  2023

body

## [
## {
"sellerId": "string",
"trackingNumber": "string"
## },
## {
"sellerId": "string",
trackingNumber: "string"
## },
## {
"sellerId": "string",
"trackingNumber": "string"
## }
## ]

Correo Argentino – Plataforma de Integración – Api 2.0  Manual de Usuario
## _________________________________________________________________________
## 23                                                          Abril  2023

## Success
response
## Formato
## [
## {
"trackingNumber": "string",
"fileBase64": "string",
"fileName": "string",
## "result": "string",
## },
## {
"trackingNumber": "string",
"fileBase64": "string",
"fileName": "string",
## "result": "string",
## },
## {
"trackingNumber": "string",
"fileBase64": "string",
"fileName": "string",
## "result": "string"
## }
## ]

## [
## {
"trackingNumber": "trackingEjemplo1",
"fileBase64":
"AVBERiOxLjcKJeLjz9MKNiAwIG9iago8PCAvVHlwZSAvUGFnZSAvUGFyZW",
"fileName": "18018_18018_1235235.pdf",
"result": "OK",
## },
## {
"trackingNumber": "trackingEjemplo2",
"fileBase64":
"BVBERiOxLjcKJeLjz9MKNiAwIG9iago8PCAvVHlwZSAvUGFnZSAvUGFyZW",
"fileName": "18018_18018_2235235.pdf",
"result": "ERROR: TN inexistente",
## },
## {
"trackingNumber": "trackingEjemplo3",
"fileBase64":
"CVBERiOxLjcKJeLjz9MKNiAwIG9iago8PCAvVHlwZSAvUGFnZSAvUGFyZW",
"fileName": "18018_18018_3235235.pdf",
"result": "OK"
## }
## ]

## Posibles
responses
## 200 - Ok
400 - Bad request
## 401 - Unaothorized
## 403 - Forbidden

Correo Argentino – Plataforma de Integración – Api 2.0  Manual de Usuario
## _________________________________________________________________________
## 24                                                          Abril  2023

## Ejemplo
## Error
responses
## 403 - Forbidden
## {
"timestamp": "2022-06-06T13:09:07Z",
## "status": 403,
"error": "Forbidden",
"message": "Access Denied",
## "path": "/v1/agencies"
## }

## 401 - Unaothorized
## {
"timestamp": "2021-09-13T12:52:48-3:00",
## "status": 401,
"error": "Unauthorized",
## "message":"<message>",
## "path": "/v1/label"
## }

400 - Bad request
## {
"timestamp": "2021-09-13T13:51:45-3:00",
## "status": 400,
"error": "Bad request",
## "message":"<message>",
## "path": "/v1/label"
## }
Donde el campo ‘message’ puede ser vacio en caso que el codigo de error
sea lo suficientemente descriptivo












Correo Argentino – Plataforma de Integración – Api 2.0  Manual de Usuario
## _________________________________________________________________________
## 25                                                          Abril  2023



Validaciones y definiciones
- El sellerId y el trackingNumber deben coincidir para una orden previamente creada
para ese cliente
- El agreement y API-Key ser válidos y correspondientes a la misma cuenta
agreement
- Es obligatorio que exista un acuerdo.
labelFormat:
A partir de la versión 1.13 - Se agrega la posibilidad de enviar un parámetro ‘labelFormat'
el cual devolverá en la respuesta un archivo base64 con formato diferente según el valor
especificado.
- No se pasa parametro = 3.1.4
- labelFormat: "10x15" = 3.1.10
- labelFormat: "label" = 3.1.9
## Definiciones
- Este parámetro solo acepta los string “10x15” y "label" como valor funcional
valido (se podrá pasar otro valor pero se ignorara).
- En caso de no enviar el parámetro, o dejarlo vació o enviar un valor invalido
(diferente de ‘10x15’ y ‘label’) se sigue utilizando el servicio ‘consRotulo’ del wsdl
de paq.ar para obtener el base64 en la respuesta.
- No se pasa parámetro = 3.1.4 - consRotulo del wsdl de paq.ar
- labelFormat: "label" = 3.1.9 - obtenerLabel del wsdl de paq.ar
- labelFormat: "10x15" = 3.1.10 - obtenerLabel10x15 del wsdl de paq.ar

Array/Listado de rotulos:
A partir de la version 1.3 se modifica el servicio para aceptar un array o listado de pedidos
y poder consultar más de un rótulo en un mismo llamado al api.
Para esto se realizarán las siguientes modificaciones:
- El método del servicio /labels pasa a ser POST
- Los valores sellerId y trackingNumber componen el objeto a enviar dentro del
array/lista

Correo Argentino – Plataforma de Integración – Api 2.0  Manual de Usuario
## _________________________________________________________________________
## 26                                                          Abril  2023

- Por cada objeto en el array el middleware se encargará de llamar N veces (según
cantidad de objetos) a paq.ar para recibir esos rótulos y devolver el correspondiente
response para cada objeto dentro de la lista.
- En el response dentro de cada objeto del array e devolverá en el campo “result” los
valores “OK” o “ERROR” para evidenciar que pedidos fueron satisfactorios y
cuales no es decir en caso de que, por ejemplo, falle uno de los pedidos enviados en
el array porque el trackingNumber no existe informar el error y poder continuar con
el resto del array.
o En caso que el status sea ‘OK’, devuelve el base64 correspondiente.
o En caso que el status sea ‘ERROR’, se mostrara la respuesta de porque da
error entregada por paq.ar
- El parámetro “labelFormat”: “10x15” aplica de manera global al array de ordenes,
es decir toda la lista se imprime en un formato u otro.
sellerId
A partir de la versión 1.3 del servicio este campo compone un objeto (junto con
trackingNumber) dentro de un array de pedidos, con el fin de poder consultar más de un
rotulo por vez
Está relacionado directamente con el id cliente y esta apuntado a los clientes tipo
marketplace que a su vez tienen otro seller interno.
Esto eventualmente se usa en central.paq para matchear si existe y para realizar una colecta.
Detalle: cada cliente puede tener N sellerId,
- Se lo carga como parámetro no obligatorio, en caso que no se envíe este parámetro
el sistema/middleware se encargara de completar el campo con el ID de FAP (o
agreement).
- Si se lo carga como parámetro sin valor se lo considera que se esta enviando el
sellerId como vacio / null.
trackingNumber
A partir de la versión 1.3 del servicio este campo compone un objeto (junto con sellerId)
dentro de un array de pedidos, con el fin de poder consultar mas de un rotulo por vez.
-  Se requiere que el trackingNumber sea válido (Exista una preimposición u order
previamente generada con su respectivo trackingNumber y el valor informado en el
trackingNumber ingresado en el servicio deben corresponderse para ser valido) ,
esto lo informa y lo hace el vertical, a futuro no se descarta que el middleware
absorba esta validación también para anticiparse a posibles errores.
- El trackingNumber es obligatorio


Correo Argentino – Plataforma de Integración – Api 2.0  Manual de Usuario
## _________________________________________________________________________
## 27                                                          Abril  2023

Ejemplo de llamada
obtenerRotulo
Servicio para obtener rotulo de un pedido / trackingNumber
endpoint localhost:8080/v1/labels
header
"Authorization": "Apikey <Key>",
## “agreement”: “18017”
parámetros
"labelFormat": “10x15”
método POST (Cambio a partir de la versión 1.3, antes GET)
body

## [
## {
"sellerId": "",
"trackingNumber": "18017200G9AL2AC201"
## }
## ]
Ejemplo de respuesta
Success response
## Status 200
## [
## {
"fileBase64": "",
"filename": "18017_18017_18017200G9AL2AC201.pdf",
"status": "OK",
"result": "ERROR: TN inexistente""
## }
## ]












Correo Argentino – Plataforma de Integración – Api 2.0  Manual de Usuario
## _________________________________________________________________________
## 28                                                          Abril  2023

Consultar historial de una orden o pedido

Endpoint para  consultar  el  estado  y/o  historial  de  movimientos  de  una  orden  o
pedido
Es posible consultar la historia de n pedidos (Utilizando su trackingNumber)
Pre-Requisitos
- Tener acceso a los servicios de la plataforma
- Tener agreement y API-Key validos
- Tener orden dada de alta
- Tener el TN (Tracking Number) para informarlo en el servicio

URL Producción: https://***
URL QA: https://***

Método: GET
consultarHistoria
Servicio consultar historia de uno o mas pedidos utilizando sus trackingNumber
endpoint <host>/v1/tracking
header
"Authorization": "Apikey <Key>",
## “agreement”: “string”
parametros

"extClient": "string"
["trackingNumber": "string", "trackingNumber": "string"]
## Ejemplo:
## [
## {
"trackingNumber": "16276MASIVO0005901",
## },
## {
"trackingNumber": "16276MASIVO0005902",
## }
## ]

metodo GET

Correo Argentino – Plataforma de Integración – Api 2.0  Manual de Usuario
## _________________________________________________________________________
## 29                                                          Abril  2023

## Success
response
## [
## {
## "quantity:2"
"countryId":"AR"
"serviceType":"CP"
## "id": "string",
"trackingNumber":"16276MASIVO0005901"
## "event":[
## {
"facilityId":"CORREO ARGENTINO",
"facility":"CORREO ARGENTINO",
"statusId":"CAU",
## "status":"caduco",
"date": "2017-06-27T10:00:00-03:00",
## "sign": ""
## },
## ],
## "event":[
## {
"facilityId":"GCL",
"facility":"CTP-BUE GRANDES CLIENTES",
"statusId":"PRE",
"status": "preImposicion",
"date": "2017-05-17T15:50:00-03:00",
## "sign": ""
## },
## ],
## },
## {
## "quantity:2"
"countryId":"AR"
"productType":"CP"
## "id": "string",
"trackingNumber":"16276MASIVO0005901"
## "event":[
## {
"facilityId":"CORREO ARGENTINO",
"facility":"CORREO ARGENTINO",
"statusId":"CAU",
## "status":"caduco",
"date": "2017-06-27T10:00:00-03:00",
## "sign": ""
## },
## ],
## "event":[
## {
"facilityId":"GCL",
"facility":"CTP-BUE GRANDES CLIENTES",
"statusId":"PRE",
"status": "preImposicion",
"date": "2017-05-17T15:50:00-03:00",
## "sign": ""
## },
## ],
## },
## ]

Correo Argentino – Plataforma de Integración – Api 2.0  Manual de Usuario
## _________________________________________________________________________
## 30                                                          Abril  2023

## Posibles
responses
## 200 - Ok
400 - Bad request
## 401 - Unaothorized
## 403 - Forbidden
## Ejemplo Error
responses
## 403 - Forbidden
## {
"timestamp": "2022-06-06T13:09:07Z",
## "status": 403,
"error": "Forbidden",
"message": "Access Denied",
## "path": "/v1/agencies"
## }

## 401 - Unauthorized
## {
"timestamp": "2021-09-13T12:52:48-3:00",
## "status": 401,
"error": "Unauthorized",
## "message":"<message>",
## "path": "/v1/tracking"
## }
400 - Bad request
## {
"timestamp": "2021-09-13T12:52:48-3:00",
## "status": 400,
"error": "Bad request",
## "message":"<message>",
## "path": "/v1/tracking"
## }
Donde el campo ‘message’ puede ser vacio en caso que el codigo de
error sea lo suficientemente descriptivo
Validaciones y definiciones
- El cliente Vendedor informara N números de diferentes trackingNumber para
consultar el historial de cada uno
- Este servicio retornará un array con la lista de eventos para cada
pedido/trackingNumber
- Existen validaciones del sistema vertical que están fuera de alcance para
obsorverlas, se dejaran estas validaciones al servicio de paq.ar y se las expondrán en
las respuestas de los servicios en las primeras versiones de la api. Se agregarán
algunas validaciones especificas y detalladas en este documento.

Correo Argentino – Plataforma de Integración – Api 2.0  Manual de Usuario
## _________________________________________________________________________
## 31                                                          Abril  2023

- Para identificar un success response validamos que el campo ‘cantidad’ del SP sea
mayor a cero - 'cantidad' > 0. Si cantidad es igual a 0 lo interpretamos como un
código “400” bad request mostrando el mensaje que devuelve el SP
extClient
- Es opcional
- Solo acepta 3 caracteres numéricos
- Se aceptan un máximo y mínimo de 3 caracteres

## Nota:
Esta concatenación la hace automaticamente el sistema:
- Si no se carga se concatena al final los valores 000 al agreement en el header Ej.:
agreement 18018 -> 18018000 (No cargo nada en extClient)
- Si se carga se concatena el valor ingresado al agreement en el header por Ej.:
agreement 18018 -> 18018123 (Ingreso 123 en el campo extClient)

En caso de no cumplir con los 3 caracteres especificos se mostrará mensaje ‘extClient must
be 3 characters long’
trackingNumber
-  Se requiere que el trackingNumber sea valido (Exista una preimposicion o order
previamente generada con su respectivo trackingNumber y el valor informado en el
trackingNumber ingresado en el servicio deben corresponderse para ser valido) ,
esto lo informa y lo hace el vertical, a futuro no se descarta que el middleware
absorba esta validacion tambien para anticiparse a posibles errores.
- El trackingNumber es obligatorio
- Por cada trackingNumber informado se debe devolver el historial de eventos
relacionados a ese trackingNumber
fecha → Date:
Formato de la fecha UTC:
YYYY-MM-DDTHH:mm:ssTZD ej.: 1997-07-16T19:20:30-03:00
Se carga en 00 el horario faltante


Correo Argentino – Plataforma de Integración – Api 2.0  Manual de Usuario
## _________________________________________________________________________
## 32                                                          Abril  2023

Ejemplo de llamada
## Consultar Historia
endpoint localhost:8080/v1/tracking
header
"Authorization": "Apikey <Key>",
## “agreement”: “18017”
parámetros
"extClient": ""
## [
## {
"trackingNumber": "180176G2204I471801",
## },
## {
"trackingNumber": "1801740CPTLEL9A501"
## }
## ]
método GET
Ejemplo de respuesta

Correo Argentino – Plataforma de Integración – Api 2.0  Manual de Usuario
## _________________________________________________________________________
## 33                                                          Abril  2023

Success response
(Status 200)
## [
## {
"id": null,
## "quantity": 0,
"countryId": null,
"serviceType": null,
"trackingNumber": "180176G2204I471801",
## "event": []
## },
## {
"id": null,
## "quantity": 2,
"countryId": null,
"serviceType": null,
"trackingNumber": "1801740CPTLEL9A501",
## "event": [
## {
"facilityCode": "CORREO ARGENTINO",
"statusId": "CAN",
"status": "EN PROCESO DE CANCELACION",
## "date": "28-06-2022 11:53",
## "sign": "",
"facility": "CORREO ARGENTINO"
## },
## {
"facilityCode": "CORREO ARGENTINO",
"statusId": "PRE",
"status": "PREIMPOSICION",
## "date": "28-06-2022 11:53",
## "sign": "",
"facility": "CORREO ARGENTINO"
## }
## ]
## }
## ]





Consulta sucursales de Correo Argentino
Este endpoint permite consultar las Sucursales habilitadas de Correo Argentino,
provee una cantidad de información como Latitud, Longitud, Horarios, Calle,
Número, entre otros
Pre-Requisitos
- Tener acceso a los servicios de la plataforma
- Tener agreement y API-Key validos

Correo Argentino – Plataforma de Integración – Api 2.0  Manual de Usuario
## _________________________________________________________________________
## 34                                                          Abril  2023


URL Producción: https://***
URL QA: https://***

Método: GET

obtenerSucursales
Servicio para obtener sucursales habilitadas para el cliente - agreement recibido
Nota: se muestra ejemplo parcial de respuesta con sólo una agencia para el Request
ejemplo
endpoint <host>/v1/agencies
header
"Authorization": "Apikey <Key>",
## “agreement”: “string”
parámetros
“stateId“: “string“
"pickup_availability": “Boolean“
"package_reception": “Boolean“
metodo GET

Correo Argentino – Plataforma de Integración – Api 2.0  Manual de Usuario
## _________________________________________________________________________
## 35                                                          Abril  2023

## Success
response
## Ejemplo
## [
## {
## "location": {
## "geolocation": {
## "latitude": "-32.370737",
## "longitude": "-61.360767"
## },
"country_name": "Argentina",
"state_name": "SANTA FE",
"city_name": "SAN GENARO",
"city_id": "S0188",
"neighborhood_name": "SAN JERONIMO",
"street_name": "JUAN LAZARTE",
## "street_number": "1498",
"zip_code": "S2146ZAA"
## },
"status": null,
"schedule": "LUN A VIE 08.00 A 14.30",
"owner": "Denardo,Matías Gabriel",
## "email": "sopoficina@correoargentino.com.ar",
## "phone": "(03401) 448396",
"agency_id": "SCQ",
"agency_name": "SAN GENARO",
"package_reception": true,
"pickup_availability": true,
## "open_hours": {
"monday": null,
"tuesday": null,
"wednesday": null,
"thursday": null,
"friday": null,
"saturday": null,
"sunday": null,
"holidays": null
## },
"last_updated": null,
"deactivation_date": null,
"volumetric_capacity": null,
## "maximum_package_dimensions": {
"height": null,
"length": null,
"width": null,
"weight": null
## }
## }
## ]

## Posibles
responses
## 200 - Ok
400 - Bad request
## 401 - Unauthorized
## 403 - Forbidden

Correo Argentino – Plataforma de Integración – Api 2.0  Manual de Usuario
## _________________________________________________________________________
## 36                                                          Abril  2023

## Ejemplo Error
responses
## 403 - Forbidden
## {
"timestamp": "2022-06-06T13:09:07Z",
## "status": 403,
"error": "Forbidden",
"message": "Access Denied",
## "path": "/v1/agencies"
## }
## 401 - Unauthorized
## {
"timestamp": "2021-09-13T12:52:48-3:00",
## "status": 401,
"error": "Unauthorized",
## "message":"<message>",
## "path": "/v1/agencies"
## }
400 - Bad request
## {
"timestamp": "2021-09-13T12:52:48-3:00",
## "status": 400,
"error": "Bad request",
## "message":"<message>",
## "path": "/v1/agencies"
## }
Donde el campo ‘message’ puede ser vacio en caso que el codigo de
error sea lo suficientemente descriptivo.

Validaciones y definiciones
Provincia → stateId
Filtro para mostrar las sucursales correspondientes a una provincia,
Código de provincias según la regla ISO 3166-2
- No obligatorio,
- Si no se carga, devuelve todas las sucursales
- Si se carga, se filtra por la provincia del codigo recibido.
Disponible para entrega → pickup_availability

Correo Argentino – Plataforma de Integración – Api 2.0  Manual de Usuario
## _________________________________________________________________________
## 37                                                          Abril  2023

Filtro para mostrar las sucursales que están habilitadas para entregar mercadería a los
clientes finales (en el servicio SOAP figuran como "relacion": "ENTREGA").
- No obligatorio,
- Si no se carga, devuelve todas las sucursales
- Si se carga en “true”, se filtra por la sucursales que están disponibles para entrega de
mercadería.
- Si se carga en “false”, se filtra por la sucursales que no tengan dicha disponibilidad
Disponible para imposición → package_reception
Filtro para mostrar las sucursales que están habilitadas para imponer mercadería (en el
servicio SOAP figuran como "relacion": "IMPOSICION").
- No obligatorio,
- Si no se carga, devuelve todas las sucursales
- Si se carga en “true”, se filtra por las sucursales que están disponibles para
imposición.
- Si se carga en “false”, se filtra por las sucursales que no tengan dicha disponibilidad

















