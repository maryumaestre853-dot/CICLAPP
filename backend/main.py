from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy import text, func
from database import engine, get_db, apply_schema_updates
from models import (
    Base, Usuario, Bicicleta, DocCicla, Ruta, PuntoServicio, Recorrido,
    AppRoute, ContactoEmergencia, RecorridoGPS, PuntoGPS, LogroUsuario,
    PasswordResetCode,
)
from pydantic import BaseModel, field_validator
from typing import Optional, Literal, List
from datetime import datetime, timedelta
import hashlib
import base64
import os
import re
import secrets
import smtplib
from email.message import EmailMessage

from auth import crear_token, get_current_user, verificar_propietario
from logros import LOGROS, calcular_puntos_ruta
from routes_api import calcular_ruta_bicicleta, RoutesApiError

apply_schema_updates()
Base.metadata.create_all(bind=engine)  # crea recorridos_gps y puntos_gps si no existen

app = FastAPI()


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    derived = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 100_000)
    return 'pbkdf2_sha256$100000$' + base64.b64encode(salt).decode('utf-8') + '$' + base64.b64encode(derived).decode('utf-8')


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algo, iterations, salt_b64, hash_b64 = stored_hash.split('$')
        if algo != 'pbkdf2_sha256':
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(hash_b64)
        derived = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, int(iterations))
        return secrets.compare_digest(derived, expected)
    except Exception:
        return False


def build_auth_response(usuario: Usuario):
    # ANTES: token fijo 'ciclapp-demo-token' para todos los usuarios.
    # AHORA: JWT real, firmado, único por usuario y con expiración.
    token = crear_token(usuario.id, usuario.correo)
    return {
        'token': token,
        'usuario': {
            'id': usuario.id,
            'nombre': usuario.nombre,
            'email': usuario.correo,
            'activo': True,
            'puntos': usuario.puntos or 0,
            'totalKmRecorridos': 0,
            'numeroBicicletas': len(usuario.bicicletas) if usuario.bicicletas else 0,
            'fechaCreacion': datetime.utcnow().isoformat(),
            'ultimoLogin': None,
        },
    }

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """FastAPI devuelve `detail` como lista; el frontend espera un texto legible."""
    errores = exc.errors()
    primero = errores[0] if errores else {}
    campo = ".".join(str(p) for p in primero.get("loc", []) if p != "body")
    mensaje = f"Dato inválido en '{campo}': {primero.get('msg', 'formato incorrecto')}" if campo else "Datos inválidos."
    return JSONResponse(
        status_code=422,
        content={"detail": mensaje, "errors": jsonable_encoder(errores)},
    )

# ─── SCHEMAS ───────────────────────────────────────────

class UsuarioCreate(BaseModel):
    nombre: str
    apellido: str
    num_documento: str
    tipo_documento: Literal["CC", "TI"]
    correo: str
    telefono: Optional[str] = None
    contraseña: str
    rol: Optional[Literal["Usuario", "Administrador"]] = "Usuario"

class UsuarioLogin(BaseModel):
    correo: str
    contraseña: str

class AuthRegister(BaseModel):
    nombre: str
    email: str
    contrasena: str

class AuthLogin(BaseModel):
    email: str
    contrasena: str

class PasswordResetRequest(BaseModel):
    email: str

class PasswordResetVerify(BaseModel):
    email: str
    code: str

class PasswordResetConfirm(BaseModel):
    email: str
    code: str
    new_password: str

class BicicletaCreate(BaseModel):
    num_serie: str
    color: Optional[str] = None
    tipo: Literal["Carretera", "Urbana", "Electrica"]
    usuario_id: int
    marca: Optional[str] = None
    modelo: Optional[str] = None
    anio: Optional[int] = None

    @field_validator("num_serie")
    @classmethod
    def validar_num_serie(cls, v: str) -> str:
        v = v.strip().upper()
        if not (7 <= len(v) <= 12):
            raise ValueError("El número de serie debe tener entre 7 y 12 caracteres")
        if not re.fullmatch(r"[A-Z0-9]+", v):
            raise ValueError("El número de serie solo puede tener letras y números")
        return v

class BicicletaUpdate(BaseModel):
    color: Optional[str] = None
    tipo: Optional[Literal["Carretera", "Urbana", "Electrica"]] = None
    marca: Optional[str] = None
    modelo: Optional[str] = None
    anio: Optional[int] = None

class DocCiclaCreate(BaseModel):
    fecha_emision: datetime
    fecha_vencimiento: datetime
    estado: str
    bicicleta_id: int

class RutaCreate(BaseModel):
    origen: str
    destino: str
    distancia: Optional[float] = None
    tiempo_estimado: Optional[int] = None

class PuntoServicioCreate(BaseModel):
    telefono: Optional[str] = None
    horarios: Optional[str] = None
    distancia: Optional[float] = None
    tiempo_estimado: Optional[int] = None
    servicio: Literal["Taller", "Zona_hidratacion", "Montallantas"]
    ruta_id: int

class RecorridoCreate(BaseModel):
    usuario_id: int
    ruta_id: int

class AppRouteCreate(BaseModel):
    date: Optional[datetime] = None
    distance_km: float
    duration_seconds: int
    start_latitude: Optional[float] = None
    start_longitude: Optional[float] = None

class ContactoEmergenciaCreate(BaseModel):
    nombre: str
    telefono: str
    parentesco: Optional[str] = None
    usuario_id: int

# ─── USUARIOS ──────────────────────────────────────────
@app.post("/usuarios/registro", tags=["Usuarios"])
def registro(usuario: UsuarioCreate, db: Session = Depends(get_db)):
    existe = db.query(Usuario).filter(Usuario.correo == usuario.correo).first()
    if existe:
        raise HTTPException(status_code=400, detail="Correo ya registrado")
    usuario.contraseña = hash_password(usuario.contraseña)
    nuevo = Usuario(**usuario.dict())
    nuevo.nombre_completo = f"{usuario.nombre} {usuario.apellido}"
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    return nuevo

