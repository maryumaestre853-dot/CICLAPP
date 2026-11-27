/**
 * CICLAPP — Bicicleta guardada (confirmación de éxito)
 * app/bicicleta-guardada.tsx
 *
 * Se muestra después de registrar una bicicleta.
 * Recibe el resumen por parámetros desde registro-bicicleta.tsx.
 */

import { Ionicons } from "@expo/vector-icons";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

const COLORS = {
  primary: "#27AE60",
  primaryDark: "#1E8449",
  primaryLight: "#EAFAF1",
  blue: "#2980B9",
  background: "#F8FAF9",
  surface: "#FFFFFF",
  textPrimary: "#1A1A2E",
  textSecondary: "#6B7280",
  border: "#E5E7EB",
} as const;

type Fila = { icono: keyof typeof Ionicons.glyphMap; label: string; valor?: string };

export default function BicicletaGuardadaScreen() {
  const { tipo, marca, modelo, numSerie, anio, color, local } = useLocalSearchParams<{
    tipo?: string;
    marca?: string;
    modelo?: string;
    numSerie?: string;
    anio?: string;
    color?: string;
    local?: string;
  }>();

  const { width: pantallaAncho } = useWindowDimensions();
  const anchoIlustracion = Math.min(pantallaAncho - 48, 340);

  const scale = useRef(new Animated.Value(0.85)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 5, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  const filas: Fila[] = [
    { icono: "bicycle", label: "Tipo", valor: tipo },
    { icono: "pricetag-outline", label: "Marca", valor: marca },
    { icono: "settings-outline", label: "Modelo", valor: modelo },
    { icono: "barcode-outline", label: "N° de serie", valor: numSerie },
    { icono: "calendar-outline", label: "Año", valor: anio },
    { icono: "color-palette-outline", label: "Color", valor: color },
  ];

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.ilustracion, { opacity: fade, transform: [{ scale }] }]}>
          <Image
            source={require("../assets/images/bici-guardada.png")}
            style={{ width: anchoIlustracion, height: anchoIlustracion * (345 / 450) }}
            resizeMode="contain"
          />
        </Animated.View>

        <Animated.View style={{ opacity: fade, alignItems: "center", width: "100%" }}>
          <Text style={styles.titulo}>¡Bicicleta guardada!</Text>
          <Text style={styles.subtitulo}>
            Tu bici ya está registrada y lista para acompañarte en nuevas rutas.
          </Text>

          {local === "1" && (
            <View style={styles.aviso}>
              <Ionicons name="cloud-offline-outline" size={16} color={COLORS.textSecondary} />
              <Text style={styles.avisoTxt}>
                Se guardó en tu dispositivo porque el servidor no respondió.
              </Text>
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.cardTitulo}>Resumen de tu bicicleta</Text>
            {filas.map((f, i) => (
              <View
                key={f.label}
                style={[styles.fila, i < filas.length - 1 && styles.filaBorde]}
              >
                <Ionicons name={f.icono} size={20} color={COLORS.blue} />
                <Text style={styles.filaLabel}>{f.label}</Text>
                <Text style={styles.filaValor}>{f.valor || "-"}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={styles.btnPrimary}
            onPress={() => router.replace("/mis-bicicletas")}
            activeOpacity={0.85}
          >
            <Ionicons name="bicycle" size={20} color="#FFF" />
            <Text style={styles.btnPrimaryText}>Ver mis bicicletas</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.replace("/registro-bicicleta")}
            style={styles.linkWrap}
          >
            <Text style={styles.link}>Registrar otra bicicleta</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.replace("/(tabs)")} style={styles.linkWrap}>
            <Text style={styles.linkMuted}>Ir al inicio</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const cardShadow =
  Platform.select({
    ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10 },
    android: { elevation: 3 },
  }) ?? {};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "ios" ? 70 : 50,
    paddingBottom: 48,
    alignItems: "center",
  },
  ilustracion: { alignItems: "center", marginBottom: 8 },
  titulo: { fontSize: 26, fontWeight: "800", color: COLORS.textPrimary, letterSpacing: -0.3 },
  subtitulo: {
    textAlign: "center",
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 20,
    paddingHorizontal: 12,
  },
  aviso: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
  },
  avisoTxt: { fontSize: 12, color: COLORS.textSecondary, flexShrink: 1 },
  card: {
    width: "100%",
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 16,
    marginBottom: 24,
    ...cardShadow,
  },
  cardTitulo: { fontSize: 15, fontWeight: "700", color: COLORS.textPrimary, marginBottom: 8 },
  fila: { flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: 12 },
  filaBorde: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  filaLabel: { flex: 1, color: COLORS.textSecondary, fontSize: 14 },
  filaValor: { fontWeight: "700", color: COLORS.textPrimary, fontSize: 14 },
  btnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    height: 54,
    backgroundColor: COLORS.primary,
    borderRadius: 999,
    ...Platform.select({
      ios: { shadowColor: COLORS.primaryDark, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
      android: { elevation: 6 },
    }),
  },
  btnPrimaryText: { fontSize: 16, fontWeight: "800", color: "#FFF", letterSpacing: -0.2 },
  linkWrap: { marginTop: 18 },
  link: { color: COLORS.blue, fontWeight: "700", fontSize: 14 },
  linkMuted: { color: COLORS.textSecondary, fontWeight: "600", fontSize: 13 },
});