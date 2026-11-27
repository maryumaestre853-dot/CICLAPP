"""NIVEL 5 – Seguridad: token, caducidad, propiedad de los datos, cifrado."""
from datetime import datetime, timedelta

import pytest
from jose import jwt

import auth
import database
from models import Usuario

pytestmark = [pytest.mark.seguridad, pytest.mark.critico]

RUTAS_PROTEGIDAS = [
    ("get", "/auth/perfil"),
    ("get", "/logros"),
    ("post", "/bicicletas"),
    ("post", "/contactos-emergencia"),
    ("post", "/recorridos-gps"),
]


@pytest.mark.parametrize("metodo,ruta", RUTAS_PROTEGIDAS)
def test_CP03_sin_token_rechaza(client, metodo, ruta):
    r = getattr(client, metodo)(ruta)
    assert r.status_code in (401, 403)


@pytest.mark.parametrize("metodo,ruta", RUTAS_PROTEGIDAS)
def test_CP03_token_invalido_da_401(client, metodo, ruta):
    r = getattr(client, metodo)(ruta, headers={"Authorization": "Bearer token.falso.123"})
    assert r.status_code == 401


def test_CP03_token_caducado_da_401(client, usuario):
    caducado = jwt.encode(
        {"sub": str(usuario["id"]), "exp": datetime.utcnow() - timedelta(seconds=1)},
        auth.SECRET_KEY, algorithm=auth.ALGORITHM)
    r = client.get("/auth/perfil", headers={"Authorization": f"Bearer {caducado}"})
    assert r.status_code == 401


def test_CP03_token_firmado_con_otra_clave_da_401(client, usuario):
    falso = jwt.encode({"sub": str(usuario["id"]), "exp": datetime.utcnow() + timedelta(days=1)},
                       "otra-clave", algorithm="HS256")
    assert client.get("/auth/perfil", headers={"Authorization": f"Bearer {falso}"}).status_code == 401


def test_CP03_token_expira_en_el_futuro(usuario):
    p = jwt.decode(usuario["token"], auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
    assert datetime.utcfromtimestamp(p["exp"]) > datetime.utcnow()


def test_CP03_contrasena_se_guarda_cifrada(client, usuario):
    db = database.SessionLocal()
    guardada = db.query(Usuario).filter_by(correo="ana@test.com").one().contraseña
    db.close()
    assert "Clave123!" not in guardada and guardada.startswith("pbkdf2_sha256$")


def test_respuesta_de_login_no_expone_contrasena(client, usuario):
    r = client.post("/auth/login", json={"email": "ana@test.com", "contrasena": "Clave123!"})
    assert "pbkdf2" not in r.text and "contraseña" not in r.text


# ── Un usuario NO puede tocar datos de otro (403) ──
def test_no_ver_bicis_de_otro_usuario(client, usuario, otro_usuario):
    r = client.get(f"/bicicletas/usuario/{otro_usuario['id']}", headers=usuario["headers"])
    assert r.status_code == 403


def test_no_crear_bici_a_nombre_de_otro(client, usuario, otro_usuario):
    r = client.post("/bicicletas", headers=usuario["headers"],
                    json={"num_serie": "ZZZ1234567", "tipo": "Urbana", "usuario_id": otro_usuario["id"]})
    assert r.status_code == 403


def test_no_ver_contactos_de_emergencia_de_otro(client, usuario, otro_usuario):
    r = client.get(f"/contactos-emergencia/usuario/{otro_usuario['id']}", headers=usuario["headers"])
    assert r.status_code == 403


def test_no_ver_historial_de_otro(client, usuario, otro_usuario):
    r = client.get(f"/recorridos-gps/usuario/{otro_usuario['id']}", headers=usuario["headers"])
    assert r.status_code == 403


def test_no_finalizar_recorrido_ajeno(client, usuario, otro_usuario, recorrido):
    r = client.put(f"/recorridos-gps/{recorrido['id']}/finalizar", headers=otro_usuario["headers"])
    assert r.status_code == 403


# ── HALLAZGOS REALES del código: endpoints sin autenticación ──
# Se marcan xfail(strict=True): hoy FALLAN (documentan el defecto); cuando se corrijan,
# pytest avisa para quitar el xfail. Ver sección 9 del plan (defecto de severidad crítica/alta).
@pytest.mark.xfail(strict=True, reason="DEFECTO: GET /usuarios expone todos los usuarios sin token")
def test_DEFECTO_listar_usuarios_exige_token(client, usuario):
    assert client.get("/usuarios").status_code in (401, 403)


@pytest.mark.xfail(strict=True, reason="DEFECTO: GET /usuarios/{id} sin token")
def test_DEFECTO_usuario_por_id_exige_token(client, usuario):
    assert client.get(f"/usuarios/{usuario['id']}").status_code in (401, 403)


@pytest.mark.xfail(strict=True, reason="DEFECTO: GET /bicicletas lista las bicis de todos sin token")
def test_DEFECTO_listar_bicicletas_exige_token(client, usuario, bici):
    assert client.get("/bicicletas").status_code in (401, 403)


@pytest.mark.xfail(strict=True, reason="DEFECTO: /recorridos (modelo antiguo) sin token")
def test_DEFECTO_recorridos_antiguos_exigen_token(client, usuario):
    assert client.get(f"/recorridos/usuario/{usuario['id']}").status_code in (401, 403)
