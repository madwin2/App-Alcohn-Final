

Correo Argentino - API MiCorreo.md8/8/2022
## 1 / 16
Correo Argentino: API MiCorreo
La API de MiCorreo se utiliza principalmente para cotizar envíos, e importarlos en la plataforma de MiCorreo.
Esta API está organizada en torno a REST. Nuestra API tiene direcciones URL predecibles orientadas a los
recursos, acepta solicitudes 'form-encoded', devuelve respuestas 'JSON-encode' y utiliza códigos de
respuesta, autenticación y verbos HTTP estándar.
URL Base
Todas las URLs referenciadas en esta documentación corresponden a la siguiente base:
Ambiente QA (Testing)
https://apitest.correoargentino.com.ar/micorreo/v1
## Ambiente Productivo
https://api.correoargentino.com.ar/micorreo/v1
La API se sirve a través de HTTPS. Para garantizar la privacidad de los datos, no se admite HTTP sin
cifrar.
## Autentificación
La API de MiCorreo utiliza JWT tokens para autorizar las solicitudes. Para obtener el token de autorización
deberán previamente autentificarse a través de HTTP Basic Auth. Las credenciales de acceso deberán ser
solicitadas a Correo para cada uno de los ambientes.
## Request
curl -X POST ${BASE_URL}/token -u ${user}:${password}
Response (200 OK):
## {
## "token":
"eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJtYm9mIiwiYXVkIjoiQ29ycmVvIEFyZ2Vu
dGlubyIsIm1lbWJlciBvZiI6Ik1pZGRsZXdhcmUiLCJpc3MiOiJDT1JBU0EiLCJleHAiOjE2NTEwMTg1OD
AsImlhdCI6MTY1MTAwOTU4MCwianRpIjoiMDAxIn0.XTekibPPBVKU-iX1kAKKUZB6NwyGGFsXzVrCB-
Cmy8Q",
## "expires": "2022-04-26 21:16:20"
## }

Correo Argentino - API MiCorreo.md8/8/2022
## 2 / 16
## Response (401 Unauthorized):
## {
## "code": "401",
"message": "Unauthorized"
## }
Para consumir el resto de los endpoints deberá enviar la solicitud con el encabezado de autorización
'Authorization' (bearer auth):
curl -X POST ${BASE_URL}/register
-H "Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
-H 'Content-Type: application/json'
-d '{"firstName":"Juan","lastName":"Gonzalez",...}'
Todas las solicitudes deben realizarse a través de HTTPS. Las llamadas realizadas a través de HTTP
simple fallarán. Las solicitudes de API sin autenticación también fallarán
Sus claves API tienen muchos privilegios, ¡así que asegúrese de mantenerlas seguras! No comparta sus
claves API secretas en áreas de acceso público como GitHub, código del lado del cliente, etc.
## Errores
Usamos códigos de respuesta HTTP convencionales para indicar el éxito o el fracaso de una solicitud API. En
general: los códigos en el rango 2xx indican éxito. Los códigos en el rango 4xx indican un error que falló dada
la información proporcionada (por ejemplo, se omitió un parámetro requerido, falló una carga, etc.). Los
códigos en el rango 5xx indican un error con los servidores de Correo (estos son raros).
Response Example (404 NOT FOUND):
## {
## "code": "404",
"message": "Resource not found",
## }
HTTP Status Code Summary
200 - OKTodo funcionó como se esperaba.
## 400 - Bad
## Request
La solicitud es inaceptable (probablemente a la falta de un parámetro obligatorio).

