import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";

// ─────────────────────────────────────────────────────────────
// CONFIGURACIÓN CENTRALIZADA DE API
// ─────────────────────────────────────────────────────────────
// Cambia esta URL según la IP y puerto de tu backend local/servidor
export const API_URL = "http://10.219.52.51:8000";

// Claves de Storage
const TOKEN_KEY   = "ciclapp:token";
const USER_ID_KEY = "ciclapp:userId";
const USER_NM_KEY = "ciclapp:userName";
const USER_EMAIL_KEY = "ciclapp:userEmail";
const LOGGED_KEY  = "ciclapp:loggedIn";

const CONTACTS_KEY = "ciclapp:contactos_emergencia";
const BICYCLES_KEY = "ciclapp:bicicletas";

const KEYS = {
  ROUTES: "ciclapp:routes",
  PROFILE: "ciclapp:profile",
} as const;

// ─────────────────────────────────────────────────────────────
// TIPOS E INTERFACES
// ─────────────────────────────────────────────────────────────

export interface UsuarioAPI {
  id: string;
  nombre: string;
  email: string;
  activo: boolean;
  totalKmRecorridos: number;
  numeroBicicletas: number;
  fechaCreacion: string;
  ultimoLogin: string | null;
}

export interface AuthResponse {
  token: string;
  usuario: UsuarioAPI;
}

export interface RouteRecord {
  id: string;             // ID único (remoto o timestamp local)
  date: string;           // ISO 8601: "2025-04-27T14:30:00.000Z"
  distanceKm: number;     // Kilómetros recorridos
  durationSeconds: number;// Duración total en segundos
  startLocation?: {       // Coordenadas opcionales
    latitude: number;
    longitude: number;
  };
}

export interface UserProfile {
  name: string;
  email: string;
  avatarUri?: string;
}

export interface EmergencyContact {
  id: string;
  nombre: string;
  telefono: string;
  relacion: string;
}

export interface BicycleRecord {
  id: string;
  numSerie: string;
  tipo: "Carretera" | "Urbana" | "Electrica";
  marca: string;
  modelo: string;
  anio: number;
  color: string;
  fechaRegistro: string;
}

interface AppContactResponse {
  id: number;
  nombre: string;
  telefono: string;
  parentesco?: string;
  usuario_id: number;
}

interface AppBicycleResponse {
  id: number;
  num_serie: string;
  color?: string;
  tipo: "Carretera" | "Urbana" | "Electrica";
  usuario_id: number;
  marca?: string;
  modelo?: string;
  anio?: number;
  fecha_registro?: string;
}

interface AppRouteResponse {
  id: number;
  date: string;
  distance_km: number;
  duration_seconds: number;
  start_latitude?: number;
  start_longitude?: number;
}

export interface WeekStats {
  totalKm: number;
  totalRoutes: number;
  totalSeconds: number;
}

// ─────────────────────────────────────────────────────────────
// HELPER CENTRAL: API FETCH (Con Inyección Automática de Token)
// ─────────────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  requiereAuth = true,
  timeoutMs?: number // opcional: si el servidor no responde en este tiempo, falla rápido
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };

  if (requiereAuth) {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) throw new Error("Sesión no iniciada. Vuelve a hacer login.");
    headers["Authorization"] = `Bearer ${token}`;
  }

  let res: Response;
  const controller = timeoutMs ? new AbortController() : undefined;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
      ...(controller ? { signal: controller.signal } : {}),
    });
  } catch (error: any) {
    console.error("apiFetch fetch error", path, error);
    if (error?.name === "AbortError") {
      throw new Error("El servidor tardó demasiado en responder.");
    }
    throw new Error(
      `No se pudo conectar con el servidor. Verifica que el backend esté corriendo y la red sea accesible. ${error?.message ?? ""}`
    );
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (res.status === 401) {
    if (requiereAuth) {
      // El token guardado ya no sirve (expiró o el backend fue reiniciado).
      // Borramos la sesión y mandamos al usuario a /login de inmediato,
      // en vez de dejarlo atascado en la pantalla actual.
      await cerrarSesion();
      router.replace("/login");
      throw new Error("Sesión expirada. Inicia sesión de nuevo.");
    }
    // 401 en un endpoint público (login/registro) = credenciales incorrectas,
    // no una sesión vencida. Dejamos que el mensaje real del backend se muestre.
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || body.message || "Credenciales incorrectas.");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message =
      body.detail ||
      body.message ||
      (typeof body === "string" ? body : JSON.stringify(body)) ||
      `Error ${res.status}`;
    throw new Error(message);
  }

  // Manejo de respuestas 204 No Content
  if (res.status === 204) {
    return {} as T;
  }

  return res.json();
}

