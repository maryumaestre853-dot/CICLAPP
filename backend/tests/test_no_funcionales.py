"""
PRUEBAS NO FUNCIONALES (caja negra, sección 3 del plan, niveles 5 a 7).
Rendimiento · Seguridad · Fiabilidad/robustez · Usabilidad (mensajes) · Compatibilidad de datos.
Los umbrales numéricos son las metas del plan (ajustables con el docente).
"""
import time
from concurrent.futures import ThreadPoolExecutor

import pytest
from conftest import PW_OK

# Metas numéricas (sección 2.2) — cámbialas aquí en un solo lugar
MAX_SEG_ENDPOINT_SIMPLE = 0.5      # respuesta de un endpoint simple
MAX_SEG_LOTE_GPS = 2.0             # guardar 500 puntos GPS
MAX_SEG_FINALIZAR_RECORRIDO = 3.0  # finalizar con 1000 puntos (Haversine en bucle)
MAX_SEG_HASH = 1.0                 # hash de contraseña (debe ser lento a propósito, pero usable)


def _tiempo(fn):
    t = time.perf_counter(); r = fn(); return r, time.perf_counter() - t


def _puntos(n):
    return [{"latitude": 4.60 + i * 0.00001, "longitude": -74.08, "speed": 5.0} for i in range(n)]


# ═══════════════ RENDIMIENTO ═══════════════
@pytest.mark.rendimiento
class TestRendimiento:
    def test_login_responde_en_tiempo_aceptable(self, client, usuario):
        r, t = _tiempo(lambda: client.post("/auth/login", json={"email": "ana@test.com", "contrasena": PW_OK}))
        assert r.status_code == 200 and t <= MAX_SEG_HASH + MAX_SEG_ENDPOINT_SIMPLE

    def test_perfil_responde_rapido(self, client, usuario):
        _, t = _tiempo(lambda: client.get("/auth/perfil", headers=usuario["headers"]))
        assert t <= MAX_SEG_ENDPOINT_SIMPLE

    def test_lote_de_500_puntos_gps(self, client, usuario, recorrido):
        r, t = _tiempo(lambda: client.post(f"/recorridos-gps/{recorrido['id']}/puntos",
                                           headers=usuario["headers"], json={"puntos": _puntos(500)}))
        assert r.status_code == 200 and t <= MAX_SEG_LOTE_GPS

    def test_finalizar_recorrido_largo_1000_puntos(self, client, usuario, recorrido):
        """Equivale a un recorrido de ~1 hora a 1 punto/3.6 s: el cálculo no debe degradarse."""
        h, rid = usuario["headers"], recorrido["id"]
        client.post(f"/recorridos-gps/{rid}/puntos", headers=h, json={"puntos": _puntos(1000)})
        r, t = _tiempo(lambda: client.put(f"/recorridos-gps/{rid}/finalizar", headers=h))
        assert r.status_code == 200 and t <= MAX_SEG_FINALIZAR_RECORRIDO

    def test_historial_con_50_recorridos(self, client, usuario, recorrido):
        h = usuario["headers"]
        for _ in range(50):
            rid = client.post("/recorridos-gps", headers=h, json={
                "origin": {"latitude": 4.6, "longitude": -74.0},
                "destination": {"latitude": 4.7, "longitude": -74.0}}).json()["id"]
            client.put(f"/recorridos-gps/{rid}/finalizar", headers=h)
        r, t = _tiempo(lambda: client.get(f"/recorridos-gps/usuario/{usuario['id']}", headers=h))
        assert len(r.json()) == 50 and t <= MAX_SEG_ENDPOINT_SIMPLE * 2

    def test_100_peticiones_seguidas_sin_degradarse(self, client, usuario):
        tiempos = [_tiempo(lambda: client.get("/auth/perfil", headers=usuario["headers"]))[1] for _ in range(100)]
        promedio = sum(tiempos) / len(tiempos)
        assert promedio <= MAX_SEG_ENDPOINT_SIMPLE
        # sin fuga de rendimiento: la última decena no es 3 veces más lenta que la primera
        assert sum(tiempos[-10:]) <= 3 * sum(tiempos[:10]) + 0.2

    def test_hash_de_contrasena_dentro_del_limite(self):
        import main
        _, t = _tiempo(lambda: main.hash_password(PW_OK))
        assert t <= MAX_SEG_HASH


