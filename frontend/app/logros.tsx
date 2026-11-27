/**
 * CICLAPP — Logros y Retos Semanales
 * app/logros.tsx
 */

import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { misLogros, LogroAPI, LogrosResponse } from "../services/storage";

// ─────────────────────────────────────────────────────────────
// DESIGN TOKENS
// ─────────────────────────────────────────────────────────────

const COLORS = {
  primary: "#27AE60",
  primaryDark: "#1E8449",
  primaryLight: "#EAFAF1",
  background: "#F8FAF9",
  surface: "#FFFFFF",
  textPrimary: "#1A1A2E",
  textSecondary: "#6B7280",
  textMuted: "#9CA3AF",
  border: "#E5E7EB",
  gold: "#F1C40F",
  goldLight: "#FEF9E7",
  silver: "#BDC3C7",
  silverLight: "#F2F3F4",
  bronze: "#CA6F1E",
  bronzeLight: "#FDEBD0",
} as const;

const SPACING = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
const RADIUS = { sm: 8, md: 14, lg: 20, xl: 28, full: 999 } as const;

// ─────────────────────────────────────────────────────────────
// TIPOS Y DATOS
// ─────────────────────────────────────────────────────────────

type Reto = {
  id: string;
  titulo: string;
  descripcion: string;
  meta: number;
  unidad: string;
  emoji: string;
  color: string;
  progreso: (stats: { totalKm: number; totalRoutes: number; totalSeconds: number }) => number;
};

const RETOS_SEMANA: Reto[] = [
  { id: "r1", titulo: "Meta de km", descripcion: "Pedalea 20 km esta semana", meta: 20, unidad: "km", emoji: "🗺️", color: "#27AE60", progreso: (s) => s.totalKm },
  { id: "r2", titulo: "Constancia", descripcion: "Completa 3 rutas esta semana", meta: 3, unidad: "rutas", emoji: "🔁", color: "#2980B9", progreso: (s) => s.totalRoutes },
  { id: "r3", titulo: "Tiempo activo", descripcion: "Acumula 90 minutos pedaleando", meta: 90, unidad: "min", emoji: "⏰", color: "#8E44AD", progreso: (s) => Math.floor(s.totalSeconds / 60) },
];

// ─────────────────────────────────────────────────────────────
// COMPONENTE: Barra de progreso
// ─────────────────────────────────────────────────────────────

function BarraProgreso({ progreso, color }: { progreso: number; color: string }) {
  const widthAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: Math.min(progreso, 100),
      duration: 800,
      useNativeDriver: false,
    }).start();
  }, [progreso, widthAnim]);

  return (
    <View style={barra.track}>
      <Animated.View
        style={[barra.fill, { backgroundColor: color, width: widthAnim.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }) }]}
      />
    </View>
  );
}

const barra = StyleSheet.create({
  track: { height: 8, backgroundColor: "#E5E7EB", borderRadius: 4, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4 },
});

// ─────────────────────────────────────────────────────────────
// COMPONENTE: LogroCard
// ─────────────────────────────────────────────────────────────