@app.post("/usuarios/login", tags=["Usuarios"])
def login(datos: UsuarioLogin, db: Session = Depends(get_db)):
    usuario = db.query(Usuario).filter(Usuario.correo == datos.correo).first()
    if not usuario or not verify_password(datos.contraseña, usuario.contraseña):
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")
    return {"mensaje": "Login exitoso", "usuario_id": usuario.id, "nombre": usuario.nombre, "rol": usuario.rol}

@app.post("/auth/registro", tags=["Auth"])
def auth_registro(datos: AuthRegister, db: Session = Depends(get_db)):
    correo = normalizar_correo(datos.email)
    if not EMAIL_REGEX.match(correo):
        raise HTTPException(status_code=400, detail="Ingresa un correo electrónico válido.")
    existe = buscar_usuario_por_correo(db, correo)
    if existe:
        raise HTTPException(status_code=400, detail="Correo ya registrado")
    validar_nueva_contrasena(datos.contrasena)

    nuevo = Usuario(
        nombre=datos.nombre,
        apellido="",
        nombre_completo=datos.nombre,
        num_documento=correo,
        tipo_documento="CC",
        correo=correo,
        telefono="",
        contraseña=hash_password(datos.contrasena),
        rol="Usuario",
    )
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    return build_auth_response(nuevo)

@app.post("/auth/login", tags=["Auth"])
def auth_login(datos: AuthLogin, db: Session = Depends(get_db)):
    usuario = buscar_usuario_por_correo(db, datos.email)
    if not usuario or not verify_password(datos.contrasena, usuario.contraseña):
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")
    return build_auth_response(usuario)


def validar_nueva_contrasena(password: str) -> None:
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 8 caracteres.")
    if any(character.isspace() for character in password):
        raise HTTPException(status_code=400, detail="La contraseña no puede contener espacios.")
    if not re.search(r"[0-9]", password):
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos un número.")
    if not re.search(r"[A-Z]", password):
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos una mayúscula.")
    if not re.search(r"[^A-Za-z0-9]", password):
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos un símbolo.")


# ─── RECUPERACIÓN DE CONTRASEÑA ────────────────────────
#
# Flujo:
#   1. POST /auth/forgot-password  {email}                      -> envía código de 6 dígitos
#   2. POST /auth/verify-code      {email, code}                -> (opcional) comprueba el código
#   3. POST /auth/reset-password   {email, code, new_password}  -> cambia la contraseña
#
# Seguridad:
#   - El código se guarda HASHEADO (PBKDF2 + salt), nunca en claro.
#   - Vence a los 10 min, máx. 5 intentos fallidos, 1 solicitud por minuto.
#   - forgot-password responde SIEMPRE igual exista o no el correo (no revela qué
#     correos están registrados). Por eso no devuelve 404.
#   - El código se borra al usarse (un solo uso).

RESET_CODE_TTL_MINUTES = 10
RESET_RESEND_COOLDOWN_SECONDS = 60
RESET_MAX_ATTEMPTS = 5
RESET_GENERIC_MESSAGE = "Si existe una cuenta con ese correo, recibirás un código de verificación."
RESET_INVALID_CODE_MESSAGE = "El código no es válido o ha vencido."
RESET_EXHAUSTED_MESSAGE = "Se agotaron los intentos. Solicita un nuevo código."
EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalizar_correo(correo: str) -> str:
    return correo.strip().lower()


def buscar_usuario_por_correo(db: Session, correo: str) -> Optional[Usuario]:
    # func.lower también encuentra cuentas viejas guardadas con mayúsculas.
    return db.query(Usuario).filter(func.lower(Usuario.correo) == normalizar_correo(correo)).first()


def _hash_codigo(codigo: str, salt: bytes) -> str:
    return base64.b64encode(
        hashlib.pbkdf2_hmac("sha256", codigo.encode("utf-8"), salt, 100_000)
    ).decode("ascii")


def smtp_configurado() -> bool:
    return bool(os.getenv("SMTP_HOST") and (os.getenv("SMTP_FROM") or os.getenv("SMTP_USERNAME")))


def enviar_codigo_recuperacion(destinatario: str, codigo: str) -> None:
    """Envía el correo. Se ejecuta en segundo plano: si falla solo se registra en el log."""
    host = os.getenv("SMTP_HOST")
    port = int(os.getenv("SMTP_PORT", "587"))
    username = os.getenv("SMTP_USERNAME")
    password = os.getenv("SMTP_PASSWORD")
    sender = os.getenv("SMTP_FROM") or username

    mensaje = EmailMessage()
    mensaje["Subject"] = "Código para restablecer tu contraseña de Ciclapp"
    mensaje["From"] = sender
    mensaje["To"] = destinatario
    mensaje.set_content(
        f"Tu código de verificación para cambiar la contraseña de Ciclapp es: {codigo}\n\n"
        f"El código vence en {RESET_CODE_TTL_MINUTES} minutos. "
        "Si no solicitaste este cambio, ignora este correo."
    )

    try:
        if port == 465:  # SSL implícito
            servidor = smtplib.SMTP_SSL(host, port, timeout=10)
        else:
            servidor = smtplib.SMTP(host, port, timeout=10)
        with servidor:
            if port != 465 and os.getenv("SMTP_USE_TLS", "true").lower() != "false":
                servidor.starttls()
            if username and password:
                servidor.login(username, password)
            servidor.send_message(mensaje)
    except (smtplib.SMTPException, OSError) as error:
        print(f"[auth] No se pudo enviar el código de recuperación: {type(error).__name__}: {error}")


