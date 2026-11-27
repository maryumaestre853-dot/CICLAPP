from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Enum, UniqueConstraint
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime


class ContactoEmergencia(Base):
    __tablename__ = "contactos_emergencia"
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, nullable=False)
    telefono = Column(String, nullable=False)
    parentesco = Column(String)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)

    usuario = relationship("Usuario", back_populates="contactos_emergencia")

# USUARIO

class Usuario(Base):
    __tablename__ = "usuarios"
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, nullable=False)
    apellido = Column(String, nullable=False)
    nombre_completo = Column(String)
    num_documento = Column(String, unique=True, nullable=False)
    tipo_documento = Column(Enum("CC", "TI", name="tipo_documento_enum"), nullable=False)
    correo = Column(String, unique=True, nullable=False)
    telefono = Column(String)
    contraseña = Column(String, nullable=False)
    rol = Column(Enum("Usuario", "Administrador", name="rol_enum"), default="Usuario")
    puntos = Column(Integer, default=0)  # puntos acumulados por rutas y logros

    bicicletas = relationship("Bicicleta", back_populates="usuario")
    recorridos = relationship("Recorrido", back_populates="usuario")
    contactos_emergencia = relationship("ContactoEmergencia", back_populates="usuario")
    recorridos_gps = relationship("RecorridoGPS", back_populates="usuario")  # NUEVO
    logros = relationship("LogroUsuario", back_populates="usuario")


class PasswordResetCode(Base):
    __tablename__ = "password_reset_codes"

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    code_hash = Column(String, nullable=False)
    code_salt = Column(String, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    attempts = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

# BICICLETA

class Bicicleta(Base):
    __tablename__ = "bicicletas"
    id = Column(Integer, primary_key=True, index=True)
    num_serie = Column(String, unique=True, nullable=False)
    color = Column(String)
    tipo = Column(Enum("Carretera", "Urbana", "Electrica", name="tipo_bici_enum"), nullable=False)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"))
    marca = Column(String)
    modelo = Column(String)
    anio = Column(Integer)
    fecha_registro = Column(DateTime, default=datetime.utcnow)

    usuario = relationship("Usuario", back_populates="bicicletas")
    documento = relationship("DocCicla", back_populates="bicicleta", uselist=False)

# DOC_CICLA

class DocCicla(Base):
    __tablename__ = "doc_cicla"
    id = Column(Integer, primary_key=True, index=True)
    fecha_emision = Column(DateTime, nullable=False)
    fecha_vencimiento = Column(DateTime, nullable=False)
    estado = Column(String, nullable=False)
    bicicleta_id = Column(Integer, ForeignKey("bicicletas.id"), unique=True)

    bicicleta = relationship("Bicicleta", back_populates="documento")

# RUTA

class Ruta(Base):
    __tablename__ = "rutas"
    id = Column(Integer, primary_key=True, index=True)
    origen = Column(String, nullable=False)
    destino = Column(String, nullable=False)
    distancia = Column(Float)
    tiempo_estimado = Column(Integer)

    puntos_servicios = relationship("PuntoServicio", back_populates="ruta")
    recorridos = relationship("Recorrido", back_populates="ruta")

# PUNTOS_SERVICIOS

class PuntoServicio(Base):
    __tablename__ = "puntos_servicios"
    id = Column(Integer, primary_key=True, index=True)
    telefono = Column(String)
    horarios = Column(String)
    distancia = Column(Float)
    tiempo_estimado = Column(Integer)
    servicio = Column(Enum("Taller", "Zona_hidratacion", "Montallantas", name="servicio_enum"), nullable=False)
    ruta_id = Column(Integer, ForeignKey("rutas.id"))

    ruta = relationship("Ruta", back_populates="puntos_servicios")

# RECORRIDO

class Recorrido(Base):
    __tablename__ = "recorridos"
    id = Column(Integer, primary_key=True, index=True)
    fecha_hora_inicio = Column(DateTime, default=datetime.utcnow)
    fecha_hora_fin = Column(DateTime)
    fecha_hora_parada = Column(DateTime)
    fecha_hora_retomar = Column(DateTime)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"))
    ruta_id = Column(Integer, ForeignKey("rutas.id"))

    usuario = relationship("Usuario", back_populates="recorridos")
    ruta = relationship("Ruta", back_populates="recorridos")


class AppRoute(Base):
    __tablename__ = "app_routes"
    id = Column(Integer, primary_key=True, index=True)
    date = Column(DateTime, nullable=False, default=datetime.utcnow)
    distance_km = Column(Float, nullable=False)
    duration_seconds = Column(Integer, nullable=False)
    start_latitude = Column(Float)
    start_longitude = Column(Float)
    # Dueño de la ruta: cada usuario solo ve/borra las suyas.
    # Nullable para no romper filas antiguas (quedan sin dueño y no se muestran a nadie).
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True, index=True)