// ─────────────────────────────────────────────────────────────
// SESIÓN Y AUTENTICACIÓN LOCAL / REMOTA
// ─────────────────────────────────────────────────────────────

/**
 * Borra TODO lo guardado localmente que pertenece a un usuario (rutas, bicicletas,
 * contactos, fotos, cola de puntos GPS, destinos recientes). Así, al iniciar sesión
 * con otra cuenta nunca aparecen datos de la cuenta anterior.
 */
async function limpiarCachesDeUsuario(): Promise<void> {
  const fijas = [
    KEYS.ROUTES,
    CONTACTS_KEY,
    BICYCLES_KEY,
    "ciclapp:puntos_gps_pendientes",
    "ciclapp:recent_destinations",
  ];
  let fotos: string[] = [];
  try {
    const todas = await AsyncStorage.getAllKeys();
    fotos = todas.filter((k) => k.startsWith("ciclapp:foto_bici:"));
  } catch {
    // si falla, se limpian al menos las claves fijas
  }
  await AsyncStorage.multiRemove([...fijas, ...fotos]);
}

async function guardarSesion(data: AuthResponse): Promise<void> {
  // Si entra un usuario distinto al anterior, se descartan los datos locales del anterior.
  const previo = await AsyncStorage.getItem(USER_ID_KEY);
  if (previo !== String(data.usuario.id)) {
    await limpiarCachesDeUsuario();
  }
  await AsyncStorage.multiSet([
    [TOKEN_KEY,       String(data.token)],
    [USER_ID_KEY,     String(data.usuario.id)],
    [USER_NM_KEY,     String(data.usuario.nombre)],
    [USER_EMAIL_KEY,  String(data.usuario.email)],
    [LOGGED_KEY,      "true"],
  ]);
}

export async function cerrarSesion(): Promise<void> {
  await AsyncStorage.multiRemove([TOKEN_KEY, USER_ID_KEY, USER_NM_KEY, USER_EMAIL_KEY, LOGGED_KEY, KEYS.PROFILE]);
  await limpiarCachesDeUsuario();
}

export async function estaLogueado(): Promise<boolean> {
  return (await AsyncStorage.getItem(LOGGED_KEY)) === "true";
}

export async function obtenerIdUsuarioLocal(): Promise<string | null> {
  return AsyncStorage.getItem(USER_ID_KEY);
}

export async function obtenerNombreLocal(): Promise<string | null> {
  return AsyncStorage.getItem(USER_NM_KEY);
}

export async function obtenerEmailLocal(): Promise<string | null> {
  return AsyncStorage.getItem(USER_EMAIL_KEY);
}

/** Registra un usuario nuevo */
export async function registrar(
  nombre: string,
  email: string,
  contrasena: string
): Promise<AuthResponse> {
  const data = await apiFetch<AuthResponse>(
    "/auth/registro",
    { method: "POST", body: JSON.stringify({ nombre, email, contrasena }) },
    false
  );
  await guardarSesion(data);
  return data;
}

/** Inicia sesión */
export async function login(
  email: string,
  contrasena: string
): Promise<AuthResponse> {
  const data = await apiFetch<AuthResponse>(
    "/auth/login",
    { method: "POST", body: JSON.stringify({ email, contrasena }) },
    false
  );
  await guardarSesion(data);
  return data;
}

export async function solicitarRecuperacionContrasena(email: string): Promise<void> {
  await apiFetch<{ message: string }>(
    "/auth/forgot-password",
    { method: "POST", body: JSON.stringify({ email }) },
    false
  );
}

export async function restablecerContrasena(
  email: string,
  codigo: string,
  contrasena: string
): Promise<void> {
  await apiFetch<{ message: string }>(
    "/auth/reset-password",
    {
      method: "POST",
      body: JSON.stringify({ email, code: codigo, new_password: contrasena }),
    },
    false
  );
}

/** Obtiene el perfil del usuario autenticado */
export async function obtenerPerfil(): Promise<UsuarioAPI> {
  return apiFetch<UsuarioAPI>("/auth/perfil");
}

