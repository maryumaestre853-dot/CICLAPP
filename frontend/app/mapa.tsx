/**
 * CICLAPP — Pantalla de Mapa
 * app/mapa.tsx
 *
 * FASE 3 — Sistema de rutas real:
 *  - Seleccionar origen (A) tocando el mapa O usando "Mi ubicación"
 *  - Seleccionar destino (B) tocando el mapa O buscando por texto
 *  - Calcular ruta real con Google Routes API (modo BICYCLE) vía backend
 *  - Dibujar la Polyline real devuelta por Google (sigue las calles)
 *  - Iniciar Ruta -> crea el recorrido en el backend y navega a /ruta
 *
 * Se conserva TODO lo que ya funcionaba: GPS en tiempo real, búsqueda
 * de destino, recientes, marcadores personalizados, FABs, panel inferior.
 */

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack, router } from "expo-router";
import * as Location from "expo-location";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, {
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
  Region,
  LatLng as MapLatLng,
} from "react-native-maps";
import AndroidLeafletMap, {
  type AndroidLeafletMapHandle,
} from "../components/AndroidLeafletMap";

import {
  calcularRuta,
  crearRecorridoGPS,
  iniciarRecorridoGPS,
  type LatLng,
  type RutaCalculada,
} from "../services/storage";
import { USAR_TILES_RESPALDO } from "../constants/mapTiles";

// ─────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────

