/**
 * CICLAPP — Detalle de una ruta guardada
 * app/detalle-ruta.tsx
 *
 * FASE 7 — NUEVA PANTALLA
 * Se abre desde historial.tsx. Trae la ruta con GET /recorridos-gps/{id}
 * (incluye todos sus puntos GPS reales) y la redibuja en el mapa:
 *  - Polyline azul: la ruta PLANIFICADA por Google Routes API
 *  - Polyline verde: el trayecto REAL capturado por el GPS
 */

import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, LatLng as MapLatLng } from "react-native-maps";
import AndroidLeafletMap from "../components/AndroidLeafletMap";
import { detalleRecorridoGPS, formatDuration, type RecorridoGPS } from "../services/storage";
import { USAR_TILES_RESPALDO } from "../constants/mapTiles";

const COLORS = {
  primary: "#27AE60",
  danger: "#E74C3C",
  routePlanLine: "#1A73E8",
  routeRealLine: "#27AE60",
  surface: "#FFFFFF",
  background: "#F8FAF9",
  textPrimary: "#1A1A2E",
  textSecondary: "#6B7280",
  border: "#E5E7EB",
} as const;

const SPACING = { sm: 8, md: 16, lg: 24 } as const;
const RADIUS = { md: 14, lg: 20, full: 999 } as const;

/** Decodifica una polyline encodada de Google (misma función que en mapa.tsx). */
function decodePolyline(encoded: string): MapLatLng[] {
  const points: MapLatLng[] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let shift = 0, result = 0, byte: number;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

export default function DetalleRutaScreen() {
  const params = useLocalSearchParams<{ recorridoId: string }>();
  const [ruta, setRuta] = useState<RecorridoGPS | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await detalleRecorridoGPS(Number(params.recorridoId));
        setRuta(data);
      } catch (e: any) {
        setError(e.message || "No se pudo cargar la ruta.");
      } finally {
        setCargando(false);
      }
    })();
  }, [params.recorridoId]);

  if (cargando) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (error || !ruta) {
    return (
      <View style={styles.loadingScreen}>
        <Ionicons name="alert-circle-outline" size={40} color={COLORS.danger} />
        <Text style={styles.errorText}>{error || "Ruta no encontrada."}</Text>
        <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
          <Text style={styles.backLinkText}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const polylinePlanificada = ruta.polyline ? decodePolyline(ruta.polyline) : [];
  const polylineReal: MapLatLng[] = (ruta.puntos || []).map((p) => ({ latitude: p.latitude, longitude: p.longitude }));

  const origen = { latitude: ruta.origen_lat, longitude: ruta.origen_lon };
  const destino = { latitude: ruta.destino_lat, longitude: ruta.destino_lon };

  const todasLasCoords = [...polylinePlanificada, ...polylineReal, origen, destino];
  const initialRegion = {
    latitude: origen.latitude,
    longitude: origen.longitude,
    latitudeDelta: 0.04,
    longitudeDelta: 0.04,
  };

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      {USAR_TILES_RESPALDO ? (
        <AndroidLeafletMap
          style={styles.map}
          initialRegion={initialRegion}
          markers={[
            { coordinate: origen, color: "green", title: "Origen" },
            { coordinate: destino, color: "red", title: "Destino" },
          ]}
          polylines={[
            ...(polylinePlanificada.length > 1
              ? [{
                  coordinates: polylinePlanificada,
                  color: COLORS.routePlanLine,
                  width: 4,
                  dashPattern: [6, 6],
                }]
              : []),
            ...(polylineReal.length > 1
              ? [{
                  coordinates: polylineReal,
                  color: COLORS.routeRealLine,
                  width: 5,
                }]
              : []),
          ]}
        />
      ) : (
        <MapView
          style={styles.map}
          provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
          initialRegion={initialRegion}
        >
          {polylinePlanificada.length > 1 && (
            <Polyline coordinates={polylinePlanificada} strokeColor={COLORS.routePlanLine} strokeWidth={4} lineDashPattern={[6, 6]} />
          )}
          {polylineReal.length > 1 && (
            <Polyline coordinates={polylineReal} strokeColor={COLORS.routeRealLine} strokeWidth={5} />
          )}
          <Marker coordinate={origen} title="Origen" description={ruta.origen_desc || ""} pinColor="green" />
          <Marker coordinate={destino} title="Destino" description={ruta.destino_desc || ""} pinColor="red" />
        </MapView>
      )}

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
      </View>

      <View style={styles.leyenda}>
        <View style={styles.leyendaItem}>
          <View style={[styles.leyendaLinea, { backgroundColor: COLORS.routePlanLine }]} />
          <Text style={styles.leyendaText}>Ruta planificada (Google)</Text>
        </View>
        <View style={styles.leyendaItem}>
          <View style={[styles.leyendaLinea, { backgroundColor: COLORS.routeRealLine }]} />
          <Text style={styles.leyendaText}>Recorrido real (GPS)</Text>
        </View>
      </View>

      <View style={styles.infoPanel}>
        <Text style={styles.infoTitle} numberOfLines={1}>{ruta.origen_desc} → {ruta.destino_desc}</Text>
        <View style={styles.infoStats}>
          <View style={styles.infoStat}>
            <Text style={styles.infoStatValue}>{(ruta.distancia_real_km ?? ruta.distancia_km ?? 0).toFixed(2)} km</Text>
            <Text style={styles.infoStatLabel}>Distancia</Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoStat}>
            <Text style={styles.infoStatValue}>{formatDuration(ruta.duracion_real_segundos ?? ruta.duracion_segundos ?? 0)}</Text>
            <Text style={styles.infoStatLabel}>Duración</Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoStat}>
            <Text style={styles.infoStatValue}>{(ruta.puntos || []).length}</Text>
            <Text style={styles.infoStatLabel}>Puntos GPS</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const cardShadow = Platform.select({
  ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 10 },
  android: { elevation: 6 },
}) ?? {};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  loadingScreen: { flex: 1, justifyContent: "center", alignItems: "center", gap: SPACING.sm, backgroundColor: COLORS.background, padding: SPACING.lg },
  errorText: { fontSize: 14, color: COLORS.textSecondary, textAlign: "center" },
  backLink: { marginTop: SPACING.sm },
  backLinkText: { color: COLORS.primary, fontWeight: "700" },

  map: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  header: { position: "absolute", top: Platform.OS === "ios" ? 56 : 40, left: 16 },
  backBtn: { width: 44, height: 44, borderRadius: RADIUS.full, backgroundColor: COLORS.surface, justifyContent: "center", alignItems: "center", ...cardShadow },

  leyenda: { position: "absolute", top: Platform.OS === "ios" ? 56 : 40, right: 16, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.sm, gap: 6, ...cardShadow },
  leyendaItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  leyendaLinea: { width: 16, height: 3, borderRadius: 2 },
  leyendaText: { fontSize: 10, color: COLORS.textSecondary },

  infoPanel: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg, padding: SPACING.lg, paddingBottom: Platform.OS === "ios" ? 36 : SPACING.lg, ...cardShadow },
  infoTitle: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary, marginBottom: SPACING.md },
  infoStats: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.background, borderRadius: RADIUS.md, padding: SPACING.md },
  infoStat: { flex: 1, alignItems: "center" },
  infoStatValue: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary },
  infoStatLabel: { fontSize: 10, color: COLORS.textSecondary, marginTop: 2 },
  infoDivider: { width: 1, height: 32, backgroundColor: COLORS.border },
});
