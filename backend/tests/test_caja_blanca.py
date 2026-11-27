"""
CAJA BLANCA – se diseña mirando el código fuente.
Técnicas: cobertura de sentencias, de ramas (if/else), de caminos y de bucles.
Cómo medir:  pytest -m caja_blanca --cov=. --cov-branch --cov-report=term-missing
"""
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException
from jose import jwt

import auth
import database
import main
import routes_api
from models import AppRoute, LogroUsuario, PuntoGPS, RecorridoGPS, Usuario
from conftest import PW_OK

pytestmark = pytest.mark.caja_blanca


# ════════ auth.get_current_user: 4 caminos ════════
def test_auth_camino_token_sin_sub(client):
    """Rama: payload sin 'sub' -> 401 'Token inválido.'"""
    t = jwt.encode({"exp": datetime.utcnow() + timedelta(days=1)}, auth.SECRET_KEY, algorithm=auth.ALGORITHM)
    r = client.get("/auth/perfil", headers={"Authorization": f"Bearer {t}"})
    assert r.status_code == 401


def test_auth_camino_usuario_borrado(client, usuario):
    """Rama: token válido pero el usuario ya no existe -> 401 'Usuario no encontrado.'"""
    db = database.SessionLocal()
    db.query(Usuario).filter_by(id=usuario["id"]).delete()
    db.commit(); db.close()
    r = client.get("/auth/perfil", headers=usuario["headers"])
    assert r.status_code == 401 and "no encontrado" in r.json()["detail"]


def test_auth_verificar_propietario_ramas():
    class U:  # usuario falso mínimo
        id = 1
    auth.verificar_propietario(U(), 1)                       # rama True: no lanza
    with pytest.raises(HTTPException) as e:
        auth.verificar_propietario(U(), 2)                   # rama False: 403
    assert e.value.status_code == 403


# ════════ verify_password: ramas del try/except ════════
@pytest.mark.parametrize("almacenado", [
    "md5$100$aaaa$bbbb",                 # algoritmo distinto
    "pbkdf2_sha256$abc$@@@$@@@",         # iteraciones no numéricas / base64 inválido
    "",                                  # vacío
])
def test_verify_password_ramas_de_error(almacenado):
    assert main.verify_password("x", almacenado) is False


# ════════ Logros: bucle while con cascada y ramas del for ════════
def _crear_rutas_finalizadas(usuario_id, n, km_cada_una):
    db = database.SessionLocal()
    for i in range(n):
        db.add(RecorridoGPS(usuario_id=usuario_id, estado="finalizada", distancia_real_km=km_cada_una,
                            origen_lat=0, origen_lon=0, destino_lat=0, destino_lon=0,
                            finished_at=datetime.utcnow()))
    db.commit(); db.close()


def test_logros_bucle_cero_iteraciones_con_cambio(client, usuario):
    """Sin rutas: ningún logro cumple la condición -> el while corre 1 vez y no cambia."""
    db = database.SessionLocal()
    u = db.get(Usuario, usuario["id"])
    assert main._desbloquear_logros(db, u) == []
    db.close()


def test_logros_cascada_puntos_desbloquean_otro_logro(client, usuario):
    """Camino del while con 2+ vueltas: los puntos de un logro desbloquean 'cien_puntos'."""
    _crear_rutas_finalizadas(usuario["id"], n=5, km_cada_una=3)       # 15 km, 5 rutas
    db = database.SessionLocal()
    u = db.get(Usuario, usuario["id"]); u.puntos = 60; db.flush()
    ids = {l["id"] for l in main._desbloquear_logros(db, u)}
    db.commit(); db.close()
    assert {"primera_ruta", "cinco_rutas", "diez_km"} <= ids
    assert "cien_puntos" in ids          # solo aparece en la 2.ª vuelta del while


def test_logros_no_se_repiten(client, usuario):
    """Rama: 'if l[id] in ya: continue' (logro ya otorgado)."""
    _crear_rutas_finalizadas(usuario["id"], 1, 1)
    db = database.SessionLocal()
    u = db.get(Usuario, usuario["id"])
    primero = main._desbloquear_logros(db, u)
    segundo = main._desbloquear_logros(db, u)
    db.commit(); db.close()
    assert primero and segundo == []