# ═══════════════ SEGURIDAD ═══════════════
@pytest.mark.seguridad
@pytest.mark.no_funcional
class TestSeguridadNoFuncional:
    PAYLOADS_SQLI = ["' OR '1'='1", "'; DROP TABLE usuarios;--", "admin'--", "\" OR 1=1 --"]

    @pytest.mark.parametrize("payload", PAYLOADS_SQLI)
    def test_inyeccion_sql_en_login(self, client, usuario, payload):
        r = client.post("/auth/login", json={"email": payload, "contrasena": payload})
        assert r.status_code in (400, 401, 422)
        # la tabla sigue existiendo y el usuario también
        assert client.post("/auth/login", json={"email": "ana@test.com", "contrasena": PW_OK}).status_code == 200

    @pytest.mark.parametrize("payload", PAYLOADS_SQLI)
    def test_inyeccion_sql_en_busqueda_de_bici(self, client, usuario, payload):
        r = client.post("/bicicletas", headers=usuario["headers"],
                        json={"num_serie": payload, "tipo": "Urbana", "usuario_id": usuario["id"]})
        assert r.status_code in (400, 422)

    def test_xss_se_guarda_como_texto_no_se_ejecuta(self, client, usuario, recorrido):
        """La API devuelve JSON (no HTML): el script llega como texto plano. El frontend debe escaparlo."""
        s = "<script>alert(1)</script>"
        r = client.put(f"/recorridos-gps/{recorrido['id']}", headers=usuario["headers"], json={"origen_desc": s})
        assert r.headers["content-type"].startswith("application/json")
        assert r.json()["origen_desc"] == s

    def test_no_revela_si_el_correo_existe_en_login(self, client, usuario):
        a = client.post("/auth/login", json={"email": "ana@test.com", "contrasena": "Mala123!"})
        b = client.post("/auth/login", json={"email": "nadie@test.com", "contrasena": "Mala123!"})
        assert a.status_code == b.status_code and a.json() == b.json()

    def test_token_de_un_usuario_no_sirve_para_otro(self, client, usuario, otro_usuario):
        assert usuario["token"] != otro_usuario["token"]
        perfil = client.get("/auth/perfil", headers=usuario["headers"]).json()
        assert perfil["email"] == "ana@test.com"

    def test_cabecera_authorization_con_esquema_incorrecto(self, client, usuario):
        r = client.get("/auth/perfil", headers={"Authorization": f"Basic {usuario['token']}"})
        assert r.status_code in (401, 403)

    def test_registro_no_permite_elevar_rol_a_administrador(self, client):
        r = client.post("/auth/registro", json={"nombre": "X", "email": "x@t.com", "contrasena": PW_OK, "rol": "Administrador"})
        db_rol = None
        import database; from models import Usuario
        db = database.SessionLocal(); db_rol = db.query(Usuario).filter_by(correo="x@t.com").one().rol; db.close()
        assert r.status_code == 200 and db_rol == "Usuario"

    # ── HALLAZGOS: fallan hoy, documentan defectos (xfail estricto) ──
    @pytest.mark.xfail(strict=True, reason="DEFECTO: no hay límite de intentos de login (fuerza bruta)")
    def test_DEFECTO_bloqueo_por_intentos_fallidos(self, client, usuario):
        codigos = [client.post("/auth/login", json={"email": "ana@test.com", "contrasena": f"Mala{i}!x"}).status_code
                   for i in range(15)]
        assert 429 in codigos

    @pytest.mark.xfail(strict=True, reason="DEFECTO: /usuarios/registro devuelve el hash de la contraseña")
    def test_DEFECTO_registro_antiguo_no_expone_hash(self, client):
        r = client.post("/usuarios/registro", json={"nombre": "A", "apellido": "B", "num_documento": "1",
                        "tipo_documento": "CC", "correo": "a@t.com", "contraseña": PW_OK})
        assert "pbkdf2" not in r.text

    @pytest.mark.xfail(strict=True, reason="DEFECTO: CORS abierto a cualquier origen (allow_origins=['*'])")
    def test_DEFECTO_cors_no_es_comodin(self, client):
        r = client.options("/auth/login", headers={"Origin": "https://sitio-malicioso.com",
                                                   "Access-Control-Request-Method": "POST"})
        assert r.headers.get("access-control-allow-origin") != "*"

    @pytest.mark.xfail(strict=True, reason="DEFECTO: PUT /auth/perfil imprime el correo y datos personales en el log")
    def test_DEFECTO_no_registra_datos_personales_en_logs(self, client, usuario, capsys):
        client.put("/auth/perfil", headers=usuario["headers"], json={"nombre": "Ana"})
        assert "ana@test.com" not in capsys.readouterr().out

    @pytest.mark.xfail(strict=True, reason="DEFECTO: PUT /auth/perfil acepta cualquier dict sin validar (nombre vacío/enorme)")
    def test_DEFECTO_perfil_valida_longitud_del_nombre(self, client, usuario):
        r = client.put("/auth/perfil", headers=usuario["headers"], json={"nombre": "x" * 10000})
        assert r.status_code in (400, 422)