Correo Argentino - API MiCorreo.md8/8/2022
## 3 / 16
## 401 -
## Unauthorized
No se ha proporcionado un token de acceso válido.
## 402 - Request
## Failed
Los parámetros enviados son válidos pero la solicitud falló.
403 - ForbiddenEl token de acceso no tiene permisos para realizar la solicitud.
404 - Not FoundEl recurso solicitado no existe.
## 409 - Conflict
La solicitud entra en conflicto con otra solicitud (quizás debido al uso de la misma
clave idempotente).
## 429 - Too Many
## Requests
Demasiadas solicitudes llegan a la API demasiado rápido. Recomendamos un
retroceso exponencial de sus solicitudes.
## 50x - Server
## Errors
Servicio no disponible
## Endpoints
/register [POST], registra un usuario nuevo en MiCorreo.
/users/validate [POST], devuelve el id de un usuario de MiCorreo.
/agencies [GET], devuelve las sucursales de una provincia determinada.
/rates [POST], devuelve la cotización de un envío.
/shipping/import [POST], importa un envío a MiCorreo.
/register [POST]
Registra un nuevo usuario en la plataforma MiCorreo. Hay dos tipos de alta de usuario posibles, consumidor
final o con CUIT, para monotributistas o responsables inscriptos.
## Body Attributes
CampoDescripciónRequerido
firstNameNombre✔
lastName** Apellido
email
- Dirección de correo electrónico, no debe existir en la plataforma
MiCorreo.
## ✔
documentType
Tipo de documento, "DNI" para consumidores finales, "CUIT" para
monotributistas o responsables inscriptos.
## ✔
documentIdNúmero de DNI o CUIT, según el campo documentType.✔
phoneNúmero de teléfono.
cellPhoneNúmero de celular.
address.streetName** Nombre de la calle de la dirección.

Correo Argentino - API MiCorreo.md8/8/2022
## 4 / 16
CampoDescripciónRequerido
address.streetNumber** Altura o número de la dirección
address.floorPiso de la dirección.
address.apartmentDepartamento (piso dpto.) de la dirección.
address.city** Nombre de la ciudad de la dirección.
address.provinceCode** Codigo de la provincia de la dirección.
address.postalCode** Código Postal de la dirección.
- Este servcio no dispone de ningún mecanismo de validación del correo electrónico (campo email).
** obligatorio para DNI.
Request - Registro consumidor final:
## {
"firstName": "Juan",
"lastName": "Gonzalez",
## "email": "email@mail.com",
## "password": "123456",
"documentType": "DNI",
"documentId": "32471960",
## "phone": "1165446544",
"cellPhone": "1165446544",
## "address": {
"streetName": "Vicente Lopez",
"streetNumber": "448",
## "floor": "1",
"apartment": "D",
"locality": "Monte Grande",
"city": "Esteban Echeverria",
"provinceCode": "B",
"postalCode": "B1842ZAB"
## }
## }
Request - Registro empresas, monotributista, etc.:
## {
"firstName": "Juan",
"lastName": "Gonzalez",
## "email": "email@mail.com",
## "password": "123456",
"documentType": "CUIT",
"documentId": "30324719607",
## "phone": "1165446544",
"cellPhone": "1165446544",

Correo Argentino - API MiCorreo.md8/8/2022
## 5 / 16
## "address": {
"streetName": "Vicente Lopez",
"streetNumber": "448",
## "floor": "1",
"apartment": "D",
"locality": "Monte Grande",
"city": "Esteban Echeverria",
"provinceCode": "B",
"postalCode": "B1842ZAB"
## }
## }
curl -X POST ${BASE_URL}/register
-H "Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
-H 'Content-Type: application/json'
-d '{"firstName":"Juan","lastName":"Gonzalez",...}'
Response (200 OK):
## {
"customerId": "0090000024",
"createdAt":"2022-04-28 12:08:16.847"
## }
## Response Attributes
CampoDescripción
customerIdIdentificador de usuario de MiCorreo.
createdAtFecha de creación del registro.
## Response (402 Error):
## {
## "code": "402",
"message": "Error..."
## }
## Response (402 Error):
## {
## "code": "402",
"message": "Email existente...."
## }

Correo Argentino - API MiCorreo.md8/8/2022
## 6 / 16
/users/validate [POST]
Devuelve el ID de un usuario de MiCorreo
## Body Attributes
CampoDescripciónRequerido
emailEmail registrado.✔
passwordContraseña valida.✔
## Request:
curl -X POST ${BASE_URL}/users/validate
-H "Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
-H 'Content-Type: application/json'
## -d '{"email":"email2@mail.com","password":"secret"}'
Response (200 OK):
## {
"customerId": "0090000025",
"createdAt": "2021-03-10"
## }
Response (404 NOT FOUND):
## {
## "code": "404",
"message": "Usuario no valido o inexistente",
## }
/agencies [GET]
Devuelve las sucursales de una provincia determinada.
## Query Attributes
CampoDescripciónRequerido
customerIdIdentificador de usuario de MiCorreo.✔
provinceCodeCódigo de provincia.✔