const BOGOTA_CENTER: Region = {
  latitude: 4.711,
  longitude: -74.0721,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

const STORAGE_KEY = "ciclapp:recent_destinations";
const MAX_RECENT = 5;

/**
 * Clave de CLIENTE para Geocoding (búsqueda por texto) — distinta
 * de GOOGLE_MAPS_API_KEY del backend, que se usa solo para Routes API.
 * Restringe esta key en Google Cloud a "Geocoding API" + tu bundle id.
 */
const GOOGLE_GEOCODING_CLIENT_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY || "TU_API_KEY_DE_CLIENTE_AQUI";

const COLORS = {
  primary: "#27AE60",
  primaryDark: "#1E8449",
  primaryLight: "#EAFAF1",
  danger: "#E74C3C",
  warning: "#F39C12",
  routeLine: "#1A73E8",
  routeLineBorder: "#FFFFFF",
  origenColor: "#27AE60",
  surface: "#FFFFFF",
  background: "#F8FAF9",
  textPrimary: "#1A1A2E",
  textSecondary: "#6B7280",
  textMuted: "#9CA3AF",
  border: "#E5E7EB",
} as const;

const SPACING = { xs: 4, sm: 8, md: 16, lg: 24 } as const;
const RADIUS = { sm: 8, md: 12, lg: 20, full: 999 } as const;

type ModoSeleccion = "origen" | "destino" | null;
type EstadoRuta =
  | "sin_origen"
  | "sin_destino"
  | "listo_para_calcular"
  | "calculando"
  | "ruta_lista"
  | "ruta_no_encontrada"
  | "creando_recorrido";

// ─────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────

interface PuntoMapa {
  coordinates: LatLng;
  descripcion: string;
}

interface Destination {
  id: string;
  name: string;
  address: string;
  coordinates: LatLng;
  savedAt: number;
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

/** Decodifica una polyline encodada de Google al array de coordenadas. */
function decodePolyline(encoded: string): MapLatLng[] {
  const points: MapLatLng[] = [];
  let index = 0, lat = 0, lng = 0;

  while (index < encoded.length) {
    let shift = 0, result = 0, byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0; result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

/** Geocoding por texto — llamada de cliente (key restringida a Geocoding). */
async function geocodeAddress(
  query: string
): Promise<{ name: string; address: string; coordinates: LatLng } | null> {
  const encoded = encodeURIComponent(`${query}, Bogotá, Colombia`);
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encoded}&key=${GOOGLE_GEOCODING_CLIENT_KEY}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== "OK" || !data.results?.length) return null;
    const result = data.results[0];
    const loc = result.geometry.location;
    return {
      name: query,
      address: result.formatted_address,
      coordinates: { latitude: loc.lat, longitude: loc.lng },
    };
  } catch {
    return null;
  }
}

function formatTime(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h} h ${m} min` : `${h} h`;
}

// ─────────────────────────────────────────────────────────────
// HOOK: useRecentDestinations (sin cambios)
// ─────────────────────────────────────────────────────────────

function useRecentDestinations() {
  const [recents, setRecents] = useState<Destination[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => { if (raw) setRecents(JSON.parse(raw)); })
      .catch(() => {});
  }, []);

  const saveDestination = useCallback(async (dest: Destination) => {
    setRecents((prev) => {
      const filtered = prev.filter((d) => d.name.toLowerCase() !== dest.name.toLowerCase());
      const updated = [dest, ...filtered].slice(0, MAX_RECENT);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  const clearHistory = useCallback(async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    setRecents([]);
  }, []);

  return { recents, saveDestination, clearHistory };
}

// ─────────────────────────────────────────────────────────────
// PANTALLA PRINCIPAL
// ─────────────────────────────────────────────────────────────

export default function MapaScreen() {
  const mapRef = useRef<MapView>(null);
  const leafletMapRef = useRef<AndroidLeafletMapHandle>(null);
  const inputRef = useRef<TextInput>(null);
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);

  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(true);

  const [searchText, setSearchText] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  // ── NUEVO: origen (A) y destino (B) seleccionables ──
  const [origen, setOrigen] = useState<PuntoMapa | null>(null);
  const [destino, setDestino] = useState<PuntoMapa | null>(null);
  const [modoSeleccion, setModoSeleccion] = useState<ModoSeleccion>(null);

  const [estadoRuta, setEstadoRuta] = useState<EstadoRuta>("sin_origen");
  const [rutaCalculada, setRutaCalculada] = useState<RutaCalculada | null>(null);
  const [routePolyline, setRoutePolyline] = useState<MapLatLng[]>([]);

  const panelAnim = useRef(new Animated.Value(0)).current;
  const { recents, saveDestination, clearHistory } = useRecentDestinations();

  // ── GPS: ubicación en tiempo real (igual que antes) ──
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationError("Permiso de ubicación denegado");
        setIsLocating(false);
        return;
      }
      try {
        const initial = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (mounted) {
          const coords: LatLng = { latitude: initial.coords.latitude, longitude: initial.coords.longitude };
          setUserLocation(coords);
          setIsLocating(false);
          centerMapOn(coords, 0.015);
        }
      } catch {
        if (mounted) setIsLocating(false);
      }
      locationSubscription.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 10 },
        (loc) => {
          if (!mounted) return;
          setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        }
      );
    })();
    return () => { mounted = false; locationSubscription.current?.remove(); };
  }, []);

  // ── Recalcular estado según origen/destino ──
  useEffect(() => {
    if (!origen) setEstadoRuta("sin_origen");
    else if (!destino) setEstadoRuta("sin_destino");
    else if (estadoRuta !== "calculando" && estadoRuta !== "ruta_lista" && estadoRuta !== "creando_recorrido") {
      setEstadoRuta("listo_para_calcular");
    }
  }, [origen, destino]);

  // ── Animación panel inferior ──
  useEffect(() => {
    Animated.spring(panelAnim, {
      toValue: estadoRuta === "ruta_lista" ? 1 : 0,
      useNativeDriver: true, bounciness: 6, speed: 12,
    }).start();
  }, [estadoRuta]);

  const centerMapOn = (coords: LatLng, delta = 0.01) => {
    const region = { ...coords, latitudeDelta: delta, longitudeDelta: delta };
    if (USAR_TILES_RESPALDO) leafletMapRef.current?.animateToRegion(region, 800);
    else mapRef.current?.animateToRegion(region, 800);
  };

  const fitMapToRoute = (a: LatLng, b: LatLng) => {
    const options = {
      edgePadding: { top: 160, right: 60, bottom: 320, left: 60 },
      animated: true,
    };
    if (USAR_TILES_RESPALDO) leafletMapRef.current?.fitToCoordinates([a, b], options);
    else mapRef.current?.fitToCoordinates([a, b], options);
  };

  // ── NUEVO: tocar el mapa para elegir A o B ──
  const handleMapPress = (e: any) => {
    if (!modoSeleccion) return;
    const coords: LatLng = e?.nativeEvent?.coordinate ?? e;

    if (modoSeleccion === "origen") {
      setOrigen({ coordinates: coords, descripcion: "Origen seleccionado" });
    } else {
      setDestino({ coordinates: coords, descripcion: "Destino seleccionado" });
    }
    setModoSeleccion(null);
    setRutaCalculada(null);
    setRoutePolyline([]);
  };

  // ── NUEVO: usar mi ubicación como origen ──
  const handleUsarMiUbicacion = () => {
    if (!userLocation) {
      Alert.alert("Ubicación no disponible", "Aún estamos obteniendo tu posición GPS.");
      return;
    }
    setOrigen({ coordinates: userLocation, descripcion: "Mi ubicación" });
    setModoSeleccion(null);
    setRutaCalculada(null);
    setRoutePolyline([]);
    centerMapOn(userLocation, 0.015);
  };

  // ── Búsqueda de destino por texto (usa Geocoding, no cambia UX) ──
  const handleSearch = async () => {
    const query = searchText.trim();
    if (!query) return;
    Keyboard.dismiss();
    setIsSearching(true);
    const result = await geocodeAddress(query);
    setIsSearching(false);

    if (!result) {
      Alert.alert("Lugar no encontrado", `No encontramos "${query}" en Bogotá. Intenta con un nombre más específico.`);
      return;
    }

    const newDest: Destination = {
      id: Date.now().toString(), name: result.name, address: result.address,
      coordinates: result.coordinates, savedAt: Date.now(),
    };
    saveDestination(newDest);
    setDestino({ coordinates: result.coordinates, descripcion: result.name });
    setSearchFocused(false);
    setRutaCalculada(null);
    setRoutePolyline([]);
    centerMapOn(result.coordinates, 0.02);
  };

  const handleSelectRecent = (dest: Destination) => {
    setSearchText(dest.name);
    setDestino({ coordinates: dest.coordinates, descripcion: dest.name });
    setSearchFocused(false);
    Keyboard.dismiss();
    setRutaCalculada(null);
    setRoutePolyline([]);
    centerMapOn(dest.coordinates, 0.02);
  };

  const handleLimpiarSeleccion = () => {
    setOrigen(null);
    setDestino(null);
    setRutaCalculada(null);
    setRoutePolyline([]);
    setSearchText("");
    setEstadoRuta("sin_origen");
  };

  // ── NUEVO: calcular ruta real con Google Routes API (BICYCLE) vía backend ──
  const handleCalcularRuta = async () => {
    if (!origen || !destino) return;
    setEstadoRuta("calculando");
    setRoutePolyline([]);

    try {
      const resultado = await calcularRuta(
        origen.coordinates, destino.coordinates,
        origen.descripcion, destino.descripcion
      );
      setRutaCalculada(resultado);
      setRoutePolyline(decodePolyline(resultado.polyline));
      setEstadoRuta("ruta_lista");
      fitMapToRoute(origen.coordinates, destino.coordinates);
    } catch (e: any) {
      setEstadoRuta("ruta_no_encontrada");

      // El backend manda el tipo de error como prefijo "[tipo] mensaje"
      // para que aquí podamos mostrar algo útil según la causa real,
      // en vez del genérico "no hay ruta disponible" siempre.
      const raw: string = e.message || "";
      const match = raw.match(/^\[(\w+)\]\s*(.*)$/);
      const tipo = match?.[1] || "desconocido";
      const detalle = match?.[2] || raw;

      if (tipo === "config") {
        Alert.alert(
          "⚙️ Falta configurar el backend",
          "El servidor todavía no tiene la clave de Google Maps configurada.\n\n" +
          "Abre backend/.env y reemplaza GOOGLE_MAPS_API_KEY por tu clave real, luego reinicia uvicorn."
        );
      } else if (tipo === "red") {
        Alert.alert(
          "📡 Sin conexión a Google desde el servidor",
          "El backend no pudo comunicarse con Google Maps. Si estás en una red " +
          "institucional/corporativa, es posible que bloquee la salida a Internet " +
          "del servidor. Prueba con datos móviles (hotspot) en el computador del backend."
        );
      } else if (tipo === "google") {
        Alert.alert(
          "🔑 Google rechazó la solicitud",
          "Revisa en Google Cloud que 'Routes API' esté habilitada para tu proyecto " +
          "y que la clave del servidor no esté mal restringida.\n\nDetalle: " + detalle
        );
      } else if (tipo === "sin_ruta") {
        Alert.alert(
          "🚲 Sin ruta ciclista entre esos puntos",
          "Google no encontró una ruta en bicicleta exactamente entre esos dos puntos. " +
          "Intenta tocar sobre una calle en vez de dentro de un parque, edificio o cuerpo de agua."
        );
      } else {
        Alert.alert("No encontramos una ruta", detalle || "Intenta con otros puntos.");
      }
    }
  };

  // ── NUEVO: iniciar ruta -> crea el recorrido en el backend y navega ──
  const handleStartRoute = async () => {
    if (!origen || !destino || !rutaCalculada) return;

    Alert.alert(
      "🚴 Iniciar ruta",
      `${origen.descripcion} → ${destino.descripcion}\n\n📏 ${rutaCalculada.distanceKm} km · ⏱ ${formatTime(rutaCalculada.durationMinutes)}`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Confirmar",
          onPress: async () => {
            setEstadoRuta("creando_recorrido");
            try {
              const recorrido = await crearRecorridoGPS(
                origen.coordinates, destino.coordinates,
                origen.descripcion, destino.descripcion
              );
              await iniciarRecorridoGPS(recorrido.id);

              router.push({
                pathname: "/ruta",
                params: {
                  recorridoId: String(recorrido.id),
                  origenDesc: origen.descripcion,
                  destinoDesc: destino.descripcion,
                  distanciaKm: String(rutaCalculada.distanceKm),
                },
              });
            } catch (e: any) {
              setEstadoRuta("ruta_lista");
              Alert.alert("Error", e.message || "No se pudo iniciar el recorrido. Verifica tu conexión.");
            }
          },
        },
      ]
    );
  };

  const panelTranslate = panelAnim.interpolate({ inputRange: [0, 1], outputRange: [260, 0] });
  const panelOpacity = panelAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const showRecentList = searchFocused && recents.length > 0 && !searchText;

  const mensajeEstado: Record<EstadoRuta, string | null> = {
    sin_origen: "Toca \"Origen\" o usa tu ubicación para empezar",
    sin_destino: "Ahora toca \"Destino\" en el mapa o busca un lugar",
    listo_para_calcular: null,
    calculando: "Calculando ruta en bicicleta...",
    ruta_lista: null,
    ruta_no_encontrada: "No encontramos una ruta adecuada para bicicleta.",
    creando_recorrido: "Iniciando tu recorrido...",
  };

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="dark" />

      {USAR_TILES_RESPALDO ? (
        <AndroidLeafletMap
          ref={leafletMapRef}
          style={styles.map}
          initialRegion={BOGOTA_CENTER}
          onPress={handleMapPress}
          markers={[
            ...(userLocation
              ? [{ coordinate: userLocation, color: "#2980B9", title: "Tu ubicación" }]
              : []),
            ...(origen
              ? [{ coordinate: origen.coordinates, color: COLORS.origenColor, title: "Origen" }]
              : []),
            ...(destino
              ? [{ coordinate: destino.coordinates, color: COLORS.danger, title: "Destino" }]
              : []),
          ]}
          polylines={[
            ...(origen && destino && routePolyline.length === 0
              ? [{
                  coordinates: [origen.coordinates, destino.coordinates],
                  color: COLORS.textMuted,
                  width: 3,
                  dashPattern: [8, 6],
                }]
              : []),
            ...(routePolyline.length > 1
              ? [{
                  coordinates: routePolyline,
                  color: COLORS.routeLineBorder,
                  width: 8,
                }]
              : []),
            ...(routePolyline.length > 1
              ? [{
                  coordinates: routePolyline,
                  color: COLORS.routeLine,
                  width: 5,
                }]
              : []),
          ]}
        />
      ) : (
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
          initialRegion={BOGOTA_CENTER}
          showsUserLocation={false}
          showsMyLocationButton={false}
          showsCompass
          onPress={handleMapPress}
        >
          {origen && destino && routePolyline.length === 0 && (
            <Polyline
              coordinates={[origen.coordinates, destino.coordinates]}
              strokeColor={COLORS.textMuted}
              strokeWidth={3}
              lineDashPattern={[8, 6]}
            />
          )}
          {routePolyline.length > 1 && (
            <Polyline coordinates={routePolyline} strokeColor={COLORS.routeLineBorder} strokeWidth={8} lineCap="round" />
          )}
          {routePolyline.length > 1 && (
            <Polyline coordinates={routePolyline} strokeColor={COLORS.routeLine} strokeWidth={5} lineCap="round" />
          )}
          {userLocation && (
            <Marker coordinate={userLocation} anchor={{ x: 0.5, y: 0.5 }} zIndex={10} tracksViewChanges={false} title="Tu ubicación">
              <View style={styles.userMarker}>
                <View style={styles.userMarkerRing} />
                <View style={styles.userMarkerCore} />
              </View>
            </Marker>
          )}
          {origen && (
            <Marker
              coordinate={origen.coordinates}
              zIndex={9}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 0.5 }}
              title="Origen"
              description={origen.descripcion}
            >
              <View style={styles.origenMarker}>
                <View style={styles.origenMarkerOuter}>
                  <View style={styles.origenMarkerInner} />
                </View>
              </View>
            </Marker>
          )}
          {destino && (
            <Marker
              coordinate={destino.coordinates}
              zIndex={9}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 1 }}
              title="Destino"
              description={destino.descripcion}
            >
              <View style={styles.destMarker}>
                <Ionicons name="location" size={40} color={COLORS.danger} />
              </View>
            </Marker>
          )}
        </MapView>
      )}

      {/* ══ BARRA DE BÚSQUEDA ══ */}
      <View style={styles.searchContainer}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={styles.searchInputWrap}>
          <Ionicons name="search-outline" size={18} color={COLORS.textSecondary} style={styles.searchIcon} />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder="Buscar destino en Bogotá..."
            placeholderTextColor={COLORS.textMuted}
            value={searchText}
            onChangeText={setSearchText}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={handleLimpiarSeleccion}>
              <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={[styles.searchBtn, isSearching && { opacity: 0.6 }]} onPress={handleSearch} disabled={isSearching}>
          {isSearching ? <ActivityIndicator size="small" color={COLORS.surface} /> : <Ionicons name="arrow-forward" size={20} color={COLORS.surface} />}
        </TouchableOpacity>
      </View>

      {/* ══ NUEVO: SELECTOR A / B ══ */}
      <View style={styles.abSelector}>
        <TouchableOpacity
          style={[styles.abBtn, modoSeleccion === "origen" && styles.abBtnActive, origen && styles.abBtnFilled]}
          onPress={() => setModoSeleccion(modoSeleccion === "origen" ? null : "origen")}
        >
          <Ionicons name="ellipse" size={12} color={origen ? "#FFF" : COLORS.origenColor} />
          <Text style={[styles.abBtnText, (modoSeleccion === "origen" || origen) && styles.abBtnTextActive]} numberOfLines={1}>
            {origen ? origen.descripcion : "Origen"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.abMiUbicacion} onPress={handleUsarMiUbicacion}>
          <Ionicons name="locate" size={16} color={COLORS.primary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.abBtn, modoSeleccion === "destino" && styles.abBtnActive, destino && styles.abBtnFilledDestino]}
          onPress={() => setModoSeleccion(modoSeleccion === "destino" ? null : "destino")}
        >
          <Ionicons name="location" size={14} color={destino ? "#FFF" : COLORS.danger} />
          <Text style={[styles.abBtnText, (modoSeleccion === "destino" || destino) && styles.abBtnTextActive]} numberOfLines={1}>
            {destino ? destino.descripcion : "Destino"}
          </Text>
        </TouchableOpacity>
      </View>

      {modoSeleccion && (
        <View style={styles.modoHint}>
          <Ionicons name="hand-left-outline" size={14} color={COLORS.primary} />
          <Text style={styles.modoHintText}>
            Toca el mapa para colocar el {modoSeleccion === "origen" ? "origen" : "destino"}
          </Text>
        </View>
      )}

      {/* ══ LISTA DE RECIENTES ══ */}
      {showRecentList && (
        <View style={styles.recentsList}>
          <View style={styles.recentsHeader}>
            <Text style={styles.recentsTitle}>Recientes</Text>
            <TouchableOpacity onPress={clearHistory}><Text style={styles.recentsClear}>Borrar</Text></TouchableOpacity>
          </View>
          <FlatList
            data={recents}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.recentItem} onPress={() => handleSelectRecent(item)}>
                <View style={styles.recentItemIcon}><Ionicons name="time-outline" size={16} color={COLORS.primary} /></View>
                <View style={styles.recentItemText}>
                  <Text style={styles.recentItemName}>{item.name}</Text>
                  <Text style={styles.recentItemAddr} numberOfLines={1}>{item.address}</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {isLocating && (
        <View style={styles.locatingOverlay}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.locatingText}>Obteniendo tu ubicación...</Text>
        </View>
      )}

      {locationError && (
        <View style={styles.errorBanner}>
          <Ionicons name="warning-outline" size={16} color={COLORS.danger} />
          <Text style={styles.errorText}>{locationError}</Text>
        </View>
      )}

      {/* ══ MENSAJE DE ESTADO ══ */}
      {mensajeEstado[estadoRuta] && !modoSeleccion && (
        <View style={styles.estadoBanner}>
          {estadoRuta === "calculando" || estadoRuta === "creando_recorrido" ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : (
            <Ionicons name="information-circle-outline" size={16} color={COLORS.textSecondary} />
          )}
          <Text style={styles.estadoBannerText}>{mensajeEstado[estadoRuta]}</Text>
        </View>
      )}

      {/* ══ BOTONES FLOTANTES ══ */}
      <View style={styles.fabColumn}>
        {routePolyline.length > 1 && origen && destino && (
          <TouchableOpacity style={styles.fab} onPress={() => fitMapToRoute(origen.coordinates, destino.coordinates)}>
            <Ionicons name="expand-outline" size={20} color={COLORS.routeLine} />
          </TouchableOpacity>
        )}
        {(origen || destino) && (
          <TouchableOpacity style={[styles.fab, styles.fabDanger]} onPress={handleLimpiarSeleccion}>
            <Ionicons name="trash-outline" size={20} color={COLORS.danger} />
          </TouchableOpacity>
        )}
      </View>

      {/* ══ BOTÓN CALCULAR RUTA ══ */}
      {estadoRuta === "listo_para_calcular" && (
        <TouchableOpacity style={styles.calcularBtn} onPress={handleCalcularRuta} activeOpacity={0.85}>
          <Ionicons name="navigate" size={18} color="#FFF" />
          <Text style={styles.calcularBtnText}>Calcular ruta en bici</Text>
        </TouchableOpacity>
      )}

      {/* ══ PANEL INFERIOR: RUTA CALCULADA ══ */}
      {estadoRuta === "ruta_lista" && rutaCalculada && origen && destino && (
        <Animated.View style={[styles.routePanel, { opacity: panelOpacity, transform: [{ translateY: panelTranslate }] }]}>
          <View style={styles.routePanelHeader}>
            <Ionicons name="location" size={18} color={COLORS.danger} />
            <Text style={styles.routeDestName} numberOfLines={1}>{origen.descripcion} → {destino.descripcion}</Text>
          </View>
          <Text style={styles.routeDestAddr}>
            {rutaCalculada.esAproximada
              ? "Ruta aproximada — Google aún no tiene ciclorrutas mapeadas en esta zona"
              : "Ruta calculada con Google — modo bicicleta"}
          </Text>

          {/* NUEVO: aviso cuando la ruta es una aproximación (Google usó
              WALK porque no tiene datos de ciclorruta para esta ciudad). */}
          {rutaCalculada.esAproximada && (
            <View style={styles.aproximadaBanner}>
              <Ionicons name="information-circle" size={16} color={COLORS.warning} />
              <Text style={styles.aproximadaBannerText}>
                Google Maps todavía no tiene datos específicos de ciclorrutas para
                esta zona, así que esta ruta sigue calles y andenes en vez de
                carriles exclusivos para bici. Pedalea con precaución.
              </Text>
            </View>
          )}

          <View style={styles.routeStats}>
            <View style={styles.routeStat}>
              <Ionicons name="map-outline" size={18} color={COLORS.primary} />
              <Text style={styles.routeStatValue}>{rutaCalculada.distanceKm} km</Text>
              <Text style={styles.routeStatLabel}>Distancia</Text>
            </View>
            <View style={styles.routeStatDivider} />
            <View style={styles.routeStat}>
              <Ionicons name="bicycle-outline" size={18} color={COLORS.primary} />
              <Text style={styles.routeStatValue}>{formatTime(rutaCalculada.durationMinutes)}</Text>
              <Text style={styles.routeStatLabel}>{rutaCalculada.esAproximada ? "Aprox." : "En bicicleta"}</Text>
            </View>
            <View style={styles.routeStatDivider} />
            <View style={styles.routeStat}>
              <Ionicons name="navigate-outline" size={18} color={rutaCalculada.esAproximada ? COLORS.warning : COLORS.routeLine} />
              <Text style={[styles.routeStatValue, { color: rutaCalculada.esAproximada ? COLORS.warning : COLORS.routeLine }]}>
                {rutaCalculada.esAproximada ? "Aprox." : "Bici"}
              </Text>
              <Text style={styles.routeStatLabel}>Google Routes</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.startRouteBtn} onPress={handleStartRoute} activeOpacity={0.85}>
            <Ionicons name="bicycle" size={20} color={COLORS.surface} />
            <Text style={styles.startRouteBtnText}>Iniciar Ruta</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────────────────────

const mapShadow = Platform.select({
  ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12 },
  android: { elevation: 8 },
}) ?? {};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  map: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  tilesAtribucion: { position: "absolute", right: 6, bottom: 4, fontSize: 9, color: "#444", backgroundColor: "rgba(255,255,255,0.7)", paddingHorizontal: 4, borderRadius: 4 },

  userMarker: { width: 30, height: 30, justifyContent: "center", alignItems: "center" },
  userMarkerCore: { position: "absolute", width: 14, height: 14, borderRadius: 7, backgroundColor: "#2980B9", borderWidth: 2, borderColor: "#FFF", zIndex: 2 },
  userMarkerRing: { position: "absolute", width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(41,128,185,0.18)", zIndex: 1 },

  // MEJORADO: tamaño explícito obligatorio para que tracksViewChanges={false}
  // capture el marcador correctamente en Android (antes eran invisibles a veces).
  destMarker: { width: 40, height: 48, alignItems: "center", justifyContent: "flex-end" },

  // NUEVO: marcador de origen estilo Google Maps — círculo verde con
  // punto blanco en el centro, tamaño fijo, visible de forma confiable.
  origenMarker: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  origenMarkerOuter: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: COLORS.origenColor,
    borderWidth: 3, borderColor: "#FFFFFF",
    alignItems: "center", justifyContent: "center",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3 },
      android: { elevation: 4 },
    }),
  },
  origenMarkerInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#FFFFFF" },

  searchContainer: { position: "absolute", top: Platform.OS === "ios" ? 56 : 40, left: 16, right: 16, flexDirection: "row", alignItems: "center", gap: 8 },
  backBtn: { width: 44, height: 44, borderRadius: 999, backgroundColor: "#FFF", justifyContent: "center", alignItems: "center", ...mapShadow },
  searchInputWrap: { flex: 1, height: 44, flexDirection: "row", alignItems: "center", backgroundColor: "#FFF", borderRadius: 999, paddingHorizontal: 16, gap: 8, ...mapShadow },
  searchIcon: { marginRight: -4 },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.textPrimary },
  searchBtn: { width: 44, height: 44, borderRadius: 999, backgroundColor: COLORS.primary, justifyContent: "center", alignItems: "center", ...mapShadow },

  abSelector: { position: "absolute", top: Platform.OS === "ios" ? 108 : 92, left: 16, right: 16, flexDirection: "row", alignItems: "center", gap: 8 },
  abBtn: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FFF", borderRadius: 999, paddingHorizontal: 12, height: 38, borderWidth: 1.5, borderColor: COLORS.border, ...mapShadow },
  abBtnActive: { borderColor: COLORS.primary },
  abBtnFilled: { backgroundColor: COLORS.origenColor, borderColor: COLORS.origenColor },
  abBtnFilledDestino: { backgroundColor: COLORS.danger, borderColor: COLORS.danger },
  abBtnText: { fontSize: 12, fontWeight: "600", color: COLORS.textSecondary, flex: 1 },
  abBtnTextActive: { color: "#FFF" },
  abMiUbicacion: { width: 38, height: 38, borderRadius: 999, backgroundColor: "#FFF", justifyContent: "center", alignItems: "center", ...mapShadow },

  modoHint: { position: "absolute", top: Platform.OS === "ios" ? 152 : 136, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: COLORS.primaryLight, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: "#C8EFD9" },
  modoHintText: { fontSize: 12, color: COLORS.primaryDark, fontWeight: "600" },

  recentsList: { position: "absolute", top: Platform.OS === "ios" ? 200 : 184, left: 16, right: 16, backgroundColor: "#FFF", borderRadius: 20, overflow: "hidden", ...mapShadow },
  recentsHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  recentsTitle: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary },
  recentsClear: { fontSize: 12, color: COLORS.danger, fontWeight: "600" },
  recentItem: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, gap: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  recentItemIcon: { width: 32, height: 32, borderRadius: 999, backgroundColor: COLORS.primaryLight, justifyContent: "center", alignItems: "center" },
  recentItemText: { flex: 1 },
  recentItemName: { fontSize: 14, fontWeight: "600", color: COLORS.textPrimary },
  recentItemAddr: { fontSize: 11, color: COLORS.textSecondary, marginTop: 1 },

  locatingOverlay: { position: "absolute", top: "45%", left: "50%", transform: [{ translateX: -90 }, { translateY: -30 }], width: 180, backgroundColor: "#FFF", borderRadius: 20, padding: 16, alignItems: "center", gap: 8, ...mapShadow },
  locatingText: { fontSize: 12, color: COLORS.textSecondary, textAlign: "center" },

  errorBanner: { position: "absolute", top: Platform.OS === "ios" ? 200 : 184, left: 16, right: 16, backgroundColor: "#FDEDEC", borderRadius: 12, padding: 8, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: "#F1948A" },
  errorText: { fontSize: 12, color: COLORS.danger, flex: 1 },

  estadoBanner: { position: "absolute", bottom: 110, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FFF", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, ...mapShadow },
  estadoBannerText: { fontSize: 12, color: COLORS.textSecondary, fontWeight: "600" },

  fabColumn: { position: "absolute", right: 16, bottom: 250, gap: 8 },
  fab: { width: 48, height: 48, borderRadius: 999, backgroundColor: "#FFF", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: COLORS.border, ...mapShadow },
  fabDanger: { borderColor: "#FADBD8", backgroundColor: "#FEF9F9" },

  calcularBtn: { position: "absolute", bottom: 40, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: COLORS.primary, borderRadius: 999, paddingHorizontal: 24, height: 52, ...Platform.select({ ios: { shadowColor: COLORS.primaryDark, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8 }, android: { elevation: 8 } }) },
  calcularBtnText: { fontSize: 15, fontWeight: "800", color: "#FFF" },

  routePanel: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#FFF", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: Platform.OS === "ios" ? 36 : 24, ...Platform.select({ ios: { shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 12 }, android: { elevation: 12 } }) },
  routePanelHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  routeDestName: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary, flex: 1, letterSpacing: -0.2 },
  routeDestAddr: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 17, marginBottom: 16 },
  aproximadaBanner: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#FEF9E7", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#FAD7A0", marginBottom: 16 },
  aproximadaBannerText: { fontSize: 11.5, color: "#B7791F", flex: 1, lineHeight: 16 },
  routeStats: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.background, borderRadius: 12, padding: 16, marginBottom: 16 },
  routeStat: { flex: 1, alignItems: "center", gap: 2 },
  routeStatValue: { fontSize: 15, fontWeight: "800", color: COLORS.textPrimary, letterSpacing: -0.3 },
  routeStatLabel: { fontSize: 10, color: COLORS.textSecondary },
  routeStatDivider: { width: 1, height: 36, backgroundColor: COLORS.border },
  startRouteBtn: { backgroundColor: COLORS.primary, borderRadius: 999, paddingVertical: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, ...Platform.select({ ios: { shadowColor: COLORS.primaryDark, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8 }, android: { elevation: 6 } }) },
  startRouteBtnText: { fontSize: 16, fontWeight: "800", color: "#FFF", letterSpacing: -0.2 },
});