# ═══════════════ FIABILIDAD / ROBUSTEZ ═══════════════
@pytest.mark.fiabilidad
@pytest.mark.no_funcional
class TestFiabilidad:
    def test_json_malformado_no_tumba_el_servidor(self, client):
        r = client.post("/auth/login", content="{esto no es json", headers={"Content-Type": "application/json"})
        assert r.status_code in (400, 422)
        assert client.get("/docs").status_code == 200           # el servidor sigue vivo

    @pytest.mark.parametrize("cuerpo", [{}, {"email": None, "contrasena": None}, {"email": 123, "contrasena": []}])
    def test_tipos_incorrectos_dan_error_controlado(self, client, cuerpo):
        assert client.post("/auth/login", json=cuerpo).status_code in (400, 422)

    @pytest.mark.parametrize("lat,lon", [(999, 999), (-91, 0), (0, 181)])
    def test_puntos_gps_fuera_de_rango_no_rompen_el_servidor(self, client, usuario, recorrido, lat, lon):
        """Valor límite/inválido: el servidor no debe devolver 500."""
        r = client.post(f"/recorridos-gps/{recorrido['id']}/puntos", headers=usuario["headers"],
                        json={"puntos": [{"latitude": lat, "longitude": lon}]})
        assert r.status_code < 500

    def test_perdida_de_conexion_lote_offline_se_sincroniza_completo(self, client, usuario, recorrido):
        """El docstring del código promete subir de una vez los puntos guardados offline."""
        h, rid = usuario["headers"], recorrido["id"]
        r = client.post(f"/recorridos-gps/{rid}/puntos", headers=h, json={"puntos": _puntos(300)})
        assert r.json()["mensaje"].startswith("300")
        assert len(client.get(f"/recorridos-gps/{rid}", headers=h).json()["puntos"]) == 300

    def test_puntos_con_marcas_de_tiempo_desordenadas_se_ordenan(self, client, usuario, recorrido):
        """Los puntos offline pueden llegar desordenados: la distancia debe usar el orden cronológico."""
        h, rid = usuario["headers"], recorrido["id"]
        pts = [{"latitude": 4.600, "longitude": -74.0, "recorded_at": "2026-01-01T10:00:00"},
               {"latitude": 4.602, "longitude": -74.0, "recorded_at": "2026-01-01T10:02:00"},
               {"latitude": 4.601, "longitude": -74.0, "recorded_at": "2026-01-01T10:01:00"}]
        client.post(f"/recorridos-gps/{rid}/puntos", headers=h, json={"puntos": pts})
        d = client.put(f"/recorridos-gps/{rid}/finalizar", headers=h).json()["distancia_real_km"]
        assert d == pytest.approx(0.2224, rel=0.02)   # 0.002° ≈ 222 m, no 333 m

    def _registros_simultaneos(self):
        from fastapi.testclient import TestClient
        import main
        c = TestClient(main.app, raise_server_exceptions=False)   # 500 reales en vez de excepción
        def reg(_):
            return c.post("/auth/registro", json={"nombre": "A", "email": "dup@t.com", "contrasena": PW_OK}).status_code
        with ThreadPoolExecutor(5) as ex:
            return list(ex.map(reg, range(5)))

    def test_concurrencia_no_duplica_el_correo_en_bd(self, client):
        """Integridad: 5 registros simultáneos con el mismo correo -> solo existe 1 usuario."""
        self._registros_simultaneos()
        import database; from models import Usuario
        db = database.SessionLocal(); n = db.query(Usuario).filter_by(correo="dup@t.com").count(); db.close()
        assert n == 1

    @pytest.mark.xfail(strict=False, reason="DEFECTO: registro simultáneo con el mismo correo devuelve 500 (IntegrityError sin capturar en auth_registro)")
    def test_DEFECTO_concurrencia_no_devuelve_500(self, client):
        codigos = self._registros_simultaneos()
        assert all(c < 500 for c in codigos)

    def test_endpoint_inexistente_404_limpio(self, client):
        assert client.get("/ruta-que-no-existe").status_code == 404