def test_sincronizar_rutas_antiguas_ramas(client, usuario):
    """3 'return' tempranos + camino completo de _sincronizar_rutas_antiguas."""
    db = database.SessionLocal()
    u = db.get(Usuario, usuario["id"])

    main._sincronizar_rutas_antiguas(db, u)                  # (a) sin rutas -> return
    assert (u.puntos or 0) == 0

    _crear_rutas_finalizadas(usuario["id"], 1, 2)
    db.expire_all(); u = db.get(Usuario, usuario["id"])
    main._sincronizar_rutas_antiguas(db, u)                  # (b) camino completo: acredita
    assert u.puntos > 0

    antes = u.puntos
    main._sincronizar_rutas_antiguas(db, u)                  # (c) ya tiene puntos -> return
    assert u.puntos == antes
    db.close()


def test_sincronizar_con_logros_previos_no_actua(client, usuario):
    _crear_rutas_finalizadas(usuario["id"], 1, 2)
    db = database.SessionLocal()
    db.add(LogroUsuario(usuario_id=usuario["id"], logro_id="primera_ruta")); db.commit()
    u = db.get(Usuario, usuario["id"])
    main._sincronizar_rutas_antiguas(db, u)                  # rama: ya tiene logros
    assert (u.puntos or 0) == 0
    db.close()


# ════════ _inicio_semana_utc: rama por día de la semana ════════
@pytest.mark.parametrize("ahora_utc,lunes_esperado_utc", [
    (datetime(2026, 11, 23, 12, 0), datetime(2026, 11, 23, 5, 0)),   # lunes
    (datetime(2026, 11, 26, 12, 0), datetime(2026, 11, 23, 5, 0)),   # jueves
    (datetime(2026, 11, 29, 12, 0), datetime(2026, 11, 23, 5, 0)),   # domingo
    (datetime(2026, 11, 23, 3, 0),  datetime(2026, 11, 16, 5, 0)),   # lunes 3:00 UTC = domingo en Bogotá
])
def test_inicio_semana_utc(monkeypatch, ahora_utc, lunes_esperado_utc):
    class FakeDT(datetime):
        @classmethod
        def utcnow(cls):
            return ahora_utc
    monkeypatch.setattr(main, "datetime", FakeDT)
    assert main._inicio_semana_utc() == lunes_esperado_utc


# ════════ routes_api: todos los caminos de _llamar_google / calcular_ruta_bicicleta ════════
class _Resp:
    def __init__(self, status=200, data=None, text=""):
        self.status_code, self._d, self.text = status, data or {}, text
    def json(self): return self._d


def _fake_httpx(respuestas):
    """Devuelve un AsyncClient falso que entrega las respuestas en orden."""
    cola = list(respuestas)
    class FakeClient:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def post(self, *a, **k):
            x = cola.pop(0)
            if isinstance(x, Exception):
                raise x
            return x
    return FakeClient


RUTA_OK = {"routes": [{"distanceMeters": 2000, "duration": "600s", "polyline": {"encodedPolyline": "abc"}}]}


@pytest.fixture
def con_api_key(monkeypatch):
    monkeypatch.setattr(routes_api, "GOOGLE_MAPS_API_KEY", "clave-de-prueba")


async def _calc():
    return await routes_api.calcular_ruta_bicicleta(4.6, -74.0, 4.7, -74.1)


def test_routes_sin_api_key(monkeypatch):
    import asyncio
    monkeypatch.setattr(routes_api, "GOOGLE_MAPS_API_KEY", "")
    with pytest.raises(routes_api.RoutesApiError) as e:
        asyncio.run(_calc())
    assert e.value.tipo == "config"


def test_routes_bicycle_ok(monkeypatch, con_api_key):
    import asyncio
    monkeypatch.setattr(routes_api.httpx, "AsyncClient", _fake_httpx([_Resp(200, RUTA_OK)]))
    r = asyncio.run(_calc())
    assert r["modoUsado"] == "BICYCLE" and r["esAproximada"] is False
    assert r["distanceMeters"] == 2000 and r["durationSeconds"] == 600


