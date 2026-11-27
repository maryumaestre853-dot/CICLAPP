  /**
   * CICLAPP — Pantalla Iniciar Ruta
   * app/ruta.tsx
   *
   * FASE 6 — Conectada al sistema de rutas GPS real:
   *  - Recibe recorridoId/origenDesc/destinoDesc/distanciaKm desde mapa.tsx
   *    (el recorrido ya fue creado + marcado 'activa' en el backend antes
   *    de llegar aquí, vía crearRecorridoGPS + iniciarRecorridoGPS)
   *  - Mientras el ciclista pedalea: acumula puntos GPS y los envía en
   *    lotes al backend (POST /recorridos-gps/{id}/puntos)
   *  - Si no hay conexión: los puntos se encolan en AsyncStorage
   *    (encolarPuntoOffline) y se reintentan automáticamente
   *  - Al finalizar: llama a finalizarRecorridoGPS, que calcula la
   *    distancia/duración REAL a partir de los puntos guardados
   *
   * Se conserva 100% la UI original: cronómetro, métricas en vivo,
   * pausar/reanudar, pantalla de resumen final.
   */

  import { Ionicons } from "@expo/vector-icons";
  import { router, useLocalSearchParams } from "expo-router";
  import * as Location from "expo-location";
  import { StatusBar } from "expo-status-bar";
  import React, { useCallback, useEffect, useRef, useState } from "react";
  import {
    Alert,
    Animated,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
  } from "react-native";
  import {
    formatDuration,
    guardarPuntosGPS,
    finalizarRecorridoGPS,
    encolarPuntoOffline,
    sincronizarPuntosPendientes,
    contarPuntosPendientes,
    type PuntoGPS,
    type RecorridoGPSFinalizado,
    type LogroAPI,
  } from "../services/storage";

  // ─────────────────────────────────────────────────────────────
  // TOKENS (idénticos a los originales, sin cambios)
  // ─────────────────────────────────────────────────────────────

  const COLORS = {
    primary: "#27AE60",
    primaryDark: "#1E8449",
    primaryLight: "#EAFAF1",
    danger: "#E74C3C",
    warning: "#F39C12",
    surface: "#FFFFFF",
    background: "#F8FAF9",
    textPrimary: "#1A1A2E",
    textSecondary: "#6B7280",
    textMuted: "#9CA3AF",
    border: "#E5E7EB",
  } as const;

  const SPACING = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
  const RADIUS = { sm: 8, md: 14, lg: 20, xl: 28, full: 999 } as const;

  // Cada cuántos segundos se manda el lote de puntos GPS acumulados al backend
  const INTERVALO_SINCRONIZACION_MS = 15000;

  // ─────────────────────────────────────────────────────────────
  // TIPOS
  // ─────────────────────────────────────────────────────────────

  type RouteState = "idle" | "active" | "paused" | "finished";

  interface Coords {
    latitude: number;
    longitude: number;
  }

  interface ResumenFinal {
    distanciaKm: number;
    duracionSegundos: number;
    origenDesc: string;
    destinoDesc: string;
    fecha: string;
    sincronizadoConBackend: boolean;
    puntosGanados: number;
    puntosTotales: number;
    logrosNuevos: LogroAPI[];
  }

  // ─────────────────────────────────────────────────────────────
  // HELPER: Haversine (para feedback INMEDIATO en pantalla;
  // la distancia OFICIAL la calcula el backend al finalizar)
  // ─────────────────────────────────────────────────────────────

  function haversine(a: Coords, b: Coords): number {
    const R = 6371;
    const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
    const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((a.latitude * Math.PI) / 180) *
        Math.cos((b.latitude * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }

  // ─────────────────────────────────────────────────────────────
  // COMPONENTE PRINCIPAL
  // ─────────────────────────────────────────────────────────────

  export default function RutaScreen() {
    const params = useLocalSearchParams<{
      recorridoId?: string;
      origenDesc?: string;
      destinoDesc?: string;
      distanciaKm?: string;
    }>();

    const recorridoId = params.recorridoId ? Number(params.recorridoId) : null;

    const [routeState, setRouteState] = useState<RouteState>("idle");
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [distanceKm, setDistanceKm] = useState(0);
    const [speedKmh, setSpeedKmh] = useState(0);
    const [locationError, setLocationError] = useState<string | null>(null);
    const [resumen, setResumen] = useState<ResumenFinal | null>(null);
    const [finalizando, setFinalizando] = useState(false);
    const [puntosPendientes, setPuntosPendientes] = useState(0);

    const lastCoords = useRef<Coords | null>(null);
    const locationSub = useRef<Location.LocationSubscription | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const syncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const bufferPuntos = useRef<PuntoGPS[]>([]);
    const pulseAnim = useRef(new Animated.Value(1)).current;

    // ── Si se entra sin haber planificado una ruta en el mapa, no hay
    //     forma de rastrear el recorrido en el backend — se redirige. ──
    useEffect(() => {
      if (!recorridoId) {
        Alert.alert(
          "Falta una ruta planificada",
          "Primero calcula una ruta desde el mapa (Origen → Destino → Calcular) antes de iniciar el recorrido.",
          [{ text: "Ir al mapa", onPress: () => router.replace("/mapa") }]
        );
      }
    }, [recorridoId]);

    // ── Animación de pulso (sin cambios) ──
    useEffect(() => {
      if (routeState === "active") {
        const loop = Animated.loop(
          Animated.sequence([
            Animated.timing(pulseAnim, { toValue: 1.15, duration: 800, useNativeDriver: true }),
            Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
          ])
        );
        loop.start();
        return () => loop.stop();
      }
      pulseAnim.setValue(1);
    }, [routeState]);

    // ── Cleanup al desmontar ──
    useEffect(() => {
      return () => {
        timerRef.current && clearInterval(timerRef.current);
        syncTimerRef.current && clearInterval(syncTimerRef.current);
        locationSub.current?.remove();
      };
    }, []);

    // ── NUEVO: enviar el lote de puntos acumulados al backend ──
    const flushBuffer = useCallback(async () => {
      if (!recorridoId) return;

      // Primero intenta sincronizar lo que quedó pendiente de intentos anteriores
      await sincronizarPuntosPendientes().catch(() => {});

      if (bufferPuntos.current.length === 0) {
        setPuntosPendientes(await contarPuntosPendientes());
        return;
      }

      const lote = bufferPuntos.current;
      bufferPuntos.current = [];

      try {
        await guardarPuntosGPS(recorridoId, lote);
      } catch {
        // Sin conexión en este momento: se guardan localmente, no se pierden
        for (const punto of lote) {
          await encolarPuntoOffline(recorridoId, punto);
        }
      }
      setPuntosPendientes(await contarPuntosPendientes());
    }, [recorridoId]);

    // ─────────────────────────────────────────────────────────
    // INICIAR RUTA
    // ─────────────────────────────────────────────────────────

    const handleStart = useCallback(async () => {
      if (!recorridoId) return;

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationError("Necesitamos tu ubicación para registrar la ruta.");
        return;
      }

      let initial: Location.LocationObject;
      try {
        initial = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      } catch {
        setLocationError("No se pudo obtener la ubicación. Verifica el GPS.");
        return;
      }

      const initCoords: Coords = { latitude: initial.coords.latitude, longitude: initial.coords.longitude };
      lastCoords.current = initCoords;
      bufferPuntos.current = [{ latitude: initCoords.latitude, longitude: initCoords.longitude, recorded_at: new Date().toISOString() }];

      setLocationError(null);
      setElapsedSeconds(0);
      setDistanceKm(0);
      setSpeedKmh(0);
      setRouteState("active");

      timerRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
      syncTimerRef.current = setInterval(flushBuffer, INTERVALO_SINCRONIZACION_MS);

      locationSub.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 5 },
        (loc) => {
          const newCoords: Coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };

          if (lastCoords.current) {
            const delta = haversine(lastCoords.current, newCoords);
            if (delta < 0.5) setDistanceKm((d) => d + delta); // feedback visual inmediato
          }
          const speed = loc.coords.speed ?? 0;
          setSpeedKmh(speed > 0 ? speed * 3.6 : 0);
          lastCoords.current = newCoords;

          // NUEVO: cada punto real del GPS se guarda para mandarlo al backend
          bufferPuntos.current.push({
            latitude: newCoords.latitude,
            longitude: newCoords.longitude,
            speed: loc.coords.speed ?? undefined,
            altitude: loc.coords.altitude ?? undefined,
            heading: loc.coords.heading ?? undefined,
            recorded_at: new Date(loc.timestamp).toISOString(),
          });
        }
      );
    }, [recorridoId, flushBuffer]);

    // ─────────────────────────────────────────────────────────
    // PAUSAR / REANUDAR (misma lógica original + pausa el envío GPS)
    // ─────────────────────────────────────────────────────────

    const handlePause = useCallback(() => {
      if (routeState === "active") {
        timerRef.current && clearInterval(timerRef.current);
        syncTimerRef.current && clearInterval(syncTimerRef.current);
        locationSub.current?.remove();
        locationSub.current = null;
        flushBuffer(); // manda lo acumulado antes de pausar
        setRouteState("paused");
      } else if (routeState === "paused") {
        timerRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
        syncTimerRef.current = setInterval(flushBuffer, INTERVALO_SINCRONIZACION_MS);
        Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 5 },
          (loc) => {
            const newCoords: Coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
            if (lastCoords.current) {
              const delta = haversine(lastCoords.current, newCoords);
              if (delta < 0.5) setDistanceKm((d) => d + delta);
            }
            const speed = loc.coords.speed ?? 0;
            setSpeedKmh(speed > 0 ? speed * 3.6 : 0);
            lastCoords.current = newCoords;

            bufferPuntos.current.push({
              latitude: newCoords.latitude,
              longitude: newCoords.longitude,
              speed: loc.coords.speed ?? undefined,
              altitude: loc.coords.altitude ?? undefined,
              heading: loc.coords.heading ?? undefined,
              recorded_at: new Date(loc.timestamp).toISOString(),
            });
          }
        ).then((sub) => { locationSub.current = sub; });
        setRouteState("active");
      }
    }, [routeState, flushBuffer]);

    // ─────────────────────────────────────────────────────────
    // FINALIZAR RUTA — NUEVO: guarda en PostgreSQL vía backend
    // ─────────────────────────────────────────────────────────

    const handleFinish = useCallback(() => {
      if (!recorridoId) return;
      if (distanceKm < 0.01) {
        Alert.alert("Ruta muy corta", "Recorre al menos 10 metros antes de finalizar.", [{ text: "OK" }]);
        return;
      }

      Alert.alert(
        "¿Finalizar ruta?",
        `Has recorrido aproximadamente ${distanceKm.toFixed(2)} km en ${formatDuration(elapsedSeconds)}.`,
        [
          { text: "Seguir pedaleando", style: "cancel" },
          {
            text: "Guardar ruta",
            onPress: async () => {
              timerRef.current && clearInterval(timerRef.current);
              syncTimerRef.current && clearInterval(syncTimerRef.current);
              locationSub.current?.remove();
              setFinalizando(true);

              // Mandar el último lote de puntos antes de cerrar el recorrido
              await flushBuffer();

              let recorridoFinal: RecorridoGPSFinalizado | null = null;
              let sincronizado = true;
              try {
                recorridoFinal = await finalizarRecorridoGPS(recorridoId);
              } catch {
                // El recorrido quedó 'activa' en el backend; se puede
                // reintentar más tarde. No se pierde nada: los puntos
                // ya viajaron o quedaron en la cola offline.
                sincronizado = false;
              }

              setResumen({
                puntosGanados: recorridoFinal?.puntosGanados ?? 0,
                puntosTotales: recorridoFinal?.puntosTotales ?? 0,
                logrosNuevos: recorridoFinal?.logrosNuevos ?? [],
                distanciaKm: recorridoFinal?.distancia_real_km ?? distanceKm,
                duracionSegundos: recorridoFinal?.duracion_real_segundos ?? elapsedSeconds,
                origenDesc: params.origenDesc || "Origen",
                destinoDesc: params.destinoDesc || "Destino",
                fecha: new Date().toISOString(),
                sincronizadoConBackend: sincronizado,
              });
              setRouteState("finished");
              setSpeedKmh(0);
              setFinalizando(false);
            },
          },
        ]
      );
    }, [recorridoId, distanceKm, elapsedSeconds, flushBuffer, params.origenDesc, params.destinoDesc]);

    // ─────────────────────────────────────────────────────────
    // FORMATEAR CRONÓMETRO (sin cambios)
    // ─────────────────────────────────────────────────────────

    const formatClock = (s: number): string => {
      const hh = Math.floor(s / 3600).toString().padStart(2, "0");
      const mm = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
      const ss = (s % 60).toString().padStart(2, "0");
      return `${hh}:${mm}:${ss}`;
    };

    // ─────────────────────────────────────────────────────────
    // RENDER: PANTALLA FINALIZADA
    // ─────────────────────────────────────────────────────────

    if (routeState === "finished" && resumen) {
      return (
        <View style={styles.root}>
          <StatusBar style="dark" />
          <ScrollView contentContainerStyle={styles.finishedScroll}>
            <View style={styles.successBadge}>
              <Ionicons name="checkmark-circle" size={72} color={COLORS.primary} />
            </View>
            <Text style={styles.finishedTitle}>¡Ruta completada!</Text>
            <Text style={styles.finishedSub}>
              {resumen.origenDesc} → {resumen.destinoDesc}
            </Text>

            {!resumen.sincronizadoConBackend && (
              <View style={styles.warningBanner}>
                <Ionicons name="cloud-offline-outline" size={16} color={COLORS.warning} />
                <Text style={styles.warningText}>
                  Sin conexión al guardar. Tus datos están seguros en el celular y se
                  sincronizarán automáticamente cuando vuelvas a tener Internet.
                </Text>
              </View>
            )}

            <View style={styles.summaryCard}>
              <SummaryRow icon="map-outline" label="Distancia" value={`${resumen.distanciaKm.toFixed(2)} km`} />
              <View style={styles.summaryDivider} />
              <SummaryRow icon="timer-outline" label="Duración" value={formatDuration(resumen.duracionSegundos)} />
              <View style={styles.summaryDivider} />
              <SummaryRow
                icon="speedometer-outline"
                label="Velocidad media"
                value={
                  resumen.duracionSegundos > 0
                    ? `${((resumen.distanciaKm / resumen.duracionSegundos) * 3600).toFixed(1)} km/h`
                    : "—"
                }
              />
              <View style={styles.summaryDivider} />
              <SummaryRow
                icon="calendar-outline"
                label="Fecha"
                value={new Date(resumen.fecha).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })}
              />
            </View>

            {resumen.sincronizadoConBackend && (
              <View style={styles.puntosCard}>
                <Text style={styles.puntosGanados}>+{resumen.puntosGanados} puntos ⭐</Text>
                <Text style={styles.puntosTotales}>Total acumulado: {resumen.puntosTotales} pts</Text>
                {resumen.logrosNuevos.map((l) => (
                  <View key={l.id} style={styles.logroNuevo}>
                    <Text style={{ fontSize: 26 }}>{l.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.logroNuevoTitulo}>¡Logro desbloqueado: {l.titulo}!</Text>
                      <Text style={styles.logroNuevoDesc}>{l.descripcion} · +{l.puntosOtorgados} pts</Text>
                    </View>
                  </View>
                ))}
                <Pressable onPress={() => router.replace("/logros")}>
                  <Text style={styles.verLogros}>Ver mis logros →</Text>
                </Pressable>
              </View>
            )}

            <Pressable style={styles.primaryBtn} onPress={() => router.replace("/historial")}>
              <Ionicons name="time-outline" size={20} color={COLORS.surface} />
              <Text style={styles.primaryBtnText}>Ver historial</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={() => router.replace("/")}>
              <Text style={styles.secondaryBtnText}>Volver al inicio</Text>
            </Pressable>
          </ScrollView>
        </View>
      );
    }

    // ─────────────────────────────────────────────────────────
    // RENDER: PANTALLA PRINCIPAL
    // ─────────────────────────────────────────────────────────

    return (
      <View style={styles.root}>
        <StatusBar style="dark" />
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {params.origenDesc && params.destinoDesc
              ? `${params.origenDesc} → ${params.destinoDesc}`
              : "Iniciar Ruta"}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.stateRow}>
            <Animated.View
              style={[
                styles.stateDot,
                {
                  backgroundColor:
                    routeState === "active" ? COLORS.primary
                    : routeState === "paused" ? COLORS.warning
                    : COLORS.border,
                  transform: [{ scale: pulseAnim }],
                },
              ]}
            />
            <Text style={styles.stateLabel}>
              {routeState === "idle" ? "Listo para rodar"
                : routeState === "active" ? "Ruta en curso"
                : "Ruta pausada"}
            </Text>
            {puntosPendientes > 0 && (
              <View style={styles.pendingBadge}>
                <Ionicons name="cloud-upload-outline" size={11} color={COLORS.warning} />
                <Text style={styles.pendingText}>{puntosPendientes} sin sincronizar</Text>
              </View>
            )}
          </View>

          {locationError && (
            <View style={styles.errorBanner}>
              <Ionicons name="warning-outline" size={16} color={COLORS.danger} />
              <Text style={styles.errorText}>{locationError}</Text>
            </View>
          )}

          <View style={styles.clockCard}>
            <Text style={styles.clockLabel}>TIEMPO</Text>
            <Text style={styles.clock}>{formatClock(elapsedSeconds)}</Text>
          </View>

          <View style={styles.metricsGrid}>
            <MetricCard
              icon="map-outline"
              value={distanceKm >= 1 ? `${distanceKm.toFixed(2)}` : `${(distanceKm * 1000).toFixed(0)}`}
              unit={distanceKm >= 1 ? "km" : "m"}
              label="Distancia"
            />
            <MetricCard icon="speedometer-outline" value={speedKmh.toFixed(1)} unit="km/h" label="Velocidad" />
          </View>

          <View style={styles.controls}>
            {routeState === "idle" && (
              <Pressable style={styles.startBtn} onPress={handleStart}>
                <Ionicons name="bicycle" size={24} color={COLORS.surface} />
                <Text style={styles.startBtnText}>Iniciar recorrido</Text>
              </Pressable>
            )}
            {(routeState === "active" || routeState === "paused") && (
              <View style={styles.activeControls}>
                <Pressable style={[styles.pauseBtn, routeState === "paused" && styles.resumeBtn]} onPress={handlePause}>
                  <Ionicons name={routeState === "active" ? "pause" : "play"} size={22} color={routeState === "active" ? COLORS.textPrimary : COLORS.primary} />
                  <Text style={[styles.pauseBtnText, routeState === "paused" && { color: COLORS.primary }]}>
                    {routeState === "active" ? "Pausar" : "Reanudar"}
                  </Text>
                </Pressable>
                <Pressable style={[styles.stopBtn, finalizando && { opacity: 0.6 }]} onPress={handleFinish} disabled={finalizando}>
                  <Ionicons name="stop-circle" size={22} color={COLORS.surface} />
                  <Text style={styles.stopBtnText}>{finalizando ? "Guardando..." : "Finalizar"}</Text>
                </Pressable>
              </View>
            )}
          </View>

          <View style={styles.tip}>
            <Ionicons name="information-circle-outline" size={16} color={COLORS.primary} />
            <Text style={styles.tipText}>
              {routeState === "idle"
                ? "Toca «Iniciar recorrido» cuando estés listo para pedalear."
                : routeState === "paused"
                ? "Ruta pausada. Toca «Reanudar» para continuar."
                : "GPS activo. Tu recorrido se está guardando automáticamente."}
            </Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // SUB-COMPONENTES (sin cambios)
  // ─────────────────────────────────────────────────────────────

  function MetricCard({ icon, value, unit, label }: { icon: string; value: string; unit: string; label: string }) {
    return (
      <View style={styles.metricCard}>
        <Ionicons name={icon as any} size={20} color={COLORS.primary} />
        <View style={styles.metricValueRow}>
          <Text style={styles.metricValue}>{value}</Text>
          <Text style={styles.metricUnit}>{unit}</Text>
        </View>
        <Text style={styles.metricLabel}>{label}</Text>
      </View>
    );
  }

  function SummaryRow({ icon, label, value }: { icon: string; label: string; value: string }) {
    return (
      <View style={styles.summaryRow}>
        <View style={styles.summaryIconWrap}>
          <Ionicons name={icon as any} size={18} color={COLORS.primary} />
        </View>
        <Text style={styles.summaryLabel}>{label}</Text>
        <Text style={styles.summaryValue}>{value}</Text>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // ESTILOS (los originales + 2 nuevos: pendingBadge, warningBanner)
  // ─────────────────────────────────────────────────────────────

  const shadow = Platform.select({
    ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8 },
    android: { elevation: 3 },
  }) ?? {};

  const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: COLORS.background },
    header: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: SPACING.md, paddingTop: Platform.OS === "ios" ? 56 : 40, paddingBottom: SPACING.md,
      backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border,
    },
    backBtn: { width: 40, height: 40, borderRadius: RADIUS.full, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.background },
    headerTitle: { flex: 1, fontSize: 15, fontWeight: "700", color: COLORS.textPrimary, textAlign: "center", marginHorizontal: SPACING.sm },
    scrollContent: { padding: SPACING.lg, gap: SPACING.md },
    stateRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, justifyContent: "center", marginBottom: SPACING.xs, flexWrap: "wrap" },
    stateDot: { width: 10, height: 10, borderRadius: 5 },
    stateLabel: { fontSize: 13, fontWeight: "600", color: COLORS.textSecondary },
    pendingBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#FEF9E7", paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full },
    pendingText: { fontSize: 10, color: COLORS.warning, fontWeight: "700" },
    errorBanner: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, backgroundColor: "#FDEDEC", borderRadius: RADIUS.md, padding: SPACING.md, borderWidth: 1, borderColor: "#F1948A" },
    errorText: { fontSize: 13, color: COLORS.danger, flex: 1 },
    puntosCard: { width: "100%", backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.primary + "40", gap: SPACING.sm, alignItems: "center" },
    puntosGanados: { fontSize: 24, fontWeight: "900", color: COLORS.primaryDark },
    puntosTotales: { fontSize: 13, color: COLORS.textSecondary },
    logroNuevo: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.sm, width: "100%" },
    logroNuevoTitulo: { fontSize: 13, fontWeight: "700", color: COLORS.textPrimary },
    logroNuevoDesc: { fontSize: 11, color: COLORS.textSecondary },
    verLogros: { fontSize: 13, fontWeight: "700", color: COLORS.primaryDark, marginTop: SPACING.xs },
    warningBanner: { flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm, backgroundColor: "#FEF9E7", borderRadius: RADIUS.md, padding: SPACING.md, borderWidth: 1, borderColor: "#FAD7A0", width: "100%", marginBottom: SPACING.md },
    warningText: { fontSize: 12, color: "#B7791F", flex: 1, lineHeight: 17 },
    clockCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: SPACING.xl, alignItems: "center", ...shadow },
    clockLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 2, color: COLORS.textMuted, marginBottom: SPACING.sm },
    clock: { fontSize: 64, fontWeight: "800", color: COLORS.textPrimary, letterSpacing: -2 },
    metricsGrid: { flexDirection: "row", gap: SPACING.md },
    metricCard: { flex: 1, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, alignItems: "center", gap: SPACING.xs, ...shadow },
    metricValueRow: { flexDirection: "row", alignItems: "flex-end", gap: 3 },
    metricValue: { fontSize: 28, fontWeight: "800", color: COLORS.textPrimary, letterSpacing: -0.5 },
    metricUnit: { fontSize: 13, fontWeight: "600", color: COLORS.primary, marginBottom: 4 },
    metricLabel: { fontSize: 11, color: COLORS.textSecondary },
    controls: { marginTop: SPACING.sm },
    startBtn: {
      backgroundColor: COLORS.primary, borderRadius: RADIUS.full, paddingVertical: SPACING.md + 2,
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.sm,
      ...Platform.select({ ios: { shadowColor: COLORS.primaryDark, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 10 }, android: { elevation: 8 } }),
    },
    startBtnText: { fontSize: 17, fontWeight: "800", color: COLORS.surface },
    activeControls: { flexDirection: "row", gap: SPACING.md },
    pauseBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.sm, paddingVertical: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.full, borderWidth: 1.5, borderColor: COLORS.border, ...shadow },
    resumeBtn: { borderColor: COLORS.primary },
    pauseBtnText: { fontSize: 15, fontWeight: "700", color: COLORS.textPrimary },
    stopBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.sm, paddingVertical: SPACING.md, backgroundColor: COLORS.danger, borderRadius: RADIUS.full, ...Platform.select({ ios: { shadowColor: COLORS.danger, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 }, android: { elevation: 6 } }) },
    stopBtnText: { fontSize: 15, fontWeight: "700", color: COLORS.surface },
    tip: { flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm, backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.md, padding: SPACING.md },
    tipText: { fontSize: 12, color: COLORS.primaryDark, flex: 1, lineHeight: 18 },
    finishedScroll: { padding: SPACING.lg, alignItems: "center", paddingTop: 80 },
    successBadge: { width: 120, height: 120, borderRadius: 60, backgroundColor: COLORS.primaryLight, justifyContent: "center", alignItems: "center", marginBottom: SPACING.lg },
    finishedTitle: { fontSize: 26, fontWeight: "800", color: COLORS.textPrimary, letterSpacing: -0.5, marginBottom: SPACING.sm },
    finishedSub: { fontSize: 14, color: COLORS.textSecondary, textAlign: "center", lineHeight: 20, marginBottom: SPACING.xl },
    summaryCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, width: "100%", overflow: "hidden", marginBottom: SPACING.xl, ...shadow },
    summaryRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, gap: SPACING.md },
    summaryIconWrap: { width: 36, height: 36, borderRadius: RADIUS.sm, backgroundColor: COLORS.primaryLight, justifyContent: "center", alignItems: "center" },
    summaryLabel: { flex: 1, fontSize: 14, color: COLORS.textSecondary },
    summaryValue: { fontSize: 14, fontWeight: "700", color: COLORS.textPrimary },
    summaryDivider: { height: 1, backgroundColor: COLORS.border, marginHorizontal: SPACING.md },
    primaryBtn: { width: "100%", backgroundColor: COLORS.primary, borderRadius: RADIUS.full, paddingVertical: SPACING.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.sm, marginBottom: SPACING.md, ...Platform.select({ ios: { shadowColor: COLORS.primaryDark, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 }, android: { elevation: 6 } }) },
    primaryBtnText: { fontSize: 16, fontWeight: "800", color: COLORS.surface },
    secondaryBtn: { paddingVertical: SPACING.md, paddingHorizontal: SPACING.xl },
    secondaryBtnText: { fontSize: 14, color: COLORS.textSecondary, fontWeight: "600" },
  });
