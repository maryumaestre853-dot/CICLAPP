"""
backend/routes_api.py

Cliente de Google Routes API — SOLO se llama desde el backend,
nunca desde el frontend, para no exponer la API key en el APK.

DESCUBRIMIENTO CONFIRMADO (probado con la key real del proyecto):
Google Routes API en modo BICYCLE devuelve "{}" (sin rutas) para
Bogotá — no es un error de configuración, es que Google todavía
no tiene datos de ciclorrutas mapeados para esta ciudad. El mismo
origen/destino con travelMode=WALK sí funciona perfectamente.

SOLUCION: se intenta BICYCLE primero (por si Google agrega cobertura
en el futuro); si devuelve vacio, se reintenta con WALK como
aproximacion (se mantiene en calles/andenes, a diferencia de DRIVE
que puede usar autopistas). El resultado indica que modo se uso
realmente, para que el frontend avise al usuario que es aproximada.
"""

import os
import httpx

GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")
ROUTES_API_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"


class RoutesApiError(Exception):
    def __init__(self, mensaje: str, tipo: str = "google"):
        self.tipo = tipo
        super().__init__(mensaje)


async def _llamar_google(
    origen_lat: float, origen_lon: float,
    destino_lat: float, destino_lon: float,
    travel_mode: str,
) -> dict | None:
    """
    Hace UNA llamada a Google con el travelMode indicado.
    Retorna el dict de la ruta si Google encontro una, o None si
    respondio 200 pero sin rutas (para poder reintentar con otro modo).
    Lanza RoutesApiError para errores reales (red, config, Google 4xx/5xx).
    """
    body = {
        "origin": {"location": {"latLng": {"latitude": origen_lat, "longitude": origen_lon}}},
        "destination": {"location": {"latLng": {"latitude": destino_lat, "longitude": destino_lon}}},
        "travelMode": travel_mode,
        "polylineQuality": "HIGH_QUALITY",
        "polylineEncoding": "ENCODED_POLYLINE",
    }
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
    }

    print(f"[routes_api] Probando travelMode={travel_mode} origen=({origen_lat},{origen_lon}) destino=({destino_lat},{destino_lon})")

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.post(ROUTES_API_URL, json=body, headers=headers)
        except httpx.RequestError as e:
            print(f"[routes_api] ERROR DE RED: {type(e).__name__}: {e}")
            raise RoutesApiError(
                f"El backend no pudo conectarse a Google Maps. Detalle: {type(e).__name__}",
                tipo="red",
            )

    if resp.status_code != 200:
        detalle = resp.text[:500]
        print(f"[routes_api] Google respondio {resp.status_code}: {detalle}")
        raise RoutesApiError(
            f"Google Routes API respondio {resp.status_code}. Detalle: {detalle}",
            tipo="google",
        )

    data = resp.json()
    rutas = data.get("routes", [])
    if not rutas:
        print(f"[routes_api] travelMode={travel_mode} -> Google respondio 200 pero SIN rutas.")
        return None

    ruta = rutas[0]
    duracion_str = ruta.get("duration", "0s")
    duracion_segundos = int(duracion_str.rstrip("s")) if duracion_str.endswith("s") else 0

    print(f"[routes_api] travelMode={travel_mode} -> OK, distancia={ruta.get('distanceMeters')}m")

    return {
        "distanceMeters": ruta.get("distanceMeters", 0),
        "durationSeconds": duracion_segundos,
        "polyline": ruta.get("polyline", {}).get("encodedPolyline", ""),
    }


async def calcular_ruta_bicicleta(
    origen_lat: float, origen_lon: float,
    destino_lat: float, destino_lon: float,
) -> dict:
    """
    Intenta BICYCLE primero. Si Google no tiene cobertura de
    ciclorrutas para la zona (caso confirmado: Bogota), reintenta
    automaticamente con WALK como aproximacion.

    El resultado incluye "modoUsado": "BICYCLE" o "WALK", y
    "esAproximada": True cuando se tuvo que usar el fallback,
    para que el frontend le avise al usuario.
    """
    if not GOOGLE_MAPS_API_KEY or GOOGLE_MAPS_API_KEY.startswith("TU_API_KEY"):
        raise RoutesApiError("GOOGLE_MAPS_API_KEY no configurada.", tipo="config")

    resultado = await _llamar_google(origen_lat, origen_lon, destino_lat, destino_lon, "BICYCLE")
    if resultado is not None:
        resultado["modoUsado"] = "BICYCLE"
        resultado["esAproximada"] = False
        return resultado

    print("[routes_api] BICYCLE sin cobertura en esta zona -> reintentando con WALK como aproximacion")
    resultado = await _llamar_google(origen_lat, origen_lon, destino_lat, destino_lon, "WALK")
    if resultado is not None:
        resultado["modoUsado"] = "WALK"
        resultado["esAproximada"] = True
        return resultado

    # Ni BICYCLE ni WALK encontraron nada -> esos puntos genuinamente
    # no tienen ninguna via conectada segun Google.
    raise RoutesApiError(
        "Google no encontro ninguna ruta (ni en bicicleta ni caminando) entre esos puntos.",
        tipo="sin_ruta",
    )