def test_routes_fallback_walk(monkeypatch, con_api_key):
    import asyncio
    monkeypatch.setattr(routes_api.httpx, "AsyncClient", _fake_httpx([_Resp(200, {}), _Resp(200, RUTA_OK)]))
    r = asyncio.run(_calc())
    assert r["modoUsado"] == "WALK" and r["esAproximada"] is True


def test_routes_sin_ninguna_ruta(monkeypatch, con_api_key):
    import asyncio
    monkeypatch.setattr(routes_api.httpx, "AsyncClient", _fake_httpx([_Resp(200, {}), _Resp(200, {})]))
    with pytest.raises(routes_api.RoutesApiError) as e:
        asyncio.run(_calc())
    assert e.value.tipo == "sin_ruta"


def test_routes_error_http_de_google(monkeypatch, con_api_key):
    import asyncio
    monkeypatch.setattr(routes_api.httpx, "AsyncClient", _fake_httpx([_Resp(403, text="forbidden")]))
    with pytest.raises(routes_api.RoutesApiError) as e:
        asyncio.run(_calc())
    assert e.value.tipo == "google"


def test_routes_error_de_red(monkeypatch, con_api_key):
    import asyncio
    err = routes_api.httpx.ConnectError("sin internet")
    monkeypatch.setattr(routes_api.httpx, "AsyncClient", _fake_httpx([err]))
    with pytest.raises(routes_api.RoutesApiError) as e:
        asyncio.run(_calc())
    assert e.value.tipo == "red"


def test_routes_duracion_sin_sufijo_s(monkeypatch, con_api_key):
    """Rama: duration no termina en 's' -> 0 segundos."""
    import asyncio
    data = {"routes": [{"distanceMeters": 10, "duration": "600"}]}
    monkeypatch.setattr(routes_api.httpx, "AsyncClient", _fake_httpx([_Resp(200, data)]))
    r = asyncio.run(_calc())
    assert r["durationSeconds"] == 0 and r["polyline"] == ""


# ════════ /rutas/calcular: ramas de validación ════════
@pytest.fixture
def google_falso(monkeypatch):
    async def ok(*a, **k):
        return {"distanceMeters": 1500, "durationSeconds": 450, "polyline": "p", "modoUsado": "WALK", "esAproximada": True}
    monkeypatch.setattr(main, "calcular_ruta_bicicleta", ok)


def test_rutas_calcular_camino_feliz(client, google_falso):
    r = client.post("/rutas/calcular", json={"origin": {"latitude": 1, "longitude": 1},
                                             "destination": {"latitude": 2, "longitude": 2}})
    assert r.status_code == 200
    j = r.json()
    assert j["distanceKm"] == 1.5 and j["durationMinutes"] == 8 and j["esAproximada"] is True


def test_rutas_calcular_origen_igual_destino(client, google_falso):
    p = {"latitude": 1, "longitude": 1}
    assert client.post("/rutas/calcular", json={"origin": p, "destination": p}).status_code == 422


def test_rutas_calcular_coordenadas_invalidas(client, google_falso):
    r = client.post("/rutas/calcular", json={"origin": {"lat": 1}, "destination": {"latitude": 1, "longitude": 1}})
    assert r.status_code == 422


def test_rutas_calcular_error_de_google_da_502(client, monkeypatch):
    async def falla(*a, **k): raise main.RoutesApiError("x", "red")
    monkeypatch.setattr(main, "calcular_ruta_bicicleta", falla)
    r = client.post("/rutas/calcular", json={"origin": {"latitude": 1, "longitude": 1},
                                             "destination": {"latitude": 2, "longitude": 2}})
    assert r.status_code == 502 and "[red]" in r.json()["detail"]