Correo Argentino - API MiCorreo.md8/8/2022
## 7 / 16
CampoDescripciónRequerido
services"package_reception", "pickup_availability"
## Request:
curl -H "Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..." \
${BASE_URL}/agencies \
--data-urlencode "customerId=0090000025" \
--data-urlencode "provinceCode=B"
Response (200 OK):
## [
## {
"code": "B0107",
"name": "Monte Grande",
"manager": "Denardo, Matías Gabriel",
## "email": "sopoficina@correoargentino.com.ar",
## "phone": "(03401) 448396",
## "services": {
"packageReception": true,
"pickupAvailability": true
## },
## "location": {
## "address" : {
"streetName": "Vicente Lopez",
"streetNumber": "448",
"floor": null,
"apartment": null,
"locality": "Monte Grande",
"city": "Esteban Echeverria",
"province": "Buenos Aires",
"provinceCode": "B",
"postalCode": "B1842ZAB"
## },
## "latitude": "-34.81939997",
## "longitude": "-58.46747615"
## },
## "hours": {
"sunday": null,
## "monday": { "start": "0930", "end": "1800" },
## "tuesday":  { "start": "1000", "end": "1800" },
## "wednesday":  { "start": "1000", "end": "1800" },
## "thursday":  { "start": "1000", "end": "1800" },
## "friday":  { "start": "1000", "end": "1800" },
"saturday": null,
"holidays": null
## },
"status": "ACTIVE"

Correo Argentino - API MiCorreo.md8/8/2022
## 8 / 16
## }
## ]
## Response (402 Error):
## {
## "code": "402",
"message": "Customer ID no valido"
## }
/rates [POST]
Devuelve las cotizaciciones de un envío a destino o a una sucursal.
## Body Attributes
CampoDescripciónRequerido
customerIdIdentificador de usuario de MiCorreo.✔
postalCodeOriginCP de origen del envío a cotizar.✔
postalCodeDestinationCP de destino del envío a cotizar.✔
deliveredType"D" para entrega a domicilio, o "S" para entrega en sucursal.
dimensions.weightPeso en gramos del envío (mínimo 1g y máximo 25000g).✔
dimensions.heightAlto en centímetros del envío (máximo 150cm).✔
dimensions.widthAncho en centímetros del envío (máximo 150cm).✔
dimensions.lengthLargo en centímetros del envío (máximo 150cm).✔
All fields of the dimensions object are integer values (max precision )
Request - Envío a Domicilio:
## {
"customerId": "0000550137",
"postalCodeOrigin": "1757",
"postalCodeDestination": "1704",
"deliveredType": "D",
## "dimensions": {
## "weight": 2500,
## "height": 10,
## "width": 20,
## "length": 30
## }
## }

Correo Argentino - API MiCorreo.md8/8/2022
## 9 / 16
curl -X POST ${BASE_URL}/rates
-H "Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
-H 'Content-Type: application/json'
## -d
'{"customerId":"0090000025","postalCodeOrigin":"1757","postalCodeDestination":
## "1704",...}'
Response (200 OK):
## {
"customerId": "0000550997",
"validTo": "2022-06-07T10:31:27.881-03:00",
## "rates": [
## {
"deliveredType": "D",
"productType": "CP",
"productName": "Paq.ar Clásico",
## "price": 498.06
## }
## ]
## }
Request - Envío a Sucursal:
## {
"customerId": "0000550997",
"postalCodeOrigin": "1757",
"postalCodeDestination": "1704",
"deliveredType": "S",
## "dimensions": {
## "weight": 2500,
## "height": 10,
## "width": 20,
## "length": 30
## }
## }
curl -X POST ${BASE_URL}/rates
-H "Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
-H 'Content-Type: application/json'
## -d
'{"customerId":"0090000025","postalCodeOrigin":"1757","postalCodeDestination":
## "1704",...}'
Response (200 OK):