def _validar_codigo(db: Session, email: str, code: str) -> tuple:
    """
    Comprueba email + código sin consumirlo. Devuelve (usuario, registro).
    Lanza 400 (código inválido/vencido/mal formado) o 429 (intentos agotados).
    """
    code = code.strip()
    if not re.fullmatch(r"[0-9]{6}", code):
        raise HTTPException(status_code=400, detail="El código debe tener 6 dígitos.")

    usuario = buscar_usuario_por_correo(db, email)
    if not usuario:
        raise HTTPException(status_code=400, detail=RESET_INVALID_CODE_MESSAGE)

    # with_for_update: bloquea la fila para que peticiones paralelas no esquiven el límite de intentos.
    registro = (
        db.query(PasswordResetCode)
        .filter(PasswordResetCode.usuario_id == usuario.id)
        .order_by(PasswordResetCode.id.desc())
        .with_for_update()
        .first()
    )
    if not registro:
        raise HTTPException(status_code=400, detail=RESET_INVALID_CODE_MESSAGE)
    if registro.expires_at <= datetime.utcnow():
        db.delete(registro)
        db.commit()
        raise HTTPException(status_code=400, detail=RESET_INVALID_CODE_MESSAGE)
    if registro.attempts >= RESET_MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail=RESET_EXHAUSTED_MESSAGE)

    esperado = _hash_codigo(code, base64.b64decode(registro.code_salt))
    if not secrets.compare_digest(registro.code_hash, esperado):
        registro.attempts += 1
        db.commit()
        if registro.attempts >= RESET_MAX_ATTEMPTS:
            raise HTTPException(status_code=429, detail=RESET_EXHAUSTED_MESSAGE)
        raise HTTPException(status_code=400, detail=RESET_INVALID_CODE_MESSAGE)

    return usuario, registro


