/**
 * CICLAPP — Editar bicicleta
 * app/editar-bicicleta.tsx
 *
 * Recibe ?id=<id de la bici>. Se abre desde el botón "Editar" del detalle
 * o desde el menú (⋮) de la tarjeta en "Mis bicicletas".
 */

import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { TIPOS_LABEL, TipoLabel, infoTipo, tipoParaBackend } from "@/constants/bicicletas";
import { getBicyclePhoto, loadBicycles, setBicyclePhoto, updateBicycle } from "../services/storage";
import KeyboardAwareScroll from "../components/keyboard-aware-scroll";

const COLORS = {
  navy: "#0F2A43",
  green: "#27AE60",
  greenDark: "#1E8449",
  background: "#FFFFFF",
  field: "#F3F4F6",
  textPrimary: "#1A1A2E",
  textSecondary: "#6B7280",
  textMuted: "#9CA3AF",
  border: "#E5E7EB",
  photoBg: "#EAF1F7",
} as const;

// ── Campo de texto con etiqueta ──────────────────────────────
function Campo({
  label,
  value,
  onChangeText,
  placeholder,
  keyboard = "default",
  maxLength,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  keyboard?: any;
  maxLength?: number;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.grupo}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, focused && styles.inputFocus]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textMuted}
        keyboardType={keyboard}
        maxLength={maxLength}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </View>
  );
}

// ── Desplegable de tipo ──────────────────────────────────────
function SelectorTipo({ value, onChange }: { value: TipoLabel; onChange: (t: TipoLabel) => void }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <View style={styles.grupo}>
      <Text style={styles.label}>Tipo de bicicleta</Text>
      <TouchableOpacity style={styles.select} onPress={() => setAbierto((a) => !a)} activeOpacity={0.8}>
        <Text style={styles.selectTxt}>{value}</Text>
        <Ionicons name={abierto ? "chevron-up" : "chevron-down"} size={18} color={COLORS.textSecondary} />
      </TouchableOpacity>
      {abierto && (
        <View style={styles.opciones}>
          {TIPOS_LABEL.map((t, i) => (
            <TouchableOpacity
              key={t}
              style={[styles.opcion, i < TIPOS_LABEL.length - 1 && styles.opcionBorde]}
              onPress={() => {
                onChange(t);
                setAbierto(false);
              }}
            >
              <Text style={[styles.opcionTxt, t === value && { color: COLORS.green, fontWeight: "800" }]}>{t}</Text>
              {t === value && <Ionicons name="checkmark" size={16} color={COLORS.green} />}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

export default function EditarBicicletaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [tipo, setTipo] = useState<TipoLabel>("Urbana");
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [anio, setAnio] = useState("");
  const [color, setColor] = useState("");
  const [fotoUri, setFotoUri] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const lista = await loadBicycles();
      const b = lista.find((x) => x.id === String(id));
      if (!b) {
        Alert.alert("Error", "No encontramos esta bicicleta.");
        router.back();
        return;
      }
      setTipo(infoTipo(b.tipo).label);
      setMarca(b.marca);
      setModelo(b.modelo);
      setAnio(b.anio ? String(b.anio) : "");
      setColor(b.color === "No especificado" ? "" : b.color);
      setFotoUri(await getBicyclePhoto(b.id));
      setCargando(false);
    })();
  }, [id]);

  const cambiarFoto = async () => {
    const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permiso.granted) {
      Alert.alert("Permiso necesario", "Permite el acceso a tus fotos para cambiar la imagen.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });
    if (!res.canceled && res.assets?.[0]?.uri) setFotoUri(res.assets[0].uri);
  };

  const guardar = async () => {
    if (!marca.trim() || !modelo.trim() || !anio.trim()) {
      Alert.alert("Campos incompletos", "Por favor completa marca, modelo y año.");
      return;
    }
    if (isNaN(Number(anio)) || Number(anio) < 1990 || Number(anio) > 2030) {
      Alert.alert("Año inválido", "Ingresa un año entre 1990 y 2030.");
      return;
    }

    setGuardando(true);
    try {
      await updateBicycle(String(id), {
        tipo: tipoParaBackend(tipo),
        marca: marca.trim(),
        modelo: modelo.trim(),
        anio: Number(anio),
        color: color.trim() || "No especificado",
      });
      if (fotoUri) await setBicyclePhoto(String(id), fotoUri);
      router.back();
    } catch (e: any) {
      Alert.alert("No se pudo guardar", e?.message ?? "Inténtalo de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  const fotoMostrada = fotoUri ? { uri: fotoUri } : infoTipo(tipoParaBackend(tipo)).foto;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="dark" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={26} color={COLORS.navy} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Editar bicicleta</Text>
      </View>

      {cargando ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.green} />
        </View>
      ) : (
        <KeyboardAwareScroll contentContainerStyle={styles.scroll}>
          <>
            <View style={styles.fotoBox}>
              <Image source={fotoMostrada} style={styles.foto} resizeMode="contain" />
              <TouchableOpacity style={styles.camara} onPress={cambiarFoto} activeOpacity={0.85}>
                <Ionicons name="camera" size={16} color="#FFF" />
              </TouchableOpacity>
            </View>

            <SelectorTipo value={tipo} onChange={setTipo} />
            <Campo label="Marca *" value={marca} onChangeText={setMarca} placeholder="Ej: Specialized" />
            <Campo label="Modelo *" value={modelo} onChangeText={setModelo} placeholder="Ej: Rockhopper" />
            <Campo
              label="Año *"
              value={anio}
              onChangeText={setAnio}
              placeholder="Ej: 2022"
              keyboard="number-pad"
              maxLength={4}
            />
            <Campo label="Color (opcional)" value={color} onChangeText={setColor} placeholder="Ej: Azul" />

            <TouchableOpacity
              style={[styles.btnGuardar, guardando && { opacity: 0.7 }]}
              onPress={guardar}
              disabled={guardando}
              activeOpacity={0.85}
            >
              {guardando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnGuardarTxt}>Guardar cambios</Text>}
            </TouchableOpacity>
          </>
        </KeyboardAwareScroll>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: Platform.OS === "ios" ? 62 : 42,
    paddingBottom: 14,
  },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "800", color: COLORS.navy },

  scroll: { paddingHorizontal: 20, paddingBottom: 40 },

  fotoBox: {
    height: 190,
    borderRadius: 20,
    backgroundColor: COLORS.photoBg,
    justifyContent: "center",
    alignItems: "center",
    padding: 10,
    marginBottom: 18,
  },
  foto: { width: "100%", height: "100%", borderRadius: 14 },
  camara: {
    position: "absolute",
    right: 12,
    bottom: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.navy,
    justifyContent: "center",
    alignItems: "center",
  },

  grupo: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: "700", color: COLORS.textPrimary, marginBottom: 6 },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.field,
    paddingHorizontal: 14,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  inputFocus: { borderColor: COLORS.green, backgroundColor: "#FFF" },

  select: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#FFF",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectTxt: { fontSize: 14, color: COLORS.textPrimary },
  opciones: {
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#FFF",
    overflow: "hidden",
  },
  opcion: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  opcionBorde: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  opcionTxt: { fontSize: 14, color: COLORS.textPrimary },

  btnGuardar: {
    height: 52,
    borderRadius: 999,
    backgroundColor: COLORS.green,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
  },
  btnGuardarTxt: { fontSize: 16, fontWeight: "800", color: "#FFF" },
});