# ─────────────────────────────────────────────────────────────
# NUEVO — Sistema de rutas de navegación (Google Routes API)
# ─────────────────────────────────────────────────────────────
# No se tocan las tablas existentes (Ruta, Recorrido, AppRoute).
# Estas 2 tablas nuevas son ADITIVAS: guardan la ruta planificada
# por Google (con polyline) y el trayecto GPS real capturado
# durante el recorrido del ciclista.

class RecorridoGPS(Base):
    """
    Una ruta planificada + su ejecución real.
    'planificada' cuando solo se calculó con Google Routes API.
    'activa' mientras el ciclista está pedaleando.
    'finalizada' cuando el usuario presiona Finalizar.
    """
    __tablename__ = "recorridos_gps"

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)

    origen_desc = Column(String)
    origen_lat = Column(Float, nullable=False)
    origen_lon = Column(Float, nullable=False)

    destino_desc = Column(String)
    destino_lat = Column(Float, nullable=False)
    destino_lon = Column(Float, nullable=False)

    distancia_km = Column(Float)          # distancia planificada (Google)
    duracion_segundos = Column(Integer)   # duración estimada (Google)
    polyline = Column(String)             # encoded polyline de Google Routes API
    travel_mode = Column(String, default="BICYCLE")

    estado = Column(
        Enum("planificada", "activa", "finalizada", name="estado_recorrido_gps_enum"),
        default="planificada",
        nullable=False,
    )

    distancia_real_km = Column(Float)         # calculada a partir de los puntos GPS reales
    duracion_real_segundos = Column(Integer)  # tiempo real transcurrido

    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)

    usuario = relationship("Usuario", back_populates="recorridos_gps")
    puntos = relationship(
        "PuntoGPS",
        back_populates="recorrido",
        cascade="all, delete-orphan",
        order_by="PuntoGPS.recorded_at",
    )


class PuntoGPS(Base):
    """Un punto individual capturado por el GPS durante el recorrido real."""
    __tablename__ = "puntos_gps"

    id = Column(Integer, primary_key=True, index=True)
    recorrido_id = Column(Integer, ForeignKey("recorridos_gps.id"), nullable=False)

    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    speed = Column(Float, nullable=True)      # m/s, si expo-location lo reporta
    altitude = Column(Float, nullable=True)
    heading = Column(Float, nullable=True)    # grados 0-360, si está disponible
    recorded_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    recorrido = relationship("RecorridoGPS", back_populates="puntos")


class LogroUsuario(Base):
    """Logros desbloqueados por un usuario (los definidos viven en logros.py)."""
    __tablename__ = "logros_usuario"
    __table_args__ = (UniqueConstraint("usuario_id", "logro_id", name="uq_usuario_logro"),)

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    logro_id = Column(String, nullable=False)
    fecha_desbloqueo = Column(DateTime, default=datetime.utcnow)

    usuario = relationship("Usuario", back_populates="logros")
