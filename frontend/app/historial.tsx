/**
 * CICLAPP — Pantalla Historial
 * app/historial.tsx
 *
 * FASE 7 — Ahora muestra los recorridos GUARDADOS EN POSTGRESQL
 * (GET /recorridos-gps/usuario/{id}), no solo el caché local.
 * Al tocar una ruta, navega a detalle-ruta.tsx que la redibuja
 * en el mapa con su Polyline real y sus puntos GPS.
 */

import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  historialRecorridosGPS,
  editarNombresRecorridoGPS,
  formatDuration,
  type RecorridoGPS,
} from "../services/storage";

// ─────────────────────────────────────────────────────────────
// TOKENS (idénticos al resto de la app)
// ─────────────────────────────────────────────────────────────

const COLORS = {
  primary: "#27AE60",
  primaryDark: "#1E8449",
  primaryLight: "#EAFAF1",
  danger: "#E74C3C",
  surface: "#FFFFFF",
  background: "#F8FAF9",
  textPrimary: "#1A1A2E",
  textSecondary: "#6B7280",
  textMuted: "#9CA3AF",
  border: "#E5E7EB",
} as const;

const SPACING = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
const RADIUS = { sm: 8, md: 14, lg: 20, xl: 28, full: 999 } as const;

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CO", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

function avgSpeed(r: RecorridoGPS): string {
  const dur = r.duracion_real_segundos ?? 0;
  const km = r.distancia_real_km ?? 0;
  if (dur === 0) return "—";
  return `${((km / dur) * 3600).toFixed(1)} km/h`;
}

// ─────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────

