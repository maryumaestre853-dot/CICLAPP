"""NIVELES 2 y 3 – Integración y sistema (caja negra) vía API, casos CP-xx del plan."""
import pytest
from conftest import PW_OK

pytestmark = [pytest.mark.integracion, pytest.mark.sistema]


# ───────── Usuarios (CP-01 a CP-03) ─────────
@pytest.mark.critico
def test_CP01_registro_ok_devuelve_token(client):
    r = client.post("/auth/registro", json={"nombre": "Ana", "email": "ana@test.com", "contrasena": PW_OK})
    assert r.status_code == 200
    assert r.json()["token"] and r.json()["usuario"]["email"] == "ana@test.com"


def test_CP01_registro_correo_duplicado(client, usuario):
    r = client.post("/auth/registro", json={"nombre": "X", "email": "ANA@test.com", "contrasena": PW_OK})
    assert r.status_code == 400


@pytest.mark.parametrize("email,pw", [
    ("correo-malo", PW_OK),          # formato inválido
    ("nuevo@test.com", "Ab1!xyz"),   # 7 caracteres
])
def test_CP01_registro_negativos(client, email, pw):
    r = client.post("/auth/registro", json={"nombre": "A", "email": email, "contrasena": pw})
    assert r.status_code == 400


def test_CP02_login_ok_y_perfil(client, usuario):
    r = client.post("/auth/login", json={"email": "ana@test.com", "contrasena": PW_OK})
    assert r.status_code == 200
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    assert client.get("/auth/perfil", headers=h).json()["nombre"] == "Ana"


def test_CP02_login_contrasena_incorrecta_y_usuario_inexistente(client, usuario):
    assert client.post("/auth/login", json={"email": "ana@test.com", "contrasena": "Mala123!"}).status_code == 401
    assert client.post("/auth/login", json={"email": "nadie@test.com", "contrasena": PW_OK}).status_code == 401


def test_CP02_editar_perfil(client, usuario):
    r = client.put("/auth/perfil", headers=usuario["headers"], json={"nombre": "Ana María"})
    assert r.status_code == 200 and r.json()["nombre"] == "Ana María"


# ───────── Ciclas (CP-04, CP-05) ─────────
def test_CP04_registrar_bici_queda_en_el_perfil(client, usuario, bici):
    r = client.get(f"/bicicletas/usuario/{usuario['id']}", headers=usuario["headers"])
    assert [b["num_serie"] for b in r.json()] == ["ABC1234567"]


@pytest.mark.parametrize("serie", ["ABC12", "ABC123456789X", "ABC-1234"])   # corta, larga, símbolo
def test_CP04_num_serie_invalido(client, usuario, serie):
    r = client.post("/bicicletas", headers=usuario["headers"],
                    json={"num_serie": serie, "tipo": "Urbana", "usuario_id": usuario["id"]})
    assert r.status_code in (400, 422)


def test_CP04_num_serie_duplicado(client, usuario, bici):
    r = client.post("/bicicletas", headers=usuario["headers"],
                    json={"num_serie": "abc1234567", "tipo": "Urbana", "usuario_id": usuario["id"]})
    assert r.status_code == 400


def test_CP05_clasificacion_por_tipo(client, usuario, bici):
    r = client.put(f"/bicicletas/{bici['id']}", headers=usuario["headers"], json={"tipo": "Electrica"})
    assert r.status_code == 200 and r.json()["tipo"] == "Electrica"
    assert client.put(f"/bicicletas/{bici['id']}", headers=usuario["headers"],
                      json={"tipo": "Monopatin"}).status_code == 422


# ───────── Recorridos (CP-09 a CP-16) ─────────
def _puntos(lat0=4.60, n=5, paso=0.0009):
    return [{"latitude": lat0 + i * paso, "longitude": -74.08, "speed": 5.0} for i in range(n)]


def test_CP09_recorrido_se_crea_planificado(recorrido):
    assert recorrido["estado"] == "planificada" and recorrido["distancia_km"] == 2.0


def test_CP10_CP11_CP12_ciclo_completo_distancia_y_duracion(client, usuario, recorrido):
    h, rid = usuario["headers"], recorrido["id"]
    assert client.put(f"/recorridos-gps/{rid}/iniciar", headers=h).json()["estado"] == "activa"
    assert client.post(f"/recorridos-gps/{rid}/puntos", headers=h, json={"puntos": _puntos()}).status_code == 200
    fin = client.put(f"/recorridos-gps/{rid}/finalizar", headers=h).json()
    assert fin["estado"] == "finalizada"
    assert fin["distancia_real_km"] == pytest.approx(0.4, rel=0.05)      # 4 tramos de ~0.1 km
    assert fin["duracion_real_segundos"] is not None
    assert fin["puntosGanados"] > 0