function LogroCard({ logro, desbloqueado }: { logro: LogroAPI; desbloqueado: boolean }) {
  const scaleAnim = useRef(new Animated.Value(desbloqueado ? 1 : 0.95)).current;
  const tipoConfig = {
    oro: { color: COLORS.gold, bg: COLORS.goldLight, label: "Oro" },
    plata: { color: COLORS.silver, bg: COLORS.silverLight, label: "Plata" },
    bronce: { color: COLORS.bronze, bg: COLORS.bronzeLight, label: "Bronce" },
  }[logro.tipo];

  useEffect(() => {
    if (desbloqueado) {
      Animated.spring(scaleAnim, { toValue: 1, bounciness: 8, useNativeDriver: true }).start();
    }
  }, [desbloqueado, scaleAnim]);

  return (
    <Animated.View style={[styles.logroCard, !desbloqueado && styles.logro_locked, { transform: [{ scale: scaleAnim }] }]}>
      <View style={[styles.logroEmojiWrap, { backgroundColor: desbloqueado ? tipoConfig.bg : "#F2F3F4" }]}>
        <Text style={[styles.logroEmoji, !desbloqueado && { opacity: 0.3 }]}>{logro.emoji}</Text>
        {desbloqueado && (
          <View style={[styles.logroTipoBadge, { backgroundColor: tipoConfig.color }]}>
            <Text style={styles.logroTipoText}>{tipoConfig.label}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.logroTitulo, !desbloqueado && styles.logroTextoLocked]}>{logro.titulo}</Text>
      <Text style={styles.logroDesc} numberOfLines={2}>{logro.descripcion}</Text>
      <View style={[styles.puntosChip, !desbloqueado && { opacity: 0.6 }]}>
        <Text style={styles.puntosChipText}>+{logro.puntosOtorgados} pts</Text>
      </View>
      {!desbloqueado && (
        <View style={styles.lockIcon}>
          <Ionicons name="lock-closed" size={12} color={COLORS.textMuted} />
        </View>
      )}
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────
// PANTALLA PRINCIPAL
// ─────────────────────────────────────────────────────────────

export default function LogrosScreen() {
  const [tab, setTab] = useState<"retos" | "logros">("logros");
  const [data, setData] = useState<LogrosResponse | null>(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setError(null);
      setData(await misLogros());
    } catch (e: any) {
      setError(e?.message || "No se pudieron cargar tus logros");
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      cargar();
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    }, [fadeAnim, cargar])
  );

  // Progreso semanal (retos) calculado en el servidor con los recorridos finalizados
  const weekStats = {
    totalKm: data?.semana?.km ?? 0,
    totalRoutes: data?.semana?.rutas ?? 0,
    totalSeconds: data?.semana?.segundos ?? 0,
  };
  const listaLogros = data?.logros ?? [];
  const logrosDesbloqueados = listaLogros.filter((l) => l.desbloqueado);
  const totalLogros = listaLogros.length;
  const porcentaje = totalLogros ? Math.round((logrosDesbloqueados.length / totalLogros) * 100) : 0;

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); cargar(); }} tintColor={COLORS.primary} />}
        >

          {/* ── HEADER ── */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
            </TouchableOpacity>
            <View>
              <Text style={styles.headerTitle}>Logros & Retos</Text>
              <Text style={styles.headerSub}>Tus puntos y recompensas</Text>
            </View>
          </View>

          {/* ── RESUMEN DE PROGRESO ── */}
          <View style={styles.resumenCard}>
            <View style={styles.resumenRow}>
              <View style={styles.resumenStat}>
                <Text style={styles.resumenNum}>{data?.puntos ?? 0}</Text>
                <Text style={styles.resumenLabel}>⭐ Puntos</Text>
              </View>
              <View style={styles.resumenDivider} />
              <View style={styles.resumenStat}>
                <Text style={styles.resumenNum}>{(data?.totalKm ?? 0).toFixed(1)}</Text>
                <Text style={styles.resumenLabel}>km totales</Text>
              </View>
              <View style={styles.resumenDivider} />
              <View style={styles.resumenStat}>
                <Text style={styles.resumenNum}>{data?.totalRutas ?? 0}</Text>
                <Text style={styles.resumenLabel}>Rutas</Text>
              </View>
            </View>
            <View style={styles.resumenProgreso}>
              <View style={styles.resumenProgresoHeader}>
                <Text style={styles.resumenProgresoLabel}>Logros: {logrosDesbloqueados.length} de {totalLogros}</Text>
                <Text style={styles.resumenPorcentaje}>{porcentaje}%</Text>
              </View>
              <BarraProgreso progreso={porcentaje} color={COLORS.primary} />
            </View>
          </View>

          {/* ── TABS ── */}
          <View style={styles.tabs}>
            {(["retos", "logros"] as const).map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.tab, tab === t && styles.tabActive]}
                onPress={() => setTab(t)}
              >
                <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                  {t === "retos" ? "🎯 Retos semanales" : "🏆 Mis logros"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── RETOS SEMANALES ── */}
          {tab === "retos" && (
            <View style={styles.content}>
              {RETOS_SEMANA.map((reto) => {
                const actual = reto.progreso(weekStats);
                const pct = Math.min((actual / reto.meta) * 100, 100);
                const completado = pct >= 100;
                return (
                  <View key={reto.id} style={[styles.retoCard, completado && styles.retoCardDone]}>
                    <View style={styles.retoTop}>
                      <View style={[styles.retoEmojiWrap, { backgroundColor: reto.color + "15" }]}>
                        <Text style={{ fontSize: 22 }}>{reto.emoji}</Text>
                      </View>
                      <View style={styles.retoInfo}>
                        <View style={styles.retoTitleRow}>
                          <Text style={styles.retoTitulo}>{reto.titulo}</Text>
                          {completado && (
                            <View style={styles.retoDoneBadge}>
                              <Ionicons name="checkmark" size={12} color="#FFF" />
                              <Text style={styles.retoDoneText}>¡Logrado!</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.retoDesc}>{reto.descripcion}</Text>
                      </View>
                    </View>
                    <View style={styles.retoProgresoRow}>
                      <BarraProgreso progreso={pct} color={completado ? COLORS.primary : reto.color} />
                      <Text style={[styles.retoProgresoText, { color: reto.color }]}>
                        {reto.unidad === "km" ? actual.toFixed(1) : actual} / {reto.meta} {reto.unidad}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* ── LOGROS ── */}
          {tab === "logros" && (
            <View style={styles.content}>
              <View style={styles.logrosHeader}>
                <Text style={styles.logrosSubtitle}>
                  {logrosDesbloqueados.length} de {totalLogros} desbloqueados
                </Text>
              </View>
              <View style={styles.logrosGrid}>
                {cargando && <ActivityIndicator color={COLORS.primary} style={{ margin: SPACING.lg }} />}
                {!cargando && error && <Text style={styles.errorText}>⚠️ {error}</Text>}
                {listaLogros.map((logro) => (
                  <LogroCard key={logro.id} logro={logro} desbloqueado={!!logro.desbloqueado} />
                ))}
              </View>
            </View>
          )}

        </ScrollView>
      </Animated.View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────────────────────

const cardShadow = Platform.select({
  ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10 },
  android: { elevation: 2 },
}) ?? {};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },

  header: { flexDirection: "row", alignItems: "center", paddingTop: Platform.OS === "ios" ? 60 : 40, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md, gap: SPACING.md },
  backBtn: { width: 40, height: 40, borderRadius: RADIUS.full, backgroundColor: COLORS.surface, justifyContent: "center", alignItems: "center", ...cardShadow },
  headerTitle: { fontSize: 22, fontWeight: "800", color: COLORS.textPrimary, letterSpacing: -0.3 },
  headerSub: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },

  resumenCard: { marginHorizontal: SPACING.lg, backgroundColor: COLORS.primary, borderRadius: RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.lg, ...Platform.select({ ios: { shadowColor: COLORS.primaryDark, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12 }, android: { elevation: 8 } }) },
  resumenRow: { flexDirection: "row", alignItems: "center", marginBottom: SPACING.md },
  resumenStat: { flex: 1, alignItems: "center" },
  resumenNum: { fontSize: 24, fontWeight: "900", color: "#FFF", letterSpacing: -0.5 },
  resumenLabel: { fontSize: 11, color: "rgba(255,255,255,0.75)", marginTop: 2 },
  resumenDivider: { width: 1, height: 36, backgroundColor: "rgba(255,255,255,0.25)" },
  resumenProgreso: { gap: 6 },
  resumenProgresoHeader: { flexDirection: "row", justifyContent: "space-between" },
  resumenProgresoLabel: { fontSize: 12, color: "rgba(255,255,255,0.85)", fontWeight: "600" },
  resumenPorcentaje: { fontSize: 12, color: "#FFF", fontWeight: "700" },

  tabs: { flexDirection: "row", marginHorizontal: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.full, padding: 4, marginBottom: SPACING.lg, ...cardShadow },
  tab: { flex: 1, paddingVertical: SPACING.sm, borderRadius: RADIUS.full, alignItems: "center" },
  tabActive: { backgroundColor: COLORS.primary },
  tabText: { fontSize: 13, fontWeight: "600", color: COLORS.textSecondary },
  tabTextActive: { color: "#FFF" },

  content: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl },

  retoCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border, ...cardShadow },
  retoCardDone: { borderColor: COLORS.primary + "60", backgroundColor: COLORS.primaryLight },
  retoTop: { flexDirection: "row", gap: SPACING.md, marginBottom: SPACING.md },
  retoEmojiWrap: { width: 48, height: 48, borderRadius: RADIUS.md, justifyContent: "center", alignItems: "center" },
  retoInfo: { flex: 1 },
  retoTitleRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, flexWrap: "wrap" },
  retoTitulo: { fontSize: 15, fontWeight: "700", color: COLORS.textPrimary, letterSpacing: -0.2 },
  retoDoneBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: COLORS.primary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full },
  retoDoneText: { fontSize: 11, fontWeight: "700", color: "#FFF" },
  retoDesc: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  retoProgresoRow: { gap: 6 },
  retoProgresoText: { fontSize: 12, fontWeight: "700", textAlign: "right" },

  logrosHeader: { marginBottom: SPACING.md },
  logrosSubtitle: { fontSize: 13, color: COLORS.textSecondary },
  logrosGrid: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },

  logroCard: { width: "30.5%", backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.sm, alignItems: "center", gap: 4, borderWidth: 1, borderColor: COLORS.border, ...cardShadow },
  logro_locked: { opacity: 0.55 },
  logroEmojiWrap: { width: 52, height: 52, borderRadius: RADIUS.md, justifyContent: "center", alignItems: "center", position: "relative" },
  logroEmoji: { fontSize: 26 },
  logroTipoBadge: { position: "absolute", bottom: -4, right: -4, paddingHorizontal: 5, paddingVertical: 2, borderRadius: RADIUS.full },
  logroTipoText: { fontSize: 8, fontWeight: "800", color: "#FFF" },
  logroTitulo: { fontSize: 11, fontWeight: "700", color: COLORS.textPrimary, textAlign: "center", letterSpacing: -0.2 },
  logroTextoLocked: { color: COLORS.textMuted },
  logroDesc: { fontSize: 10, color: COLORS.textSecondary, textAlign: "center", lineHeight: 14 },
  puntosChip: { backgroundColor: COLORS.primaryLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.full },
  puntosChipText: { fontSize: 9, fontWeight: "800", color: COLORS.primaryDark },
  errorText: { color: "#B91C1C", fontSize: 13, padding: SPACING.md },
  lockIcon: { position: "absolute", top: 6, right: 6 },
});