/** Actualiza el nombre y/o correo del usuario autenticado */
export async function actualizarPerfil(nombre: string, correo?: string): Promise<UsuarioAPI> {
  return apiFetch<UsuarioAPI>("/auth/perfil", {
    method: "PUT",
    body: JSON.stringify({ nombre, correo }),
  });
}

export async function loadEmergencyContacts(): Promise<EmergencyContact[]> {
  try {
    const userId = await obtenerIdUsuarioLocal();
    if (!userId) throw new Error("Usuario no autenticado");

    const data = await apiFetch<AppContactResponse[]>(
      "/contactos-emergencia/usuario/" + userId
    );

    const mapped = data.map((item) => ({
      id: item.id.toString(),
      nombre: item.nombre,
      telefono: item.telefono,
      relacion: item.parentesco || "Otro",
    }));

    await AsyncStorage.setItem(CONTACTS_KEY, JSON.stringify(mapped));
    return mapped;
  } catch {
    const raw = await AsyncStorage.getItem(CONTACTS_KEY);
    return raw ? JSON.parse(raw) : [];
  }
}

export async function saveEmergencyContact(
  contact: Omit<EmergencyContact, "id">
): Promise<EmergencyContact> {
  const userId = await obtenerIdUsuarioLocal();
  if (!userId) throw new Error("Usuario no autenticado");

  const created = await apiFetch<AppContactResponse>(
    "/contactos-emergencia",
    {
      method: "POST",
      body: JSON.stringify({
        nombre: contact.nombre,
        telefono: contact.telefono,
        parentesco: contact.relacion,
        usuario_id: Number(userId),
      }),
    }
  );

  const result = {
    id: created.id.toString(),
    nombre: created.nombre,
    telefono: created.telefono,
    relacion: created.parentesco || "Otro",
  };

  const current = await loadEmergencyContacts();
  const updated = [result, ...current.filter((c) => c.id !== result.id)];
  await AsyncStorage.setItem(CONTACTS_KEY, JSON.stringify(updated));
  return result;
}

export async function deleteEmergencyContact(id: string): Promise<void> {
  const remoteId = Number(id);
  if (Number.isNaN(remoteId)) return;
  try {
    await apiFetch<void>(`/contactos-emergencia/${remoteId}`, {
      method: "DELETE",
    });
  } catch (error) {
    console.warn("No se pudo borrar el contacto en el servidor:", error);
  }
}

/** Edita un contacto de emergencia existente (nombre, teléfono y/o relación) */
export async function updateEmergencyContact(
  id: string,
  contact: Omit<EmergencyContact, "id">
): Promise<EmergencyContact> {
  const updated = await apiFetch<AppContactResponse>(
    `/contactos-emergencia/${id}`,
    {
      method: "PUT",
      body: JSON.stringify({
        nombre: contact.nombre,
        telefono: contact.telefono,
        parentesco: contact.relacion,
      }),
    }
  );

  const result: EmergencyContact = {
    id: updated.id.toString(),
    nombre: updated.nombre,
    telefono: updated.telefono,
    relacion: updated.parentesco || "Otro",
  };

  const current = await loadEmergencyContacts();
  const refreshed = current.map((c) => (c.id === result.id ? result : c));
  await AsyncStorage.setItem(CONTACTS_KEY, JSON.stringify(refreshed));
  return result;
}

export async function loadBicycles(): Promise<BicycleRecord[]> {
  try {
    const userId = await obtenerIdUsuarioLocal();
    if (!userId) throw new Error("Usuario no autenticado");

    const data = await apiFetch<AppBicycleResponse[]>(
      "/bicicletas/usuario/" + userId,
      {},
      true,
      6000
    );

    const mapped = data.map((item) => ({
      id: item.id.toString(),
      numSerie: item.num_serie,
      tipo: item.tipo,
      marca: item.marca || "",
      modelo: item.modelo || "",
      anio: item.anio ?? 0,
      color: item.color || "No especificado",
      fechaRegistro: item.fecha_registro || new Date().toISOString(),
    }));

    await AsyncStorage.setItem(BICYCLES_KEY, JSON.stringify(mapped));
    return mapped;
  } catch {
    const raw = await AsyncStorage.getItem(BICYCLES_KEY);
    return raw ? JSON.parse(raw) : [];
  }
}

