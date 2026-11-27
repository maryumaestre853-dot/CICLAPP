/**
 * CICLAPP — Panel de Emergencia
 * app/emergencia.tsx
 *
 * Gestión de contactos de emergencia y botón SOS.
 */

import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  EmergencyContact,
  loadEmergencyContacts,
  saveEmergencyContact,
  updateEmergencyContact,
} from "../services/storage";

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
  dangerLight: "#FDEDEC",
  warning: "#F39C12",
  warningLight: "#FEF9E7",
} as const;

const SPACING = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
const RADIUS = { sm: 8, md: 14, lg: 20, xl: 28, full: 999 } as const;

// ─────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────

type Contacto = {
  id: string;
  nombre: string;
  telefono: string;
  relacion: string;
};

// Números de emergencia fijos de Bogotá
const NUMEROS_EMERGENCIA = [
  { label: "Policía Nacional", numero: "112", icon: "shield-outline" as const, color: "#2980B9" },
  { label: "Bomberos", numero: "119", icon: "flame-outline" as const, color: "#E74C3C" },
  { label: "Ambulancia", numero: "123", icon: "medkit-outline" as const, color: "#27AE60" },
  { label: "Línea Bici (IDU)", numero: "3800099", icon: "bicycle-outline" as const, color: "#8E44AD" },
];

// ─────────────────────────────────────────────────────────────
// COMPONENTE: Modal para agregar contacto
// ─────────────────────────────────────────────────────────────

