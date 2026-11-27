"""Definición de logros y puntos de Ciclapp."""

LOGROS = [
    {"id": "primera_ruta",  "titulo": "Primera pedalada", "descripcion": "Completa tu primera ruta",  "emoji": "🚴", "tipo": "bronce", "puntos": 20,  "cond": lambda s: s["total_rutas"] >= 1},
    {"id": "cinco_rutas",   "titulo": "Constante",        "descripcion": "Completa 5 rutas",          "emoji": "🔥", "tipo": "bronce", "puntos": 30,  "cond": lambda s: s["total_rutas"] >= 5},
    {"id": "diez_km",       "titulo": "Diez kilómetros",  "descripcion": "Recorre 10 km en total",    "emoji": "📏", "tipo": "bronce", "puntos": 20,  "cond": lambda s: s["total_km"] >= 10},
    {"id": "cien_puntos",   "titulo": "Coleccionista",    "descripcion": "Alcanza 100 puntos",        "emoji": "⭐", "tipo": "bronce", "puntos": 25,  "cond": lambda s: s["puntos"] >= 100},
    {"id": "diez_rutas",    "titulo": "Ciclista fiel",    "descripcion": "Completa 10 rutas",         "emoji": "🏅", "tipo": "plata",  "puntos": 50,  "cond": lambda s: s["total_rutas"] >= 10},
    {"id": "veinticinco_km","titulo": "Fondista",         "descripcion": "Recorre 25 km en total",    "emoji": "🛣️", "tipo": "plata",  "puntos": 50,  "cond": lambda s: s["total_km"] >= 25},
    {"id": "cincuenta_km",  "titulo": "Medio centenar",   "descripcion": "Recorre 50 km en total",    "emoji": "🏔️", "tipo": "oro",    "puntos": 100, "cond": lambda s: s["total_km"] >= 50},
    {"id": "veinte_rutas",  "titulo": "Leyenda urbana",   "descripcion": "Completa 20 rutas",         "emoji": "🏆", "tipo": "oro",    "puntos": 100, "cond": lambda s: s["total_rutas"] >= 20},
    {"id": "cien_km",       "titulo": "Centenario",       "descripcion": "Recorre 100 km en total",   "emoji": "👑", "tipo": "oro",    "puntos": 150, "cond": lambda s: s["total_km"] >= 100},
]


def calcular_puntos_ruta(km: float) -> int:
    return round((km or 0) * 10) + 15