# ════════ Recorridos GPS: ramas 404 / 400 / edición ════════
def test_recorrido_inexistente_404(client, usuario):
    h = usuario["headers"]
    for m, u in [("put", "/recorridos-gps/999/iniciar"), ("put", "/recorridos-gps/999/finalizar"),
                 ("post", "/recorridos-gps/999/puntos"), ("get", "/recorridos-gps/999"),
                 ("delete", "/recorridos-gps/999"), ("put", "/recorridos-gps/999")]:
        kw = {"json": {"puntos": []}} if u.endswith("puntos") else ({"json": {}} if m == "put" and u.endswith("999") else {})
        assert getattr(client, m)(u, headers=h, **kw).status_code == 404, u


def test_iniciar_recorrido_finalizado_400(client, usuario, recorrido):
    h, rid = usuario["headers"], recorrido["id"]
    client.put(f"/recorridos-gps/{rid}/finalizar", headers=h)
    assert client.put(f"/recorridos-gps/{rid}/iniciar", headers=h).status_code == 400


def test_editar_nombres_ramas(client, usuario, recorrido):
    h, rid = usuario["headers"], recorrido["id"]
    ok = client.put(f"/recorridos-gps/{rid}", headers=h, json={"origen_desc": "  Casa ", "destino_desc": "Trabajo"})
    assert ok.json()["origen_desc"] == "Casa" and ok.json()["destino_desc"] == "Trabajo"
    assert client.put(f"/recorridos-gps/{rid}", headers=h, json={"origen_desc": "   "}).status_code == 422
    assert client.put(f"/recorridos-gps/{rid}", headers=h, json={"destino_desc": "   "}).status_code == 422
    largo = client.put(f"/recorridos-gps/{rid}", headers=h, json={"origen_desc": "x" * 500})
    assert len(largo.json()["origen_desc"]) == 120            # rama de truncado


def test_eliminar_recorrido_borra_sus_puntos(client, usuario, recorrido):
    h, rid = usuario["headers"], recorrido["id"]
    client.post(f"/recorridos-gps/{rid}/puntos", headers=h,
                json={"puntos": [{"latitude": 1, "longitude": 1}]})
    assert client.delete(f"/recorridos-gps/{rid}", headers=h).status_code == 200
    db = database.SessionLocal()
    assert db.query(PuntoGPS).filter_by(recorrido_id=rid).count() == 0
    db.close()


# ════════ Contactos de emergencia y app-rutas: ramas de actualizar/eliminar ════════
def test_actualizar_contacto_ramas(client, usuario):
    h = usuario["headers"]
    c = client.post("/contactos-emergencia", headers=h,
                    json={"nombre": "Mamá", "telefono": "300", "usuario_id": usuario["id"]}).json()
    r = client.put(f"/contactos-emergencia/{c['id']}", headers=h,
                   json={"nombre": " Papá ", "telefono": "+57 (300) 123-4567 89", "parentesco": "Padre"})
    j = r.json()
    assert j["nombre"] == "Papá" and j["telefono"] == "5730012345"          # solo dígitos, máx. 10
    assert client.put(f"/contactos-emergencia/{c['id']}", headers=h, json={}).status_code == 200  # ninguna rama
    assert client.put("/contactos-emergencia/999", headers=h, json={}).status_code == 404


def test_contacto_ajeno_403(client, usuario, otro_usuario):
    c = client.post("/contactos-emergencia", headers=usuario["headers"],
                    json={"nombre": "A", "telefono": "1", "usuario_id": usuario["id"]}).json()
    assert client.put(f"/contactos-emergencia/{c['id']}", headers=otro_usuario["headers"], json={}).status_code == 403
    assert client.delete(f"/contactos-emergencia/{c['id']}", headers=otro_usuario["headers"]).status_code == 403
    assert client.delete("/contactos-emergencia/999", headers=usuario["headers"]).status_code == 404


def test_app_rutas_ramas(client, usuario, otro_usuario):
    h = usuario["headers"]
    a = client.post("/app-rutas", headers=h, json={"distance_km": 3, "duration_seconds": 900}).json()   # date=None
    assert a["date"] is not None
    client.post("/app-rutas", headers=h, json={"distance_km": 1, "duration_seconds": 100, "date": "2026-01-01T00:00:00"})
    lista = client.get("/app-rutas", headers=h).json()
    assert len(lista) == 2 and lista[0]["id"] == a["id"]                 # orden descendente por fecha
    assert client.get("/app-rutas", headers=otro_usuario["headers"]).json() == []     # aislamiento
    assert client.delete(f"/app-rutas/{a['id']}", headers=otro_usuario["headers"]).status_code == 403
    assert client.delete("/app-rutas/999", headers=h).status_code == 404
    assert client.delete(f"/app-rutas/{a['id']}", headers=h).status_code == 200