def test_CP13_recorrido_finalizado_llega_al_historial(client, usuario, recorrido):
    h, rid = usuario["headers"], recorrido["id"]
    client.put(f"/recorridos-gps/{rid}/iniciar", headers=h)
    client.post(f"/recorridos-gps/{rid}/puntos", headers=h, json={"puntos": _puntos()})
    client.put(f"/recorridos-gps/{rid}/finalizar", headers=h)
    hist = client.get(f"/recorridos-gps/usuario/{usuario['id']}", headers=h).json()
    assert [r["id"] for r in hist] == [rid]
    assert client.get(f"/recorridos-gps/{rid}", headers=h).status_code == 200      # CP-14 consulta


def test_CP13_recorrido_sin_finalizar_no_aparece_en_historial(client, usuario, recorrido):
    assert client.get(f"/recorridos-gps/usuario/{usuario['id']}", headers=usuario["headers"]).json() == []


def test_recorrido_finalizado_no_se_puede_modificar(client, usuario, recorrido):
    h, rid = usuario["headers"], recorrido["id"]
    client.put(f"/recorridos-gps/{rid}/finalizar", headers=h)
    assert client.put(f"/recorridos-gps/{rid}/finalizar", headers=h).status_code == 400
    assert client.post(f"/recorridos-gps/{rid}/puntos", headers=h, json={"puntos": _puntos()}).status_code == 400


def test_recorrido_sin_puntos_gps_da_distancia_cero(client, usuario, recorrido):
    """Caso de borde: 'recorrido sin señal GPS'."""
    fin = client.put(f"/recorridos-gps/{recorrido['id']}/finalizar", headers=usuario["headers"]).json()
    assert fin["distancia_real_km"] == 0


def test_CP15_CP16_estadisticas_y_logros(client, usuario, recorrido):
    h, rid = usuario["headers"], recorrido["id"]
    client.put(f"/recorridos-gps/{rid}/iniciar", headers=h)
    client.post(f"/recorridos-gps/{rid}/puntos", headers=h, json={"puntos": _puntos()})
    client.put(f"/recorridos-gps/{rid}/finalizar", headers=h)
    r = client.get("/logros", headers=h)
    assert r.status_code == 200


def test_coordenadas_invalidas_dan_422(client, usuario):
    r = client.post("/recorridos-gps", headers=usuario["headers"],
                    json={"origin": {"latitude": "x"}, "destination": {}})
    assert r.status_code == 422


# ───────── Rutas (CP-17 a CP-21): Google Routes simulado ─────────
def test_CP17_error_de_google_se_traduce_a_502(client, usuario, monkeypatch):
    import main
    async def falla(*a, **k):
        raise main.RoutesApiError("sin cuota", "google")
    monkeypatch.setattr(main, "calcular_ruta_bicicleta", falla)
    r = client.post("/recorridos-gps", headers=usuario["headers"], json={
        "origin": {"latitude": 4.6, "longitude": -74.0}, "destination": {"latitude": 4.7, "longitude": -74.0}})
    assert r.status_code == 502


# ───────── Seguridad y emergencia (parte backend de CP-22 a CP-25) ─────────
@pytest.mark.critico
def test_contacto_de_emergencia_crud(client, usuario):
    h = usuario["headers"]
    r = client.post("/contactos-emergencia", headers=h,
                    json={"nombre": "Mamá", "telefono": "3001234567", "parentesco": "Madre", "usuario_id": usuario["id"]})
    assert r.status_code == 200
    cid = r.json()["id"]
    assert len(client.get(f"/contactos-emergencia/usuario/{usuario['id']}", headers=h).json()) == 1
    assert client.delete(f"/contactos-emergencia/{cid}", headers=h).status_code == 200
    assert client.get(f"/contactos-emergencia/usuario/{usuario['id']}", headers=h).json() == []


@pytest.mark.bloqueado
@pytest.mark.skip(reason="Bloqueado/No implementado: el backend aún no expone endpoint de alerta SOS ni detección de caídas (CP-23 a CP-25)")
def test_CP23_alerta_de_emergencia_llega_al_contacto():
    ...
