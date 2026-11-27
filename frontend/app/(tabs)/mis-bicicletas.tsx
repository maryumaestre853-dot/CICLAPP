/**
 * CICLAPP — Mis bicicletas
 * app/(tabs)/mis-bicicletas.tsx
 *
 * - Estado vacío (sin bicicletas)
 * - Vista Lista / Cuadrícula
 * - Tocar una tarjeta abre el detalle; el menú (⋮ o mantener presionado)
 *   permite Editar / Eliminar.
 */

import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { infoTipo } from "@/constants/bicicletas";
import { BicycleRecord, deleteBicycle, loadBicyclePhotos, loadBicycles } from "../../services/storage";

const COLORS = {
  navy: "#0F2A43",
  green: "#27AE60",
  greenDark: "#1E8449",
  greenSoft: "#E3F6EA",
  blue: "#2F80ED",
  background: "#F4F7F9",
  surface: "#FFFFFF",
  textPrimary: "#1A1A2E",
  textSecondary: "#6B7280",
  border: "#E5E7EB",
} as const;

type Vista = "lista" | "cuadricula";

// ─────────────────────────────────────────────────────────────
// TARJETA DE BICICLETA (sirve para lista y cuadrícula)
// ─────────────────────────────────────────────────────────────

function TarjetaBici({
  item,
  fotoUri,
  vista,
  anchoGrid,
  onEliminada,
}: {
  item: BicycleRecord;
  fotoUri?: string;
  vista: Vista;
  anchoGrid: number;
  onEliminada: () => void;
}) {
  const { label, foto } = infoTipo(item.tipo);

  const verDetalle = () =>
    router.push({ pathname: "/detalle-bicicleta", params: { id: item.id } });
  const editar = () =>
    router.push({ pathname: "/editar-bicicleta", params: { id: item.id } });

  const eliminar = () =>
    Alert.alert(
      "Eliminar bicicleta",
      `¿Seguro que quieres eliminar tu ${item.marca} ${item.modelo}?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteBicycle(item.id);
              onEliminada();
            } catch (e: any) {
              Alert.alert("No se pudo eliminar", e?.message ?? "Inténtalo de nuevo.");
            }
          },
        },
      ]
    );

  const abrirMenu = () =>
    Alert.alert(`${item.marca} ${item.modelo}`, "¿Qué quieres hacer?", [
      { text: "Editar", onPress: editar },
      { text: "Eliminar", style: "destructive", onPress: eliminar },
      { text: "Cancelar", style: "cancel" },
    ]);

  const imagen = fotoUri ? { uri: fotoUri } : foto;
  const badge = (
    <View style={styles.badge}>
      <View style={styles.badgeDot} />
      <Text style={styles.badgeTxt}>Activa</Text>
    </View>
  );

  // ── Cuadrícula ──
  if (vista === "cuadricula") {
    return (
      <TouchableOpacity
        style={[styles.gridCard, { width: anchoGrid }]}
        activeOpacity={0.9}
        onPress={verDetalle}
        onLongPress={abrirMenu}
      >
        <View style={styles.gridFoto}>
          <Image source={imagen} style={styles.fotoImg} resizeMode="contain" />
        </View>
        <View style={styles.gridTop}>
          {badge}
          <TouchableOpacity onPress={abrirMenu} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="ellipsis-vertical" size={16} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>
        <Text style={styles.titulo}>{label}</Text>
        <Text style={styles.subtitulo} numberOfLines={1}>
          {item.marca} {item.modelo}
        </Text>
        <Text style={styles.anio}>Año: {item.anio || "—"}</Text>
      </TouchableOpacity>
    );
  }

  // ── Lista ──
  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.9} onPress={verDetalle} onLongPress={abrirMenu}>
      <View style={styles.fotoBox}>
        <Image source={imagen} style={styles.fotoImg} resizeMode="contain" />
      </View>

      <View style={styles.cardInfo}>
        {badge}
        <Text style={styles.titulo}>{label}</Text>
        <Text style={styles.subtitulo} numberOfLines={1}>
          {item.marca} {item.modelo}
        </Text>
        <Text style={styles.anio}>Año: {item.anio || "—"}</Text>
      </View>

      <Ionicons name="chevron-forward" size={20} color={COLORS.navy} style={styles.chevron} />
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────
// ESTADO VACÍO
// ─────────────────────────────────────────────────────────────

function EstadoVacio() {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyArte}>
        <View style={styles.emptyBlob} />
        <Ionicons name="cloud" size={34} color="#D5EFE0" style={{ position: "absolute", top: 18, right: 16 }} />
        <Ionicons name="cloud" size={22} color="#D5EFE0" style={{ position: "absolute", top: 40, left: 6 }} />
        <Image
          source={require("../../assets/images/bici-montana.png")}
          style={styles.emptyBici}
          resizeMode="contain"
        />
      </View>

      <Text style={styles.emptyTitle}>Aún no tienes bicicletas</Text>
      <Text style={styles.emptySub}>
        Registra tu primera bicicleta y empieza a explorar nuevas rutas.
      </Text>

      <TouchableOpacity
        style={[styles.btnPrimary, { alignSelf: "stretch", marginTop: 28 }]}
        onPress={() => router.push("/registro-bicicleta")}
        activeOpacity={0.85}
      >
        <View style={styles.btnPlus}>
          <Ionicons name="add" size={18} color={COLORS.green} />
        </View>
        <Text style={styles.btnPrimaryText}>Registrar bicicleta</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// PANTALLA
// ─────────────────────────────────────────────────────────────

export default function MisBicicletasScreen() {
  const { width } = useWindowDimensions();
  const anchoGrid = (width - 36 - 12) / 2; // padding 18*2 y separación 12

  const [bicis, setBicis] = useState<BicycleRecord[]>([]);
  const [fotos, setFotos] = useState<Record<string, string>>({});
  const [vista, setVista] = useState<Vista>("lista");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const cargar = useCallback(async () => {
    const data = await loadBicycles();
    setBicis(data);
    setFotos(await loadBicyclePhotos(data.map((b) => b.id)));
  }, []);

  useFocusEffect(
    useCallback(() => {
      let activo = true;
      (async () => {
        await cargar();
        if (activo) setLoading(false);
      })();
      return () => {
        activo = false;
      };
    }, [cargar])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await cargar();
    setRefreshing(false);
  };

  const vacio = !loading && bicis.length === 0;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* ── HEADER ── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.replace("/(tabs)")}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mis bicicletas</Text>
        <TouchableOpacity style={styles.gear} onPress={() => router.push("/perfil")}>
          <Ionicons name="settings-sharp" size={18} color="#FFF" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.green} />
        </View>
      ) : vacio ? (
        <EstadoVacio />
      ) : (
        <>
          {/* ── SELECTOR LISTA / CUADRÍCULA ── */}
          <View style={styles.toggle}>
            {(["lista", "cuadricula"] as Vista[]).map((v) => {
              const activo = vista === v;
              return (
                <TouchableOpacity
                  key={v}
                  style={[styles.toggleBtn, activo && styles.toggleBtnActivo]}
                  onPress={() => setVista(v)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.toggleTxt, activo && styles.toggleTxtActivo]}>
                    {v === "lista" ? "Lista" : "Cuadrícula"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <FlatList
            key={vista /* cambia el número de columnas */}
            data={bicis}
            keyExtractor={(item) => item.id}
            numColumns={vista === "cuadricula" ? 2 : 1}
            columnWrapperStyle={vista === "cuadricula" ? { gap: 12 } : undefined}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            renderItem={({ item }) => (
              <TarjetaBici
                item={item}
                fotoUri={fotos[item.id]}
                vista={vista}
                anchoGrid={anchoGrid}
                onEliminada={cargar}
              />
            )}
          />

          {/* ── BOTÓN ── */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.btnPrimary}
              onPress={() => router.push("/registro-bicicleta")}
              activeOpacity={0.85}
            >
              <View style={styles.btnPlus}>
                <Ionicons name="add" size={18} color={COLORS.green} />
              </View>
              <Text style={styles.btnPrimaryText}>Registrar nueva bicicleta</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────────────────────

const shadow =
  Platform.select({
    ios: { shadowColor: "#0F2A43", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 10 },
    android: { elevation: 3 },
  }) ?? {};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: COLORS.navy,
    paddingHorizontal: 18,
    paddingTop: Platform.OS === "ios" ? 62 : 42,
    paddingBottom: 18,
  },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: "800", color: "#FFF", letterSpacing: -0.2 },
  gear: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.blue,
    justifyContent: "center",
    alignItems: "center",
  },

  // Selector Lista / Cuadrícula
  toggle: { flexDirection: "row", gap: 10, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 4 },
  toggleBtn: {
    flex: 1,
    height: 38,
    borderRadius: 999,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: "center",
    alignItems: "center",
  },
  toggleBtnActivo: { backgroundColor: COLORS.green, borderColor: COLORS.green },
  toggleTxt: { fontSize: 13, fontWeight: "700", color: COLORS.textSecondary },
  toggleTxtActivo: { color: "#FFF" },

  list: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 12, flexGrow: 1 },

  // Tarjeta (lista)
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 10,
    marginBottom: 14,
    ...shadow,
  },
  fotoBox: {
    width: 118,
    height: 108,
    borderRadius: 14,
    backgroundColor: "#F3F6F9",
    justifyContent: "center",
    alignItems: "center",
    padding: 4,
  },
  fotoImg: { width: "100%", height: "100%" },
  cardInfo: { flex: 1, marginLeft: 12, gap: 3 },
  chevron: { alignSelf: "flex-start", marginTop: 6, marginRight: 2 },

  // Tarjeta (cuadrícula)
  gridCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 10,
    marginBottom: 12,
    ...shadow,
  },
  gridFoto: {
    height: 104,
    borderRadius: 14,
    backgroundColor: "#F3F6F9",
    justifyContent: "center",
    alignItems: "center",
    padding: 4,
    marginBottom: 8,
  },
  gridTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },

  badge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: COLORS.greenSoft,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.green },
  badgeTxt: { fontSize: 11, fontWeight: "700", color: COLORS.greenDark },

  titulo: { fontSize: 16.5, fontWeight: "800", color: COLORS.navy, marginTop: 2 },
  subtitulo: { fontSize: 12.5, color: COLORS.textSecondary },
  anio: { fontSize: 12, color: COLORS.textSecondary },

  // Estado vacío
  empty: { flex: 1, alignItems: "center", paddingHorizontal: 26, paddingTop: 50 },
  emptyArte: { width: 260, height: 190, justifyContent: "center", alignItems: "center", marginBottom: 22 },
  emptyBlob: {
    position: "absolute",
    width: 200,
    height: 170,
    borderRadius: 90,
    backgroundColor: COLORS.greenSoft,
  },
  emptyBici: { width: 210, height: 150 },
  emptyTitle: { fontSize: 19, fontWeight: "800", color: COLORS.navy },
  emptySub: {
    fontSize: 13.5,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginTop: 8,
    paddingHorizontal: 10,
  },

  footer: { paddingHorizontal: 18, paddingVertical: 12 },
  btnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 54,
    backgroundColor: COLORS.green,
    borderRadius: 999,
    ...Platform.select({
      ios: { shadowColor: COLORS.greenDark, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
      android: { elevation: 6 },
    }),
  },
  btnPlus: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
  },
  btnPrimaryText: { fontSize: 16, fontWeight: "800", color: "#FFF", letterSpacing: -0.2 },
});