export async function saveBicycle(
  bicycle: Omit<BicycleRecord, "id" | "fechaRegistro">
): Promise<BicycleRecord> {
  const userId = await obtenerIdUsuarioLocal();
  if (!userId) throw new Error("Usuario no autenticado");

  const created = await apiFetch<AppBicycleResponse>(
    "/bicicletas",
    {
      method: "POST",
      body: JSON.stringify({
        num_serie: bicycle.numSerie,
        color: bicycle.color,
        tipo: bicycle.tipo,
        usuario_id: Number(userId),
        marca: bicycle.marca,
        modelo: bicycle.modelo,
        anio: bicycle.anio,
      }),
    },
    true,
    6000
  );

  const result = {
    id: created.id.toString(),
    numSerie: created.num_serie,
    tipo: created.tipo,
    marca: created.marca || "",
    modelo: created.modelo || "",
    anio: created.anio ?? 0,
    color: created.color || "No especificado",
    fechaRegistro: created.fecha_registro || new Date().toISOString(),
  };

  const current = await loadBicycles();
  const updated = [result, ...current];
  await AsyncStorage.setItem(BICYCLES_KEY, JSON.stringify(updated));
  return result;
}

// ─────────────────────────────────────────────────────────────
// NUEVO — EDITAR / ELIMINAR BICICLETA + FOTO LOCAL
// ─────────────────────────────────────────────────────────────

const BIKE_PHOTO_PREFIX = "ciclapp:foto_bici:";

function mapBici(item: AppBicycleResponse): BicycleRecord {
  return {
    id: item.id.toString(),
    numSerie: item.num_serie,
    tipo: item.tipo,
    marca: item.marca || "",
    modelo: item.modelo || "",
    anio: item.anio ?? 0,
    color: item.color || "No especificado",
    fechaRegistro: item.fecha_registro || new Date().toISOString(),
  };
}

/** Edita una bicicleta (PUT /bicicletas/{id}) y actualiza el respaldo local. */
export async function updateBicycle(
  id: string,
  data: Pick<BicycleRecord, "tipo" | "marca" | "modelo" | "anio" | "color">
): Promise<BicycleRecord> {
  const updated = await apiFetch<AppBicycleResponse>(
    `/bicicletas/${id}`,
    {
      method: "PUT",
      body: JSON.stringify({
        tipo: data.tipo,
        marca: data.marca,
        modelo: data.modelo,
        anio: data.anio,
        color: data.color,
      }),
    },
    true,
    6000
  );

  const result = mapBici(updated);
  const raw = await AsyncStorage.getItem(BICYCLES_KEY);
  const current: BicycleRecord[] = raw ? JSON.parse(raw) : [];
  await AsyncStorage.setItem(
    BICYCLES_KEY,
    JSON.stringify(current.map((b) => (b.id === result.id ? result : b)))
  );
  return result;
}

/** Elimina una bicicleta en el servidor y en el respaldo local. */
export async function deleteBicycle(id: string): Promise<void> {
  await apiFetch<void>(`/bicicletas/${id}`, { method: "DELETE" }, true, 6000);

  const raw = await AsyncStorage.getItem(BICYCLES_KEY);
  const current: BicycleRecord[] = raw ? JSON.parse(raw) : [];
  await AsyncStorage.setItem(BICYCLES_KEY, JSON.stringify(current.filter((b) => b.id !== id)));
  await AsyncStorage.removeItem(BIKE_PHOTO_PREFIX + id);
}

/** Foto personalizada de la bici (solo en este dispositivo). */
export async function getBicyclePhoto(id: string): Promise<string | null> {
  return AsyncStorage.getItem(BIKE_PHOTO_PREFIX + id);
}

export async function setBicyclePhoto(id: string, uri: string): Promise<void> {
  await AsyncStorage.setItem(BIKE_PHOTO_PREFIX + id, uri);
}

export async function loadBicyclePhotos(ids: string[]): Promise<Record<string, string>> {
  const pares = await AsyncStorage.multiGet(ids.map((i) => BIKE_PHOTO_PREFIX + i));
  const mapa: Record<string, string> = {};
  pares.forEach(([k, v]) => {
    if (v) mapa[k.replace(BIKE_PHOTO_PREFIX, "")] = v;
  });
  return mapa;
}