Correo Argentino - API MiCorreo.md8/8/2022
## 10 / 16
## {
"customerId": "0000550997",
"validTo": "2022-06-07T10:31:27.881-03:00",
## "rates": [
## {
"deliveredType": "S",
"productType": "CP",
"productName": "Paq.ar Clásico",
## "price": 398.06
## }
## ]
## }
Request - Las dos cotizaciones en un mismo request:
## {
"customerId": "0000550997",
"postalCodeOrigin": "1757",
"postalCodeDestination": "1704",
## "dimensions": {
## "weight": 2500,
## "height": 10,
## "width": 20,
## "length": 30
## }
## }
curl -X POST ${BASE_URL}/rates
-H "Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
-H 'Content-Type: application/json'
## -d
'{"customerId":"0090000025","postalCodeOrigin":"1757","postalCodeDestination":
## "1704",...}'
Response (200 OK):
## {
"customerId": "0000550997",
"validTo": "2022-06-07T10:31:27.881-03:00",
## "rates": [
## {
"deliveredType": "D",
"productType": "CP",
"productName": "Paq.ar Clásico",
## "price": 498.06
## },

Correo Argentino - API MiCorreo.md8/8/2022
## 11 / 16
## {
"deliveredType": "S",
"productType": "CP",
"productName": "Paq.ar Clásico",
## "price": 398.06
## }
## ]
## }
Response (402 ERROR):
## {
## "code": "402",
"message": "Cliente FAP no identificado {customerId}",
## }
/shipping/import [POST]
Importa un envío a MiCorreo.
## Body Attributes
CampoDescripciónRequerido
customerIdIdentificador de usuario de MiCorreo.✔
extOrderIdIdentificador externo de la Orden.✔
orderNumberIdentificador externo para ver en MiCorreo.
senderInformación del remitente.
sender.nameNombre del remitente.
sender.phoneNúmero de teléfono del remitente.
sender.cellPhoneNúmero de celular del remitente.
sender.emailDirección de correo electrónico del remitente.
sender.originAddressDirección del remitente.
sender.originAddress.streetNameNombre de la calle de la dirección.
sender.originAddress.streetNumberAltura o numero de la dirección.
sender.originAddress.floorPiso de la dirección.
sender.originAddress.apartmentDepartamento de la dirección.
sender.originAddress.cityCiudad de la dirección.
sender.originAddress.provinceCodeCódigo de la provincia de la dirección.

Correo Argentino - API MiCorreo.md8/8/2022
## 12 / 16
CampoDescripciónRequerido
sender.originAddress.postalCodeCódigo Postal de la dirección.
recipientInformación del Destinatario.✔
recipient.nameNombre del destinatario del envío.✔
recipient.phoneNúmero de teléfono del destinatario.
recipient.cellPhoneNúmero de celular del destinatario.
recipient.emailDirección de correo electrónico del destinatario.✔
shippingInformación del envío.✔
shipping.deliveryType
Tipo de envío: "D" (no "S") envío a domicilio, "S"
envío a sucursal.
## ✔
shipping.agency
Para envíos a sucursal, definir el código de la sucursal
y solo en ese caso es obligatorio.
shipping.address.streetName* Nombre de la calle de la dirección de envío.
shipping.address.streetNumber* Altura o numero de la dirección del envío.
shipping.address.floorPiso de la dirección de envío. (trunc to 3 characters)
shipping.address.apartment
Departamento de la dirección de envío. (trunc to 3
characters)
shipping.address.city* Ciudad de la dirección de envío.
shipping.address.provinceCode* Código de la provincia de la dirección de envío.
shipping.address.postalCode* Código Postal de la dirección de envío.
shipping.weightPeso del envío en gramos.✔
shipping.declaredValueValor declarado del envío.✔
shipping.heightAlto en centímetros del envío.✔
shipping.lengthLargo del envío en centímetros.✔
shipping.widthAncho del envío en centímetros✔
- Solo obligatorios para envio a Domicilio (shipping.deliveryType != "S" (no S))
The fields weight, height, length and width of the shipping object are integer values (max precision )
Request - Envío a Domicilio:
## {
"customerId": "0005000033",
"extOrderId": "583358193",
"orderNumber": "102",

