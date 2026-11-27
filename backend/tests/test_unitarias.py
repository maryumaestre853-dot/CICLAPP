"""NIVEL 1 – Unitarias: funciones aisladas, sin base de datos ni HTTP."""
import pytest
from fastapi import HTTPException

import main
from logros import calcular_puntos_ruta

pytestmark = pytest.mark.unitaria


# ── Contraseña: partición de equivalencia + valores límite (7, 8, 9) ──
@pytest.mark.parametrize("pw", ["Ab1!xyz", "", "Ab1!xyz "])          # 7 chars, vacía, con espacio
def test_contrasena_invalida(pw):
    with pytest.raises(HTTPException) as e:
        main.validar_nueva_contrasena(pw)
    assert e.value.status_code == 400


@pytest.mark.parametrize("pw", ["Ab1!xyzw", "Ab1!xyzwq"])            # 8 y 9 chars
def test_contrasena_valida_limite(pw):
    main.validar_nueva_contrasena(pw)   # no debe lanzar


@pytest.mark.parametrize("pw,falta", [
    ("abcdefg1!", "mayúscula"), ("Abcdefgh!", "número"), ("Abcdefg12", "símbolo"),
])
def test_contrasena_requisitos_individuales(pw, falta):
    with pytest.raises(HTTPException) as e:
        main.validar_nueva_contrasena(pw)
    assert falta in e.value.detail


# ── Correo ──
@pytest.mark.parametrize("correo,valido", [
    ("ana@test.com", True), ("sin-arroba.com", False), ("a@b", False), ("a @b.com", False),
])
def test_formato_correo(correo, valido):
    assert bool(main.EMAIL_REGEX.match(correo)) is valido


def test_normalizar_correo():
    assert main.normalizar_correo("  ANA@Test.COM ") == "ana@test.com"


# ── Hash de contraseña (CP-03: contraseña cifrada) ──
def test_hash_no_guarda_texto_plano_y_verifica():
    h = main.hash_password("Clave123!")
    assert "Clave123!" not in h and h.startswith("pbkdf2_sha256$")
    assert main.verify_password("Clave123!", h)
    assert not main.verify_password("otra", h)


def test_hash_con_sal_distinta_cada_vez():
    assert main.hash_password("Clave123!") != main.hash_password("Clave123!")


def test_verify_password_con_hash_corrupto_devuelve_false():
    assert main.verify_password("x", "basura") is False


# ── Distancia (CP-10): Haversine ──
def test_haversine_mismo_punto_es_cero():
    assert main._haversine_km(4.6, -74.0, 4.6, -74.0) == 0


def test_haversine_un_grado_de_latitud():
    # 1° de latitud ≈ 111.19 km
    assert main._haversine_km(0, 0, 1, 0) == pytest.approx(111.19, rel=0.01)


def test_haversine_es_simetrica():
    a = main._haversine_km(4.60, -74.08, 4.70, -74.05)
    b = main._haversine_km(4.70, -74.05, 4.60, -74.08)
    assert a == pytest.approx(b)


def test_haversine_error_menor_5_porciento_en_trayecto_conocido():
    """Meta 2.2: error de distancia ≤ 5 %. ~2 km hacia el norte = 0.017986° de latitud."""
    d = main._haversine_km(4.0, -74.0, 4.0 + 0.017986, -74.0)
    assert abs(d - 2.0) / 2.0 <= 0.05


# ── Puntos ──
@pytest.mark.parametrize("km,esperado", [(0, 15), (None, 15), (1, 25), (2.5, 40)])
def test_puntos_por_ruta(km, esperado):
    assert calcular_puntos_ruta(km) == esperado