// ─────────────────────────────────────────────────────────────
// GESTIÓN DE RUTAS (Local + Servidor)
// ─────────────────────────────────────────────────────────────

async function loadRoutesFromStorage(): Promise<RouteRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.ROUTES);
    if (!raw) return [];
    const parsed: RouteRecord[] = JSON.parse(raw);
    return parsed.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  } catch {
    return [];
  }
}

/** Carga todas las rutas guardadas (intenta primero backend, cae a local) */
export async function loadRoutes(): Promise<RouteRecord[]> {
  try {
    const data = await apiFetch<AppRouteResponse[]>("/app-rutas");
    const mapped: RouteRecord[] = data
      .map((item) => ({
        id: item.id.toString(),
        date: new Date(item.date).toISOString(),
        distanceKm: item.distance_km,
        durationSeconds: item.duration_seconds,
        startLocation:
          item.start_latitude != null && item.start_longitude != null
            ? {
                latitude: item.start_latitude,
                longitude: item.start_longitude,
              }
            : undefined,
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    await AsyncStorage.setItem(KEYS.ROUTES, JSON.stringify(mapped));
    return mapped;
  } catch {
    return loadRoutesFromStorage();
  }
}

/** Guarda una nueva ruta tanto en local como en el servidor */
export async function saveRoute(route: RouteRecord): Promise<void> {
  const current = await loadRoutesFromStorage();
  const updated = [route, ...current];
  await AsyncStorage.setItem(KEYS.ROUTES, JSON.stringify(updated));

  try {
    const created = await apiFetch<AppRouteResponse>("/app-rutas", {
      method: "POST",
      body: JSON.stringify({
        date: route.date,
        distance_km: route.distanceKm,
        duration_seconds: route.durationSeconds,
        start_latitude: route.startLocation?.latitude,
        start_longitude: route.startLocation?.longitude,
      }),
    });

    const syncedRoute: RouteRecord = {
      ...route,
      id: created.id.toString(),
    };
    const syncedList = [syncedRoute, ...current];
    await AsyncStorage.setItem(KEYS.ROUTES, JSON.stringify(syncedList));
  } catch (error) {
    console.warn("No se pudo guardar la ruta en el servidor:", error);
  }
}

/** Elimina una ruta local y remotamente */
export async function deleteRoute(id: string): Promise<void> {
  const current = await loadRoutesFromStorage();
  const updated = current.filter((r) => r.id !== id);
  await AsyncStorage.setItem(KEYS.ROUTES, JSON.stringify(updated));

  const remoteId = Number(id);
  if (!Number.isNaN(remoteId)) {
    try {
      await apiFetch<void>(`/app-rutas/${remoteId}`, {
        method: "DELETE",
      });
    } catch (error) {
      console.warn("No se pudo borrar la ruta en el servidor:", error);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// PERFIL LOCAL
// ─────────────────────────────────────────────────────────────

const DEFAULT_PROFILE: UserProfile = {
  name: "Ciclista Bogotano",
  email: "ciclista@ciclapp.co",
};

export async function loadProfile(): Promise<UserProfile> {
  try {
    const [raw, name, email] = await Promise.all([
      AsyncStorage.getItem(KEYS.PROFILE),
      AsyncStorage.getItem(USER_NM_KEY),
      AsyncStorage.getItem(USER_EMAIL_KEY),
    ]);

    if (raw) {
      return JSON.parse(raw);
    }

    if (name || email) {
      return {
        name: name || DEFAULT_PROFILE.name,
        email: email || DEFAULT_PROFILE.email,
      };
    }

    return DEFAULT_PROFILE;
  } catch {
    return DEFAULT_PROFILE;
  }
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  await Promise.all([
    AsyncStorage.setItem(KEYS.PROFILE, JSON.stringify(profile)),
    AsyncStorage.setItem(USER_NM_KEY, profile.name),
    AsyncStorage.setItem(USER_EMAIL_KEY, profile.email),
  ]);
}

// ─────────────────────────────────────────────────────────────
// UTILIDADES Y ESTADÍSTICAS CALCULADAS
// ─────────────────────────────────────────────────────────────

/**
 * Calcula estadísticas de la semana actual (lunes–domingo).
 */
export function calcWeekStats(routes: RouteRecord[]): WeekStats {
  const now = new Date();
  const startOfWeek = new Date(now);
  const day = now.getDay(); // 0 = domingo
  const diff = day === 0 ? -6 : 1 - day; // ajuste para semana lunes-domingo
  startOfWeek.setDate(now.getDate() + diff);
  startOfWeek.setHours(0, 0, 0, 0);

  const weekRoutes = routes.filter(
    (r) => new Date(r.date).getTime() >= startOfWeek.getTime()
  );

  return {
    totalKm: weekRoutes.reduce((sum, r) => sum + r.distanceKm, 0),
    totalRoutes: weekRoutes.length,
    totalSeconds: weekRoutes.reduce((sum, r) => sum + r.durationSeconds, 0),
  };
}

/** Formatea segundos a texto comprensible ("1 h 23 min" o "45 min") */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} seg`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h} h ${rem} min` : `${h} h`;
}

// ─────────────────────────────────────────────────────────────
// NUEVO — SISTEMA DE RUTAS GPS (Google Routes API + tracking)
// ─────────────────────────────────────────────────────────────
// Todo esto llama al backend nuevo (/rutas/calcular, /recorridos-gps/*).
// No reemplaza loadRoutes/saveRoute (que siguen usando /app-rutas).

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface RutaCalculada {
  distanceMeters: number;
  durationSeconds: number;
  distanceKm: number;
  durationMinutes: number;
  polyline: string;          // encoded polyline de Google — decodificar en el mapa
  origin: LatLng;
  destination: LatLng;
  // NUEVO: Google no siempre tiene datos de ciclorruta (ej. Bogota).
  // Si esAproximada=true, la ruta es en realidad WALK, usada como
  // aproximacion — mostrar un aviso al usuario.
  modoUsado: "BICYCLE" | "WALK";
  esAproximada: boolean;
}

export interface RecorridoGPS {
  id: number;
  usuario_id: number;
  origen_desc: string | null;
  origen_lat: number;
  origen_lon: number;
  destino_desc: string | null;
  destino_lat: number;
  destino_lon: number;
  distancia_km: number | null;
  duracion_segundos: number | null;
  polyline: string | null;
  travel_mode: string;
  estado: "planificada" | "activa" | "finalizada";
  distancia_real_km: number | null;
  duracion_real_segundos: number | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  puntos?: PuntoGPS[];
}

export interface PuntoGPS {
  id?: number;
  latitude: number;
  longitude: number;
  speed?: number | null;
  altitude?: number | null;
  heading?: number | null;
  recorded_at?: string;
}

/** Calcula una ruta en bicicleta SIN guardarla (para previsualizar en el mapa). */
export async function calcularRuta(
  origin: LatLng,
  destination: LatLng,
  origenDesc?: string,
  destinoDesc?: string
): Promise<RutaCalculada> {
  return apiFetch<RutaCalculada>("/rutas/calcular", {
    method: "POST",
    body: JSON.stringify({
      origin, destination,
      origen_desc: origenDesc, destino_desc: destinoDesc,
    }),
  });
}

/** Calcula Y guarda la ruta en la base de datos, estado 'planificada'. */
export async function crearRecorridoGPS(
  origin: LatLng,
  destination: LatLng,
  origenDesc?: string,
  destinoDesc?: string
): Promise<RecorridoGPS> {
  return apiFetch<RecorridoGPS>("/recorridos-gps", {
    method: "POST",
    body: JSON.stringify({
      origin, destination,
      origen_desc: origenDesc, destino_desc: destinoDesc,
    }),
  });
}

/** Marca el recorrido como 'activa' y comienza el tracking. */
export async function iniciarRecorridoGPS(id: number): Promise<RecorridoGPS> {
  return apiFetch<RecorridoGPS>(`/recorridos-gps/${id}/iniciar`, { method: "PUT" });
}

/** Envía un lote de puntos GPS capturados durante el recorrido. */
export async function guardarPuntosGPS(id: number, puntos: PuntoGPS[]): Promise<void> {
  await apiFetch(`/recorridos-gps/${id}/puntos`, {
    method: "POST",
    body: JSON.stringify({ puntos }),
  });
}

/** Finaliza el recorrido y calcula la distancia/duración reales. */
export async function finalizarRecorridoGPS(id: number): Promise<RecorridoGPSFinalizado> {
  return apiFetch<RecorridoGPSFinalizado>(`/recorridos-gps/${id}/finalizar`, { method: "PUT" });
}

// ─────────────────────────────────────────────────────────────
// LOGROS Y PUNTOS
// ─────────────────────────────────────────────────────────────

export interface LogroAPI {
  id: string;
  titulo: string;
  descripcion: string;
  emoji: string;
  tipo: "bronce" | "plata" | "oro";
  puntosOtorgados: number;
  desbloqueado?: boolean;
}

export interface RecorridoGPSFinalizado extends RecorridoGPS {
  puntosGanados: number;
  puntosTotales: number;
  logrosNuevos: LogroAPI[];
}

export interface LogrosResponse {
  puntos: number;
  totalKm: number;
  totalRutas: number;
  /** Progreso de la semana actual (lunes a domingo), calculado en el servidor. */
  semana: { km: number; rutas: number; segundos: number };
  logros: LogroAPI[];
}

/** Puntos, estadísticas, progreso semanal y logros del usuario autenticado. */
export async function misLogros(): Promise<LogrosResponse> {
  return apiFetch<LogrosResponse>("/logros");
}

/** Historial de recorridos GPS finalizados del usuario autenticado. */
export async function historialRecorridosGPS(): Promise<RecorridoGPS[]> {
  const userId = await obtenerIdUsuarioLocal();
  if (!userId) throw new Error("Usuario no autenticado");
  return apiFetch<RecorridoGPS[]>(`/recorridos-gps/usuario/${userId}`);
}

/** Edita el nombre de origen y/o destino de una ruta del historial. */
export async function editarNombresRecorridoGPS(
  id: number,
  nombres: { origen_desc?: string; destino_desc?: string }
): Promise<RecorridoGPS> {
  return apiFetch<RecorridoGPS>(`/recorridos-gps/${id}`, {
    method: "PUT",
    body: JSON.stringify(nombres),
  });
}

/** Detalle de un recorrido GPS, incluyendo todos sus puntos (para redibujar en el mapa). */
export async function detalleRecorridoGPS(id: number): Promise<RecorridoGPS> {
  return apiFetch<RecorridoGPS>(`/recorridos-gps/${id}`);
}

// ─────────────────────────────────────────────────────────────
// NUEVO — Cola offline de puntos GPS
// ─────────────────────────────────────────────────────────────
// Si se pierde Internet durante un recorrido activo, los puntos
// se acumulan aquí en vez de perderse. Al recuperar conexión,
// sincronizarPuntosPendientes() los manda todos al backend.

const PENDING_POINTS_KEY = "ciclapp:puntos_gps_pendientes";

type PuntoPendiente = PuntoGPS & { recorrido_id: number };

export async function encolarPuntoOffline(recorridoId: number, punto: PuntoGPS): Promise<void> {
  const raw = await AsyncStorage.getItem(PENDING_POINTS_KEY);
  const pendientes: PuntoPendiente[] = raw ? JSON.parse(raw) : [];
  pendientes.push({ ...punto, recorrido_id: recorridoId });
  await AsyncStorage.setItem(PENDING_POINTS_KEY, JSON.stringify(pendientes));
}

/** Intenta enviar todos los puntos pendientes. Los que fallan quedan para el próximo intento. */
export async function sincronizarPuntosPendientes(): Promise<number> {
  const raw = await AsyncStorage.getItem(PENDING_POINTS_KEY);
  const pendientes: PuntoPendiente[] = raw ? JSON.parse(raw) : [];
  if (pendientes.length === 0) return 0;

  const porRecorrido = new Map<number, PuntoGPS[]>();
  for (const p of pendientes) {
    const { recorrido_id, ...resto } = p;
    if (!porRecorrido.has(recorrido_id)) porRecorrido.set(recorrido_id, []);
    porRecorrido.get(recorrido_id)!.push(resto);
  }

  let enviados = 0;
  for (const [recorridoId, puntos] of porRecorrido) {
    try {
      await guardarPuntosGPS(recorridoId, puntos);
      enviados += puntos.length;
    } catch {
      // Se queda en la cola, se reintenta la próxima vez.
      return enviados;
    }
  }

  await AsyncStorage.removeItem(PENDING_POINTS_KEY);
  return enviados;
}

export async function contarPuntosPendientes(): Promise<number> {
  const raw = await AsyncStorage.getItem(PENDING_POINTS_KEY);
  return raw ? JSON.parse(raw).length : 0;
}