# ════════ Rutas, puntos de servicio y documentos (CRUD) ════════
def test_rutas_y_puntos_crud(client):
    r = client.post("/rutas", json={"origen": "A", "destino": "B", "distancia": 5.5}).json()
    assert client.get(f"/rutas/{r['id']}").status_code == 200
    assert len(client.get("/rutas").json()) == 1
    assert client.get("/rutas/999").status_code == 404
    p = client.post("/puntos-servicios", json={"servicio": "Taller", "ruta_id": r["id"]}).json()
    assert len(client.get(f"/puntos-servicios/ruta/{r['id']}").json()) == 1
    assert len(client.get("/puntos-servicios").json()) == 1
    assert client.post("/puntos-servicios", json={"servicio": "Bar", "ruta_id": r["id"]}).status_code == 422
    assert client.delete(f"/puntos-servicios/{p['id']}").status_code == 200
    assert client.delete("/puntos-servicios/999").status_code == 404
    assert client.delete(f"/rutas/{r['id']}").status_code == 200
    assert client.delete("/rutas/999").status_code == 404


def test_doc_cicla(client, bici):
    body = {"fecha_emision": "2026-01-01T00:00:00", "fecha_vencimiento": "2027-01-01T00:00:00",
            "estado": "Vigente", "bicicleta_id": bici["id"]}
    assert client.post("/doc-cicla", json=body).status_code == 200
    assert client.get(f"/doc-cicla/{bici['id']}").json()["estado"] == "Vigente"
    assert client.get("/doc-cicla/999").status_code == 404


# ════════ Bicicletas: ramas faltantes ════════
def test_bicicleta_ramas_404_403(client, usuario, otro_usuario, bici):
    assert client.get(f"/bicicletas/{bici['id']}").status_code == 200
    assert client.get("/bicicletas/999").status_code == 404
    assert client.put("/bicicletas/999", headers=usuario["headers"], json={}).status_code == 404
    assert client.delete("/bicicletas/999", headers=usuario["headers"]).status_code == 404
    assert client.put(f"/bicicletas/{bici['id']}", headers=otro_usuario["headers"], json={"color": "x"}).status_code == 403
    assert client.delete(f"/bicicletas/{bici['id']}", headers=otro_usuario["headers"]).status_code == 403
    assert client.delete(f"/bicicletas/{bici['id']}", headers=usuario["headers"]).status_code == 200


# ════════ Endpoints antiguos de usuarios y recorridos ════════
def test_usuarios_legacy_registro_login(client):
    body = {"nombre": "Ana", "apellido": "P", "num_documento": "123", "tipo_documento": "CC",
            "correo": "a@t.com", "contraseña": PW_OK}
    assert client.post("/usuarios/registro", json=body).status_code == 200
    assert client.post("/usuarios/registro", json=body).status_code == 400          # duplicado
    assert client.post("/usuarios/login", json={"correo": "a@t.com", "contraseña": PW_OK}).status_code == 200
    assert client.post("/usuarios/login", json={"correo": "a@t.com", "contraseña": "mal"}).status_code == 401
    assert client.get("/usuarios/999").status_code == 404


def test_recorridos_legacy(client, usuario):
    r = client.post("/rutas", json={"origen": "A", "destino": "B"}).json()
    rec = client.post("/recorridos", json={"usuario_id": usuario["id"], "ruta_id": r["id"]}).json()
    for accion in ("pausar", "retomar", "finalizar"):
        assert client.put(f"/recorridos/{rec['id']}/{accion}").status_code == 200
        assert client.put(f"/recorridos/999/{accion}").status_code == 404
    assert len(client.get(f"/recorridos/usuario/{usuario['id']}").json()) == 1
