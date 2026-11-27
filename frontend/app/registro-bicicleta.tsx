/**
 * CICLAPP — Registro de Bicicleta
 * app/registro-bicicleta.tsx
 *
 * Solo accesible si el usuario está logueado.
 * Si no hay sesión activa, redirige automáticamente a /login.
 */

import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { saveBicycle } from "../services/storage";
import KeyboardAwareScroll from "../components/keyboard-aware-scroll";

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
  danger: "#E74C3C",
} as const;

const SPACING = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
const RADIUS = { sm: 8, md: 14, lg: 20, xl: 28, full: 999 } as const;

// ─────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────

type TipoBici = "urbana" | "montana" | "electrica";

type TipoOption = {
  id: TipoBici;
  label: string;
  emoji: string;
  desc: string;
  color: string;
  bg: string;
};

const bicycleTypeMap: Record<TipoBici, "Carretera" | "Urbana" | "Electrica"> = {
  urbana: "Urbana",
  montana: "Carretera",
  electrica: "Electrica",
};

const TIPOS: TipoOption[] = [
  { id: "urbana",    label: "Urbana",    emoji: "🚲", desc: "Ciudad y ciclovía",     color: "#2980B9", bg: "#EBF5FB" },
  { id: "montana",   label: "Montaña",   emoji: "🏔️", desc: "Terrenos irregulares",  color: "#8E44AD", bg: "#F5EEF8" },
  { id: "electrica", label: "Eléctrica", emoji: "⚡", desc: "Motor de asistencia",   color: "#E67E22", bg: "#FEF9E7" },
];

// ─────────────────────────────────────────────────────────────
// VALIDACIÓN: NÚMERO DE SERIE
// ─────────────────────────────────────────────────────────────
// 7 a 12 caracteres, solo letras y números (en cualquier orden).
// Ejemplos válidos: WTU123456 · A1B2C3D4 · 1234567

const SERIE_MIN = 7;
const SERIE_MAX = 12;