Correo Argentino - API MiCorreo.md8/8/2022
## 13 / 16
## "sender": {
"name": null,
"phone": null,
"cellPhone": null,
"email": null,
"originAddress": {
"streetName": null,
"streetNumber": null,
"floor": null,
"apartment": null,
"city": null,
"provinceCode": null,
"postalCode": null
## }
## },
## "recipient": {
"name": "Aa cc",
## "phone": "",
"cellPhone": "",
## "email": "username@mail.com",
## },
## "shipping": {
"deliveryType": "D",
"agency": null,
## "address": {
"streetName": "Bb",
"streetNumber": "1234",
## "floor": "",
## "apartment": "",
"city": "Buenos Aires",
"provinceCode": "B",
"postalCode": "1425"
## },
## "weight": 1000,
"declaredValue": 500.00,
## "height": 20,
## "length": 40,
## "width": 20,
## }
## }
curl -X POST ${BASE_URL}/shipping/import
-H "Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
-H 'Content-Type: application/json'
-d '{"customerId":"0005000033","extOrderId":"583358193","orderNumber":
## "102",...}'
Request - Envío a sucursal:

Correo Argentino - API MiCorreo.md8/8/2022
## 14 / 16
## {
"customerId": "0005000033",
"extOrderId": "583358194",
"orderNumber": "103",
## "sender": {
"name": null,
"phone": null,
"cellPhone": null,
"email": null,
"originAddress": {
"streetName": null,
"streetNumber": null,
"floor": null,
"apartment": null,
"city": null,
"provinceCode": null,
"postalCode": null
## }
## },
## "recipient": {
"name": "Aa cc",
## "phone": "",
"cellPhone": "",
## "email": "username@mail.com",
## },
## "shipping": {
"deliveryType": "S",
"agency": "E0000",
## "address": {
"streetName": "Bb",
"streetNumber": "1234",
## "floor": "",
## "apartment": "",
"city": "Buenos Aires",
"provinceCode": "B",
"postalCode": "1425"
## },
## "weight": 1000,
"declaredValue": 500.00,
## "height": 20,
## "length": 40,
## "width": 20,
## }
## }
curl -X POST ${BASE_URL}/shipping/import
-H "Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
-H 'Content-Type: application/json'
-d '{"customerId":"0005000033","extOrderId":"583358194","orderNumber":
## "103",...}'

Correo Argentino - API MiCorreo.md8/8/2022
## 15 / 16
Response (200 OK):
## {
"createdAt": "2022-06-07T16:15:04.996-03:00"
## }
## Response (402 Error):
## {
## "code": "402",
"message": "Error ..."
## }
Error messages (from WCP):
La orden ya fue importada con anterioridad.
Peso no valido
Tipo de entrega invalido
Verifique la sucursal de destino
Tipo de encomienda [TENC] no valida
El peso debe ser mayor a 0
El peso excede el maximo permitido para el producto
no se encontro datos de remitente - id :...
El codigo Postal del emisor debe tener valor.
La provincia del emisor debe tener valor.
La provincia es invalida.
El alto debe estar entre 0 y 255.
El ancho debe estar entre 0 y 255.
El largo debe estar entre 0 y 255.
## Notes:
## Province Codes
CodeProvince name
ASalta
BProvincia de Buenos Aires
CCiudad Autonoma Buenos Aires (o Capital Federal)
DSan Luis
EEntre Rios

Correo Argentino - API MiCorreo.md8/8/2022
## 16 / 16
CodeProvince name
FLa Rioja
GSantiago del Estero
HChaco
JSan Juan
KCatamarca
LLa Pampa
MMendoza
NMisiones
PFormosa
QNeuquen
RRio Negro
SSanta Fe
TTucuman
UChubut
VTierra del Fuego
WCorrientes
XCordoba
YJujuy
ZSanta Cruz