function ModalAgregarContacto({ visible, contacto, onClose, onSave }: {
  visible: boolean;
  contacto: Contacto | null;
  onClose: () => void;
  onSave: (c: Omit<Contacto, "id">, id?: string) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [relacion, setRelacion] = useState("");

  const esEdicion = !!contacto;

  // Precarga los datos del contacto cuando se abre en modo edición
  useEffect(() => {
    if (visible) {
      setNombre(contacto?.nombre ?? "");
      // Se sanitiza aquí también: si el contacto viejo tenía el teléfono
      // guardado con espacios/guiones, el campo quedaba bloqueado al no
      // coincidir con el maxLength de 10 dígitos puros.
      setTelefono(contacto?.telefono ? contacto.telefono.replace(/\D/g, "").slice(0, 10) : "");
      setRelacion(contacto?.relacion ?? "");
    }
  }, [visible, contacto]);

  const relaciones = ["Familiar", "Pareja", "Amigo/a", "Médico", "Otro"];

  // Solo dígitos, máximo 10 (límite pedido; no obliga a que sean exactamente 10)
  const handleTelefonoChange = (texto: string) => {
    const soloDigitos = texto.replace(/\D/g, "").slice(0, 10);
    setTelefono(soloDigitos);
  };

  const handleSave = () => {
    if (!nombre.trim() || !telefono.trim()) {
      Alert.alert("Campos requeridos", "Por favor ingresa nombre y teléfono.");
      return;
    }
    onSave({ nombre: nombre.trim(), telefono, relacion: relacion || "Otro" }, contacto?.id);
    setNombre(""); setTelefono(""); setRelacion("");
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <KeyboardAvoidingView style={modal.overlay} behavior="padding">
        <View style={modal.sheet}>
          <View style={modal.handle} />
          <Text style={modal.title}>{esEdicion ? "Editar contacto" : "Agregar contacto"}</Text>

          <Text style={modal.label}>Nombre *</Text>
          <TextInput style={modal.input} value={nombre} onChangeText={setNombre} placeholder="Nombre completo" placeholderTextColor={COLORS.textMuted} />

          <Text style={modal.label}>Teléfono *</Text>
          <TextInput
            style={modal.input}
            value={telefono}
            onChangeText={handleTelefonoChange}
            placeholder="3001234567"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="number-pad"
            maxLength={10}
          />

          <Text style={modal.label}>Relación</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={modal.chips}>
            {relaciones.map((r) => (
              <TouchableOpacity
                key={r}
                style={[modal.chip, relacion === r && modal.chipActive]}
                onPress={() => setRelacion(r)}
              >
                <Text style={[modal.chipText, relacion === r && modal.chipTextActive]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={modal.btnRow}>
            <TouchableOpacity style={modal.btnCancel} onPress={onClose}>
              <Text style={modal.btnCancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={modal.btnSave} onPress={handleSave}>
              <Text style={modal.btnSaveText}>{esEdicion ? "Guardar cambios" : "Guardar"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// PANTALLA PRINCIPAL
// ─────────────────────────────────────────────────────────────

export default function EmergenciaScreen() {
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [contactoEditando, setContactoEditando] = useState<Contacto | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const sosAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    (async () => {
      const lista = await loadEmergencyContacts();
      setContactos(lista);
    })();

    // Pulso del botón SOS
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(sosAnim, { toValue: 1.06, duration: 800, useNativeDriver: true }),
        Animated.timing(sosAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  const abrirAgregar = () => {
    setContactoEditando(null);
    setModalVisible(true);
  };

  const abrirEditar = (c: Contacto) => {
    setContactoEditando(c);
    setModalVisible(true);
  };

  const guardarContacto = async (datos: Omit<Contacto, "id">, id?: string) => {
    try {
      if (id) {
        const actualizado = await updateEmergencyContact(id, datos);
        setContactos((prev) => prev.map((c) => (c.id === id ? actualizado : c)));
      } else {
        const nuevo = await saveEmergencyContact(datos);
        setContactos((prev) => [nuevo, ...prev]);
      }
      setModalVisible(false);
      setContactoEditando(null);
    } catch (error: any) {
      Alert.alert("Error", error?.message || "No se pudo guardar el contacto. Verifica tu conexión.");
    }
  };

  const eliminarContacto = (id: string) => {
    Alert.alert("Eliminar contacto", "¿Seguro que quieres eliminarlo?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: () => setContactos(contactos.filter((c) => c.id !== id)) },
    ]);
  };

  const llamar = (numero: string, nombre: string) => {
    Alert.alert(`Llamar a ${nombre}`, `¿Confirmas la llamada al ${numero}?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Llamar", onPress: () => Linking.openURL(`tel:${numero}`) },
    ]);
  };

  const activarSOS = () => {
    if (contactos.length === 0) {
      Alert.alert(
        "Sin contactos",
        "Agrega al menos un contacto de emergencia para usar el botón SOS.",
        [{ text: "Agregar contacto", onPress: abrirAgregar }, { text: "Cancelar", style: "cancel" }]
      );
      return;
    }
    // Llamada directa al contacto principal, sin confirmación intermedia de la app.
    // Nota: iOS y Android siguen mostrando su propia pantalla nativa de marcado/llamada;
    // eso es una restricción del sistema operativo y no se puede omitir desde la app.
    Linking.openURL(`tel:${contactos[0].telefono}`).catch(() => {
      Alert.alert("Error", "No se pudo iniciar la llamada. Verifica que el dispositivo tenga función telefónica.");
    });
  };

  const relacionEmoji: Record<string, string> = {
    Familiar: "👨‍👩‍👧", Pareja: "❤️", "Amigo/a": "🤝", Médico: "🩺", Otro: "👤",
  };

  // Filtra por nombre, teléfono o relación (sin distinguir mayúsculas/acentos básicos)
  const normalizar = (s: string) => s.toLowerCase().trim();
  const terminoBusqueda = normalizar(busqueda);
  const contactosFiltrados = terminoBusqueda
    ? contactos.filter((c) =>
        normalizar(c.nombre).includes(terminoBusqueda) ||
        c.telefono.includes(terminoBusqueda) ||
        normalizar(c.relacion).includes(terminoBusqueda)
      )
    : contactos;

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── HEADER ── */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Panel de emergencia</Text>
            <Text style={styles.headerSub}>Contactos y líneas de ayuda</Text>
          </View>
        </View>

        {/* ── BOTÓN SOS ── */}
        <View style={styles.sosSection}>
          <Animated.View style={{ transform: [{ scale: sosAnim }] }}>
            <TouchableOpacity style={styles.sosBtn} onPress={activarSOS} activeOpacity={0.85}>
              <Ionicons name="alert-circle" size={36} color="#FFF" />
              <Text style={styles.sosBtnText}>SOS</Text>
              <Text style={styles.sosBtnSub}>Toca para llamar a tu contacto principal</Text>
            </TouchableOpacity>
          </Animated.View>
          {contactos.length > 0 && (
            <Text style={styles.sosHint}>Llamará a: {contactos[0].nombre}</Text>
          )}
        </View>

        {/* ── NÚMEROS DE EMERGENCIA ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Líneas de emergencia Bogotá</Text>
          <View style={styles.numerosGrid}>
            {NUMEROS_EMERGENCIA.map((n) => (
              <TouchableOpacity
                key={n.numero}
                style={[styles.numeroCard, { borderColor: n.color + "40" }]}
                onPress={() => llamar(n.numero, n.label)}
                activeOpacity={0.8}
              >
                <View style={[styles.numeroIcon, { backgroundColor: n.color + "15" }]}>
                  <Ionicons name={n.icon} size={22} color={n.color} />
                </View>
                <Text style={[styles.numeroNum, { color: n.color }]}>{n.numero}</Text>
                <Text style={styles.numeroLabel}>{n.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── MIS CONTACTOS ── */}
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Mis contactos</Text>
            <TouchableOpacity style={styles.addBtn} onPress={abrirAgregar}>
              <Ionicons name="add" size={18} color={COLORS.primary} />
              <Text style={styles.addBtnText}>Agregar</Text>
            </TouchableOpacity>
          </View>

          {/* ── BARRA DE BÚSQUEDA DE CONTACTOS ── */}
          {contactos.length > 0 && (
            <View style={styles.searchBar}>
              <Ionicons name="search-outline" size={18} color={COLORS.textMuted} />
              <TextInput
                style={styles.searchInput}
                value={busqueda}
                onChangeText={setBusqueda}
                placeholder="Buscar contacto por nombre, teléfono o relación"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
              />
              {busqueda.length > 0 && (
                <TouchableOpacity onPress={() => setBusqueda("")} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          )}

          {contactos.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="people-outline" size={40} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>Sin contactos aún</Text>
              <Text style={styles.emptyText}>Agrega un familiar o amigo para que el botón SOS pueda llamarlos en caso de emergencia.</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={abrirAgregar}>
                <Text style={styles.emptyBtnText}>+ Agregar primer contacto</Text>
              </TouchableOpacity>
            </View>
          ) : contactosFiltrados.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="search-outline" size={36} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>Sin resultados</Text>
              <Text style={styles.emptyText}>No encontramos ningún contacto que coincida con "{busqueda}".</Text>
            </View>
          ) : (
            contactosFiltrados.map((c, i) => (
              <View key={c.id} style={styles.contactCard}>
                <View style={styles.contactAvatar}>
                  <Text style={{ fontSize: 20 }}>{relacionEmoji[c.relacion] || "👤"}</Text>
                </View>
                <View style={styles.contactInfo}>
                  <View style={styles.contactTopRow}>
                    <Text style={styles.contactNombre}>{c.nombre}</Text>
                    {contactos[0]?.id === c.id && (
                      <View style={styles.principalBadge}>
                        <Text style={styles.principalText}>Principal</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.contactTel}>{c.telefono}</Text>
                  <Text style={styles.contactRel}>{c.relacion}</Text>
                </View>
                <View style={styles.contactBtns}>
                  <TouchableOpacity
                    style={styles.contactCallBtn}
                    onPress={() => llamar(c.telefono, c.nombre)}
                  >
                    <Ionicons name="call-outline" size={18} color={COLORS.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.contactEditBtn}
                    onPress={() => abrirEditar(c)}
                  >
                    <Ionicons name="pencil-outline" size={16} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.contactDeleteBtn}
                    onPress={() => eliminarContacto(c.id)}
                  >
                    <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        {/* ── CONSEJOS DE SEGURIDAD ── */}
        <View style={[styles.section, styles.consejosBox]}>
          <View style={styles.consejosHeader}>
            <Ionicons name="warning-outline" size={16} color={COLORS.warning} />
            <Text style={styles.consejosTitle}>En caso de accidente</Text>
          </View>
          {[
            "Mantén la calma y muévete a una zona segura.",
            "Llama al 123 si hay heridos.",
            "No muevas a personas inconscientes.",
            "Documenta el accidente con fotos si puedes.",
            "Avisa a tu contacto de emergencia.",
          ].map((tip, i) => (
            <Text key={i} style={styles.consejoItem}>• {tip}</Text>
          ))}
        </View>

      </ScrollView>

      <ModalAgregarContacto
        visible={modalVisible}
        contacto={contactoEditando}
        onClose={() => { setModalVisible(false); setContactoEditando(null); }}
        onSave={guardarContacto}
      />
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

  sosSection: { alignItems: "center", paddingVertical: SPACING.lg },
  sosBtn: { width: 160, height: 160, borderRadius: 80, backgroundColor: COLORS.danger, justifyContent: "center", alignItems: "center", gap: 4, ...Platform.select({ ios: { shadowColor: COLORS.danger, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 16 }, android: { elevation: 14 } }) },
  sosBtnText: { fontSize: 32, fontWeight: "900", color: "#FFF", letterSpacing: 4 },
  sosBtnSub: { fontSize: 10, color: "rgba(255,255,255,0.8)", textAlign: "center", paddingHorizontal: SPACING.md },
  sosHint: { marginTop: SPACING.sm, fontSize: 12, color: COLORS.textSecondary },

  section: { paddingHorizontal: SPACING.lg, marginBottom: SPACING.lg },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: COLORS.textPrimary, marginBottom: SPACING.sm },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: SPACING.sm },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: SPACING.sm, paddingVertical: 6, borderRadius: RADIUS.full, borderWidth: 1.5, borderColor: COLORS.primary },
  addBtnText: { fontSize: 13, fontWeight: "600", color: COLORS.primary },

  numerosGrid: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  numeroCard: { width: "47%", backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1.5, alignItems: "center", gap: 4, ...cardShadow },
  numeroIcon: { width: 44, height: 44, borderRadius: RADIUS.md, justifyContent: "center", alignItems: "center" },
  numeroNum: { fontSize: 20, fontWeight: "900", letterSpacing: -0.5 },
  numeroLabel: { fontSize: 11, color: COLORS.textSecondary, textAlign: "center" },

  searchBar: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: RADIUS.full, borderWidth: 1.5, borderColor: COLORS.border, paddingHorizontal: SPACING.md, height: 46, marginBottom: SPACING.sm, ...cardShadow },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.textPrimary, height: "100%" },

  emptyBox: { backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: SPACING.xl, alignItems: "center", gap: SPACING.sm, ...cardShadow },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: COLORS.textPrimary },
  emptyText: { fontSize: 13, color: COLORS.textSecondary, textAlign: "center", lineHeight: 19 },
  emptyBtn: { marginTop: SPACING.sm, backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.full, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm },
  emptyBtnText: { fontSize: 14, fontWeight: "700", color: COLORS.primary },

  contactCard: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm, gap: SPACING.md, ...cardShadow },
  contactAvatar: { width: 48, height: 48, borderRadius: RADIUS.full, backgroundColor: COLORS.primaryLight, justifyContent: "center", alignItems: "center" },
  contactInfo: { flex: 1 },
  contactTopRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  contactNombre: { fontSize: 15, fontWeight: "700", color: COLORS.textPrimary },
  principalBadge: { backgroundColor: COLORS.primaryLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.full },
  principalText: { fontSize: 10, fontWeight: "700", color: COLORS.primary },
  contactTel: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  contactRel: { fontSize: 11, color: COLORS.textMuted },
  contactBtns: { gap: SPACING.sm },
  contactCallBtn: { width: 36, height: 36, borderRadius: RADIUS.full, backgroundColor: COLORS.primaryLight, justifyContent: "center", alignItems: "center" },
  contactEditBtn: { width: 36, height: 36, borderRadius: RADIUS.full, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, justifyContent: "center", alignItems: "center" },
  contactDeleteBtn: { width: 36, height: 36, borderRadius: RADIUS.full, backgroundColor: COLORS.dangerLight, justifyContent: "center", alignItems: "center" },

  consejosBox: { backgroundColor: COLORS.warningLight, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: "#FAD7A0", marginHorizontal: SPACING.lg, marginBottom: SPACING.xxl },
  consejosHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: SPACING.sm },
  consejosTitle: { fontSize: 14, fontWeight: "700", color: COLORS.warning },
  consejoItem: { fontSize: 13, color: COLORS.textPrimary, lineHeight: 21 },
});

const modal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.lg, paddingBottom: 40 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: "center", marginBottom: SPACING.lg },
  title: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary, marginBottom: SPACING.lg, letterSpacing: -0.3 },
  label: { fontSize: 13, fontWeight: "600", color: COLORS.textPrimary, marginBottom: 6, marginTop: SPACING.sm },
  input: { borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, height: 48, fontSize: 14, color: COLORS.textPrimary, backgroundColor: COLORS.background },
  chips: { gap: SPACING.sm, paddingVertical: SPACING.sm },
  chip: { paddingHorizontal: SPACING.md, paddingVertical: 6, borderRadius: RADIUS.full, borderWidth: 1.5, borderColor: COLORS.border },
  chipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  chipText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: "600" },
  chipTextActive: { color: COLORS.primary },
  btnRow: { flexDirection: "row", gap: SPACING.md, marginTop: SPACING.lg },
  btnCancel: { flex: 1, height: 50, borderRadius: RADIUS.full, borderWidth: 1.5, borderColor: COLORS.border, justifyContent: "center", alignItems: "center" },
  btnCancelText: { fontSize: 15, fontWeight: "700", color: COLORS.textSecondary },
  btnSave: { flex: 1, height: 50, borderRadius: RADIUS.full, backgroundColor: COLORS.primary, justifyContent: "center", alignItems: "center" },
  btnSaveText: { fontSize: 15, fontWeight: "700", color: "#FFF" },
});