@app.post("/auth/forgot-password", tags=["Auth"])
def auth_solicitar_recuperacion(
    datos: PasswordResetRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    correo = normalizar_correo(datos.email)
    if not EMAIL_REGEX.match(correo):
        raise HTTPException(status_code=400, detail="Ingresa un correo electrónico válido.")
    # Se comprueba ANTES de buscar al usuario: así el 503 no depende de si el correo existe.
    if not smtp_configurado():
        raise HTTPException(
            status_code=503,
            detail="El servicio de correo no está configurado. Contacta al administrador.",
        )

    usuario = buscar_usuario_por_correo(db, correo)
    if usuario:
        anterior = (
            db.query(PasswordResetCode)
            .filter(PasswordResetCode.usuario_id == usuario.id)
            .order_by(PasswordResetCode.id.desc())
            .first()
        )
        enfriamiento = datetime.utcnow() - timedelta(seconds=RESET_RESEND_COOLDOWN_SECONDS)
        if anterior and anterior.created_at > enfriamiento:
            # Pidió otro código hace menos de 1 min: no se reenvía, pero la respuesta es la misma.
            return {"message": RESET_GENERIC_MESSAGE}

        codigo = f"{secrets.randbelow(1_000_000):06d}"
        salt = os.urandom(16)
        db.query(PasswordResetCode).filter(PasswordResetCode.usuario_id == usuario.id).delete(
            synchronize_session=False
        )
        db.add(PasswordResetCode(
            usuario_id=usuario.id,
            code_hash=_hash_codigo(codigo, salt),
            code_salt=base64.b64encode(salt).decode("ascii"),
            expires_at=datetime.utcnow() + timedelta(minutes=RESET_CODE_TTL_MINUTES),
            attempts=0,
        ))
        db.commit()
        # En segundo plano: la respuesta tarda lo mismo exista o no el correo.
        background_tasks.add_task(enviar_codigo_recuperacion, usuario.correo, codigo)

    return {"message": RESET_GENERIC_MESSAGE}


@app.post("/auth/verify-code", tags=["Auth"])
def auth_verificar_codigo(datos: PasswordResetVerify, db: Session = Depends(get_db)):
    """Opcional: permite al frontend validar el código antes de pedir la nueva contraseña.
    No consume el código; los intentos fallidos sí cuentan."""
    _validar_codigo(db, datos.email, datos.code)
    return {"message": "Código válido.", "valid": True}


@app.post("/auth/reset-password", tags=["Auth"])
def auth_restablecer_contrasena(
    datos: PasswordResetConfirm,
    db: Session = Depends(get_db),
):
    validar_nueva_contrasena(datos.new_password)
    usuario, registro = _validar_codigo(db, datos.email, datos.code)

    usuario.contraseña = hash_password(datos.new_password)
    # Un solo uso: se invalidan todos los códigos pendientes del usuario.
    db.query(PasswordResetCode).filter(PasswordResetCode.usuario_id == usuario.id).delete(
        synchronize_session=False
    )
    db.commit()
    return {"message": "La contraseña se restableció correctamente."}


@app.get("/auth/perfil", tags=["Auth"])
def auth_obtener_perfil(usuario: Usuario = Depends(get_current_user)):
    """
    NUEVO — antes no existía y storage.ts lo llamaba, causando un 404.
    Usa el token para saber de quién es el perfil (no recibe id por URL).
    """
    return build_auth_response(usuario)['usuario']


@app.put("/auth/perfil", tags=["Auth"])
def auth_actualizar_perfil(
    datos: dict,
    usuario: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    print(f"[PUT /auth/perfil] usuario.id={usuario.id} correo_actual={usuario.correo} datos_recibidos={datos}")

    nombre = datos.get("nombre")
    correo = None  # el correo no se puede modificar

    if nombre:
        usuario.nombre = nombre
        usuario.nombre_completo = f"{nombre} {usuario.apellido}".strip()

    if correo:
        correo = correo.strip().lower()
        if correo != usuario.correo:
            existe = (
                db.query(Usuario)
                .filter(Usuario.correo == correo, Usuario.id != usuario.id)
                .first()
            )
            if existe:
                print(f"[PUT /auth/perfil] RECHAZADO: correo {correo} ya usado por usuario.id={existe.id}")
                raise HTTPException(status_code=400, detail="Ese correo ya está en uso por otra cuenta")

            # UPDATE directo por SQL (evita depender del estado del objeto ORM en memoria)
            db.execute(
                text("UPDATE usuarios SET correo = :correo WHERE id = :id"),
                {"correo": correo, "id": usuario.id},
            )
            print(f"[PUT /auth/perfil] UPDATE ejecutado: id={usuario.id} nuevo_correo={correo}")

    db.commit()

    # Vuelve a leer directamente de la BD para confirmar qué quedó guardado de verdad
    fila = db.execute(
        text("SELECT id, nombre, correo FROM usuarios WHERE id = :id"),
        {"id": usuario.id},
    ).fetchone()
    print(f"[PUT /auth/perfil] ESTADO FINAL EN BD: {dict(fila._mapping)}")

    db.refresh(usuario)
    return build_auth_response(usuario)['usuario']


@app.get("/usuarios/{id}", tags=["Usuarios"])
def get_usuario(id: int, db: Session = Depends(get_db)):
    usuario = db.query(Usuario).filter(Usuario.id == id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return usuario

@app.get("/usuarios", tags=["Usuarios"])
def get_usuarios(db: Session = Depends(get_db)):
    return db.query(Usuario).all()

# ─── BICICLETAS ────────────────────────────────────────
@app.post("/bicicletas", tags=["Bicicletas"])
def crear_bicicleta(
    bici: BicicletaCreate,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    # Protegido: solo puedes crear bicicletas a tu propio nombre.
    verificar_propietario(usuario_actual, bici.usuario_id)
    nueva = Bicicleta(**bici.dict())
    db.add(nueva)
    try:
        db.commit()
        db.refresh(nueva)
        return nueva
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc.orig if hasattr(exc, 'orig') else exc))
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(exc))

@app.get("/bicicletas/usuario/{usuario_id}", tags=["Bicicletas"])
def get_bicicletas_usuario(
    usuario_id: int,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    # Protegido: no puedes ver las bicicletas de otro usuario.
    verificar_propietario(usuario_actual, usuario_id)
    return db.query(Bicicleta).filter(Bicicleta.usuario_id == usuario_id).all()

@app.get("/bicicletas", tags=["Bicicletas"])
def get_bicicletas(db: Session = Depends(get_db)):
    return db.query(Bicicleta).all()

@app.get("/bicicletas/{id}", tags=["Bicicletas"])
def get_bicicleta(id: int, db: Session = Depends(get_db)):
    bici = db.query(Bicicleta).filter(Bicicleta.id == id).first()
    if not bici:
        raise HTTPException(status_code=404, detail="Bicicleta no encontrada")
    return bici

@app.put("/bicicletas/{id}", tags=["Bicicletas"])
def actualizar_bicicleta(
    id: int,
    datos: BicicletaUpdate,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    bici = db.query(Bicicleta).filter(Bicicleta.id == id).first()
    if not bici:
        raise HTTPException(status_code=404, detail="Bicicleta no encontrada")
    verificar_propietario(usuario_actual, bici.usuario_id)
    for campo, valor in datos.dict(exclude_unset=True).items():
        setattr(bici, campo, valor)
    try:
        db.commit()
        db.refresh(bici)
        return bici
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(exc))

@app.delete("/bicicletas/{id}", tags=["Bicicletas"])
def eliminar_bicicleta(
    id: int,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    bici = db.query(Bicicleta).filter(Bicicleta.id == id).first()
    if not bici:
        raise HTTPException(status_code=404, detail="Bicicleta no encontrada")
    verificar_propietario(usuario_actual, bici.usuario_id)
    db.delete(bici)
    db.commit()
    return {"mensaje": "Bicicleta eliminada"}

# ─── DOC_CICLA ─────────────────────────────────────────
@app.post("/doc-cicla", tags=["DocCicla"])
def crear_doc(doc: DocCiclaCreate, db: Session = Depends(get_db)):
    nuevo = DocCicla(**doc.dict())
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    return nuevo

@app.get("/doc-cicla/{bicicleta_id}", tags=["DocCicla"])
def get_doc(bicicleta_id: int, db: Session = Depends(get_db)):
    doc = db.query(DocCicla).filter(DocCicla.bicicleta_id == bicicleta_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    return doc

# ─── RUTAS ─────────────────────────────────────────────
@app.get("/rutas", tags=["Rutas"])
def get_rutas(db: Session = Depends(get_db)):
    return db.query(Ruta).all()

@app.get("/rutas/{id}", tags=["Rutas"])
def get_ruta(id: int, db: Session = Depends(get_db)):
    ruta = db.query(Ruta).filter(Ruta.id == id).first()
    if not ruta:
        raise HTTPException(status_code=404, detail="Ruta no encontrada")
    return ruta

@app.post("/rutas", tags=["Rutas"])
def crear_ruta(ruta: RutaCreate, db: Session = Depends(get_db)):
    nueva = Ruta(**ruta.dict())
    db.add(nueva)
    db.commit()
    db.refresh(nueva)
    return nueva

@app.delete("/rutas/{id}", tags=["Rutas"])
def eliminar_ruta(id: int, db: Session = Depends(get_db)):
    ruta = db.query(Ruta).filter(Ruta.id == id).first()
    if not ruta:
        raise HTTPException(status_code=404, detail="Ruta no encontrada")
    db.delete(ruta)
    db.commit()
    return {"mensaje": "Ruta eliminada"}

# ─── CONTACTOS DE EMERGENCIA ────────────────────────────
@app.get("/contactos-emergencia/usuario/{usuario_id}", tags=["Contactos de Emergencia"])
def get_contactos_emergencia(
    usuario_id: int,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    verificar_propietario(usuario_actual, usuario_id)
    return db.query(ContactoEmergencia).filter(ContactoEmergencia.usuario_id == usuario_id).all()

@app.post("/contactos-emergencia", tags=["Contactos de Emergencia"])
def crear_contacto(
    contacto: ContactoEmergenciaCreate,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    verificar_propietario(usuario_actual, contacto.usuario_id)
    nuevo = ContactoEmergencia(**contacto.dict())
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    return nuevo

@app.delete("/contactos-emergencia/{id}", tags=["Contactos de Emergencia"])
def eliminar_contacto(
    id: int,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    contacto = db.query(ContactoEmergencia).filter(ContactoEmergencia.id == id).first()
    if not contacto:
        raise HTTPException(status_code=404, detail="Contacto no encontrado")
    verificar_propietario(usuario_actual, contacto.usuario_id)
    db.delete(contacto)
    db.commit()
    return {"mensaje": "Contacto eliminado"}

@app.put("/contactos-emergencia/{id}", tags=["Contactos de Emergencia"])
def actualizar_contacto(
    id: int,
    datos: dict,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    contacto = db.query(ContactoEmergencia).filter(ContactoEmergencia.id == id).first()
    if not contacto:
        raise HTTPException(status_code=404, detail="Contacto no encontrado")
    verificar_propietario(usuario_actual, contacto.usuario_id)

    nombre = datos.get("nombre")
    telefono = datos.get("telefono")
    parentesco = datos.get("parentesco")

    if nombre:
        contacto.nombre = nombre.strip()

    if telefono:
        solo_digitos = "".join(ch for ch in telefono if ch.isdigit())[:10]
        contacto.telefono = solo_digitos

    if parentesco is not None:
        contacto.parentesco = parentesco

    db.commit()
    db.refresh(contacto)
    return contacto

# ─── PUNTOS DE SERVICIO ────────────────────────────────
@app.get("/puntos-servicios", tags=["Puntos de Servicio"])
def get_puntos(db: Session = Depends(get_db)):
    return db.query(PuntoServicio).all()

@app.get("/puntos-servicios/ruta/{ruta_id}", tags=["Puntos de Servicio"])
def get_puntos_ruta(ruta_id: int, db: Session = Depends(get_db)):
    return db.query(PuntoServicio).filter(PuntoServicio.ruta_id == ruta_id).all()

@app.post("/puntos-servicios", tags=["Puntos de Servicio"])
def crear_punto(punto: PuntoServicioCreate, db: Session = Depends(get_db)):
    nuevo = PuntoServicio(**punto.dict())
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    return nuevo

@app.delete("/puntos-servicios/{id}", tags=["Puntos de Servicio"])
def eliminar_punto(id: int, db: Session = Depends(get_db)):
    punto = db.query(PuntoServicio).filter(PuntoServicio.id == id).first()
    if not punto:
        raise HTTPException(status_code=404, detail="Punto de servicio no encontrado")
    db.delete(punto)
    db.commit()
    return {"mensaje": "Punto de servicio eliminado"}

# ─── RECORRIDOS ────────────────────────────────────────
@app.get("/recorridos/usuario/{usuario_id}", tags=["Recorridos"])
def get_recorridos_usuario(usuario_id: int, db: Session = Depends(get_db)):
    return db.query(Recorrido).filter(Recorrido.usuario_id == usuario_id).all()

@app.post("/recorridos", tags=["Recorridos"])
def iniciar_recorrido(datos: RecorridoCreate, db: Session = Depends(get_db)):
    nuevo = Recorrido(**datos.dict())
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    return nuevo

@app.put("/recorridos/{id}/finalizar", tags=["Recorridos"])
def finalizar_recorrido(id: int, db: Session = Depends(get_db)):
    rec = db.query(Recorrido).filter(Recorrido.id == id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Recorrido no encontrado")
    rec.fecha_hora_fin = datetime.utcnow()
    db.commit()
    return rec

@app.put("/recorridos/{id}/pausar", tags=["Recorridos"])
def pausar_recorrido(id: int, db: Session = Depends(get_db)):
    rec = db.query(Recorrido).filter(Recorrido.id == id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Recorrido no encontrado")
    rec.fecha_hora_parada = datetime.utcnow()
    db.commit()
    return rec
# ─── APP ROUTES / HISTORIAL DE RUTAS ─────────────────────────
@app.get("/app-rutas", tags=["App Rutas"])
def get_app_routes(
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    # Solo las rutas del usuario autenticado (historial exclusivo por usuario)
    return (
        db.query(AppRoute)
        .filter(AppRoute.usuario_id == usuario_actual.id)
        .order_by(AppRoute.date.desc())
        .all()
    )

@app.post("/app-rutas", tags=["App Rutas"])
def crear_app_route(
    route: AppRouteCreate,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    datos = route.dict()
    if datos["date"] is None:
        datos["date"] = datetime.utcnow()
    nueva = AppRoute(**datos, usuario_id=usuario_actual.id)
    db.add(nueva)
    db.commit()
    db.refresh(nueva)
    return nueva

@app.delete("/app-rutas/{id}", tags=["App Rutas"])
def eliminar_app_route(
    id: int,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    ruta = db.query(AppRoute).filter(AppRoute.id == id).first()
    if not ruta:
        raise HTTPException(status_code=404, detail="Ruta no encontrada")
    if ruta.usuario_id != usuario_actual.id:
        raise HTTPException(status_code=403, detail="No tienes permiso para eliminar esta ruta.")
    db.delete(ruta)
    db.commit()
    return {"mensaje": "Ruta eliminada"}
@app.put("/recorridos/{id}/retomar", tags=["Recorridos"])
def retomar_recorrido(id: int, db: Session = Depends(get_db)):
    rec = db.query(Recorrido).filter(Recorrido.id == id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Recorrido no encontrado")
    rec.fecha_hora_retomar = datetime.utcnow()
    db.commit()
    return rec


# ════════════════════════════════════════════════════════════
# NUEVO — SISTEMA DE RUTAS DE NAVEGACIÓN (Google Routes API)
# ════════════════════════════════════════════════════════════
# No reemplaza /rutas, /recorridos ni /app-rutas — son endpoints
# adicionales sobre las tablas nuevas recorridos_gps / puntos_gps.

import math


def _serializar_recorrido_gps(r: RecorridoGPS, incluir_puntos: bool = False):
    data = {
        "id": r.id,
        "usuario_id": r.usuario_id,
        "origen_desc": r.origen_desc,
        "origen_lat": r.origen_lat,
        "origen_lon": r.origen_lon,
        "destino_desc": r.destino_desc,
        "destino_lat": r.destino_lat,
        "destino_lon": r.destino_lon,
        "distancia_km": r.distancia_km,
        "duracion_segundos": r.duracion_segundos,
        "polyline": r.polyline,
        "travel_mode": r.travel_mode,
        "estado": r.estado,
        "distancia_real_km": r.distancia_real_km,
        "duracion_real_segundos": r.duracion_real_segundos,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "started_at": r.started_at.isoformat() if r.started_at else None,
        "finished_at": r.finished_at.isoformat() if r.finished_at else None,
    }
    if incluir_puntos:
        data["puntos"] = [
            {
                "id": p.id,
                "latitude": p.latitude,
                "longitude": p.longitude,
                "speed": p.speed,
                "altitude": p.altitude,
                "heading": p.heading,
                "recorded_at": p.recorded_at.isoformat() if p.recorded_at else None,
            }
            for p in r.puntos
        ]
    return data


def _haversine_km(lat1, lon1, lat2, lon2) -> float:
    """Cálculo AUXILIAR para distancia real recorrida entre puntos GPS
    consecutivos — NO se usa como sustituto de Google Routes API."""
    R = 6371
    dLat = math.radians(lat2 - lat1)
    dLon = math.radians(lon2 - lon1)
    a = (math.sin(dLat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dLon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


class CalcularRutaRequest(BaseModel):
    origin: dict    # {"latitude": 4.711, "longitude": -74.072}
    destination: dict
    origen_desc: Optional[str] = None
    destino_desc: Optional[str] = None


class PuntoGPSInput(BaseModel):
    latitude: float
    longitude: float
    speed: Optional[float] = None
    altitude: Optional[float] = None
    heading: Optional[float] = None
    recorded_at: Optional[datetime] = None


class GuardarPuntosRequest(BaseModel):
    puntos: List[PuntoGPSInput]


@app.post("/rutas/calcular", tags=["Rutas GPS"])
async def rutas_calcular(body: CalcularRutaRequest):
    """
    Llama a Google Routes API en modo BICYCLE.
    No guarda nada en BD todavía — solo calcula y devuelve la ruta
    para que el frontend la muestre antes de decidir iniciarla.
    """
    try:
        origin_lat = float(body.origin["latitude"])
        origin_lon = float(body.origin["longitude"])
        dest_lat = float(body.destination["latitude"])
        dest_lon = float(body.destination["longitude"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=422, detail="Coordenadas de origen/destino inválidas.")

    if origin_lat == dest_lat and origin_lon == dest_lon:
        raise HTTPException(status_code=422, detail="El origen y el destino no pueden ser el mismo punto.")

    try:
        resultado = await calcular_ruta_bicicleta(origin_lat, origin_lon, dest_lat, dest_lon)
    except RoutesApiError as e:
        raise HTTPException(status_code=502, detail=f"[{e.tipo}] {str(e)}")

    distance_km = round(resultado["distanceMeters"] / 1000, 2)
    duration_minutes = round(resultado["durationSeconds"] / 60)

    return {
        "distanceMeters": resultado["distanceMeters"],
        "durationSeconds": resultado["durationSeconds"],
        "distanceKm": distance_km,
        "durationMinutes": duration_minutes,
        "polyline": resultado["polyline"],
        "origin": {"latitude": origin_lat, "longitude": origin_lon},
        "destination": {"latitude": dest_lat, "longitude": dest_lon},
        # NUEVO: indica si Google uso BICYCLE de verdad o si tuvo que
        # aproximar con WALK porque no tiene datos de ciclorruta en la zona.
        "modoUsado": resultado.get("modoUsado", "BICYCLE"),
        "esAproximada": resultado.get("esAproximada", False),
    }


@app.post("/recorridos-gps", tags=["Rutas GPS"])
async def crear_recorrido_gps(
    body: CalcularRutaRequest,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    """
    Calcula la ruta con Google (BICYCLE) Y la guarda de una vez
    en estado 'planificada', asociada al usuario autenticado.
    """
    try:
        origin_lat = float(body.origin["latitude"])
        origin_lon = float(body.origin["longitude"])
        dest_lat = float(body.destination["latitude"])
        dest_lon = float(body.destination["longitude"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=422, detail="Coordenadas de origen/destino inválidas.")

    try:
        resultado = await calcular_ruta_bicicleta(origin_lat, origin_lon, dest_lat, dest_lon)
    except RoutesApiError as e:
        raise HTTPException(status_code=502, detail=f"[{e.tipo}] {str(e)}")

    nuevo = RecorridoGPS(
        usuario_id=usuario_actual.id,
        origen_desc=body.origen_desc,
        origen_lat=origin_lat,
        origen_lon=origin_lon,
        destino_desc=body.destino_desc,
        destino_lat=dest_lat,
        destino_lon=dest_lon,
        distancia_km=round(resultado["distanceMeters"] / 1000, 2),
        duracion_segundos=resultado["durationSeconds"],
        polyline=resultado["polyline"],
        # Guarda el modo REAL que uso Google (BICYCLE o el fallback WALK)
        travel_mode=resultado.get("modoUsado", "BICYCLE"),
        estado="planificada",
    )
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    return _serializar_recorrido_gps(nuevo)


@app.put("/recorridos-gps/{id}/iniciar", tags=["Rutas GPS"])
def iniciar_recorrido_gps(
    id: int,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    rec = db.query(RecorridoGPS).filter(RecorridoGPS.id == id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Recorrido no encontrado")
    verificar_propietario(usuario_actual, rec.usuario_id)
    if rec.estado == "finalizada":
        raise HTTPException(status_code=400, detail="Este recorrido ya fue finalizado.")

    rec.estado = "activa"
    rec.started_at = datetime.utcnow()
    db.commit()
    db.refresh(rec)
    return _serializar_recorrido_gps(rec)


@app.post("/recorridos-gps/{id}/puntos", tags=["Rutas GPS"])
def guardar_puntos_gps(
    id: int,
    body: GuardarPuntosRequest,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    """
    Guarda un lote de puntos GPS del recorrido (llamado periódicamente
    desde el frontend, o de una sola vez al recuperar conexión si
    estuvieron guardados en AsyncStorage durante un corte offline).
    """
    rec = db.query(RecorridoGPS).filter(RecorridoGPS.id == id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Recorrido no encontrado")
    verificar_propietario(usuario_actual, rec.usuario_id)
    if rec.estado == "finalizada":
        raise HTTPException(status_code=400, detail="No se pueden agregar puntos a un recorrido finalizado.")

    for p in body.puntos:
        db.add(PuntoGPS(
            recorrido_id=rec.id,
            latitude=p.latitude,
            longitude=p.longitude,
            speed=p.speed,
            altitude=p.altitude,
            heading=p.heading,
            recorded_at=p.recorded_at or datetime.utcnow(),
        ))
    db.commit()
    return {"mensaje": f"{len(body.puntos)} puntos guardados.", "recorrido_id": rec.id}


@app.put("/recorridos-gps/{id}/finalizar", tags=["Rutas GPS"])
def finalizar_recorrido_gps(
    id: int,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    rec = db.query(RecorridoGPS).filter(RecorridoGPS.id == id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Recorrido no encontrado")
    verificar_propietario(usuario_actual, rec.usuario_id)
    if rec.estado == "finalizada":
        raise HTTPException(status_code=400, detail="Este recorrido ya fue finalizado.")

    puntos = db.query(PuntoGPS).filter(PuntoGPS.recorrido_id == rec.id).order_by(PuntoGPS.recorded_at).all()

    distancia_real = 0.0
    for i in range(1, len(puntos)):
        distancia_real += _haversine_km(
            puntos[i - 1].latitude, puntos[i - 1].longitude,
            puntos[i].latitude, puntos[i].longitude,
        )

    rec.finished_at = datetime.utcnow()
    rec.estado = "finalizada"
    rec.distancia_real_km = round(distancia_real, 3)
    if rec.started_at:
        rec.duracion_real_segundos = int((rec.finished_at - rec.started_at).total_seconds())

    # ── Historial semanal (/app-rutas): se registra aquí, en el servidor, para que
    #    Inicio, Perfil y los retos semanales de km cuenten SIEMPRE la ruta. ──
    db.add(AppRoute(
        usuario_id=usuario_actual.id,
        date=rec.finished_at,
        distance_km=rec.distancia_real_km or 0,
        duration_seconds=rec.duracion_real_segundos or 0,
        start_latitude=rec.origen_lat,
        start_longitude=rec.origen_lon,
    ))

    # ── Puntos y logros ──
    puntos_ganados = calcular_puntos_ruta(rec.distancia_real_km or 0)
    usuario_actual.puntos = (usuario_actual.puntos or 0) + puntos_ganados
    db.flush()
    logros_nuevos = _desbloquear_logros(db, usuario_actual)

    db.commit()
    db.refresh(rec)
    db.refresh(usuario_actual)

    resp = _serializar_recorrido_gps(rec)
    resp["puntosGanados"] = puntos_ganados
    resp["puntosTotales"] = usuario_actual.puntos or 0
    resp["logrosNuevos"] = logros_nuevos
    return resp


# ════════════════════════════════════════════════════════════
# LOGROS Y PUNTOS
# ════════════════════════════════════════════════════════════

def _recorridos_finalizados(db: Session, usuario: Usuario):
    return (
        db.query(RecorridoGPS)
        .filter(RecorridoGPS.usuario_id == usuario.id, RecorridoGPS.estado == "finalizada")
        .all()
    )


def _stats_usuario(db: Session, usuario: Usuario) -> dict:
    recs = _recorridos_finalizados(db, usuario)
    return {
        "total_km": sum((r.distancia_real_km or 0) for r in recs),
        "total_rutas": len(recs),
        "puntos": usuario.puntos or 0,
    }


def _inicio_semana_utc() -> datetime:
    """Lunes 00:00 hora de Bogotá (UTC-5), expresado en UTC."""
    ahora_bogota = datetime.utcnow() - timedelta(hours=5)
    lunes = (ahora_bogota - timedelta(days=ahora_bogota.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    return lunes + timedelta(hours=5)


def _stats_semana(db: Session, usuario: Usuario) -> dict:
    inicio = _inicio_semana_utc()
    recs = [r for r in _recorridos_finalizados(db, usuario) if r.finished_at and r.finished_at >= inicio]
    return {
        "km": round(sum((r.distancia_real_km or 0) for r in recs), 2),
        "rutas": len(recs),
        "segundos": int(sum((r.duracion_real_segundos or 0) for r in recs)),
    }


def _serializar_logro(l: dict, desbloqueado: Optional[bool] = None) -> dict:
    d = {
        "id": l["id"], "titulo": l["titulo"], "descripcion": l["descripcion"],
        "emoji": l["emoji"], "tipo": l["tipo"], "puntosOtorgados": l["puntos"],
    }
    if desbloqueado is not None:
        d["desbloqueado"] = desbloqueado
    return d


def _desbloquear_logros(db: Session, usuario: Usuario) -> list:
    """Desbloquea los logros cuya condición ya se cumple. Repite hasta estabilizar,
    porque los puntos de un logro pueden desbloquear otro (p. ej. 'cien_puntos')."""
    ya = {x.logro_id for x in db.query(LogroUsuario).filter(LogroUsuario.usuario_id == usuario.id).all()}
    nuevos = []
    cambio = True
    while cambio:
        cambio = False
        stats = _stats_usuario(db, usuario)
        for l in LOGROS:
            if l["id"] in ya or not l["cond"](stats):
                continue
            db.add(LogroUsuario(usuario_id=usuario.id, logro_id=l["id"]))
            usuario.puntos = (usuario.puntos or 0) + l["puntos"]
            ya.add(l["id"])
            nuevos.append(_serializar_logro(l))
            db.flush()
            cambio = True
    return nuevos


def _sincronizar_rutas_antiguas(db: Session, usuario: Usuario) -> None:
    """Rutas finalizadas ANTES de existir los puntos: se les acreditan una sola vez.
    Solo actúa si el usuario no tiene puntos ni logros todavía."""
    if (usuario.puntos or 0) > 0:
        return
    if db.query(LogroUsuario).filter(LogroUsuario.usuario_id == usuario.id).count() > 0:
        return
    recs = _recorridos_finalizados(db, usuario)
    if not recs:
        return
    usuario.puntos = sum(calcular_puntos_ruta(r.distancia_real_km or 0) for r in recs)
    db.flush()
    _desbloquear_logros(db, usuario)
    db.commit()


@app.get("/logros", tags=["Logros"])
def obtener_logros(
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    """Puntos, estadísticas totales, progreso de la semana y logros (con su estado)."""
    _sincronizar_rutas_antiguas(db, usuario_actual)
    stats = _stats_usuario(db, usuario_actual)
    ya = {x.logro_id for x in db.query(LogroUsuario).filter(LogroUsuario.usuario_id == usuario_actual.id).all()}
    return {
        "puntos": stats["puntos"],
        "totalKm": round(stats["total_km"], 2),
        "totalRutas": stats["total_rutas"],
        "semana": _stats_semana(db, usuario_actual),
        "logros": [_serializar_logro(l, l["id"] in ya) for l in LOGROS],
    }


@app.get("/recorridos-gps/usuario/{usuario_id}", tags=["Rutas GPS"])
def historial_recorridos_gps(
    usuario_id: int,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    verificar_propietario(usuario_actual, usuario_id)
    rows = (
        db.query(RecorridoGPS)
        .filter(RecorridoGPS.usuario_id == usuario_id, RecorridoGPS.estado == "finalizada")
        .order_by(RecorridoGPS.finished_at.desc())
        .all()
    )
    return [_serializar_recorrido_gps(r) for r in rows]


class EditarNombresRutaRequest(BaseModel):
    origen_desc: Optional[str] = None
    destino_desc: Optional[str] = None


@app.put("/recorridos-gps/{id}", tags=["Rutas GPS"])
def editar_nombres_recorrido_gps(
    id: int,
    body: EditarNombresRutaRequest,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    """Edita el nombre de origen y/o destino de una ruta del historial."""
    rec = db.query(RecorridoGPS).filter(RecorridoGPS.id == id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Recorrido no encontrado")
    verificar_propietario(usuario_actual, rec.usuario_id)

    if body.origen_desc is not None:
        nombre = body.origen_desc.strip()
        if not nombre:
            raise HTTPException(status_code=422, detail="El nombre de origen no puede estar vacío.")
        rec.origen_desc = nombre[:120]
    if body.destino_desc is not None:
        nombre = body.destino_desc.strip()
        if not nombre:
            raise HTTPException(status_code=422, detail="El nombre de destino no puede estar vacío.")
        rec.destino_desc = nombre[:120]

    db.commit()
    db.refresh(rec)
    return _serializar_recorrido_gps(rec)


@app.get("/recorridos-gps/{id}", tags=["Rutas GPS"])
def detalle_recorrido_gps(
    id: int,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    """Retorna la ruta CON todos sus puntos GPS — para redibujar en el mapa."""
    rec = db.query(RecorridoGPS).filter(RecorridoGPS.id == id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Recorrido no encontrado")
    verificar_propietario(usuario_actual, rec.usuario_id)
    return _serializar_recorrido_gps(rec, incluir_puntos=True)


@app.delete("/recorridos-gps/{id}", tags=["Rutas GPS"])
def eliminar_recorrido_gps(
    id: int,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    rec = db.query(RecorridoGPS).filter(RecorridoGPS.id == id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Recorrido no encontrado")
    verificar_propietario(usuario_actual, rec.usuario_id)
    db.delete(rec)  # cascade borra también sus puntos_gps
    db.commit()
    return {"mensaje": "Recorrido eliminado."}