# ═══════════════ USABILIDAD (mensajes de error) ═══════════════
@pytest.mark.usabilidad
@pytest.mark.no_funcional
class TestUsabilidadMensajes:
    @pytest.mark.parametrize("pw,fragmento", [
        ("Ab1!xyz", "8 caracteres"), ("abcdefg1!", "mayúscula"), ("Abcdefgh!", "número"), ("Abcdefg12", "símbolo"),
    ])
    def test_mensajes_de_contrasena_claros_y_en_espanol(self, client, pw, fragmento):
        r = client.post("/auth/registro", json={"nombre": "A", "email": "a@t.com", "contrasena": pw})
        assert fragmento in r.json()["detail"]

    def test_errores_de_validacion_son_texto_legible(self, client):
        r = client.post("/auth/registro", json={"nombre": "A"})
        assert r.status_code == 422 and isinstance(r.json()["detail"], str) and len(r.json()["detail"]) > 3

    def test_credenciales_incorrectas_mensaje_claro(self, client, usuario):
        r = client.post("/auth/login", json={"email": "ana@test.com", "contrasena": "Mala123!"})
        assert r.json()["detail"] == "Credenciales incorrectas"

    def test_token_vencido_indica_que_inicie_sesion(self, client):
        r = client.get("/auth/perfil", headers={"Authorization": "Bearer x.y.z"})
        assert "sesión" in r.json()["detail"].lower()


# ═══════════════ COMPATIBILIDAD DE DATOS ═══════════════
@pytest.mark.compatibilidad
@pytest.mark.no_funcional
class TestCompatibilidadDatos:
    @pytest.mark.parametrize("nombre", ["José Ñandú", "Zoë 🚴", "李雷", "O'Brien", "María-José"])
    def test_nombres_con_tildes_emoji_y_unicode(self, client, nombre):
        r = client.post("/auth/registro", json={"nombre": nombre, "email": f"{abs(hash(nombre))}@t.com", "contrasena": PW_OK})
        assert r.status_code == 200 and r.json()["usuario"]["nombre"] == nombre

    def test_correo_se_normaliza_mayusculas_y_espacios(self, client):
        client.post("/auth/registro", json={"nombre": "A", "email": "  MAYUS@Test.COM ", "contrasena": PW_OK})
        assert client.post("/auth/login", json={"email": "mayus@test.com", "contrasena": PW_OK}).status_code == 200

    def test_fechas_en_formato_iso_8601(self, client, usuario, recorrido):
        from datetime import datetime
        h, rid = usuario["headers"], recorrido["id"]
        client.put(f"/recorridos-gps/{rid}/iniciar", headers=h)
        j = client.get(f"/recorridos-gps/{rid}", headers=h).json()
        datetime.fromisoformat(j["started_at"])      # no lanza si es ISO válido

    def test_respuesta_es_json_utf8(self, client):
        r = client.get("/docs")
        assert "utf-8" in r.headers["content-type"].lower()
