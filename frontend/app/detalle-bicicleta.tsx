/**
 * CICLAPP — Detalle de bicicleta
 * app/detalle-bicicleta.tsx
 *
 * Se abre al tocar una tarjeta en "Mis bicicletas".
 * Recibe ?id=<id de la bici> por parámetros.
 */

import { Ionicons } from "@expo/vector-icons";
import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { infoTipo } from "@/constants/bicicletas";
import { BicycleRecord, deleteBicycle, getBicyclePhoto, loadBicycles } from "../services/storage";

const COLORS = {
  navy: "#0F2A43",
  green: "#27AE60",
  greenDark: "#1E8449",
  greenSoft: "#E3F6EA",
  blue: "#2F80ED",
  danger: "#E74C3C",
  background: "#FFFFFF",
  surface: "#FFFFFF",
  textPrimary: "#1A1A2E",
  textSecondary: "#6B7280",
  border: "#E5E7EB",
  photoBg: "#EAF1F7",
} as const;

function Fila({
  icono,
  label,
  valor,
  ultima,
}: {
  icono: keyof typeof Ionicons.glyphMap;
  label: string;
  valor: string;
  ultima?: boolean;
}) {
  return (
    <View style={[styles.fila, !ultima && styles.filaBorde]}>
      <Ionicons name={icono} size={18} color={COLORS.navy} />
      <Text style={styles.filaLabel}>{label}</Text>
      <Text style={styles.filaValor} numberOfLines={1}>
        {valor}
      </Text>
    </View>
  );
}

export default function DetalleBicicletaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [bici, setBici] = useState<BicycleRecord | null>(null);
  const [fotoUri, setFotoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [eliminando, setEliminando] = useState(false);

  // Recarga al volver de "Editar"
  useFocusEffect(
    useCallback(() => {
      let activo = true;
      (async () => {
        const lista = await loadBicycles();
        const encontrada = lista.find((b) => b.id === String(id)) ?? null;
        const foto = encontrada ? await getBicyclePhoto(encontrada.id) : null;
        if (!activo) return;
        setBici(encontrada);
        setFotoUri(foto);
        setLoading(false);
      })();
      return () => {
        activo = false;
      };
    }, [id])
  );

  const irAEditar = () => {
    if (bici) router.push({ pathname: "/editar-bicicleta", params: { id: bici.id } });
  };

  const confirmarEliminar = () => {
    if (!bici) return;
    Alert.alert(
      "Eliminar bicicleta",
      `¿Seguro que quieres eliminar tu ${bici.marca} ${bici.modelo}? Esta acción no se puede deshacer.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            setEliminando(true);
            try {
              await deleteBicycle(bici.id);
              router.replace("/mis-bicicletas");
            } catch (e: any) {
              setEliminando(false);
              Alert.alert("No se pudo eliminar", e?.message ?? "Inténtalo de nuevo.");
            }
          },
        },
      ]
    );
  };

  const Header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="arrow-back" size={24} color={COLORS.navy} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Detalle de bicicleta</Text>
      <TouchableOpacity style={styles.gear} onPress={irAEditar} disabled={!bici}>
        <Ionicons name="settings-sharp" size={17} color="#FFF" />
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar style="dark" />
        {Header}
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.green} />
        </View>
      </View>
    );
  }

  if (!bici) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar style="dark" />
        {Header}
        <View style={styles.center}>
          <Text style={styles.vacio}>No encontramos esta bicicleta.</Text>
        </View>
      </View>
    );
  }

  const { label, foto, descripcion } = infoTipo(bici.tipo);
  const color = bici.color && bici.color !== "No especificado" ? bici.color : "—";

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="dark" />
      {Header}

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.fotoBox}>
          <Image source={fotoUri ? { uri: fotoUri } : foto} style={styles.foto} resizeMode="contain" />
        </View>

        <View style={styles.badge}>
          <View style={styles.badgeDot} />
          <Text style={styles.badgeTxt}>Activa</Text>
        </View>

        <Text style={styles.titulo}>{label}</Text>
        <Text style={styles.subtitulo}>
          {bici.marca} {bici.modelo}
        </Text>

        <View style={styles.card}>
          <Fila icono="bicycle" label="Tipo:" valor={label} />
          <Fila icono="pricetag-outline" label="Marca:" valor={bici.marca || "—"} />
          <Fila icono="settings-outline" label="Modelo:" valor={bici.modelo || "—"} />
          <Fila icono="barcode-outline" label="N° de serie:" valor={bici.numSerie || "—"} />
          <Fila icono="calendar-outline" label="Año:" valor={bici.anio ? String(bici.anio) : "—"} />
          <Fila icono="color-palette-outline" label="Color:" valor={color} ultima />
        </View>

        <Text style={styles.infoTitulo}>Información adicional</Text>
        <Text style={styles.infoTxt}>{descripcion}</Text>

        <TouchableOpacity style={styles.btnEditar} onPress={irAEditar} activeOpacity={0.85}>
          <Ionicons name="create-outline" size={18} color="#FFF" />
          <Text style={styles.btnEditarTxt}>Editar</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.btnEliminar}
          onPress={confirmarEliminar}
          activeOpacity={0.85}
          disabled={eliminando}
        >
          {eliminando ? (
            <ActivityIndicator color={COLORS.danger} />
          ) : (
            <>
              <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
              <Text style={styles.btnEliminarTxt}>Eliminar</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  vacio: { color: COLORS.textSecondary, fontSize: 15 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: Platform.OS === "ios" ? 62 : 42,
    paddingBottom: 14,
    backgroundColor: COLORS.surface,
  },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "800", color: COLORS.navy },
  gear: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.blue,
    justifyContent: "center",
    alignItems: "center",
  },

  scroll: { paddingHorizontal: 20, paddingBottom: 40 },

  fotoBox: {
    height: 200,
    borderRadius: 20,
    backgroundColor: COLORS.photoBg,
    justifyContent: "center",
    alignItems: "center",
    padding: 10,
    marginBottom: 14,
  },
  foto: { width: "100%", height: "100%", borderRadius: 14 },

  badge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.greenSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.green },
  badgeTxt: { fontSize: 11.5, fontWeight: "700", color: COLORS.greenDark },

  titulo: { fontSize: 26, fontWeight: "800", color: COLORS.navy, marginTop: 10, letterSpacing: -0.3 },
  subtitulo: { fontSize: 14, color: COLORS.textSecondary, marginTop: 2, marginBottom: 16 },

  card: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    backgroundColor: COLORS.surface,
  },
  fila: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  filaBorde: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  filaLabel: { width: 90, fontSize: 13, color: COLORS.textSecondary },
  filaValor: { flex: 1, fontSize: 13.5, fontWeight: "700", color: COLORS.textPrimary },

  infoTitulo: { fontSize: 14, fontWeight: "800", color: COLORS.navy, marginTop: 20 },
  infoTxt: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19, marginTop: 6, marginBottom: 22 },

  btnEditar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 50,
    borderRadius: 999,
    backgroundColor: COLORS.green,
  },
  btnEditarTxt: { fontSize: 15.5, fontWeight: "800", color: "#FFF" },
  btnEliminar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 50,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: COLORS.danger,
    marginTop: 12,
  },
  btnEliminarTxt: { fontSize: 15.5, fontWeight: "800", color: COLORS.danger },
});