/** Devuelve un mensaje de error, o null si el número de serie es válido. */
function validarNumSerie(valor: string): string | null {
  const s = valor.trim().toUpperCase();

  if (s.length < SERIE_MIN || s.length > SERIE_MAX) {
    return `El número de serie debe tener entre ${SERIE_MIN} y ${SERIE_MAX} caracteres.`;
  }
  if (!/^[A-Z0-9]+$/.test(s)) {
    return "Usa solo letras (sin tildes ni ñ) y números, sin espacios ni símbolos.";
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// COMPONENTE: SelectorTipo
// ─────────────────────────────────────────────────────────────

function SelectorTipo({ selected, onSelect }: { selected: TipoBici; onSelect: (t: TipoBici) => void }) {
  return (
    <View style={styles.tiposRow}>
      {TIPOS.map((t) => {
        const activo = selected === t.id;
        return (
          <TouchableOpacity
            key={t.id}
            style={[styles.tipoCard, activo && { borderColor: t.color, backgroundColor: t.bg }]}
            onPress={() => onSelect(t.id)}
            activeOpacity={0.8}
          >
            <Text style={styles.tipoEmoji}>{t.emoji}</Text>
            <Text style={[styles.tipoLabel, activo && { color: t.color }]}>{t.label}</Text>
            <Text style={styles.tipoDesc}>{t.desc}</Text>
            {activo && (
              <View style={[styles.tipoCheck, { backgroundColor: t.color }]}>
                <Ionicons name="checkmark" size={10} color="#FFF" />
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// COMPONENTE: Campo de texto
// ─────────────────────────────────────────────────────────────

function Campo({ label, value, onChangeText, placeholder, keyboard = "default", maxLength, autoCapitalize }: {
  label: string; value: string; onChangeText: (t: string) => void;
  placeholder: string; keyboard?: any; maxLength?: number;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        style={[styles.inputField, focused && styles.inputFocused]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textMuted}
        keyboardType={keyboard}
        maxLength={maxLength}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// PANTALLA PRINCIPAL
// ─────────────────────────────────────────────────────────────

export default function RegistroBicicletaScreen() {
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [userName, setUserName] = useState("");

  const [tipo, setTipo] = useState<TipoBici>("urbana");
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [anio, setAnio] = useState("");
  const [color, setColor] = useState("");
  const [numSerie, setNumSerie] = useState("");
  const [loading, setLoading] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  // ── Guard de autenticación ────────────────────────────────
  useEffect(() => {
    (async () => {
      const loggedIn = await AsyncStorage.getItem("ciclapp:loggedIn");
      const name = await AsyncStorage.getItem("ciclapp:userName");
      if (!loggedIn || loggedIn !== "true") {
        router.replace("/login");
        return;
      }
      setUserName(name || "ciclista");
      setCheckingAuth(false);
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    })();
  }, []);

  // Navega a la pantalla de éxito pasando el resumen de la bici
  const irAConfirmacion = (guardadaLocal: boolean) => {
    router.replace({
      pathname: "/bicicleta-guardada",
      params: {
        tipo: TIPOS.find((t) => t.id === tipo)!.label,
        marca: marca.trim(),
        modelo: modelo.trim(),
        numSerie: numSerie.trim().toUpperCase(),
        anio: anio.trim(),
        color: color.trim() || "No especificado",
        local: guardadaLocal ? "1" : "0",
      },
    });
  };

  const handleGuardar = async () => {
    if (!marca.trim() || !modelo.trim() || !anio.trim() || !numSerie.trim()) {
      Alert.alert("Campos incompletos", "Por favor completa marca, modelo, año y número de serie.");
      return;
    }
    const errorSerie = validarNumSerie(numSerie);
    if (errorSerie) {
      Alert.alert("Número de serie inválido", errorSerie);
      return;
    }
    const serieFinal = numSerie.trim().toUpperCase();
    if (isNaN(Number(anio)) || Number(anio) < 1990 || Number(anio) > 2030) {
      Alert.alert("Año inválido", "Ingresa un año entre 1990 y 2030.");
      return;
    }

    setLoading(true);
    try {
      await saveBicycle({
        numSerie: serieFinal,
        tipo: bicycleTypeMap[tipo],
        marca: marca.trim(),
        modelo: modelo.trim(),
        anio: Number(anio),
        color: color.trim() || "No especificado",
      });

      irAConfirmacion(false);
    } catch (error: any) {
      // Errores que responde el servidor: no se guarda local, se avisa al usuario.
      const msg = String(error?.message ?? "").toLowerCase();
      if (msg.includes("duplicate") || msg.includes("unique") || msg.includes("ya existe")) {
        Alert.alert("Número de serie repetido", "Ya hay una bicicleta registrada con ese número de serie.");
        return;
      }
      if (msg.includes("número de serie")) {
        Alert.alert("Número de serie inválido", String(error.message));
        return;
      }

      const raw = await AsyncStorage.getItem("ciclapp:bicicletas");
      const bicicletas = raw ? JSON.parse(raw) : [];
      const nueva = {
        id: Date.now().toString(),
        numSerie: serieFinal,
        tipo,
        marca: marca.trim(),
        modelo: modelo.trim(),
        anio: Number(anio),
        color: color.trim() || "No especificado",
        fechaRegistro: new Date().toISOString(),
      };
      bicicletas.unshift(nueva);
      await AsyncStorage.setItem("ciclapp:bicicletas", JSON.stringify(bicicletas));

      irAConfirmacion(true);
    } finally {
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const tipoActivo = TIPOS.find((t) => t.id === tipo)!;

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <KeyboardAwareScroll contentContainerStyle={styles.scroll}>

          {/* ── HEADER ── */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle}>Nueva bicicleta</Text>
              <Text style={styles.headerSub}>Hola, {userName} 👋</Text>
            </View>
          </View>

          {/* ── TIPO ── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tipo de bicicleta</Text>
            <SelectorTipo selected={tipo} onSelect={setTipo} />
          </View>

          {/* ── DATOS ── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Datos de tu bici</Text>
            <View style={styles.card}>
              <Campo label="Marca *" value={marca} onChangeText={setMarca} placeholder="Trek, Specialized, Giant…" />
              <Campo label="Modelo *" value={modelo} onChangeText={setModelo} placeholder="FX2, Rockhopper, Revolt…" />
              <Campo label="Año *" value={anio} onChangeText={setAnio} placeholder="2022" keyboard="numeric" />
              <Campo
                label="Número de serie *"
                value={numSerie}
                onChangeText={(t) => setNumSerie(t.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                placeholder="7 a 12 letras y números"
                maxLength={SERIE_MAX}
                autoCapitalize="characters"
              />
              <Campo label="Color (opcional)" value={color} onChangeText={setColor} placeholder="Rojo, negro, azul…" />
            </View>
          </View>

          {/* ── RESUMEN ── */}
          {marca && modelo && (
            <View style={[styles.preview, { backgroundColor: tipoActivo.bg, borderColor: tipoActivo.color }]}>
              <Text style={styles.previewEmoji}>{tipoActivo.emoji}</Text>
              <View>
                <Text style={[styles.previewName, { color: tipoActivo.color }]}>{marca} {modelo}</Text>
                <Text style={styles.previewDetail}>{tipoActivo.label} · {anio || "año"} · {color || "color"}</Text>
              </View>
            </View>
          )}

          {/* ── BOTÓN ── */}
          <TouchableOpacity
            style={[styles.btnPrimary, loading && { opacity: 0.7 }]}
            onPress={handleGuardar}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#FFF" />
              : <>
                  <Ionicons name="bicycle" size={20} color="#FFF" />
                  <Text style={styles.btnPrimaryText}>Guardar bicicleta</Text>
                </>
            }
          </TouchableOpacity>

        </KeyboardAwareScroll>
      </Animated.View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────────────────────

const cardShadow = Platform.select({
  ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10 },
  android: { elevation: 3 },
}) ?? {};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  scroll: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl },
  loadingScreen: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.background },

  header: { flexDirection: "row", alignItems: "center", paddingTop: Platform.OS === "ios" ? 60 : 40, paddingBottom: SPACING.lg, gap: SPACING.md },
  backBtn: { width: 40, height: 40, borderRadius: RADIUS.full, backgroundColor: COLORS.surface, justifyContent: "center", alignItems: "center", ...cardShadow },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 22, fontWeight: "800", color: COLORS.textPrimary, letterSpacing: -0.3 },
  headerSub: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },

  section: { marginBottom: SPACING.lg },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: COLORS.textPrimary, marginBottom: SPACING.sm },

  tiposRow: { flexDirection: "row", gap: SPACING.sm },
  tipoCard: { flex: 1, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: SPACING.sm, alignItems: "center", backgroundColor: COLORS.surface, ...cardShadow },
  tipoEmoji: { fontSize: 22, marginBottom: 4 },
  tipoLabel: { fontSize: 13, fontWeight: "700", color: COLORS.textPrimary, marginBottom: 2 },
  tipoDesc: { fontSize: 10, color: COLORS.textSecondary, textAlign: "center" },
  tipoCheck: { position: "absolute", top: 6, right: 6, width: 16, height: 16, borderRadius: RADIUS.full, justifyContent: "center", alignItems: "center" },

  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, ...cardShadow },
  inputGroup: { marginBottom: SPACING.md },
  inputLabel: { fontSize: 13, fontWeight: "600", color: COLORS.textPrimary, marginBottom: 6 },
  inputField: { borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, height: 48, fontSize: 14, color: COLORS.textPrimary, backgroundColor: COLORS.background },
  inputFocused: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },

  preview: { flexDirection: "row", alignItems: "center", gap: SPACING.md, borderWidth: 1.5, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.lg },
  previewEmoji: { fontSize: 32 },
  previewName: { fontSize: 16, fontWeight: "700" },
  previewDetail: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },

  btnPrimary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.sm, backgroundColor: COLORS.primary, borderRadius: RADIUS.full, height: 54, ...Platform.select({ ios: { shadowColor: COLORS.primaryDark, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 }, android: { elevation: 6 } }) },
  btnPrimaryText: { fontSize: 16, fontWeight: "800", color: "#FFF", letterSpacing: -0.2 },
});