export default function HistorialScreen() {
  const [rutas, setRutas] = useState<RecorridoGPS[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Barra de búsqueda
  const [busqueda, setBusqueda] = useState("");

  // Edición de nombres de origen / destino
  const [editando, setEditando] = useState<RecorridoGPS | null>(null);
  const [editOrigen, setEditOrigen] = useState("");
  const [editDestino, setEditDestino] = useState("");
  const [guardando, setGuardando] = useState(false);

  const fetchHistorial = useCallback(async () => {
    setError(null);
    try {
      const data = await historialRecorridosGPS();
      setRutas(data);
    } catch (e: any) {
      setError(e.message || "No se pudo cargar el historial.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Se recarga cada vez que vuelves a esta pantalla (ej: tras finalizar una ruta)
  useFocusEffect(useCallback(() => { fetchHistorial(); }, [fetchHistorial]));

  const onRefresh = () => {
    setRefreshing(true);
    fetchHistorial();
  };

  const abrirEdicion = (r: RecorridoGPS) => {
    setEditando(r);
    setEditOrigen(r.origen_desc ?? "");
    setEditDestino(r.destino_desc ?? "");
  };

  const guardarEdicion = async () => {
    if (!editando) return;
    const origen = editOrigen.trim();
    const destino = editDestino.trim();
    if (!origen || !destino) {
      Alert.alert("Datos incompletos", "El origen y el destino no pueden estar vacíos.");
      return;
    }
    setGuardando(true);
    try {
      const actualizada = await editarNombresRecorridoGPS(editando.id, {
        origen_desc: origen,
        destino_desc: destino,
      });
      setRutas((prev) =>
        prev.map((r) =>
          r.id === actualizada.id
            ? { ...r, origen_desc: actualizada.origen_desc, destino_desc: actualizada.destino_desc }
            : r
        )
      );
      setEditando(null);
    } catch (e: any) {
      Alert.alert("No se pudo guardar", e.message || "Intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  // Filtra por origen o destino (sin importar mayúsculas ni tildes)
  const rutasFiltradas = useMemo(() => {
    const normalizar = (t: string) =>
      t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const q = normalizar(busqueda.trim());
    if (!q) return rutas;
    return rutas.filter((r) =>
      normalizar(`${r.origen_desc ?? ""} ${r.destino_desc ?? ""}`).includes(q)
    );
  }, [rutas, busqueda]);

  const totales = rutas.reduce(
    (acc, r) => ({
      km: acc.km + (r.distancia_real_km ?? 0),
      seg: acc.seg + (r.duracion_real_segundos ?? 0),
    }),
    { km: 0, seg: 0 }
  );

  const renderItem = useCallback(
    ({ item, index }: { item: RecorridoGPS; index: number }) => (
      <TouchableOpacity
        style={styles.routeCard}
        activeOpacity={0.85}
        onPress={() => router.push({ pathname: "/detalle-ruta", params: { recorridoId: String(item.id) } })}
      >
        <View style={styles.routeIndex}>
          <Text style={styles.routeIndexText}>{index + 1}</Text>
        </View>

        <View style={styles.routeInfo}>
          <Text style={styles.routeName} numberOfLines={1}>
            {item.origen_desc || "Origen"} → {item.destino_desc || "Destino"}
          </Text>
          <Text style={styles.routeDate}>{formatDate(item.finished_at)} · {formatTime(item.finished_at)}</Text>

          <View style={styles.routeStatsRow}>
            <View style={styles.routeStatChip}>
              <Ionicons name="map-outline" size={12} color={COLORS.primary} />
              <Text style={styles.routeStatText}>{(item.distancia_real_km ?? 0).toFixed(2)} km</Text>
            </View>
            <View style={styles.routeStatChip}>
              <Ionicons name="timer-outline" size={12} color={COLORS.primary} />
              <Text style={styles.routeStatText}>{formatDuration(item.duracion_real_segundos ?? 0)}</Text>
            </View>
            <View style={styles.routeStatChip}>
              <Ionicons name="speedometer-outline" size={12} color={COLORS.primary} />
              <Text style={styles.routeStatText}>{avgSpeed(item)}</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={styles.editBtn}
          onPress={() => abrirEdicion(item)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Editar nombres de la ruta"
        >
          <Ionicons name="create-outline" size={18} color={COLORS.primary} />
        </TouchableOpacity>
      </TouchableOpacity>
    ),
    []
  );

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Historial</Text>
          <Text style={styles.headerSub}>{rutas.length} rutas · {totales.km.toFixed(1)} km totales</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 60 }} />
      ) : error ? (
        <View style={styles.emptyBox}>
          <Ionicons name="cloud-offline-outline" size={44} color={COLORS.textMuted} />
          <Text style={styles.emptyTitle}>No se pudo cargar</Text>
          <Text style={styles.emptyText}>{error}</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={fetchHistorial}>
            <Text style={styles.emptyBtnText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : rutas.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="bicycle-outline" size={48} color={COLORS.textMuted} />
          <Text style={styles.emptyTitle}>Sin recorridos aún</Text>
          <Text style={styles.emptyText}>Ve al mapa, calcula una ruta e inicia tu primer recorrido.</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push("/mapa")}>
            <Text style={styles.emptyBtnText}>Ir al mapa</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color={COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar ruta por origen o destino"
            placeholderTextColor={COLORS.textMuted}
            value={busqueda}
            onChangeText={setBusqueda}
            autoCorrect={false}
            returnKeyType="search"
          />
          {busqueda.length > 0 && (
            <TouchableOpacity onPress={() => setBusqueda("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <FlatList
          data={rutasFiltradas}
          ListEmptyComponent={
            <View style={styles.noResults}>
              <Ionicons name="search-outline" size={36} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>Sin resultados</Text>
              <Text style={styles.emptyText}>Ninguna ruta coincide con “{busqueda}”.</Text>
            </View>
          }
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
        />
        </>
      )}

      <Modal
        visible={editando !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditando(null)}
        statusBarTranslucent
        navigationBarTranslucent
      >
        <KeyboardAvoidingView style={styles.modalOverlay} behavior="padding">
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Editar ruta</Text>

            <Text style={styles.modalLabel}>Origen</Text>
            <TextInput
              style={styles.modalInput}
              value={editOrigen}
              onChangeText={setEditOrigen}
              placeholder="Nombre del origen"
              placeholderTextColor={COLORS.textMuted}
              maxLength={120}
            />

            <Text style={styles.modalLabel}>Destino</Text>
            <TextInput
              style={styles.modalInput}
              value={editDestino}
              onChangeText={setEditDestino}
              placeholder="Nombre del destino"
              placeholderTextColor={COLORS.textMuted}
              maxLength={120}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnGhost]}
                onPress={() => setEditando(null)}
                disabled={guardando}
              >
                <Text style={styles.modalBtnGhostText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                onPress={guardarEdicion}
                disabled={guardando}
              >
                {guardando ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.modalBtnPrimaryText}>Guardar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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

  listContent: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xl },
  routeCard: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm, gap: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...cardShadow },
  routeIndex: { width: 32, height: 32, borderRadius: RADIUS.full, backgroundColor: COLORS.primaryLight, justifyContent: "center", alignItems: "center" },
  routeIndexText: { fontSize: 13, fontWeight: "800", color: COLORS.primary },
  routeInfo: { flex: 1, gap: 4 },
  routeName: { fontSize: 14, fontWeight: "700", color: COLORS.textPrimary },
  routeDate: { fontSize: 11, color: COLORS.textSecondary },
  routeStatsRow: { flexDirection: "row", gap: SPACING.xs, marginTop: 2, flexWrap: "wrap" },
  routeStatChip: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: COLORS.background, paddingHorizontal: 6, paddingVertical: 3, borderRadius: RADIUS.full },
  routeStatText: { fontSize: 10, color: COLORS.textPrimary, fontWeight: "600" },

  editBtn: { width: 34, height: 34, borderRadius: RADIUS.full, backgroundColor: COLORS.primaryLight, justifyContent: "center", alignItems: "center" },

  searchBox: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border, marginHorizontal: SPACING.lg, marginBottom: SPACING.md, paddingHorizontal: SPACING.md, height: 44 },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.textPrimary, paddingVertical: 0 },
  noResults: { alignItems: "center", gap: SPACING.sm, paddingTop: SPACING.xl, paddingHorizontal: SPACING.xl },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: SPACING.lg },
  modalCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg },
  modalTitle: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary, marginBottom: SPACING.md },
  modalLabel: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary, marginBottom: 4, marginTop: SPACING.sm },
  modalInput: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, height: 46, fontSize: 14, color: COLORS.textPrimary, backgroundColor: COLORS.background },
  modalActions: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.lg },
  modalBtn: { flex: 1, height: 46, borderRadius: RADIUS.full, justifyContent: "center", alignItems: "center" },
  modalBtnGhost: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  modalBtnGhostText: { fontSize: 14, fontWeight: "700", color: COLORS.textSecondary },
  modalBtnPrimary: { backgroundColor: COLORS.primary },
  modalBtnPrimaryText: { fontSize: 14, fontWeight: "700", color: "#FFF" },

  emptyBox: { flex: 1, justifyContent: "center", alignItems: "center", gap: SPACING.sm, paddingHorizontal: SPACING.xl },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: COLORS.textPrimary },
  emptyText: { fontSize: 13, color: COLORS.textSecondary, textAlign: "center", lineHeight: 19 },
  emptyBtn: { marginTop: SPACING.sm, backgroundColor: COLORS.primary, borderRadius: RADIUS.full, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm },
  emptyBtnText: { fontSize: 14, fontWeight: "700", color: "#FFF" },
});
